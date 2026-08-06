export interface FaqEntry {
  question: string;
  answer: string;
}

export const faqEntries: FaqEntry[] = [
  {
    question: "What is OncoFlow?",
    answer:
      "OncoFlow is a secure, role-based platform that coordinates the full cancer care journey — from registration and scheduling through chemotherapy administration and long-term follow-up — across a network of partner hospitals, virtual clinicians, and administrative staff.",
  },
  {
    question: "Who can use it?",
    answer:
      "Patients, oncologists, medical officers, nurses, clinical directors, and hospital administrators each get a dedicated, role-scoped view. No one sees more of the system than their role requires.",
  },
  {
    question: "Is patient data secure?",
    answer:
      "Every module runs behind role-based access control, encryption in transit and at rest, and full audit logging. Patient phone numbers and other sensitive details are never exposed outside the roles that need them.",
  },
  {
    question: "Can hospitals customize it?",
    answer:
      "Facility-level tariffs, staff assignments, and inventory are configured per partner hospital, so pricing and scheduling reflect each facility's actual arrangements rather than a one-size-fits-all setup.",
  },
  {
    question: "How do patients register?",
    answer:
      "A short multi-step form — identity, contact details, and facility selection — issues a permanent Unique Patient ID. The system flags likely duplicates before a second account can be created.",
  },
  {
    question: "How do clinicians access the platform?",
    answer:
      "Clinical staff are invited by an administrator and log in through a single, role-based sign-in. The system routes each login to the correct dashboard automatically — there's no user-selectable role switcher.",
  },
  {
    question: "Is telemedicine supported?",
    answer:
      "Yes. Scheduled video consultations open automatically ahead of the appointment time, with live transcription running alongside the call for the clinician to review and finalize.",
  },
];
