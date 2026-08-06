export interface Testimonial {
  quote: string;
  name: string;
  role: string;
}

/** Sample testimonials — clearly labeled as such wherever they render (see Badge "sample" variant). */
export const testimonials: Testimonial[] = [
  {
    quote:
      "The 7-day countdown replaced three separate WhatsApp groups for our team. Every patient's status is visible in one place, and nothing falls through the cracks anymore.",
    name: "Dr. Amara Chukwu",
    role: "Hospital Administrator, Sample Partner Facility",
  },
  {
    quote:
      "I know within two minutes if a patient needs me. That countdown isn't a gimmick — it's the difference between catching a side effect early and not.",
    name: "Dr. Tunde Bakare",
    role: "Consulting Oncologist, Sample Testimonial",
  },
  {
    quote:
      "I could see exactly what was happening before my chemo day — the labs, the approval, the payment. I wasn't calling anyone to ask what came next.",
    name: "Grace O.",
    role: "Patient, Sample Testimonial",
  },
];
