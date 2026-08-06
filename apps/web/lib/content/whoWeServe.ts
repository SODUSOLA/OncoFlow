import {
  Building2,
  HeartPulse,
  Landmark,
  Stethoscope,
  UserRound,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

export interface AudienceCard {
  icon: LucideIcon;
  title: string;
  benefit: string;
}

/** Brief, one-liner audience cards — answers "is this for me?" immediately. */
export const whoWeServe: AudienceCard[] = [
  {
    icon: UserRound,
    title: "Cancer Patients",
    benefit: "One clear timeline for your care, from first appointment to long-term follow-up.",
  },
  {
    icon: Stethoscope,
    title: "Oncologists",
    benefit: "A consultation calendar and live transcript that keep pace with your clinical day.",
  },
  {
    icon: HeartPulse,
    title: "Medical Officers",
    benefit: "An SLA-backed triage queue with safety checks built into every prescription decision.",
  },
  {
    icon: UsersRound,
    title: "Nurses",
    benefit: "A mobile-first schedule and upload workflow designed for the field, not a desk.",
  },
  {
    icon: Landmark,
    title: "Hospital Administrators",
    benefit: "Real-time visibility into scheduling, inventory, and invoicing across every facility.",
  },
  {
    icon: Building2,
    title: "Cancer Centers",
    benefit: "A single system of record that keeps every partner facility on the same page.",
  },
];
