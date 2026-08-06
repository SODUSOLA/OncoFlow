import type { Transition, Variants } from "framer-motion";

/**
 * Motion tokens in milliseconds, mirroring the CSS duration-* utilities
 * defined in app/globals.css. Keep these two in sync.
 */
export const MOTION_MS = {
  fast: 150,
  standard: 250,
  slow: 400,
  hover: 200,
  page: 120,
  logo: 1000,
} as const;

export const EASE_OUT: Transition["ease"] = [0.16, 1, 0.3, 1];
export const EASE_IN_OUT: Transition["ease"] = [0.65, 0, 0.35, 1];

/** Scroll-reveal used sparingly for section entrances — fade + small lift only. */
export const revealVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: MOTION_MS.slow / 1000, ease: EASE_OUT },
  },
};

export const staggerContainer = (staggerMs = 80): Variants => ({
  hidden: {},
  visible: {
    transition: { staggerChildren: staggerMs / 1000 },
  },
});

export const fadeInUp = (delayMs = 0): Variants => ({
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: MOTION_MS.slow / 1000,
      ease: EASE_OUT,
      delay: delayMs / 1000,
    },
  },
});
