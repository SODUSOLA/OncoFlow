import type { Metadata } from "next";
import { Section } from "@/components/ui/Section";
import { Reveal } from "@/components/ui/Reveal";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

export const metadata: Metadata = {
  title: "Careers",
  description: "Join the team building OncoFlow's oncology care navigation platform.",
};

// Careers page.
export default function CareersPage() {
  return (
    <Section tone="surface" className="py-16 md:py-24">
      <Reveal className="prose-measure mx-auto text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-accent-gold">Careers</p>
        <h1 className="mt-4 font-display text-4xl font-bold tracking-tight text-primary">
          Help build the system cancer care deserves
        </h1>
        <p className="mt-6 leading-relaxed text-neutral-600">
          We&apos;re a small, focused team building a platform that hard-enforces safety into
          every step of the cancer care pathway. We&apos;re not actively hiring for open roles right
          now, but we&apos;re always glad to hear from clinicians, engineers, and operators who care
          about this problem.
        </p>
        <div className="mt-6 flex justify-center">
          <Badge variant="sample">No open roles listed at this time</Badge>
        </div>
        <div className="mt-8 flex justify-center">
          <Button href="/contact" size="lg">
            Get in Touch
          </Button>
        </div>
      </Reveal>
    </Section>
  );
}
