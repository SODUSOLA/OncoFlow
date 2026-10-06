import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CircleCheck, Send as SendIcon } from "lucide-react";
import { api } from "../../../lib/api";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Badge } from "../../../components/ui/Badge";
import { cn } from "../../../lib/utils";

export interface PatientInquiry {
  id: string;
  status: "OPEN" | "CLOSED";
  createdAt: string;
  slaBreached: boolean;
  unreadCount: number;
  patient: { id: string; firstName: string; lastName: string; uniquePatientId: string };
  lastMessage: { type: string; content: string; createdAt: string; fromPatient: boolean } | null;
}

interface InquiryMessage {
  id: string;
  type: "TEXT" | "IMAGE" | "VOICE" | "SYSTEM";
  content: string;
  createdAt: string;
  fromPatient: boolean;
}

const POLL_MS = 15_000;

// Attachments are stored by file id and a Regional Admin has no file access, so they are labelled rather than loaded.
function messageText(m: { type: string; content: string }) {
  if (m.type === "IMAGE") return "Sent an image";
  if (m.type === "VOICE") return "Sent a voice note";
  return m.content;
}

function time(iso: string) {
  return new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

// A photo or voice note shown in the thread. It loads through a link scoped to this chat, since the viewer has no
// general file access; a photo that can't be fetched falls back to a label instead of a broken image.
function Attachment({ type, src }: { type: "IMAGE" | "VOICE"; src: string }) {
  const [failed, setFailed] = useState(false);
  if (type === "VOICE") return <audio controls src={src} className="h-9 max-w-[220px]" />;
  if (failed) return <span className="italic">Photo unavailable</span>;
  return (
    <a href={src} target="_blank" rel="noopener noreferrer">
      <img src={src} alt="Attached photo" className="max-h-60 max-w-full rounded-lg object-contain" onError={() => setFailed(true)} />
    </a>
  );
}

// One patient's thread with reply and close.
function Thread({ inquiry, onChanged }: { inquiry: PatientInquiry; onChanged: () => void }) {
  const [messages, setMessages] = useState<InquiryMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const closed = inquiry.status === "CLOSED";

  const load = useCallback(() => {
    api.get<{ messages: InquiryMessage[] }>(`/admin/patient-inquiries/${inquiry.id}/messages`)
      .then((d) => setMessages(d.messages))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [inquiry.id]);

  useEffect(() => {
    setLoading(true);
    setMessages([]);
    setError(null);
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ block: "end" }); }, [messages.length]);

  async function send() {
    const content = reply.trim();
    if (!content) return;
    setSending(true);
    setError(null);
    try {
      await api.post(`/admin/patient-inquiries/${inquiry.id}/messages`, { content });
      setReply("");
      load();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the reply");
    } finally {
      setSending(false);
    }
  }

  async function close() {
    setError(null);
    try {
      await api.post(`/admin/patient-inquiries/${inquiry.id}/close`);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not close the inquiry");
    }
  }

  return (
    <Card className="col-span-2 flex h-full min-h-0 flex-col overflow-hidden border-admin-border">
      <div className="flex shrink-0 items-center justify-between border-b border-admin-border px-5 py-3.5">
        <div>
          <p className="text-admin-body-sm font-semibold text-admin-text">{inquiry.patient.firstName} {inquiry.patient.lastName}</p>
          <p className="text-admin-caption text-admin-text-secondary">{inquiry.patient.uniquePatientId} · started {time(inquiry.createdAt)}</p>
        </div>
        {closed ? (
          <Badge variant="neutral">Closed</Badge>
        ) : (
          <Button onClick={close} variant="outline" size="sm" className="rounded-admin-xs">
            <CircleCheck className="size-4" aria-hidden="true" /> Close inquiry
          </Button>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
        {loading && <p className="text-center text-admin-body-sm text-admin-text-secondary">Loading…</p>}
        {!loading && messages.length === 0 && <p className="text-center text-admin-body-sm text-admin-text-secondary">No messages yet</p>}
        {messages.map((m) => (
          <div key={m.id} className={cn("chat-row", m.fromPatient ? "chat-row-received" : "chat-row-sent")}>
            <div className={cn("chat-bubble", m.fromPatient ? "chat-bubble-received" : "chat-bubble-sent")}>
              {m.type === "IMAGE" || m.type === "VOICE" ? (
                <Attachment type={m.type} src={`/api/admin/patient-inquiries/${inquiry.id}/messages/${m.id}/attachment`} />
              ) : (
                <p>{messageText(m)}</p>
              )}
              <p className={cn("chat-meta", m.fromPatient ? "chat-meta-received" : "chat-meta-sent")}>{time(m.createdAt)}</p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="shrink-0 border-t border-admin-border p-4">
        {error && <p role="alert" className="mb-2 text-admin-caption text-admin-danger">{error}</p>}
        {closed ? (
          <p className="text-center text-admin-caption text-admin-text-secondary">This inquiry is closed. The patient can start a new one.</p>
        ) : (
          <div className="flex items-end gap-2">
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
              rows={2}
              placeholder="Reply to the patient…"
              className="flex-1 resize-none rounded-admin-sm border border-admin-border px-3 py-2 text-admin-body-sm"
            />
            <Button onClick={send} loading={sending} disabled={!reply.trim()} className="rounded-admin-xs bg-admin-sidebar-cta hover:bg-admin-sidebar-cta/90">
              <SendIcon className="size-4" aria-hidden="true" /> Send
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

// Messages patients have sent to the admin team from their app, for the admin's own region.
export function PatientInquiriesPanel({ onCountChange }: { onCountChange?: (open: number) => void }) {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<"OPEN" | "CLOSED">("OPEN");
  const [inquiries, setInquiries] = useState<PatientInquiry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get("id"));
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    api.get<{ inquiries: PatientInquiry[] }>(`/admin/patient-inquiries?status=${status}`)
      .then((d) => {
        setInquiries(d.inquiries);
        if (status === "OPEN") onCountChange?.(d.inquiries.length);
      })
      .catch(() => setInquiries([]))
      .finally(() => setLoading(false));
  }, [status, onCountChange]);

  useEffect(() => {
    setLoading(true);
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const selected = inquiries.find((i) => i.id === selectedId) ?? null;

  return (
    <div className="grid h-full min-h-0 grid-cols-3 gap-4">
      <Card className="flex h-full min-h-0 flex-col overflow-hidden border-admin-border">
        <div className="flex shrink-0 items-center justify-between border-b border-admin-border px-5 py-3.5">
          <p className="text-admin-body-sm font-semibold text-admin-text">Patient messages</p>
          <div className="flex rounded-admin-sm border border-admin-border p-0.5 text-admin-caption font-medium">
            {(["OPEN", "CLOSED"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={cn("rounded-admin-xs px-2.5 py-1", status === s ? "bg-admin-card-alt text-admin-text" : "text-admin-text-secondary")}
              >
                {s === "OPEN" ? "Open" : "Closed"}
              </button>
            ))}
          </div>
        </div>
        {loading ? (
          <div className="p-8 text-center text-admin-body-sm text-admin-text-secondary">Loading…</div>
        ) : inquiries.length === 0 ? (
          <div className="p-8 text-center text-admin-body-sm text-admin-text-secondary">
            {status === "OPEN" ? "No open messages from patients in your region." : "No closed inquiries."}
          </div>
        ) : (
          <ul className="min-h-0 flex-1 divide-y divide-admin-border overflow-y-auto">
            {inquiries.map((inq) => {
              const awaiting = inq.status === "OPEN" && inq.lastMessage?.fromPatient;
              return (
                <li key={inq.id}>
                  <button
                    onClick={() => setSelectedId(inq.id)}
                    className={cn(
                      "block w-full border-l-4 px-4 py-3 text-left",
                      awaiting ? "border-l-admin-warning" : "border-l-transparent",
                      selectedId === inq.id ? "bg-admin-card-alt" : "hover:bg-admin-card-alt/60",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className={cn("truncate text-admin-body-sm", awaiting ? "font-bold text-admin-text" : "font-medium text-admin-text")}>
                        {inq.patient.firstName} {inq.patient.lastName}
                      </p>
                      {inq.lastMessage && (
                        <span className="shrink-0 text-admin-caption text-admin-text-secondary">
                          {new Date(inq.lastMessage.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      )}
                    </div>
                    <p className="text-admin-micro text-admin-text-secondary">{inq.patient.uniquePatientId}</p>
                    <div className="flex items-center justify-between gap-2">
                      {inq.lastMessage && (
                        <p className={cn("truncate text-admin-caption", inq.unreadCount > 0 ? "font-semibold text-admin-text" : "text-admin-text-secondary")}>{messageText(inq.lastMessage)}</p>
                      )}
                      {inq.unreadCount > 0 && (
                        <span className="unread-badge shrink-0" aria-label={`${inq.unreadCount} unread ${inq.unreadCount === 1 ? "message" : "messages"}`}>
                          {inq.unreadCount > 99 ? "99+" : inq.unreadCount}
                        </span>
                      )}
                    </div>
                    {awaiting && <Badge className="mt-1 bg-admin-warning/15 text-admin-warning">AWAITING REPLY</Badge>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {selected ? (
        <Thread inquiry={selected} onChanged={load} />
      ) : (
        <Card className="col-span-2 flex h-full items-center justify-center border-admin-border p-8 text-center text-admin-body-sm text-admin-text-secondary">
          Select a patient message to read and reply.
        </Card>
      )}
    </div>
  );
}
