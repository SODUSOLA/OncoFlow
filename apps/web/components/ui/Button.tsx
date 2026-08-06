import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold",
    "transition-[background-color,color,box-shadow,transform] duration-fast ease-out",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
    "disabled:pointer-events-none disabled:opacity-50",
  ],
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-white shadow-sm hover:bg-primary-hover hover:shadow-md active:translate-y-px",
        secondary:
          "bg-accent text-primary shadow-sm hover:bg-accent-hover hover:shadow-md active:translate-y-px",
        outline:
          "border border-neutral-300 bg-transparent text-primary hover:border-primary hover:bg-primary-50",
        ghost: "bg-transparent text-primary hover:bg-primary-50",
        danger:
          "bg-critical text-white shadow-sm hover:bg-critical/90 hover:shadow-md active:translate-y-px",
      },
      size: {
        sm: "h-9 px-4 text-sm",
        md: "h-11 px-6 text-sm",
        lg: "h-12 px-8 text-base",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
  href?: string;
}

export function Button({
  className,
  variant,
  size,
  loading,
  disabled,
  href,
  children,
  ...props
}: ButtonProps) {
  const classes = cn(buttonVariants({ variant, size }), className);

  if (href) {
    const { onClick, id, ...rest } = props;
    void rest;
    return (
      <Link
        href={href}
        id={id}
        onClick={onClick as unknown as React.MouseEventHandler<HTMLAnchorElement>}
        className={classes}
        aria-disabled={disabled || loading}
      >
        {loading && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
        {children}
      </Link>
    );
  }

  return (
    <button className={classes} disabled={disabled || loading} {...props}>
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}
