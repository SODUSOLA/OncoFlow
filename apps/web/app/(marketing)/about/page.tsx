import type { Metadata } from "next";
import { CheckCircle2 } from "lucide-react";
import { Section, SectionHeading } from "@/components/ui/Section";
import { Reveal } from "@/components/ui/Reveal";
import { Button } from "@/components/ui/Button";
import { challenges } from "@/lib/content/challenges";

export const metadata: Metadata = {
  title: "About",
  description:
    "Why OncoFlow exists, the problem it solves, and the values guiding how we build for cancer care teams and patients.",
};

const values = [
  { title: "Safety over speed", body: "Where the two trade off, safety wins — this is healthcare, and a fast shortcut that makes an error easier is a failed design." },
  { title: "Clinical-first", body: "Every screen serves the care pathway or the person navigating it. Nothing is decorative at the expense of clarity." },
  { title: "Accessibility-first", body: "Designed for WCAG 2.1 AA from the first draft, not retrofitted after launch." },
  { title: "Calm, not urgent", body: "No gamification, no manufactured urgency beyond the SLA timers the product genuinely needs." },
];

export default function AboutPage() {
  return (
    <>
      <Section tone="muted" className="pb-10 pt-16 md:pb-14 md:pt-20">
        <Reveal className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-accent-gold">About OncoFlow</p>
          <h1 className="mt-4 font-display text-4xl font-bold tracking-tight text-primary sm:text-5xl">
            Our Mission
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-neutral-600">
            To hard-enforce the cancer care pathway in software — so that a patient&apos;s
            outcome never depends on whether a phone call was returned in time.
          </p>
        </Reveal>
      </Section>

      <Section tone="surface">
        <div className="mx-auto max-w-3xl">
          <Reveal>
            <h2 className="font-display text-2xl font-bold text-primary">Why We Built OncoFlow</h2>
            <p className="mt-4 leading-relaxed text-neutral-600">
              Cancer mortality across partner-hospital networks is disproportionately driven by
              care-pathway failures rather than disease severity alone: missed pre-treatment
              labs, delayed clinical sign-off, drug stock-outs at the point of care, and lost
              continuity when a patient moves between facilities. Those are solvable problems —
              they just weren&apos;t being solved by a system built for it. OncoFlow was built to
              directly target that gap, in direct service of better health outcomes.
            </p>
          </Reveal>

          <Reveal className="mt-14" delay={0.05}>
            <h2 className="font-display text-2xl font-bold text-primary">The Problem We&apos;re Solving</h2>
            <p className="mt-4 leading-relaxed text-neutral-600">
              Oncology care coordination has depended on manual phone calls, chat groups, paper
              lab slips, and spreadsheet-based tariff lookups. That produces four recurring
              failure modes:
            </p>
            <ul className="mt-6 space-y-3">
              {challenges.slice(0, 4).map((c) => (
                <li key={c.title} className="flex gap-3">
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-teal" aria-hidden="true" />
                  <div>
                    <p className="font-semibold text-primary">{c.title}</p>
                    <p className="text-sm text-neutral-600">{c.description}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal className="mt-14" delay={0.1}>
            <h2 className="font-display text-2xl font-bold text-primary">Our Approach</h2>
            <p className="mt-4 leading-relaxed text-neutral-600">
              Every patient is tracked against one permanent Unique Patient ID. Every service is
              priced automatically against a location-aware tariff engine. Every clinical action
              is gated by role-based access control and full audit logging. We follow a
              documented cycle — requirements, design, implementation, testing, deployment,
              monitoring — with a sign-off gate between each phase, for every feature we ship.
            </p>
          </Reveal>
        </div>
      </Section>

      <Section tone="muted">
        <SectionHeading eyebrow="What We Stand For" title="Core Values" />
        <div className="mx-auto mt-14 grid max-w-3xl gap-8 sm:grid-cols-2">
          {values.map((v, i) => (
            <Reveal key={v.title} delay={i * 0.05}>
              <h3 className="font-display text-lg font-bold text-primary">{v.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600">{v.body}</p>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section tone="surface">
        <Reveal className="mx-auto max-w-3xl">
          <h2 className="font-display text-2xl font-bold text-primary">Our Vision for Cancer Care</h2>
          <p className="mt-4 leading-relaxed text-neutral-600">
            A future where no patient&apos;s treatment is delayed because a lab result sat in the
            wrong inbox, and no clinician has to reconstruct a case history from memory. One
            system of record, shared honestly across every hospital, clinician, and patient in
            the network — built to scale to the next partner facility without losing the rigor
            that protects the first one.
          </p>
        </Reveal>
      </Section>

      <Section tone="primary">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl font-bold text-white">Join Our Mission</h2>
          <p className="mt-4 text-lg leading-relaxed text-white/70">
            We&apos;re building this alongside partner hospitals, clinicians, and patients who are
            willing to demand better from the systems coordinating their care.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button href="/careers" variant="secondary" size="lg">
              View Careers
            </Button>
            <Button href="/contact" variant="ghost" size="lg" className="text-white hover:bg-white/10">
              Talk to Our Team
            </Button>
          </div>
        </Reveal>
      </Section>
    </>
  );
}
