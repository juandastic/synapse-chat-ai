import { useTranslation } from "react-i18next";
import { LegalLayout } from "./LegalLayout";

const LAST_UPDATED = "April 19, 2026";

export function PrivacyPage() {
  const { i18n } = useTranslation();
  const isEs = i18n.language === "es";

  return (
    <LegalLayout>{isEs ? <PrivacyEs /> : <PrivacyEn />}</LegalLayout>
  );
}

function PrivacyEn() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <div className="meta">Last updated: {LAST_UPDATED}</div>

      <h2>1. Who we are</h2>
      <p>
        Synapse Chat AI ("Synapse", "we", "us") is operated by Juan David Gomez, an individual based in Colombia. You can reach us at{" "}
        <a href="mailto:juandastic@gmail.com">juandastic@gmail.com</a>.
      </p>
      <p>
        This Privacy Policy describes what personal information we collect when you use Synapse, how we use it, who we share it with, and your choices about it.
      </p>
      <p>By using Synapse, you consent to the practices described here. If you don't agree, please don't use the service.</p>

      <h2>2. Information we collect</h2>
      <p>When you use Synapse, we collect:</p>
      <ul>
        <li><strong>Account information</strong> via our auth provider Clerk: your email, name, and an account identifier.</li>
        <li><strong>Your messages</strong>: the text, images, and any files you send in conversations.</li>
        <li><strong>Knowledge extracted from your messages</strong>: to power the personalized memory feature that makes Synapse useful, our backend extracts facts, entities, and relationships from your conversations. This is stored as a private knowledge graph associated only with your account.</li>
        <li><strong>Usage data</strong>: which features you use, how often you send messages, language preferences, errors you encounter.</li>
        <li><strong>Device and connection information</strong>: IP address, browser/app version, operating system, general location (country/city inferred from IP).</li>
      </ul>
      <p>
        We don't knowingly collect sensitive personal information unless you choose to share it in a conversation. If you do, it becomes part of the knowledge graph described above.
      </p>

      <h2>3. How we use your information</h2>
      <ul>
        <li>To provide the service: run your conversations, store your history, personalize responses using your knowledge graph.</li>
        <li>To keep the service working: debug errors, prevent abuse, enforce our Terms.</li>
        <li>To improve the service: analyze aggregate usage patterns.</li>
        <li>To communicate with you: respond to support requests, notify about important changes.</li>
      </ul>
      <div className="callout">
        <strong>We do not use your personal information or your messages to train AI models.</strong> Your conversations are yours.
      </div>

      <h2>4. Who we share your information with</h2>
      <p>
        We share the minimum necessary with the following service providers ("processors") who process data only to help us run Synapse:
      </p>
      <ul>
        <li><strong>Clerk</strong> (authentication) — <a href="https://clerk.com/privacy" target="_blank" rel="noopener noreferrer">clerk.com/privacy</a></li>
        <li><strong>Convex</strong> (database and real-time infrastructure) — <a href="https://www.convex.dev/legal/privacy" target="_blank" rel="noopener noreferrer">convex.dev/legal/privacy</a></li>
        <li><strong>Google Gemini</strong> (AI model inference) — messages are sent for processing; Google's paid API does not train on these inputs. <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">policies.google.com/privacy</a></li>
        <li><strong>Synapse Cortex</strong> — our own backend service that processes knowledge extraction. Open-source at <a href="https://github.com/juandastic/synapse-cortex" target="_blank" rel="noopener noreferrer">github.com/juandastic/synapse-cortex</a></li>
        <li><strong>PostHog</strong> (analytics) — <a href="https://posthog.com/privacy" target="_blank" rel="noopener noreferrer">posthog.com/privacy</a></li>
        <li><strong>Cloudflare R2</strong> (image storage) — <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noopener noreferrer">cloudflare.com/privacypolicy</a></li>
        <li><strong>Notion</strong> (only if you enable the Notion export feature; we send your knowledge graph using a token you provide) — <a href="https://www.notion.so/Privacy-Policy-3468d120cf614d4c9014c09f6adc9091" target="_blank" rel="noopener noreferrer">notion.so/privacy</a></li>
        <li><strong>Lemon Squeezy</strong> (web payments — they are the Merchant of Record) — <a href="https://www.lemonsqueezy.com/privacy" target="_blank" rel="noopener noreferrer">lemonsqueezy.com/privacy</a></li>
        <li><strong>RevenueCat + Apple/Google</strong> (mobile subscription processing) — <a href="https://www.revenuecat.com/privacy" target="_blank" rel="noopener noreferrer">revenuecat.com/privacy</a></li>
      </ul>
      <p><strong>We do not sell your personal information.</strong></p>
      <p>We may disclose information if required by law, to respond to lawful requests, to protect our rights, or to investigate abuse.</p>

      <h2>5. How your memory works</h2>
      <p>
        Synapse is different from a plain chat app. To personalize your experience, our backend analyzes your messages to extract facts, entities, and relationships, which are stored as a knowledge graph associated only with your account.
      </p>
      <p>You control your memory:</p>
      <ul>
        <li><strong>View and correct</strong> extracted facts via the Memory section of the app.</li>
        <li><strong>Delete specific threads</strong> to remove those conversations and their contribution to your graph.</li>
        <li><strong>Delete everything</strong> by deleting your account — this removes all your messages, images, and your entire knowledge graph.</li>
      </ul>
      <p>
        We don't share your knowledge graph with anyone except the service providers listed above who help us store or process it on your behalf.
      </p>

      <h2>6. How long we keep your information</h2>
      <ul>
        <li><strong>Messages and images</strong>: retained until you delete the thread or your account.</li>
        <li><strong>Knowledge graph</strong>: retained for the life of your account.</li>
        <li><strong>Analytics and logs</strong>: up to 24 months.</li>
        <li><strong>After account deletion</strong>: all personal information is removed within 30 days, including from backups.</li>
      </ul>

      <h2>7. Your rights and choices</h2>
      <p>Depending on where you live, you may have the right to:</p>
      <ul>
        <li>Access the information we have about you.</li>
        <li>Correct inaccurate information (you can do most of this directly from the Memory section).</li>
        <li>Delete your account and all associated data.</li>
        <li>Export your data in a machine-readable format.</li>
        <li>Object to or restrict certain processing.</li>
      </ul>
      <p>
        California residents have additional rights under CCPA/CPRA, including the right to know what personal information we have and the right to request deletion. We do not sell or share personal information for cross-context behavioral advertising.
      </p>
      <p>
        To exercise any of these rights, delete your account directly from Settings or write to us at <a href="mailto:juandastic@gmail.com">juandastic@gmail.com</a>. We'll respond within 30 days.
      </p>

      <h2>8. Children</h2>
      <p>
        Synapse is not intended for children under 13. You must be at least 13 years old to use Synapse. We don't knowingly collect information from children under 13. If you believe a child under 13 has created an account, please contact us and we'll remove it.
      </p>

      <h2>9. International users</h2>
      <p>
        Synapse is operated from Colombia, with infrastructure hosted primarily in the United States. If you use the service from outside those countries, your information will be transferred to and processed in those locations. Synapse is currently not available in the European Union, European Economic Area, or United Kingdom.
      </p>

      <h2>10. Security</h2>
      <p>
        We take reasonable steps to protect your information. Clerk handles password security; Convex and Cloudflare R2 encrypt data at rest; connections use TLS. No system is perfectly secure, and we can't guarantee absolute security, but we'll notify you promptly if we learn of a breach affecting your account.
      </p>

      <h2>11. Changes to this policy</h2>
      <p>
        We may update this Privacy Policy. When we make material changes, we'll notify you through the app and update the "Last updated" date above. Continued use of Synapse after changes means you accept the updated policy.
      </p>

      <h2>12. Contact</h2>
      <p>
        Questions about this Privacy Policy or your personal information?
      </p>
      <p>
        <strong>Juan David Gomez</strong> — <a href="mailto:juandastic@gmail.com">juandastic@gmail.com</a>
      </p>
    </>
  );
}

