import { useEffect, useMemo, useState } from "react";
import { ArrowUpDown, CircleCheck, Clock3, Send as SendIcon, TriangleAlert, User, Users as UsersIcon } from "lucide-react";
import { api } from "../../../lib/api";
import type { CountdownCase, Patient, PublicInquiry, PublicInquiryMessage } from "../../../lib/types";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Badge } from "../../../components/ui/Badge";
import { cn } from "../../../lib/utils";
import { SLA_MINUTES, classifyInquirySla, type SlaState } from "../lib/alertRules";

const QUICK_REPLIES = [
  { label: "Share visiting hours", text: "Our facilities are open for visits Monday–Saturday, 9am–5pm." },
  { label: "Send invoice status", text: "Let me check your invoice status and get back to you shortly." },
  { label: "Hand off to clinician", text: "I'm routing this to your clinical team — they'll follow up directly." },
] as const;

// Bounds how many threads get an enriched "time since last unanswered message" badge. Fetching
// that for every open inquiry is an N+1 — this dev database alone has 200+ — so only the most
// recently active window is enriched, same reasoning as the shared alert aggregator's own cap.
const ENRICH_LIMIT = 30;

interface ThreadSummary {
  lastMessageContent: string | null;
  lastMessageFromVisitor: boolean;
  lastMessageAt: string | null;
}

function minutesSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
}

// A live mm:ss SLA countdown (counting past zero into overdue, like "-02:15") derived from the
// real last-visitor-message timestamp — matches the design reference's per-thread SLA timer,
// not a fabricated field.
function formatSlaCountdown(lastMessageAt: string, slaMinutes: number, now: number): { text: string; overdue: boolean } {
  const elapsedSeconds = Math.floor((now - new Date(lastMessageAt).getTime()) / 1000);
  const remaining = slaMinutes * 60 - elapsedSeconds;
  const overdue = remaining <= 0;
  const abs = Math.abs(remaining);
  const mm = String(Math.floor(abs / 60)).padStart(2, "0");
  const ss = String(abs % 60).padStart(2, "0");
  return { text: `${overdue ? "-" : ""}${mm}:${ss}`, overdue };
}

// Phase 6's 4 list-item states, collapsed to one derived field rather than independent booleans
// that could contradict each other. "auto-replied" isn't included — there's no automated-reply
// concept anywhere in this data model (PublicInquiryMessage.senderType is only VISITOR|STAFF),
// so it would be fabricated, not derived.
type InquiryListState = "breached" | "unread" | "ongoing" | "closed";

function inquiryListState(inq: PublicInquiry, summary: ThreadSummary | undefined, now: number): InquiryListState {
  if (inq.status === "CLOSED") return "closed";
  if (!summary?.lastMessageFromVisitor || !summary.lastMessageAt) return "ongoing";
  const minutes = Math.floor((now - new Date(summary.lastMessageAt).getTime()) / 60_000);
  return classifyInquirySla(minutes) === "breached" ? "breached" : "unread";
}

