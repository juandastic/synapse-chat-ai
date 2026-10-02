import { fireEvent, render, screen } from "@testing-library/react-native";
import { ChatModelSelector } from "./ChatModelSelector";
import { DEFAULT_CHAT_MODEL } from "@synapse/backend/chatModels";

jest.mock("lucide-react-native", () => ({
  Check: () => null,
  ChevronDown: () => null,
  X: () => null,
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ bottom: 0 }),
}));
jest.mock("../contexts/ThemeContext", () => ({
  useColors: () => ({
    paper: "white",
    ink: "black",
    inkMuted: "gray",
    rule: "gray",
    primary: "blue",
    accentLight: "white",
  }),
}));
const props = {
  modelId: DEFAULT_CHAT_MODEL.id,
  onSelect: jest.fn(),
  hasImages: false,
  capabilitiesLoading: false,
  disabled: false,
};

it("opens model choices, persists a choice and closes the selector", async () => {
  await render(<ChatModelSelector {...props} />);
  expect(screen.queryByRole("radio", { name: /Kimi/ })).toBeNull();
  await fireEvent.press(
    screen.getByRole("button", { name: "chatInput.chooseModel" }),
  );
  await fireEvent.press(screen.getByRole("radio", { name: /Kimi/ }));
  expect(props.onSelect).toHaveBeenCalledWith("moonshotai/kimi-k2.6");
  expect(screen.queryByRole("radio", { name: /Kimi/ })).toBeNull();
});

it("cannot open while disabled and closes an open sheet when generation starts", async () => {
  const view = await render(<ChatModelSelector {...props} disabled />);
  await fireEvent.press(
    screen.getByRole("button", { name: "chatInput.chooseModel" }),
  );
  expect(screen.queryByRole("radio", { name: /Kimi/ })).toBeNull();
  await view.rerender(<ChatModelSelector {...props} />);
  await fireEvent.press(
    screen.getByRole("button", { name: "chatInput.chooseModel" }),
  );
  expect(screen.getByRole("radio", { name: /Kimi/ })).toBeTruthy();
  await view.rerender(<ChatModelSelector {...props} disabled />);
  expect(screen.queryByRole("radio", { name: /Kimi/ })).toBeNull();
  expect(props.onSelect).not.toHaveBeenCalled();
});
