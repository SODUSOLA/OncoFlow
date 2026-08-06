import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { Reveal } from "@/components/ui/Reveal";

export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[calc(100vh-4.5rem-20rem)] items-center justify-center bg-surface-muted px-4 py-16">
      <Reveal className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Link href="/">
            <Logo />
          </Link>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-surface p-8 shadow-md">
          <h1 className="font-display text-2xl font-bold text-primary">{title}</h1>
          {description && <p className="mt-2 text-sm leading-relaxed text-neutral-600">{description}</p>}
          <div className="mt-6">{children}</div>
        </div>
        {footer && <div className="mt-6 text-center text-sm text-neutral-600">{footer}</div>}
      </Reveal>
    </div>
  );
}
