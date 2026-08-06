import { cn } from "@/lib/utils";
import { Container } from "./Container";

interface SectionProps {
  className?: string;
  containerClassName?: string;
  children: React.ReactNode;
  id?: string;
  /** Section background — use "muted" to alternate rhythm between sections. */
  tone?: "surface" | "muted" | "primary";
  as?: React.ElementType;
}

const toneClasses: Record<NonNullable<SectionProps["tone"]>, string> = {
  surface: "bg-surface",
  muted: "bg-surface-muted",
  primary: "bg-primary text-white",
};

export function Section({
  className,
  containerClassName,
  children,
  id,
  tone = "surface",
  as: Comp = "section",
}: SectionProps) {
  return (
    <Comp
      id={id}
      className={cn("py-14 md:py-24 lg:py-32", toneClasses[tone], className)}
    >
      <Container className={containerClassName}>{children}</Container>
    </Comp>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "center",
  className,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  align?: "center" | "left";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mx-auto max-w-2xl",
        align === "center" ? "text-center" : "mx-0 text-left",
        className
      )}
    >
      {eyebrow && (
        <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-accent-gold">
          {eyebrow}
        </p>
      )}
      <h2 className="font-display text-3xl font-bold tracking-tight text-primary sm:text-4xl">
        {title}
      </h2>
      {description && (
        <p className="mt-4 text-lg leading-relaxed text-neutral-600">{description}</p>
      )}
    </div>
  );
}
