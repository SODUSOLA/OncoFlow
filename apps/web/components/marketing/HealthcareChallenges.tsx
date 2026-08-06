import { Section, SectionHeading } from "@/components/ui/Section";
import { Reveal } from "@/components/ui/Reveal";
import { challenges } from "@/lib/content/challenges";

export function HealthcareChallenges() {
  return (
    <Section tone="muted">
      <SectionHeading
        eyebrow="The Challenge"
        title="The failure modes we designed against"
        description="Every one of these is a documented pattern in oncology case management across partner-hospital networks — not a hypothetical."
      />
      <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {challenges.map((c, i) => (
          <Reveal key={c.title} delay={i * 0.04}>
            <div className="h-full rounded-xl border border-neutral-200 bg-surface p-6 shadow-sm">
              <c.icon className="size-7 text-critical" aria-hidden="true" />
              <h3 className="mt-4 font-display text-base font-bold text-primary">{c.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600">{c.description}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
