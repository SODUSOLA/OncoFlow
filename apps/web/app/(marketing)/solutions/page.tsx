import type { Metadata } from "next";
import { Video, Building2 } from "lucide-react";
import { Section, SectionHeading } from "@/components/ui/Section";
import { Card } from "@/components/ui/Card";
import { Reveal } from "@/components/ui/Reveal";
import { Button } from "@/components/ui/Button";
import { serviceClassifications } from "@/lib/content/services";

export const metadata: Metadata = {
  title: "Solutions",
  description:
    "What OncoFlow does and the hybrid virtual and physical care model behind it, explained in plain language.",
};

// Solutions page.
export default function SolutionsPage() {
  return (
    <>
      <Section tone="muted" className="pb-10 pt-16 md:pb-14 md:pt-20">
        <Reveal className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-accent-gold">Solutions</p>
          <h1 className="mt-4 font-display text-4xl font-bold tracking-tight text-primary sm:text-5xl">
            One platform, six kinds of care
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-neutral-600">
            OncoFlow coordinates every stage of oncology care through a hybrid model — some
            services happen over video, others need a bed and a facility. The platform tracks
            both the same way: one record, one pathway.
          </p>
        </Reveal>
      </Section>

      <Section tone="surface">
        <SectionHeading eyebrow="Services" title="What OncoFlow coordinates" />
        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {serviceClassifications.map((service, i) => (
            <Reveal key={service.title} delay={(i % 3) * 0.05}>
              <Card variant="interactive" className="h-full">
                <service.icon className="size-8 text-primary" aria-hidden="true" />
                <h3 className="mt-4 font-display text-base font-bold text-primary">{service.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-600">{service.description}</p>
                <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-accent-gold">
                  {service.mode}
                </p>
              </Card>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section tone="muted" id="hybrid-model">
        <SectionHeading eyebrow="The Hybrid Model" title="Virtual and physical care, one continuous record" />
        <div className="mx-auto mt-14 grid max-w-4xl gap-8 sm:grid-cols-2">
          <Reveal>
            <div className="h-full rounded-xl border border-neutral-200 bg-surface p-6 shadow-sm">
              <Video className="size-8 text-teal" aria-hidden="true" />
              <h3 className="mt-4 font-display text-lg font-bold text-primary">Virtual Care</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600">
                Consultations, drug administration reviews, and side-effect triage happen over
                secure video and chat — no travel required until a physical visit is clinically necessary.
              </p>
            </div>
          </Reveal>
          <Reveal delay={0.05}>
            <div className="h-full rounded-xl border border-neutral-200 bg-surface p-6 shadow-sm">
              <Building2 className="size-8 text-teal" aria-hidden="true" />
              <h3 className="mt-4 font-display text-lg font-bold text-primary">Physical Care</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600">
                Chemotherapy, general admission, and procedures happen at a partner facility,
                scheduled and tracked against the same patient timeline as every virtual step.
              </p>
            </div>
          </Reveal>
        </div>
      </Section>

      <Section tone="primary">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl font-bold text-white">See it on your own patients</h2>
          <p className="mt-4 text-lg leading-relaxed text-white/70">
            Talk to our team about bringing your facility or clinical network onto OncoFlow.
          </p>
          <div className="mt-8 flex justify-center">
            <Button href="/contact" variant="secondary" size="lg">
              Talk to Our Team
            </Button>
          </div>
        </Reveal>
      </Section>
    </>
  );
}
