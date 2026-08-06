"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { api } from "@/lib/api";
import { useMyPatient } from "@/lib/useMyPatient";
import type { WalletTransaction } from "@/lib/types";

function koboToNaira(kobo: string) {
  const value = Number(kobo) / 100;
  return `₦${value.toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
}

function monthKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}`;
}

function monthLabel(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export default function TransactionHistoryPage() {
  const router = useRouter();
  const { patient, loading: patientLoading, notLinked } = useMyPatient();
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!patient) return;
    (async () => {
      try {
        const res = await api.get<{ transactions: WalletTransaction[] }>(`/wallet/transactions?patientId=${patient.id}`);
        setTransactions(res.transactions);
      } catch {
        setTransactions([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [patient]);

  if (patientLoading || loading) {
    return <p className="p-6 text-center text-sm text-neutral-400">Loading transaction history…</p>;
  }

  if (notLinked || !patient) {
    return (
      <div className="p-4">
        <Card className="text-center text-sm text-neutral-600">
          Your transaction history becomes available once your care team confirms your patient record.
        </Card>
      </div>
    );
  }

  const groups = new Map<string, WalletTransaction[]>();
  for (const tx of transactions) {
    const key = monthKey(tx.createdAt);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(tx);
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} aria-label="Back">
          <ArrowLeft className="size-5 text-neutral-500" />
        </button>
        <h1 className="text-lg font-bold text-neutral-900">Transactions</h1>
      </div>

      {transactions.length === 0 ? (
        <Card className="text-center text-sm text-neutral-400">No transactions yet</Card>
      ) : (
        Array.from(groups.entries()).map(([key, txs]) => {
          const inTotal = txs.filter((t) => t.type === "CREDIT").reduce((sum, t) => sum + Number(t.amountKobo), 0);
          const outTotal = txs.filter((t) => t.type === "DEBIT").reduce((sum, t) => sum + Number(t.amountKobo), 0);
          return (
            <Card key={key} className="p-0">
              <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
                <span className="text-sm font-bold text-neutral-900">{monthLabel(txs[0]!.createdAt)}</span>
                <span className="text-xs text-neutral-500">
                  In {koboToNaira(String(inTotal))} · Out {koboToNaira(String(outTotal))}
                </span>
              </div>
              <div className="divide-y divide-neutral-100">
                {txs.map((tx) => (
                  <div key={tx.id} className="flex items-center gap-3 px-4 py-3">
                    <div
                      className={`flex size-9 shrink-0 items-center justify-center rounded-full ${
                        tx.type === "CREDIT" ? "bg-teal-bg text-teal" : "bg-primary-50 text-primary"
                      }`}
                    >
                      {tx.type === "CREDIT" ? (
                        <ArrowDownLeft className="size-4" aria-hidden="true" />
                      ) : (
                        <ArrowUpRight className="size-4" aria-hidden="true" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-neutral-900">
                        {tx.type === "CREDIT" ? "Wallet Deposit" : "Invoice Payment"}
                      </p>
                      <p className="text-xs text-neutral-500">
                        {new Date(tx.createdAt).toLocaleString("en-US", {
                          month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                        })}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-bold ${tx.type === "CREDIT" ? "text-teal" : "text-neutral-900"}`}>
                        {tx.type === "CREDIT" ? "+" : "-"}{koboToNaira(tx.amountKobo)}
                      </p>
                      <p className="text-[11px] text-neutral-400">Successful</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          );
        })
      )}
    </div>
  );
}
