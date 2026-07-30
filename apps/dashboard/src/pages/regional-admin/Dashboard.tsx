import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import type { CountdownCase, Invoice, ServiceClassification, Patient } from "../../lib/types";

export default function RegionalAdminDashboard() {
  const [cases, setCases] = useState<CountdownCase[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [classifications, setClassifications] = useState<ServiceClassification[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);

  const [showGenerator, setShowGenerator] = useState(false);
  const [genPatientId, setGenPatientId] = useState("");
  const [genClassificationId, setGenClassificationId] = useState("");
  const [genLoading, setGenLoading] = useState(false);
  const [genResult, setGenResult] = useState<string | null>(null);

  const [tab, setTab] = useState<"countdown" | "invoices">("countdown");

  useEffect(() => {
    api.get<{ invoices: Invoice[] }>("/invoices?facilityId=all").then((d) => setInvoices(d.invoices)).catch(() => {});
    api.get<{ classifications: ServiceClassification[] }>("/classifications").then((d) => setClassifications(d.classifications)).catch(() => {});
    api.get<{ patients: Patient[] }>("/patients?facilityId=all").then((d) => setPatients(d.patients)).catch(() => {});
  }, []);

  function loadCountdown() {
    api.get<{ cases: CountdownCase[] }>("/countdown-cases").then((d) => setCases(d.cases)).catch(() => {});
  }

  useEffect(() => {
    loadCountdown();
    const interval = setInterval(loadCountdown, 30000);
    return () => clearInterval(interval);
  }, []);

  async function generateInvoice() {
    if (!genPatientId || !genClassificationId) return;
    setGenLoading(true);
    setGenResult(null);
    try {
      await api.post<{ invoice: Invoice }>("/invoices", {
        patientId: genPatientId,
        classificationId: genClassificationId,
        facilityId: "pilot",
      });
      setGenResult("Invoice created successfully");
      setGenPatientId("");
      setGenClassificationId("");
      api.get<{ invoices: Invoice[] }>("/invoices?facilityId=all")
        .then((d) => setInvoices(d.invoices)).catch(() => {});
    } catch (err) {
      setGenResult(err instanceof Error ? err.message : "Failed to create invoice");
    } finally {
      setGenLoading(false);
    }
  }

  function koboToNaira(k: number) {
    return `₦${(k / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800">Regional Admin</h2>
        <button
          onClick={() => setShowGenerator(!showGenerator)}
          className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 text-sm font-medium"
        >
          {showGenerator ? "Close Generator" : "Generate Invoice"}
        </button>
      </div>

      {showGenerator && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h3 className="font-semibold text-gray-700">Invoice Generator</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Patient</label>
              <select
                value={genPatientId}
                onChange={(e) => setGenPatientId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Select patient...</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>{p.firstName} {p.lastName} ({p.uniquePatientId})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Service Classification</label>
              <select
                value={genClassificationId}
                onChange={(e) => setGenClassificationId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Select classification...</option>
                {classifications.map((c) => (
                  <option key={c.id} value={c.id}>{c.name.replace(/_/g, " ")}</option>
                ))}
              </select>
            </div>
          </div>
          <button
            onClick={generateInvoice}
            disabled={genLoading || !genPatientId || !genClassificationId}
            className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 text-sm font-medium"
          >
            {genLoading ? "Creating..." : "Create Invoice"}
          </button>
          {genResult && (
            <p className={`text-sm ${genResult.includes("successfully") ? "text-green-600" : "text-red-600"}`}>
              {genResult}
            </p>
          )}
          <p className="text-xs text-gray-400 italic">
            Amount is computed from tariff rates — no manual entry per FR-51.
          </p>
        </div>
      )}

      <div className="flex gap-2 border-b border-gray-200 pb-2">
        <button
          onClick={() => setTab("countdown")}
          className={`px-4 py-1.5 text-sm font-medium rounded-t-lg ${tab === "countdown" ? "bg-white border border-b-white border-gray-200 text-brand-700" : "text-gray-500 hover:text-gray-700"}`}
        >
          7-Day Countdown
        </button>
        <button
          onClick={() => setTab("invoices")}
          className={`px-4 py-1.5 text-sm font-medium rounded-t-lg ${tab === "invoices" ? "bg-white border border-b-white border-gray-200 text-brand-700" : "text-gray-500 hover:text-gray-700"}`}
        >
          Invoices
        </button>
      </div>

      {tab === "countdown" && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {cases.length === 0 ? (
            <div className="p-8 text-center text-gray-400">No active countdown cases</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Patient</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Day</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Labs</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">QA</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Payment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {cases.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800">{c.patientId.slice(0, 8)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold ${
                        c.currentDay <= 2 ? "bg-red-100 text-red-700" : c.currentDay <= 5 ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"
                      }`}>
                        {c.currentDay}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        c.status === "ACTIVE" ? "bg-blue-100 text-blue-700" : "bg-red-100 text-red-700"
                      }`}>{c.status}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{c.labsUploadedAt ? "Uploaded" : "Pending"}</td>
                    <td className="px-4 py-3 text-gray-500">{c.resultsSentToQaAt ? "Sent" : "Pending"}</td>
                    <td className="px-4 py-3 text-gray-500">{c.paymentConfirmedAt ? "Paid" : "Pending"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "invoices" && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {invoices.length === 0 ? (
            <div className="p-8 text-center text-gray-400">No invoices found</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Patient</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Amount</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Due</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800">{inv.patientId.slice(0, 8)}</td>
                    <td className="px-4 py-3">{koboToNaira(inv.totalKobo)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        inv.status === "PAID" ? "bg-green-100 text-green-700" :
                        inv.status === "SENT" ? "bg-blue-100 text-blue-700" :
                        inv.status === "DRAFT" ? "bg-gray-100 text-gray-600" : "bg-red-100 text-red-700"
                      }`}>{inv.status}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{new Date(inv.dueDate).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-gray-500">{new Date(inv.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
