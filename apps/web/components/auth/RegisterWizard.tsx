"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CheckCircle2, MapPin, Search, ShieldCheck, Info } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FieldWrapper, Input, PasswordInput, Select } from "@/components/ui/Field";
import { MOTION_MS } from "@/lib/motion";
import { api } from "@/lib/api";
import { haversineKm, formatDistanceKm } from "@/lib/geo";
import type { Facility } from "@/lib/types";

interface RegisterValues {
  fullName: string;
  dateOfBirth: string;
  gender: string;
  email: string;
  phone: string;
  password: string;
  facility: string;
}

const initialValues: RegisterValues = {
  fullName: "",
  dateOfBirth: "",
  gender: "",
  email: "",
  phone: "",
  password: "",
  facility: "",
};

// Biological sex, not gender identity, since it drives dosing and reference ranges downstream.
const BIOLOGICAL_SEX_OPTIONS = ["Female", "Male"] as const;

const steps = ["Identity", "Contact", "Facility", "Review"] as const;

type GeoState =
  | { status: "idle" | "prompting" | "denied" | "unsupported" }
  | { status: "granted"; latitude: number; longitude: number };

// Step progress indicator.
function StepIndicator({ step }: { step: number }) {
  return (
    <div className="mb-8">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Step {step + 1} of {steps.length}
        </p>
        <p className="text-xs font-semibold text-primary">{steps[step]}</p>
      </div>
      <ol className="flex items-center gap-1.5" aria-label="Registration progress">
        {steps.map((label, i) => (
          <li
            key={label}
            className={`h-1 flex-1 rounded-full transition-colors duration-standard ${
              i <= step ? "bg-primary" : "bg-neutral-200"
            }`}
            aria-current={i === step ? "step" : undefined}
          >
            <span className="sr-only">{label}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// One label and value row in the review step.
function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-neutral-500">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-primary">{value || "—"}</dd>
    </div>
  );
}

// Titled section in the review step.
function ReviewSection({
  title,
  onEdit,
  children,
}: {
  title: string;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-neutral-200 p-4">
      <div className="mb-3 flex items-center justify-between border-b border-neutral-100 pb-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-600">{title}</h3>
        <button
          type="button"
          onClick={onEdit}
          className="text-xs font-semibold text-primary hover:underline"
        >
          Edit
        </button>
      </div>
      {children}
    </section>
  );
}

// Multi-step patient registration wizard.
export function RegisterWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<RegisterValues>(initialValues);
  const [errors, setErrors] = useState<Partial<Record<keyof RegisterValues, string>> & { form?: string; consent?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [facilityQuery, setFacilityQuery] = useState("");
  const [geo, setGeo] = useState<GeoState>({ status: "idle" });
  const [consent, setConsent] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    api.get<{ facilities: Facility[] }>("/facilities")
      .then((res) => setFacilities(res.facilities))
      .catch(() => setFacilities([]));
  }, []);

  // Asks for location only when the patient reaches the facility step, rather than prompting on page load.
  useEffect(() => {
    if (step !== 2 || geo.status !== "idle") return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeo({ status: "unsupported" });
      return;
    }
    setGeo({ status: "prompting" });
    navigator.geolocation.getCurrentPosition(
      (pos) => setGeo({ status: "granted", latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => setGeo({ status: "denied" }),
      { timeout: 10_000 },
    );
  }, [step, geo.status]);

  const rankedFacilities = useMemo(() => {
    const query = facilityQuery.trim().toLowerCase();
    const filtered = query
      ? facilities.filter(
          (f) => f.name.toLowerCase().includes(query) || f.address.toLowerCase().includes(query),
        )
      : facilities;

    if (geo.status !== "granted") return filtered.map((f) => ({ facility: f, distanceKm: null as number | null }));

    return filtered
      .map((f) => {
        const lat = f.latitude === null ? null : Number(f.latitude);
        const lon = f.longitude === null ? null : Number(f.longitude);
        const distanceKm =
          lat === null || lon === null || Number.isNaN(lat) || Number.isNaN(lon)
            ? null
            : haversineKm({ latitude: geo.latitude, longitude: geo.longitude }, { latitude: lat, longitude: lon });
        return { facility: f, distanceKm };
      })
      // Facilities without coordinates sort last rather than disappearing or crashing the sort.
      .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
  }, [facilities, facilityQuery, geo]);

  const selectedFacility = facilities.find((f) => f.id === values.facility) ?? null;

  // Validates the current step's fields.
  function validateStep(): boolean {
    const nextErrors: typeof errors = {};
    if (step === 0) {
      if (!values.fullName.trim()) nextErrors.fullName = "Enter your full name.";
      if (!values.dateOfBirth) nextErrors.dateOfBirth = "Enter your date of birth.";
      if (!values.gender) nextErrors.gender = "Select your biological sex.";
    } else if (step === 1) {
      if (!/^\S+@\S+\.\S+$/.test(values.email)) nextErrors.email = "Enter a valid email address.";
      if (!values.phone.trim()) nextErrors.phone = "Enter a phone number.";
      if (values.password.length < 8) nextErrors.password = "Use at least 8 characters.";
    } else if (step === 2) {
      if (!values.facility) nextErrors.facility = "Select a facility.";
    } else if (step === 3) {
      if (!consent) nextErrors.consent = "Please confirm the statement above to continue.";
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  // Validates and advances to the next step, submitting on the last.
  async function handleNext(e: FormEvent) {
    e.preventDefault();
    if (!validateStep()) return;
    if (step < steps.length - 1) {
      setStep((s) => s + 1);
      return;
    }

    // POST /auth/register creates the login and intake snapshot; the patient record and ID are created server-side after OTP verification.
    setSubmitting(true);
    setErrors({});
    try {
      await api.post("/auth/register", {
        email: values.email,
        password: values.password,
        fullName: values.fullName,
        dob: values.dateOfBirth,
        gender: values.gender,
        phone: values.phone,
        preferredFacilityId: values.facility || undefined,
      });
      // Registration creates no session, so an immediate login is chained, falling back to a manual login screen on failure.
      try {
        await api.post("/auth/login", { email: values.email, password: values.password });
        router.push("/verify-email");
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
          Log in and enter the verification code we emailed you to finish setting up your record.
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
              <FieldWrapper label="Full legal name" htmlFor="fullName" error={errors.fullName} required>
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
              <FieldWrapper
                label="Biological sex"
                htmlFor="gender"
                error={errors.gender}
                hint="Used for clinical dosing and lab reference ranges."
                required
              >
                <Select
                  id="gender"
                  value={values.gender}
                  error={!!errors.gender}
                  onChange={(e) => setValues((v) => ({ ...v, gender: e.target.value }))}
                >
                  <option value="">Select</option>
                  {BIOLOGICAL_SEX_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </Select>
              </FieldWrapper>
              <p className="flex items-start gap-2 rounded-xl bg-neutral-50 px-4 py-3 text-xs leading-relaxed text-neutral-600">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-teal" aria-hidden="true" />
                Your information is encrypted in transit and at rest, and is only visible to the
                care team directly involved in your treatment.
              </p>
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
            <div className="space-y-4">
              <div>
                <p className="font-display text-lg font-bold text-primary">Select facility</p>
                <p className="mt-1 text-sm leading-relaxed text-neutral-600">
                  Choose the oncology centre where you&apos;d like to be treated.
                </p>
              </div>

              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400" aria-hidden="true" />
                <Input
                  id="facilitySearch"
                  value={facilityQuery}
                  onChange={(e) => setFacilityQuery(e.target.value)}
                  placeholder="Search by name or address..."
                  className="pl-9"
                  aria-label="Search facilities"
                />
              </div>

              {geo.status === "prompting" && (
                <p className="text-xs text-neutral-500">Finding centres near you…</p>
              )}
              {geo.status === "granted" && (
                <p className="flex items-center gap-1.5 text-xs text-teal">
                  <MapPin className="size-3.5" aria-hidden="true" />
                  Sorted by distance from your current location.
                </p>
              )}
              {(geo.status === "denied" || geo.status === "unsupported") && (
                <p className="flex items-start gap-2 rounded-xl bg-neutral-50 px-4 py-3 text-xs leading-relaxed text-neutral-600">
                  <Info className="mt-0.5 size-4 shrink-0 text-neutral-400" aria-hidden="true" />
                  {geo.status === "denied"
                    ? "Location access was declined, so centres aren't sorted by distance. You can still pick any centre below."
                    : "This browser can't share your location, so centres aren't sorted by distance."}
                </p>
              )}

              <fieldset>
                <legend className="sr-only">Preferred facility</legend>
                <div className="space-y-2">
                  {rankedFacilities.map(({ facility, distanceKm }) => {
                    const isSelected = values.facility === facility.id;
                    return (
                      <label
                        key={facility.id}
                        className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors duration-standard ${
                          isSelected ? "border-primary bg-primary/5" : "border-neutral-200 hover:border-neutral-300"
                        }`}
                      >
                        <input
                          type="radio"
                          name="facility"
                          value={facility.id}
                          checked={isSelected}
                          onChange={() => setValues((v) => ({ ...v, facility: facility.id }))}
                          className="mt-1 size-4 shrink-0 accent-primary"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-primary">{facility.name}</span>
                          <span className="mt-0.5 block text-xs leading-relaxed text-neutral-600">{facility.address}</span>
                          {distanceKm !== null && (
                            <span className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-neutral-500">
                              <MapPin className="size-3" aria-hidden="true" />
                              {formatDistanceKm(distanceKm)}
                            </span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                  {rankedFacilities.length === 0 && (
                    <p className="rounded-xl border border-dashed border-neutral-200 p-6 text-center text-sm text-neutral-500">
                      {facilities.length === 0 ? "Loading centres…" : "No centres match that search."}
                    </p>
                  )}
                </div>
              </fieldset>
              {errors.facility && <p className="text-sm text-warning">{errors.facility}</p>}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div>
                <p className="font-display text-lg font-bold text-primary">Review your details</p>
                <p className="mt-1 text-sm leading-relaxed text-neutral-600">
                  Please check everything is correct before submitting. Your Unique Patient ID is
                  issued once you verify your email.
                </p>
              </div>

              <ReviewSection title="Identity" onEdit={() => setStep(0)}>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <div className="col-span-2">
                    <ReviewRow label="Full legal name" value={values.fullName} />
                  </div>
                  <ReviewRow label="Date of birth" value={values.dateOfBirth} />
                  <ReviewRow label="Biological sex" value={values.gender} />
                </dl>
              </ReviewSection>

              <ReviewSection title="Contact" onEdit={() => setStep(1)}>
                <dl className="space-y-3">
                  <ReviewRow label="Email address" value={values.email} />
                  <ReviewRow label="Phone number" value={values.phone} />
                </dl>
              </ReviewSection>

              <ReviewSection title="Facility" onEdit={() => setStep(2)}>
                <dl>
                  <ReviewRow
                    label="Preferred centre"
                    value={selectedFacility ? selectedFacility.name : ""}
                  />
                  {selectedFacility && (
                    <p className="mt-1 text-xs leading-relaxed text-neutral-500">{selectedFacility.address}</p>
                  )}
                </dl>
              </ReviewSection>

              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-neutral-200 p-4">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => {
                    setConsent(e.target.checked);
                    if (e.target.checked) setErrors((prev) => ({ ...prev, consent: undefined }));
                  }}
                  className="mt-0.5 size-4 shrink-0 accent-primary"
                />
                <span className="text-xs leading-relaxed text-neutral-600">
                  <span className="block text-sm font-semibold text-primary">Consent &amp; data usage</span>
                  I certify that the information provided is accurate to the best of my knowledge,
                  and I consent to the secure storage and processing of my medical records by my
                  care team.
                </span>
              </label>
              {errors.consent && <p className="text-sm text-warning">{errors.consent}</p>}
            </div>
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
          {step === steps.length - 1 ? "Submit Registration" : "Continue"}
        </Button>
      </div>
    </form>
  );
}
