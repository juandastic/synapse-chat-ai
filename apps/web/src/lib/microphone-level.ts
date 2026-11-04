import { audioInputLevel } from "@synapse/backend/audio";

/** Observe the existing recording stream without playing it through the speakers. */
export function monitorMicrophoneLevel(
  stream: MediaStream,
  onLevel: (level: number | null) => void,
): () => void {
  let context: AudioContext | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let analyser: AnalyserNode | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (timer !== null) clearInterval(timer);
    source?.disconnect();
    analyser?.disconnect();
    if (context && context.state !== "closed")
      void context.close().catch(() => {});
  };
  try {
    if (typeof AudioContext === "undefined") return stop;
    const audioContext = new AudioContext();
    context = audioContext;
    const meter = audioContext.createAnalyser();
    analyser = meter;
    meter.fftSize = 1024;
    source = audioContext.createMediaStreamSource(stream);
    source.connect(meter);
    const samples = new Float32Array(meter.fftSize);
    timer = setInterval(() => {
      if (audioContext.state !== "running") {
        onLevel(null);
        return;
      }
      try {
        meter.getFloatTimeDomainData(samples);
        let sum = 0;
        for (const sample of samples) sum += sample * sample;
        const rms = Math.sqrt(sum / samples.length);
        onLevel(audioInputLevel(20 * Math.log10(rms)));
      } catch {
        stop();
        onLevel(null);
      }
    }, 100);
    if (audioContext.state === "suspended") {
      void audioContext.resume().catch(() => {
        if (stopped) return;
        stop();
        onLevel(null);
      });
    }
  } catch {
    // An optional visual must never interrupt a working recording.
    stop();
    onLevel(null);
  }
  return stop;
}
