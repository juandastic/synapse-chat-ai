import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
}

/**
 * Synapse logo — synaptic neural connections SVG.
 * Reusable across landing page, sidebar, and persona selector.
 */
export function Logo({ className }: LogoProps) {
  return (
    <svg viewBox="0 0 100 100" className={cn("h-full w-full", className)}>
      {/* Synaptic connections */}
      <path
        d="M50 46 Q63 30 74 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        className="text-primary"
      />
      <path
        d="M50 46 Q32 32 22 34"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        className="text-primary"
        opacity="0.7"
      />
      <path
        d="M50 46 Q54 64 58 76"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        className="text-primary"
        opacity="0.75"
      />
      {/* Inter-node arcs */}
      <path
        d="M74 24 Q84 50 58 76"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        className="text-primary"
        opacity="0.2"
      />
      <path
        d="M22 34 Q22 58 58 76"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        className="text-primary"
        opacity="0.15"
      />
      {/* Peripheral nodes */}
      <circle cx="74" cy="24" r="7" className="fill-primary" />
      <circle cx="22" cy="34" r="5.5" className="fill-primary" opacity="0.7" />
      <circle cx="58" cy="76" r="6.5" className="fill-primary" opacity="0.85" />
      {/* Central hub */}
      <circle cx="50" cy="46" r="10" className="fill-primary" />
      {/* Signal particles */}
      <circle cx="63" cy="34" r="2.5" className="fill-primary" opacity="0.4" />
      <circle cx="35" cy="39" r="2.2" className="fill-primary" opacity="0.3" />
      <circle cx="54" cy="62" r="2" className="fill-primary" opacity="0.3" />
    </svg>
  );
}
