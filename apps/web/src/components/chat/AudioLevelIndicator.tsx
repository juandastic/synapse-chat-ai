import { Mic } from "lucide-react";
import { useTranslation } from "react-i18next";

export function AudioLevelIndicator({ level }: { level: number | null }) {
  const { t } = useTranslation("chat");
  const value = level ?? 0;
  return (
    <div
      role={level === null ? "img" : "meter"}
      aria-label={t("voice.inputLevel")}
      aria-description={
        level === null ? t("voice.levelUnavailable") : undefined
      }
      aria-valuemin={level === null ? undefined : 0}
      aria-valuemax={level === null ? undefined : 100}
      aria-valuenow={level === null ? undefined : Math.round(level * 100)}
      aria-valuetext={
        level === null
          ? undefined
          : t(value > 0 ? "voice.soundDetected" : "voice.noSound")
      }
      className="flex shrink-0 items-center gap-2 text-primary"
    >
      <span className="relative flex h-8 w-8 items-center justify-center">
        <span
          className="absolute inset-0 rounded-full bg-primary transition-transform duration-100 motion-reduce:transition-none"
          style={{
            opacity: 0.08 + value * 0.12,
            transform: `scale(${1 + value * 0.2})`,
          }}
        />
        <Mic className="relative h-4 w-4" aria-hidden="true" />
      </span>
      <span className="flex h-6 items-center gap-0.5" aria-hidden="true">
        {[0.5, 0.75, 1, 0.75, 0.5].map((weight, index) => (
          <span
            key={index}
            className="w-0.5 rounded-full bg-current transition-[height,opacity] duration-100 motion-reduce:transition-none"
            style={{
              height: 4 + value * weight * 20,
              opacity: 0.35 + value * 0.65,
            }}
          />
        ))}
      </span>
    </div>
  );
}
