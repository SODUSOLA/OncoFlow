"use client";

import { useState } from "react";
import { WalletCards } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { api } from "@/lib/api";
import { useMyPatient } from "@/lib/useMyPatient";
import type { Wallet } from "@/lib/types";

// Settings toggle for paying invoices from the wallet automatically as soon as they are issued.
export function AutoDeductCard() {
  const { wallet, reload } = useMyPatient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!wallet) return null;
  const enabled = wallet.autoDeductEnabled;

  // Saves the new preference, then refreshes the shared patient record so every screen agrees.
  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      await api.put<{ wallet: Wallet }>("/wallet/auto-deduct", { enabled: !enabled });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update this setting");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="flex items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary">
          <WalletCards className="size-4.5" aria-hidden="true" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-neutral-700">Automatic payments</p>
          <p className="text-xs text-neutral-400">
            Pay new invoices from your wallet as soon as they&apos;re issued, when your balance covers them.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Automatic payments"
          disabled={busy}
          onClick={toggle}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${enabled ? "bg-primary" : "bg-neutral-300"}`}
        >
          <span
            className={`absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-5" : ""}`}
          />
        </button>
      </div>
      <p className="mt-3 text-xs text-neutral-400">
        If your balance is too low, the invoice stays open for you to pay once you add money — nothing is charged partially.
      </p>
      {error && <p role="alert" className="mt-2 text-sm text-critical">{error}</p>}
    </Card>
  );
}
