"use client";

import { useState } from "react";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function VerifyEmailPanel() {
  const [resent, setResent] = useState(false);

  return (
    <div className="text-center">
      <MailCheck className="mx-auto size-12 text-accent-gold" aria-hidden="true" />
      <p className="mt-4 text-sm leading-relaxed text-neutral-600">
        We&apos;ve sent a verification link to your email address. Click the link to activate
        your account.
      </p>
      <Button
        variant="outline"
        size="lg"
        className="mt-6 w-full"
        onClick={() => setResent(true)}
        disabled={resent}
      >
        {resent ? "Verification email resent" : "Resend Email"}
      </Button>
    </div>
  );
}
