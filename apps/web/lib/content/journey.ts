export interface JourneyStep {
  title: string;
  description: string;
}

/** The static patient journey timeline, verbatim from the build brief. */
export const journeySteps: JourneyStep[] = [
  { title: "Patient Registers", description: "A permanent Unique Patient ID is issued — the single most important step in the record." },
  { title: "Appointment Booking", description: "Sessions are scheduled against real facility and clinician availability." },
  { title: "Clinical Review", description: "Pre-chemo labs are reviewed and signed off by a State Clinical Director." },
  { title: "Video Consultation", description: "A live consult opens automatically, with transcription running alongside it." },
  { title: "Treatment Plan", description: "Invoicing and medication are confirmed before chemo day is locked in." },
  { title: "Follow-up Care", description: "Post-treatment check-ins keep the care team and patient aligned." },
  { title: "Long-term Monitoring", description: "The full history stays on one timeline, across every future visit." },
];
