import type { ReactNode } from "react";

interface AppShellProps {
  sidebar: ReactNode;
  topBar: ReactNode;
  children: ReactNode;
}

// Phase 1 layout wrapper: sidebar + a main column of (fixed top bar, scrollable content).
// `font-public-sans` is applied here rather than globally so the rest of the dashboard (Login,
// patient views) keeps its existing typeface — this token is specific to the Regional Admin
// rebuild's locked design system.
export function AppShell({ sidebar, topBar, children }: AppShellProps) {
  return (
    <div className="flex h-screen overflow-hidden bg-admin-canvas-bg font-public-sans">
      {sidebar}
      <div className="flex flex-1 flex-col overflow-hidden">
        {topBar}
        <main className="min-h-0 flex-1 overflow-y-auto p-8">{children}</main>
      </div>
    </div>
  );
}
