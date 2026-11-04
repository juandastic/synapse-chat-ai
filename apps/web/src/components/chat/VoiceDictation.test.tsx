import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useState } from "react";
import { appendTranscript } from "@synapse/backend/audio";
import { VoiceDictation } from "./VoiceDictation";

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({ getToken: async () => "session-token" }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

class Recorder {
  static instances: Recorder[] = [];
  static isTypeSupported = (mime: string) => mime.startsWith("audio/webm");
  state = "inactive";
  mimeType = "audio/webm";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() {
    Recorder.instances.push(this);
  }
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["voice"]) });
    this.onstop?.();
  }
}
const microphoneStop = vi.fn();
const props = () => ({
  disabled: false,
  onTranscript: vi.fn(),
  onBusyChange: vi.fn(),
});
const click = (key: string) =>
  fireEvent.click(screen.getByRole("button", { name: `voice.${key}` }));
async function recordAndStop() {
  click("start");
  await screen.findByRole("button", { name: "voice.stop" });
  click("stop");
}
beforeEach(() => {
  Recorder.instances = [];
  vi.stubGlobal("MediaRecorder", Recorder);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: vi.fn(async () => ({
        getTracks: () => [{ stop: microphoneStop }],
      })),
    },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ text: "Mi historia" })),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

it("records first, authenticates the upload and returns text without sending a chat message", async () => {
  const p = props();
  render(<VoiceDictation {...p} />);
  await recordAndStop();
  await waitFor(() =>
    expect(p.onTranscript).toHaveBeenCalledWith("Mi historia"),
  );
  expect(fetch).toHaveBeenCalledWith(
    "https://test.convex.site/audio/transcribe",
    expect.objectContaining({
      method: "POST",
      headers: {
        Authorization: "Bearer session-token",
        "Content-Type": "audio/webm",
      },
      body: expect.any(Blob),
    }),
  );
  expect(microphoneStop).toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "voice.start" })).toBeEnabled();
});

it("keeps the same recording after a network failure and retries without recording again", async () => {
  vi.mocked(fetch).mockRejectedValueOnce(new Error("offline"));
  const p = props();
  render(<VoiceDictation {...p} />);
  await recordAndStop();
  await screen.findByRole("button", { name: "voice.retry" });
  expect(p.onTranscript).not.toHaveBeenCalled();
  click("retry");
  await waitFor(() =>
    expect(p.onTranscript).toHaveBeenCalledWith("Mi historia"),
  );
  expect(Recorder.instances).toHaveLength(1);
  expect(vi.mocked(fetch).mock.calls[0][1]?.body).toBe(
    vi.mocked(fetch).mock.calls[1][1]?.body,
  );
});

it.each([502, 504])("shows a retryable error for HTTP %i", async (status) => {
  vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status }));
  const p = props();
  render(<VoiceDictation {...p} />);
  await recordAndStop();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "voice.failedRequest",
  );
  expect(screen.getByRole("button", { name: "voice.retry" })).toBeEnabled();
  expect(p.onTranscript).not.toHaveBeenCalled();
});

it("appends dictation to a draft and releases the send lock only after completion", async () => {
  function Draft() {
    const [draft, setDraft] = useState("Ya había escrito algo");
    const [busy, setBusy] = useState(false);
    return (
      <>
        <textarea aria-label="draft" readOnly value={draft} />
        <VoiceDictation
          disabled={false}
          onTranscript={(text) =>
            setDraft((value) => appendTranscript(value, text))
          }
          onBusyChange={setBusy}
        />
        <button disabled={busy}>Send</button>
      </>
    );
  }
  render(<Draft />);
  click("start");
  await screen.findByRole("button", { name: "voice.stop" });
  expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  click("stop");
  await waitFor(() =>
    expect(screen.getByRole("textbox")).toHaveValue(
      "Ya había escrito algo\nMi historia",
    ),
  );
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Send" })).toBeEnabled(),
  );
});

it("cancel discards audio without contacting the server", async () => {
  const p = props();
  render(<VoiceDictation {...p} />);
  click("start");
  await screen.findByRole("button", { name: "voice.stop" });
  click("cancel");
  expect(fetch).not.toHaveBeenCalled();
  expect(p.onTranscript).not.toHaveBeenCalled();
  expect(microphoneStop).toHaveBeenCalled();
});

it("cancelling while microphone permission is pending releases a late stream", async () => {
  let grant!: (stream: MediaStream) => void;
  vi.mocked(navigator.mediaDevices.getUserMedia).mockReturnValue(
    new Promise((resolve) => {
      grant = resolve;
    }),
  );
  const p = props();
  render(<VoiceDictation {...p} />);
  click("start");
  click("cancel");
  await act(async () => {
    grant({
      getTracks: () => [{ stop: microphoneStop }],
    } as unknown as MediaStream);
  });
  expect(microphoneStop).toHaveBeenCalled();
  expect(Recorder.instances).toHaveLength(0);
});

it("unmount aborts upload and cannot deliver a late transcript to another conversation", async () => {
  let complete!: (response: Response) => void;
  vi.mocked(fetch).mockReturnValue(
    new Promise((resolve) => {
      complete = resolve;
    }),
  );
  const p = props();
  const view = render(<VoiceDictation {...p} />);
  await recordAndStop();
  await waitFor(() => expect(fetch).toHaveBeenCalled());
  const signal = vi.mocked(fetch).mock.calls[0][1]?.signal;
  view.unmount();
  expect(signal?.aborted).toBe(true);
  await act(async () => {
    complete(Response.json({ text: "late" }));
  });
  expect(p.onTranscript).not.toHaveBeenCalled();
});

it("stops after five minutes and transcribes automatically", async () => {
  vi.useFakeTimers();
  const p = props();
  render(<VoiceDictation {...p} />);
  await act(async () => {
    click("start");
  });
  await act(async () => {
    vi.advanceTimersByTime(300_000);
  });
  expect(p.onTranscript).toHaveBeenCalledWith("Mi historia");
  expect(Recorder.instances[0].state).toBe("inactive");
});

it("permission denial preserves the draft and allows cancellation", async () => {
  vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValue(
    new Error("denied"),
  );
  const p = props();
  render(<VoiceDictation {...p} />);
  click("start");
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "voice.permissionDenied",
  );
  expect(p.onTranscript).not.toHaveBeenCalled();
  click("cancel");
  expect(screen.getByRole("button", { name: "voice.start" })).toBeEnabled();
});

it("uses the explicit HTTP endpoint for an isolated local Convex deployment", async () => {
  vi.stubEnv("VITE_CONVEX_SITE_URL", "http://127.0.0.1:3211/");
  const p = props();
  render(<VoiceDictation {...p} />);
  await recordAndStop();
  await waitFor(() => expect(p.onTranscript).toHaveBeenCalled());
  expect(fetch).toHaveBeenCalledWith(
    "http://127.0.0.1:3211/audio/transcribe",
    expect.anything(),
  );
});
