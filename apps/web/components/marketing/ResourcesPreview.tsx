import { BookOpen, FlaskConical, Heart, Lightbulb, Newspaper } from "lucide-react";
import { Section, SectionHeading } from "@/components/ui/Section";
import { Card } from "@/components/ui/Card";
import { Reveal } from "@/components/ui/Reveal";

const resources = [
  { icon: Newspaper, title: "Blog", description: "Product updates and stories from the field." },
  { icon: FlaskConical, title: "Research", description: "Findings on care-pathway outcomes." },
  { icon: BookOpen, title: "Guides", description: "How partner facilities onboard and operate." },
  { icon: Heart, title: "Cancer Awareness", description: "Plain-language resources for patients and families." },
  { icon: Lightbulb, title: "Healthcare Innovation", description: "How digital tools are reshaping care delivery." },
];

// Resources preview section.
export function ResourcesPreview() {
  return (
    <Section tone="surface" id="resources">
      <SectionHeading eyebrow="Resources" title="Learn more about OncoFlow and cancer care" />
      <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
        {resources.map((r, i) => (
          <Reveal key={r.title} delay={i * 0.04}>
            <Card variant="interactive" className="h-full">
              <r.icon className="size-7 text-primary" aria-hidden="true" />
              <h3 className="mt-4 font-display text-base font-bold text-primary">{r.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600">{r.description}</p>
            </Card>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
