"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FieldWrapper, Input, Select, Textarea } from "@/components/ui/Field";

const inquiryTypes = [
  { value: "hospital", label: "Hospital / Facility Inquiry" },
  { value: "patient", label: "Patient Inquiry" },
  { value: "support", label: "General Support" },
];

interface FormState {
  name: string;
  email: string;
  inquiryType: string;
  message: string;
}

const initialState: FormState = { name: "", email: "", inquiryType: "hospital", message: "" };

export function ContactForm() {
  const [values, setValues] = useState<FormState>(initialState);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const nextErrors: Partial<Record<keyof FormState, string>> = {};
    if (!values.name.trim()) nextErrors.name = "Please enter your name.";
    if (!/^\S+@\S+\.\S+$/.test(values.email)) nextErrors.email = "Please enter a valid email address.";
    if (!values.message.trim()) nextErrors.message = "Please add a short message.";

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length === 0) {
      setSubmitted(true);
    }
  }

  if (submitted) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-surface p-10 text-center shadow-sm">
        <CheckCircle2 className="mx-auto size-10 text-teal" aria-hidden="true" />
        <h3 className="mt-4 font-display text-xl font-bold text-primary">Message sent</h3>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600">
          Thank you for reaching out. Our team will get back to you shortly.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5 rounded-2xl border border-neutral-200 bg-surface p-6 shadow-sm sm:p-8">
      <FieldWrapper label="Inquiry type" htmlFor="inquiryType">
        <Select
          id="inquiryType"
          value={values.inquiryType}
          onChange={(e) => setValues((v) => ({ ...v, inquiryType: e.target.value }))}
        >
          {inquiryTypes.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </Select>
      </FieldWrapper>

      <FieldWrapper label="Full name" htmlFor="name" error={errors.name} required>
        <Input
          id="name"
          value={values.name}
          error={!!errors.name}
          onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
          placeholder="Jane Doe"
        />
      </FieldWrapper>

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

      <FieldWrapper label="Message" htmlFor="message" error={errors.message} required>
        <Textarea
          id="message"
          value={values.message}
          error={!!errors.message}
          onChange={(e) => setValues((v) => ({ ...v, message: e.target.value }))}
          placeholder="How can we help?"
        />
      </FieldWrapper>

      <Button type="submit" size="lg" className="w-full">
        Send Message
      </Button>
    </form>
  );
}
