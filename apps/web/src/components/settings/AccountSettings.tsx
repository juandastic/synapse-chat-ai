import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUser } from "@clerk/clerk-react";
import { useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { api } from "@synapse/backend/api";
import { ArrowLeft, Trash2 } from "lucide-react";
import { DeleteAccountModal } from "./DeleteAccountModal";
import { useIsDemoUser } from "../layout/AppLayout";

export function AccountSettings() {
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const { user } = useUser();
  const convexUser = useQuery(api.users.me);
  const isDemoUser = useIsDemoUser();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const isEs = i18n.language === "es";
  const email = user?.primaryEmailAddress?.emailAddress ?? "—";

  return (
    <div className="mx-auto h-full w-full max-w-3xl overflow-y-auto px-6 py-8">
      <button
        onClick={() => navigate(-1)}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {isEs ? "Volver" : "Back"}
      </button>

      <h1 className="text-2xl font-semibold tracking-tight">
        {isEs ? "Cuenta" : "Account"}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {isEs
          ? "Administra la información de tu cuenta y acciones de datos."
          : "Manage your account information and data actions."}
      </p>

      {/* Profile section */}
      <section className="mt-8 rounded-2xl border border-border/50 bg-card p-5">
        <h2 className="text-base font-semibold">
          {isEs ? "Perfil" : "Profile"}
        </h2>
        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">
              {isEs ? "Email" : "Email"}
            </dt>
            <dd className="text-right">{email}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">
              {isEs ? "Nombre" : "Name"}
            </dt>
            <dd className="text-right">{convexUser?.name ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">
              {isEs ? "Plan" : "Plan"}
            </dt>
            <dd className="text-right capitalize">
              {convexUser?.plan ?? "free"}
            </dd>
          </div>
        </dl>
      </section>

      {/* Legal links section */}
      <section className="mt-6 rounded-2xl border border-border/50 bg-card p-5">
        <h2 className="text-base font-semibold">
          {isEs ? "Legal" : "Legal"}
        </h2>
        <div className="mt-3 flex flex-col gap-2 text-sm">
          <a
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline-offset-4 hover:underline"
          >
            {isEs ? "Política de Privacidad" : "Privacy Policy"}
          </a>
          <a
            href="/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline-offset-4 hover:underline"
          >
            {isEs ? "Términos de Servicio" : "Terms of Service"}
          </a>
        </div>
      </section>

      {/* Danger zone */}
      <section className="mt-6 rounded-2xl border border-destructive/30 bg-card p-5">
        <h2 className="text-base font-semibold text-destructive">
          {isEs ? "Zona peligrosa" : "Danger zone"}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {isEs
            ? "Eliminar tu cuenta es permanente. Todos tus hilos, mensajes, imágenes, y grafo de memoria se eliminarán dentro de 30 días."
            : "Deleting your account is permanent. All your threads, messages, images, and memory graph will be removed within 30 days."}
        </p>
        <button
          onClick={() => setDeleteOpen(true)}
          disabled={isDemoUser}
          className="mt-4 inline-flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
          title={
            isDemoUser
              ? isEs
                ? "No disponible en modo demo"
                : "Not available in demo mode"
              : undefined
          }
        >
          <Trash2 className="h-4 w-4" />
          {isEs ? "Eliminar mi cuenta" : "Delete my account"}
        </button>
      </section>

      <DeleteAccountModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
      />
    </div>
  );
}
