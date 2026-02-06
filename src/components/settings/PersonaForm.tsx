import { useState, useTransition, useCallback, FormEvent } from "react";
import { cn } from "@/lib/utils";
import { EmojiPicker } from "./EmojiPicker";

interface PersonaFormData {
  name: string;
  icon: string;
  language: string;
  description: string;
  systemPrompt: string;
}

interface PersonaFormProps {
  initialData?: Partial<PersonaFormData>;
  onSubmit: (data: PersonaFormData) => Promise<void>;
  onCancel: () => void;
  submitLabel?: string;
}

const LANGUAGE_OPTIONS = [
  "English",
  "Español",
  "Français",
  "Deutsch",
  "Português",
  "日本語",
  "中文",
  "한국어",
];

/**
 * Reusable form for creating/editing personas.
 * Uses useTransition for non-blocking submit (per React best practices).
 */
export function PersonaForm({
  initialData,
  onSubmit,
  onCancel,
  submitLabel = "Save",
}: PersonaFormProps) {
  const [name, setName] = useState(initialData?.name ?? "");
  const [icon, setIcon] = useState(initialData?.icon ?? "🤖");
  const [language, setLanguage] = useState(initialData?.language ?? "English");
  const [description, setDescription] = useState(
    initialData?.description ?? ""
  );
  const [systemPrompt, setSystemPrompt] = useState(
    initialData?.systemPrompt ?? ""
  );
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      setError(null);

      const trimmedName = name.trim();
      const trimmedPrompt = systemPrompt.trim();
      const trimmedIcon = icon.trim();

      if (!trimmedName) {
        setError("Name is required");
        return;
      }
      if (!trimmedPrompt) {
        setError("System prompt is required");
        return;
      }
      if (!trimmedIcon) {
        setError("Icon is required");
        return;
      }

      startTransition(async () => {
        try {
          await onSubmit({
            name: trimmedName,
            icon: trimmedIcon,
            language,
            description: description.trim(),
            systemPrompt: trimmedPrompt,
          });
        } catch (err) {
          setError(err instanceof Error ? err.message : "Something went wrong");
        }
      });
    },
    [name, icon, language, description, systemPrompt, onSubmit]
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Name and Icon row */}
      <div className="flex gap-3">
        <div className="w-20">
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            Icon
          </label>
          <EmojiPicker value={icon} onChange={setIcon} />
        </div>
        <div className="flex-1">
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., My Therapist"
            className="h-10 w-full rounded-lg border border-border/50 bg-card px-3 text-sm focus:border-primary/30 focus:outline-none focus:ring-2 focus:ring-ring/20"
            maxLength={100}
          />
        </div>
      </div>

      {/* Language */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
          Language
        </label>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="h-10 w-full rounded-lg border border-border/50 bg-card px-3 text-sm focus:border-primary/30 focus:outline-none focus:ring-2 focus:ring-ring/20"
        >
          {LANGUAGE_OPTIONS.map((lang) => (
            <option key={lang} value={lang}>
              {lang}
            </option>
          ))}
        </select>
      </div>

      {/* Description */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
          Description
          <span className="ml-1 text-muted-foreground/50">(optional)</span>
        </label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Short description of what this persona does"
          className="h-10 w-full rounded-lg border border-border/50 bg-card px-3 text-sm focus:border-primary/30 focus:outline-none focus:ring-2 focus:ring-ring/20"
          maxLength={500}
        />
      </div>

      {/* System Prompt */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
          System Prompt
        </label>
        <textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          placeholder="Instructions for the AI persona..."
          rows={8}
          className="w-full rounded-lg border border-border/50 bg-card px-3 py-2.5 font-mono text-sm leading-relaxed focus:border-primary/30 focus:outline-none focus:ring-2 focus:ring-ring/20"
          maxLength={10000}
        />
        <p className="mt-1 text-xs text-muted-foreground/50">
          {systemPrompt.length}/10,000 characters
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={isPending}
          className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isPending}
          className={cn(
            "inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-all",
            "hover:bg-primary/90 active:scale-[0.98]",
            "disabled:pointer-events-none disabled:opacity-50"
          )}
        >
          {isPending && (
            <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
          )}
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
