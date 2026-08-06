"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FieldWrapper, PasswordInput } from "@/components/ui/Field";

export function ResetPasswordForm() {
  const [values, setValues] = useState({ password: "", confirm: "" });
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [done, setDone] = useState(false);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const nextErrors: typeof errors = {};
    if (values.password.length < 8) nextErrors.password = "Use at least 8 characters.";
    if (values.confirm !== values.password) nextErrors.confirm = "Passwords don't match.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length === 0) setDone(true);
  }

  if (done) {
    return (
      <div className="text-center">
        <CheckCircle2 className="mx-auto size-10 text-teal" aria-hidden="true" />
        <h2 className="mt-4 font-display text-lg font-bold text-primary">Password updated</h2>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600">
          Your password has been changed. You can now log in with your new password.
        </p>
        <Button href="/login" className="mt-6 w-full" size="lg">
          Continue to Log In
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <FieldWrapper
        label="New password"
        htmlFor="password"
        error={errors.password}
        hint="At least 8 characters."
        required
      >
        <PasswordInput
          id="password"
          value={values.password}
          error={!!errors.password}
          onChange={(e) => setValues((v) => ({ ...v, password: e.target.value }))}
          autoComplete="new-password"
        />
      </FieldWrapper>
      <FieldWrapper label="Confirm new password" htmlFor="confirm" error={errors.confirm} required>
        <PasswordInput
          id="confirm"
          value={values.confirm}
          error={!!errors.confirm}
          onChange={(e) => setValues((v) => ({ ...v, confirm: e.target.value }))}
          autoComplete="new-password"
        />
      </FieldWrapper>
      <Button type="submit" size="lg" className="w-full">
        Reset Password
      </Button>
    </form>
  );
}
