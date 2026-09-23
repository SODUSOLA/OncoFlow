import { cn } from "@/lib/utils";

// Centered max-width page container.
export function Container({
  className,
  children,
  as: Comp = "div",
}: {
  className?: string;
  children: React.ReactNode;
  as?: React.ElementType;
}) {
  return <Comp className={cn("container-page", className)}>{children}</Comp>;
}
