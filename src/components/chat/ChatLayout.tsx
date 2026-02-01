import { UserButton } from "@clerk/clerk-react";
import { MessageList } from "./MessageList";
import { ChatInput } from "./ChatInput";
import { ChatProvider } from "@/contexts/ChatContext";

export function ChatLayout() {
  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border/50 px-4">
        <div className="flex items-center gap-3">
          {/* Logo */}
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-accent/20">
            <svg viewBox="0 0 100 100" className="h-5 w-5">
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
          <span className="font-display text-lg font-medium tracking-tight">
            Synapse
          </span>
        </div>
        
        <UserButton
          appearance={{
            elements: {
              avatarBox: "h-8 w-8",
            },
          }}
        />
      </header>

      <ChatProvider>
        {/* Messages area */}
        <div className="flex-1 overflow-hidden">
          <MessageList />
        </div>

        {/* Input area */}
        <div className="shrink-0 border-t border-border/50 bg-background/80 backdrop-blur-sm">
          <ChatInput />
        </div>
      </ChatProvider>
    </div>
  );
}
