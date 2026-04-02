import { useState, useEffect, useRef, type ReactNode } from "react";
import { color } from "./theme";

/** Scroll-triggered fade-in. Activates once when 12 % of the element is visible. */
export function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(30px)",
        transition: `opacity 0.8s ease ${delay}s, transform 0.8s ease ${delay}s`,
      }}
    >
      {children}
    </div>
  );
}

/** Horizontal rule between sections. */
export function Divider() {
  return (
    <div
      className="mx-auto max-w-3xl px-6"
      style={{ borderBottom: `1px solid ${color.rule}` }}
    />
  );
}

/** Decorative SVG lines drawn on mount. */
export function ConnectionLines() {
  const lines = [
    { d: "M-50,200 Q400,100 850,300", delay: 0 },
    { d: "M-50,400 Q300,350 900,150", delay: 0.5 },
    { d: "M200,-50 Q350,300 500,700", delay: 1 },
    { d: "M600,-50 Q550,200 700,700", delay: 1.5 },
    { d: "M-50,600 Q450,500 950,400", delay: 0.8 },
  ];

  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full"
      style={{ zIndex: 0 }}
      preserveAspectRatio="none"
    >
      <defs>
        <style>{`
          @keyframes lineDraw {
            from { stroke-dashoffset: 1200 }
            to   { stroke-dashoffset: 0 }
          }
        `}</style>
      </defs>
      {lines.map((line, i) => (
        <path
          key={i}
          d={line.d}
          fill="none"
          stroke={color.ink}
          strokeWidth="1"
          opacity="0.06"
          strokeDasharray="1200"
          style={{
            animation: `lineDraw 4s ease-out ${line.delay}s forwards`,
            strokeDashoffset: 1200,
          }}
        />
      ))}
    </svg>
  );
}
