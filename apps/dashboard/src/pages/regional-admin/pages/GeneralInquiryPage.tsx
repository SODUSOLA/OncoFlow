import { useEffect, useState } from "react";
import { api } from "../../../lib/api";
import type { Patient, PublicInquiry, PublicInquiryMessage } from "../../../lib/types";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Badge } from "../../../components/ui/Badge";
import { cn } from "../../../lib/utils";

const QUICK_REPLIES = [
  { label: "Share visiting hours", text: "Our facilities are open for visits Monday–Saturday, 9am–5pm." },
  { label: "Send invoice status", text: "Let me check your invoice status and get back to you shortly." },
  { label: "Hand off to clinician", text: "I'm routing this to your clinical team — they'll follow up directly." },
] as const;

// A public inquiry may or may not be from a registered patient — the visitor only gave a
// self-reported name/email/phone at chat-widget intake, no account. This panel lets staff
// reply regardless, and separately search-and-link it to an existing patient record once
// they've identified one (or leave it unlinked if it's a general/pre-registration question).
function InquiryThread({ inquiry, onUpdated }: { inquiry: PublicInquiry; onUpdated: () => void }) {
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

  async function sendReply(text?: string) {
    const content = (text ?? reply).trim();
    if (!content) return;
    setSending(true);
    setError(null);
    try {
      const res = await api.post<{ message: PublicInquiryMessage }>(`/admin/inquiries/${inquiry.id}/messages`, { content });
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
    <Card blueprint className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
        <div>
          <p className="font-semibold text-gray-800">{inquiry.name} <span className="font-normal text-gray-400">({inquiry.linkedPatientId ? "patient" : "visitor"})</span></p>
          <p className="text-sm text-gray-500">{[inquiry.email, inquiry.phone].filter(Boolean).join(" · ") || "No contact given"}</p>
        </div>
        {inquiry.status === "OPEN" && (
          <Button onClick={closeInquiry} variant="outline" size="sm">Close inquiry</Button>
        )}
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-5">
        {loading ? (
          <p className="text-center text-sm text-gray-400">Loading…</p>
        ) : messages.length === 0 ? (
          <p className="text-center text-sm text-gray-400">No messages</p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={cn("max-w-[80%] rounded px-3 py-2 text-sm", m.senderType === "STAFF" ? "ml-auto bg-ink text-white" : "bg-gray-100 text-gray-800")}>
              <p>{m.content}</p>
              <p className={cn("mt-1 text-[10px]", m.senderType === "STAFF" ? "text-white/70" : "text-gray-400")}>
                {new Date(m.createdAt).toLocaleString()}
              </p>
            </div>
          ))
        )}
      </div>

      {error && <p className="px-5 text-sm text-red-600">{error}</p>}

      {inquiry.status === "OPEN" && (
        <div className="border-t border-gray-100 p-4">
          <div className="mb-3 flex flex-wrap gap-2">
            {QUICK_REPLIES.map((qr) => (
              <button
                key={qr.label}
                onClick={() => setReply(qr.text)}
                className="rounded border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-gray-300 hover:bg-gray-50"
              >
                {qr.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendReply()}
              placeholder="Reply — general inquiry only"
              className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
            />
            <Button onClick={() => sendReply()} loading={sending} disabled={!reply.trim()} size="sm">Send</Button>
          </div>

          {!inquiry.linkedPatientId && (
            <div className="mt-3 border-t border-gray-100 pt-3">
              <p className="mb-1.5 text-xs text-gray-500">Is this an existing patient? Search to link:</p>
              <div className="flex gap-2">
                <input
                  value={linkQuery}
                  onChange={(e) => setLinkQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && searchPatients()}
                  placeholder="Search by name..."
                  className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
                />
                <Button onClick={searchPatients} variant="outline" size="sm">Search</Button>
              </div>
              {linkResults.length > 0 && (
                <ul className="mt-2 divide-y divide-gray-100 overflow-hidden rounded border border-gray-200">
                  {linkResults.map((p) => (
                    <li key={p.id} className="flex items-center justify-between px-3 py-2">
                      <span className="text-sm text-gray-700">{p.firstName} {p.lastName} ({p.uniquePatientId})</span>
                      <button onClick={() => linkPatient(p.id)} disabled={linking} className="text-xs font-medium text-ink hover:underline disabled:opacity-50">
                        Link
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export default function GeneralInquiryPage() {
  const [inquiries, setInquiries] = useState<PublicInquiry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  function loadInquiries() {
    api.get<{ inquiries: PublicInquiry[] }>("/admin/inquiries").then((d) => setInquiries(d.inquiries)).catch(() => {});
  }

  useEffect(() => {
    loadInquiries();
  }, []);

  const selected = inquiries.find((i) => i.id === selectedId) ?? null;

  return (
    <div className="grid grid-cols-3 gap-4" style={{ minHeight: "70vh" }}>
      <Card blueprint className="flex flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5">
          <p className="text-sm font-semibold text-gray-800">General inquiry</p>
          <span className="rounded border border-gray-200 px-2 py-0.5 text-[10px] font-medium text-gray-500">5-min SLA</span>
        </div>
        {inquiries.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">No public inquiries yet</div>
        ) : (
          <ul className="flex-1 divide-y divide-gray-50 overflow-y-auto">
            {inquiries.map((inq) => (
              <li key={inq.id}>
                <button
                  onClick={() => setSelectedId(inq.id)}
                  className={cn("block w-full px-5 py-3 text-left", selectedId === inq.id ? "bg-blue-50" : "hover:bg-gray-50")}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium text-gray-800">{inq.name}</p>
                    <span className="shrink-0 text-xs text-gray-400">{new Date(inq.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  <p className="truncate text-xs text-gray-400">
                    {inq.linkedPatientId ? "Linked patient" : "No record"}
                    {inq.status === "CLOSED" && " · closed"}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="border-t border-gray-100 p-3">
          <p className="text-[11px] text-gray-400">
            Clinical threads are not routed to this desk. Anything a patient asks that turns clinical hands off to a clinician and leaves your queue.
          </p>
        </div>
      </Card>

      <div className="col-span-2">
        {selected ? (
          <InquiryThread inquiry={selected} onUpdated={loadInquiries} />
        ) : (
          <Card blueprint className="flex h-full items-center justify-center p-8 text-center text-sm text-gray-400">
            Select an inquiry to view its thread
          </Card>
        )}
      </div>
    </div>
  );
}
