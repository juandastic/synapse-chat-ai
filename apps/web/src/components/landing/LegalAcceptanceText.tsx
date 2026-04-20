import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { color } from "./theme";

/**
 * Signup disclosure shown near the sign-in CTA. Renders minimum-age + Terms +
 * Privacy acceptance language with inline links to /terms and /privacy.
 */
export function LegalAcceptanceText() {
  const { i18n } = useTranslation();
  const isEs = i18n.language === "es";

  const linkClass = "underline underline-offset-2 hover:opacity-70";
  const terms = (
    <Link to="/terms" className={linkClass}>
      {isEs ? "Términos" : "Terms"}
    </Link>
  );
  const privacy = (
    <Link to="/privacy" className={linkClass}>
      {isEs ? "Política de Privacidad" : "Privacy Policy"}
    </Link>
  );

  return (
    <p className="mt-4 text-[11px]" style={{ color: color.inkDim }}>
      {isEs ? (
        <>Al registrarte, debes tener al menos 13 años y aceptas los {terms} y la {privacy}.</>
      ) : (
        <>By signing up, you must be at least 13 years old and you agree to the {terms} and {privacy}.</>
      )}
    </p>
  );
}
