"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FieldWrapper, Input, PasswordInput } from "@/components/ui/Field";
import { api } from "@/lib/api";
import { MfaCodeForm } from "./MfaCodeForm";

// The backend authenticates by email only, so the field is scoped to that; phone login would need backend lookup support.
const DASHBOARD_URL = process.env.NEXT_PUBLIC_DASHBOARD_URL ?? "http://localhost:5174";

interface LoginResponse {
  mfaRequired: boolean;
  mfaEnrollmentPending: boolean;
  mfaVerified: boolean;
  roles: { roleName: string }[];
}

// Patient login form. MFA is opt-in for patients (see the API's MFA_OPTIONAL_ROLES), so most logins never
// see the verification step below — it only appears for a patient who has enabled it in Settings.
export function LoginForm() {
  const router = useRouter();
  const sessionExpired = useSearchParams().get("expired") === "1";
  const [values, setValues] = useState({ identifier: "", password: "" });
  const [errors, setErrors] = useState<{ identifier?: string; password?: string; form?: string }>({});
  const [loading, setLoading] = useState(false);

  // Set once login succeeds but the session still needs MFA verification; holds what's needed to finish routing.
  const [mfaStep, setMfaStep] = useState<{ enrollmentPending: boolean; roles: { roleName: string }[]; secret: string | null } | null>(null);
  const [mfaLoadingSecret, setMfaLoadingSecret] = useState(false);
  const [mfaError, setMfaError] = useState<string | null>(null);

  // Routes into the right app once a session is fully authenticated (MFA verified or never required).
  function enterApp(roles: { roleName: string }[]) {
    const isPatient = roles.some((role) => role.roleName === "PATIENT");
    if (isPatient) {
      router.push("/home");
    } else {
      window.location.href = DASHBOARD_URL;
    }
  }

  // Submits the credentials, then either routes in directly or drops into the MFA step.
  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const nextErrors: typeof errors = {};
    if (!values.identifier.trim()) nextErrors.identifier = "Enter your email address.";
    if (!values.password) nextErrors.password = "Enter your password.";

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setLoading(true);
    try {
      const res = await api.post<LoginResponse>("/auth/login", {
        email: values.identifier.trim(),
        password: values.password,
      });
      if (res.mfaRequired && !res.mfaVerified) {
        setMfaStep({ enrollmentPending: res.mfaEnrollmentPending, roles: res.roles, secret: null });
        // Required but never enrolled (policy-driven, not the normal patient path): fetch a secret to show
        // before asking for a code, same as Settings' enrolment step.
        if (res.mfaEnrollmentPending) {
          setMfaLoadingSecret(true);
          try {
            const enrolled = await api.post<{ secret: string }>("/auth/mfa/enroll");
            setMfaStep((prev) => (prev ? { ...prev, secret: enrolled.secret } : prev));
          } catch (err) {
            setMfaError(err instanceof Error ? err.message : "Could not start MFA enrolment");
          } finally {
            setMfaLoadingSecret(false);
          }
        }
        setLoading(false);
        return;
      }
      enterApp(res.roles);
    } catch (err) {
      setLoading(false);
      setErrors({ form: err instanceof Error ? err.message : "Invalid email or password" });
    }
  }

  // Verifies the code and completes login.
  async function submitMfaCode(code: string) {
    await api.post("/auth/mfa/verify", { code });
    if (mfaStep) enterApp(mfaStep.roles);
  }

  // Abandons this session and returns to a fresh login, in case the wrong account signed in on a shared device.
  async function cancelMfa() {
    await api.post("/auth/logout").catch(() => {});
    setMfaStep(null);
    setMfaError(null);
  }

  if (mfaStep) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-primary">
          <ShieldCheck className="size-5" aria-hidden="true" />
          <h2 className="text-base font-bold">Verify it&apos;s you</h2>
        </div>
        {mfaStep.enrollmentPending ? (
          mfaLoadingSecret || !mfaStep.secret ? (
            <p className="text-sm text-neutral-500">Setting up two-factor authentication…</p>
          ) : (
            <>
              <p className="text-sm text-neutral-500">
                Add this key to an authenticator app, then enter the code it generates to finish signing in.
              </p>
              <code className="block overflow-x-auto rounded-xl border border-neutral-300 bg-neutral-50 px-3 py-2 font-mono text-sm tracking-wider text-neutral-800">
                {mfaStep.secret}
              </code>
            </>
          )
        ) : (
          <p className="text-sm text-neutral-500">Enter the 6-digit code from your authenticator app.</p>
        )}
        {(!mfaStep.enrollmentPending || mfaStep.secret) && (
          <MfaCodeForm onSubmit={submitMfaCode} submitLabel="Verify & continue" />
        )}
        {mfaError && <p className="text-sm text-critical">{mfaError}</p>}
        <button type="button" onClick={cancelMfa} className="text-sm font-medium text-neutral-500 hover:underline">
          Not you? Sign out
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <FieldWrapper label="Email address" htmlFor="identifier" error={errors.identifier} required>
        <Input
          id="identifier"
          type="email"
          value={values.identifier}
          error={!!errors.identifier}
          onChange={(e) => setValues((v) => ({ ...v, identifier: e.target.value }))}
          placeholder="you@example.com"
          autoComplete="username"
        />
      </FieldWrapper>

      <FieldWrapper label="Password" htmlFor="password" error={errors.password} required>
        <PasswordInput
          id="password"
          value={values.password}
          error={!!errors.password}
          onChange={(e) => setValues((v) => ({ ...v, password: e.target.value }))}
          autoComplete="current-password"
        />
      </FieldWrapper>

      <div className="flex justify-end">
        <Link href="/forgot-password" className="text-sm font-medium text-primary hover:underline">
          Forgot password?
        </Link>
      </div>

      {sessionExpired && !errors.form && (
        <p role="status" className="rounded-xl bg-warning-bg px-4 py-3 text-sm text-warning">
          Your session has expired. Please log in again.
        </p>
      )}

      {errors.form && (
        <p role="alert" className="rounded-xl bg-warning-bg px-4 py-3 text-sm text-warning">
          {errors.form}
        </p>
      )}

      <Button type="submit" size="lg" className="w-full" loading={loading}>
        Log In
      </Button>
    </form>
  );
}
