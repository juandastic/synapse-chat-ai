import { useClerk } from "@clerk/clerk-react";
import { X } from "lucide-react";
import { useState } from "react";

/**
 * Persistent banner shown to demo account users.
 * Displays a CTA to sign up for their own account.
 * Dismissible per session (reappears on reload).
 */
export function DemoBanner() {
  const { signOut, openSignUp } = useClerk();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const handleSignUp = async () => {
    await signOut();
    openSignUp();
  };

  return (
    <div className="relative flex items-center justify-center gap-3 bg-primary/10 px-4 py-2 text-sm">
      <span className="text-foreground/80">
        You're exploring a demo account
      </span>
      <button
        onClick={handleSignUp}
        className="rounded-full bg-primary px-4 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Sign up for your own
      </button>
      <button
        onClick={() => setDismissed(true)}
        className="absolute right-2 flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Dismiss banner"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
