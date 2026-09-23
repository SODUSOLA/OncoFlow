import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

export const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium whitespace-nowrap",
  {
    variants: {
      variant: {
        success: "bg-green-100 text-green-700",
        warning: "bg-amber-100 text-amber-700",
        critical: "bg-red-100 text-red-700",
        info: "bg-blue-100 text-blue-700",
        neutral: "bg-gray-100 text-gray-600",
        gold: "bg-gold/15 text-gold",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

// Small status pill styled by variant.
export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
