import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Lock, Mic, Send, ShieldAlert, FlaskConical } from "lucide-react";
import { api } from "../../../lib/api";
import { getSocket } from "../../../lib/socket";
import { useAuth } from "../../../lib/auth";
import { cn } from "../../../lib/utils";
import { useInbox, useFolder, SLA_STYLE, SlaBadge, SlaCountdown, fullName, type InboxChat } from "../lib/vmo";
import { VITAL_LABELS, VITAL_UNITS } from "../../consulting-oncologist/lib/clinicalTypes";

const BASE = "/dashboard/virtual-medical-officer";
interface Msg { id: string; senderId: string; type: "TEXT" | "IMAGE" | "VOICE" | "SYSTEM"; content: string; createdAt: string }

// Three panes: threads (one SLA state each), the chat, and a patient summary that stays locked until triage is done.
export default function InboxPage() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const { chats, error, reload } = useInbox();
  const [filter, setFilter] = useState<"OPEN" | "RESOLVED">("OPEN");
  const active = chats?.find((c) => c.id === conversationId) ?? null;

  if (error) return <p className="p-8 text-admin-danger">{error}</p>;
  if (!chats) return <p className="p-8 text-admin-text-secondary">Loading…</p>;
  const list = chats.filter((c) => (filter === "OPEN" ? c.status === "OPEN" : c.status === "CLOSED"));

  return (
    <div className="flex h-full">
      <section className="flex w-72 shrink-0 flex-col border-r border-admin-border bg-white">
        <div className="border-b border-admin-border p-4">
          <h1 className="text-admin-h4 text-admin-text">Side-Effect Inbox</h1>
          <div className="mt-3 flex gap-2">
            {(["OPEN", "RESOLVED"] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                className={cn("rounded-admin-xs px-3 py-1 text-admin-caption font-semibold", filter === f ? "bg-admin-sidebar-cta text-white" : "bg-admin-card-alt text-admin-text-secondary")}>
                {f === "OPEN" ? "Active" : "Resolved"}
              </button>
            ))}
          </div>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {list.length === 0 && <li className="p-6 text-center text-admin-body-sm text-admin-text-secondary">Nothing here.</li>}
          {list.map((c) => (
            <li key={c.id}>
              <Link to={`${BASE}/inbox/${c.id}`}
                className={cn("block border-b border-admin-border p-4 hover:bg-admin-card-alt", SLA_STYLE[c.slaState].bar, c.id === conversationId && "bg-admin-card-alt")}>
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate text-admin-body-sm font-semibold text-admin-text">{fullName(c.patient)}</p>
                  <SlaCountdown deadline={c.slaDeadline} state={c.slaState} className="text-admin-caption" />
                </div>
                <p className="truncate text-admin-caption text-admin-text-secondary">{c.lastMessage ?? "No messages yet"}</p>
                <div className="mt-2"><SlaBadge state={c.slaState} /></div>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {active ? (
        <>
          <ChatPane key={active.id} chat={active} onChanged={reload} onResolved={() => { void reload(); navigate(`${BASE}/inbox`); }} />
          <SummaryPane chat={active} onChanged={reload} />
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center text-admin-text-secondary">Select a thread to open the chat.</div>
      )}
    </div>
  );
}

function ChatPane({ chat, onChanged, onResolved }: { chat: InboxChat; onChanged: () => void; onResolved: () => void }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const open = chat.status === "OPEN";

  useEffect(() => {
    let cancelled = false;
    api.get<{ messages: Msg[] }>(`/conversations/${chat.id}/messages`).then((r) => { if (!cancelled) setMessages(r.messages); }).catch((e: Error) => setError(e.message));
    const socket = getSocket();
    socket.emit("conversation:join", chat.id);
    const onNew = (m: Msg & { conversationId: string }) => {
      if (m.conversationId !== chat.id) return;
      setMessages((prev) => (prev.some((p) => p.id === m.id) ? prev : [...prev, m]));
      onChanged();
    };
    socket.on("message:new", onNew);
    return () => { cancelled = true; socket.off("message:new", onNew); socket.emit("conversation:leave", chat.id); };
  }, [chat.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [messages.length]);

  async function send() {
    const content = text.trim();
    if (!content) return;
    setError(null);
    try {
      const r = await api.post<{ message: Msg }>(`/conversations/${chat.id}/messages`, { type: "TEXT", content });
      setMessages((prev) => (prev.some((p) => p.id === r.message.id) ? prev : [...prev, r.message]));
      setText(""); onChanged();
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't send"); }
  }

  async function resolve() {
    if (!window.confirm("Resolve this ticket? The patient will no longer be able to reply.")) return;
    try { await api.post(`/conversations/${chat.id}/close`); onResolved(); } catch (e) { setError(e instanceof Error ? e.message : "Couldn't resolve"); }
  }

  return (
    <section className="flex min-w-[24rem] flex-1 flex-col bg-admin-page-bg">
      <header className="flex shrink-0 items-center justify-between border-b border-admin-border bg-white px-6 py-3">
        <div>
          <p className="text-admin-body font-semibold text-admin-text">{fullName(chat.patient)}</p>
          <p className="text-admin-caption text-admin-text-secondary">{chat.patient.uniquePatientId} · {chat.patient.age} yrs</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <SlaCountdown deadline={chat.slaDeadline} state={chat.slaState} className="text-admin-h4" />
            <div className="mt-0.5"><SlaBadge state={chat.slaState} /></div>
          </div>
          {open && (
            <Link to={chat.triageCompleted ? `${BASE}/folder/${chat.id}` : `${BASE}/triage/${chat.id}`}
              className="rounded-admin-sm bg-admin-sidebar-cta px-3 py-2 text-admin-body-sm font-semibold text-white">
              {chat.triageCompleted ? "Patient Folder" : "Begin triage"}
            </Link>
          )}
          {open && <button onClick={resolve} className="rounded-admin-sm border border-admin-border px-3 py-2 text-admin-body-sm font-semibold text-admin-text hover:bg-admin-card-alt">Resolve Ticket</button>}
        </div>
      </header>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-6">
        {messages.map((m) => {
          const mine = m.senderId === user?.id;
          if (m.type === "SYSTEM") return <p key={m.id} className="text-center text-admin-caption text-admin-text-secondary">{m.content}</p>;
          return (
            <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[70%] rounded-admin-md px-4 py-2 text-admin-body-sm", mine ? "bg-admin-sidebar-cta text-white" : "border border-admin-border bg-white text-admin-text")}>
                {m.type === "VOICE" ? <span className="flex items-center gap-2"><Mic className="size-4" /> Voice note</span>
                  : m.type === "IMAGE" ? <span>📎 Image attachment</span> : m.content}
                <p className={cn("mt-1 text-admin-micro", mine ? "text-white/70" : "text-admin-text-secondary")}>{new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      {error && <p role="alert" className="px-6 text-admin-body-sm text-admin-danger">{error}</p>}
      <footer className="shrink-0 border-t border-admin-border bg-white p-4">
        {open ? (
          <div className="flex gap-3">
            <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void send()}
              placeholder="Type a reply…" className="flex-1 rounded-admin-sm border border-admin-border bg-admin-card-alt px-4 py-2 text-admin-body-sm" />
            <button onClick={() => void send()} disabled={!text.trim()} className="flex items-center gap-2 rounded-admin-sm bg-admin-sidebar-cta px-4 py-2 text-admin-body-sm text-white disabled:opacity-50">
              <Send className="size-4" /> Send
            </button>
          </div>
        ) : <p className="text-center text-admin-body-sm text-admin-text-secondary">This ticket is resolved.</p>}
      </footer>
    </section>
  );
}

// Right rail: locked until the checklist is complete (the server refuses the folder until then).
function SummaryPane({ chat }: { chat: InboxChat; onChanged: () => void }) {
  const open = chat.status === "OPEN";
  const { folder, locked, error } = useFolder(open ? chat.id : undefined);

  return (
    <aside className="hidden w-80 shrink-0 space-y-4 overflow-y-auto border-l xl:block border-admin-border bg-white p-5">
      <h2 className="text-admin-caption font-semibold uppercase tracking-wider text-admin-text-secondary">Patient summary</h2>
      {!open ? <p className="text-admin-body-sm text-admin-text-secondary">Clinical detail is only available while a chat is active.</p>
        : locked ? (
          <div className="rounded-admin-sm border border-dashed border-admin-border p-4 text-center">
            <Lock className="mx-auto size-6 text-admin-text-secondary" aria-hidden="true" />
            <p className="mt-2 text-admin-body-sm text-admin-text">Complete the triage checklist to open this patient's clinical summary.</p>
            <Link to={`${BASE}/triage/${chat.id}`} className="mt-3 inline-block rounded-admin-sm bg-admin-sidebar-cta px-4 py-2 text-admin-body-sm text-white">Begin triage</Link>
          </div>
        ) : error ? <p className="text-admin-body-sm text-admin-danger">{error}</p>
        : !folder ? <p className="text-admin-body-sm text-admin-text-secondary">Loading…</p>
        : (
          <>
            <div className="grid grid-cols-2 gap-2">
              {folder.vitals.filter((v) => v.value !== null).map((v) => (
                <div key={v.vitalType} className={cn("rounded-admin-sm border p-2", v.severity === "ELEVATED" ? "border-admin-danger bg-red-50" : "border-admin-border")}>
                  <p className="text-admin-micro uppercase text-admin-text-secondary">{VITAL_LABELS[v.vitalType] ?? v.vitalType}</p>
                  <p className="text-admin-body-sm font-semibold text-admin-text">{v.value} <span className="text-admin-caption font-normal">{VITAL_UNITS[v.vitalType]}</span></p>
                </div>
              ))}
              {folder.vitals.every((v) => v.value === null) && <p className="col-span-2 text-admin-body-sm text-admin-text-secondary">No vitals recorded.</p>}
            </div>
            <div className="rounded-admin-sm border border-admin-border p-3">
              <p className="text-admin-caption uppercase text-admin-text-secondary">Current regimen</p>
              {folder.regimen
                ? <p className="mt-1 text-admin-body-sm text-admin-text">{folder.regimen.drugName} · cycle {folder.regimen.currentCycleNumber ?? "–"} of {folder.regimen.totalCycles}</p>
                : <p className="mt-1 text-admin-body-sm text-admin-text-secondary">No active regimen.</p>}
            </div>
            <div className="rounded-admin-sm border border-dashed border-admin-border p-3">
              <p className="text-admin-caption uppercase text-admin-text-secondary">Risk calculator</p>
              <p className="mt-1 text-admin-caption text-admin-text-secondary">Not enabled: the scoring formula still needs clinical sign-off.</p>
            </div>
            <div className="space-y-2">
              <Link to={`${BASE}/folder/${chat.id}`} className="block rounded-admin-sm bg-admin-sidebar-cta px-4 py-2 text-center text-admin-body-sm text-white">Open Patient Folder</Link>
              <Link to={`${BASE}/medication-triage/${chat.id}`} className="flex items-center justify-center gap-2 rounded-admin-sm border border-admin-border px-4 py-2 text-admin-body-sm text-admin-text hover:bg-admin-card-alt">
                <FlaskConical className="size-4" /> Medication Triage
              </Link>
              <Link to={`${BASE}/folder/${chat.id}#escalate`} className="flex items-center justify-center gap-2 rounded-admin-sm border border-admin-danger px-4 py-2 text-admin-body-sm text-admin-danger hover:bg-red-50">
                <ShieldAlert className="size-4" /> Escalate to Specialist
              </Link>
            </div>
          </>
        )}
    </aside>
  );
}
