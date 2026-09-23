import { Section, SectionHeading } from "@/components/ui/Section";
import { Reveal } from "@/components/ui/Reveal";
import { journeySteps } from "@/lib/content/journey";

// A static timeline for now; an interactive step-by-step version is a future enhancement.
export function HowItWorks() {
  return (
    <Section tone="surface">
      <SectionHeading eyebrow="How OncoFlow Works" title="The patient journey, end to end" />
      <div className="mt-14">
        <ol className="relative mx-auto max-w-2xl border-l border-neutral-200 pl-8 sm:pl-10">
          {journeySteps.map((step, i) => (
            <Reveal key={step.title} delay={i * 0.05} className="relative pb-10 last:pb-0">
              <span className="absolute -left-[calc(2rem+5px)] top-1 flex size-4 items-center justify-center rounded-full bg-primary ring-4 ring-surface sm:-left-[calc(2.5rem+5px)]" />
              <p className="text-xs font-semibold uppercase tracking-wide text-accent-gold">
                Step {i + 1}
              </p>
              <h3 className="mt-1 font-display text-lg font-bold text-primary">{step.title}</h3>
              <p className="mt-1.5 leading-relaxed text-neutral-600">{step.description}</p>
            </Reveal>
          ))}
        </ol>
      </div>
    </Section>
  );
}
