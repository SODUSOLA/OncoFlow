"use client";

import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CircleCheck, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api";

const CODE_LENGTH = 6;

// Panel for entering the 6-digit email verification code.
export function VerifyEmailPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Prefills from the ?token= link in the email for patients who'd rather tap than type.
  const prefill = (searchParams.get("token") ?? "").replace(/\D/g, "").slice(0, CODE_LENGTH);

  const [digits, setDigits] = useState<string[]>(() =>
    Array.from({ length: CODE_LENGTH }, (_, i) => prefill[i] ?? ""),
  );
  const [verified, setVerified] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const [resending, setResending] = useState(false);
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  const code = digits.join("");

  // Submits the verification code.
  async function submitCode(value: string) {
    setSubmitting(true);
    setError(null);
    try {
      await api.post("/auth/verify-email", { token: value });
      setVerified(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
      setDigits(Array.from({ length: CODE_LENGTH }, () => ""));
      inputsRef.current[0]?.focus();
    } finally {
      setSubmitting(false);
    }
  }

  // Auto-submits when the last digit lands, since a button press would be pure friction.
  useEffect(() => {
    if (code.length === CODE_LENGTH && !submitting && !verified && !error) {
      void submitCode(code);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // Sets one digit of the code.
  function setDigitAt(index: number, value: string) {
    setError(null);
    setDigits((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }

  // Handles typing into a digit box.
  function handleChange(index: number, raw: string) {
    const value = raw.replace(/\D/g, "");
    if (!value) {
      setDigitAt(index, "");
      return;
    }
    // Handles both a single keystroke and a paste that lands in one box.
    if (value.length > 1) {
      const chars = value.slice(0, CODE_LENGTH - index).split("");
      setError(null);
      setDigits((prev) => {
        const next = [...prev];
        chars.forEach((char, offset) => { next[index + offset] = char; });
        return next;
      });
      inputsRef.current[Math.min(index + chars.length, CODE_LENGTH - 1)]?.focus();
      return;
    }
    setDigitAt(index, value);
    if (index < CODE_LENGTH - 1) inputsRef.current[index + 1]?.focus();
  }

  // Handles backspace moving to the previous digit box.
  function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
    if (e.key === "ArrowLeft" && index > 0) inputsRef.current[index - 1]?.focus();
    if (e.key === "ArrowRight" && index < CODE_LENGTH - 1) inputsRef.current[index + 1]?.focus();
  }

  // Handles pasting a full code.
  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, CODE_LENGTH);
    if (!pasted) return;
    e.preventDefault();
    setError(null);
    setDigits(Array.from({ length: CODE_LENGTH }, (_, i) => pasted[i] ?? ""));
    inputsRef.current[Math.min(pasted.length, CODE_LENGTH - 1)]?.focus();
  }

  // Requests a new verification code.
  async function handleResend() {
    setResending(true);
    setError(null);
    try {
      await api.post("/auth/resend-verification");
      setResent(true);
      setDigits(Array.from({ length: CODE_LENGTH }, () => ""));
      inputsRef.current[0]?.focus();
    } catch (err) {
      setError(
        err instanceof Error && err.message === "Email already verified"
          ? "This email is already verified — you can continue to your dashboard."
          : "Couldn't resend right now. Log in and try again from your account.",
      );
    } finally {
      setResending(false);
    }
  }

  if (verified) {
    return (
      <div className="text-center">
        <CircleCheck className="mx-auto size-12 text-teal" aria-hidden="true" />
        <h2 className="mt-4 font-display text-xl font-bold text-primary">Email verified</h2>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600">
          Your patient record is ready — your Unique Patient ID has been issued.
        </p>
        <Button onClick={() => router.push("/home")} className="mt-6 w-full" size="lg">
          Continue to Dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="text-center">
      <MailCheck className="mx-auto size-12 text-accent-gold" aria-hidden="true" />
      <p className="mt-4 text-sm leading-relaxed text-neutral-600">
        Enter the {CODE_LENGTH}-digit code we emailed you. It expires in 10 minutes.
      </p>

      <div className="mt-6 flex justify-center gap-2" role="group" aria-label="Verification code">
        {digits.map((digit, i) => (
          <input
            key={i}
            ref={(el) => { inputsRef.current[i] = el; }}
            value={digit}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={handlePaste}
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            maxLength={CODE_LENGTH}
            disabled={submitting}
            aria-label={`Digit ${i + 1}`}
            autoFocus={i === 0}
            className={`size-12 rounded-xl border text-center font-display text-xl font-bold text-primary outline-none transition-colors duration-standard focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60 ${
              error ? "border-warning" : "border-neutral-300"
            }`}
          />
        ))}
      </div>

      {submitting && <p className="mt-4 text-sm text-neutral-500">Verifying…</p>}
      {error && <p role="alert" className="mt-4 text-sm text-warning">{error}</p>}
      {resent && !error && <p className="mt-4 text-sm text-teal">A new code is on its way.</p>}

      <Button
        variant="outline"
        size="lg"
        className="mt-6 w-full"
        onClick={handleResend}
        disabled={resending || submitting}
      >
        {resending ? "Sending…" : "Resend code"}
      </Button>
    </div>
  );
}
