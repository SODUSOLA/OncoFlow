"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

function koboToNaira(kobo: string) {
  return `₦${(Number(kobo) / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
}

export function BalanceAmount({ balanceKobo, className }: { balanceKobo: string | undefined; className?: string }) {
  const [revealed, setRevealed] = useState(true);

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      {revealed ? (balanceKobo ? koboToNaira(balanceKobo) : "—") : "₦••••••"}
      <button
        type="button"
        onClick={() => setRevealed((r) => !r)}
        className="text-current opacity-70 transition-opacity duration-fast hover:opacity-100"
        aria-label={revealed ? "Hide balance" : "Show balance"}
      >
        {revealed ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
      </button>
    </span>
  );
}
