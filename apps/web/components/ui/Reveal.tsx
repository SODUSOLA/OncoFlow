"use client";

import { motion, useReducedMotion } from "framer-motion";
import { EASE_OUT, MOTION_MS } from "@/lib/motion";

/** Minimal, once-only scroll reveal — fade + small lift. Not used for hover/interaction states. */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      className={className}
      initial={shouldReduceMotion ? false : { opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: MOTION_MS.slow / 1000, ease: EASE_OUT, delay }}
    >
      {children}
    </motion.div>
  );
}
