"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FieldWrapper, Input, PasswordInput, Select } from "@/components/ui/Field";
import { MOTION_MS } from "@/lib/motion";
import { api } from "@/lib/api";
import type { Facility } from "@/lib/types";

interface RegisterValues {
  fullName: string;
  dateOfBirth: string;
  email: string;
  phone: string;
  password: string;
  facility: string;
}

const initialValues: RegisterValues = {
  fullName: "",
  dateOfBirth: "",
  email: "",
  phone: "",
  password: "",
  facility: "",
};

const steps = ["Identity", "Contact", "Facility"] as const;

function StepIndicator({ step }: { step: number }) {
  return (
    <ol className="mb-8 flex items-center gap-2" aria-label="Registration progress">
      {steps.map((label, i) => (
        <li key={label} className="flex flex-1 items-center gap-2">
          <span
            className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors duration-standard ${
              i <= step ? "bg-primary text-white" : "bg-neutral-100 text-neutral-400"
            }`}
          >
            {i < step ? <CheckCircle2 className="size-4" /> : i + 1}
          </span>
          <span className={`text-xs font-medium ${i <= step ? "text-primary" : "text-neutral-400"}`}>
            {label}
          </span>
          {i < steps.length - 1 && <span className="h-px flex-1 bg-neutral-200" />}
        </li>
      ))}
    </ol>
  );
}

export function RegisterWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<RegisterValues>(initialValues);
  const [errors, setErrors] = useState<Partial<Record<keyof RegisterValues, string>> & { form?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    api.get<{ facilities: Facility[] }>("/facilities")
      .then((res) => setFacilities(res.facilities))
      .catch(() => setFacilities([]));
  }, []);

  function validateStep(): boolean {
    const nextErrors: typeof errors = {};
    if (step === 0) {
      if (!values.fullName.trim()) nextErrors.fullName = "Enter your full name.";
      if (!values.dateOfBirth) nextErrors.dateOfBirth = "Enter your date of birth.";
    } else if (step === 1) {
      if (!/^\S+@\S+\.\S+$/.test(values.email)) nextErrors.email = "Enter a valid email address.";
      if (!values.phone.trim()) nextErrors.phone = "Enter a phone number.";
      if (values.password.length < 8) nextErrors.password = "Use at least 8 characters.";
    } else if (step === 2) {
      if (!values.facility) nextErrors.facility = "Select a facility.";
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleNext(e: FormEvent) {
    e.preventDefault();
    if (!validateStep()) return;
    if (step < steps.length - 1) {
      setStep((s) => s + 1);
      return;
    }

    // POST /auth/register creates the login account and stashes name/DOB/phone/preferred
    // facility as a patient_registration_request — a Regional Admin reviews that and issues
    // the Unique Patient ID (POST /patients, staff-only). Never generate the ID client-side.
    setSubmitting(true);
    setErrors({});
    try {
      await api.post("/auth/register", {
        email: values.email,
        password: values.password,
        fullName: values.fullName,
        dob: values.dateOfBirth,
        phone: values.phone,
        preferredFacilityId: values.facility || undefined,
      });
      // Registration itself doesn't create a session — chain an immediate login with the same
      // credentials so the user lands straight on /home instead of re-entering their password.
      // If this second call fails for any reason, fall back to the manual "Continue to Log In"
      // success screen rather than leaving the user stuck on a broken redirect.
      try {
        await api.post("/auth/login", { email: values.email, password: values.password });
        router.push("/home");
      } catch {
        setDone(true);
      }
    } catch (err) {
      setErrors({ form: err instanceof Error ? err.message : "Registration failed" });
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="text-center">
        <CheckCircle2 className="mx-auto size-12 text-teal" aria-hidden="true" />
        <h2 className="mt-4 font-display text-xl font-bold text-primary">Account created</h2>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600">
          Log in to complete your patient profile — your care team will confirm your facility
          and issue your Unique Patient ID.
        </p>
        <Button href="/login" className="mt-6 w-full" size="lg">
          Continue to Log In
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleNext} noValidate>
      <StepIndicator step={step} />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={step}
          initial={shouldReduceMotion ? false : { opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, x: -12 }}
          transition={{ duration: MOTION_MS.standard / 1000, ease: "easeOut" }}
          className="space-y-5"
        >
          {step === 0 && (
            <>
              <FieldWrapper label="Full name" htmlFor="fullName" error={errors.fullName} required>
                <Input
                  id="fullName"
                  value={values.fullName}
                  error={!!errors.fullName}
                  onChange={(e) => setValues((v) => ({ ...v, fullName: e.target.value }))}
                  placeholder="Jane Doe"
                />
              </FieldWrapper>
              <FieldWrapper label="Date of birth" htmlFor="dateOfBirth" error={errors.dateOfBirth} required>
                <Input
                  id="dateOfBirth"
                  type="date"
                  value={values.dateOfBirth}
                  error={!!errors.dateOfBirth}
                  onChange={(e) => setValues((v) => ({ ...v, dateOfBirth: e.target.value }))}
                />
              </FieldWrapper>
            </>
          )}

          {step === 1 && (
            <>
              <FieldWrapper label="Email address" htmlFor="email" error={errors.email} required>
                <Input
                  id="email"
                  type="email"
                  value={values.email}
                  error={!!errors.email}
                  onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))}
                  placeholder="jane@example.com"
                />
              </FieldWrapper>
              <FieldWrapper label="Phone number" htmlFor="phone" error={errors.phone} required>
                <Input
                  id="phone"
                  type="tel"
                  value={values.phone}
                  error={!!errors.phone}
                  onChange={(e) => setValues((v) => ({ ...v, phone: e.target.value }))}
                  placeholder="+234 800 000 0000"
                />
              </FieldWrapper>
              <FieldWrapper
                label="Password"
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
            </>
          )}

          {step === 2 && (
            <FieldWrapper label="Preferred facility" htmlFor="facility" error={errors.facility} required>
              <Select
                id="facility"
                value={values.facility}
                error={!!errors.facility}
                onChange={(e) => setValues((v) => ({ ...v, facility: e.target.value }))}
              >
                <option value="">Select a facility</option>
                {facilities.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </Select>
            </FieldWrapper>
          )}
        </motion.div>
      </AnimatePresence>

      {errors.form && (
        <p role="alert" className="mt-5 rounded-xl bg-warning-bg px-4 py-3 text-sm text-warning">
          {errors.form}
        </p>
      )}

      <div className="mt-8 flex gap-3">
        {step > 0 && (
          <Button type="button" variant="outline" size="lg" onClick={() => setStep((s) => s - 1)}>
            Back
          </Button>
        )}
        <Button type="submit" size="lg" className="flex-1" loading={submitting}>
          {step === steps.length - 1 ? "Complete Registration" : "Continue"}
        </Button>
      </div>
    </form>
  );
}
