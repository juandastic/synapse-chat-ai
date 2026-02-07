import { SignInButton, SignedIn, SignedOut } from "@clerk/clerk-react";
import { Routes, Route } from "react-router-dom";
import { AppLayout } from "./components/layout/AppLayout";
import { PersonaSelector } from "./components/chat/PersonaSelector";
import { ChatView } from "./components/chat/ChatView";
import { PersonaSettings } from "./components/settings/PersonaSettings";
import { MemoryExplorer } from "./components/memory/MemoryExplorer";
import { Toaster } from "./components/ui/sonner";

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
          <svg viewBox="0 0 100 100" className="h-full w-full">
            {/* Synaptic connections */}
            <path d="M50 46 Q63 30 74 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" className="text-primary" />
            <path d="M50 46 Q32 32 22 34" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" className="text-primary" opacity="0.7" />
            <path d="M50 46 Q54 64 58 76" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" className="text-primary" opacity="0.75" />
            {/* Inter-node arcs */}
            <path d="M74 24 Q84 50 58 76" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-primary" opacity="0.2" />
            <path d="M22 34 Q22 58 58 76" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-primary" opacity="0.15" />
            {/* Peripheral nodes */}
            <circle cx="74" cy="24" r="7" className="fill-primary" />
            <circle cx="22" cy="34" r="5.5" className="fill-primary" opacity="0.7" />
            <circle cx="58" cy="76" r="6.5" className="fill-primary" opacity="0.85" />
            {/* Central hub */}
            <circle cx="50" cy="46" r="10" className="fill-primary" />
            {/* Signal particles */}
            <circle cx="63" cy="34" r="2.5" className="fill-primary" opacity="0.4" />
            <circle cx="35" cy="39" r="2.2" className="fill-primary" opacity="0.3" />
            <circle cx="54" cy="62" r="2" className="fill-primary" opacity="0.3" />
          </svg>
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
