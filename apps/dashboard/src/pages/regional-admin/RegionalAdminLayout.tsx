import { useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutGrid, Search, CalendarClock, CalendarRange, Receipt, Package, MessageSquare,
  BookOpen, FileBarChart,
} from "lucide-react";
import { useAuth } from "../../lib/auth";
import { useRegionScope } from "./lib/useRegionScope";
import { useRegionAlerts } from "./lib/useRegionAlerts";
import { Sidebar } from "./shell/Sidebar";
import { TopAppBar } from "./shell/TopAppBar";
import { AppShell } from "./shell/AppShell";

// Regional Admin's own shell — rebuilt per ONCOFLOW_REGIONAL_ADMIN_BUILD_GUIDE.md Phase 1 against
// ONCOFLOW_DESIGN_SYSTEM.md's locked Figma tokens, replacing the earlier ad hoc restyle. The
// presentational pieces (Sidebar/TopAppBar/AppShell, under ./shell) are the reusable components
// the guide calls for; this file stays the "smart" layer — routes, data, and the pages behind
// each label are unchanged except where noted.
//
// Two items intentionally do NOT appear here: "Clinical Chat" and "+ New Consultation", even
// though the new build guide specs a "New Consultation" sidebar CTA. Clinical Chat opens a
// specific patient's vitals/allergies/labs — exactly what NOT_PERMITTED_ITEMS below exists to
// wall off, and no role but SUPER_ADMIN currently holds file:read at all. Reconfirmed with the
// user when the new docs were introduced: keep it dropped rather than build a button with
// nowhere to go.
const NAV_ITEMS = [
  { to: "/dashboard/regional-admin", label: "Dashboard", icon: LayoutGrid, end: true, title: "Region Overview" },
  { to: "/dashboard/regional-admin/scheduling", label: "Appointment Grid", icon: CalendarRange, end: false, title: "Scheduling & Clinical Allocation" },
  { to: "/dashboard/regional-admin/patient-search", label: "Patient Registry", icon: Search, end: false, title: "Patient Registry" },
  { to: "/dashboard/regional-admin/countdown", label: "7-Day Countdown", icon: CalendarClock, end: false, title: "7-Day Pre-Chemo Countdown" },
  { to: "/dashboard/regional-admin/billing", label: "Billing", icon: Receipt, end: false, title: "Invoice Generator" },
  { to: "/dashboard/regional-admin/inventory", label: "Inventory", icon: Package, end: false, title: "Movements & Reconciliation" },
  { to: "/dashboard/regional-admin/inquiry", label: "Inquiry Chat", icon: MessageSquare, end: false, title: "Inquiry Chat Inbox" },
] as const;

// Present in every mockup's sidebar, but neither has a dedicated screen spec or backing data
// model (no clinical-guidelines content table, no reports/analytics endpoint). Real, clickable
// nav entries that land on the existing ComingSoon treatment — not fabricated content standing
// in for a page that doesn't exist yet.
const COMING_SOON_ITEMS = [
  { to: "/dashboard/regional-admin/guidelines", label: "Clinical Guidelines", icon: BookOpen },
  { to: "/dashboard/regional-admin/reports", label: "Reports", icon: FileBarChart },
] as const;

// RBAC walls that are correctly zero-interaction for this role — shown, not hidden, so the
// boundary reads as intentional rather than an accidental missing feature.
const NOT_PERMITTED_ITEMS = ["Clinical Records", "Physical Case Board", "Payouts & Disbursement"];

const SIDEBAR_COLLAPSED_KEY = "ra-sidebar-collapsed";

// Reached from the top bar (bell / profile), not the sidebar — deliberately absent from
// NAV_ITEMS/COMING_SOON_ITEMS, so they need their own title rather than falling through to
// whatever NAV_ITEMS[0] happens to be.
const TOPBAR_TITLES: Record<string, string> = {
  "/dashboard/regional-admin/notifications": "Notification Center",
  "/dashboard/regional-admin/settings": "Configuration",
};

export function RegionalAdminLayout() {
  const { user, roles, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { region, facilitiesInRegion, loading: scopeLoading } = useRegionScope();
  const { alerts } = useRegionAlerts();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1");
  const [search, setSearch] = useState("");

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      return next;
    });
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = search.trim();
    if (!q) return;
    navigate(`/dashboard/regional-admin/patient-search?q=${encodeURIComponent(q)}`);
  }

  const allNavItems = [...NAV_ITEMS, ...COMING_SOON_ITEMS];
  const activeItem = allNavItems.find((item) =>
    "end" in item && item.end ? location.pathname === item.to : location.pathname.startsWith(item.to),
  ) ?? NAV_ITEMS[0];
  const title = TOPBAR_TITLES[location.pathname] ?? ("title" in activeItem ? activeItem.title : activeItem.label);

  const roleLabel = roles[0]?.roleDescription || roles[0]?.roleName.replace(/_/g, " ") || "Regional Admin";
  const initials = (user?.email.slice(0, 2) ?? "RA").toUpperCase();

  return (
    <AppShell
      sidebar={
        <Sidebar
          navItems={NAV_ITEMS}
          comingSoonItems={COMING_SOON_ITEMS}
          notPermittedLabels={NOT_PERMITTED_ITEMS}
          collapsed={collapsed}
          onToggleCollapsed={toggleCollapsed}
          userName={user?.email.split("@")[0] ?? "Regional Admin"}
          userSubtitle={`${roleLabel}${region ? ` · ${region}` : ""}`}
          initials={initials}
          onSignOut={() => logout()}
        />
      }
      topBar={
        <TopAppBar
          title={title}
          region={region}
          facilityCount={facilitiesInRegion.length}
          search={search}
          onSearchChange={setSearch}
          onSearchSubmit={submitSearch}
          connected={!scopeLoading}
          hasAlerts={alerts.length > 0}
          profileInitials={initials}
        />
      }
    >
      <Outlet />
    </AppShell>
  );
}
