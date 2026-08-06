"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  FileText, Clock, Calendar, Upload, Eye, EyeOff, ChevronRight, Plus,
  ShieldCheck, Video, Stethoscope, Syringe, Activity, PlayCircle,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { api } from "@/lib/api";
import { useMyPatient } from "@/lib/useMyPatient";
import { useCountdown } from "@/lib/useCountdown";
import type { Invoice, TimelineEvent, CountdownCase, LabRequest, Appointment } from "@/lib/types";

const EVENT_LABELS: Record<TimelineEvent["eventType"], string> = {
  REGISTRATION: "Registered",
  STATUS_CHANGE: "Status updated",
  CONSULTATION: "Consultation",
  APPOINTMENT: "Appointment",
  INVOICE: "Invoice",
  WALLET: "Wallet activity",
};

const APPOINTMENT_TYPE_LABELS: Record<Appointment["appointmentType"], string> = {
  VIRTUAL: "Video Consultation",
  PHYSICAL: "Clinic Visit",
  CHEMOTHERAPY: "Chemotherapy Session",
  PROCEDURE: "Procedure",
};

const APPOINTMENT_TYPE_ICONS: Record<Appointment["appointmentType"], typeof Video> = {
  VIRTUAL: Video,
  PHYSICAL: Stethoscope,
  CHEMOTHERAPY: Syringe,
  PROCEDURE: Activity,
};

