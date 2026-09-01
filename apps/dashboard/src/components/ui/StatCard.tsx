import type { ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";
import { Card } from "./Card";

const valueVariants = cva("text-2xl font-bold", {
  variants: {
    variant: {
      neutral: "text-gray-900",
      success: "text-green-700",
      warning: "text-amber-600",
      critical: "text-red-600",
    },
  },
  defaultVariants: { variant: "neutral" },
});

interface StatCardProps extends VariantProps<typeof valueVariants> {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  trend?: ReactNode;
  className?: string;
  /** Renders a left accent border in the same color as the value — used for the "flagged" stat
   * cards (SLA Breaches, Critical Shortages) so they read as alerts, not just data. */
  emphasized?: boolean;
}

const emphasisBorder: Record<string, string> = {
  critical: "border-l-4 border-l-red-500",
  warning: "border-l-4 border-l-amber-500",
  success: "border-l-4 border-l-green-500",
  neutral: "",
};

export function StatCard({ label, value, icon, trend, variant = "neutral", emphasized, className }: StatCardProps) {
  return (
    <Card className={cn("flex items-start justify-between gap-3 p-4", emphasized && emphasisBorder[variant ?? "neutral"], className)}>
      <div>
        <p className="text-sm text-gray-500">{label}</p>
        <p className={cn(valueVariants({ variant }))}>{value}</p>
        {trend && <p className="mt-1 text-xs text-gray-400">{trend}</p>}
      </div>
      {icon && <div className="text-gray-300">{icon}</div>}
    </Card>
  );
}