function PrivacyEs() {
  return (
    <>
      <h1>Política de Privacidad</h1>
      <div className="meta">Última actualización: {LAST_UPDATED}</div>

      <h2>1. Quiénes somos</h2>
      <p>
        Synapse Chat AI ("Synapse", "nosotros") es operado por Juan David Gomez, un individuo basado en Colombia. Puedes contactarnos en{" "}
        <a href="mailto:juandastic@gmail.com">juandastic@gmail.com</a>.
      </p>
      <p>
        Esta Política de Privacidad describe qué información personal recogemos cuando usas Synapse, cómo la usamos, con quién la compartimos, y tus opciones al respecto.
      </p>
      <p>
        Al usar Synapse, aceptas las prácticas descritas aquí. Si no estás de acuerdo, por favor no uses el servicio.
      </p>

      <h2>2. Información que recogemos</h2>
      <p>Cuando usas Synapse, recogemos:</p>
      <ul>
        <li><strong>Información de cuenta</strong> a través de nuestro proveedor de autenticación Clerk: tu email, nombre, y un identificador de cuenta.</li>
        <li><strong>Tus mensajes</strong>: el texto, imágenes y archivos que envías en conversaciones.</li>
        <li><strong>Conocimiento extraído de tus mensajes</strong>: para habilitar la función de memoria personalizada que hace útil a Synapse, nuestro backend extrae hechos, entidades y relaciones de tus conversaciones. Esto se almacena como un grafo de conocimiento privado asociado solo a tu cuenta.</li>
        <li><strong>Datos de uso</strong>: qué funciones usas, con qué frecuencia envías mensajes, preferencias de idioma, errores que encuentras.</li>
        <li><strong>Información de dispositivo y conexión</strong>: dirección IP, versión del navegador/app, sistema operativo, ubicación general (país/ciudad inferida del IP).</li>
      </ul>
      <p>
        No recogemos conscientemente información personal sensible a menos que elijas compartirla en una conversación. Si lo haces, se convierte en parte del grafo de conocimiento descrito arriba.
      </p>

      <h2>3. Cómo usamos tu información</h2>
      <ul>
        <li>Para proveer el servicio: ejecutar tus conversaciones, almacenar tu historial, personalizar respuestas usando tu grafo de conocimiento.</li>
        <li>Para mantener el servicio funcionando: depurar errores, prevenir abuso, hacer cumplir nuestros Términos.</li>
        <li>Para mejorar el servicio: analizar patrones agregados de uso.</li>
        <li>Para comunicarnos contigo: responder solicitudes de soporte, notificar cambios importantes.</li>
      </ul>
      <div className="callout">
        <strong>No usamos tu información personal ni tus mensajes para entrenar modelos de IA.</strong> Tus conversaciones son tuyas.
      </div>

      <h2>4. Con quién compartimos tu información</h2>
      <p>
        Compartimos lo mínimo necesario con los siguientes proveedores ("procesadores") que procesan datos solo para ayudarnos a operar Synapse:
      </p>
      <ul>
        <li><strong>Clerk</strong> (autenticación) — <a href="https://clerk.com/privacy" target="_blank" rel="noopener noreferrer">clerk.com/privacy</a></li>
        <li><strong>Convex</strong> (base de datos e infraestructura en tiempo real) — <a href="https://www.convex.dev/legal/privacy" target="_blank" rel="noopener noreferrer">convex.dev/legal/privacy</a></li>
        <li><strong>Google Gemini</strong> (inferencia de modelo IA) — los mensajes se envían para procesamiento; la API de pago de Google no entrena con estos inputs. <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">policies.google.com/privacy</a></li>
        <li><strong>Synapse Cortex</strong> — nuestro propio backend que procesa la extracción de conocimiento. Código abierto en <a href="https://github.com/juandastic/synapse-cortex" target="_blank" rel="noopener noreferrer">github.com/juandastic/synapse-cortex</a></li>
        <li><strong>PostHog</strong> (analítica) — <a href="https://posthog.com/privacy" target="_blank" rel="noopener noreferrer">posthog.com/privacy</a></li>
        <li><strong>Cloudflare R2</strong> (almacenamiento de imágenes) — <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noopener noreferrer">cloudflare.com/privacypolicy</a></li>
        <li><strong>Notion</strong> (solo si habilitas la función de exportación a Notion; enviamos tu grafo usando un token que tú provees) — <a href="https://www.notion.so/Privacy-Policy-3468d120cf614d4c9014c09f6adc9091" target="_blank" rel="noopener noreferrer">notion.so/privacy</a></li>
        <li><strong>Lemon Squeezy</strong> (pagos web — ellos son el Comerciante Registrado) — <a href="https://www.lemonsqueezy.com/privacy" target="_blank" rel="noopener noreferrer">lemonsqueezy.com/privacy</a></li>
        <li><strong>RevenueCat + Apple/Google</strong> (procesamiento de suscripciones en móvil) — <a href="https://www.revenuecat.com/privacy" target="_blank" rel="noopener noreferrer">revenuecat.com/privacy</a></li>
      </ul>
      <p><strong>No vendemos tu información personal.</strong></p>
      <p>
        Podemos divulgar información si así lo requiere la ley, para responder a solicitudes legítimas, proteger nuestros derechos, o investigar abusos.
      </p>

      <h2>5. Cómo funciona tu memoria</h2>
      <p>
        Synapse es diferente a una app de chat común. Para personalizar tu experiencia, nuestro backend analiza tus mensajes para extraer hechos, entidades y relaciones, que se almacenan como un grafo de conocimiento asociado solo a tu cuenta.
      </p>
      <p>Tú controlas tu memoria:</p>
      <ul>
        <li><strong>Ver y corregir</strong> hechos extraídos desde la sección Memoria de la app.</li>
        <li><strong>Eliminar hilos específicos</strong> para remover esas conversaciones y su contribución a tu grafo.</li>
        <li><strong>Eliminar todo</strong> eliminando tu cuenta — esto borra todos tus mensajes, imágenes y tu grafo de conocimiento completo.</li>
      </ul>
      <p>
        No compartimos tu grafo de conocimiento con nadie excepto los proveedores listados arriba que nos ayudan a almacenarlo o procesarlo en tu nombre.
      </p>

      <h2>6. Cuánto tiempo guardamos tu información</h2>
      <ul>
        <li><strong>Mensajes e imágenes</strong>: retenidos hasta que elimines el hilo o tu cuenta.</li>
        <li><strong>Grafo de conocimiento</strong>: retenido por la vida de tu cuenta.</li>
        <li><strong>Analítica y logs</strong>: hasta 24 meses.</li>
        <li><strong>Después de eliminar la cuenta</strong>: toda la información personal se remueve en 30 días, incluyendo de backups.</li>
      </ul>

      <h2>7. Tus derechos y opciones</h2>
      <p>Dependiendo de dónde vivas, puedes tener el derecho de:</p>
      <ul>
        <li>Acceder a la información que tenemos sobre ti.</li>
        <li>Corregir información inexacta (puedes hacer la mayoría de esto directamente desde la sección Memoria).</li>
        <li>Eliminar tu cuenta y todos los datos asociados.</li>
        <li>Exportar tus datos en formato legible por máquina.</li>
        <li>Oponerte o restringir ciertos procesamientos.</li>
      </ul>
      <p>
        Los residentes de California tienen derechos adicionales bajo CCPA/CPRA, incluyendo el derecho a saber qué información personal tenemos y el derecho a solicitar eliminación. No vendemos ni compartimos información personal para publicidad comportamental cross-context.
      </p>
      <p>
        Para ejercer cualquiera de estos derechos, elimina tu cuenta directamente desde Ajustes o escríbenos a <a href="mailto:juandastic@gmail.com">juandastic@gmail.com</a>. Responderemos en 30 días.
      </p>

      <h2>8. Niños</h2>
      <p>
        Synapse no está destinada a niños menores de 13 años. Debes tener al menos 13 años para usar Synapse. No recogemos conscientemente información de niños menores de 13. Si crees que un niño menor de 13 ha creado una cuenta, por favor contáctanos y la removeremos.
      </p>

      <h2>9. Usuarios internacionales</h2>
      <p>
        Synapse se opera desde Colombia, con infraestructura alojada principalmente en Estados Unidos. Si usas el servicio desde fuera de esos países, tu información será transferida y procesada en esas ubicaciones. Synapse actualmente no está disponible en la Unión Europea, el Espacio Económico Europeo, ni el Reino Unido.
      </p>

      <h2>10. Seguridad</h2>
      <p>
        Tomamos medidas razonables para proteger tu información. Clerk maneja la seguridad de contraseñas; Convex y Cloudflare R2 cifran datos en reposo; las conexiones usan TLS. Ningún sistema es perfectamente seguro, y no podemos garantizar seguridad absoluta, pero te notificaremos pronto si descubrimos una brecha que afecte tu cuenta.
      </p>

      <h2>11. Cambios a esta política</h2>
      <p>
        Podemos actualizar esta Política de Privacidad. Cuando hagamos cambios materiales, te notificaremos a través de la app y actualizaremos la fecha de "Última actualización" arriba. El uso continuado de Synapse después de los cambios significa que aceptas la política actualizada.
      </p>

      <h2>12. Contacto</h2>
      <p>¿Preguntas sobre esta Política de Privacidad o tu información personal?</p>
      <p>
        <strong>Juan David Gomez</strong> — <a href="mailto:juandastic@gmail.com">juandastic@gmail.com</a>
      </p>
    </>
  );
}
