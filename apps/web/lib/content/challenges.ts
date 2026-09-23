import {
  AlertTriangle,
  ClipboardX,
  Clock,
  FileWarning,
  MessageSquareOff,
  Workflow,
  type LucideIcon,
} from "lucide-react";

export interface Challenge {
  icon: LucideIcon;
  title: string;
  description: string;
}

// The four recurring failure modes from the PRD's problem statement (§2.1), not invented pain points.
export const challenges: Challenge[] = [
  {
    icon: Workflow,
    title: "Care-pathway drift",
    description:
      "Without a system enforcing sequence, patients miss pre-chemo labs or clinical sign-off deadlines — and no one catches it until chemo day.",
  },
  {
    icon: FileWarning,
    title: "Billing inconsistency",
    description:
      "Manual invoice calculation across multiple hospital tariffs and clinician payout tiers introduces pricing errors and revenue leakage.",
  },
  {
    icon: ClipboardX,
    title: "Fragmented patient records",
    description:
      "A patient's notes, labs, and consult history live across untracked phone calls and messaging threads, with no single timeline.",
  },
  {
    icon: MessageSquareOff,
    title: "Communication gaps",
    description:
      "Phone calls and informal chat groups leave no audit trail — critical updates get lost between shifts and facilities.",
  },
  {
    icon: Clock,
    title: "Delayed diagnosis-to-treatment",
    description:
      "Manual navigation between labs, sign-off, and scheduling adds days to a pathway where days matter most.",
  },
  {
    icon: AlertTriangle,
    title: "Privacy exposure",
    description:
      "Patient phone numbers and personal information circulate informally among staff with no access control and no audit trail.",
  },
];
