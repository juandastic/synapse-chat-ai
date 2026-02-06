import { useState, useTransition, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { useNavigate } from "react-router-dom";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { PersonaForm } from "./PersonaForm";
import { ConfirmDialog } from "../ui/confirm-dialog";
import { cn } from "@/lib/utils";
import { ArrowLeft, Pencil, Trash2, Plus } from "lucide-react";

type ViewState =
  | { mode: "list" }
  | { mode: "create" }
  | { mode: "edit"; personaId: Id<"personas"> };

/** State for the delete-persona confirmation / error dialogs */
type DeleteDialogState =
  | { type: "closed" }
  | { type: "confirm"; personaId: Id<"personas">; personaName: string }
  | { type: "error"; message: string };

/**
 * Persona management settings page.
 * Lists user's personas with edit/delete actions and a create form.
 */
export function PersonaSettings() {
  const navigate = useNavigate();
  const personas = useQuery(api.personas.list);
  const createPersona = useMutation(api.personas.create);
  const updatePersona = useMutation(api.personas.update);
  const removePersona = useMutation(api.personas.remove);

  const [view, setView] = useState<ViewState>({ mode: "list" });
  const [deletePending, startDeleteTransition] = useTransition();
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState>({
    type: "closed",
  });

  const editingPersona =
    view.mode === "edit" && personas
      ? personas.find((p) => p._id === view.personaId)
      : null;

  const handleCreate = useCallback(
    async (data: {
      name: string;
      icon: string;
      language: string;
      description: string;
      systemPrompt: string;
    }) => {
      await createPersona({
        name: data.name,
        icon: data.icon,
        language: data.language,
        description: data.description || undefined,
        systemPrompt: data.systemPrompt,
      });
      setView({ mode: "list" });
    },
    [createPersona]
  );

  const handleUpdate = useCallback(
    async (data: {
      name: string;
      icon: string;
      language: string;
      description: string;
      systemPrompt: string;
    }) => {
      if (view.mode !== "edit") return;
      await updatePersona({
        id: view.personaId,
        name: data.name,
        icon: data.icon,
        language: data.language,
        description: data.description || undefined,
        systemPrompt: data.systemPrompt,
      });
      setView({ mode: "list" });
    },
    [updatePersona, view]
  );

  /** Open the confirm dialog before deleting */
  const handleDeleteClick = useCallback(
    (personaId: Id<"personas">, personaName: string) => {
      setDeleteDialog({ type: "confirm", personaId, personaName });
    },
    []
  );

  /** Actually execute the deletion after confirmation */
  const handleDeleteConfirm = useCallback(() => {
    if (deleteDialog.type !== "confirm") return;
    const { personaId } = deleteDialog;
    startDeleteTransition(async () => {
      try {
        await removePersona({ id: personaId });
        setDeleteDialog({ type: "closed" });
      } catch (err) {
        const raw =
          err instanceof Error ? err.message : "Failed to delete persona";

        // Friendly message when threads still reference this persona
        if (raw.includes("thread")) {
          setDeleteDialog({
            type: "error",
            message:
              "This persona is being used by one or more threads.\n\nTo delete it, first delete the threads that use this persona from the sidebar, then try again.",
          });
        } else {
          setDeleteDialog({ type: "error", message: raw });
        }
      }
    });
  }, [deleteDialog, removePersona]);

  // Show create/edit form
  if (view.mode === "create") {
    return (
      <SettingsShell
        title="Create Persona"
        onBack={() => setView({ mode: "list" })}
      >
        <PersonaForm
          onSubmit={handleCreate}
          onCancel={() => setView({ mode: "list" })}
          submitLabel="Create"
        />
      </SettingsShell>
    );
  }

  if (view.mode === "edit" && editingPersona) {
    return (
      <SettingsShell
        title="Edit Persona"
        onBack={() => setView({ mode: "list" })}
      >
        <PersonaForm
          initialData={{
            name: editingPersona.name,
            icon: editingPersona.icon,
            language: editingPersona.language,
            description: editingPersona.description ?? "",
            systemPrompt: editingPersona.systemPrompt,
          }}
          onSubmit={handleUpdate}
          onCancel={() => setView({ mode: "list" })}
          submitLabel="Save Changes"
        />
      </SettingsShell>
    );
  }

  // List view
  return (
    <SettingsShell title="Personas" onBack={() => navigate("/")}>
      {/* Create button */}
      <button
        onClick={() => setView({ mode: "create" })}
        className={cn(
          "mb-6 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border/50 px-4 py-3 text-sm font-medium text-muted-foreground transition-all",
          "hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
        )}
      >
        <Plus className="h-4 w-4" />
        Create New Persona
      </button>

      {/* Loading state */}
      {personas === undefined && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-xl bg-muted/50"
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {personas && personas.length === 0 && (
        <div className="py-12 text-center">
          <p className="text-sm text-muted-foreground">
            No custom personas yet. Create one or use a template from the new
            chat screen.
          </p>
        </div>
      )}

      {/* Persona list */}
      {personas && personas.length > 0 && (
        <div className="space-y-2">
          {personas.map((persona) => (
            <div
              key={persona._id}
              className="flex items-center gap-4 rounded-xl border border-border/50 bg-card px-4 py-3 transition-colors hover:border-border"
            >
              <span className="shrink-0 text-2xl" role="img" aria-hidden="true">
                {persona.icon}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {persona.name}
                  </p>
                  {persona.isDefault && (
                    <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                      Default
                    </span>
                  )}
                </div>
                {persona.description && (
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {persona.description}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  onClick={() =>
                    setView({ mode: "edit", personaId: persona._id })
                  }
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label={`Edit ${persona.name}`}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() =>
                    handleDeleteClick(persona._id, persona.name)
                  }
                  disabled={deletePending}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                  aria-label={`Delete ${persona.name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {/* Delete confirmation dialog */}
      <ConfirmDialog
        open={deleteDialog.type === "confirm"}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteDialog({ type: "closed" })}
        title={
          deleteDialog.type === "confirm"
            ? `Delete "${deleteDialog.personaName}"?`
            : ""
        }
        description="This persona will be permanently deleted. This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        loading={deletePending}
      />

      {/* Error dialog (e.g. persona has threads) */}
      <ConfirmDialog
        open={deleteDialog.type === "error"}
        onConfirm={() => setDeleteDialog({ type: "closed" })}
        onCancel={() => setDeleteDialog({ type: "closed" })}
        title="Cannot delete persona"
        description={
          deleteDialog.type === "error" ? deleteDialog.message : ""
        }
        confirmLabel="Understood"
        cancelLabel="Close"
        variant="info"
      />
    </SettingsShell>
  );
}

// =============================================================================
// SettingsShell
// =============================================================================

function SettingsShell({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border/50 px-4">
        <button
          onClick={onBack}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Go back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="font-display text-sm font-semibold tracking-tight text-foreground">
          {title}
        </h1>
      </header>

      {/* Content */}
      <div className="mx-auto w-full max-w-xl px-6 py-8">{children}</div>
    </div>
  );
}
