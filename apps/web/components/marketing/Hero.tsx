"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { DashboardPreview } from "./DashboardPreview";

/** First-paint entrance only — a short choreographed stagger, well under 300ms. */
export function Hero() {
  const shouldReduceMotion = useReducedMotion();
  // Builds the staggered entrance animation for the nth hero element, disabled under reduced motion.
  const stagger = (i: number) => ({
    initial: shouldReduceMotion ? false : { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.25, ease: "easeOut" as const, delay: shouldReduceMotion ? 0 : i * 0.06 },
  });

  return (
    <section className="overflow-hidden bg-surface-muted">
      <Container className="grid items-center gap-16 py-16 md:py-24 lg:grid-cols-2 lg:py-32">
        <div>
          <motion.p {...stagger(0)} className="mb-4 text-sm font-semibold uppercase tracking-wide text-accent-gold">
            Oncology Care Navigation
          </motion.p>
          <motion.h1
            {...stagger(1)}
            className="font-display text-4xl font-bold tracking-tight text-primary sm:text-5xl lg:text-6xl"
          >
            Cancer care navigation that doesn&apos;t depend on a phone call.
          </motion.h1>
          <motion.p {...stagger(2)} className="mt-6 max-w-xl text-lg leading-relaxed text-neutral-600">
            OncoFlow replaces fragmented, paper-based, and WhatsApp-driven case management
            with one secure system of record — enforcing the clinical pathway from
            registration through chemotherapy and long-term follow-up.
          </motion.p>
          <motion.div {...stagger(3)} className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button href="/register" size="lg">
              Get Started
            </Button>
            <Button href="/contact" variant="outline" size="lg">
              Book a Demo
            </Button>
            <Button href="/contact" variant="ghost" size="lg">
              Talk to Our Team
            </Button>
          </motion.div>
        </div>

        <motion.div {...stagger(2)}>
          <DashboardPreview />
        </motion.div>
      </Container>
    </section>
  );
}
