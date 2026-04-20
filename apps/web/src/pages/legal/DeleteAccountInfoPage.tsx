import { useTranslation } from "react-i18next";
import { LegalLayout } from "./LegalLayout";

export function DeleteAccountInfoPage() {
  const { i18n } = useTranslation();
  const isEs = i18n.language === "es";

  return (
    <LegalLayout>{isEs ? <DeleteAccountEs /> : <DeleteAccountEn />}</LegalLayout>
  );
}

function DeleteAccountEn() {
  return (
    <>
      <h1>How to delete your Synapse account</h1>
      <p>
        You can delete your account and all associated data directly from within Synapse. Here's how.
      </p>

      <h2>From the web app</h2>
      <ul>
        <li>Go to <a href="https://synapse-chat.juandago.dev/">synapse-chat.juandago.dev</a> and sign in.</li>
        <li>Click your profile → <strong>Settings</strong> → <strong>Account</strong>.</li>
        <li>Click <strong>Delete my account</strong>.</li>
        <li>Confirm.</li>
      </ul>

      <h2>From the mobile app</h2>
      <ul>
        <li>Open Synapse on your phone.</li>
        <li>Tap the menu → <strong>Settings</strong>.</li>
        <li>Tap <strong>Delete my account</strong>.</li>
        <li>Confirm.</li>
      </ul>

      <h2>What happens next</h2>
      <p>Your account will be fully deleted within <strong>30 days</strong>, including:</p>
      <ul>
        <li>Your messages, threads, and uploaded images</li>
        <li>Your knowledge graph (the personalized memory Synapse built from your conversations)</li>
        <li>Your account information and preferences</li>
        <li>Your analytics data associated with your account</li>
      </ul>
      <p>After deletion, none of your data will be recoverable.</p>

      <h2>If you can't access the app</h2>
      <p>
        Write to <a href="mailto:juandastic@gmail.com?subject=Delete%20my%20account">juandastic@gmail.com</a> from the email address associated with your account, with the subject line "Delete my account". We'll process the request within 30 days.
      </p>

      <h2>Questions</h2>
      <p>
        See our <a href="/privacy">Privacy Policy</a> for the full picture of what data we store and your rights regarding it.
      </p>
    </>
  );
}

function DeleteAccountEs() {
  return (
    <>
      <h1>Cómo eliminar tu cuenta de Synapse</h1>
      <p>
        Puedes eliminar tu cuenta y todos los datos asociados directamente desde Synapse. Así:
      </p>

      <h2>Desde la web</h2>
      <ul>
        <li>Entra a <a href="https://synapse-chat.juandago.dev/">synapse-chat.juandago.dev</a> e inicia sesión.</li>
        <li>Click en tu perfil → <strong>Ajustes</strong> → <strong>Cuenta</strong>.</li>
        <li>Click en <strong>Eliminar mi cuenta</strong>.</li>
        <li>Confirma.</li>
      </ul>

      <h2>Desde la app móvil</h2>
      <ul>
        <li>Abre Synapse en tu teléfono.</li>
        <li>Toca el menú → <strong>Ajustes</strong>.</li>
        <li>Toca <strong>Eliminar mi cuenta</strong>.</li>
        <li>Confirma.</li>
      </ul>

      <h2>Qué pasa después</h2>
      <p>Tu cuenta se eliminará completamente dentro de <strong>30 días</strong>, incluyendo:</p>
      <ul>
        <li>Tus mensajes, hilos e imágenes subidas</li>
        <li>Tu grafo de conocimiento (la memoria personalizada que Synapse construyó de tus conversaciones)</li>
        <li>La información y preferencias de tu cuenta</li>
        <li>Los datos de analítica asociados a tu cuenta</li>
      </ul>
      <p>Después de la eliminación, ninguno de tus datos será recuperable.</p>

      <h2>Si no puedes acceder a la app</h2>
      <p>
        Escribe a <a href="mailto:juandastic@gmail.com?subject=Eliminar%20mi%20cuenta">juandastic@gmail.com</a> desde el email asociado a tu cuenta, con el asunto "Eliminar mi cuenta". Procesaremos la solicitud dentro de 30 días.
      </p>

      <h2>Preguntas</h2>
      <p>
        Ver nuestra <a href="/privacy">Política de Privacidad</a> para el detalle completo de qué datos almacenamos y tus derechos al respecto.
      </p>
    </>
  );
}
