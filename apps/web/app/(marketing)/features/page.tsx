import type { Metadata } from "next";
import { Section } from "@/components/ui/Section";
import { Card } from "@/components/ui/Card";
import { Reveal } from "@/components/ui/Reveal";
import { Button } from "@/components/ui/Button";
import { features } from "@/lib/content/features";
import { SecurityGrid } from "@/components/marketing/SecurityGrid";

export const metadata: Metadata = {
  title: "Features",
  description:
    "The complete OncoFlow feature set — scheduling, video consultation, care navigation, secure messaging, and more.",
};

export default function FeaturesPage() {
  return (
    <>
      <Section tone="muted" className="pb-10 pt-16 md:pb-14 md:pt-20">
        <Reveal className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-accent-gold">Platform Features</p>
          <h1 className="mt-4 font-display text-4xl font-bold tracking-tight text-primary sm:text-5xl">
            Every tool the care pathway needs
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-neutral-600">
            Built as one connected system, not a set of separate tools stitched together after
            the fact.
          </p>
        </Reveal>
      </Section>

      <Section tone="surface">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
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

      <SecurityGrid />

      <Section tone="primary">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl font-bold text-white">See these features on your own patients</h2>
          <div className="mt-8 flex justify-center gap-3">
            <Button href="/register" variant="secondary" size="lg">
              Get Started
            </Button>
            <Button href="/contact" variant="ghost" size="lg" className="text-white hover:bg-white/10">
              Book a Demo
            </Button>
          </div>
        </Reveal>
      </Section>
    </>
  );
}
