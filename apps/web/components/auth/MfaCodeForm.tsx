"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { FieldWrapper, Input } from "@/components/ui/Field";

// A 6-digit TOTP code entry, shared by the login-time verification step and the Settings enrollment
// confirmation step — both resolve to the same POST /auth/mfa/verify call server-side.
export function MfaCodeForm({
  onSubmit, submitLabel = "Verify", children,
}: {
  onSubmit: (code: string) => Promise<void>;
  submitLabel?: string;
  children?: ReactNode;
}) {
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (code.trim().length !== 6) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(code.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid code — check your authenticator app and try again");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {children}
      <FieldWrapper label="6-digit code" htmlFor="mfa-code" error={error ?? undefined} required>
        <Input
          id="mfa-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="000000"
          value={code}
          error={!!error}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          className="text-center font-mono text-lg tracking-[0.5em]"
          autoFocus
        />
      </FieldWrapper>
      <Button type="submit" className="w-full" loading={submitting}>{submitLabel}</Button>
    </form>
  );
}
