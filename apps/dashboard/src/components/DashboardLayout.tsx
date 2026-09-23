import type { ReactNode } from "react";
import { useAuth } from "../lib/auth";

interface DashboardLayoutProps {
  role: string;
  children: ReactNode;
}

// Generic single-page shell with a header for roles that don't have their own layout.
export function DashboardLayout({ role, children }: DashboardLayoutProps) {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink">OncoFlow Limited</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">{role}</span>
          {user && (
            <>
              <span className="text-sm text-gray-400">{user.email}</span>
              <button onClick={() => logout()} className="text-sm text-gray-500 hover:text-gray-700">
                Sign out
              </button>
            </>
          )}
        </div>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}