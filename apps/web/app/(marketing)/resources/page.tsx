import type { Metadata } from "next";
import { BookOpen, FlaskConical, Heart, Lightbulb, Newspaper } from "lucide-react";
import { Section } from "@/components/ui/Section";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Reveal } from "@/components/ui/Reveal";

export const metadata: Metadata = {
  title: "Resources",
  description: "Guides, research, and cancer awareness resources from OncoFlow.",
};

const resourceGroups = [
  {
    id: "blog",
    icon: Newspaper,
    title: "Blog",
    description: "Product updates and stories from partner facilities.",
  },
  {
    id: "research",
    icon: FlaskConical,
    title: "Research",
    description: "Findings on care-pathway outcomes as they become available.",
  },
  {
    id: "guides",
    icon: BookOpen,
    title: "Guides",
    description: "How partner facilities onboard staff and configure the platform.",
  },
  {
    id: "cancer-awareness",
    icon: Heart,
    title: "Cancer Awareness",
    description: "Plain-language resources for patients and families.",
  },
  {
    id: "healthcare-innovation",
    icon: Lightbulb,
    title: "Healthcare Innovation",
    description: "How digital tools are reshaping oncology care delivery.",
  },
];

export default function ResourcesPage() {
  return (
    <>
      <Section tone="muted" className="pb-10 pt-16 md:pb-14 md:pt-20">
        <Reveal className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-accent-gold">Resources</p>
          <h1 className="mt-4 font-display text-4xl font-bold tracking-tight text-primary sm:text-5xl">
            Learn more about OncoFlow and cancer care
          </h1>
        </Reveal>
      </Section>

      <Section tone="surface">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {resourceGroups.map((group, i) => (
            <Reveal key={group.id} delay={(i % 3) * 0.05}>
              <Card id={group.id} variant="default" className="h-full scroll-mt-24">
                <group.icon className="size-8 text-primary" aria-hidden="true" />
                <h2 className="mt-4 font-display text-lg font-bold text-primary">{group.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-neutral-600">{group.description}</p>
                <Badge variant="sample" className="mt-4">
                  Coming soon
                </Badge>
              </Card>
            </Reveal>
          ))}
        </div>
      </Section>
    </>
  );
}
