import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const cardVariants = cva("rounded-xl border border-neutral-200 bg-surface p-6", {
  variants: {
    variant: {
      default: "",
      interactive:
        "transition-[transform,box-shadow] duration-hover ease-out hover:-translate-y-1 hover:shadow-sm",
      elevated: "shadow-sm",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

export function Card({ className, variant, ...props }: CardProps) {
  return <div className={cn(cardVariants({ variant }), className)} {...props} />;
}
