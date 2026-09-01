import {
  BarChart3,
  BellRing,
  CalendarCheck,
  GitBranch,
  ShieldCheck,
  Timer,
  Users,
  Video,
  type LucideIcon,
} from "lucide-react";

export interface GlanceItem {
  icon: LucideIcon;
  label: string;
}

/** Dense, scannable capability snapshot for executives who won't read paragraphs. */
export const platformGlance: GlanceItem[] = [
  { icon: ShieldCheck, label: "Secure RBAC Architecture" },
  { icon: GitBranch, label: "End-to-End Care navigation" },
  { icon: Users, label: "Multi-Role Clinical Platform" },
  { icon: CalendarCheck, label: "Appointment Scheduling" },
  { icon: Video, label: "Video Consultation" },
  { icon: Timer, label: "Treatment Timeline" },
  { icon: BellRing, label: "Real-Time Notifications" },
  { icon: BarChart3, label: "Operational Analytics" },
];
