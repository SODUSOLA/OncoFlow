import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "../../lib/utils";

export const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded font-medium",
    "transition-colors duration-150 ease-out",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2",
    "disabled:pointer-events-none disabled:opacity-50",
  ],
  {
    variants: {
      variant: {
        // Main content-area CTA (Publish Schedule, Approve, Confirm, Next Step) — matches the
        // mockups' dark-navy filled buttons.
        primary: "bg-ink text-white hover:bg-ink-600",
        // Gold is this app's accent color, but it's spoken for elsewhere: the newer mockups
        // (Sept 2026 pass) use it for the sidebar's active-nav-item highlight
        // (RegionalAdminLayout), not for a button. This variant is currently unused — kept
        // in case a genuinely distinct, more-prominent CTA is needed later, but don't reach
        // for it as "the gold button" without checking it doesn't clash with that nav highlight.
        accent: "bg-gold text-ink hover:bg-gold/90",
        outline: "border border-gray-300 bg-white text-gray-700 hover:border-ink hover:text-ink",
        ghost: "bg-transparent text-gray-600 hover:bg-gray-100",
        danger: "bg-red-600 text-white hover:bg-red-700",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-4 text-sm",
        lg: "h-11 px-5 text-sm",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export function Button({ className, variant, size, loading, disabled, children, ...props }: ButtonProps) {
  return (
    <button className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} {...props}>
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}
