import { useState } from "react";
import { api } from "../../../lib/api";
import { Button } from "../../../components/ui/Button";
import { cn } from "../../../lib/utils";

type Phase = "idle" | "sending" | "sent" | "error";

// Tells the patient's facility QA officers that a countdown case needs attention, then confirms on the card.
export function EscalateCaseButton({ caseId, label, variant }: { caseId: string; label: string; variant: "danger" | "outline" }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setPhase("sending");
    setError(null);
    try {
      await api.post(`/countdown-cases/${caseId}/escalate`);
      setPhase("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send");
      setPhase("error");
    }
  }

  if (phase === "sent") {
    return <span className="rounded-admin-xs bg-admin-info-bg px-2 py-1 text-admin-caption font-semibold text-admin-info-text">QA notified</span>;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant={variant}
        size="sm"
        disabled={phase === "sending"}
        onClick={send}
        className={cn(
          "rounded-admin-xs font-semibold",
          variant === "danger" ? "bg-admin-danger hover:bg-admin-danger/90" : "border-admin-border bg-admin-disabled text-admin-text",
        )}
      >
        {phase === "sending" ? "Sending…" : label}
      </Button>
      {phase === "error" && <span role="alert" className="text-admin-caption text-admin-danger-text">{error}</span>}
    </div>
  );
}
