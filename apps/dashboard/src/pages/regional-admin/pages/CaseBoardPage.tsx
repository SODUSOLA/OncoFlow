import { Activity } from "lucide-react";
import { CaseBoard } from "../../../components/CaseBoard";

// Regional Admin's Physical Case Board: the live status of every nursing case in the region (view only).
export default function CaseBoardPage() {
  return (
    <div className="max-w-4xl space-y-4">
      <div>
        <p className="flex items-center gap-2 text-admin-h3 text-admin-text">
          <Activity className="size-5 text-admin-sidebar-cta" aria-hidden="true" /> Physical Case Board
        </p>
        <p className="text-admin-body-sm text-admin-text-secondary">
          Every nursing case in your region, from the nurse opening it to QA closing it. Updates automatically.
        </p>
      </div>
      <CaseBoard />
    </div>
  );
}
