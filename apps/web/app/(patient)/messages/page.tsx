"use client";

import { Suspense, useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Plus, MessageSquare, Activity, Paperclip, Mic, Square, Send, Check, CheckCheck,
  Coins, CircleAlert, Star, CircleX,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { api, ApiError } from "@/lib/api";
import { useMyPatient } from "@/lib/useMyPatient";
import { currentSideEffectFeeKobo, isNightRateNow } from "@/lib/sideEffectPricing";
import { getSocket } from "@/lib/socket";
import type { Conversation, Message, Invoice, ConversationFeedback } from "@/lib/types";

function koboToNaira(kobo: string) {
  return `₦${(Number(kobo) / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
}

const TYPE_LABELS: Record<Conversation["conversationType"], string> = {
  ADMIN_INQUIRY: "Admin Inquiry",
  MO_SIDE_EFFECT: "Side Effect Report",
};

const TYPE_ICONS: Record<Conversation["conversationType"], typeof MessageSquare> = {
  ADMIN_INQUIRY: MessageSquare,
  MO_SIDE_EFFECT: Activity,
};

// Appending is idempotent by message id because the same message arrives twice by design: once
// as the POST response and once as the socket broadcast, and either can win the race. Only the
// socket path guarded against this, so when the broadcast landed before the POST resolved the
// message was rendered twice and React warned about duplicate keys.
function appendMessage(prev: Message[], msg: Message): Message[] {
  return prev.some((m) => m.id === msg.id) ? prev : [...prev, msg];
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// WhatsApp-style: a conversation that's been replied to just shows a read-style tick, not a
// text badge — "Answered" as a label was the generic status the real per-message ticks replace.
function SlaBadge({ conversation }: { conversation: Conversation }) {
  if (conversation.status === "CLOSED") return <Badge>Closed</Badge>;
  if (conversation.slaBreached && !conversation.firstResponseAt) return <Badge variant="critical">SLA Breached</Badge>;
  if (conversation.firstResponseAt) return <CheckCheck className="size-4 text-teal" aria-label="Replied" />;
  return <Badge variant="warning">Open</Badge>;
}

const STATUS_TITLE: Record<Message["status"], string> = {
  SENT: "Sent",
  DELIVERED: "Delivered",
  READ: "Read",
};

function DeliveryStatus({ status }: { status: Message["status"] }) {
  const Icon = status === "SENT" ? Check : CheckCheck;
  return (
    <span
      className={`mt-1 flex items-center justify-end gap-0.5 ${status === "READ" ? "text-sky-300" : "text-white/60"}`}
      title={STATUS_TITLE[status]}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      <span className="sr-only">{STATUS_TITLE[status]}</span>
    </span>
  );
}

// The documents API only stores file metadata (no content-serving route yet — uploads write to
// R2 but nothing reads them back), so an attached image/voice note can't actually be previewed
// here. We show a plain attachment chip rather than a broken <img>/<audio> tag.
function AttachmentChip({ type }: { type: "IMAGE" | "VOICE" }) {
  const Icon = type === "IMAGE" ? Paperclip : Mic;
  const label = type === "IMAGE" ? "Photo attachment" : "Voice note";
  return (
    <span className="flex items-center gap-2 text-sm">
      <Icon className="size-4" aria-hidden="true" /> {label}
    </span>
  );
}

export default function MessagesPage() {
  return (
    <Suspense fallback={<p className="p-6 text-center text-sm text-neutral-400">Loading messages…</p>}>
      <MessagesPageInner />
    </Suspense>
  );
}

function MessagesPageInner() {
  const { patient, wallet, loading: patientLoading, notLinked } = useMyPatient();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [newType, setNewType] = useState<Conversation["conversationType"]>("ADMIN_INQUIRY");
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const autoOpenedRef = useRef(false);

  // Side-effect reports carry a real per-report fee, paid upfront — this gate sits in front of
  // the thread view whenever the patient has no existing OPEN MO_SIDE_EFFECT conversation yet.
  // A CLOSED one doesn't count as "existing" — the encounter is over, a new report is a new fee.
  const [sideEffectGate, setSideEffectGate] = useState<"form" | "insufficient" | null>(null);
  const [reportDraft, setReportDraft] = useState("");
  const [feeInvoice, setFeeInvoice] = useState<Invoice | null>(null);

  // Feedback (mutual 5-star rating, only once the report is CLOSED).
  const [feedbackList, setFeedbackList] = useState<ConversationFeedback[]>([]);
  const [feedbackLoaded, setFeedbackLoaded] = useState(false);
  const [myRating, setMyRating] = useState(0);
  const [myReview, setMyReview] = useState("");
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  const loadConversations = useCallback(async () => {
    if (!patient) return;
    try {
      const res = await api.get<{ conversations: Conversation[] }>(`/conversations?patientId=${patient.id}`);
      setConversations(res.conversations);
    } catch {
      setConversations([]);
    }
  }, [patient]);

  useEffect(() => {
    if (!patient) return;
    (async () => {
      await loadConversations();
      setLoading(false);
    })();
  }, [patient, loadConversations]);

  // Quick-action deep link from the Help button ("/messages?type=MO_SIDE_EFFECT") — jump
  // straight into the patient's side-effect conversation if they already have one open
  // (follow-ups are free), otherwise show the paid report intake instead of creating one.
  useEffect(() => {
    if (loading || autoOpenedRef.current || !patient) return;
    if (searchParams.get("type") !== "MO_SIDE_EFFECT") return;
    autoOpenedRef.current = true;

    (async () => {
      const target = conversations.find((c) => c.conversationType === "MO_SIDE_EFFECT" && c.status === "OPEN");
      if (!target) {
        setSideEffectGate("form");
        router.replace("/messages");
        return;
      }
      setSelected(target);
      setError(null);
      try {
        const res = await api.get<{ messages: Message[] }>(`/conversations/${target.id}/messages`);
        setMessages(res.messages);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load messages");
      }
      router.replace("/messages");
    })();
  }, [loading, patient, conversations, searchParams, router]);

  useEffect(() => {
    if (!selected || selected.status !== "CLOSED" || selected.conversationType !== "MO_SIDE_EFFECT") return;
    api.get<{ feedback: ConversationFeedback[] }>(`/conversations/${selected.id}/feedback`)
      .then((res) => setFeedbackList(res.feedback))
      .catch(() => setFeedbackList([]))
      .finally(() => setFeedbackLoaded(true));
  }, [selected]);

  // Live delivery for the open thread — join the conversation's room, append anything the
  // server pushes for it, leave on cleanup so a socket doesn't accumulate stale room
  // memberships as the patient switches between conversations.
  useEffect(() => {
    if (!selected) return;
    const socket = getSocket();
    socket.emit("conversation:join", selected.id);

    function onNewMessage(msg: Message & { conversationId: string }) {
      if (msg.conversationId !== selected!.id) return;
      setMessages((prev) => appendMessage(prev, msg));
    }
    socket.on("message:new", onNewMessage);

    return () => {
      socket.off("message:new", onNewMessage);
      socket.emit("conversation:leave", selected.id);
    };
  }, [selected]);

  async function openConversation(conversation: Conversation) {
    setSelected(conversation);
    setError(null);
    setFeedbackList([]);
    setFeedbackLoaded(false);
    setMyRating(0);
    setMyReview("");
    try {
      const res = await api.get<{ messages: Message[] }>(`/conversations/${conversation.id}/messages`);
      setMessages(res.messages);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load messages");
    }
  }

  async function startConversation() {
    if (!patient) return;
    setError(null);

    // Side-effect reports aren't free to self-start — reuse an existing open one if there is
    // one, otherwise show the paid intake instead of calling the plain create endpoint (which
    // now rejects patient-initiated MO_SIDE_EFFECT conversations).
    if (newType === "MO_SIDE_EFFECT") {
      const existing = conversations.find((c) => c.conversationType === "MO_SIDE_EFFECT" && c.status === "OPEN");
      if (existing) {
        await openConversation(existing);
      } else {
        setSideEffectGate("form");
      }
      return;
    }

    try {
      const res = await api.post<{ conversation: Conversation }>("/conversations", {
        patientId: patient.id,
        conversationType: newType,
      });
      await loadConversations();
      await openConversation(res.conversation);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start conversation");
    }
  }

  async function submitSideEffectReport() {
    if (!patient || !reportDraft.trim()) return;
    setSending(true);
    setError(null);
    try {
      const res = await api.post<{ conversation: Conversation; message: Message; invoice: Invoice }>(
        "/conversations/side-effect-report",
        { patientId: patient.id, message: reportDraft.trim() },
      );
      await loadConversations();
      setSelected(res.conversation);
      setMessages([res.message]);
      setSideEffectGate(null);
      setReportDraft("");
    } catch (err) {
      const body = err instanceof ApiError ? (err.body as { invoice?: Invoice } | null) : null;
      if (body?.invoice) {
        setFeeInvoice(body.invoice);
        setSideEffectGate("insufficient");
      } else {
        setError(err instanceof Error ? err.message : "Failed to submit report");
      }
    } finally {
      setSending(false);
    }
  }

  async function endReport() {
    if (!selected) return;
    setSending(true);
    setError(null);
    try {
      const res = await api.post<{ conversation: Conversation }>(`/conversations/${selected.id}/close`);
      setSelected(res.conversation);
      await loadConversations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to end report");
    } finally {
      setSending(false);
    }
  }

  async function submitFeedback() {
    if (!selected || myRating < 1) return;
    setSubmittingFeedback(true);
    setFeedbackError(null);
    try {
      const res = await api.post<{ feedback: ConversationFeedback }>(`/conversations/${selected.id}/feedback`, {
        rating: myRating,
        review: myReview.trim() || undefined,
      });
      setFeedbackList((prev) => [...prev, res.feedback]);
    } catch (err) {
      setFeedbackError(err instanceof Error ? err.message : "Failed to submit feedback");
    } finally {
      setSubmittingFeedback(false);
    }
  }

  async function sendMessage() {
    if (!selected || !newMessage.trim() || !patient?.userId) return;
    setSending(true);
    setError(null);
    try {
      const res = await api.post<{ message: Message }>(`/conversations/${selected.id}/messages`, {
        senderId: patient.userId,
        type: "TEXT",
        content: newMessage.trim(),
      });
      setMessages((prev) => appendMessage(prev, res.message));
      setNewMessage("");
      loadConversations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setSending(false);
    }
  }

  async function sendAttachment(blob: Blob, type: "IMAGE" | "VOICE") {
    if (!selected || !patient?.userId) return;
    setSending(true);
    setError(null);
    try {
      const content = await blobToBase64(blob);
      const mimeType = blob.type || (type === "VOICE" ? "audio/webm" : "application/octet-stream");
      const uploadRes = await api.post<{ file: { id: string } }>("/files/upload", {
        patientId: patient.id, mimeType, content,
      });
      const res = await api.post<{ message: Message }>(`/conversations/${selected.id}/messages`, {
        senderId: patient.userId,
        type,
        content: uploadRes.file.id,
      });
      setMessages((prev) => appendMessage(prev, res.message));
      loadConversations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send attachment");
    } finally {
      setSending(false);
    }
  }

  function handleImagePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) sendAttachment(file, "IMAGE");
  }

  async function toggleRecording() {
    if (recording) {
      mediaRecorderRef.current?.stop();
      setRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        stream.getTracks().forEach((t) => t.stop());
        sendAttachment(blob, "VOICE");
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
    } catch {
      setError("Microphone access was denied");
    }
  }

  if (patientLoading || loading) {
    return <p className="p-6 text-center text-sm text-neutral-400">Loading messages…</p>;
  }

  if (notLinked || !patient) {
    return (
      <div className="p-6">
        <Card className="text-center text-sm text-neutral-600">
          Messaging becomes available once your care team confirms your patient record.
        </Card>
      </div>
    );
  }

  function closeSideEffectGate() {
    setSideEffectGate(null);
    setReportDraft("");
    setFeeInvoice(null);
    setError(null);
  }

  if (sideEffectGate === "form") {
    return (
      <div className="space-y-4 p-4">
        <div className="flex items-center gap-3">
          <button onClick={closeSideEffectGate} aria-label="Back">
            <ArrowLeft className="size-5 text-neutral-500" />
          </button>
          <h1 className="text-lg font-bold text-neutral-900">Report a Side Effect</h1>
        </div>

        <Card className="flex items-start gap-3 bg-amber-bg">
          <Coins className="mt-0.5 size-5 shrink-0 text-amber" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-amber-text">
              A {koboToNaira(currentSideEffectFeeKobo())} fee applies ({isNightRateNow() ? "night rate, 8pm–6am" : "day rate"})
            </p>
            <p className="mt-0.5 text-xs text-neutral-500">
              This connects you with a Virtual Medical Officer. The fee is charged once from your
              wallet balance when you submit — replying here while it&apos;s still open is free.
              Once the report is ended, starting a new one is a new report and a new fee.
            </p>
          </div>
        </Card>

        <textarea
          value={reportDraft}
          onChange={(e) => setReportDraft(e.target.value)}
          placeholder="Describe what you're experiencing…"
          rows={5}
          className="w-full resize-none rounded-xl border border-neutral-300 px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary-50"
        />

        {error && <p className="text-sm text-critical">{error}</p>}

        <Button className="w-full" onClick={submitSideEffectReport} disabled={sending || !reportDraft.trim()} loading={sending}>
          Pay &amp; Send Report
        </Button>
      </div>
    );
  }

  if (sideEffectGate === "insufficient" && feeInvoice) {
    const balanceKobo = wallet?.balanceKobo ?? "0";
    const shortfall = Number(feeInvoice.totalKobo) - Number(balanceKobo);
    return (
      <div className="space-y-4 p-4">
        <div className="flex items-center gap-3">
          <button onClick={closeSideEffectGate} aria-label="Back">
            <ArrowLeft className="size-5 text-neutral-500" />
          </button>
          <h1 className="text-lg font-bold text-neutral-900">Report a Side Effect</h1>
        </div>

        <div className="rounded-2xl border border-critical/30 bg-critical-bg p-6 text-center">
          <div className="mx-auto flex size-13 items-center justify-center rounded-xl bg-critical text-white">
            <CircleAlert className="size-6" aria-hidden="true" />
          </div>
          <h2 className="mt-3.5 text-lg font-bold text-critical">Insufficient Balance</h2>
          <p className="mt-2 text-sm leading-relaxed text-critical/80">
            Reporting a side effect costs <b>{koboToNaira(feeInvoice.totalKobo)}</b>, but your wallet
            only has <b>{koboToNaira(balanceKobo)}</b>.
          </p>
        </div>

        <Card>
          <div className="flex justify-between">
            <div>
              <p className="text-xs text-neutral-500">Available Funds</p>
              <p className="text-lg font-bold text-neutral-900">{koboToNaira(balanceKobo)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-neutral-500">Shortfall</p>
              <p className="text-lg font-bold text-critical">-{koboToNaira(String(shortfall))}</p>
            </div>
          </div>
        </Card>

        <Button className="w-full" disabled>
          <Coins className="size-4" aria-hidden="true" /> Top Up Balance
        </Button>
        <p className="text-center text-xs text-neutral-500">
          Top-up isn&apos;t connected to a payment provider yet — this button is a placeholder.
          Once your wallet has enough balance, come back here and submit your report again.
        </p>
      </div>
    );
  }

  // Mobile-first single-column: either the conversation list, or an open thread — not both
  // side by side (that's the apps/dashboard staff-desktop layout, not appropriate at phone width).
  if (selected) {
    const showFeedback = selected.conversationType === "MO_SIDE_EFFECT" && selected.status === "CLOSED" && feedbackLoaded;
    const myFeedback = feedbackList.find((f) => f.raterId === patient.userId);
    const staffFeedback = feedbackList.find((f) => f.raterRole === "STAFF");

    return (
      <div className="flex h-[calc(100vh-8.5rem)] flex-col">
        <div className="flex items-center gap-3 border-b border-neutral-200 px-4 py-3">
          <button onClick={() => setSelected(null)} aria-label="Back to conversations">
            <ArrowLeft className="size-5 text-neutral-500" />
          </button>
          <div className="flex-1">
            <p className="text-sm font-semibold text-neutral-900">{TYPE_LABELS[selected.conversationType]}</p>
          </div>
          {selected.conversationType === "MO_SIDE_EFFECT" && selected.status === "OPEN" && (
            <button
              onClick={endReport}
              disabled={sending}
              className="flex items-center gap-1 text-xs font-semibold text-critical hover:text-critical/80 disabled:opacity-50"
            >
              <CircleX className="size-3.5" aria-hidden="true" /> End Report
            </button>
          )}
          <SlaBadge conversation={selected} />
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <p className="text-center text-sm text-neutral-400">No messages yet</p>
          ) : (
            messages.map((m) => {
              const isMine = m.senderId === patient.userId;
              return (
                <div
                  key={m.id}
                  className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                    m.type === "SYSTEM"
                      ? "mx-auto bg-neutral-100 text-neutral-500 italic"
                      : isMine
                        ? "ml-auto bg-primary text-white"
                        : "bg-neutral-100 text-neutral-800"
                  }`}
                >
                  {m.type === "TEXT" || m.type === "SYSTEM" ? (
                    <p>{m.content}</p>
                  ) : (
                    <AttachmentChip type={m.type} />
                  )}
                  {isMine && m.type !== "SYSTEM" ? (
                    <DeliveryStatus status={m.status} />
                  ) : (
                    <p className="mt-1 text-[10px] text-neutral-400">
                      {new Date(m.createdAt).toLocaleTimeString()}
                    </p>
                  )}
                </div>
              );
            })
          )}
        </div>

        {error && <p className="px-4 text-sm text-critical">{error}</p>}

        {selected.status === "OPEN" && (
          <div className="flex items-center gap-2 border-t border-neutral-200 p-3">
            <label className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100">
              <Paperclip className="size-4.5" aria-hidden="true" />
              <input type="file" accept="image/*" onChange={handleImagePick} disabled={sending} className="hidden" />
            </label>
            <button
              type="button"
              onClick={toggleRecording}
              disabled={sending}
              aria-label={recording ? "Stop recording" : "Record voice note"}
              className={`flex size-9 shrink-0 items-center justify-center rounded-full ${
                recording ? "bg-critical text-white" : "text-neutral-500 hover:bg-neutral-100"
              }`}
            >
              {recording ? <Square className="size-4" aria-hidden="true" /> : <Mic className="size-4.5" aria-hidden="true" />}
            </button>
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              placeholder="Type a message…"
              className="flex-1 rounded-xl border border-neutral-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary-50"
            />
            <Button onClick={sendMessage} disabled={sending || !newMessage.trim()} size="sm">
              <Send className="size-4" aria-hidden="true" />
            </Button>
          </div>
        )}

        {showFeedback && (
          <div className="space-y-4 border-t border-neutral-200 p-4">
            {myFeedback ? (
              <div>
                <p className="mb-1 text-xs font-semibold text-neutral-500">Your rating</p>
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Star
                      key={n}
                      className={`size-5 ${n <= myFeedback.rating ? "fill-amber text-amber" : "text-neutral-200"}`}
                      aria-hidden="true"
                    />
                  ))}
                </div>
                {myFeedback.review && <p className="mt-1.5 text-sm text-neutral-600">{myFeedback.review}</p>}
              </div>
            ) : (
              <div>
                <p className="mb-1.5 text-sm font-bold text-neutral-900">How was your side-effect report handled?</p>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" onClick={() => setMyRating(n)} aria-label={`${n} star${n > 1 ? "s" : ""}`}>
                      <Star
                        className={`size-7 ${n <= myRating ? "fill-amber text-amber" : "text-neutral-200"}`}
                        aria-hidden="true"
                      />
                    </button>
                  ))}
                </div>
                <textarea
                  value={myReview}
                  onChange={(e) => setMyReview(e.target.value)}
                  placeholder="Optional — tell us more"
                  rows={2}
                  className="mt-2 w-full resize-none rounded-xl border border-neutral-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary-50"
                />
                {feedbackError && <p className="mt-1 text-xs text-critical">{feedbackError}</p>}
                <Button
                  className="mt-2 w-full"
                  size="sm"
                  onClick={submitFeedback}
                  disabled={submittingFeedback || myRating < 1}
                  loading={submittingFeedback}
                >
                  Submit Rating
                </Button>
              </div>
            )}

            {staffFeedback && (
              <div className="border-t border-neutral-100 pt-3">
                <p className="mb-1 text-xs font-semibold text-neutral-500">Care team&apos;s rating</p>
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Star
                      key={n}
                      className={`size-4 ${n <= staffFeedback.rating ? "fill-amber text-amber" : "text-neutral-200"}`}
                      aria-hidden="true"
                    />
                  ))}
                </div>
                {staffFeedback.review && <p className="mt-1.5 text-sm text-neutral-600">{staffFeedback.review}</p>}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-bold text-primary">Chat</h1>
      </div>

      <Card className="space-y-3">
        <select
          value={newType}
          onChange={(e) => setNewType(e.target.value as Conversation["conversationType"])}
          className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
        >
          <option value="ADMIN_INQUIRY">Admin Inquiry</option>
          <option value="MO_SIDE_EFFECT">Side Effect Report</option>
        </select>
        <Button className="w-full" onClick={startConversation}>
          <Plus className="size-4" aria-hidden="true" />
          Start Conversation
        </Button>
      </Card>

      {error && <p className="text-sm text-critical">{error}</p>}

      {conversations.length === 0 ? (
        <Card className="text-center text-sm text-neutral-400">No conversations yet</Card>
      ) : (
        <ul className="space-y-3">
          {conversations.map((c) => {
            const Icon = TYPE_ICONS[c.conversationType];
            return (
              <li key={c.id}>
                <button onClick={() => openConversation(c)} className="w-full text-left">
                  <Card variant="interactive" className="flex items-center gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary">
                      <Icon className="size-4.5" aria-hidden="true" />
                    </div>
                    <span className="flex-1 text-sm font-medium text-neutral-900">{TYPE_LABELS[c.conversationType]}</span>
                    <SlaBadge conversation={c} />
                  </Card>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
