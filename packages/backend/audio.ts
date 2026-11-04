/** Shared dictation limits. Audio is temporary; only the reviewed text is sent. */
export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
export const MAX_RECORDING_SECONDS = 5 * 60;
export const TRANSCRIPTION_TIMEOUT_MS = 105_000;
export const AUDIO_MIME_TYPES = new Set([
  "audio/webm",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/wav",
  "audio/x-wav",
  "audio/mpeg",
  "audio/mp3",
]);

export function appendTranscript(draft: string, transcript: string): string {
  return draft
    ? `${draft}${/\s$/.test(draft) ? "" : "\n"}${transcript}`
    : transcript;
}

export function transcriptionErrorKey(status: number): string {
  if (status === 401) return "voice.signInAgain";
  if (status === 413) return "voice.tooLarge";
  if (status === 415) return "voice.unsupported";
  if (status === 422 || status === 400) return "voice.noSpeech";
  if (status === 429) return "voice.limitReached";
  if (status === 503) return "voice.unavailable";
  return "voice.failed";
}
