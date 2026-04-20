import { useTranslation } from "react-i18next";
import { LegalLayout } from "./LegalLayout";

const LAST_UPDATED = "April 19, 2026";

export function TermsPage() {
  const { i18n } = useTranslation();
  const isEs = i18n.language === "es";

  return (
    <LegalLayout>{isEs ? <TermsEs /> : <TermsEn />}</LegalLayout>
  );
}

function TermsEn() {
  return (
    <>
      <h1>Terms of Service</h1>
      <div className="meta">Last updated: {LAST_UPDATED}</div>

      <h2>1. Acceptance</h2>
      <p>
        By using Synapse Chat AI ("Synapse", "Service"), you agree to these Terms. If you don't agree, don't use the Service.
      </p>
      <p>
        You must be at least 13 years old. If you're between 13 and the age of legal majority in your jurisdiction (typically 18), you need your parent or guardian to accept these Terms on your behalf.
      </p>
      <div className="callout">
        <strong>ARBITRATION NOTICE:</strong> Disputes between you and Synapse will be resolved by binding arbitration under Colombian law, and you waive the right to participate in class actions (see Section 12). You can opt out within 30 days — see below.
      </div>

      <h2>2. What Synapse does</h2>
      <p>
        Synapse is an AI chat assistant with a persistent memory feature. Conversations are processed using Google Gemini. Our backend extracts knowledge from your conversations to personalize future responses.
      </p>
      <p>
        <strong>
          Synapse is AI. Its outputs may be inaccurate, outdated, biased, or offensive. Do not treat them as medical, legal, financial, psychological, or other professional advice. You are responsible for verifying any important information before acting on it.
        </strong>
      </p>

      <h2>3. Your account</h2>
      <p>
        You register via our auth provider Clerk. You're responsible for keeping your credentials secure and for all activity under your account. One account per person. Notify us of any suspected unauthorized access.
      </p>

      <h2>4. Your content</h2>
      <p>
        You keep ownership of everything you send to Synapse ("User Content"). By using the Service, you grant us a worldwide, non-exclusive, royalty-free license to process, store, and transmit your User Content solely for the purpose of providing the Service to you — which includes sending your messages to AI providers (like Google Gemini) to generate responses, and extracting knowledge into your memory graph.
      </p>
      <p>
        You're responsible for your User Content. You represent that you have the right to share what you share with Synapse.
      </p>

      <h2>5. Acceptable use</h2>
      <p>Don't use Synapse to:</p>
      <ul>
        <li>Do anything illegal.</li>
        <li>Generate or distribute child sexual abuse material (CSAM), content that sexualizes minors, or content harmful to children.</li>
        <li>Harass, threaten, defame, or impersonate anyone.</li>
        <li>Generate spam, malware, or phishing content.</li>
        <li>Infringe anyone's intellectual property or privacy rights.</li>
        <li>Reverse-engineer, scrape, or data-mine the Service; use bots or automated tools to interact with it; or attempt to extract training data or circumvent rate limits.</li>
        <li>Create a competing product using outputs from Synapse.</li>
        <li>Attempt to bypass security mechanisms or disrupt the Service.</li>
      </ul>
      <p>
        We don't actively monitor your conversations, but we reserve the right to investigate and remove content, and to suspend or terminate accounts, if we believe these Terms or applicable laws are being violated.
      </p>

      <h2>6. Memory feature</h2>
      <p>
        Synapse's memory feature stores facts extracted from your conversations. You can view, correct, or delete your memory at any time — either specific facts from the Memory section, specific threads, or your entire account. See our <a href="/privacy">Privacy Policy</a> for details.
      </p>
      <p>
        Do not share information in Synapse that you're not comfortable being stored in your personal knowledge graph. If you discuss sensitive topics (health, relationships, legal issues, etc.), consider whether that fits your expectations for the memory.
      </p>

      <h2>7. Usage limits and plans</h2>
      <p>
        Synapse offers Free and Pro plans with different daily message limits. We may change limits, plans, and pricing with reasonable notice. Current limits are shown in the app.
      </p>

      <h2>8. Payments</h2>
      <ul>
        <li>
          <strong>Web purchases</strong> are processed by <strong>Lemon Squeezy</strong> as the Merchant of Record. Their <a href="https://www.lemonsqueezy.com/legal/terms-of-service" target="_blank" rel="noopener noreferrer">Terms</a> govern the purchase.
        </li>
        <li>
          <strong>Mobile subscriptions</strong> are processed by <strong>Apple</strong> (iOS) or <strong>Google</strong> (Android) through in-app purchase. Their terms govern the purchase, including cancellation and renewal.
        </li>
      </ul>
      <p>No refunds for partial billing periods. Cancel anytime; you keep access until the end of the paid period.</p>

      <h2>9. Third-party services</h2>
      <p>
        Synapse uses third-party services (Google Gemini, PostHog, Cloudflare, and others listed in the Privacy Policy). We're not responsible for their terms or actions. Your use of those services is governed by their own terms.
      </p>

      <h2>10. Disclaimers</h2>
      <p>
        The Service is provided <strong>"AS IS" AND "AS AVAILABLE"</strong>. We disclaim all warranties, express or implied, including merchantability, fitness for a particular purpose, and non-infringement. We don't warrant that the Service will be uninterrupted, error-free, secure, or that AI outputs will be accurate, safe, or useful.
      </p>

      <h2>11. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, Synapse (and Juan David Gomez individually) are not liable for indirect, incidental, special, consequential, or punitive damages, or for lost profits, lost data, or business interruption, arising from your use of the Service — even if advised of the possibility.
      </p>
      <p>
        Total liability for any claim arising out of or related to the Service or these Terms is capped at the greater of (a) the amount you paid us in the twelve months before the claim, or (b) USD $100.
      </p>
      <p>
        You agree that any claim must be brought within <strong>one year</strong> after it arises, otherwise it is permanently barred.
      </p>

      <h2>12. Disputes, governing law, arbitration</h2>
      <p>
        These Terms are governed by the laws of Colombia. Any dispute arising out of or related to these Terms or the Service shall be resolved by binding arbitration in Bogotá, Colombia, under the rules of the Centro de Arbitraje y Conciliación de la Cámara de Comercio de Bogotá, by a single arbitrator.
      </p>
      <p>
        <strong>Class-action waiver:</strong> You agree that any arbitration or court proceeding will be conducted on an individual basis only, not as a class, consolidated, or representative action.
      </p>
      <p>
        <strong>Opt-out:</strong> You may opt out of binding arbitration within 30 days of first accepting these Terms by emailing <a href="mailto:juandastic@gmail.com">juandastic@gmail.com</a> with your name and a clear statement of intent to opt out.
      </p>
      <p>Small-claims court actions and claims for injunctive relief are excluded from arbitration.</p>

      <h2>13. Termination</h2>
      <p>
        You may delete your account anytime from Settings → Account. We may suspend or terminate your access if you violate these Terms, if required by law, or to protect the Service. On termination, Sections 4 (license, limited to previously submitted content), 10–14 survive.
      </p>

      <h2>14. Changes</h2>
      <p>
        We may update these Terms. When we make material changes, we'll notify you through the app and update the "Last updated" date. Your continued use after the change means you accept the new Terms. If you don't agree, stop using the Service.
      </p>

      <h2>15. Feedback</h2>
      <p>If you send us ideas or suggestions, we may use them freely without obligation to you.</p>

      <h2>16. Contact</h2>
      <p>
        Juan David Gomez — <a href="mailto:juandastic@gmail.com">juandastic@gmail.com</a>
      </p>

      <h2>17. Miscellaneous</h2>
      <p>
        These Terms plus the <a href="/privacy">Privacy Policy</a> are the entire agreement between you and Synapse. If any part is unenforceable, the rest remains in effect. Our failure to enforce any provision isn't a waiver. You can't assign these Terms; we can.
      </p>
    </>
  );
}

