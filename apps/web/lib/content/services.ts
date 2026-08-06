import {
  Building2,
  CalendarClock,
  Pill,
  ScissorsLineDashed,
  Stethoscope,
  Syringe,
  type LucideIcon,
} from "lucide-react";

export interface ServiceClassification {
  icon: LucideIcon;
  title: string;
  description: string;
  mode: "Virtual or physical" | "Physical only" | "Subscription";
}

/**
 * Plain-language framing of the PRD's six service classifications
 * (§18.1 Master Service Classification), stripped of tariff jargon.
 */
export const serviceClassifications: ServiceClassification[] = [
  {
    icon: CalendarClock,
    title: "Membership & Subscription",
    description: "Ongoing access to the platform and care network, billed monthly or yearly.",
    mode: "Subscription",
  },
  {
    icon: Stethoscope,
    title: "Specialist Consultation",
    description: "Review with an oncologist, surgeon, psycho-oncologist, or nutritionist — virtual or in person.",
    mode: "Virtual or physical",
  },
  {
    icon: Syringe,
    title: "Drug Administration",
    description: "Subcutaneous injections and similar treatments that don't require a bed.",
    mode: "Virtual or physical",
  },
  {
    icon: Pill,
    title: "Chemotherapy",
    description: "Infusion sessions requiring a bed, from a short 30-minute session to multi-hour treatment.",
    mode: "Physical only",
  },
  {
    icon: Building2,
    title: "General Admission",
    description: "Non-chemotherapy supportive care requiring a bed — transfusions, hydration, and similar care.",
    mode: "Physical only",
  },
  {
    icon: ScissorsLineDashed,
    title: "Procedures",
    description: "Minor interventions such as screenings, biopsies, and chemo port placement.",
    mode: "Physical only",
  },
];
