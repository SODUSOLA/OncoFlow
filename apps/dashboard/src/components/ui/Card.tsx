import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function Card(
  { className, children, ...props },
  ref,
) {
  return (
    <div ref={ref} className={cn("relative rounded border border-gray-200 bg-white", className)} {...props}>
      {children}
    </div>
  );
});

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("border-b border-gray-100 px-5 py-4", className)} {...props} />;
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5", className)} {...props} />;
}
