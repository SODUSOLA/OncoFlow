"use client";

import { useState, type FormEvent } from "react";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FieldWrapper, Input } from "@/components/ui/Field";
import { api } from "@/lib/api";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError("Enter a valid email address.");
      return;
    }
    setError(undefined);
    setSubmitting(true);
    try {
      // Always resolves the same way regardless of whether the account exists — the backend
      // deliberately never reveals that, so there's nothing more specific to branch on here.
      await api.post("/auth/forgot-password", { email });
      setSent(true);
    } catch {
      setError("Something went wrong. Try again in a moment.");
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="text-center">
        <MailCheck className="mx-auto size-10 text-teal" aria-hidden="true" />
        <h2 className="mt-4 font-display text-lg font-bold text-primary">Check your email</h2>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600">
          If an account exists for <span className="font-medium text-primary">{email}</span>,
          we&apos;ve sent password reset instructions.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <FieldWrapper label="Email address" htmlFor="email" error={error} required>
        <Input
          id="email"
          type="email"
          value={email}
          error={!!error}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
      </FieldWrapper>
      <Button type="submit" size="lg" className="w-full" disabled={submitting}>
        {submitting ? "Sending…" : "Send Reset Link"}
      </Button>
    </form>
  );
}
