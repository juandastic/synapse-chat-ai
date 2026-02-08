import { SignInButton, SignedIn, SignedOut } from "@clerk/clerk-react";
import { Routes, Route } from "react-router-dom";
import { AppLayout } from "./components/layout/AppLayout";
import { PersonaSelector } from "./components/chat/PersonaSelector";
import { ChatView } from "./components/chat/ChatView";
import { PersonaSettings } from "./components/settings/PersonaSettings";
import { MemoryExplorer } from "./components/memory/MemoryExplorer";
import { Toaster } from "./components/ui/sonner";
import { Logo } from "./components/ui/logo";

function App() {
  return (
    <div className="h-screen w-screen overflow-hidden bg-background">
      <SignedOut>
        <LandingPage />
      </SignedOut>
      <SignedIn>
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<PersonaSelector />} />
            <Route path="t/:threadId" element={<ChatView />} />
            <Route path="settings/personas" element={<PersonaSettings />} />
            <Route path="memory" element={<MemoryExplorer />} />
          </Route>
        </Routes>
      </SignedIn>
      <Toaster />
    </div>
  );
}

function LandingPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6">
      {/* Subtle background gradient */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-primary/[0.02] to-transparent" />

      <div className="relative z-10 max-w-md text-center">
        {/* Logo mark */}
        <div className="mx-auto mb-8 h-28 w-28 rounded-full bg-gradient-to-br from-primary/10 to-accent/10 p-4">
          <Logo />
        </div>

        <h1 className="font-display text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
          Synapse
        </h1>

        <p className="mt-4 text-lg text-muted-foreground text-balance">
          A continuous conversation that remembers you. Deep memory, always
          present.
        </p>

        <div className="mt-10">
          <SignInButton mode="modal">
            <button className="group relative inline-flex items-center justify-center gap-2 rounded-full bg-primary px-8 py-3 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
              Begin your journey
              <svg
                className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13 7l5 5m0 0l-5 5m5-5H6"
                />
              </svg>
            </button>
          </SignInButton>
        </div>

        <p className="mt-6 text-xs text-muted-foreground/60">
          Your conversations are private and encrypted
        </p>
      </div>
    </div>
  );
}

export default App;
