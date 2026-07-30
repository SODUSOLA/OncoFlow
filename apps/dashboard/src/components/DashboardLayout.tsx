import type { ReactNode } from "react";

interface DashboardLayoutProps {
  role: string;
  children: ReactNode;
}

export function DashboardLayout({ role, children }: DashboardLayoutProps) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-brand-700">OncoFlow</h1>
        <span className="text-sm text-gray-500">{role}</span>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}