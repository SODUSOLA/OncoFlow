import { Section } from "@/components/ui/Section";
import { Reveal } from "@/components/ui/Reveal";
import { careCategories } from "@/lib/content/metrics";

export function BuiltForModernCare() {
  return (
    <Section tone="surface" className="py-12 md:py-16">
      <Reveal>
        <p className="text-center text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Built for Modern Cancer Care
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
          {careCategories.map((c) => (
            <span key={c.label} className="text-base font-semibold text-neutral-400">
              {c.label}
            </span>
          ))}
        </div>
      </Reveal>
    </Section>
  );
}
