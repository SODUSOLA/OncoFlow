"use client";

import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { MOTION_MS } from "@/lib/motion";
import { RIBBON_FACET_PATHS, RIBBON_PATH, RIBBON_VIEWBOX } from "./ribbon-paths";

interface LogoProps {
  className?: string;
  /** Hide the "OncoFlow" wordmark — icon only (e.g. compact mobile header). */
  iconOnly?: boolean;
  /** Render for a dark (navy) background — e.g. the footer. */
  onDark?: boolean;
}

const RIBBON_DRAW_S = MOTION_MS.logo / 1000;
const FILL_CROSSFADE_S = 0.2;
const FACET_FADE_S = 0.25;
const WORDMARK_LIFT_S = MOTION_MS.slow / 1000;

export function Logo({ className, iconOnly = false, onDark = false }: LogoProps) {
  const shouldReduceMotion = useReducedMotion();
  const inkColor = onDark ? "#ffffff" : "var(--color-primary)";

  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <motion.svg
        viewBox={RIBBON_VIEWBOX}
        className={cn(
          "h-8 w-auto shrink-0 md:h-9",
          "transition-[filter,transform] duration-hover ease-out",
          "[@media(hover:hover)]:hover:drop-shadow-md",
          "motion-safe:[@media(hover:hover)]:hover:scale-[1.02]"
        )}
        style={{ transformOrigin: "50% 50%" }}
        aria-hidden="true"
      >
        <motion.path
          d={RIBBON_PATH}
          fill="none"
          stroke={inkColor}
          strokeWidth={16}
          strokeLinejoin="round"
          strokeLinecap="round"
          initial={shouldReduceMotion ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: shouldReduceMotion ? 0 : RIBBON_DRAW_S, ease: "easeOut" }}
        />
        <motion.path
          d={RIBBON_PATH}
          fill={inkColor}
          initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={
            shouldReduceMotion
              ? { duration: 0 }
              : {
                  duration: FILL_CROSSFADE_S,
                  ease: "easeOut",
                  delay: RIBBON_DRAW_S - FILL_CROSSFADE_S,
                }
          }
        />
        <motion.g
          initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={
            shouldReduceMotion
              ? { duration: 0 }
              : { duration: FACET_FADE_S, ease: "easeOut", delay: RIBBON_DRAW_S - 0.05 }
          }
        >
          {RIBBON_FACET_PATHS.map((d, i) => (
            <path key={i} d={d} fill="var(--color-accent-gold)" />
          ))}
        </motion.g>
      </motion.svg>

      {!iconOnly && (
        <motion.span
          className={cn(
            "font-display text-lg font-bold tracking-tight md:text-xl",
            onDark ? "text-white" : "text-primary"
          )}
          initial={shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={
            shouldReduceMotion
              ? { duration: 0 }
              : { duration: WORDMARK_LIFT_S, ease: "easeOut", delay: RIBBON_DRAW_S }
          }
        >
          OncoFlow
        </motion.span>
      )}
    </span>
  );
}
