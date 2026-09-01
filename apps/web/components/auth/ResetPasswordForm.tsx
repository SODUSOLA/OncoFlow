"use client";

import { useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FieldWrapper, PasswordInput } from "@/components/ui/Field";
import { api } from "@/lib/api";

export function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [values, setValues] = useState({ password: "", confirm: "" });
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const nextErrors: typeof errors = {};
    if (values.password.length < 8) nextErrors.password = "Use at least 8 characters.";
    if (values.confirm !== values.password) nextErrors.confirm = "Passwords don't match.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitError(null);
    setSubmitting(true);
    try {
      await api.post("/auth/reset-password", { token, password: values.password });
      setDone(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to reset password");
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <div className="text-center">
        <CircleAlert className="mx-auto size-10 text-warning" aria-hidden="true" />
        <h2 className="mt-4 font-display text-lg font-bold text-primary">Link invalid</h2>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600">
          This reset link is missing its token. Request a new one from the forgot password page.
        </p>
        <Button href="/forgot-password" className="mt-6 w-full" size="lg">
          Back to Forgot Password
        </Button>
      </div>
    );
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
      {submitError && (
        <p className="text-sm text-warning">
          {submitError === "Invalid or expired reset link"
            ? "This link has expired or was already used. Request a new one from the forgot password page."
            : submitError}
        </p>
      )}
      <Button type="submit" size="lg" className="w-full" disabled={submitting}>
        {submitting ? "Resetting…" : "Reset Password"}
      </Button>
    </form>
  );
}
