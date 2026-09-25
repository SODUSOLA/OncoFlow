import { useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutGrid, Search, CalendarClock, CalendarRange, Receipt, Package, MessageSquare,
  BookOpen, FileBarChart, Activity,
} from "lucide-react";
import { useAuth } from "../../lib/auth";
import { useRegionScope } from "./lib/useRegionScope";
import { useRegionAlerts } from "./lib/useRegionAlerts";
import { Sidebar } from "./shell/Sidebar";
import { TopAppBar } from "./shell/TopAppBar";
import { AppShell } from "./shell/AppShell";
import { NewConsultationModal } from "./components/NewConsultationModal";

// Regional Admin shell built on the locked design tokens; Clinical Chat and New Consultation are omitted since Clinical Chat needs file:read that only SUPER_ADMIN holds.
const NAV_ITEMS = [
  { to: "/dashboard/regional-admin", label: "Dashboard", icon: LayoutGrid, end: true, title: "Region Overview" },
  { to: "/dashboard/regional-admin/scheduling", label: "Appointment Grid", icon: CalendarRange, end: false, title: "Scheduling & Clinical Allocation" },
  { to: "/dashboard/regional-admin/patient-search", label: "Patient Registry", icon: Search, end: false, title: "Patient Registry" },
  { to: "/dashboard/regional-admin/countdown", label: "7-Day Countdown", icon: CalendarClock, end: false, title: "7-Day Pre-Chemo Countdown" },
  { to: "/dashboard/regional-admin/billing", label: "Billing", icon: Receipt, end: false, title: "Invoice Generator" },
  { to: "/dashboard/regional-admin/case-board", label: "Physical Case Board", icon: Activity, end: false, title: "Physical Case Board" },
  { to: "/dashboard/regional-admin/inventory", label: "Inventory", icon: Package, end: false, title: "Movements & Reconciliation" },
  { to: "/dashboard/regional-admin/inquiry", label: "Inquiry Chat", icon: MessageSquare, end: false, title: "Inquiry Chat Inbox" },
] as const;

// Reports and Clinical Guidelines appear in every mockup but have no spec or data, so they land on ComingSoon.
const COMING_SOON_ITEMS = [
  { to: "/dashboard/regional-admin/guidelines", label: "Clinical Guidelines", icon: BookOpen },
  { to: "/dashboard/regional-admin/reports", label: "Reports", icon: FileBarChart },
] as const;

// Zero-interaction RBAC walls, shown rather than hidden so the boundary reads as intentional.
const NOT_PERMITTED_ITEMS = ["Clinical Records", "Payouts & Disbursement"];

const SIDEBAR_COLLAPSED_KEY = "ra-sidebar-collapsed";

// Titles for pages reached from the top bar, which aren't in the sidebar lists.
const TOPBAR_TITLES: Record<string, string> = {
  "/dashboard/regional-admin/notifications": "Notification Center",
  "/dashboard/regional-admin/settings": "Configuration",
};

// Regional Admin shell with sidebar, top bar and route outlet.
export function RegionalAdminLayout() {
  const { user, roles, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { region, facilitiesInRegion, loading: scopeLoading } = useRegionScope();
  const { alerts } = useRegionAlerts();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1");
  const [search, setSearch] = useState("");
  const [newConsultationOpen, setNewConsultationOpen] = useState(false);

  // Toggles the sidebar collapsed state.
  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      return next;
    });
  }

  // Submits the top-bar search.
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
          onNewConsultation={() => setNewConsultationOpen(true)}
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
      {newConsultationOpen && (
        <NewConsultationModal onClose={() => setNewConsultationOpen(false)} onScheduled={() => {}} />
      )}
    </AppShell>
  );
}
