import { Toaster as SonnerToaster } from "sonner";

/**
 * Pre-configured Sonner toast provider.
 * Uses the app's warm theme via CSS variables.
 * Mounted at the app root in App.tsx.
 */
export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      toastOptions={{
        className:
          "!bg-card !text-card-foreground !border-border/50 !shadow-md",
        descriptionClassName: "!text-muted-foreground",
      }}
    />
  );
}
