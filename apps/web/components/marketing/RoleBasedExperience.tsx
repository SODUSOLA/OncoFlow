import { Section, SectionHeading } from "@/components/ui/Section";
import { Card } from "@/components/ui/Card";
import { Reveal } from "@/components/ui/Reveal";
import { roleDetails } from "@/lib/content/roles";

// Role-based experience section.
export function RoleBasedExperience() {
  return (
    <Section tone="surface">
      <SectionHeading
        eyebrow="Role-Based Experience"
        title="Every role sees exactly what it needs — nothing else"
      />
      <div className="mt-14 grid gap-6 lg:grid-cols-2">
        {roleDetails.map((role, i) => (
          <Reveal key={role.role} delay={(i % 2) * 0.06}>
            <Card variant="interactive" className="h-full">
              <div className="flex items-center gap-3">
                <role.icon className="size-7 text-primary" aria-hidden="true" />
                <h3 className="font-display text-lg font-bold text-primary">{role.role}</h3>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-neutral-600">{role.summary}</p>
              <ul className="mt-4 space-y-2">
                {role.benefits.map((b) => (
                  <li key={b} className="flex gap-2 text-sm text-neutral-700">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent-gold" />
                    {b}
                  </li>
                ))}
              </ul>
            </Card>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
