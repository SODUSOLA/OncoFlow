import { Section, SectionHeading } from "@/components/ui/Section";
import { Accordion } from "@/components/ui/Accordion";
import { Reveal } from "@/components/ui/Reveal";
import { faqEntries } from "@/lib/content/faq";

export function FAQSection() {
  return (
    <Section tone="muted" id="faq">
      <SectionHeading eyebrow="FAQ" title="Frequently asked questions" />
      <Reveal className="mx-auto mt-14 max-w-3xl">
        <Accordion items={faqEntries.map((f) => ({ question: f.question, answer: f.answer }))} />
      </Reveal>
    </Section>
  );
}