function koboToNaira(kobo: string) {
  return `₦${(Number(kobo) / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function NextEventCard({ appointment }: { appointment: Appointment }) {
  const countdown = useCountdown(appointment.scheduledAt);
  const Icon = APPOINTMENT_TYPE_ICONS[appointment.appointmentType];
  const date = new Date(appointment.scheduledAt);

  const content = (
    <Card className="bg-primary text-white" variant="elevated">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[11px] font-bold">
          <Icon className="size-3.5" aria-hidden="true" /> Next Event
        </span>
        <span className="text-xs text-white/60">
          {date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </span>
      </div>
      <p className="mt-3 text-lg font-bold">{APPOINTMENT_TYPE_LABELS[appointment.appointmentType]}</p>
      <p className="mt-1 text-xs text-white/65">
        {date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
      </p>
      {!countdown.isPast && (
        <>
          <p className="mt-3 text-[10px] font-bold tracking-widest text-white/55">STARTS IN</p>
          <p className="font-mono text-2xl font-bold text-amber">
            {countdown.days > 0 && `${countdown.days}d `}
            {String(countdown.hours).padStart(2, "0")}:{String(countdown.minutes).padStart(2, "0")}:{String(countdown.seconds).padStart(2, "0")}
          </p>
        </>
      )}
    </Card>
  );

  return appointment.appointmentType === "VIRTUAL" ? (
    <Link href={`/appointments/${appointment.id}/video`}>{content}</Link>
  ) : (
    content
  );
}

export default function HomePage() {
  const { patient, wallet, loading, error, notLinked } = useMyPatient();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [countdown, setCountdown] = useState<CountdownCase | null>(null);
  const [pendingLabRequest, setPendingLabRequest] = useState<LabRequest | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [balanceRevealed, setBalanceRevealed] = useState(true);

  useEffect(() => {
    if (!patient) return;
    api.get<{ invoices: Invoice[] }>(`/invoices?patientId=${patient.id}`)
      .then((res) => setInvoices(res.invoices))
      .catch(() => setInvoices([]));
    api.get<{ events: TimelineEvent[] }>(`/patients/${patient.id}/timeline`)
      .then((res) => setTimeline(res.events.slice(0, 5)))
      .catch(() => setTimeline([]));
    api.get<{ cases: CountdownCase[] }>(`/countdown-cases?patientId=${patient.id}`)
      .then((res) => setCountdown(res.cases.find((c) => c.status === "ACTIVE") ?? null))
      .catch(() => setCountdown(null));
    api.get<{ labRequests: LabRequest[] }>(`/lab-requests?patientId=${patient.id}`)
      .then((res) => setPendingLabRequest(res.labRequests.find((r) => r.status === "PENDING") ?? null))
      .catch(() => setPendingLabRequest(null));
    api.get<{ appointments: Appointment[] }>(`/appointments?patientId=${patient.id}`)
      .then((res) => {
        const now = Date.now();
        const upcoming = res.appointments
          .filter((a) => new Date(a.scheduledAt).getTime() > now && !["CANCELLED", "COMPLETED", "MISSED"].includes(a.status))
          .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
        setAppointments(upcoming.slice(0, 2));
      })
      .catch(() => setAppointments([]));
  }, [patient]);

  if (loading) {
    return <p className="p-6 text-center text-sm text-neutral-400">Loading your dashboard…</p>;
  }

  if (notLinked) {
    return (
      <div className="p-4">
        <Card className="text-center">
          <p className="font-display text-lg font-bold text-primary">No patient record linked yet</p>
          <p className="mt-2 text-sm leading-relaxed text-neutral-600">
            Your account was created, but your care team hasn&apos;t confirmed your facility and
            issued your Unique Patient ID yet. Check back soon — you&apos;ll be able to see your
            wallet, invoices, and care timeline here once that&apos;s done.
          </p>
        </Card>
      </div>
    );
  }

  if (error || !patient) {
    return <p className="p-6 text-center text-sm text-critical">{error ?? "Something went wrong."}</p>;
  }

  const pendingInvoices = invoices.filter((inv) => inv.status === "SENT" || inv.status === "OVERDUE");
  const nextAppointment = appointments[0];
  const balanceKobo = wallet?.balanceKobo;

  return (
    <div className="space-y-5 p-4">
      <h1 className="font-display text-xl font-bold text-primary">
        {getGreeting()}, {patient.firstName}
      </h1>

      <Card className="bg-primary text-white">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="size-3.5 text-white/70" aria-hidden="true" />
              <span className="text-xs font-medium text-white/80">Available Balance</span>
              <button
                type="button"
                onClick={() => setBalanceRevealed((r) => !r)}
                aria-label={balanceRevealed ? "Hide balance" : "Show balance"}
                className="text-white/70 hover:text-white"
              >
                {balanceRevealed ? <EyeOff className="size-3.5" aria-hidden="true" /> : <Eye className="size-3.5" aria-hidden="true" />}
              </button>
            </div>
            <Link href="/wallet" className="mt-1.5 flex items-center gap-1 font-display text-2xl font-bold">
              {balanceRevealed ? (balanceKobo ? koboToNaira(balanceKobo) : "—") : "••••••"}
              <ChevronRight className="size-4.5" aria-hidden="true" />
            </Link>
          </div>
          <div className="text-right">
            <Link href="/wallet/transactions" className="flex items-center gap-1 text-xs font-medium text-white/80">
              Transaction History <ChevronRight className="size-3.5" aria-hidden="true" />
            </Link>
            <Link
              href="/wallet/add-money"
              className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-xs font-bold text-primary"
            >
              <Plus className="size-3.5" aria-hidden="true" /> Add Money
            </Link>
          </div>
        </div>
      </Card>

      {countdown && (
        <Card className="bg-primary text-white" variant="elevated">
          <span className="inline-block rounded-full bg-white/15 px-3 py-1 text-[11px] font-bold">
            Next Phase Protocol
          </span>
          <p className="mt-3 text-lg font-bold">
            Day {countdown.currentDay} — Pre-Treatment Countdown
          </p>
          <p className="mt-1 text-xs text-white/65">
            {countdown.labsUploadedAt
              ? "Lab results uploaded, pending clinical review."
              : "Upload your blood work to stay on schedule."}
          </p>
          <p className="mt-3 text-[10px] font-bold tracking-widest text-white/55">DAYS REMAINING</p>
          <p className="font-mono text-3xl font-bold text-amber">{countdown.currentDay}</p>
        </Card>
      )}

      {nextAppointment && <NextEventCard appointment={nextAppointment} />}

      <div>
        <h2 className="mb-3 text-base font-bold text-neutral-900">Care Journey Timeline</h2>
        <Card className="p-0">
          {pendingLabRequest && (
            <div className="flex gap-3 bg-amber-bg px-4 py-3.5">
              <div className="flex w-5 flex-col items-center pt-1">
                <span className="size-2.5 rounded-full bg-amber" />
              </div>
              <div className="flex-1">
                <p className="text-[11px] font-bold tracking-wide text-amber-text">ACTIVE STEP</p>
                <p className="mt-0.5 text-sm font-bold text-neutral-900">Pre-Treatment Laboratory Upload</p>
                <p className="mt-0.5 text-xs text-neutral-500">
                  Please upload your latest blood chemistry results for clinical clearance.
                </p>
                <Link href="/records">
                  <Button size="sm" className="mt-2.5">
                    <Upload className="size-3.5" aria-hidden="true" />
                    Upload Lab Results
                  </Button>
                </Link>
              </div>
            </div>
          )}
          {timeline.length === 0 ? (
            <p className="p-6 text-center text-sm text-neutral-400">No activity yet</p>
          ) : (
            <div className="divide-y divide-neutral-100">
              {timeline.map((event) => (
                <div key={event.id} className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm text-neutral-800">{EVENT_LABELS[event.eventType]}</span>
                  <span className="text-xs text-neutral-400">
                    {new Date(event.createdAt).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[11px] font-bold tracking-wide text-neutral-500">NEXT APPOINTMENTS</span>
          <Link href="/appointments" className="flex items-center gap-0.5 text-xs font-semibold text-primary">
            View All <ChevronRight className="size-3.5" aria-hidden="true" />
          </Link>
        </div>
        {appointments.length === 0 ? (
          <Card className="text-center text-sm text-neutral-400">
            <Calendar className="mx-auto mb-2 size-5 text-neutral-300" aria-hidden="true" />
            No upcoming appointments
          </Card>
        ) : (
          <Card>
            <div className="space-y-3">
              {appointments.map((appt) => {
                const date = new Date(appt.scheduledAt);
                const row = (
                  <div className="flex items-center gap-3">
                    <div className="min-w-11 rounded-lg bg-primary px-2.5 py-1.5 text-center text-white">
                      <p className="text-[10px] font-bold uppercase">{date.toLocaleDateString("en-US", { month: "short" })}</p>
                      <p className="text-sm font-bold">{date.getDate()}</p>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-neutral-900">{APPOINTMENT_TYPE_LABELS[appt.appointmentType]}</p>
                      <p className="text-xs text-neutral-500">
                        {date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                );
                return appt.appointmentType === "VIRTUAL" ? (
                  <Link key={appt.id} href={`/appointments/${appt.id}/video`}>
                    {row}
                  </Link>
                ) : (
                  <div key={appt.id}>{row}</div>
                );
              })}
            </div>
          </Card>
        )}
      </div>

      {pendingInvoices.length > 0 && (
        <Link href="/wallet">
          <Card variant="interactive" className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <FileText className="size-4.5 text-primary" aria-hidden="true" />
              <span className="text-sm font-medium text-neutral-800">
                {pendingInvoices.length} pending {pendingInvoices.length === 1 ? "invoice" : "invoices"}
              </span>
            </div>
            <Badge variant="warning">View</Badge>
          </Card>
        </Link>
      )}

      <Card className="flex items-center gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary">
          <PlayCircle className="size-5" aria-hidden="true" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold text-neutral-900">Watch how OncoFlow works</p>
          <p className="text-xs text-neutral-400">A quick walkthrough of the app</p>
        </div>
        <Badge variant="sample">Coming soon</Badge>
      </Card>

      <div className="pb-2 text-center">
        <p className="flex items-center justify-center gap-1.5 text-xs text-neutral-400">
          <Clock className="size-3.5" aria-hidden="true" />
          Unique Patient ID: <span className="font-mono font-semibold text-neutral-600">{patient.uniquePatientId}</span>
        </p>
      </div>
    </div>
  );
}
