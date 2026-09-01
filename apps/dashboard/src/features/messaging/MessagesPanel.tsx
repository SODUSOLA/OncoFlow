import { useEffect, useState } from "react";
import { CheckCheck, Check, Star } from "lucide-react";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useCountdown } from "../../lib/useCountdown";
import { getSocket } from "../../lib/socket";
import type { Conversation, Message, ConversationFeedback } from "../../lib/types";

const CONVERSATION_TYPE_LABELS: Record<Conversation["conversationType"], string> = {
  ADMIN_INQUIRY: "Admin Inquiry",
  MO_SIDE_EFFECT: "MO Side Effect",
};

// WhatsApp-style: a conversation that's been replied to just shows a read-style tick, not a
// text badge — "Answered" as a label was the generic status the real per-message ticks replace.
// The "Xm left" badge used to be computed once per render (Date.now() snapshotted at render
// time) and would silently go stale until something else happened to re-render this row —
// useCountdown gives it a real 1s tick instead.
function SlaBadge({ conversation }: { conversation: Conversation }) {
  const countdown = useCountdown(
    conversation.status === "OPEN" && !conversation.firstResponseAt ? conversation.slaDeadline : null,
  );

  if (conversation.status === "CLOSED") {
    return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">Closed</span>;
  }
  if (conversation.slaBreached && !conversation.firstResponseAt) {
    return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">SLA Breached</span>;
  }
  if (conversation.firstResponseAt) {
    return <CheckCheck className="size-4 text-teal-600" aria-label="Replied" />;
  }
  if (conversation.slaDeadline) {
    const label = countdown.days > 0
      ? `${countdown.days}d ${countdown.hours}h left`
      : countdown.hours > 0
        ? `${countdown.hours}h ${countdown.minutes}m left`
        : `${countdown.minutes}m ${countdown.seconds}s left`;
    return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">{label}</span>;
  }
  return null;
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
      className={`mt-1 flex items-center justify-end gap-0.5 ${status === "READ" ? "text-sky-300" : "text-brand-100"}`}
      title={STATUS_TITLE[status]}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      <span className="sr-only">{STATUS_TITLE[status]}</span>
    </span>
  );
}

