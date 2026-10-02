import { fireEvent, render, screen } from "@testing-library/react-native";
import { getFunctionName as mockGetFunctionName } from "convex/server";
import type { Doc, Id } from "@synapse/backend/dataModel";
import * as Haptics from "expo-haptics";
import { ChatInput } from "./ChatInput";

const mockSend = jest.fn();
const mockEdit = jest.fn();
const mockSaveModel = jest.fn();
const mockStream = jest.fn();
const mockStart = jest.fn();
const mockCancel = jest.fn();
const mockClearImages = jest.fn();
const mockRestoreImages = jest.fn();
const mockState = {
  editingMessage: null as Doc<"messages"> | null,
  isGenerating: false,
  atLimit: false,
};
jest.mock("convex/react", () => ({
  useMutation: (fn: Parameters<typeof mockGetFunctionName>[0]) => {
    const name = mockGetFunctionName(fn);
    return name === "messages:send"
      ? mockSend
      : name === "messages:editLastMessageAndResend"
        ? mockEdit
        : mockSaveModel;
  },
  useQuery: (fn: Parameters<typeof mockGetFunctionName>[0]) => {
    const name = mockGetFunctionName(fn);
    if (name === "users:getChatSettings")
      return { modelSelectorEnabled: false };
    if (name === "messages:getModelCapabilities") return { hasImages: false };
    return { dailyMessages: { used: mockState.atLimit ? 10 : 0, limit: 10 } };
  },
}));
jest.mock("../contexts/useChatContext", () => ({
  useChatContext: () => ({
    ...mockState,
    startStreaming: mockStart,
    cancelEditing: mockCancel,
  }),
}));
jest.mock("../hooks/useStreamResponse", () => ({
  useStreamResponse: () => mockStream,
}));
jest.mock("../hooks/useImagePicker", () => ({
  useImagePicker: () => ({
    images: [],
    clearImages: mockClearImages,
    restoreImages: mockRestoreImages,
    maxImages: 4,
  }),
}));
jest.mock("../hooks/useImageUpload", () => ({
  useImageUpload: () => jest.fn(),
  getImageUploadErrorTelemetry: () => null,
  ImageUploadError: class extends Error {},
}));
jest.mock("posthog-react-native", () => ({ usePostHog: () => null }));
jest.mock("../lib/analytics", () => ({ captureError: jest.fn() }));
jest.mock("lucide-react-native", () => ({
  Send: () => null,
  ImagePlus: () => null,
  Pencil: () => null,
  X: () => null,
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ bottom: 0 }),
}));
jest.mock("../contexts/ThemeContext", () => ({
  useTheme: () => ({
    colors: {
      paper: "white",
      ink: "black",
      inkMuted: "gray",
      primary: "blue",
      rule: "gray",
    },
  }),
}));
const threadId = "thread" as Id<"threads">;
const sendButton = () => screen.getByLabelText("chatInput.sendMessage");
beforeEach(() => {
  mockState.editingMessage = null;
  mockState.isGenerating = false;
  mockState.atLimit = false;
  mockSend.mockResolvedValue({
    assistantMessageId: "assistant",
    sessionId: "session",
  });
  mockEdit.mockResolvedValue({
    assistantMessageId: "assistant",
    sessionId: "session",
  });
  jest.spyOn(console, "error").mockImplementation(() => {});
});

it("sends a trimmed new turn and starts its returned stream", async () => {
  await render(<ChatInput threadId={threadId} />);
  await fireEvent.changeText(
    screen.getByPlaceholderText("chatInput.placeholder"),
    "  Hello  ",
  );
  await fireEvent.press(sendButton());
  expect(mockSend).toHaveBeenCalledWith({ threadId, content: "Hello" });
  expect(mockStart).toHaveBeenCalledWith("assistant");
  expect(mockStream).toHaveBeenCalledWith("assistant", "session");
  expect(mockEdit).not.toHaveBeenCalled();
});

it("restores a failed draft and retries it", async () => {
  mockSend.mockRejectedValueOnce(new Error("Try again"));
  await render(<ChatInput threadId={threadId} />);
  await fireEvent.changeText(
    screen.getByPlaceholderText("chatInput.placeholder"),
    "Keep my draft",
  );
  await fireEvent.press(sendButton());
  expect(screen.getByDisplayValue("Keep my draft")).toBeTruthy();
  expect(screen.getByText("Try again")).toBeTruthy();
  expect(mockStart).not.toHaveBeenCalled();
  await fireEvent.press(sendButton());
  expect(mockStart).toHaveBeenCalledTimes(1);
});

it("still sends and starts streaming when device haptics fail", async () => {
  jest
    .spyOn(Haptics, "impactAsync")
    .mockRejectedValueOnce(new Error("Unavailable"));
  await render(<ChatInput threadId={threadId} />);
  await fireEvent.changeText(
    screen.getByPlaceholderText("chatInput.placeholder"),
    "Hello",
  );
  await fireEvent.press(sendButton());
  expect(mockSend).toHaveBeenCalledWith({ threadId, content: "Hello" });
  expect(mockStart).toHaveBeenCalledWith("assistant");
  expect(mockStream).toHaveBeenCalledWith("assistant", "session");
});

it("editing regenerates the existing message and exits editing only after success", async () => {
  mockState.editingMessage = {
    _id: "user-message",
    content: "Old draft",
    role: "user",
  } as Doc<"messages">;
  mockEdit.mockRejectedValueOnce(new Error("Cannot edit"));
  await render(<ChatInput threadId={threadId} />);
  await fireEvent.changeText(
    screen.getByDisplayValue("Old draft"),
    "  New draft  ",
  );
  await fireEvent.press(sendButton());
  expect(mockCancel).not.toHaveBeenCalled();
  expect(screen.getByDisplayValue("  New draft  ")).toBeTruthy();
  await fireEvent.press(sendButton());
  expect(mockEdit).toHaveBeenLastCalledWith({
    messageId: "user-message",
    content: "New draft",
  });
  expect(mockCancel).toHaveBeenCalledTimes(1);
  expect(mockSend).not.toHaveBeenCalled();
});

it("quota exhaustion and active generation disable submission", async () => {
  const view = await render(<ChatInput threadId={threadId} />);
  await fireEvent.changeText(
    screen.getByPlaceholderText("chatInput.placeholder"),
    "Draft",
  );
  mockState.atLimit = true;
  await view.rerender(<ChatInput threadId={threadId} />);
  await fireEvent.press(sendButton());
  expect(mockSend).not.toHaveBeenCalled();
  mockState.atLimit = false;
  mockState.isGenerating = true;
  await view.rerender(<ChatInput threadId={threadId} />);
  await fireEvent.press(sendButton());
  expect(mockSend).not.toHaveBeenCalled();
});
