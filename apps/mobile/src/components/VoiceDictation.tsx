import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Pressable,
  Text,
  View,
} from "react-native";
import { useAuth } from "@clerk/expo";
import { useTranslation } from "react-i18next";
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import type { RecordingStatus } from "expo-audio";
import { File } from "expo-file-system";
import { fetch as expoFetch } from "expo/fetch";
import {
  MAX_AUDIO_BYTES,
  MAX_RECORDING_SECONDS,
  TRANSCRIPTION_TIMEOUT_MS,
  transcriptionErrorKey,
} from "@synapse/backend/audio";
import { useTheme } from "../contexts/ThemeContext";

type Status =
  "idle" | "starting" | "recording" | "transcribing" | "failed" | "cancelling";
interface Props {
  disabled: boolean;
  onTranscript: (text: string) => void;
  onBusyChange: (busy: boolean) => void;
}

async function resetAudioMode() {
  try {
    await setAudioModeAsync({ allowsRecording: false });
  } catch {
    /* Best-effort device cleanup. */
  }
}

export function VoiceDictation({
  disabled,
  onTranscript,
  onBusyChange,
}: Props) {
  const { getToken } = useAuth();
  const { t } = useTranslation("chat");
  const { colors } = useTheme();
  const [status, setStatus] = useState<Status>("idle");
  const phase = useRef<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [recordEvent, setRecordEvent] = useState<RecordingStatus | null>(null);
  const recorder = useAudioRecorder(
    RecordingPresets.HIGH_QUALITY,
    setRecordEvent,
  );
  const recorderState = useAudioRecorderState(recorder, 250);
  const audio = useRef<File | null>(null);
  const controller = useRef<AbortController | null>(null);
  const version = useRef(0);
  const pendingStart = useRef<Promise<void> | null>(null);
  const deliver = useRef(onTranscript);
  useEffect(() => {
    deliver.current = onTranscript;
  }, [onTranscript]);
  useEffect(() => {
    onBusyChange(status !== "idle");
  }, [status, onBusyChange]);
  const updateStatus = useCallback((next: Status) => {
    phase.current = next;
    setStatus(next);
  }, []);
  const deleteAudio = useCallback(() => {
    try {
      if (audio.current?.exists) audio.current.delete();
    } catch {
      /* Cache cleanup must not lose a transcript. */
    }
    audio.current = null;
  }, []);

  const transcribe = useCallback(
    async (file: File, attempt: number) => {
      updateStatus("transcribing");
      setError(null);
      const abort = new AbortController();
      controller.current = abort;
      const timeout = setTimeout(() => abort.abort(), TRANSCRIPTION_TIMEOUT_MS);
      try {
        const token = await getToken({ template: "convex" });
        if (version.current !== attempt) return;
        if (!token) throw new Error("voice.signInAgain");
        const url = (
          process.env.EXPO_PUBLIC_CONVEX_SITE_URL ??
          (process.env.EXPO_PUBLIC_CONVEX_URL ?? "").replace(".cloud", ".site")
        ).replace(/\/$/, "");
        const response = await expoFetch(`${url}/audio/transcribe`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "audio/mp4",
          },
          body: file,
          signal: abort.signal,
        });
        if (!response.ok)
          throw new Error(transcriptionErrorKey(response.status));
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
        deleteAudio();
        updateStatus("idle");
      } catch (err) {
        if (version.current !== attempt) return;
        setError(
          err instanceof Error && err.message.startsWith("voice.")
            ? err.message
            : "voice.failedRequest",
        );
        updateStatus("failed");
      } finally {
        clearTimeout(timeout);
      }
    },
    [getToken, deleteAudio, updateStatus],
  );

  const finish = useCallback(async () => {
    if (phase.current !== "recording") return;
    const attempt = version.current;
    updateStatus("transcribing");
    try {
      if (recorder.isRecording) await recorder.stop();
      await resetAudioMode();
      if (version.current !== attempt) return;
      if (!recorder.uri) throw new Error("voice.noSpeech");
      const file = new File(recorder.uri);
      audio.current = file;
      if (!file.exists || !file.size) throw new Error("voice.noSpeech");
      if (file.size > MAX_AUDIO_BYTES) {
        deleteAudio();
        throw new Error("voice.tooLarge");
      }
      await transcribe(file, attempt);
    } catch (err) {
      if (version.current !== attempt) return;
      setError(
        err instanceof Error && err.message.startsWith("voice.")
          ? err.message
          : "voice.recordingFailed",
      );
      updateStatus("failed");
    }
  }, [recorder, transcribe, updateStatus, deleteAudio]);

  useEffect(() => {
    if (status !== "recording") return;
    if (recordEvent?.hasError) {
      setError("voice.recordingFailed");
      updateStatus("failed");
      if (recorder.isRecording) void recorder.stop().catch(() => {});
      void resetAudioMode();
    } else if (
      recordEvent?.isFinished ||
      recorderState.durationMillis >= MAX_RECORDING_SECONDS * 1000
    ) {
      void finish();
    }
  }, [
    status,
    recordEvent,
    recorderState.durationMillis,
    finish,
    updateStatus,
    recorder,
  ]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (next !== "active") void finish();
    });
    return () => subscription.remove();
  }, [finish]);

  const discard = useCallback(async () => {
    const attempt = ++version.current;
    controller.current?.abort();
    updateStatus("cancelling");
    try {
      await pendingStart.current;
      if (recorder.isRecording) await recorder.stop();
      if (!audio.current && recorder.uri)
        audio.current = new File(recorder.uri);
    } catch {
      /* Interrupted recording. */
    }
    deleteAudio();
    await resetAudioMode();
    if (version.current === attempt) {
      setError(null);
      updateStatus("idle");
    }
  }, [recorder, updateStatus, deleteAudio]);
  useEffect(
    () => () => {
      version.current += 1;
      controller.current?.abort();
      if (recorder.isRecording) void recorder.stop().catch(() => {});
      deleteAudio();
      void resetAudioMode();
      onBusyChange(false);
    },
    [recorder, deleteAudio, onBusyChange],
  );

  const start = async () => {
    if (disabled || phase.current !== "idle") return;
    const attempt = ++version.current;
    updateStatus("starting");
    setError(null);
    setRecordEvent(null);
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (version.current !== attempt) return;
      if (!permission.granted) throw new Error("voice.permissionDenied");
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      if (version.current !== attempt) {
        await resetAudioMode();
        return;
      }
      await recorder.prepareToRecordAsync();
      if (version.current !== attempt) {
        await recorder.stop();
        await resetAudioMode();
        return;
      }
      recorder.record({ forDuration: MAX_RECORDING_SECONDS });
      updateStatus("recording");
    } catch (err) {
      if (version.current !== attempt) return;
      await resetAudioMode();
      setError(
        err instanceof Error && err.message.startsWith("voice.")
          ? err.message
          : "voice.recordingFailed",
      );
      updateStatus("failed");
    }
  };

  const seconds = Math.floor(recorderState.durationMillis / 1000);
  const buttonStyle = {
    minHeight: 44,
    justifyContent: "center" as const,
    paddingHorizontal: 10,
  };
  const labelStyle = { color: colors.inkMuted, fontSize: 13 };
  return (
    <View style={{ paddingHorizontal: 8 }}>
      <View
        style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center" }}
      >
        {status === "idle" ? (
          <Pressable
            style={buttonStyle}
            disabled={disabled}
            onPress={() => {
              pendingStart.current = start();
            }}
            accessibilityLabel={t("voice.start")}
            accessibilityRole="button"
          >
            <Text style={labelStyle}>{t("voice.start")}</Text>
          </Pressable>
        ) : (
          <>
            {status === "transcribing" && (
              <ActivityIndicator size="small" color={colors.inkMuted} />
            )}
            <Text style={labelStyle} accessibilityLiveRegion="polite">
              {t(`voice.${status}`)}
              {status === "recording" &&
                ` ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} / 5:00`}
            </Text>
            {status === "recording" && (
              <Pressable
                style={buttonStyle}
                onPress={() => void finish()}
                accessibilityLabel={t("voice.stop")}
                accessibilityRole="button"
              >
                <Text style={labelStyle}>{t("voice.stop")}</Text>
              </Pressable>
            )}
            {status === "failed" && audio.current && (
              <Pressable
                style={buttonStyle}
                onPress={() => {
                  if (audio.current)
                    void transcribe(audio.current, ++version.current);
                }}
                accessibilityLabel={t("voice.retry")}
                accessibilityRole="button"
              >
                <Text style={labelStyle}>{t("voice.retry")}</Text>
              </Pressable>
            )}
            <Pressable
              style={buttonStyle}
              onPress={() => void discard()}
              disabled={status === "cancelling"}
              accessibilityLabel={t("voice.cancel")}
              accessibilityRole="button"
            >
              <Text style={labelStyle}>{t("voice.cancel")}</Text>
            </Pressable>
          </>
        )}
      </View>
      {error && (
        <Text
          style={{ color: colors.error, fontSize: 12, paddingBottom: 8 }}
          accessibilityRole="alert"
        >
          {t(error)}
        </Text>
      )}
    </View>
  );
}
