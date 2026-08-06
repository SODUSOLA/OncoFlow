import type { Metadata } from "next";
import { LegalPageLayout } from "@/components/marketing/LegalPageLayout";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms governing use of the OncoFlow platform.",
};

export default function TermsPage() {
  return (
    <LegalPageLayout title="Terms of Service" lastUpdated="Draft — not yet finalized">
      <section>
        <h2>Acceptance of Terms</h2>
        <p>
          By creating an account or otherwise using OncoFlow, you agree to these terms and any
          policies referenced within them.
        </p>
      </section>
      <section>
        <h2>Use of the Platform</h2>
        <p>
          OncoFlow is provided to coordinate oncology care between patients and partner
          healthcare facilities. Accounts are role-scoped and may not be shared or used outside
          their intended clinical or administrative purpose.
        </p>
      </section>
      <section>
        <h2>Medical Disclaimer</h2>
        <p>
          OncoFlow is a coordination platform, not a substitute for professional medical
          judgment. Clinical decisions remain the responsibility of the licensed professionals
          using the platform.
        </p>
      </section>
      <section>
        <h2>Changes to These Terms</h2>
        <p>
          These terms may be updated as the platform and its regulatory posture evolve. Material
          changes will be communicated to account holders.
        </p>
      </section>
    </LegalPageLayout>
  );
}
