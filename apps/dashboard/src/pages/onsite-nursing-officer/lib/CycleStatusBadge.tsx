import { Clock, Loader, FileCheck2, Undo2, CalendarCheck } from "lucide-react";
import { cn } from "../../../lib/utils";
import type { RegimenCycleRow } from "./types";

// Where one due visitation stands, shown on both the Schedule and the wizard's patient list so the two never
// disagree: not started yet (overdue or due today), being documented, sent back by QA, or waiting on QA.
// A visitation disappears from those lists altogether once QA closes its case.
export function CycleStatusBadge({ cycle, today }: { cycle: Pick<RegimenCycleRow, "scheduledDate" | "caseStatus" | "lastReviewDecision">; today: string }) {
  let label: string;
  let Icon = Clock;
  let tone: string;
  if (cycle.caseStatus === "STARTED") {
    label = "In progress"; Icon = Loader; tone = "bg-admin-warning/15 text-admin-warning";
  } else if (cycle.caseStatus === "PENDING_QA_REVIEW" && cycle.lastReviewDecision === "REQUIREMENTS_INCOMPLETE") {
    label = "Sent back by QA"; Icon = Undo2; tone = "bg-admin-danger/10 text-admin-danger";
  } else if (cycle.caseStatus === "PENDING_QA_REVIEW") {
    label = "Awaiting QA"; Icon = FileCheck2; tone = "bg-admin-sidebar-cta/10 text-admin-sidebar-cta";
  } else if (cycle.scheduledDate < today) {
    label = "Overdue"; tone = "bg-admin-danger/10 text-admin-danger";
  } else {
    label = "Due today"; Icon = CalendarCheck; tone = "bg-admin-success/10 text-admin-success";
  }
  return (
    <span className={cn("flex shrink-0 items-center gap-1 rounded-admin-lg px-2 py-0.5 text-admin-micro font-semibold", tone)}>
      <Icon className="size-3" aria-hidden="true" /> {label}
    </span>
  );
}
