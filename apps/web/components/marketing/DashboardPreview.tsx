import { Activity, CalendarDays, CheckCircle2, Clock3 } from "lucide-react";

/**
 * Hand-built, static composition standing in for a real product screen —
 * per the illustration policy, never a stock photo or generic mockup.
 * No floating/bobbing animation: depth comes from layered offset + shadow only.
 */
export function DashboardPreview() {
  return (
    <div className="relative mx-auto aspect-4/3 w-full max-w-lg">
      <div className="absolute inset-0 rounded-2xl border border-neutral-200 bg-surface p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-primary">Patient Timeline</p>
          <span className="rounded-xl bg-teal-bg px-2.5 py-1 text-xs font-semibold text-teal">
            On track
          </span>
        </div>
        <div className="mt-4 space-y-3">
          {[
            { label: "Labs received", done: true },
            { label: "Clinical sign-off", done: true },
            { label: "Invoice confirmed", done: false },
          ].map((row) => (
            <div key={row.label} className="flex items-center gap-2.5 text-sm">
              <CheckCircle2
                className={row.done ? "size-4 text-teal" : "size-4 text-neutral-300"}
                aria-hidden="true"
              />
              <span className={row.done ? "text-neutral-700" : "text-neutral-400"}>
                {row.label}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-5 h-1.5 w-full overflow-hidden rounded-xl bg-neutral-100">
          <div className="h-full w-2/3 rounded-xl bg-primary" />
        </div>
      </div>

      <div className="absolute -right-6 top-20 w-44 rounded-xl border border-neutral-200 bg-surface p-4 shadow-md sm:-right-10">
        <div className="flex items-center gap-2 text-xs font-semibold text-neutral-500">
          <CalendarDays className="size-4 text-accent-gold" aria-hidden="true" />
          Appointment
        </div>
        <p className="mt-2 text-sm font-semibold text-primary">Dr. Bakare — 2:30 PM</p>
        <p className="text-xs text-neutral-500">Video consultation</p>
      </div>

      <div className="absolute -left-6 bottom-6 w-48 rounded-xl border border-neutral-200 bg-surface p-4 shadow-md sm:-left-10">
        <div className="flex items-center gap-2 text-xs font-semibold text-neutral-500">
          <Activity className="size-4 text-teal" aria-hidden="true" />
          Treatment Progress
        </div>
        <p className="mt-2 text-sm font-semibold text-primary">Day 4 of 7</p>
        <div className="mt-2 flex gap-1">
          {Array.from({ length: 7 }).map((_, i) => (
            <span
              key={i}
              className={`h-1.5 flex-1 rounded-full ${i < 4 ? "bg-primary" : "bg-neutral-100"}`}
            />
          ))}
        </div>
      </div>

      <div className="absolute bottom-0 right-4 flex items-center gap-2 rounded-xl border border-neutral-200 bg-surface px-3.5 py-2.5 shadow-md sm:right-0">
        <Clock3 className="size-4 text-accent-gold" aria-hidden="true" />
        <span className="text-xs font-semibold text-primary">SLA: 4:12 remaining</span>
      </div>
    </div>
  );
}
