import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { useTranslation } from "react-i18next";
import { Mic, Square, X, RotateCcw } from "lucide-react";
import { monitorMicrophoneLevel } from "../../lib/microphone-level";
import { AudioLevelIndicator } from "./AudioLevelIndicator";
import {
  MAX_AUDIO_BYTES,
  MAX_RECORDING_SECONDS,
  TRANSCRIPTION_TIMEOUT_MS,
  transcriptionErrorKey,
} from "@synapse/backend/audio";

type Status = "idle" | "starting" | "recording" | "transcribing" | "failed";
interface Props {
  disabled: boolean;
  onTranscript: (text: string) => void;
  onBusyChange: (busy: boolean) => void;
}

export function VoiceDictation({
  disabled,
  onTranscript,
  onBusyChange,
}: Props) {
  const { getToken } = useAuth();
  const { t } = useTranslation("chat");
  const [status, setStatus] = useState<Status>("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState<number | null>(null);
  const stopMeter = useRef<(() => void) | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const audio = useRef<Blob | null>(null);
  const controller = useRef<AbortController | null>(null);
  const version = useRef(0);
  const deliver = useRef(onTranscript);
  useEffect(() => {
    deliver.current = onTranscript;
  }, [onTranscript]);
  useEffect(() => {
    onBusyChange(status !== "idle");
  }, [onBusyChange, status]);

  const releaseMicrophone = useCallback(() => {
    stopMeter.current?.();
    stopMeter.current = null;
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  }, []);
  const discard = useCallback(() => {
    version.current += 1;
    controller.current?.abort();
    if (recorder.current?.state === "recording") recorder.current.stop();
    recorder.current = null;
    releaseMicrophone();
    audio.current = null;
    setError(null);
    setStatus("idle");
  }, [releaseMicrophone]);
  useEffect(
    () => () => {
      version.current += 1;
      controller.current?.abort();
      if (recorder.current?.state === "recording") recorder.current.stop();
      releaseMicrophone();
      onBusyChange(false);
    },
    [onBusyChange, releaseMicrophone],
  );

  const transcribe = async (blob: Blob, attempt: number) => {
    setStatus("transcribing");
    setError(null);
    const abort = new AbortController();
    controller.current = abort;
    const timeout = setTimeout(() => abort.abort(), TRANSCRIPTION_TIMEOUT_MS);
    try {
      const token = await getToken({ template: "convex" });
      if (version.current !== attempt) return;
      if (!token) throw new Error("voice.signInAgain");
      const url = (
        import.meta.env.VITE_CONVEX_SITE_URL ??
        import.meta.env.VITE_CONVEX_URL.replace(".cloud", ".site")
      ).replace(/\/$/, "");
      const response = await fetch(`${url}/audio/transcribe`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": blob.type,
        },
        body: blob,
        signal: abort.signal,
      });
      if (!response.ok) throw new Error(transcriptionErrorKey(response.status));
      const result: unknown = await response.json();
      if (
        !result ||
        typeof result !== "object" ||
        !("text" in result) ||
        typeof result.text !== "string" ||
        !result.text.trim()
      )
        throw new Error("voice.noSpeech");
      if (version.current !== attempt) return;
      deliver.current(result.text.trim());
      audio.current = null;
      setStatus("idle");
    } catch (err) {
      if (version.current !== attempt) return;
      setError(
        err instanceof Error && err.message.startsWith("voice.")
          ? err.message
          : "voice.failedRequest",
      );
      setStatus("failed");
    } finally {
      clearTimeout(timeout);
    }
  };

  const start = async () => {
    if (disabled || status !== "idle") return;
    const attempt = ++version.current;
    setStatus("starting");
    setSeconds(0);
    setAudioLevel(null);
    setError(null);
    try {
      if (
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === "undefined"
      )
        throw new Error("voice.unsupported");
      const mimeType = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
      ].find((mime) => MediaRecorder.isTypeSupported(mime));
      if (!mimeType) throw new Error("voice.unsupported");
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (version.current !== attempt) {
        media.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = media;
      const recording = new MediaRecorder(media, {
        mimeType,
        audioBitsPerSecond: 64_000,
      });
      recorder.current = recording;
      const chunks: Blob[] = [];
      let size = 0;
      recording.ondataavailable = (event) => {
        size += event.data.size;
        chunks.push(event.data);
        if (size > MAX_AUDIO_BYTES && recording.state === "recording")
          recording.stop();
      };
      recording.onerror = () => {
        if (version.current !== attempt) return;
        version.current += 1;
        releaseMicrophone();
        setError("voice.recordingFailed");
        setStatus("failed");
      };
      recording.onstop = () => {
        if (version.current !== attempt) return;
        releaseMicrophone();
        const blob = new Blob(chunks, { type: recording.mimeType || mimeType });
        if (!blob.size || blob.size > MAX_AUDIO_BYTES) {
          setError(blob.size ? "voice.tooLarge" : "voice.noSpeech");
          setStatus("failed");
          return;
        }
        audio.current = blob;
        void transcribe(blob, attempt);
      };
      recording.start(1000);
      stopMeter.current = monitorMicrophoneLevel(media, setAudioLevel);
      const startedAt = Date.now();
      timer.current = setInterval(() => {
        const elapsed = Math.min(
          MAX_RECORDING_SECONDS,
          Math.floor((Date.now() - startedAt) / 1000),
        );
        setSeconds(elapsed);
        if (elapsed >= MAX_RECORDING_SECONDS && recording.state === "recording")
          recording.stop();
      }, 250);
      setStatus("recording");
    } catch (err) {
      if (version.current !== attempt) return;
      releaseMicrophone();
      setError(
        err instanceof Error && err.message.startsWith("voice.")
          ? err.message
          : "voice.permissionDenied",
      );
      setStatus("failed");
    }
  };

  const buttonClass =
    "flex min-h-9 items-center gap-2 rounded-lg px-2 text-xs text-muted-foreground hover:bg-muted disabled:opacity-40";
  return (
    <div className="flex flex-wrap items-center gap-1 px-2 py-1">
      {status === "idle" ? (
        <button
          type="button"
          className={buttonClass}
          disabled={disabled}
          onClick={() => void start()}
          aria-label={t("voice.start")}
        >
          <Mic className="h-4 w-4" />
          {t("voice.start")}
        </button>
      ) : (
        <>
          {status === "recording" && <AudioLevelIndicator level={audioLevel} />}
          <span className="px-2 text-xs text-muted-foreground">
            <span role="status">
              {t(`voice.${status}`)}
              {status === "recording" &&
                ` ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} / 5:00`}
            </span>
            {status === "recording" && (
              <span className="block text-[11px]">
                {t(
                  audioLevel === null
                    ? "voice.levelUnavailable"
                    : audioLevel > 0
                      ? "voice.soundDetected"
                      : "voice.noSound",
                )}
              </span>
            )}
          </span>
          {status === "recording" && (
            <button
              type="button"
              className={buttonClass}
              onClick={() => {
                if (recorder.current?.state === "recording")
                  recorder.current.stop();
              }}
              aria-label={t("voice.stop")}
            >
              <Square className="h-4 w-4" />
              {t("voice.stop")}
            </button>
          )}
          {status === "failed" && audio.current && (
            <button
              type="button"
              className={buttonClass}
              onClick={() => {
                if (audio.current)
                  void transcribe(audio.current, ++version.current);
              }}
              aria-label={t("voice.retry")}
            >
              <RotateCcw className="h-4 w-4" />
              {t("voice.retry")}
            </button>
          )}
          <button
            type="button"
            className={buttonClass}
            onClick={discard}
            aria-label={t("voice.cancel")}
          >
            <X className="h-4 w-4" />
            {t("voice.cancel")}
          </button>
        </>
      )}
      {error && (
        <p className="w-full px-2 pb-1 text-xs text-destructive" role="alert">
          {t(error)}
        </p>
      )}
    </div>
  );
}
