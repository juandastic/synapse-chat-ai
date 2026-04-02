import { useState, useCallback, useEffect } from "react";
import { Outlet, Link, useOutletContext } from "react-router-dom";
import { useQuery } from "convex/react";
import { useUser } from "@clerk/clerk-react";
import { useTranslation } from "react-i18next";
import posthog from "posthog-js";
import { api } from "../../../convex/_generated/api";
import { Sidebar } from "../sidebar/Sidebar";
import { DemoBanner } from "../ui/DemoBanner";
import { useTheme } from "../../contexts/ThemeContext";
import { Moon, Sun } from "lucide-react";

/** Hook for child routes to check if current user is the demo account. */
export function useIsDemoUser(): boolean {
  return useOutletContext<boolean>() ?? false;
}

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  const closeSidebar = useCallback(() => {
    setSidebarOpen(false);
  }, []);

  // Close sidebar on Escape key (mobile)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && sidebarOpen) {
        closeSidebar();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [sidebarOpen, closeSidebar]);

  const { theme, toggleTheme } = useTheme();
  const { t: tc } = useTranslation("common");
  const { t: ts } = useTranslation("sidebar");
  const isDemoUser = useQuery(api.demo.isDemoUserQuery) ?? false;
  const { user } = useUser();
  const convexUser = useQuery(api.users.me);
  const usageStatus = useQuery(api.usageLimits.getUsageStatus);

  useEffect(() => {
    if (convexUser && user) {
      posthog.identify(convexUser._id, {
        email: user.primaryEmailAddress?.emailAddress,
        name: convexUser.name,
      });
      posthog.setPersonProperties({ plan: usageStatus?.plan ?? "free" });
    }
  }, [convexUser?._id, usageStatus?.plan]);

  return (
    <div className="flex h-full flex-col">
      {isDemoUser && <DemoBanner />}
      <div className="flex min-h-0 flex-1">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 backdrop-blur-sm md:hidden"
          onClick={closeSidebar}
          onKeyDown={(e) => e.key === "Escape" && closeSidebar()}
          role="presentation"
          aria-hidden="true"
          tabIndex={-1}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-40 w-72 shrink-0 transform border-r border-border/50 bg-card transition-transform duration-200 ease-in-out
          md:relative md:translate-x-0
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        <Sidebar onCloseMobile={closeSidebar} isDemoUser={isDemoUser} />
      </aside>

      {/* Main content area */}
      <main className="flex min-w-0 flex-1 flex-col">
        {/* Mobile header with hamburger */}
        <div className="flex h-12 shrink-0 items-center border-b border-border/50 px-4 md:hidden">
          <button
            onClick={toggleSidebar}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label={ts("toggleSidebar")}
            aria-expanded={sidebarOpen}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
            >
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <Link to="/" className="ml-3 flex-1 font-display text-sm font-medium tracking-tight hover:text-foreground transition-colors">
            Synapse
          </Link>
          <button
            onClick={toggleTheme}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label={theme === "dark" ? tc("switchToLightMode") : tc("switchToDarkMode")}
          >
            {theme === "dark" ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </button>
        </div>

        <Outlet context={isDemoUser} />
      </main>
      </div>
    </div>
  );
}
