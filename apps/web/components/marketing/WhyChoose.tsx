import { Check, X } from "lucide-react";
import { Section, SectionHeading } from "@/components/ui/Section";
import { Reveal } from "@/components/ui/Reveal";
import { comparisonRows } from "@/lib/content/metrics";

// Why-choose-us section.
export function WhyChoose() {
  return (
    <Section tone="surface">
      <SectionHeading eyebrow="Why Choose OncoFlow" title="Traditional workflow vs. OncoFlow" />
      <Reveal>
        <div className="mt-14 overflow-hidden rounded-2xl border border-neutral-200 shadow-sm">
          <div className="grid grid-cols-2 divide-x divide-neutral-200">
            <div className="bg-surface-muted px-6 py-4">
              <p className="text-sm font-semibold text-neutral-500">Traditional Workflow</p>
            </div>
            <div className="bg-primary px-6 py-4">
              <p className="text-sm font-semibold text-white">OncoFlow Workflow</p>
            </div>
          </div>
          <div className="divide-y divide-neutral-200">
            {comparisonRows.map((row) => (
              <div key={row.traditional} className="grid grid-cols-2 divide-x divide-neutral-200">
                <div className="flex items-start gap-2.5 px-6 py-5">
                  <X className="mt-0.5 size-4 shrink-0 text-neutral-400" aria-hidden="true" />
                  <p className="text-sm text-neutral-600">{row.traditional}</p>
                </div>
                <div className="flex items-start gap-2.5 bg-primary-50 px-6 py-5">
                  <Check className="mt-0.5 size-4 shrink-0 text-teal" aria-hidden="true" />
                  <p className="text-sm font-medium text-primary">{row.oncoflow}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Reveal>
    </Section>
  );
}
