import { Quote } from "lucide-react";
import { Section, SectionHeading } from "@/components/ui/Section";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Reveal } from "@/components/ui/Reveal";
import { testimonials } from "@/lib/content/testimonials";

export function Testimonials() {
  return (
    <Section tone="surface">
      <div className="flex flex-col items-center gap-4 text-center">
        <SectionHeading eyebrow="Testimonials" title="What early partners are saying" className="mb-0" />
        <Badge variant="sample">Sample testimonials — pending real partner quotes</Badge>
      </div>
      <div className="mt-14 grid gap-6 lg:grid-cols-3">
        {testimonials.map((t, i) => (
          <Reveal key={t.name} delay={i * 0.06}>
            <Card variant="interactive" className="flex h-full flex-col">
              <Quote className="size-6 text-accent-gold" aria-hidden="true" />
              <p className="mt-4 flex-1 text-sm leading-relaxed text-neutral-700">&ldquo;{t.quote}&rdquo;</p>
              <div className="mt-6 border-t border-neutral-100 pt-4">
                <p className="text-sm font-semibold text-primary">{t.name}</p>
                <p className="text-xs text-neutral-500">{t.role}</p>
              </div>
            </Card>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
