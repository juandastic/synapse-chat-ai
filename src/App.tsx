import { SignedIn, SignedOut } from "@clerk/clerk-react";
import { Routes, Route } from "react-router-dom";
import { AppLayout } from "./components/layout/AppLayout";
import { PersonaSelector } from "./components/chat/PersonaSelector";
import { ChatView } from "./components/chat/ChatView";
import { PersonaSettings } from "./components/settings/PersonaSettings";
import { MemoryExplorer } from "./components/memory/MemoryExplorer";
import { NotionExportPage } from "./components/notion/NotionExportPage";
import { Toaster } from "./components/ui/sonner";
import LandingPage from "./components/landing/LandingPage";

function App() {
  return (
    <div className="h-screen w-screen bg-background">
      <SignedOut>
        <LandingPage />
      </SignedOut>
      <SignedIn>
        <div className="h-full overflow-hidden">
          <Routes>
            <Route element={<AppLayout />}>
              <Route index element={<PersonaSelector />} />
              <Route path="t/:threadId" element={<ChatView />} />
              <Route path="settings/personas" element={<PersonaSettings />} />
              <Route path="memory" element={<MemoryExplorer />} />
              <Route path="notion" element={<NotionExportPage />} />
            </Route>
          </Routes>
        </div>
      </SignedIn>
      <Toaster />
    </div>
  );
}

export default App;
