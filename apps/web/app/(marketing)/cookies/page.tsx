import type { Metadata } from "next";
import { LegalPageLayout } from "@/components/marketing/LegalPageLayout";

export const metadata: Metadata = {
  title: "Cookie Policy",
  description: "How OncoFlow uses cookies on its public website.",
};

export default function CookiesPage() {
  return (
    <LegalPageLayout title="Cookie Policy" lastUpdated="Draft — not yet finalized">
      <section>
        <h2>What We Use Cookies For</h2>
        <p>
          The public OncoFlow website uses a minimal set of cookies necessary for basic
          functionality, such as remembering session state during sign-in.
        </p>
      </section>
      <section>
        <h2>No Advertising Cookies</h2>
        <p>
          OncoFlow does not use third-party advertising or tracking cookies on its public
          website or authenticated product.
        </p>
      </section>
      <section>
        <h2>Managing Cookies</h2>
        <p>
          You can control or disable cookies through your browser settings. Disabling essential
          cookies may affect your ability to log in.
        </p>
      </section>
    </LegalPageLayout>
  );
}
