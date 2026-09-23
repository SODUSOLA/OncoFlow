import type { Metadata } from "next";
import { LegalPageLayout } from "@/components/marketing/LegalPageLayout";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How OncoFlow collects, uses, and protects personal and health information.",
};

// Privacy policy page.
export default function PrivacyPage() {
  return (
    <LegalPageLayout title="Privacy Policy" lastUpdated="Draft — not yet finalized">
      <section>
        <h2>Information We Collect</h2>
        <p>
          OncoFlow collects identity, contact, and clinical information necessary to coordinate
          care — including a permanent Unique Patient ID, appointment history, lab results, and
          billing records tied to services received through partner facilities.
        </p>
      </section>
      <section>
        <h2>How Information Is Used</h2>
        <p>
          Information is used to schedule and deliver care, generate invoices, coordinate
          between clinical roles, and maintain the audit trail required for a safe, accountable
          care pathway. It is not sold or used for advertising.
        </p>
      </section>
      <section>
        <h2>Access Controls</h2>
        <p>
          Access to personal and clinical information is restricted by role-based access control.
          Sensitive identifiers, such as phone numbers, are scoped to only the roles that need
          them for a given task.
        </p>
      </section>
      <section>
        <h2>Data Retention</h2>
        <p>
          Records are retained for as long as necessary to support ongoing care and applicable
          regulatory requirements. Retention specifics will be finalized alongside formal
          compliance review.
        </p>
      </section>
      <section>
        <h2>Contact</h2>
        <p>Questions about this policy can be directed to our support team via the contact page.</p>
      </section>
    </LegalPageLayout>
  );
}
