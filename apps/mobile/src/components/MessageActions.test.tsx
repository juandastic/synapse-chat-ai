import { Alert } from "react-native";
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import * as Clipboard from "expo-clipboard";
import type { Doc } from "@synapse/backend/dataModel";
import { MessageActions } from "./MessageActions";
import { successFeedback } from "../lib/haptics";
import { captureError } from "../lib/analytics";

jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn() }));
jest.mock("convex/react", () => ({ useMutation: () => jest.fn() }));
jest.mock("posthog-react-native", () => ({ usePostHog: () => null }));
jest.mock("../contexts/useChatContext", () => ({
  useChatContext: () => ({ messages: [], isGenerating: false }),
}));
jest.mock("../hooks/useStreamResponse", () => ({
  useStreamResponse: () => jest.fn(),
}));
jest.mock("../lib/haptics", () => ({
  impactFeedback: jest.fn(),
  successFeedback: jest.fn(),
}));
jest.mock("../lib/analytics", () => ({ captureError: jest.fn() }));
jest.mock("lucide-react-native", () => ({
  Copy: () => null,
  Pencil: () => null,
  RotateCcw: () => null,
  Trash2: () => null,
  Flag: () => null,
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "es" } }),
}));
jest.mock("../contexts/ThemeContext", () => ({
  useColors: () => ({ ink: "black", rule: "gray", error: "red" }),
}));

const message = {
  _id: "received-message",
  role: "assistant",
  content:
    "# Respuesta completa\n\nPrimera línea con tildes y 😊.\n\n" +
    "- **Elemento uno**\n- [Enlace](https://example.com)\n\n" +
    '```ts\nconst saludo = "Hola";\n```\n\n' +
    "Párrafo largo. ".repeat(500) +
    "\nÚltima línea del mensaje.\n",
} as Doc<"messages">;

beforeEach(() => {
  jest.mocked(Clipboard.setStringAsync).mockResolvedValue(true);
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});

it("copies the entire received message, including Markdown, Unicode and the final line", async () => {
  const onClose = jest.fn();
  await render(<MessageActions message={message} onClose={onClose} />);

  await fireEvent.press(
    screen.getByRole("button", { name: "messageItem.copyFullMessage" }),
  );

  expect(Clipboard.setStringAsync).toHaveBeenCalledWith(message.content);
  expect(successFeedback).toHaveBeenCalled();
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(Alert.alert).not.toHaveBeenCalled();
});

it("keeps the menu open until the clipboard write succeeds", async () => {
  let finishCopy!: (value: boolean) => void;
  jest.mocked(Clipboard.setStringAsync).mockReturnValueOnce(
    new Promise((resolve) => {
      finishCopy = resolve;
    }),
  );
  const onClose = jest.fn();
  await render(<MessageActions message={message} onClose={onClose} />);

  const pressing = fireEvent.press(
    screen.getByRole("button", { name: "messageItem.copyFullMessage" }),
  );
  await waitFor(() => {
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith(message.content);
  });
  expect(onClose).not.toHaveBeenCalled();
  expect(successFeedback).not.toHaveBeenCalled();

  finishCopy(true);
  await pressing;
  expect(onClose).toHaveBeenCalledTimes(1);
});

it("reports a clipboard failure and lets the user retry without closing the menu", async () => {
  const error = new Error("Clipboard unavailable");
  jest.mocked(Clipboard.setStringAsync).mockRejectedValueOnce(error);
  const onClose = jest.fn();
  await render(<MessageActions message={message} onClose={onClose} />);
  const copy = screen.getByRole("button", {
    name: "messageItem.copyFullMessage",
  });

  await fireEvent.press(copy);
  expect(Alert.alert).toHaveBeenCalledWith(
    "messageItem.copyFailedTitle",
    "messageItem.copyFailedDescription",
  );
  expect(captureError).toHaveBeenCalledWith(error, { source: "message_copy" });
  expect(onClose).not.toHaveBeenCalled();
  expect(successFeedback).not.toHaveBeenCalled();

  await fireEvent.press(copy);
  expect(Clipboard.setStringAsync).toHaveBeenLastCalledWith(message.content);
  expect(onClose).toHaveBeenCalledTimes(1);
});

it("does not offer copy for an empty response", async () => {
  await render(
    <MessageActions
      message={{ ...message, content: "" }}
      onClose={jest.fn()}
    />,
  );
  expect(
    screen.queryByRole("button", { name: "messageItem.copyFullMessage" }),
  ).toBeNull();
  expect(Clipboard.setStringAsync).not.toHaveBeenCalled();
});

it("preserves copying sent messages", async () => {
  await render(
    <MessageActions
      message={{ ...message, role: "user" }}
      onClose={jest.fn()}
    />,
  );
  await fireEvent.press(
    screen.getByRole("button", { name: "messageItem.copyFullMessage" }),
  );
  expect(Clipboard.setStringAsync).toHaveBeenCalledWith(message.content);
});
