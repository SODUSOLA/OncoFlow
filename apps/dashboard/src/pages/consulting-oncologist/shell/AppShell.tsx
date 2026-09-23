import type { ReactNode } from "react";

interface AppShellProps {
  sidebar: ReactNode;
  topBar: ReactNode;
  children: ReactNode;
}

// Page frame placing the sidebar, top bar and content.
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
