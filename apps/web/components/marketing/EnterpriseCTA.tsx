import { Button } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";
import { Section } from "@/components/ui/Section";

// Enterprise call-to-action section.
export function EnterpriseCTA() {
  return (
    <Section tone="primary">
      <Reveal className="mx-auto max-w-2xl text-center">
        <h2 className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Ready to bring your care pathway into one system?
        </h2>
        <p className="mt-4 text-lg leading-relaxed text-white/70">
          Whether you&apos;re a hospital evaluating a partner network or a patient starting
          treatment, OncoFlow gives you one place to see what&apos;s happening next.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Button href="/register" variant="secondary" size="lg">
            Get Started
          </Button>
          <Button
            href="/contact"
            variant="outline"
            size="lg"
            className="border-white/30 text-white hover:border-white hover:bg-white/10"
          >
            Book a Demo
          </Button>
          <Button href="/contact" variant="ghost" size="lg" className="text-white hover:bg-white/10">
            Talk to Our Team
          </Button>
        </div>
      </Reveal>
    </Section>
  );
}
