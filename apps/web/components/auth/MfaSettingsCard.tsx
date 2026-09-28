"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, Copy, Check } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api";
import { MfaCodeForm } from "./MfaCodeForm";

// Settings card for enrolling MFA (there's no disable endpoint on the API — once enabled, it stays enabled,
// same as the staff dashboard's equivalent card). Mirrors apps/dashboard's MfaCard so both apps behave the
// same way for the same two server calls (POST /auth/mfa/enroll, POST /auth/mfa/verify).
export function MfaSettingsCard() {
  const [loadingState, setLoadingState] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [step, setStep] = useState<"idle" | "enrolling">("idle");
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ user: { mfaEnabled: boolean } }>("/auth/profile")
      .then((res) => setEnabled(res.user.mfaEnabled))
      .catch(() => {})
      .finally(() => setLoadingState(false));
  }, []);

  // Starts enrolment and shows the secret to add to an authenticator app.
  async function startEnrolment() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ secret: string }>("/auth/mfa/enroll");
      setSecret(res.secret);
      setStep("enrolling");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start enrolment");
    } finally {
      setBusy(false);
    }
  }

  // Confirms enrolment with the first code from the authenticator app.
  async function confirmCode(code: string) {
    await api.post("/auth/mfa/verify", { code });
    setEnabled(true);
    setStep("idle");
    setSecret(null);
  }

  async function copySecret() {
    if (!secret) return;
    await navigator.clipboard.writeText(secret).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Card>
      <h2 className="flex items-center gap-2 text-base font-bold text-neutral-900">
        <ShieldCheck className="size-4.5 text-neutral-400" aria-hidden="true" /> Multi-Factor Authentication
      </h2>

      {loadingState ? (
        <p className="mt-3 text-sm text-neutral-400">Loading…</p>
      ) : step === "idle" && !enabled ? (
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-sm text-neutral-500">Adds a 6-digit code from an authenticator app at sign-in.</p>
          <Button onClick={startEnrolment} loading={busy} size="sm" className="shrink-0">Enable</Button>
        </div>
      ) : step === "idle" && enabled ? (
        <p className="mt-3 text-sm text-teal">MFA is enabled on this account.</p>
      ) : (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-neutral-500">Add this key to an authenticator app, then enter the code it generates.</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded-xl border border-neutral-300 bg-neutral-50 px-3 py-2 font-mono text-sm tracking-wider text-neutral-800">
              {secret}
            </code>
            <button
              type="button" onClick={copySecret} title="Copy"
              className="shrink-0 rounded-xl border border-neutral-300 p-2 text-neutral-500 hover:bg-neutral-50"
            >
              {copied ? <Check className="size-4 text-teal" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
            </button>
          </div>
          <MfaCodeForm onSubmit={confirmCode} submitLabel="Confirm & enable" />
        </div>
      )}
      {error && <p className="mt-2 text-sm text-critical">{error}</p>}
    </Card>
  );
}
