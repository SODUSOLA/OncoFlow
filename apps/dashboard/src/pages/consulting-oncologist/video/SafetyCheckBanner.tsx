import { TriangleAlert } from "lucide-react";
import { TRIGGER_LABEL, type CaseLockData, type VitalLatest } from "../lib/clinicalTypes";

// Deliberately decoupled from the daily-js call layer entirely — this reads the same case-lock
// and vitals data Patient File and Pre-call Briefing already read, not anything video-related.
// Renders nothing when there's nothing to flag, rather than an empty "all clear" banner.
export function SafetyCheckBanner({ caseLock, vitals }: { caseLock: CaseLockData | null; vitals: VitalLatest[] }) {
  const elevated = vitals.filter((v) => v.severity === "ELEVATED");
  if (!caseLock && elevated.length === 0) return null;

  return (
    <div className="absolute left-1/2 top-4 flex -translate-x-1/2 items-center gap-2 rounded-admin-sm border border-admin-danger bg-admin-danger px-4 py-2 text-admin-caption font-semibold text-white shadow-lg">
      <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
      {caseLock
        ? `Safety Check — ${TRIGGER_LABEL[caseLock.triggeredBy] ?? caseLock.triggeredBy}. Case is locked.`
        : `Safety Check — ${elevated.length} elevated vital${elevated.length > 1 ? "s" : ""} on record for this patient.`}
    </div>
  );
}