// A public inquiry may or may not be from a registered patient — the visitor only gave a
// self-reported name/email/phone at chat-widget intake, no account. This panel lets staff
// reply regardless, and separately search-and-link it to an existing patient record once
// they've identified one (or leave it unlinked if it's a general/pre-registration question).
//
// Deliberately does NOT have an "Escalate to Clinical" action or a manual "Assign" button, even
// though the design reference shows both. Escalate has no destination — clinical questions hand
// off to a clinician and leave this queue entirely, and there's no Clinical Chat in this app for
// such a button to open (reconfirmed with the user when the new design docs were introduced).
// Assign has no backend to call either — `assignedTo` is set automatically by the first staff
// reply (a lightweight ownership claim, not a hard lock — see apps/api's inquiry controller),
// there's no dedicated "assign to a specific person" endpoint to wire a button to.
function InquiryThread({ inquiry, now, onUpdated }: { inquiry: PublicInquiry; now: number; onUpdated: () => void }) {
  const [messages, setMessages] = useState<PublicInquiryMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [linkQuery, setLinkQuery] = useState("");
  const [linkResults, setLinkResults] = useState<Patient[]>([]);
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkedPatient, setLinkedPatient] = useState<Patient | null>(null);
  const [linkedCase, setLinkedCase] = useState<CountdownCase | null>(null);

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

  // Real patient context only — name/ID/DOB from the actual linked record, and an active
  // pre-chemo cycle day only when one genuinely exists for them. No fabricated fields.
  useEffect(() => {
    setLinkedPatient(null);
    setLinkedCase(null);
    if (!inquiry.linkedPatientId) return;
    api.get<{ patient: Patient }>(`/patients/${inquiry.linkedPatientId}`).then((d) => setLinkedPatient(d.patient)).catch(() => {});
    api.get<{ cases: CountdownCase[] }>(`/countdown-cases?patientId=${inquiry.linkedPatientId}`)
      .then((d) => setLinkedCase(d.cases[0] ?? null))
      .catch(() => {});
  }, [inquiry.linkedPatientId]);

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

  const lastMessage = messages[messages.length - 1];
  const threadSla: SlaState = lastMessage && lastMessage.senderType === "VISITOR"
    ? classifyInquirySla(minutesSince(lastMessage.createdAt))
    : "normal";

  return (
    <div className="grid h-full min-h-0 grid-cols-3 gap-4">
      <Card className="col-span-2 flex h-full min-h-0 flex-col overflow-hidden border-admin-border">
        <div className="flex shrink-0 items-center justify-between border-b border-admin-border px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <p className="font-semibold text-admin-text">{inquiry.name}</p>
              <CategoryPill linked={!!inquiry.linkedPatientId} />
            </div>
            <p className="text-admin-body-sm text-admin-text-secondary">{[inquiry.email, inquiry.phone].filter(Boolean).join(" · ") || "No contact given"}</p>
          </div>
          {inquiry.status === "OPEN" && (
            <Button onClick={closeInquiry} variant="outline" size="sm" className="rounded-admin-xs border-admin-border text-admin-text">Close inquiry</Button>
          )}
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-5">
          {loading ? (
            <p className="text-center text-admin-body-sm text-admin-text-secondary">Loading…</p>
          ) : messages.length === 0 ? (
            <p className="text-center text-admin-body-sm text-admin-text-secondary">No messages</p>
          ) : (
            messages.map((m) => (
              <div key={m.id} className={cn("max-w-[80%] rounded-admin-sm px-3 py-2 text-admin-body-sm", m.senderType === "STAFF" ? "ml-auto bg-admin-sidebar-cta text-white" : "bg-admin-card-alt text-admin-text")}>
                <p>{m.content}</p>
                <p className={cn("mt-1 text-admin-micro", m.senderType === "STAFF" ? "text-white/70" : "text-admin-text-secondary")}>
                  {new Date(m.createdAt).toLocaleString()}
                </p>
              </div>
            ))
          )}
          {threadSla === "breached" && inquiry.status === "OPEN" && (
            <div className="flex items-center gap-2 py-1 text-admin-caption text-admin-danger">
              <span className="h-px flex-1 bg-admin-danger/30" aria-hidden="true" />
              <TriangleAlert className="size-3" aria-hidden="true" /> SLA Breached ({minutesSince(lastMessage!.createdAt)}m)
              <span className="h-px flex-1 bg-admin-danger/30" aria-hidden="true" />
            </div>
          )}
        </div>

        {error && <p className="shrink-0 px-5 text-admin-body-sm text-admin-danger">{error}</p>}

        {inquiry.status === "OPEN" && (
          <div className="shrink-0 border-t border-admin-border p-4">
            <div className="mb-3 flex flex-wrap gap-2">
              {QUICK_REPLIES.map((qr) => (
                <button
                  key={qr.label}
                  onClick={() => setReply(qr.text)}
                  className="rounded-admin-sm border border-admin-border px-3 py-1.5 text-admin-caption font-medium text-admin-text-secondary hover:border-admin-sidebar-cta hover:bg-admin-card-alt"
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
                placeholder="Type response here (non-clinical advice only)..."
                className="flex-1 rounded-admin-sm border border-admin-border px-3 py-2 text-admin-body-sm"
              />
              <Button onClick={() => sendReply()} loading={sending} disabled={!reply.trim()} size="sm" className="rounded-admin-xs bg-admin-sidebar-cta hover:bg-admin-sidebar-cta/90">
                Send <SendIcon className="size-3.5" aria-hidden="true" />
              </Button>
            </div>
            <p className="mt-1.5 text-right text-admin-micro text-admin-text-secondary">All responses are logged.</p>

            {!inquiry.linkedPatientId && (
              <div className="mt-3 border-t border-admin-border pt-3">
                <p className="mb-1.5 text-admin-caption text-admin-text-secondary">Is this an existing patient? Search to link:</p>
                <div className="flex gap-2">
                  <input
                    value={linkQuery}
                    onChange={(e) => setLinkQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && searchPatients()}
                    placeholder="Search by name..."
                    className="flex-1 rounded-admin-sm border border-admin-border px-3 py-2 text-admin-body-sm"
                  />
                  <Button onClick={searchPatients} variant="outline" size="sm" className="rounded-admin-xs border-admin-border text-admin-text">Search</Button>
                </div>
                {linkResults.length > 0 && (
                  <ul className="mt-2 divide-y divide-admin-border overflow-hidden rounded-admin-sm border border-admin-border">
                    {linkResults.map((p) => (
                      <li key={p.id} className="flex items-center justify-between px-3 py-2">
                        <span className="text-admin-body-sm text-admin-text">{p.firstName} {p.lastName} ({p.uniquePatientId})</span>
                        <button onClick={() => linkPatient(p.id)} disabled={linking} className="text-admin-caption font-medium text-admin-sidebar-cta hover:underline disabled:opacity-50">
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

      <Card className="flex h-full min-h-0 flex-col overflow-hidden border-admin-border p-5">
        <p className="shrink-0 flex items-center gap-2 text-admin-body-sm font-semibold text-admin-text">
          <User className="size-4 text-admin-text-secondary" aria-hidden="true" /> Patient Context
        </p>
        <div className="min-h-0 flex-1 overflow-y-auto">
        {!inquiry.linkedPatientId ? (
          <p className="mt-4 text-admin-body-sm text-admin-text-secondary">Not linked to a patient record.</p>
        ) : !linkedPatient ? (
          <p className="mt-4 text-admin-body-sm text-admin-text-secondary">Loading…</p>
        ) : (
          <div className="mt-4 space-y-3">
            <div>
              <p className="text-admin-body-sm font-semibold text-admin-text">{linkedPatient.firstName} {linkedPatient.lastName}</p>
              <p className="font-mono text-admin-caption text-admin-text-secondary">{linkedPatient.uniquePatientId}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-admin-caption">
              <div>
                <p className="text-admin-text-secondary">DOB</p>
                <p className="text-admin-text">{new Date(linkedPatient.dob).toLocaleDateString()}</p>
              </div>
              {linkedCase && (
                <div>
                  <p className="text-admin-text-secondary">Active Cycle</p>
                  <p className="text-admin-text">Day {linkedCase.currentDay}</p>
                </div>
              )}
            </div>
          </div>
        )}
        </div>
      </Card>
    </div>
  );
}

function CategoryPill({ linked }: { linked: boolean }) {
  return linked ? (
    <Badge variant="info" className="gap-1"><User className="size-3" aria-hidden="true" /> Patient</Badge>
  ) : (
    <Badge variant="neutral" className="gap-1"><UsersIcon className="size-3" aria-hidden="true" /> Visitor</Badge>
  );
}

export default function GeneralInquiryPage() {
  const [inquiries, setInquiries] = useState<PublicInquiry[]>([]);
  const [summaries, setSummaries] = useState<Record<string, ThreadSummary>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [urgentFirst, setUrgentFirst] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  function loadInquiries() {
    api.get<{ inquiries: PublicInquiry[] }>("/admin/inquiries").then(async (d) => {
      setInquiries(d.inquiries);

      const recent = [...d.inquiries]
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, ENRICH_LIMIT);

      const entries = await Promise.all(
        recent.map(async (inq): Promise<[string, ThreadSummary]> => {
          const msgs = await api
            .get<{ messages: PublicInquiryMessage[] }>(`/admin/inquiries/${inq.id}/messages`)
            .then((r) => r.messages)
            .catch(() => []);
          const last = msgs[msgs.length - 1];
          return [inq.id, {
            lastMessageContent: last?.content ?? null,
            lastMessageFromVisitor: last?.senderType === "VISITOR",
            lastMessageAt: last?.createdAt ?? null,
          }];
        }),
      );
      setSummaries(Object.fromEntries(entries));
    }).catch(() => {});
  }

  useEffect(() => {
    loadInquiries();
  }, []);

  const openCount = inquiries.filter((i) => i.status === "OPEN").length;

  const sortedInquiries = useMemo(() => {
    const list = [...inquiries];
    if (!urgentFirst) return list;
    // Urgent = open, unanswered by staff, longest waiting first. Everything else (closed,
    // already replied to, or outside the enriched window) sorts after, by recency.
    return list.sort((a, b) => {
      const sa = summaries[a.id];
      const sb = summaries[b.id];
      const aUrgent = a.status === "OPEN" && sa?.lastMessageFromVisitor && sa.lastMessageAt ? minutesSince(sa.lastMessageAt) : -1;
      const bUrgent = b.status === "OPEN" && sb?.lastMessageFromVisitor && sb.lastMessageAt ? minutesSince(sb.lastMessageAt) : -1;
      if (aUrgent !== bUrgent) return bUrgent - aUrgent;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [inquiries, summaries, urgentFirst]);

  const selected = inquiries.find((i) => i.id === selectedId) ?? null;

  return (
    <div className="grid h-full min-h-0 grid-cols-3 gap-4">
      <Card className="flex h-full min-h-0 flex-col overflow-hidden border-admin-border">
        <div className="flex shrink-0 items-center justify-between border-b border-admin-border px-5 py-3.5">
          <div className="flex items-center gap-2">
            <p className="text-admin-body-sm font-semibold text-admin-text">Inquiry Chat Inbox</p>
            <Badge variant="gold">{openCount} Open</Badge>
          </div>
          <span className="rounded-admin-sm border border-admin-border px-2 py-0.5 text-admin-micro font-medium text-admin-text-secondary">{SLA_MINUTES}-min SLA</span>
        </div>
        <button
          onClick={() => setUrgentFirst((v) => !v)}
          className={cn(
            "mx-3 mt-3 flex shrink-0 items-center justify-center gap-1.5 rounded-admin-sm border px-3 py-1.5 text-admin-caption font-medium",
            urgentFirst ? "border-admin-sidebar-cta bg-admin-sidebar-cta text-white" : "border-admin-border text-admin-text-secondary hover:bg-admin-card-alt",
          )}
        >
          <ArrowUpDown className="size-3.5" aria-hidden="true" /> Urgent First
        </button>

        {inquiries.length === 0 ? (
          <div className="p-8 text-center text-admin-body-sm text-admin-text-secondary">No public inquiries yet</div>
        ) : (
          <ul className="mt-2 min-h-0 flex-1 divide-y divide-admin-border overflow-y-auto">
            {sortedInquiries.map((inq) => {
              const summary = summaries[inq.id];
              const state = inquiryListState(inq, summary, now);
              const countdown = state === "breached" || state === "unread"
                ? formatSlaCountdown(summary!.lastMessageAt!, SLA_MINUTES, now)
                : null;
              return (
                <li key={inq.id}>
                  <button
                    onClick={() => setSelectedId(inq.id)}
                    className={cn(
                      "block w-full border-l-4 px-4 py-3 text-left",
                      state === "breached" ? "border-l-admin-danger bg-admin-danger/5" : "border-l-transparent",
                      selectedId === inq.id ? "bg-admin-card-alt" : "hover:bg-admin-card-alt/60",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className={cn("truncate text-admin-body-sm", state === "unread" ? "font-bold text-admin-text" : "font-medium text-admin-text")}>{inq.name}</p>
                      {countdown ? (
                        <span className={cn("flex shrink-0 items-center gap-1 text-admin-caption font-semibold tabular-nums", state === "breached" ? "text-admin-danger" : "text-admin-text-secondary")}>
                          <Clock3 className="size-3" aria-hidden="true" /> {countdown.text}
                        </span>
                      ) : (
                        <span className="shrink-0 text-admin-caption text-admin-text-secondary">{new Date(inq.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      )}
                    </div>
                    {summary?.lastMessageContent && (
                      <p className={cn("truncate text-admin-caption", state === "unread" ? "text-admin-text" : "text-admin-text-secondary")}>{summary.lastMessageContent}</p>
                    )}
                    <div className="mt-1 flex items-center gap-1.5">
                      {state === "breached" && <Badge className="bg-admin-danger/10 text-admin-danger-text">SLA BREACHED</Badge>}
                      {state === "unread" && <Badge className="bg-admin-warning/15 text-admin-warning">ACTION REQUIRED</Badge>}
                      {state === "ongoing" && (
                        <span className="flex items-center gap-1 text-admin-micro text-admin-text-secondary">
                          <CircleCheck className="size-3" aria-hidden="true" /> Ongoing
                        </span>
                      )}
                      {state !== "breached" && state !== "unread" && (
                        inq.linkedPatientId
                          ? <Badge variant="info">Patient</Badge>
                          : <Badge variant="neutral">Visitor</Badge>
                      )}
                      {state === "closed" && <Badge className="bg-admin-disabled-alt text-admin-text-secondary">Closed</Badge>}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="shrink-0 border-t border-admin-border p-3">
          <p className="text-admin-micro text-admin-text-secondary">
            Clinical threads are not routed to this desk. Anything a patient asks that turns clinical hands off to a clinician and leaves your queue.
          </p>
        </div>
      </Card>

      <div className="col-span-2 h-full min-h-0">
        {selected ? (
          <InquiryThread inquiry={selected} now={now} onUpdated={loadInquiries} />
        ) : (
          <Card className="flex h-full items-center justify-center border-admin-border p-8 text-center text-admin-body-sm text-admin-text-secondary">
            Select an inquiry to view its thread
          </Card>
        )}
      </div>
    </div>
  );
}
