import type { Metadata } from "next";
import { Mail, MapPin, Phone } from "lucide-react";
import { Section } from "@/components/ui/Section";
import { Reveal } from "@/components/ui/Reveal";
import { ContactForm } from "@/components/marketing/ContactForm";
import { LinkedinIcon, XIcon } from "@/components/ui/SocialIcons";
import { siteConfig } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "Contact",
  description: "Reach the OncoFlow team for hospital inquiries, patient inquiries, or general support.",
};

export default function ContactPage() {
  return (
    <Section tone="muted" className="py-16 md:py-24">
      <div className="grid gap-12 lg:grid-cols-5">
        <Reveal className="lg:col-span-2">
          <p className="text-sm font-semibold uppercase tracking-wide text-accent-gold">Contact</p>
          <h1 className="mt-4 font-display text-3xl font-bold tracking-tight text-primary sm:text-4xl">
            Let&apos;s talk about your care network
          </h1>
          <p className="mt-4 leading-relaxed text-neutral-600">
            Whether you&apos;re a hospital evaluating OncoFlow, a patient with a question, or need
            general support — send us a message and the right team will follow up.
          </p>

          <dl className="mt-8 space-y-4 text-sm">
            <div className="flex items-start gap-3">
              <Mail className="mt-0.5 size-4 text-primary" aria-hidden="true" />
              <div>
                <dt className="font-semibold text-primary">Email</dt>
                <dd className="text-neutral-600">{siteConfig.contactEmail}</dd>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Phone className="mt-0.5 size-4 text-primary" aria-hidden="true" />
              <div>
                <dt className="font-semibold text-primary">Phone</dt>
                <dd className="text-neutral-600">{siteConfig.phone}</dd>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <MapPin className="mt-0.5 size-4 text-primary" aria-hidden="true" />
              <div>
                <dt className="font-semibold text-primary">Office</dt>
                <dd className="text-neutral-600">{siteConfig.address}</dd>
              </div>
            </div>
          </dl>

          <div className="mt-8 flex gap-3">
            <a
              href={siteConfig.social.linkedin}
              aria-label="OncoFlow on LinkedIn"
              className="inline-flex size-9 items-center justify-center rounded-xl bg-primary-50 text-primary transition-colors duration-fast hover:bg-primary hover:text-white"
            >
              <LinkedinIcon className="size-4" />
            </a>
            <a
              href={siteConfig.social.twitter}
              aria-label="OncoFlow on X (Twitter)"
              className="inline-flex size-9 items-center justify-center rounded-xl bg-primary-50 text-primary transition-colors duration-fast hover:bg-primary hover:text-white"
            >
              <XIcon className="size-4" />
            </a>
          </div>
        </Reveal>

        <Reveal delay={0.05} className="lg:col-span-3">
          <ContactForm />
        </Reveal>
      </div>
    </Section>
  );
}
