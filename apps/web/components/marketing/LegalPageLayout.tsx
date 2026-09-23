import { AlertTriangle } from "lucide-react";
import { Section } from "@/components/ui/Section";

// Layout shared by the legal pages.
export function LegalPageLayout({
  title,
  lastUpdated,
  children,
}: {
  title: string;
  lastUpdated: string;
  children: React.ReactNode;
}) {
  return (
    <Section tone="surface" className="py-16 md:py-24">
      <div className="prose-measure mx-auto">
        <h1 className="font-display text-3xl font-bold tracking-tight text-primary sm:text-4xl">{title}</h1>
        <p className="mt-2 text-sm text-neutral-500">Last updated: {lastUpdated}</p>

        <div className="mt-6 flex gap-3 rounded-xl border border-dashed border-warning bg-warning-bg p-4">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" />
          <p className="text-sm leading-relaxed text-warning">
            This page is a draft placeholder pending review by legal counsel. It does not yet
            reflect OncoFlow&apos;s finalized policy and should not be relied on as legal advice.
          </p>
        </div>

        <div className="mt-10 space-y-6 leading-relaxed text-neutral-700 [&_h2]:mt-8 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-primary">
          {children}
        </div>
      </div>
    </Section>
  );
}
