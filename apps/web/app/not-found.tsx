"use client";

import { usePathname } from "next/navigation";
import { Section } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";

// A 404 under a patient-app path (e.g. /messages before that screen existed) should send the
// user back into the app, not out to the marketing site — this is the global fallback (App
// Router only renders nested layouts for routes that actually match), so it has to infer intent
// from the URL itself rather than relying on the (patient) layout being present.
const PATIENT_PATH_PREFIXES = [
  "/home", "/wallet", "/records", "/messages", "/profile", "/settings",
  "/notifications", "/appointments",
];

export default function NotFound() {
  const pathname = usePathname();
  const isPatientPath = PATIENT_PATH_PREFIXES.some((p) => pathname.startsWith(p));

  return (
    <Section tone="surface" className="flex min-h-[60vh] items-center justify-center text-center">
      <div>
        <p className="font-display text-6xl font-bold text-primary">404</p>
        <h1 className="mt-4 font-display text-2xl font-bold text-primary">Page not found</h1>
        <p className="mt-2 text-neutral-600">The page you&apos;re looking for doesn&apos;t exist or has moved.</p>
        <div className="mt-8 flex justify-center">
          <Button href={isPatientPath ? "/home" : "/"} size="lg">
            {isPatientPath ? "Back to Dashboard" : "Back to Home"}
          </Button>
        </div>
      </div>
    </Section>
  );
}
