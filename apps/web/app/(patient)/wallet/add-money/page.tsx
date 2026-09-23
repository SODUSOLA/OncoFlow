"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, Landmark, Banknote, CreditCard, Smartphone, QrCode } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

const OPTIONS = [
  { icon: Landmark, label: "Bank Transfer", description: "Add money via mobile or internet banking" },
  { icon: Banknote, label: "Cash Deposit", description: "Fund your account with nearby merchants" },
  { icon: CreditCard, label: "Top-up with Card/Account", description: "Add money directly from your bank card or account" },
  { icon: Smartphone, label: "Bank USSD", description: "With other banks' USSD code" },
  { icon: QrCode, label: "Scan my QR Code", description: "Show QR code to any OncoFlow user" },
];

// Add-money page.
export default function AddMoneyPage() {
  const router = useRouter();

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} aria-label="Back">
          <ArrowLeft className="size-5 text-neutral-500" />
        </button>
        <h1 className="text-lg font-bold text-neutral-900">Add Money</h1>
      </div>

      <p className="text-sm text-neutral-500">
        Wallet funding isn&apos;t connected to a payment provider yet. These options show what&apos;s
        coming — your care team can process payments on your behalf in the meantime.
      </p>

      <div className="space-y-2.5">
        {OPTIONS.map(({ icon: Icon, label, description }) => (
          <Card key={label} className="flex cursor-not-allowed items-center gap-3 opacity-60">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-400">
              <Icon className="size-5" aria-hidden="true" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-neutral-700">{label}</p>
              <p className="text-xs text-neutral-400">{description}</p>
            </div>
            <Badge variant="sample">Coming soon</Badge>
          </Card>
        ))}
      </div>
    </div>
  );
}
