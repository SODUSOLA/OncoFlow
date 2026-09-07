import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../../lib/api";
import type { CountdownCase, Invoice, Patient, PublicInquiry } from "../../../lib/types";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { useRegionScope } from "../lib/useRegionScope";

function koboToNaira(k: number) {
  return `₦${(k / 100).toLocaleString("en-NG", { minimumFractionDigits: 0 })}`;
}

function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.round(hrs / 24)}d`;
}

// Same operational-status heuristic used on the Countdown page — kept local rather than shared
// since the two pages surface different slices of the same field set for different purposes.
function blockedOn(c: CountdownCase): string {
  if (!c.labsUploadedAt) return "Bloodwork appointment";
  if (!c.resultsSentToQaAt) return "Clinician sign-off";
  if (!c.paymentConfirmedAt) return "Unpaid invoice";
  return "—";
}

interface StockOverview { variancesOpen: number }

export default function RegionOverviewPage() {
  const { region, facilities, facilitiesInRegion, facilityIdsInRegion } = useRegionScope();
  const [cases, setCases] = useState<CountdownCase[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [inquiries, setInquiries] = useState<PublicInquiry[]>([]);
  const [stock, setStock] = useState<StockOverview | null>(null);

  useEffect(() => {
    api.get<{ cases: CountdownCase[] }>("/countdown-cases?scope=overview").then((d) => setCases(d.cases)).catch(() => {});
    api.get<{ patients: Patient[] }>("/patients?facilityId=all").then((d) => setPatients(d.patients)).catch(() => {});
    api.get<{ invoices: Invoice[] }>("/invoices?facilityId=all").then((d) => setInvoices(d.invoices)).catch(() => {});
    api.get<{ inquiries: PublicInquiry[] }>("/admin/inquiries").then((d) => setInquiries(d.inquiries)).catch(() => {});
    api.get<StockOverview>(`/inventory/overview`).then(setStock).catch(() => setStock(null));
  }, []);

  const patientById = useMemo(() => new Map(patients.map((p) => [p.id, p])), [patients]);
  const facilityById = useMemo(() => new Map(facilities.map((f) => [f.id, f])), [facilities]);

  const casesInRegion = useMemo(
    () => cases.filter((c) => {
      const facilityId = patientById.get(c.patientId)?.facilityId;
      return facilityId ? facilityIdsInRegion.has(facilityId) : false;
    }),
    [cases, patientById, facilityIdsInRegion],
  );
  const invoicesInRegion = useMemo(
    () => invoices.filter((i) => facilityIdsInRegion.has(i.facilityId)),
    [invoices, facilityIdsInRegion],
  );
  const escalated = useMemo(() => casesInRegion.filter((c) => c.status === "ESCALATED"), [casesInRegion]);
  const awaitingPayment = useMemo(() => invoicesInRegion.filter((i) => i.status !== "PAID" && i.status !== "VOID"), [invoicesInRegion]);
  const outstandingKobo = useMemo(() => awaitingPayment.reduce((sum, i) => sum + i.totalKobo, 0), [awaitingPayment]);

  const casesByFacility = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of cases) {
      if (c.status !== "ACTIVE" && c.status !== "ESCALATED") continue;
      const facilityId = patientById.get(c.patientId)?.facilityId;
      if (!facilityId) continue;
      counts.set(facilityId, (counts.get(facilityId) ?? 0) + 1);
    }
    return counts;
  }, [cases, patientById]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-3">
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Active Countdown Cases</p>
          <p className="mt-1 text-3xl font-bold text-gray-900">{casesInRegion.filter((c) => c.status === "ACTIVE").length}</p>
          <p className="mt-1 text-xs text-gray-400">across {facilitiesInRegion.length} facilities in region</p>
        </Card>
        <Card className="border-blue-200 bg-blue-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Escalated to You</p>
          <p className="mt-1 text-3xl font-bold text-blue-900">{escalated.length}</p>
          <p className="mt-1 text-xs text-blue-600">cases past SLA</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Invoices Awaiting Payment</p>
          <p className="mt-1 text-3xl font-bold text-gray-900">{awaitingPayment.length}</p>
          <p className="mt-1 text-xs text-gray-400">{koboToNaira(outstandingKobo)} outstanding</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Stock Variances Open</p>
          <p className="mt-1 text-3xl font-bold text-gray-900">{stock?.variancesOpen ?? "—"}</p>
          <p className="mt-1 text-xs text-gray-400">from latest reconciliation</p>
        </Card>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card className="col-span-2 overflow-hidden">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5">
            <div>
              <p className="text-sm font-semibold text-gray-800">Escalations awaiting action</p>
              <p className="text-xs text-gray-400">Operational status only — no clinical detail</p>
            </div>
            <Link to="/dashboard/regional-admin/countdown" className="text-xs font-medium text-ink hover:underline">Open board →</Link>
          </div>
          {escalated.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">No escalations in region</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-gray-400">
                <tr>
                  <th className="px-5 py-2 font-medium">Case</th>
                  <th className="px-5 py-2 font-medium">Facility</th>
                  <th className="px-5 py-2 font-medium">Stage</th>
                  <th className="px-5 py-2 font-medium">Blocked on</th>
                  <th className="px-5 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {escalated.map((c) => {
                  const patient = patientById.get(c.patientId);
                  const facility = patient ? facilityById.get(patient.facilityId) : undefined;
                  return (
                    <tr key={c.id}>
                      <td className="px-5 py-3 font-mono text-xs text-gray-700">{c.id.slice(0, 8).toUpperCase()}</td>
                      <td className="px-5 py-3 text-gray-700">{facility?.name ?? "—"}</td>
                      <td className="px-5 py-3 text-gray-500">Day {c.currentDay}</td>
                      <td className="px-5 py-3 text-red-600">{blockedOn(c)}</td>
                      <td className="px-5 py-3 text-right">
                        <Button size="sm" variant="outline">Chase</Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>

        <Card className="flex flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5">
            <p className="text-sm font-semibold text-gray-800">Inquiry queue</p>
            <span className="rounded border border-gray-200 px-2 py-0.5 text-[10px] font-medium text-gray-500">5-min SLA</span>
          </div>
          <div className="flex-1 divide-y divide-gray-50">
            {inquiries.filter((i) => i.status === "OPEN").slice(0, 4).map((inq) => (
              <div key={inq.id} className="flex items-start justify-between gap-2 px-5 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-800">{inq.name}</p>
                  <p className="truncate text-xs text-gray-400">{[inq.email, inq.phone].filter(Boolean).join(" · ") || "No contact given"}</p>
                </div>
                <span className="shrink-0 text-xs text-gray-400">{timeAgo(inq.updatedAt)}</span>
              </div>
            ))}
            {inquiries.filter((i) => i.status === "OPEN").length === 0 && (
              <p className="px-5 py-6 text-center text-sm text-gray-400">No open inquiries</p>
            )}
          </div>
          <div className="border-t border-gray-100 p-4">
            <Link to="/dashboard/regional-admin/inquiry">
              <Button variant="outline" size="sm" className="w-full">Open inquiry desk</Button>
            </Link>
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <p className="text-sm font-semibold text-gray-800">Region scope enforcement</p>
        <p className="mt-1 text-xs text-gray-500">
          Every list, board and search result on this console is pre-filtered to facilities tagged{" "}
          <code className="rounded bg-gray-100 px-1 py-0.5 text-[11px]">region</code> = <code className="rounded bg-gray-100 px-1 py-0.5 text-[11px]">{region ?? "—"}</code>.
          Records outside the region are not shown here.
        </p>
        <div className="mt-4 grid grid-cols-4 gap-3">
          {facilities.map((f) => {
            const inRegion = facilityIdsInRegion.has(f.id);
            return (
              <div key={f.id} className={`rounded border p-3 ${inRegion ? "border-gray-200" : "border-gray-100 bg-gray-50"}`}>
                <p className={`text-sm font-medium ${inRegion ? "text-gray-800" : "text-gray-400"}`}>{f.name}</p>
                <p className="mt-0.5 text-xs text-gray-400">
                  {inRegion ? `${casesByFacility.get(f.id) ?? 0} active cases` : f.region}
                </p>
                <p className={`mt-2 text-[10px] font-semibold uppercase tracking-wide ${inRegion ? "text-gray-400" : "text-red-400"}`}>
                  {inRegion ? "In region" : "Out of scope"}
                </p>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
