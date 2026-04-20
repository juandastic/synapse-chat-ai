import { type ReactNode, useCallback } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import posthog from "posthog-js";
import { Logo } from "@/components/ui/logo";
import { color } from "@/components/landing/theme";

interface LegalLayoutProps {
  children: ReactNode;
}

export function LegalLayout({ children }: LegalLayoutProps) {
  const { i18n } = useTranslation();

  const toggleLanguage = useCallback(() => {
    const newLang = i18n.language === "es" ? "en" : "es";
    i18n.changeLanguage(newLang);
    posthog.capture("language_toggled", { language: newLang, source: "legal" });
  }, [i18n]);

  const isEs = i18n.language === "es";

  return (
    <div
      className="min-h-screen overflow-y-auto"
      style={{ background: color.paper, color: color.ink }}
    >
      <header
        className="sticky top-0 z-10 border-b backdrop-blur-sm"
        style={{ background: color.paperAlpha85, borderColor: color.rule }}
      >
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2 transition-opacity hover:opacity-70">
            <Logo className="h-6 w-6" />
            <span
              className="text-sm font-medium"
              style={{ fontFamily: "'Fraunces', Georgia, serif" }}
            >
              Synapse
            </span>
          </Link>
          <button
            onClick={toggleLanguage}
            className="text-xs uppercase tracking-wide transition-opacity hover:opacity-70"
            style={{ color: color.inkMuted }}
          >
            {isEs ? "English" : "Español"}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <article
          className="legal-prose"
          style={{ fontFamily: "'Fraunces', Georgia, serif" }}
        >
          {children}
        </article>

        <footer
          className="mt-16 flex flex-wrap items-center gap-4 border-t pt-6 text-xs"
          style={{ borderColor: color.rule, color: color.inkDim }}
        >
          <Link to="/privacy" className="underline underline-offset-2 hover:opacity-70">
            {isEs ? "Privacidad" : "Privacy"}
          </Link>
          <Link to="/terms" className="underline underline-offset-2 hover:opacity-70">
            {isEs ? "Términos" : "Terms"}
          </Link>
          <Link to="/delete-account" className="underline underline-offset-2 hover:opacity-70">
            {isEs ? "Eliminar cuenta" : "Delete account"}
          </Link>
          <span className="ml-auto">
            Synapse Chat AI — Juan David Gomez
          </span>
        </footer>
      </main>

      <style>{`
        .legal-prose h1 {
          font-size: 2rem;
          font-weight: 600;
          line-height: 1.2;
          margin-bottom: 0.5rem;
        }
        .legal-prose h2 {
          font-size: 1.25rem;
          font-weight: 600;
          line-height: 1.3;
          margin-top: 2.5rem;
          margin-bottom: 0.75rem;
        }
        .legal-prose h3 {
          font-size: 1rem;
          font-weight: 600;
          margin-top: 1.5rem;
          margin-bottom: 0.5rem;
        }
        .legal-prose p, .legal-prose li {
          font-size: 0.95rem;
          line-height: 1.65;
          color: ${color.ink};
        }
        .legal-prose p {
          margin-bottom: 1rem;
        }
        .legal-prose ul {
          list-style: disc;
          padding-left: 1.5rem;
          margin-bottom: 1rem;
        }
        .legal-prose li {
          margin-bottom: 0.5rem;
        }
        .legal-prose a {
          color: ${color.accent};
          text-decoration: underline;
          text-underline-offset: 2px;
        }
        .legal-prose a:hover {
          opacity: 0.75;
        }
        .legal-prose strong {
          font-weight: 600;
        }
        .legal-prose .meta {
          font-size: 0.85rem;
          color: ${color.inkMuted};
          margin-bottom: 2.5rem;
        }
        .legal-prose .callout {
          background: ${color.accentLight};
          border-left: 3px solid ${color.accent};
          padding: 0.75rem 1rem;
          margin: 1.5rem 0;
          font-size: 0.9rem;
        }
      `}</style>
    </div>
  );
}
