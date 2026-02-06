import { useQuery } from "convex/react";
import { useNavigate } from "react-router-dom";
import { UserButton } from "@clerk/clerk-react";
import { api } from "../../../convex/_generated/api";
import { ThreadItem } from "./ThreadItem";
import { Plus, Settings } from "lucide-react";

interface SidebarProps {
  onCloseMobile: () => void;
}

export function Sidebar({ onCloseMobile }: SidebarProps) {
  const threads = useQuery(api.threads.list);
  const navigate = useNavigate();

  const handleNewChat = () => {
    navigate("/");
    onCloseMobile();
  };

  const handleSettings = () => {
    navigate("/settings/personas");
    onCloseMobile();
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border/50 px-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-accent/20">
            <svg viewBox="0 0 100 100" className="h-4 w-4">
              <path
                d="M30 50 Q50 25 70 50 Q50 75 30 50"
                fill="none"
                stroke="currentColor"
                strokeWidth="5"
                strokeLinecap="round"
                className="text-primary"
              />
              <circle cx="50" cy="50" r="8" className="fill-primary" />
            </svg>
          </div>
          <span className="font-display text-base font-semibold tracking-tight">
            Synapse
          </span>
        </div>

        <button
          onClick={handleNewChat}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
          aria-label="New chat"
        >
          <Plus className="h-4.5 w-4.5" />
        </button>
      </div>

      {/* Thread list */}
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
              Click + to start one
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
              />
            ))}
          </nav>
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t border-border/50 px-4 py-3">
        <div className="flex items-center justify-between">
          <UserButton
            appearance={{
              elements: {
                avatarBox: "h-7 w-7",
              },
            }}
          />
          <button
            onClick={handleSettings}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Settings"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
