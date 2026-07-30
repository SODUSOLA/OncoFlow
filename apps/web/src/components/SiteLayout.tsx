import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";

const navItems: { to: string; label: string; end?: boolean }[] = [
  { to: "/", label: "Home", end: true },
  { to: "/about", label: "About" },
  { to: "/services", label: "Services" },
  { to: "/contact", label: "Contact" },
];

export function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <header className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <span className="text-xl font-semibold text-brand-700">OncoFlow</span>
        <nav className="flex gap-6">
          {navItems.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `text-sm font-medium ${isActive ? "text-brand-700" : "text-gray-600 hover:text-gray-900"}`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-gray-200 px-6 py-4 text-sm text-gray-500">
        © {new Date().getFullYear()} OncoFlow
      </footer>
    </div>
  );
}