function TermsEs() {
  return (
    <>
      <h1>Términos de Servicio</h1>
      <div className="meta">Última actualización: {LAST_UPDATED}</div>

      <h2>1. Aceptación</h2>
      <p>
        Al usar Synapse Chat AI ("Synapse", "Servicio"), aceptas estos Términos. Si no estás de acuerdo, no uses el Servicio.
      </p>
      <p>
        Debes tener al menos 13 años. Si estás entre 13 y la edad de mayoría legal en tu jurisdicción (típicamente 18), necesitas que tu padre o tutor acepte estos Términos en tu nombre.
      </p>
      <div className="callout">
        <strong>AVISO DE ARBITRAJE:</strong> Las disputas entre tú y Synapse se resolverán por arbitraje vinculante bajo ley colombiana, y renuncias al derecho de participar en acciones colectivas (ver Sección 12). Puedes optar por salirte dentro de 30 días — ver abajo.
      </div>

      <h2>2. Qué hace Synapse</h2>
      <p>
        Synapse es un asistente de chat IA con una función de memoria persistente. Las conversaciones son procesadas usando Google Gemini. Nuestro backend extrae conocimiento de tus conversaciones para personalizar respuestas futuras.
      </p>
      <p>
        <strong>
          Synapse es IA. Sus outputs pueden ser inexactos, desactualizados, sesgados u ofensivos. No los trates como consejo médico, legal, financiero, psicológico u otro tipo de asesoría profesional. Eres responsable de verificar cualquier información importante antes de actuar sobre ella.
        </strong>
      </p>

      <h2>3. Tu cuenta</h2>
      <p>
        Te registras a través de nuestro proveedor de autenticación Clerk. Eres responsable de mantener tus credenciales seguras y de toda la actividad bajo tu cuenta. Una cuenta por persona. Notifícanos inmediatamente cualquier acceso no autorizado sospechado.
      </p>

      <h2>4. Tu contenido</h2>
      <p>
        Mantienes la propiedad de todo lo que envíes a Synapse ("Contenido del Usuario"). Al usar el Servicio, nos otorgas una licencia mundial, no exclusiva y libre de regalías para procesar, almacenar y transmitir tu Contenido del Usuario únicamente con el propósito de proveerte el Servicio — lo que incluye enviar tus mensajes a proveedores de IA (como Google Gemini) para generar respuestas, y extraer conocimiento en tu grafo de memoria.
      </p>
      <p>
        Eres responsable de tu Contenido del Usuario. Declaras que tienes el derecho de compartir lo que compartes con Synapse.
      </p>

      <h2>5. Uso aceptable</h2>
      <p>No uses Synapse para:</p>
      <ul>
        <li>Hacer cualquier cosa ilegal.</li>
        <li>Generar o distribuir material de abuso sexual infantil (CSAM), contenido que sexualice a menores, o contenido dañino para niños.</li>
        <li>Acosar, amenazar, difamar o suplantar a alguien.</li>
        <li>Generar spam, malware o contenido de phishing.</li>
        <li>Infringir los derechos de propiedad intelectual o privacidad de terceros.</li>
        <li>Realizar ingeniería inversa, scraping, o minería de datos del Servicio; usar bots o herramientas automatizadas para interactuar con él; o intentar extraer datos de entrenamiento o evadir límites de uso.</li>
        <li>Crear un producto competidor usando outputs de Synapse.</li>
        <li>Intentar eludir los mecanismos de seguridad o perturbar el Servicio.</li>
      </ul>
      <p>
        No monitoreamos activamente tus conversaciones, pero nos reservamos el derecho de investigar y remover contenido, y de suspender o terminar cuentas, si creemos que estos Términos o leyes aplicables están siendo violados.
      </p>

      <h2>6. Función de memoria</h2>
      <p>
        La función de memoria de Synapse almacena hechos extraídos de tus conversaciones. Puedes ver, corregir o eliminar tu memoria en cualquier momento — sean hechos específicos desde la sección Memoria, hilos específicos, o tu cuenta entera. Ver nuestra <a href="/privacy">Política de Privacidad</a> para detalles.
      </p>
      <p>
        No compartas en Synapse información con la que no te sientas cómodo siendo almacenada en tu grafo de conocimiento personal. Si discutes temas sensibles (salud, relaciones, asuntos legales, etc.), considera si eso cuadra con tus expectativas para la memoria.
      </p>

      <h2>7. Límites de uso y planes</h2>
      <p>
        Synapse ofrece planes Free y Pro con diferentes límites diarios de mensajes. Podemos cambiar límites, planes y precios con aviso razonable. Los límites actuales se muestran en la app.
      </p>

      <h2>8. Pagos</h2>
      <ul>
        <li>
          <strong>Las compras en web</strong> son procesadas por <strong>Lemon Squeezy</strong> como Comerciante Registrado (Merchant of Record). Sus <a href="https://www.lemonsqueezy.com/legal/terms-of-service" target="_blank" rel="noopener noreferrer">Términos</a> gobiernan la compra.
        </li>
        <li>
          <strong>Las suscripciones móviles</strong> son procesadas por <strong>Apple</strong> (iOS) o <strong>Google</strong> (Android) a través de compra in-app. Sus términos gobiernan la compra, incluyendo cancelación y renovación.
        </li>
      </ul>
      <p>Sin reembolsos por períodos de facturación parciales. Cancela en cualquier momento; mantienes acceso hasta el final del período pagado.</p>

      <h2>9. Servicios de terceros</h2>
      <p>
        Synapse usa servicios de terceros (Google Gemini, PostHog, Cloudflare, y otros listados en la Política de Privacidad). No somos responsables de sus términos o acciones. Tu uso de esos servicios se gobierna por sus propios términos.
      </p>

      <h2>10. Descargos</h2>
      <p>
        El Servicio se provee <strong>"TAL CUAL" Y "COMO ESTÉ DISPONIBLE"</strong>. Declinamos todas las garantías, expresas o implícitas, incluyendo comerciabilidad, idoneidad para un propósito particular y no infracción. No garantizamos que el Servicio será ininterrumpido, libre de errores, seguro, o que los outputs de IA serán precisos, seguros o útiles.
      </p>

      <h2>11. Limitación de responsabilidad</h2>
      <p>
        Hasta el máximo permitido por la ley, Synapse (y Juan David Gomez individualmente) no son responsables por daños indirectos, incidentales, especiales, consecuenciales o punitivos, o por lucro cesante, pérdida de datos o interrupción del negocio, derivados de tu uso del Servicio — incluso si fueron advertidos de la posibilidad.
      </p>
      <p>
        La responsabilidad total por cualquier reclamo derivado o relacionado con el Servicio o estos Términos está limitada al mayor entre (a) el monto que nos hayas pagado en los doce meses anteriores al reclamo, o (b) USD $100.
      </p>
      <p>
        Aceptas que cualquier reclamo debe presentarse dentro de <strong>un año</strong> después de surgir, de lo contrario queda permanentemente prescrito.
      </p>

      <h2>12. Disputas, ley aplicable, arbitraje</h2>
      <p>
        Estos Términos se rigen por las leyes de Colombia. Cualquier disputa derivada o relacionada con estos Términos o el Servicio se resolverá por arbitraje vinculante en Bogotá, Colombia, bajo las reglas del Centro de Arbitraje y Conciliación de la Cámara de Comercio de Bogotá, por un único árbitro.
      </p>
      <p>
        <strong>Renuncia a acción colectiva:</strong> Aceptas que cualquier procedimiento de arbitraje o judicial se conducirá solo sobre base individual, no como acción de clase, consolidada o representativa.
      </p>
      <p>
        <strong>Opt-out:</strong> Puedes optar por salirte del arbitraje vinculante dentro de 30 días de la primera aceptación de estos Términos escribiendo a <a href="mailto:juandastic@gmail.com">juandastic@gmail.com</a> con tu nombre y una declaración clara de intención de salirte.
      </p>
      <p>Las acciones en juzgados de menor cuantía y reclamos por medidas cautelares están excluidos del arbitraje.</p>

      <h2>13. Terminación</h2>
      <p>
        Puedes eliminar tu cuenta en cualquier momento desde Ajustes → Cuenta. Podemos suspender o terminar tu acceso si violas estos Términos, si es requerido por ley, o para proteger el Servicio. Al terminar, las Secciones 4 (licencia, limitada a contenido previamente enviado), 10–14 sobreviven.
      </p>

      <h2>14. Cambios</h2>
      <p>
        Podemos actualizar estos Términos. Cuando hagamos cambios materiales, te notificaremos a través de la app y actualizaremos la fecha de "Última actualización". Tu uso continuado después del cambio significa que aceptas los nuevos Términos. Si no estás de acuerdo, deja de usar el Servicio.
      </p>

      <h2>15. Retroalimentación</h2>
      <p>Si nos envías ideas o sugerencias, podemos usarlas libremente sin obligación hacia ti.</p>

      <h2>16. Contacto</h2>
      <p>
        Juan David Gomez — <a href="mailto:juandastic@gmail.com">juandastic@gmail.com</a>
      </p>

      <h2>17. Misceláneo</h2>
      <p>
        Estos Términos más la <a href="/privacy">Política de Privacidad</a> constituyen el acuerdo completo entre tú y Synapse. Si alguna parte es inejecutable, el resto permanece en vigor. Nuestro fallo en hacer cumplir alguna disposición no es una renuncia. Tú no puedes ceder estos Términos; nosotros sí.
      </p>
    </>
  );
}
