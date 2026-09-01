import {
  Activity,
  BarChart3,
  CalendarCheck,
  ClipboardList,
  FileLock2,
  MessagesSquare,
  Pill,
  ShieldCheck,
  Timer,
  Users,
  Video,
  Workflow,
  type LucideIcon,
} from "lucide-react";

export interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
}

/** Mapped to the PRD's actual MVP feature inventory (§4), not a generic SaaS list. */
export const features: Feature[] = [
  {
    icon: CalendarCheck,
    title: "Appointment Scheduling",
    description:
      "Physical and virtual sessions allocated against real facility and clinician availability — conflicts get flagged before they become missed appointments.",
  },
  {
    icon: Video,
    title: "Video Consultation",
    description:
      "Scheduled consults open automatically 15 minutes ahead of time, with live transcription running alongside the call.",
  },
  {
    icon: ClipboardList,
    title: "Clinical Notes & Transcription",
    description:
      "Oncologists get an editable, real-time transcript during every consult — reviewed and finalized straight into the patient timeline.",
  },
  {
    icon: Pill,
    title: "Prescription Management",
    description:
      "Prescriptions are gated behind a mandatory triage checklist, so nothing reaches a patient without the required clinical review.",
  },
  {
    icon: Workflow,
    title: "Care navigation",
    description:
      "The 7-day pre-chemo pathway — labs, sign-off, invoicing, payment — runs as one enforced workflow across every role involved.",
  },
  {
    icon: Timer,
    title: "SLA-Backed Notifications",
    description:
      "Response-time commitments (2-minute clinical, 5-minute administrative) are visible countdowns, not buried service targets.",
  },
  {
    icon: Activity,
    title: "Patient Timeline",
    description:
      "Every visit, lab, consult, and decision lives on one chronological record — no more piecing a history together from separate channels.",
  },
  {
    icon: MessagesSquare,
    title: "Secure Messaging",
    description:
      "Role-scoped chat channels replace informal phone calls and messaging-app threads, with a full audit trail behind every message.",
  },
  {
    icon: FileLock2,
    title: "Medical Records",
    description:
      "Lab results and clinical documents are uploaded, verified, and attached to the correct patient record under strict access control.",
  },
  {
    icon: BarChart3,
    title: "Operational Analytics",
    description:
      "Regional teams see stock levels, SLA compliance, and case throughput as it happens, not at end-of-month reconciliation.",
  },
  {
    icon: Users,
    title: "Multi-Role Access",
    description:
      "Patients, clinicians, and administrators each see exactly what their role requires — nothing more, nothing less.",
  },
  {
    icon: ShieldCheck,
    title: "Referral & Facility Management",
    description:
      "Patients move between partner facilities without losing continuity — the record and the care pathway travel with them.",
  },
];
