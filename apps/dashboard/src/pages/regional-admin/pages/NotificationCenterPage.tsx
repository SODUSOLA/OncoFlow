import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { TriangleAlert, Clock3, CircleCheck, LogIn, LogOut, ShieldAlert, Activity as ActivityIcon } from "lucide-react";
import { api } from "../../../lib/api";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { cn } from "../../../lib/utils";
import { useRegionAlerts } from "../lib/useRegionAlerts";
import type { RegionAlert } from "../lib/alertsStore";

// Phase 7 of ONCOFLOW_REGIONAL_ADMIN_BUILD_GUIDE.md — a pure renderer over the shared alert
// aggregator (lib/alertsStore.ts / useRegionAlerts). Per that phase's acceptance criteria, this
// page must NOT compute its own alerts: no breach/conflict detection lives here, only grouping
// (critical vs warning) and capping what's drawn.
//
// Rendering every alert as its own card doesn't scale — this dev database alone produces 200+
// countdown/inquiry breaches. A column of scroll-forever cards isn't what the mockup shows
// either (it shows two per column). Cap what's drawn; say plainly when there's more.
const MAX_CARDS = 6;
const MAX_LOG_ITEMS = 8;

interface ActivityEvent {
  id: string;
  action: string;
  resource: string;
  resourceId: string | null;
  result: "ALLOWED" | "DENIED";
  createdAt: string;
  actorEmail: string | null;
}

