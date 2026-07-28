import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import type { Invoice, Wallet } from "../../lib/types";

export default function PatientDashboard() {
  const [patientId, setPatientId] = useState("");
  const [loadedPatientId, setLoadedPatientId] = useState<string | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [topUpAmount, setTopUpAmount] = useState("");
  const [topUpLoading, setTopUpLoading] = useState(false);
  const [topUpResult, setTopUpResult] = useState<string | null>(null);
  const [payResult, setPayResult] = useState<string | null>(null);

  async function loadData(pid: string) {
    setLoadedPatientId(pid);
    try {
      const [walletRes, invoicesRes] = await Promise.all([
        api.get<{ wallet: Wallet }>(`/wallet?patientId=${pid}`).catch(() => null),
        api.get<{ invoices: Invoice[] }>(`/invoices?patientId=${pid}`).catch(() => ({ invoices: [] })),
      ]);
      if (walletRes) setWallet(walletRes.wallet);
      setInvoices(invoicesRes.invoices);
    } catch { /* ignore */ }
  }

  async function handleTopUp() {
    const amount = Number(topUpAmount);
    if (!amount || amount <= 0 || !loadedPatientId) return;
    setTopUpLoading(true);
    setTopUpResult(null);
    try {
      const res = await api.post<{ checkoutUrl: string }>("/wallet/top-up", {
        patientId: loadedPatientId,
        amountKobo: amount * 100,
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
      if (loadedPatientId) loadData(loadedPatientId);
    } catch (err) {
      setPayResult(err instanceof Error ? err.message : "Payment failed");
    }
  }

  function koboToNaira(k: number) {
    return `₦${(k / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
  }

  if (!loadedPatientId) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-gray-800">Patient Dashboard</h2>
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <p className="text-sm text-gray-600">Enter your Patient ID to view your wallet and invoices.</p>
          <div className="flex gap-3">
            <input
              type="text"
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              placeholder="Patient ID"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-64"
            />
            <button
              onClick={() => patientId && loadData(patientId)}
              className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 text-sm font-medium"
            >
              Load
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800">Patient Dashboard</h2>
        <button onClick={() => setLoadedPatientId(null)} className="text-sm text-gray-500 hover:text-gray-700">Switch Patient</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm text-gray-500 mb-1">Wallet Balance</p>
          <p className="text-3xl font-bold text-brand-700">{wallet ? koboToNaira(wallet.balanceKobo) : "₦0.00"}</p>
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
