"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { api, ApiError } from "@/lib/api";
import { invalidateMyPatient } from "@/lib/useMyPatient";
import type { SubscriptionCycle, SubscriptionStatus } from "@/lib/types";

const CYCLE_LABELS: Record<SubscriptionCycle, { name: string; term: string }> = {
  MONTHLY: { name: "Monthly", term: "per month" },
  YEARLY: { name: "Yearly", term: "per year" },
};

// Formats a kobo string as a naira amount.
function koboToNaira(kobo: string) {
  return `₦${(Number(kobo) / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
}

// Formats a YYYY-MM-DD date for display without shifting it across time zones.
function formatDate(isoDate: string) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

// Membership page: shows the current term and lets the patient pay for or renew one from their wallet.
export default function SubscriptionPage() {
  const router = useRouter();
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [paying, setPaying] = useState<SubscriptionCycle | null>(null);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string; needsFunds?: boolean } | null>(null);

  useEffect(() => {
    api.get<SubscriptionStatus>("/subscription")
      .then(setStatus)
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Could not load your membership"));
  }, []);

  // Pays for a term from the wallet; an insufficient balance comes back as 402 and points the patient at Add Money.
  async function subscribe(cycle: SubscriptionCycle) {
    setPaying(cycle);
    setMessage(null);
    try {
      const res = await api.post<SubscriptionStatus>("/subscription", { billingCycle: cycle });
      setStatus(res);
      // The wallet balance shown elsewhere is now stale.
      invalidateMyPatient();
      setMessage({ kind: "success", text: `Your ${CYCLE_LABELS[cycle].name.toLowerCase()} membership is active.` });
    } catch (err) {
      if (err instanceof ApiError && (err.body as { invoice?: unknown })?.invoice) {
        setMessage({
          kind: "error",
          text: "Your wallet balance doesn't cover this plan yet. Add money, then try again.",
          needsFunds: true,
        });
      } else {
        setMessage({ kind: "error", text: err instanceof Error ? err.message : "Could not complete the payment" });
      }
    } finally {
      setPaying(null);
    }
  }

  const sub = status?.subscription;
  const active = status?.state === "ACTIVE";

  return (
    <div className="space-y-5 p-4">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} aria-label="Back">
          <ArrowLeft className="size-5 text-neutral-500" />
        </button>
        <h1 className="text-lg font-bold text-neutral-900">Membership</h1>
      </div>

      {loadError && <p className="text-center text-sm text-critical">{loadError}</p>}
      {!status && !loadError && <p className="py-6 text-center text-sm text-neutral-400">Loading…</p>}

      {status && (
        <>
          <Card className={active ? "bg-primary text-white" : ""}>
            <div className="flex items-center justify-between">
              <p className={`text-xs font-bold tracking-widest ${active ? "text-white/60" : "text-neutral-500"}`}>YOUR MEMBERSHIP</p>
              {status.state === "ACTIVE" && <Badge variant="success">Active</Badge>}
              {status.state === "EXPIRED" && <Badge variant="critical">Expired</Badge>}
              {status.state === "NONE" && <Badge variant="sample">Not subscribed</Badge>}
            </div>
            {sub ? (
              <>
                <p className="mt-3 text-lg font-bold">{CYCLE_LABELS[sub.billingCycle].name} plan</p>
                <p className={`mt-1 text-sm ${active ? "text-white/80" : "text-neutral-500"}`}>
                  {active ? "Runs until" : "Ended on"} {formatDate(sub.nextBillingDate)}
                </p>
              </>
            ) : (
              <p className="mt-3 text-sm text-neutral-500">You haven&apos;t subscribed yet. Choose a plan below.</p>
            )}
            {active && !status.canRenew && (
              <p className="mt-3 text-xs text-white/70">You can renew within 14 days of the end date.</p>
            )}
          </Card>

          {message && (
            <div
              role="alert"
              className={`rounded-xl px-4 py-3 text-sm ${message.kind === "success" ? "bg-teal-bg text-teal" : "bg-warning-bg text-warning"}`}
            >
              {message.text}
              {message.needsFunds && (
                <Link href="/wallet/add-money" className="ml-1 font-semibold underline">
                  Add money
                </Link>
              )}
            </div>
          )}

          {status.canRenew && (
            <div className="space-y-3">
              <h2 className="text-base font-bold text-neutral-900">{status.state === "NONE" ? "Choose a plan" : "Renew your plan"}</h2>
              {(Object.keys(CYCLE_LABELS) as SubscriptionCycle[]).map((cycle) => (
                <Card key={cycle} className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-neutral-900">{CYCLE_LABELS[cycle].name}</p>
                    <p className="text-xs text-neutral-500">
                      {koboToNaira(status.prices[cycle])} {CYCLE_LABELS[cycle].term}
                    </p>
                  </div>
                  <Button size="sm" onClick={() => subscribe(cycle)} loading={paying === cycle} disabled={paying !== null}>
                    {status.state === "NONE" ? "Subscribe" : "Renew"}
                  </Button>
                </Card>
              ))}
              <p className="text-xs text-neutral-400">
                The fee is paid from your wallet balance for one term. Memberships don&apos;t renew by themselves — you choose when to renew.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
