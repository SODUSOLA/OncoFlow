"use client";

import { useState, type FormEvent } from "react";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FieldWrapper, Input } from "@/components/ui/Field";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [sent, setSent] = useState(false);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError("Enter a valid email address.");
      return;
    }
    setError(undefined);
    setSent(true);
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
      <Button type="submit" size="lg" className="w-full">
        Send Reset Link
      </Button>
    </form>
  );
}
