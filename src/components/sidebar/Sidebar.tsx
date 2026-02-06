import { useState, useCallback, useTransition } from "react";
import { useQuery, useMutation } from "convex/react";
import { useNavigate, useLocation } from "react-router-dom";
import { UserButton } from "@clerk/clerk-react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { ThreadItem } from "./ThreadItem";
import { ConfirmDialog } from "../ui/confirm-dialog";
import { Plus, Settings, Brain } from "lucide-react";

interface SidebarProps {
  onCloseMobile: () => void;
}

type DeleteDialogState =
  | { type: "closed" }
  | { type: "confirm"; threadId: Id<"threads">; threadTitle: string };

export function Sidebar({ onCloseMobile }: SidebarProps) {
  const threads = useQuery(api.threads.list);
  const removeThread = useMutation(api.threads.remove);
  const navigate = useNavigate();
  const location = useLocation();

  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState>({
    type: "closed",
  });
  const [deletePending, startDeleteTransition] = useTransition();

  const handleNewChat = () => {
    navigate("/");
    onCloseMobile();
  };

  const handleSettings = () => {
    navigate("/settings/personas");
    onCloseMobile();
  };

  const handleMemory = () => {
    navigate("/memory");
    onCloseMobile();
  };

  /** Open the delete confirmation dialog */
  const handleDeleteClick = useCallback(
    (threadId: string, threadTitle: string) => {
      setDeleteDialog({
        type: "confirm",
        threadId: threadId as Id<"threads">,
        threadTitle,
      });
    },
    []
  );

  /** Execute the thread deletion after confirmation */
  const handleDeleteConfirm = useCallback(() => {
    if (deleteDialog.type !== "confirm") return;
    const { threadId } = deleteDialog;

    startDeleteTransition(async () => {
      try {
        await removeThread({ threadId });
        setDeleteDialog({ type: "closed" });

        // If we're viewing the thread being deleted, navigate away
        if (location.pathname === `/t/${threadId}`) {
          navigate("/");
        }
      } catch {
        // The mutation validates ownership; if it fails, just close
        setDeleteDialog({ type: "closed" });
      }
    });
  }, [deleteDialog, removeThread, location.pathname, navigate]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex h-14 shrink-0 items-center gap-2.5 px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary/15 to-accent/15">
          <svg viewBox="0 0 100 100" className="h-5 w-5">
            <path d="M50 46 Q63 30 74 24" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" className="text-primary" />
            <path d="M50 46 Q32 32 22 34" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" className="text-primary" opacity="0.7" />
            <path d="M50 46 Q54 64 58 76" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" className="text-primary" opacity="0.75" />
            <circle cx="74" cy="24" r="7" className="fill-primary" />
            <circle cx="22" cy="34" r="6" className="fill-primary" opacity="0.7" />
            <circle cx="58" cy="76" r="6.5" className="fill-primary" opacity="0.85" />
            <circle cx="50" cy="46" r="10" className="fill-primary" />
          </svg>
        </div>
        <span className="font-display text-base font-semibold tracking-tight">
          Synapse
        </span>
      </div>

      {/* Navigation actions */}
      <nav className="shrink-0 space-y-0.5 px-2 pb-2">
        <SidebarButton
          icon={<Plus className="h-4 w-4" />}
          label="New chat"
          onClick={handleNewChat}
        />
        <SidebarButton
          icon={<Brain className="h-4 w-4" />}
          label="Memory"
          onClick={handleMemory}
          active={location.pathname === "/memory"}
        />
        <SidebarButton
          icon={<Settings className="h-4 w-4" />}
          label="Personas"
          onClick={handleSettings}
          active={location.pathname === "/settings/personas"}
        />
      </nav>

      {/* Divider + thread list */}
      <div className="mx-3 border-t border-border/50" />

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {threads === undefined ? (
          // Loading skeleton
          <div className="space-y-1.5 px-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl px-3 py-2.5">
                <div className="h-6 w-6 animate-pulse rounded-full bg-muted" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 w-3/4 animate-pulse rounded bg-muted" />
                  <div className="h-2.5 w-1/3 animate-pulse rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        ) : threads.length === 0 ? (
          // Empty state
          <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
            <div className="mb-3 rounded-full bg-muted/50 p-3">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5 text-muted-foreground/50"
              >
                <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <p className="text-xs text-muted-foreground/60">No conversations yet</p>
            <p className="mt-1 text-xs text-muted-foreground/40">
              Start a new chat above
            </p>
          </div>
        ) : (
          // Thread list
          <nav className="space-y-0.5" onClick={onCloseMobile}>
            {threads.map((thread) => (
              <ThreadItem
                key={thread._id}
                threadId={thread._id}
                title={thread.title}
                personaIcon={thread.persona.icon}
                lastMessageAt={thread.lastMessageAt}
                onDelete={handleDeleteClick}
              />
            ))}
          </nav>
        )}
      </div>

      {/* Footer — user avatar only */}
      <div className="shrink-0 border-t border-border/50 px-4 py-3">
        <UserButton
          appearance={{
            elements: {
              avatarBox: "h-7 w-7",
            },
          }}
        />
      </div>

      {/* Thread delete confirmation dialog */}
      <ConfirmDialog
        open={deleteDialog.type === "confirm"}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteDialog({ type: "closed" })}
        title={
          deleteDialog.type === "confirm"
            ? `Delete "${deleteDialog.threadTitle}"?`
            : ""
        }
        description="All messages in this thread will be permanently deleted. This action cannot be undone."
        hint="What Synapse learned from these conversations remains stored in memory and will continue to enrich future sessions."
        confirmLabel="Delete Thread"
        cancelLabel="Cancel"
        variant="danger"
        loading={deletePending}
      />
    </div>
  );
}

// =============================================================================
// SidebarButton
// =============================================================================

function SidebarButton({
  icon,
  label,
  onClick,
  active = false,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors
        ${
          active
            ? "bg-primary/10 font-medium text-primary"
            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
        }
      `}
    >
      <span className="shrink-0">{icon}</span>
      {label}
    </button>
  );
}
