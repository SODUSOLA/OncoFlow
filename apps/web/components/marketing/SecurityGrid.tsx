import { FileCheck2, Fingerprint, KeyRound, Lock, ScrollText, ServerCog } from "lucide-react";
import { Section, SectionHeading } from "@/components/ui/Section";
import { Reveal } from "@/components/ui/Reveal";

const securityItems = [
  {
    icon: KeyRound,
    title: "Role-Based Access Control",
    description: "Every module, endpoint, and screen enforces RBAC — no exceptions for convenience.",
  },
  {
    icon: Lock,
    title: "Encryption",
    description: "Data is encrypted at rest and in transit across the platform.",
  },
  {
    icon: ScrollText,
    title: "Audit Logs",
    description: "Every clinical and administrative action is logged and attributable.",
  },
  {
    icon: Fingerprint,
    title: "Secure Authentication",
    description: "Role-based login with multi-factor authentication for staff accounts.",
  },
  {
    icon: FileCheck2,
    title: "Data Privacy",
    description: "Patient identifiers, like phone numbers, are scoped to the roles that need them — never exposed by default.",
  },
  {
    icon: ServerCog,
    title: "Secure Infrastructure",
    description: "Built toward HIPAA/GDPR-ready practices as the platform matures — no certification is claimed until formally obtained.",
  },
];

// Security highlights grid.
export function SecurityGrid() {
  return (
    <Section tone="muted" id="security">
      <SectionHeading
        eyebrow="Security & Privacy"
        title="Built with clinical and financial risk in mind, from the first draft"
      />
      <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {securityItems.map((item, i) => (
          <Reveal key={item.title} delay={(i % 3) * 0.05}>
            <div className="h-full rounded-xl border border-neutral-200 bg-surface p-6 shadow-sm">
              <item.icon className="size-7 text-teal" aria-hidden="true" />
              <h3 className="mt-4 font-display text-base font-bold text-primary">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600">{item.description}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
