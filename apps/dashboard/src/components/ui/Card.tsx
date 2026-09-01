import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

// Corners of the artifact's ".blueprint" registration-mark treatment — a small "+" at each
// corner of a card, used on the dashboard-grid pages to match its blueprint aesthetic.
const CORNER_POSITIONS = [
  "-left-[6px] -top-[6px]",
  "-right-[6px] -top-[6px]",
  "-left-[6px] -bottom-[6px]",
  "-right-[6px] -bottom-[6px]",
] as const;

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Renders small "+" registration marks at the card's corners. */
  blueprint?: boolean;
}

export function Card({ className, blueprint, children, ...props }: CardProps) {
  return (
    <div className={cn("relative rounded border border-gray-200 bg-white", className)} {...props}>
      {blueprint &&
        CORNER_POSITIONS.map((pos) => (
          <span
            key={pos}
            aria-hidden="true"
            className={cn("pointer-events-none absolute select-none text-[10px] leading-none text-gray-300", pos)}
          >
            +
          </span>
        ))}
      {children}
    </div>
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("border-b border-gray-100 px-5 py-4", className)} {...props} />;
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5", className)} {...props} />;
}