// patientId: when provided (a patient viewing their own messages), skips the manual-entry
// step and auto-loads — the caller already knows who they are. When omitted (staff searching
// any patient's conversations, e.g. Super Admin), falls back to manual entry.
export function MessagesPanel({ patientId: fixedPatientId }: { patientId?: string } = {}) {
  const { user } = useAuth();

  const [patientId, setPatientId] = useState("");
  const [loadedPatientId, setLoadedPatientId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [newConversationType, setNewConversationType] = useState<Conversation["conversationType"]>("ADMIN_INQUIRY");
  const [listError, setListError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [threadError, setThreadError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const [feedbackList, setFeedbackList] = useState<ConversationFeedback[]>([]);
  const [feedbackLoaded, setFeedbackLoaded] = useState(false);
  const [myRating, setMyRating] = useState(0);
  const [myReview, setMyReview] = useState("");
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  async function loadConversations(pid: string) {
    setLoadedPatientId(pid);
    setSelectedId(null);
    setMessages([]);
    setListError(null);
    try {
      const res = await api.get<{ conversations: Conversation[] }>(`/conversations?patientId=${pid}`);
      setConversations(res.conversations);
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Failed to load conversations");
    }
  }

  useEffect(() => {
    if (fixedPatientId) loadConversations(fixedPatientId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixedPatientId]);

  async function startConversation() {
    if (!loadedPatientId || !user) return;
    setListError(null);
    try {
      const res = await api.post<{ conversation: Conversation }>("/conversations", {
        patientId: loadedPatientId,
        conversationType: newConversationType,
        // assignedTo only makes sense for staff starting a conversation on a patient's
        // behalf — a patient starting their own conversation isn't "assigned" to it.
        ...(fixedPatientId ? {} : { assignedTo: user.id }),
      });
      setConversations((prev) => [res.conversation, ...prev]);
      await selectConversation(res.conversation.id);
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Failed to start conversation");
    }
  }

  async function selectConversation(id: string) {
    setSelectedId(id);
    setThreadError(null);
    setFeedbackList([]);
    setFeedbackLoaded(false);
    setMyRating(0);
    setMyReview("");
    setFeedbackError(null);
    try {
      const res = await api.get<{ messages: Message[] }>(`/conversations/${id}/messages`);
      setMessages(res.messages);
    } catch (err) {
      setThreadError(err instanceof Error ? err.message : "Failed to load messages");
    }
  }

  async function submitFeedback() {
    if (!selectedId || myRating < 1) return;
    setSubmittingFeedback(true);
    setFeedbackError(null);
    try {
      const res = await api.post<{ feedback: ConversationFeedback }>(`/conversations/${selectedId}/feedback`, {
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
    if (!selectedId || !newMessage.trim() || !user) return;
    setSending(true);
    setThreadError(null);
    try {
      const res = await api.post<{ message: Message }>(`/conversations/${selectedId}/messages`, {
        senderId: user.id,
        type: "TEXT",
        content: newMessage.trim(),
      });
      setMessages((prev) => [...prev, res.message]);
      setNewMessage("");
      if (loadedPatientId) {
        const listRes = await api.get<{ conversations: Conversation[] }>(`/conversations?patientId=${loadedPatientId}`);
        setConversations(listRes.conversations);
      }
    } catch (err) {
      setThreadError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setSending(false);
    }
  }

  async function closeConversation(id: string) {
    try {
      await api.post<{ conversation: Conversation }>(`/conversations/${id}/close`);
      if (loadedPatientId) loadConversations(loadedPatientId);
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Failed to close conversation");
    }
  }

  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  useEffect(() => {
    if (!selected || selected.status !== "CLOSED" || selected.conversationType !== "MO_SIDE_EFFECT") return;
    api.get<{ feedback: ConversationFeedback[] }>(`/conversations/${selected.id}/feedback`)
      .then((res) => setFeedbackList(res.feedback))
      .catch(() => setFeedbackList([]))
      .finally(() => setFeedbackLoaded(true));
  }, [selected]);

  // Live delivery for the open thread — same join/leave/dedupe pattern as apps/web's messages
  // page. Staff previously only saw a message appear after sending their own (optimistic local
  // append) or re-selecting the conversation; this makes an incoming message from the other
  // party show up without either.
  useEffect(() => {
    if (!selectedId) return;
    const socket = getSocket();
    socket.emit("conversation:join", selectedId);

    function onNewMessage(msg: Message & { conversationId: string }) {
      if (msg.conversationId !== selectedId) return;
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
    }
    socket.on("message:new", onNewMessage);

    return () => {
      socket.off("message:new", onNewMessage);
      socket.emit("conversation:leave", selectedId);
    };
  }, [selectedId]);

  const showFeedback = selected?.conversationType === "MO_SIDE_EFFECT" && selected.status === "CLOSED" && feedbackLoaded;
  const myFeedback = feedbackList.find((f) => f.raterId === user?.id);
  const otherFeedback = feedbackList.find((f) => f.raterId !== user?.id);

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-gray-800">Messages</h2>

      {!fixedPatientId && (
      <div className="bg-white rounded-xl border border-gray-200 p-6 flex gap-3 items-end">
        <div>
          <label className="block text-sm text-gray-600 mb-1">Patient ID</label>
          <input
            type="text"
            value={patientId}
            onChange={(e) => setPatientId(e.target.value)}
            placeholder="Patient UUID"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-72"
          />
        </div>
        <button
          onClick={() => patientId && loadConversations(patientId)}
          className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 text-sm font-medium"
        >
          Load
        </button>
      </div>
      )}

      {loadedPatientId && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="md:col-span-2 bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between gap-2">
              <h3 className="font-semibold text-gray-700 text-sm">Conversations</h3>
              <div className="flex items-center gap-2">
                <select
                  value={newConversationType}
                  onChange={(e) => setNewConversationType(e.target.value as Conversation["conversationType"])}
                  className="text-xs border border-gray-300 rounded-lg px-2 py-1"
                >
                  <option value="ADMIN_INQUIRY">Admin Inquiry</option>
                  <option value="MO_SIDE_EFFECT">MO Side Effect</option>
                </select>
                <button
                  onClick={startConversation}
                  className="px-3 py-1 bg-brand-600 text-white rounded-lg hover:bg-brand-700 text-xs font-medium"
                >
                  + New
                </button>
              </div>
            </div>
            {listError && <div className="px-4 py-2 text-sm text-red-600">{listError}</div>}
            {conversations.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">No conversations for this patient</div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {conversations.map((c) => (
                  <li key={c.id}>
                    <button
                      onClick={() => selectConversation(c.id)}
                      className={`w-full text-left px-4 py-3 hover:bg-gray-50 ${selectedId === c.id ? "bg-brand-50" : ""}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-gray-800">{CONVERSATION_TYPE_LABELS[c.conversationType]}</span>
                        <SlaBadge conversation={c} />
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <span className={`text-xs ${c.status === "OPEN" ? "text-green-600" : "text-gray-400"}`}>{c.status}</span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="md:col-span-3 bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col">
            {!selected ? (
              <div className="p-8 text-center text-gray-400 text-sm flex-1 flex items-center justify-center">
                Select a conversation
              </div>
            ) : (
              <>
                <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                  <div>
                    <span className="text-sm font-semibold text-gray-800">{CONVERSATION_TYPE_LABELS[selected.conversationType]}</span>
                    <span className="ml-2"><SlaBadge conversation={selected} /></span>
                  </div>
                  {selected.status === "OPEN" && (
                    <button
                      onClick={() => closeConversation(selected.id)}
                      className="text-xs text-gray-500 hover:text-gray-700"
                    >
                      Close conversation
                    </button>
                  )}
                </div>

                <div className="flex-1 p-4 space-y-3 overflow-y-auto max-h-96">
                  {threadError && <p className="text-sm text-red-600">{threadError}</p>}
                  {messages.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center">No messages yet</p>
                  ) : (
                    messages.map((m) => {
                      const isMine = m.senderId === user?.id;
                      return (
                        <div key={m.id} className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                          m.type === "SYSTEM" ? "bg-gray-100 text-gray-500 italic mx-auto" :
                          isMine ? "bg-brand-600 text-white ml-auto" : "bg-gray-100 text-gray-800"
                        }`}>
                          <p>{m.content}</p>
                          {isMine && m.type !== "SYSTEM" ? (
                            <DeliveryStatus status={m.status} />
                          ) : (
                            <p className="text-[10px] mt-1 text-gray-400">
                              {new Date(m.createdAt).toLocaleTimeString()}
                            </p>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                {selected.status === "OPEN" && (
                  <div className="p-4 border-t border-gray-200 flex gap-2">
                    <input
                      type="text"
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                      placeholder="Type a message..."
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    />
                    <button
                      onClick={sendMessage}
                      disabled={sending || !newMessage.trim()}
                      className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 text-sm font-medium"
                    >
                      Send
                    </button>
                  </div>
                )}

                {showFeedback && (
                  <div className="p-4 border-t border-gray-200 space-y-4">
                    {myFeedback ? (
                      <div>
                        <p className="text-xs font-semibold text-gray-500 mb-1">Your rating</p>
                        <div className="flex gap-0.5">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <Star
                              key={n}
                              className={`size-5 ${n <= myFeedback.rating ? "fill-amber-400 text-amber-400" : "text-gray-200"}`}
                              aria-hidden="true"
                            />
                          ))}
                        </div>
                        {myFeedback.review && <p className="text-sm text-gray-600 mt-1.5">{myFeedback.review}</p>}
                      </div>
                    ) : (
                      <div>
                        <p className="text-sm font-bold text-gray-800 mb-1.5">Rate how this side-effect report went</p>
                        <div className="flex gap-1">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <button key={n} type="button" onClick={() => setMyRating(n)} aria-label={`${n} star${n > 1 ? "s" : ""}`}>
                              <Star
                                className={`size-7 ${n <= myRating ? "fill-amber-400 text-amber-400" : "text-gray-200"}`}
                                aria-hidden="true"
                              />
                            </button>
                          ))}
                        </div>
                        <textarea
                          value={myReview}
                          onChange={(e) => setMyReview(e.target.value)}
                          placeholder="Optional notes"
                          rows={2}
                          className="mt-2 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none"
                        />
                        {feedbackError && <p className="text-xs text-red-600 mt-1">{feedbackError}</p>}
                        <button
                          onClick={submitFeedback}
                          disabled={submittingFeedback || myRating < 1}
                          className="mt-2 w-full px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 text-sm font-medium"
                        >
                          Submit Rating
                        </button>
                      </div>
                    )}

                    {otherFeedback && (
                      <div className="pt-3 border-t border-gray-100">
                        <p className="text-xs font-semibold text-gray-500 mb-1">
                          {otherFeedback.raterRole === "PATIENT" ? "Patient's rating" : "Care team's rating"}
                        </p>
                        <div className="flex gap-0.5">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <Star
                              key={n}
                              className={`size-4 ${n <= otherFeedback.rating ? "fill-amber-400 text-amber-400" : "text-gray-200"}`}
                              aria-hidden="true"
                            />
                          ))}
                        </div>
                        {otherFeedback.review && <p className="text-sm text-gray-600 mt-1.5">{otherFeedback.review}</p>}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
