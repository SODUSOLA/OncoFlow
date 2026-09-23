import { Section, SectionHeading } from "@/components/ui/Section";
import { Card } from "@/components/ui/Card";
import { Reveal } from "@/components/ui/Reveal";
import { features } from "@/lib/content/features";

// Feature grid section.
export function FeatureGrid() {
  return (
    <Section tone="muted" id="features">
      <SectionHeading
        eyebrow="Platform Features"
        title="Everything the care pathway needs, in one system"
      />
      <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((feature, i) => (
          <Reveal key={feature.title} delay={(i % 3) * 0.05}>
            <Card variant="interactive" className="h-full">
              <feature.icon className="size-8 text-primary" aria-hidden="true" />
              <h3 className="mt-4 font-display text-base font-bold text-primary">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600">{feature.description}</p>
            </Card>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
