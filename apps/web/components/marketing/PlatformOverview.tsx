import { Section, SectionHeading } from "@/components/ui/Section";
import { Reveal } from "@/components/ui/Reveal";

const overview = [
  {
    title: "What is OncoFlow?",
    body: "A secure, role-based platform that manages the full oncology patient journey — from scheduling through chemotherapy administration and follow-up — across a distributed network of partner hospitals, virtual clinicians, and administrative staff.",
  },
  {
    title: "Why was it built?",
    body: "Cancer care coordination has depended on manual phone calls, chat groups, paper lab slips, and spreadsheet tariffs — a workflow where a single missed step can delay treatment that can't afford to wait.",
  },
  {
    title: "Problems it solves",
    body: "Care-pathway drift, billing inconsistency, fragmented records, and privacy exposure — the four failure modes that most often separate a patient from timely, safe treatment.",
  },
  {
    title: "How it transforms cancer care",
    body: "Every patient is tracked against one permanent Unique Patient ID, every service is priced automatically, and every clinical action is gated by role-based access control and full audit logging.",
  },
];

export function PlatformOverview() {
  return (
    <Section tone="muted">
      <SectionHeading
        eyebrow="Platform Overview"
        title="Built to hard-enforce the clinical pathway in software"
        description="Not a scheduling tool bolted onto old habits — a system that makes the unsafe shortcut impossible to take."
      />
      <div className="mt-14 grid gap-8 sm:grid-cols-2">
        {overview.map((item, i) => (
          <Reveal key={item.title} delay={i * 0.05}>
            <div className="h-full rounded-xl border border-neutral-200 bg-surface p-6 shadow-sm">
              <h3 className="font-display text-lg font-bold text-primary">{item.title}</h3>
              <p className="mt-3 leading-relaxed text-neutral-600">{item.body}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
