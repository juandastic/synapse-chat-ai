import { SignedIn, SignedOut } from "@clerk/clerk-react";
import { Routes, Route } from "react-router-dom";
import { AppLayout } from "./components/layout/AppLayout";
import { PersonaSelector } from "./components/chat/PersonaSelector";
import { ChatView } from "./components/chat/ChatView";
import { PersonaSettings } from "./components/settings/PersonaSettings";
import { AccountSettings } from "./components/settings/AccountSettings";
import { MemoryExplorer } from "./components/memory/MemoryExplorer";
import { NotionExportPage } from "./components/notion/NotionExportPage";
import { PlansPage } from "./components/plans/PlansPage";
import { Toaster } from "./components/ui/sonner";
import LandingPage from "./components/landing/LandingPage";
import { PrivacyPage } from "./pages/legal/PrivacyPage";
import { TermsPage } from "./pages/legal/TermsPage";
import { DeleteAccountInfoPage } from "./pages/legal/DeleteAccountInfoPage";

function App() {
  return (
    <div className="h-screen w-screen bg-background">
      <Routes>
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/delete-account" element={<DeleteAccountInfoPage />} />
        <Route path="*" element={<ConditionalApp />} />
      </Routes>
      <Toaster />
    </div>
  );
}

function ConditionalApp() {
  return (
    <>
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
              <Route path="settings/account" element={<AccountSettings />} />
              <Route path="memory" element={<MemoryExplorer />} />
              <Route path="notion" element={<NotionExportPage />} />
              <Route path="plans" element={<PlansPage />} />
            </Route>
          </Routes>
        </div>
      </SignedIn>
    </>
  );
}

export default App;
