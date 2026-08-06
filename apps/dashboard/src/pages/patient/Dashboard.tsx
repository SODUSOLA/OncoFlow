import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useMyPatient } from "../../features/patient/useMyPatient";
import { ProfilePanel } from "../../features/patient/ProfilePanel";
import { TimelinePanel } from "../../features/patient/TimelinePanel";
import { LabResultsPanel } from "../../features/patient/LabResultsPanel";
import { VideoConsultPanel } from "../../features/patient/VideoConsultPanel";
import { MessagesPanel } from "../../features/messaging/MessagesPanel";
import type { Invoice } from "../../lib/types";

const TABS = ["Overview", "Profile", "Timeline", "Lab Results", "Messages", "Video Consults"] as const;
type Tab = (typeof TABS)[number];

function koboToNaira(k: number) {
  return `₦${(k / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
}

function OverviewPanel({ patientId, balanceKobo, onPaid }: { patientId: string; balanceKobo: number; onPaid: () => void }) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [topUpAmount, setTopUpAmount] = useState("");
  const [topUpLoading, setTopUpLoading] = useState(false);
  const [topUpResult, setTopUpResult] = useState<string | null>(null);
  const [payResult, setPayResult] = useState<string | null>(null);

  async function loadInvoices() {
    const res = await api.get<{ invoices: Invoice[] }>(`/invoices?patientId=${patientId}`).catch(() => ({ invoices: [] }));
    setInvoices(res.invoices);
  }

  useEffect(() => {
    loadInvoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  async function handleTopUp() {
    const amount = Number(topUpAmount);
    if (!amount || amount <= 0) return;
    setTopUpLoading(true);
    setTopUpResult(null);
    try {
      const res = await api.post<{ checkoutUrl: string }>("/wallet/top-up", {
        patientId, amountKobo: amount * 100,
      });
      setTopUpResult("Redirecting to payment...");
      window.location.href = res.checkoutUrl;
    } catch (err) {
      setTopUpResult(err instanceof Error ? err.message : "Top-up failed");
    } finally {
      setTopUpLoading(false);
    }
  }

  async function handlePayInvoice(invoiceId: string) {
    setPayResult(null);
    try {
      await api.post(`/invoices/${invoiceId}/pay`);
      setPayResult("Invoice paid successfully");
      await loadInvoices();
      onPaid();
    } catch (err) {
      setPayResult(err instanceof Error ? err.message : "Payment failed");
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-800">Overview</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm text-gray-500 mb-1">Wallet Balance</p>
          <p className="text-3xl font-bold text-brand-700">{koboToNaira(balanceKobo)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm text-gray-500 mb-1">Pending Invoices</p>
          <p className="text-3xl font-bold text-amber-600">{invoices.filter((i) => i.status === "SENT").length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm text-gray-500 mb-1">Paid Invoices</p>
          <p className="text-3xl font-bold text-green-600">{invoices.filter((i) => i.status === "PAID").length}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h3 className="font-semibold text-gray-700">Top Up Wallet</h3>
        <div className="flex gap-3 items-end">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Amount (₦)</label>
            <input
              type="number"
              value={topUpAmount}
              onChange={(e) => setTopUpAmount(e.target.value)}
              placeholder="e.g. 5000"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-48"
            />
          </div>
          <button
            onClick={handleTopUp}
            disabled={topUpLoading || !topUpAmount}
            className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 text-sm font-medium"
          >
            {topUpLoading ? "Processing..." : "Top Up"}
          </button>
        </div>
        {topUpResult && (
          <p className={`text-sm ${topUpResult.includes("Redirecting") ? "text-green-600" : "text-red-600"}`}>{topUpResult}</p>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-700">Invoices</h3>
        </div>
        {invoices.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No invoices</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Amount</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Due</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {invoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">{koboToNaira(inv.totalKobo)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      inv.status === "PAID" ? "bg-green-100 text-green-700" :
                      inv.status === "SENT" ? "bg-blue-100 text-blue-700" :
                      inv.status === "DRAFT" ? "bg-gray-100 text-gray-600" : "bg-red-100 text-red-700"
                    }`}>{inv.status}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{new Date(inv.dueDate).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    {inv.status === "SENT" && (
                      <button
                        onClick={() => handlePayInvoice(inv.id)}
                        className="px-3 py-1 bg-brand-600 text-white rounded-lg hover:bg-brand-700 text-xs font-medium"
                      >
                        Pay Now
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {payResult && (
          <div className={`px-6 py-3 text-sm ${payResult.includes("successfully") ? "text-green-600" : "text-red-600"}`}>
            {payResult}
          </div>
        )}
      </div>
    </div>
  );
}

export default function PatientDashboard() {
  const { patient, wallet, loading, error, reload } = useMyPatient();
  const [tab, setTab] = useState<Tab>("Overview");

  if (loading) {
    return <div className="p-8 text-center text-gray-400">Loading your dashboard...</div>;
  }

  if (error || !patient) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-700 font-medium">No patient record linked to your account yet</p>
        <p className="text-sm text-gray-400 mt-2">
          {error ?? "Once your care team confirms your facility and issues your Unique Patient ID, it'll show up here."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <nav className="flex gap-1 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t ? "border-brand-600 text-brand-700" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t}
          </button>
        ))}
      </nav>

      {tab === "Overview" && (
        <OverviewPanel patientId={patient.id} balanceKobo={Number(wallet?.balanceKobo ?? 0)} onPaid={reload} />
      )}
      {tab === "Profile" && <ProfilePanel patient={patient} onUpdated={() => reload()} />}
      {tab === "Timeline" && <TimelinePanel patientId={patient.id} />}
      {tab === "Lab Results" && <LabResultsPanel patientId={patient.id} />}
      {tab === "Messages" && <MessagesPanel patientId={patient.id} />}
      {tab === "Video Consults" && <VideoConsultPanel patientId={patient.id} />}
    </div>
  );
}
