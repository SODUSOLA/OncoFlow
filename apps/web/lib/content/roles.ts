import {
  BriefcaseMedical,
  HeartHandshake,
  ShieldCheck,
  Stethoscope,
  UserRound,
  Video,
  type LucideIcon,
} from "lucide-react";

export interface RoleDetail {
  icon: LucideIcon;
  role: string;
  summary: string;
  benefits: string[];
}

/** Deeper, per-role breakdown — the fuller companion to the brief "Who We Serve" teaser cards. */
export const roleDetails: RoleDetail[] = [
  {
    icon: UserRound,
    role: "Patients",
    summary: "One timeline for the entire care journey — no more chasing updates across phone calls and messages.",
    benefits: [
      "Clear 7-day countdown to chemo day, with every step visible",
      "Wallet and invoices in plain language, not tariff codes",
      "Direct, response-time-backed chat with clinical and admin teams",
    ],
  },
  {
    icon: HeartHandshake,
    role: "Virtual Medical Officers",
    summary: "A single, SLA-driven queue for side-effect triage, with safety gates that can't be skipped.",
    benefits: [
      "2-minute response countdown, visible per thread",
      "Mandatory triage checklist before any prescription action unlocks",
      "Scoped patient context — only what's needed for the case at hand",
    ],
  },
  {
    icon: Stethoscope,
    role: "Consulting Oncologists",
    summary: "A clean consultation calendar backed by live transcription, so notes never lag behind the conversation.",
    benefits: [
      "Physical and virtual sessions distinguished at a glance",
      "Editable, real-time transcript during and after every call",
      "One-click access to the patient folder from any appointment",
    ],
  },
  {
    icon: BriefcaseMedical,
    role: "Nurses",
    summary: "Field-ready tools built mobile-first, because this role rarely sits at a desk.",
    benefits: [
      "Auto-populated next-day schedule, ready by 2pm the day before",
      "A deliberately strict upload sequence that protects against filing to the wrong patient",
      "Cross-support alerts surfaced prominently, not buried in a menu",
    ],
  },
  {
    icon: ShieldCheck,
    role: "Clinical Directors",
    summary: "Sign-off authority with the context to make a fast, safe call — every time.",
    benefits: [
      "Vetting queue sorted by urgency, not just recency",
      "Decline decisions require a documented reason, never a quick rejection click",
      "Dual sign-off on misconduct review, separate from routine account actions",
    ],
  },
  {
    icon: Video,
    role: "Regional Administrators",
    summary: "The operational cockpit for every active patient's pre-chemo countdown, statewide.",
    benefits: [
      "Every patient's Day 7-to-0 position visible on one board",
      "Zero-manual-input invoicing — dropdown-driven, not typed",
      "Inventory reconciliation and variance flagged automatically, weekly",
    ],
  },
];
