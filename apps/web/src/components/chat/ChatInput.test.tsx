import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getFunctionName } from "convex/server";
import { ChatInput } from "./ChatInput";

const f = vi.hoisted(() => ({
  send: vi.fn(),
  saveModel: vi.fn(),
  upload: vi.fn(),
  stream: vi.fn(),
  start: vi.fn(),
  isGenerating: false,
  mobile: false,
  settings: { modelSelectorEnabled: false, model: "gemini-3.1-pro-preview" },
  usage: {
    dailyMessages: { used: 0, limit: 10 },
    resetInfo: "midnight UTC",
    contactInfo: { x: "https://example.com", email: "test@example.com" },
  },
  capabilities: { hasImages: false },
}));
vi.mock("convex/react", () => ({
  useMutation: (fn: Parameters<typeof getFunctionName>[0]) =>
    getFunctionName(fn) === "messages:send" ? f.send : f.saveModel,
  useQuery: (fn: Parameters<typeof getFunctionName>[0]) =>
    ({
      "users:getChatSettings": f.settings,
      "usageLimits:getUsageStatus": f.usage,
      "messages:getModelCapabilities": f.capabilities,
    })[getFunctionName(fn)],
}));
vi.mock("@convex-dev/r2/react", () => ({ useUploadFile: () => f.upload }));
vi.mock("@/contexts/useChatContext", () => ({
  useChatContext: () => ({
    isGenerating: f.isGenerating,
    threadId: "thread",
    startStreaming: f.start,
  }),
}));
vi.mock("@/hooks/useStreamResponse", () => ({
  useStreamResponse: () => f.stream,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

beforeEach(() => {
  f.isGenerating = false;
  f.mobile = false;
  f.settings = { modelSelectorEnabled: false, model: "gemini-3.1-pro-preview" };
  f.usage.dailyMessages = { used: 0, limit: 10 };
  f.capabilities = { hasImages: false };
  f.send.mockResolvedValue({
    assistantMessageId: "assistant",
    sessionId: "session",
  });
  f.upload.mockResolvedValue("photo.png");
  vi.stubGlobal("matchMedia", () => ({
    matches: f.mobile,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:photo");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
const editor = () => screen.getByRole("textbox");
const sendButton = () =>
  screen.getByRole("button", { name: "chatInput.sendMessage" });

it("sends trimmed content and starts the returned assistant stream", async () => {
  const user = userEvent.setup();
  render(<ChatInput />);
  await user.type(editor(), "  Remember my city  ");
  await user.click(sendButton());
  await waitFor(() =>
    expect(f.send).toHaveBeenCalledWith({
      threadId: "thread",
      content: "Remember my city",
    }),
  );
  expect(f.start).toHaveBeenCalledWith("assistant");
  expect(f.stream).toHaveBeenCalledWith("assistant", "session");
  expect(editor()).toHaveValue("");
});

it("restores the draft after send fails and allows a successful retry", async () => {
  const user = userEvent.setup();
  f.send.mockRejectedValueOnce(new Error("Backend unavailable"));
  render(<ChatInput />);
  await user.type(editor(), "Keep this draft");
  await user.click(sendButton());
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Backend unavailable",
  );
  expect(editor()).toHaveValue("Keep this draft");
  expect(f.start).not.toHaveBeenCalled();
  await user.click(sendButton());
  await waitFor(() => expect(f.start).toHaveBeenCalledTimes(1));
});

it("blocks double submission until the first send resolves", async () => {
  let finish!: (value: {
    assistantMessageId: string;
    sessionId: string;
  }) => void;
  f.send.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const user = userEvent.setup();
  render(<ChatInput />);
  await user.type(editor(), "Once");
  await user.click(sendButton());
  await user.click(sendButton());
  expect(f.send).toHaveBeenCalledTimes(1);
  finish({ assistantMessageId: "assistant", sessionId: "session" });
  await waitFor(() => expect(f.start).toHaveBeenCalledTimes(1));
});

it("blocks whitespace-only content and sending while a response is generating", async () => {
  const user = userEvent.setup();
  const view = render(<ChatInput />);
  await user.type(editor(), "   ");
  expect(sendButton()).toBeDisabled();
  f.isGenerating = true;
  view.rerender(<ChatInput />);
  expect(editor()).toBeDisabled();
  expect(f.send).not.toHaveBeenCalled();
});

it("enforces the daily limit for keyboard submission as well as the button", async () => {
  const user = userEvent.setup();
  const view = render(<ChatInput />);
  await user.type(editor(), "Draft before quota changes");
  f.usage.dailyMessages.used = 10;
  view.rerender(<ChatInput />);
  expect(sendButton()).toBeDisabled();
  // A previously focused editor can still dispatch a stale key event.
  fireEvent.keyDown(editor(), { key: "Enter" });
  await Promise.resolve();
  expect(f.send).not.toHaveBeenCalled();
});

it("Enter sends on desktop, Shift+Enter and mobile Enter keep the draft", async () => {
  const user = userEvent.setup();
  const view = render(<ChatInput />);
  await user.type(editor(), "Desktop");
  await user.keyboard("{Shift>}{Enter}{/Shift}");
  expect(f.send).not.toHaveBeenCalled();
  await user.keyboard("{Enter}");
  await waitFor(() => expect(f.send).toHaveBeenCalledTimes(1));
  view.unmount();
  f.mobile = true;
  render(<ChatInput />);
  await user.type(editor(), "Mobile{Enter}");
  expect(f.send).toHaveBeenCalledTimes(1);
  expect(editor()).toHaveValue("Mobile\n");
});

it("keeps blind model assignments hidden and visible selections persist", async () => {
  const user = userEvent.setup();
  const view = render(<ChatInput />);
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  f.settings.modelSelectorEnabled = true;
  view.rerender(<ChatInput />);
  await user.selectOptions(
    screen.getByRole("combobox"),
    "moonshotai/kimi-k2.6",
  );
  expect(f.saveModel).toHaveBeenCalledWith({ model: "moonshotai/kimi-k2.6" });
});

it("uploads an image-only turn and preserves its preview if the mutation fails", async () => {
  const user = userEvent.setup();
  f.send.mockRejectedValueOnce(new Error("Try again"));
  render(<ChatInput />);
  const file = new File(["photo"], "photo.png", { type: "image/png" });
  await user.upload(
    screen.getByLabelText("chatInput.attachImages", { selector: "input" }),
    file,
  );
  await user.click(sendButton());
  await screen.findByRole("alert");
  expect(f.upload).toHaveBeenCalledWith(file);
  expect(f.send).toHaveBeenCalledWith({
    threadId: "thread",
    content: "",
    imageKeys: ["photo.png"],
  });
  expect(screen.getByRole("img")).toHaveAttribute("src", "blob:photo");
  expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  await user.click(sendButton());
  await waitFor(() => expect(f.start).toHaveBeenCalledTimes(1));
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:photo");
});

it("releases attachment previews on unmount", async () => {
  const user = userEvent.setup();
  const view = render(<ChatInput />);
  await user.upload(
    screen.getByLabelText("chatInput.attachImages", { selector: "input" }),
    new File(["photo"], "photo.png", { type: "image/png" }),
  );
  view.unmount();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:photo");
});
