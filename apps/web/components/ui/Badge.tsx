import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-xl px-3 py-1 text-xs font-semibold",
  {
    variants: {
      variant: {
        default: "bg-primary-50 text-primary",
        success: "bg-teal-bg text-teal",
        warning: "bg-warning-bg text-warning",
        critical: "bg-critical-bg text-critical",
        sample: "border border-dashed border-neutral-300 bg-neutral-50 text-neutral-500",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
