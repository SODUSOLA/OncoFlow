"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Check, UserCheck, Wallet, FileText, Video, FlaskConical, Stethoscope, MessageCircle,
  ShieldCheck, ChevronRight, type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { api } from "@/lib/api";
import { useMyPatient } from "@/lib/useMyPatient";
import type { Appointment, Invoice } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Step {
  icon: LucideIcon;
  title: string;
  body: string;
  href?: string;
  cta?: string;
  // true = done, false = still to do, undefined = nothing to track (an ongoing part of care).
  done?: boolean;
}

// Walks a new patient through the whole OncoFlow journey, ticking off the steps their own account has already reached.
export default function GettingStartedPage() {
  const router = useRouter();
  const { patient, wallet, notLinked } = useMyPatient();
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [appointments, setAppointments] = useState<Appointment[] | null>(null);
  const [mfaEnabled, setMfaEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    if (!patient) return;
    api.get<{ invoices: Invoice[] }>(`/invoices?patientId=${patient.id}`)
      .then((res) => setInvoices(res.invoices))
      .catch(() => setInvoices([]));
    api.get<{ appointments: Appointment[] }>(`/appointments?patientId=${patient.id}`)
      .then((res) => setAppointments(res.appointments))
      .catch(() => setAppointments([]));
    api.get<{ user: { mfaEnabled: boolean } }>("/auth/profile")
      .then((res) => setMfaEnabled(res.user.mfaEnabled))
      .catch(() => setMfaEnabled(null));
  }, [patient]);

  // Compared as a string: kobo amounts arrive as integer strings, and "0" is the only zero.
  const hasFunds = !!wallet && wallet.balanceKobo !== "0";
  const hasPaidInvoice = invoices?.some((i) => i.status === "PAID");
  const hasConsultation = appointments?.some((a) => a.appointmentType === "VIRTUAL" && a.status === "COMPLETED");

  const steps: Step[] = [
    {
      icon: UserCheck,
      title: "Get your Unique Patient ID",
      body: "After you register, your care team confirms your facility and issues your Unique Patient ID. Everything in the app unlocks once that's done.",
      done: !!patient,
    },
    {
      icon: Wallet,
      title: "Put money in your wallet",
      body: "Your wallet pays for consultations and treatment. Your care team can fund it for you, and you can see every credit and debit in Transaction History.",
      href: "/wallet",
      cta: "Open wallet",
      done: patient ? hasFunds || !!hasPaidInvoice : undefined,
    },
    {
      icon: FileText,
      title: "Pay your invoices",
      body: "Your care team sends invoices for each service. Pay them from your wallet, or switch on automatic payments in Settings so they're paid the moment they're issued.",
      href: "/settings",
      cta: "Payment settings",
      done: invoices ? !!hasPaidInvoice : undefined,
    },
    {
      icon: Video,
      title: "Meet your oncologist",
      body: "Book a video consultation from Appointments. At the time, open the appointment and tap to join the call. A countdown on your dashboard shows how long is left.",
      href: "/appointments",
      cta: "See appointments",
      done: appointments ? !!hasConsultation : undefined,
    },
    {
      icon: FlaskConical,
      title: "Complete your pre-treatment checklist",
      body: "If your doctor requests blood work, upload the results under Records. Your dashboard shows the step that's waiting on you.",
      href: "/records",
      cta: "Go to records",
    },
    {
      icon: Stethoscope,
      title: "Visit the clinic and start treatment",
      body: "Treatment and clinic visits happen in person at your facility. Each visit appears in your care timeline, and your care team opens and closes your case as you go.",
      href: "/home",
      cta: "View timeline",
    },
    {
      icon: MessageCircle,
      title: "Message your care team any time",
      body: "Use Chat to ask questions or report side effects between visits. Your team replies as soon as they can.",
      href: "/messages",
      cta: "Open chat",
    },
    {
      icon: ShieldCheck,
      title: "Secure your account (optional)",
      body: "Turn on two-factor authentication in Settings so a stolen password alone can't open your health records.",
      href: "/settings",
      cta: "Open settings",
      done: mfaEnabled === null ? undefined : mfaEnabled,
    },
  ];

  const tracked = steps.filter((s) => s.done !== undefined);
  const completed = tracked.filter((s) => s.done).length;

  return (
    <div className="space-y-5 p-4">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} aria-label="Back">
          <ArrowLeft className="size-5 text-neutral-500" />
        </button>
        <h1 className="text-lg font-bold text-neutral-900">Getting started</h1>
      </div>

      <p className="text-sm leading-relaxed text-neutral-600">
        Here&apos;s how your care works from first sign-in to treatment. Steps tick off on their own as you go.
      </p>

      {notLinked && (
        <Card className="bg-amber-bg text-sm text-amber-text">
          Your care team is still confirming your facility. You&apos;ll see your progress here once your Unique Patient ID is issued.
        </Card>
      )}

      {patient && tracked.length > 0 && (
        <Card className="flex items-center justify-between">
          <p className="text-sm font-semibold text-neutral-700">Your progress</p>
          <Badge variant={completed === tracked.length ? "success" : "default"}>
            {completed} of {tracked.length} done
          </Badge>
        </Card>
      )}

      <ol className="space-y-3">
        {steps.map((step, i) => {
          const Icon = step.icon;
          return (
            <li key={step.title}>
              <Card className="flex gap-3">
                <div
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-full",
                    step.done ? "bg-teal text-white" : "bg-primary-50 text-primary",
                  )}
                >
                  {step.done ? <Check className="size-4.5" aria-hidden="true" /> : <Icon className="size-4.5" aria-hidden="true" />}
                </div>
                <div className="flex-1">
                  <p className="text-[11px] font-bold tracking-wide text-neutral-400">STEP {i + 1}</p>
                  <p className="text-sm font-bold text-neutral-900">{step.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-neutral-500">{step.body}</p>
                  {step.href && (
                    <Link href={step.href} className="mt-2 inline-flex items-center gap-0.5 text-xs font-semibold text-primary">
                      {step.cta} <ChevronRight className="size-3.5" aria-hidden="true" />
                    </Link>
                  )}
                </div>
              </Card>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
