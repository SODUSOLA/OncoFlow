// What a notification says outside the app (lock screen, email). Deliberately generic: no patient names or
// clinical detail ever leave the server through a push provider or an inbox; the app shows specifics after sign-in.
interface Template { title: string; body: string; path: string }

const DEFAULT: Template = { title: "OncoFlow", body: "You have a new notification.", path: "/" };

const TEMPLATES: Record<string, Template> = {
  NEW_MESSAGE: { title: "New message", body: "You have a new message.", path: "/" },
  SLA_BREACH: { title: "Response overdue", body: "A conversation has passed its response time.", path: "/" },
  SPECIALIST_ESCALATION: { title: "New escalation", body: "A patient escalation needs attention.", path: "/" },
  COUNTDOWN_ESCALATION: { title: "Countdown case escalated", body: "A pre-chemo countdown case needs your attention.", path: "/dashboard/quality-assurance-officer" },
  NURSING_CASE_SUBMITTED: { title: "Case ready for review", body: "A nursing case is waiting for your review.", path: "/dashboard/quality-assurance-officer" },
  NURSING_CASE_REVIEWED: { title: "Case reviewed", body: "One of your cases has been reviewed.", path: "/dashboard/onsite-nursing-officer/cases" },
  IDENTITY_MISMATCH_REPORTED: { title: "Identity mismatch reported", body: "A nurse reported an identity mismatch.", path: "/" },
  APPOINTMENT_CONFIRMED: { title: "Appointment confirmed", body: "An appointment was confirmed.", path: "/" },
  APPOINTMENT_RESCHEDULED: { title: "Appointment changed", body: "An appointment was rescheduled.", path: "/" },
  APPOINTMENT_SCHEDULED: { title: "Appointment scheduled", body: "A new appointment was scheduled.", path: "/" },
  APPOINTMENT_REMINDER: { title: "Appointment reminder", body: "You have an upcoming appointment.", path: "/" },
  AVAILABILITY_CHANGED: { title: "Availability changed", body: "A consultant's availability changed.", path: "/" },
  INVOICE_PAID: { title: "Payment received", body: "Your payment was received.", path: "/" },
  LAB_RESULT_REVIEWED: { title: "Lab result reviewed", body: "A lab result has been reviewed.", path: "/" },
  CONVERSATION_FEEDBACK: { title: "New feedback", body: "You received feedback on a conversation.", path: "/" },
};

export function templateFor(type: string): Template {
  return TEMPLATES[type] ?? DEFAULT;
}
