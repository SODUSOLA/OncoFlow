import { Section, SectionHeading } from "@/components/ui/Section";
import { Card } from "@/components/ui/Card";
import { Reveal } from "@/components/ui/Reveal";
import { whoWeServe } from "@/lib/content/whoWeServe";

export function WhoWeServe() {
  return (
    <Section tone="surface">
      <SectionHeading eyebrow="Who We Serve" title="Built for everyone in the care pathway" />
      <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {whoWeServe.map((item, i) => (
          <Reveal key={item.title} delay={i * 0.04}>
            <Card variant="interactive" className="h-full">
              <item.icon className="size-8 text-accent-gold" aria-hidden="true" />
              <h3 className="mt-4 font-display text-lg font-bold text-primary">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600">{item.benefit}</p>
            </Card>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
