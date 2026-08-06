import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import type {
  CountdownCase, Invoice, ServiceClassification, Patient, Facility, PendingRegistration,
  PublicInquiry, PublicInquiryMessage,
} from "../../lib/types";

function nextUniqueIdSuggestion() {
  return `OC-${Date.now().toString().slice(-6)}`;
}

function ApprovalForm({
  registration, facilities, onApproved, onCancel,
}: {
  registration: PendingRegistration;
  facilities: Facility[];
  onApproved: () => void;
  onCancel: () => void;
}) {
  const [facilityId, setFacilityId] = useState(registration.preferredFacilityId ?? "");
  const [uniqueId, setUniqueId] = useState(nextUniqueIdSuggestion());
  const [gender, setGender] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleApprove() {
    if (!facilityId || !uniqueId.trim() || !gender) {
      setError("Facility, gender, and Unique Patient ID are required");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [firstName, ...rest] = registration.fullName.trim().split(/\s+/);
      await api.post("/patients", {
        uniquePatientId: uniqueId.trim(),
        firstName: firstName || registration.fullName,
        lastName: rest.join(" ") || firstName || registration.fullName,
        dob: registration.dob,
        gender,
        phone: registration.phone,
        email: registration.email,
        facilityId,
        userId: registration.userId,
      });
      onApproved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve registration");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-gray-600 mb-1">Facility</label>
          <select
            value={facilityId}
            onChange={(e) => setFacilityId(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Select facility...</option>
            {facilities.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Unique Patient ID</label>
          <input
            value={uniqueId}
            onChange={(e) => setUniqueId(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Gender</label>
          <select
            value={gender}
            onChange={(e) => setGender(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Confirm with patient...</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
            <option value="Other">Other</option>
          </select>
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={handleApprove}
          disabled={loading}
          className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 text-sm font-medium"
        >
          {loading ? "Approving..." : "Approve & Issue ID"}
        </button>
        <button onClick={onCancel} className="px-4 py-2 text-gray-500 hover:text-gray-700 text-sm font-medium">
          Cancel
        </button>
      </div>
    </div>
  );
}

// A public inquiry may or may not be from a registered patient — the visitor only gave a
// self-reported name/email/phone at chat-widget intake, no account. This panel lets staff
// reply regardless, and separately search-and-link it to an existing patient record once
// they've identified one (or leave it unlinked if it's a general/pre-registration question).
function InquiryPanel({ inquiry, onUpdated }: { inquiry: PublicInquiry; onUpdated: () => void }) {
  const [messages, setMessages] = useState<PublicInquiryMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [linkQuery, setLinkQuery] = useState("");
  const [linkResults, setLinkResults] = useState<Patient[]>([]);
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await api.get<{ inquiry: PublicInquiry; messages: PublicInquiryMessage[] }>(
        `/admin/inquiries/${inquiry.id}/messages`,
      );
      setMessages(res.messages);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load thread");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inquiry.id]);

  async function sendReply() {
    if (!reply.trim()) return;
    setSending(true);
    setError(null);
    try {
      const res = await api.post<{ message: PublicInquiryMessage }>(`/admin/inquiries/${inquiry.id}/messages`, {
        content: reply.trim(),
      });
      setMessages((prev) => [...prev, res.message]);
      setReply("");
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send reply");
    } finally {
      setSending(false);
    }
  }

  async function searchPatients() {
    if (!linkQuery.trim()) return;
    try {
      const res = await api.get<{ patients: Patient[] }>(`/patients?facilityId=all&q=${encodeURIComponent(linkQuery.trim())}`);
      setLinkResults(res.patients);
    } catch {
      setLinkResults([]);
    }
  }

  async function linkPatient(patientId: string) {
    setLinking(true);
    setError(null);
    try {
      await api.post(`/admin/inquiries/${inquiry.id}/link`, { patientId });
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to link patient");
    } finally {
      setLinking(false);
    }
  }

  async function closeInquiry() {
    try {
      await api.post(`/admin/inquiries/${inquiry.id}/close`);
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to close inquiry");
    }
  }

  return (
    <div className="mt-3 space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-gray-800">{inquiry.name}</p>
          <p className="text-sm text-gray-500">{[inquiry.email, inquiry.phone].filter(Boolean).join(" · ")}</p>
          {inquiry.linkedPatientId && (
            <p className="mt-0.5 text-xs font-medium text-green-600">Linked to patient {inquiry.linkedPatientId.slice(0, 8)}</p>
          )}
        </div>
        {inquiry.status === "OPEN" && (
          <button onClick={closeInquiry} className="text-xs text-gray-500 hover:text-gray-700">
            Close inquiry
          </button>
        )}
      </div>

      <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg border border-gray-200 bg-white p-3">
        {loading ? (
          <p className="text-center text-sm text-gray-400">Loading…</p>
        ) : messages.length === 0 ? (
          <p className="text-center text-sm text-gray-400">No messages</p>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                m.senderType === "STAFF" ? "ml-auto bg-brand-600 text-white" : "bg-gray-100 text-gray-800"
              }`}
            >
              <p>{m.content}</p>
              <p className={`mt-1 text-[10px] ${m.senderType === "STAFF" ? "text-brand-100" : "text-gray-400"}`}>
                {new Date(m.createdAt).toLocaleString()}
              </p>
            </div>
          ))
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {inquiry.status === "OPEN" && (
        <div className="flex gap-2">
          <input
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendReply()}
            placeholder="Reply..."
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <button
            onClick={sendReply}
            disabled={sending || !reply.trim()}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      )}

      {!inquiry.linkedPatientId && (
        <div className="border-t border-gray-200 pt-3">
          <p className="mb-1.5 text-xs text-gray-500">Is this an existing patient? Search to link:</p>
          <div className="flex gap-2">
            <input
              value={linkQuery}
              onChange={(e) => setLinkQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchPatients()}
              placeholder="Search by name..."
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <button onClick={searchPatients} className="rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-600 hover:bg-gray-200">
              Search
            </button>
          </div>
          {linkResults.length > 0 && (
            <ul className="mt-2 divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200">
              {linkResults.map((p) => (
                <li key={p.id} className="flex items-center justify-between px-3 py-2">
                  <span className="text-sm text-gray-700">{p.firstName} {p.lastName} ({p.uniquePatientId})</span>
                  <button
                    onClick={() => linkPatient(p.id)}
                    disabled={linking}
                    className="text-xs font-medium text-brand-600 hover:text-brand-700 disabled:opacity-50"
                  >
                    Link
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default function RegionalAdminDashboard() {
  const [cases, setCases] = useState<CountdownCase[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [classifications, setClassifications] = useState<ServiceClassification[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [registrations, setRegistrations] = useState<PendingRegistration[]>([]);
  const [approvingUserId, setApprovingUserId] = useState<string | null>(null);
  const [inquiries, setInquiries] = useState<PublicInquiry[]>([]);
  const [selectedInquiryId, setSelectedInquiryId] = useState<string | null>(null);

  const [showGenerator, setShowGenerator] = useState(false);
  const [genPatientId, setGenPatientId] = useState("");
  const [genClassificationId, setGenClassificationId] = useState("");
  const [genLoading, setGenLoading] = useState(false);
  const [genResult, setGenResult] = useState<string | null>(null);

  const [tab, setTab] = useState<"countdown" | "invoices" | "registrations" | "inquiries">("registrations");

  function loadRegistrations() {
    api.get<{ registrations: PendingRegistration[] }>("/patients/pending-registrations")
      .then((d) => setRegistrations(d.registrations)).catch(() => {});
  }

  function loadInquiries() {
    api.get<{ inquiries: PublicInquiry[] }>("/admin/inquiries")
      .then((d) => setInquiries(d.inquiries)).catch(() => {});
  }

  useEffect(() => {
    api.get<{ invoices: Invoice[] }>("/invoices?facilityId=all").then((d) => setInvoices(d.invoices)).catch(() => {});
    api.get<{ classifications: ServiceClassification[] }>("/classifications").then((d) => setClassifications(d.classifications)).catch(() => {});
    api.get<{ patients: Patient[] }>("/patients?facilityId=all").then((d) => setPatients(d.patients)).catch(() => {});
    api.get<{ facilities: Facility[] }>("/facilities").then((d) => setFacilities(d.facilities)).catch(() => {});
    loadRegistrations();
    loadInquiries();
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
          onClick={() => setTab("registrations")}
          className={`px-4 py-1.5 text-sm font-medium rounded-t-lg ${tab === "registrations" ? "bg-white border border-b-white border-gray-200 text-brand-700" : "text-gray-500 hover:text-gray-700"}`}
        >
          Registrations{registrations.length > 0 ? ` (${registrations.length})` : ""}
        </button>
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
        <button
          onClick={() => setTab("inquiries")}
          className={`px-4 py-1.5 text-sm font-medium rounded-t-lg ${tab === "inquiries" ? "bg-white border border-b-white border-gray-200 text-brand-700" : "text-gray-500 hover:text-gray-700"}`}
        >
          Inquiries{inquiries.filter((i) => i.status === "OPEN").length > 0 ? ` (${inquiries.filter((i) => i.status === "OPEN").length})` : ""}
        </button>
      </div>

      {tab === "registrations" && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {registrations.length === 0 ? (
            <div className="p-8 text-center text-gray-400">No pending registrations</div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {registrations.map((r) => (
                <li key={r.id} className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-gray-800">{r.fullName}</p>
                      <p className="text-sm text-gray-500">
                        {r.email} · {r.phone} · DOB {new Date(r.dob).toLocaleDateString()}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Preferred facility: {facilities.find((f) => f.id === r.preferredFacilityId)?.name ?? "None specified"}
                        {" · "}Requested {new Date(r.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    {approvingUserId !== r.userId && (
                      <button
                        onClick={() => setApprovingUserId(r.userId)}
                        className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 text-sm font-medium"
                      >
                        Review & Approve
                      </button>
                    )}
                  </div>
                  {approvingUserId === r.userId && (
                    <ApprovalForm
                      registration={r}
                      facilities={facilities}
                      onCancel={() => setApprovingUserId(null)}
                      onApproved={() => {
                        setApprovingUserId(null);
                        loadRegistrations();
                      }}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

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

      {tab === "inquiries" && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {inquiries.length === 0 ? (
            <div className="p-8 text-center text-gray-400">No public inquiries yet</div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {inquiries.map((inq) => (
                <li key={inq.id} className="p-4">
                  <button
                    onClick={() => setSelectedInquiryId(selectedInquiryId === inq.id ? null : inq.id)}
                    className="flex w-full flex-wrap items-center justify-between gap-3 text-left"
                  >
                    <div>
                      <p className="font-medium text-gray-800">
                        {inq.name}
                        {inq.linkedPatientId && <span className="ml-2 text-xs font-medium text-green-600">Linked patient</span>}
                      </p>
                      <p className="text-sm text-gray-500">{[inq.email, inq.phone].filter(Boolean).join(" · ")}</p>
                      <p className="mt-0.5 text-xs text-gray-400">Last activity {new Date(inq.updatedAt).toLocaleString()}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      inq.status === "OPEN" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"
                    }`}>{inq.status}</span>
                  </button>
                  {selectedInquiryId === inq.id && (
                    <InquiryPanel
                      inquiry={inq}
                      onUpdated={() => {
                        loadInquiries();
                      }}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
