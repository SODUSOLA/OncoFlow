"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight, Video } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { api } from "@/lib/api";
import { useMyPatient } from "@/lib/useMyPatient";
import type { Appointment } from "@/lib/types";

const APPOINTMENT_TYPE_LABELS: Record<Appointment["appointmentType"], string> = {
  VIRTUAL: "Video Consultation",
  PHYSICAL: "Clinic Visit",
  CHEMOTHERAPY: "Chemotherapy Session",
  PROCEDURE: "Procedure",
};

const WEEKDAY_HEADERS = ["S", "M", "T", "W", "T", "F", "S"];

function dateKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export default function AppointmentsPage() {
  const router = useRouter();
  const { patient, loading: patientLoading, notLinked } = useMyPatient();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [monthCursor, setMonthCursor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  useEffect(() => {
    if (!patient) return;
    (async () => {
      try {
        const res = await api.get<{ appointments: Appointment[] }>(`/appointments?patientId=${patient.id}`);
        setAppointments(res.appointments.filter((a) => a.status !== "CANCELLED"));
      } catch {
        setAppointments([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [patient]);

  const appointmentsByDay = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const appt of appointments) {
      const key = dateKey(new Date(appt.scheduledAt));
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(appt);
    }
    return map;
  }, [appointments]);

  const grid = useMemo(() => {
    const firstOfMonth = new Date(monthCursor);
    const startOffset = firstOfMonth.getDay();
    const start = new Date(firstOfMonth);
    start.setDate(1 - startOffset);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [monthCursor]);

  if (patientLoading || loading) {
    return <p className="p-6 text-center text-sm text-neutral-400">Loading appointments…</p>;
  }

  if (notLinked || !patient) {
    return (
      <div className="p-4">
        <Card className="text-center text-sm text-neutral-600">
          Your appointments become available once your care team confirms your patient record.
        </Card>
      </div>
    );
  }

  const today = new Date();
  const visibleList = selectedDay
    ? (appointmentsByDay.get(selectedDay) ?? [])
    : [...appointments].sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} aria-label="Back">
          <ArrowLeft className="size-5 text-neutral-500" />
        </button>
        <h1 className="text-lg font-bold text-neutral-900">Appointments</h1>
      </div>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <button
            aria-label="Previous month"
            onClick={() => setMonthCursor((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
          >
            <ChevronLeft className="size-4.5 text-neutral-400" aria-hidden="true" />
          </button>
          <span className="text-sm font-bold text-neutral-900">
            {monthCursor.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </span>
          <button
            aria-label="Next month"
            onClick={() => setMonthCursor((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
          >
            <ChevronRight className="size-4.5 text-neutral-400" aria-hidden="true" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-y-1.5 text-center">
          {WEEKDAY_HEADERS.map((w, i) => (
            <span key={i} className="text-[11px] font-semibold text-neutral-400">{w}</span>
          ))}
          {grid.map((d) => {
            const key = dateKey(d);
            const inMonth = d.getMonth() === monthCursor.getMonth();
            const isToday = dateKey(today) === key;
            const hasAppt = appointmentsByDay.has(key);
            const isSelected = selectedDay === key;
            return (
              <button
                key={key}
                disabled={!hasAppt}
                onClick={() => setSelectedDay((prev) => (prev === key ? null : key))}
                className={`flex flex-col items-center gap-0.5 rounded-lg py-1.5 text-xs ${
                  !inMonth ? "text-neutral-300" : "text-neutral-700"
                } ${isSelected ? "bg-primary text-white" : isToday ? "bg-primary-50 font-bold text-primary" : ""}`}
              >
                {d.getDate()}
                <span
                  className={`size-1 rounded-full ${
                    hasAppt ? (isSelected ? "bg-white" : "bg-amber") : "bg-transparent"
                  }`}
                />
              </button>
            );
          })}
        </div>
      </Card>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-neutral-900">
            {selectedDay
              ? (() => {
                  const [y, m, day] = selectedDay.split("-").map(Number);
                  return new Date(y!, m!, day!).toLocaleDateString("en-US", { month: "long", day: "numeric" });
                })()
              : "All Appointments"}
          </h2>
          {selectedDay && (
            <button onClick={() => setSelectedDay(null)} className="text-xs font-semibold text-primary">
              Show all
            </button>
          )}
        </div>

        {visibleList.length === 0 ? (
          <Card className="text-center text-sm text-neutral-400">No appointments</Card>
        ) : (
          <div className="space-y-3">
            {visibleList.map((appt) => {
              const date = new Date(appt.scheduledAt);
              const row = (
                <Card variant={appt.appointmentType === "VIRTUAL" ? "interactive" : "default"} className="flex items-center gap-3">
                  <div className="min-w-11 rounded-lg bg-primary px-2.5 py-1.5 text-center text-white">
                    <p className="text-[10px] font-bold uppercase">{date.toLocaleDateString("en-US", { month: "short" })}</p>
                    <p className="text-sm font-bold">{date.getDate()}</p>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-neutral-900">{APPOINTMENT_TYPE_LABELS[appt.appointmentType]}</p>
                    <p className="text-xs text-neutral-500">
                      {date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })} · {appt.status}
                    </p>
                  </div>
                  {appt.appointmentType === "VIRTUAL" && <Video className="size-4 text-primary" aria-hidden="true" />}
                </Card>
              );
              return appt.appointmentType === "VIRTUAL" ? (
                <Link key={appt.id} href={`/appointments/${appt.id}/video`}>{row}</Link>
              ) : (
                <div key={appt.id}>{row}</div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
