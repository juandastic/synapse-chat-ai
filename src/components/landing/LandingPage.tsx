import { useState, useEffect, useRef, useCallback, type ReactNode } from "react";
import { SignInButton, useSignIn } from "@clerk/clerk-react";
import { useTranslation } from "react-i18next";
import { Logo } from "@/components/ui/logo";
import {
  ArrowRight,
  Brain,
  Code,
  Eye,
  GitBranch,
  Github,
  Globe,
  MessageSquare,
  Network,
  Pencil,
  Sparkles,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

const DEMO_EMAIL = import.meta.env.VITE_DEMO_EMAIL as string | undefined;
const DEMO_PASSWORD = import.meta.env.VITE_DEMO_PASSWORD as string | undefined;
const DEMO_AVAILABLE = Boolean(DEMO_EMAIL && DEMO_PASSWORD);

const GITHUB_URL = "https://github.com/juandastic#-synapse-ai-chat";

/** Self-contained color tokens so the page looks identical in light and dark mode. */
const color = {
  paper: "#f5f0e8",
  paperAlpha85: "rgba(245, 240, 232, 0.85)",
  ink: "#2c2418",
  inkMuted: "#6b5e4f",
  inkDim: "#a89880",
  accent: "#8b5e3c",
  accentLight: "rgba(139, 94, 60, 0.08)",
  rule: "rgba(44, 36, 24, 0.1)",
  chatBg: "#1c1a16",
  chatBorder: "#2a2620",
  chatBorderAccent: "rgba(139, 94, 60, 0.4)",
  chatSurface: "#221f1a",
  chatUserBg: "#2a2620",
  chatUserBgAccent: "rgba(139, 94, 60, 0.2)",
  chatText: "#e8dfd4",
  chatTextMuted: "#a89880",
  chatLabel: "#ece7df",
  error: "#b91c1c",
} as const;

/* ------------------------------------------------------------------ */
/*  Shared components                                                 */
/* ------------------------------------------------------------------ */

/** Scroll-triggered fade-in. Activates once when 12 % of the element is visible. */
function Reveal({
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
function Divider() {
  return (
    <div
      className="mx-auto max-w-3xl px-6"
      style={{ borderBottom: `1px solid ${color.rule}` }}
    />
  );
}

/** Decorative SVG lines drawn on mount. */
function ConnectionLines() {
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

/* ------------------------------------------------------------------ */
/*  Data                                                              */
/* ------------------------------------------------------------------ */

const PIPELINE_ICONS = [Brain, Network, GitBranch, Sparkles];
const PIPELINE_STEP_NUMBERS = ["01", "02", "03", "04"];

const TRANSPARENCY_ICONS = [Eye, Pencil, Code, Sparkles];

/* ------------------------------------------------------------------ */
/*  Landing page                                                      */
/* ------------------------------------------------------------------ */

export default function LandingPage() {
  const { signIn, setActive } = useSignIn();
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);
  const { t, i18n } = useTranslation("landing");

  const toggleLanguage = useCallback(() => {
    i18n.changeLanguage(i18n.language === "es" ? "en" : "es");
  }, [i18n]);

  const conversations = t("conversations", { returnObjects: true }) as {
    regular: Array<{ role: string; text: string }>;
    synapse: Array<{ role: string; text: string }>;
  };
  const pipelineSteps = t("pipeline.steps", { returnObjects: true }) as Array<{ title: string; desc: string }>;
  const personas = t("personas.list", { returnObjects: true }) as Array<{ emoji: string; name: string; desc: string }>;
  const transparencyFeatures = t("transparency.features", { returnObjects: true }) as Array<{ title: string; desc: string }>;

  const handleTryDemo = async () => {
    if (!signIn || !setActive || !DEMO_EMAIL || !DEMO_PASSWORD) return;
    setDemoLoading(true);
    setDemoError(null);
    try {
      const result = await signIn.create({
        identifier: DEMO_EMAIL,
        password: DEMO_PASSWORD,
      });
      if (result.createdSessionId) {
        await setActive({ session: result.createdSessionId });
      }
    } catch {
      setDemoError(t("hero.demoError"));
      setDemoLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen overflow-y-auto"
      style={{ background: color.paper, color: color.ink }}
    >
      {/* Paper noise texture */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          zIndex: 0,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          opacity: 0.025,
        }}
      />

      <ConnectionLines />

      {/* ============================================================ */}
      {/*  Nav                                                         */}
      {/* ============================================================ */}
      <nav
        className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-6 py-4 md:px-10"
        style={{
          background: color.paperAlpha85,
          backdropFilter: "blur(12px)",
          borderBottom: `1px solid ${color.rule}`,
        }}
      >
        <div className="flex items-center gap-2.5">
          <div className="h-6 w-6" style={{ color: color.accent }}>
            <Logo />
          </div>
          <span
            style={{
              fontFamily: "'Fraunces', Georgia, serif",
              fontSize: 16,
              fontWeight: 600,
              color: color.ink,
              letterSpacing: "-0.01em",
            }}
          >
            Synapse
          </span>
        </div>

        <div className="flex items-center gap-3">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t("nav.githubAriaLabel")}
            className="transition-opacity hover:opacity-70"
            style={{ color: color.inkMuted }}
          >
            <Github className="h-4 w-4" />
          </a>

          <button
            onClick={toggleLanguage}
            className="flex h-8 items-center gap-1 rounded-full px-2 text-xs font-semibold transition-opacity hover:opacity-70"
            style={{ color: color.inkMuted }}
            aria-label={i18n.language === "en" ? "Cambiar a Español" : "Switch to English"}
          >
            <Globe className="h-3.5 w-3.5" />
            {i18n.language === "en" ? "ES" : "EN"}
          </button>

          {DEMO_AVAILABLE && (
            <button
              onClick={handleTryDemo}
              disabled={demoLoading}
              className="hidden sm:inline-flex text-xs transition-opacity hover:opacity-70 disabled:opacity-50"
              style={{ color: color.inkMuted }}
            >
              {demoLoading ? t("nav.signIn") + "..." : t("nav.tryDemo")}
            </button>
          )}

          <SignInButton mode="modal">
            <button
              className="rounded-full px-5 py-1.5 text-sm font-medium transition-opacity hover:opacity-85"
              style={{ background: color.ink, color: color.paper }}
            >
              {t("nav.signIn")}
            </button>
          </SignInButton>
        </div>
      </nav>

      {/* ============================================================ */}
      {/*  Hero                                                        */}
      {/* ============================================================ */}
      <header className="relative z-10 mx-auto max-w-3xl px-6 pt-28 pb-16 md:pt-40 md:pb-20 text-center">
        <Reveal>
          <p
            className="mb-5 text-xs font-semibold uppercase tracking-[0.2em]"
            style={{ color: color.accent }}
          >
            {t("hero.tagline")}
          </p>
        </Reveal>

        <Reveal delay={0.1}>
          <h1
            className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-semibold leading-[1.08] tracking-tight"
            style={{ fontFamily: "'Fraunces', Georgia, serif" }}
          >
            {t("hero.title1")}
            <br />
            <span style={{ color: color.accent }}>{t("hero.title2")}</span>
            <br />
            {t("hero.title3")}
          </h1>
        </Reveal>

        <Reveal delay={0.2}>
          <p
            className="mx-auto mt-6 max-w-lg text-base leading-relaxed sm:text-lg"
            style={{ color: color.inkMuted }}
          >
            {t("hero.description")}
          </p>
        </Reveal>

        <Reveal delay={0.3}>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
            <SignInButton mode="modal">
              <button
                className="group inline-flex items-center gap-2.5 rounded-full px-8 py-3 text-sm font-medium shadow-sm transition-opacity hover:opacity-85"
                style={{ background: color.ink, color: color.paper }}
              >
                {t("hero.getStarted")}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </button>
            </SignInButton>

            {DEMO_AVAILABLE && (
              <button
                onClick={handleTryDemo}
                disabled={demoLoading}
                className="inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm transition-opacity hover:opacity-70 disabled:opacity-50"
                style={{ border: `1px solid ${color.rule}`, color: color.inkMuted }}
              >
                {demoLoading ? "..." : t("hero.experienceDemo")}
              </button>
            )}
          </div>

          {demoError && (
            <p className="mt-3 text-xs" style={{ color: color.error }}>
              {demoError}
            </p>
          )}
        </Reveal>
      </header>

      <Divider />

      {/* ============================================================ */}
      {/*  Pull quote                                                  */}
      {/* ============================================================ */}
      <Reveal>
        <section className="relative z-10 mx-auto max-w-3xl px-6 py-16 md:py-24 text-center">
          <blockquote>
            <p
              className="text-xl sm:text-2xl md:text-3xl leading-relaxed"
              style={{
                fontFamily: "'Fraunces', Georgia, serif",
                fontStyle: "italic",
                fontWeight: 400,
              }}
            >
              {t("pullQuote")}
            </p>
          </blockquote>
        </section>
      </Reveal>

      <Divider />

      {/* ============================================================ */}
      {/*  Comparison                                                  */}
      {/* ============================================================ */}
      <section className="relative z-10 mx-auto max-w-3xl px-6 py-16 md:py-24">
        <Reveal>
          <p
            className="mb-3 text-xs font-semibold uppercase tracking-[0.2em]"
            style={{ color: color.accent }}
          >
            {t("comparison.tagline")}
          </p>
          <h2
            className="text-2xl sm:text-3xl font-semibold tracking-tight"
            style={{ fontFamily: "'Fraunces', Georgia, serif" }}
          >
            {t("comparison.title")}
          </h2>
          <p
            className="mt-3 max-w-md text-sm leading-relaxed mb-10"
            style={{ color: color.inkMuted }}
          >
            {t("comparison.description")}
          </p>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="grid md:grid-cols-2 gap-6">
            {(["regular", "synapse"] as const).map((type) => {
              const isSynapse = type === "synapse";
              const messages = conversations[type];

              return (
                <div
                  key={type}
                  className="rounded-2xl overflow-hidden"
                  style={{
                    background: color.chatBg,
                    border: `1px solid ${isSynapse ? color.chatBorderAccent : color.chatBorder}`,
                  }}
                >
                  <div className="px-4 pt-4 pb-1">
                    <span
                      className="text-xs font-semibold tracking-[0.02em]"
                      style={{
                        color: color.chatLabel,
                        fontFamily: "'Fraunces', Georgia, serif",
                      }}
                    >
                      {isSynapse ? (
                        <>
                          <Brain className="inline h-3.5 w-3.5 mr-1" />
                          {t("comparison.synapse")}
                        </>
                      ) : (
                        <>
                          <MessageSquare className="inline h-3.5 w-3.5 mr-1" />
                          {t("comparison.regularAI")}
                        </>
                      )}
                    </span>
                  </div>

                  <div className="p-4 space-y-2.5">
                    {messages.map((msg, i) => (
                      <div
                        key={i}
                        className="rounded-lg px-3 py-2 text-xs leading-relaxed"
                        style={{
                          background:
                            msg.role === "user"
                              ? isSynapse
                                ? color.chatUserBgAccent
                                : color.chatUserBg
                              : color.chatSurface,
                          color:
                            msg.role === "user"
                              ? color.chatText
                              : color.chatTextMuted,
                          marginLeft: msg.role === "user" ? 24 : 0,
                          marginRight: msg.role === "ai" ? 12 : 0,
                        }}
                      >
                        {msg.text}
                      </div>
                    ))}
                  </div>

                  {isSynapse && (
                    <div className="px-4 pb-3 flex items-center gap-1">
                      <Sparkles className="h-3 w-3" style={{ color: color.accent }} />
                      <span
                        className="text-[10px]"
                        style={{ color: `${color.accent}99` }}
                      >
                        {t("comparison.graphStats")}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Reveal>
      </section>

      <Divider />

      {/* ============================================================ */}
      {/*  Pipeline                                                    */}
      {/* ============================================================ */}
      <section className="relative z-10 mx-auto max-w-3xl px-6 py-16 md:py-24">
        <Reveal>
          <p
            className="mb-3 text-xs font-semibold uppercase tracking-[0.2em]"
            style={{ color: color.accent }}
          >
            {t("pipeline.tagline")}
          </p>
          <h2
            className="text-2xl sm:text-3xl font-semibold tracking-tight"
            style={{ fontFamily: "'Fraunces', Georgia, serif" }}
          >
            {t("pipeline.title")}
          </h2>
          <p
            className="mt-3 max-w-md text-sm leading-relaxed"
            style={{ color: color.inkMuted }}
          >
            {t("pipeline.description")}
          </p>
        </Reveal>

        <div className="mt-10 grid sm:grid-cols-2 gap-5">
          {pipelineSteps.map((s, i) => {
            const Icon = PIPELINE_ICONS[i];
            return (
            <Reveal key={i} delay={i * 0.08}>
              <div
                className="rounded-xl p-5 transition-colors"
                style={{ border: `1px solid ${color.rule}` }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.borderColor = color.accent)
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.borderColor = color.rule)
                }
              >
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="flex h-9 w-9 items-center justify-center rounded-lg"
                    style={{ background: color.accentLight }}
                  >
                    <Icon className="h-4 w-4" style={{ color: color.accent }} />
                  </div>
                  <span
                    className="text-[10px] font-semibold"
                    style={{ color: color.inkDim }}
                  >
                    {t("pipeline.step", { number: PIPELINE_STEP_NUMBERS[i] })}
                  </span>
                </div>
                <h3
                  className="text-base font-semibold"
                  style={{ fontFamily: "'Fraunces', Georgia, serif" }}
                >
                  {s.title}
                </h3>
                <p
                  className="mt-2 text-xs leading-relaxed"
                  style={{ color: color.inkMuted }}
                >
                  {s.desc}
                </p>
              </div>
            </Reveal>
            );
          })}
        </div>
      </section>

      <Divider />

      {/* ============================================================ */}
      {/*  Personas                                                    */}
      {/* ============================================================ */}
      <section className="relative z-10 mx-auto max-w-3xl px-6 py-16 md:py-24">
        <Reveal>
          <p
            className="mb-3 text-xs font-semibold uppercase tracking-[0.2em]"
            style={{ color: color.accent }}
          >
            {t("personas.tagline")}
          </p>
          <h2
            className="text-2xl sm:text-3xl font-semibold tracking-tight"
            style={{ fontFamily: "'Fraunces', Georgia, serif" }}
          >
            {t("personas.title")}
          </h2>
          <p
            className="mt-3 max-w-md text-sm leading-relaxed"
            style={{ color: color.inkMuted }}
          >
            {t("personas.description")}
          </p>
        </Reveal>

        <div className="mt-10 grid sm:grid-cols-3 gap-5">
          {personas.map((p, i) => (
            <Reveal key={i} delay={i * 0.08}>
              <div
                className="rounded-xl p-6 transition-colors"
                style={{
                  border: `1px solid ${color.rule}`,
                  background: color.accentLight,
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.borderColor = color.accent)
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.borderColor = color.rule)
                }
              >
                <span className="text-2xl">{p.emoji}</span>
                <h3
                  className="mt-3 text-base font-semibold"
                  style={{ fontFamily: "'Fraunces', Georgia, serif" }}
                >
                  {p.name}
                </h3>
                <p
                  className="mt-2 text-xs leading-relaxed"
                  style={{ color: color.inkMuted }}
                >
                  {p.desc}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <Divider />

      {/* ============================================================ */}
      {/*  Transparency                                                */}
      {/* ============================================================ */}
      <section className="relative z-10 mx-auto max-w-3xl px-6 py-16 md:py-24">
        <Reveal>
          <p
            className="mb-3 text-xs font-semibold uppercase tracking-[0.2em]"
            style={{ color: color.accent }}
          >
            {t("transparency.tagline")}
          </p>
          <h2
            className="text-2xl sm:text-3xl font-semibold tracking-tight"
            style={{ fontFamily: "'Fraunces', Georgia, serif" }}
          >
            {t("transparency.title")}
          </h2>
          <p
            className="mt-3 max-w-md text-sm leading-relaxed"
            style={{ color: color.inkMuted }}
          >
            {t("transparency.description")}
          </p>
        </Reveal>

        <div className="mt-8 grid sm:grid-cols-2 gap-4">
          {transparencyFeatures.map((f, i) => {
            const Icon = TRANSPARENCY_ICONS[i];
            return (
            <Reveal key={i} delay={i * 0.06}>
              <div
                className="flex items-start gap-3 rounded-lg p-4"
                style={{ border: `1px solid ${color.rule}` }}
              >
                <Icon
                  className="h-4 w-4 mt-0.5 shrink-0"
                  style={{ color: color.accent }}
                />
                <div>
                  <h4
                    className="text-sm font-semibold"
                    style={{ fontFamily: "'Fraunces', Georgia, serif" }}
                  >
                    {f.title}
                  </h4>
                  <p
                    className="mt-1 text-xs leading-relaxed"
                    style={{ color: color.inkMuted }}
                  >
                    {f.desc}
                  </p>
                </div>
              </div>
            </Reveal>
            );
          })}
        </div>
      </section>

      {/* ============================================================ */}
      {/*  Final CTA                                                   */}
      {/* ============================================================ */}
      <section
        className="relative z-10 px-6 py-20 md:py-32 text-center"
        style={{ borderTop: `1px solid ${color.rule}` }}
      >
        <Reveal>
          <div className="mx-auto mb-6 h-14 w-14" style={{ color: color.accent }}>
            <Logo />
          </div>
        </Reveal>

        <Reveal delay={0.1}>
          <h2
            className="text-2xl sm:text-3xl md:text-4xl font-semibold tracking-tight"
            style={{ fontFamily: "'Fraunces', Georgia, serif" }}
          >
            {t("cta.title1")}
            <br />
            <span style={{ color: color.accent }}>{t("cta.title2")}</span>
          </h2>
        </Reveal>

        <Reveal delay={0.2}>
          <p
            className="mt-4 max-w-md mx-auto text-sm leading-relaxed"
            style={{ color: color.inkMuted }}
          >
            {t("cta.description")}
          </p>
        </Reveal>

        <Reveal delay={0.3}>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <SignInButton mode="modal">
              <button
                className="group inline-flex items-center gap-2.5 rounded-full px-8 py-3 text-sm font-medium shadow-sm transition-opacity hover:opacity-85"
                style={{ background: color.ink, color: color.paper }}
              >
                {t("cta.begin")}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </button>
            </SignInButton>

            {DEMO_AVAILABLE && (
              <button
                onClick={handleTryDemo}
                disabled={demoLoading}
                className="text-sm transition-opacity hover:opacity-70 disabled:opacity-50"
                style={{ color: color.inkDim }}
              >
                {demoLoading ? "..." : t("cta.tryDemo")}
              </button>
            )}
          </div>

          {demoError && (
            <p className="mt-3 text-xs" style={{ color: color.error }}>
              {demoError}
            </p>
          )}
        </Reveal>

        <Reveal delay={0.4}>
          <p
            className="mt-10 text-xs"
            style={{
              color: color.inkDim,
              fontFamily: "'Fraunces', Georgia, serif",
              fontStyle: "italic",
            }}
          >
            {t("cta.personal")}{" "}
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-[3px] transition-opacity hover:opacity-70"
            >
              {t("cta.openSource")}
            </a>
            .
          </p>
        </Reveal>
      </section>
    </div>
  );
}