// GET /audit/activity — region-scoped to this admin's own facility-scoped staff (apps/api's
// facility-scope.js resolves that server-side; there's no client-side filtering to get wrong
// here). Real events only: logins, logouts, and access-denials are the only things this system
// actually records to the audit log today (see apps/api/src/modules/audit) — no fabricated
// "invoice generated"/"schedule published" entries standing in for events that aren't written.
function useActivityFeed(limit: number) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.get<{ events: ActivityEvent[] }>(`/audit/activity?limit=${limit}`)
      .then((d) => { if (!cancelled) setEvents(d.events); })
      .catch(() => { if (!cancelled) setEvents([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [limit]);

  return { events, loading };
}

function activityLabel(e: ActivityEvent): string {
  const who = e.actorEmail?.split("@")[0] ?? "Unknown user";
  switch (e.action) {
    case "LOGIN": return `${who} signed in`;
    case "LOGOUT": return `${who} signed out`;
    case "ACCESS_DENIED": return `${who} was denied access — ${e.resource}`;
    default: return `${who} — ${e.action.toLowerCase()} ${e.resource}`;
  }
}

function activityIconFor(action: string) {
  if (action === "LOGIN") return LogIn;
  if (action === "LOGOUT") return LogOut;
  if (action === "ACCESS_DENIED") return ShieldAlert;
  return ActivityIcon;
}

export default function NotificationCenterPage() {
  const navigate = useNavigate();
  const { critical, warning, loading } = useRegionAlerts();
  const { events: activity, loading: activityLoading } = useActivityFeed(MAX_LOG_ITEMS);

  const visibleCritical = critical.slice(0, MAX_CARDS);
  const hiddenCritical = critical.length - visibleCritical.length;
  const visibleWarning = warning.slice(0, MAX_CARDS);
  const hiddenWarning = warning.length - visibleWarning.length;

  return (
    <div className="grid grid-cols-3 gap-4" style={{ minHeight: "60vh" }}>
      <NotificationColumn
        title="Critical Action Required"
        count={critical.length}
        dotColor="bg-admin-danger"
        loading={loading}
        empty="Nothing critical right now."
      >
        {visibleCritical.map((a) => (
          <AlertCard key={a.id} alert={a} onAction={() => navigate(a.actionTo)} />
        ))}
        {hiddenCritical > 0 && <MoreLink count={hiddenCritical} onClick={() => navigate(visibleCritical[0]?.actionTo ?? "/dashboard/regional-admin")} />}
      </NotificationColumn>

      <NotificationColumn
        title="Pending Review"
        count={warning.length}
        dotColor="bg-admin-warning"
        loading={loading}
        empty="Nothing pending review."
      >
        {visibleWarning.map((a) => (
          <AlertCard key={a.id} alert={a} onAction={() => navigate(a.actionTo)} />
        ))}
        {hiddenWarning > 0 && <MoreLink count={hiddenWarning} onClick={() => navigate(visibleWarning[0]?.actionTo ?? "/dashboard/regional-admin")} />}
      </NotificationColumn>

      <NotificationColumn title="System Log" count={activity.length} dotColor="bg-admin-text-secondary" loading={activityLoading} empty="No recent activity in your region.">
        {activity.length > 0 && (
          <div className="space-y-1">
            {activity.map((e) => (
              <SystemLogItem key={e.id} event={e} />
            ))}
          </div>
        )}
      </NotificationColumn>
    </div>
  );
}

function MoreLink({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full rounded-admin-sm border border-dashed border-admin-border py-2 text-admin-caption font-medium text-admin-text-secondary hover:border-admin-sidebar-cta hover:text-admin-sidebar-cta"
    >
      +{count} more — open source
    </button>
  );
}

function NotificationColumn({
  title, count, dotColor, loading, empty, children,
}: {
  title: string; count: number; dotColor: string; loading: boolean; empty: string; children: React.ReactNode;
}) {
  const hasContent = Array.isArray(children) ? children.some(Boolean) : !!children;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className={`size-2 rounded-full ${dotColor}`} aria-hidden="true" />
        <p className="text-admin-caption font-semibold uppercase tracking-wide text-admin-text-secondary">{title}</p>
        {count > 0 && (
          <span className="rounded-full bg-admin-card-alt px-1.5 py-0.5 text-admin-micro font-semibold text-admin-text-secondary">{count}</span>
        )}
      </div>
      {loading ? (
        <Card className="border-admin-border p-4 text-center text-admin-body-sm text-admin-text-secondary">Loading…</Card>
      ) : !hasContent ? (
        <Card className="flex items-center gap-2 border-admin-border p-4 text-admin-body-sm text-admin-text-secondary">
          <CircleCheck className="size-4 shrink-0 text-admin-text-secondary" aria-hidden="true" /> {empty}
        </Card>
      ) : (
        children
      )}
    </div>
  );
}

// One card renders any RegionAlert generically — Notification Center never needs a per-source
// branch here, which is exactly the point: the aggregator already decided severity/badge/copy.
function AlertCard({ alert, onAction }: { alert: RegionAlert; onAction: () => void }) {
  const critical = alert.severity === "critical";
  const toneClasses = critical ? "border-l-4 border-l-admin-danger" : "border-l-4 border-l-admin-warning";
  const badgeClasses = critical ? "bg-admin-danger/10 text-admin-danger-text" : "bg-admin-warning/15 text-admin-warning";
  const Icon = critical ? TriangleAlert : Clock3;
  return (
    <Card className={cn("space-y-2 border-admin-border p-4", toneClasses)}>
      <div className="flex items-center gap-2">
        <Icon className={cn("size-3.5", critical ? "text-admin-danger" : "text-admin-warning")} aria-hidden="true" />
        <span className={cn("rounded-admin-xs px-1.5 py-0.5 text-admin-micro font-semibold", badgeClasses)}>{alert.badge}</span>
      </div>
      <p className="text-admin-body-sm font-semibold text-admin-text">{alert.title}</p>
      <p className="text-admin-caption text-admin-text-secondary">{alert.detail}</p>
      <Button
        onClick={onAction}
        size="sm"
        variant={critical ? "primary" : "outline"}
        className={cn(
          "rounded-admin-xs",
          critical ? "bg-admin-danger hover:bg-admin-danger/90" : "border-admin-border text-admin-text hover:border-admin-sidebar-cta hover:text-admin-sidebar-cta",
        )}
      >
        {alert.actionLabel}
      </Button>
    </Card>
  );
}

// Chronological, no action — this column is read-only by design (Phase 7's own component
// inventory: "icon + label + timestamp, no action").
function SystemLogItem({ event }: { event: ActivityEvent }) {
  const Icon = activityIconFor(event.action);
  const denied = event.result === "DENIED";
  return (
    <div className="flex items-start gap-2.5 rounded-admin-sm px-1 py-2">
      <Icon className={cn("mt-0.5 size-3.5 shrink-0", denied ? "text-admin-danger" : "text-admin-text-secondary")} aria-hidden="true" />
      <div className="min-w-0">
        <p className={cn("text-admin-caption", denied ? "text-admin-danger-text" : "text-admin-text")}>{activityLabel(event)}</p>
        <p className="text-admin-micro text-admin-text-secondary">{new Date(event.createdAt).toLocaleString()}</p>
      </div>
    </div>
  );
}
