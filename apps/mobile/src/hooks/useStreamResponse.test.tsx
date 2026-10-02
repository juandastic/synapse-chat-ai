import { act, renderHook } from "@testing-library/react-native";
import { Alert } from "react-native";
import type { Id } from "@synapse/backend/dataModel";
import { useStreamResponse } from "./useStreamResponse";

const mockToken = jest.fn();
const mockReport = jest.fn();
const mockUpdate = jest.fn();
const mockStop = jest.fn();
const mockCapture = jest.fn();
jest.mock("convex/react", () => ({ useMutation: () => mockReport }));
jest.mock("@clerk/expo", () => ({ useAuth: () => ({ getToken: mockToken }) }));
jest.mock("../contexts/useChatContext", () => ({
  useChatContext: () => ({
    threadId: "thread",
    updateStreamedContent: mockUpdate,
    stopStreaming: mockStop,
  }),
}));
jest.mock("../lib/analytics", () => ({
  captureError: (...args: unknown[]) => mockCapture(...args),
}));

class FakeXHR {
  static latest: FakeXHR;
  responseText = "";
  status = 200;
  responseType = "";
  timeout = 0;
  onprogress = () => {};
  onload = () => {};
  onerror = () => {};
  ontimeout = () => {};
  open = jest.fn();
  setRequestHeader = jest.fn();
  send = jest.fn();
  constructor() {
    FakeXHR.latest = this;
  }
}
const originalXHR = global.XMLHttpRequest;
beforeEach(() => {
  global.XMLHttpRequest = FakeXHR as unknown as typeof XMLHttpRequest;
  mockToken.mockResolvedValue("jwt");
  mockReport.mockResolvedValue(undefined);
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});
afterEach(() => {
  global.XMLHttpRequest = originalXHR;
});

async function start() {
  const { result } = await renderHook(() => useStreamResponse());
  const completion = result.current(
    "assistant" as Id<"messages">,
    "session" as Id<"sessions">,
  );
  await Promise.resolve();
  return { xhr: FakeXHR.latest, completion };
}

it("streams cumulative XHR progress and includes the final text that arrived without progress", async () => {
  const { xhr, completion } = await start();
  await act(async () => {
    xhr.responseText = "Hola";
    xhr.onprogress();
    xhr.onprogress();
    xhr.responseText = "Hola 👋";
    xhr.onload();
    await completion;
  });
  expect(mockUpdate.mock.calls.map(([text]) => text)).toEqual([
    "Hola",
    "Hola 👋",
  ]);
  expect(xhr.open).toHaveBeenCalledWith(
    "POST",
    "https://test.convex.site/chat",
  );
  expect(xhr.setRequestHeader).toHaveBeenCalledWith(
    "Authorization",
    "Bearer jwt",
  );
  expect(JSON.parse(xhr.send.mock.calls[0][0])).toEqual({
    sessionId: "session",
    threadId: "thread",
    assistantMessageId: "assistant",
  });
  expect(xhr.timeout).toBeGreaterThan(300000);
  expect(mockReport).not.toHaveBeenCalled();
});

it.each(["onerror", "ontimeout"] as const)(
  "%s stops local streaming without overwriting the server generation",
  async (event) => {
    const { xhr, completion } = await start();
    await act(async () => {
      xhr[event]();
      await completion;
    });
    expect(mockStop).toHaveBeenCalledTimes(1);
    expect(mockReport).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(mockCapture).toHaveBeenCalledTimes(1);
  },
);

it.each([
  ['{"error":"Daily quota reached"}', "Daily quota reached"],
  ["invalid json", "Usage limit reached"],
])("reports quota failure for body %s", async (body, expected) => {
  const { xhr, completion } = await start();
  await act(async () => {
    xhr.status = 429;
    xhr.responseText = body;
    xhr.onload();
    await completion;
  });
  expect(Alert.alert).toHaveBeenCalledWith("Error", expected);
  expect(mockReport).toHaveBeenCalledWith({
    messageId: "assistant",
    errorMessage: expect.any(String),
  });
});

it("absorbs reporting errors after a terminal HTTP failure", async () => {
  mockReport.mockRejectedValueOnce(new Error("offline"));
  const { xhr, completion } = await start();
  await act(async () => {
    xhr.status = 502;
    xhr.onload();
    await completion;
  });
  expect(Alert.alert).toHaveBeenCalledWith("Error", "HTTP 502");
  expect(mockStop).toHaveBeenCalledTimes(1);
});
