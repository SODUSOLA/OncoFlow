import { Link } from "react-router-dom";
import { ShieldCheck, MessagesSquare } from "lucide-react";
import { useInbox, SLA_STYLE, SlaBadge, SlaCountdown, fullName } from "../lib/vmo";
import { cn } from "../../../lib/utils";

const BASE = "/dashboard/virtual-medical-officer";

// Landing page. The design only shows the queue-cleared state; the populated state below is a plain list of
// active chats built from the same data until that variant is designed.
export default function DashboardPage() {
  const { chats, error } = useInbox();
  if (error) return <p className="p-8 text-admin-danger">{error}</p>;
  if (!chats) return <p className="p-8 text-admin-text-secondary">Loading…</p>;

  const active = chats.filter((c) => c.status === "OPEN");
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
  const handledToday = chats.filter((c) => c.status === "CLOSED" && new Date(c.lastMessageAt ?? c.createdAt) >= startOfDay).length;
  const breached = active.filter((c) => c.slaState === "CRITICAL").length;

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-8">
      <h1 className="text-admin-h1 text-admin-text">Dashboard</h1>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Active triage cases", value: active.length },
          { label: "SLA critical", value: breached, danger: breached > 0 },
          { label: "Handled today", value: handledToday },
        ].map((s) => (
          <div key={s.label} className={cn("rounded-admin-sm border bg-white p-5 shadow-admin-card", s.danger ? "border-l-4 border-admin-border border-l-admin-danger" : "border-admin-border")}>
            <p className="text-admin-caption uppercase tracking-wider text-admin-text-secondary">{s.label}</p>
            <p className={cn("mt-2 text-admin-h1", s.danger ? "text-admin-danger" : "text-admin-text")}>{s.value}</p>
          </div>
        ))}
      </div>

      {active.length === 0 ? (
        <div className="flex flex-col items-center rounded-admin-md border border-admin-border bg-white px-6 py-16 text-center shadow-admin-card">
          <ShieldCheck className="size-14 text-admin-success" aria-hidden="true" />
          <h2 className="mt-4 text-admin-h3 text-admin-text">Queue cleared</h2>
          <p className="mt-1 max-w-md text-admin-body-sm text-admin-text-secondary">No patients are waiting on a side-effect triage. New reports appear here the moment they arrive.</p>
        </div>
      ) : (
        <section className="space-y-3">
          <h2 className="text-admin-h3 text-admin-text">Needs attention</h2>
          {[...active].sort((a, b) => (a.slaDeadline ?? "").localeCompare(b.slaDeadline ?? "")).map((c) => (
            <Link key={c.id} to={`${BASE}/inbox/${c.id}`}
              className={cn("flex items-center justify-between rounded-admin-sm border border-admin-border bg-white p-4 shadow-admin-card hover:bg-admin-card-alt", SLA_STYLE[c.slaState].bar)}>
              <div className="flex items-center gap-3">
                <MessagesSquare className="size-5 text-admin-text-secondary" aria-hidden="true" />
                <div>
                  <p className="text-admin-body-sm font-semibold text-admin-text">{fullName(c.patient)}</p>
                  <p className="text-admin-caption text-admin-text-secondary">{c.patient.uniquePatientId} · {c.patient.age} yrs</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <SlaCountdown deadline={c.slaDeadline} state={c.slaState} className="text-admin-body-sm" />
                <SlaBadge state={c.slaState} />
              </div>
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}
