"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, X, Send } from "lucide-react";
import { api } from "@/lib/api";
import { loadStoredInquiry, saveStoredInquiry, type StoredInquiry } from "@/lib/publicInquiry";
import type { PublicInquiry, PublicInquiryMessage } from "@/lib/types";

const BACKGROUND_POLL_MS = 20_000;
const OPEN_POLL_MS = 6_000;

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [stored, setStored] = useState<StoredInquiry | null>(() => loadStoredInquiry());
  const [inquiry, setInquiry] = useState<PublicInquiry | null>(null);
  const [messages, setMessages] = useState<PublicInquiryMessage[]>([]);
  const [hasUnread, setHasUnread] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [firstMessage, setFirstMessage] = useState("");
  const [draft, setDraft] = useState("");

  const threadEndRef = useRef<HTMLDivElement>(null);

  // Background check for a new staff reply, so the bubble can show an unread dot even
  // while the panel is closed — no push infra, so a light poll is the honest substitute.
  useEffect(() => {
    if (!stored || open) return;
    const check = async () => {
      try {
        const res = await api.get<{ inquiry: PublicInquiry; messages: PublicInquiryMessage[] }>(
          `/public-inquiries/${stored.inquiryId}/messages?token=${stored.token}`,
        );
        if (res.messages.length > stored.lastSeenCount) setHasUnread(true);
      } catch {
        /* stale/invalid token — silently ignore, intake form will offer a fresh start if opened */
      }
    };
    check();
    const interval = setInterval(check, BACKGROUND_POLL_MS);
    return () => clearInterval(interval);
  }, [stored, open]);

  const fetchThread = async (target: StoredInquiry) => {
    const res = await api.get<{ inquiry: PublicInquiry; messages: PublicInquiryMessage[] }>(
      `/public-inquiries/${target.inquiryId}/messages?token=${target.token}`,
    );
    setInquiry(res.inquiry);
    setMessages(res.messages);
    setHasUnread(false);
    const updated = { ...target, lastSeenCount: res.messages.length };
    saveStoredInquiry(updated);
    setStored(updated);
  };

  async function handleOpen() {
    setOpen(true);
    setError(null);
    if (!stored) return;
    setLoading(true);
    try {
      await fetchThread(stored);
    } catch {
      // Token no longer valid (e.g. dev DB reset) — fall back to a fresh intake form.
      setInquiry(null);
    } finally {
      setLoading(false);
    }
  }

  // Poll for replies while the panel is open and a thread is loaded.
  useEffect(() => {
    if (!open || !stored || !inquiry) return;
    const interval = setInterval(() => fetchThread(stored), OPEN_POLL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, stored?.inquiryId, !!inquiry]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function startInquiry() {
    if (!name.trim() || !contact.trim() || !firstMessage.trim()) return;
    setSending(true);
    setError(null);
    try {
      const isEmail = contact.includes("@");
      const res = await api.post<{ inquiry: PublicInquiry; accessToken: string; message: PublicInquiryMessage }>(
        "/public-inquiries",
        {
          name: name.trim(),
          ...(isEmail ? { email: contact.trim() } : { phone: contact.trim() }),
          message: firstMessage.trim(),
        },
      );
      const newStored: StoredInquiry = { inquiryId: res.inquiry.id, token: res.accessToken, lastSeenCount: 1 };
      saveStoredInquiry(newStored);
      setStored(newStored);
      setInquiry(res.inquiry);
      setMessages([res.message]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start the chat — please try again.");
    } finally {
      setSending(false);
    }
  }

  async function sendFollowUp() {
    if (!stored || !draft.trim()) return;
    setSending(true);
    setError(null);
    try {
      const res = await api.post<{ message: PublicInquiryMessage }>(`/public-inquiries/${stored.inquiryId}/messages`, {
        token: stored.token,
        content: draft.trim(),
      });
      setMessages((prev) => {
        const next = [...prev, res.message];
        saveStoredInquiry({ ...stored, lastSeenCount: next.length });
        return next;
      });
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Message failed to send — please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <button
        onClick={() => (open ? setOpen(false) : handleOpen())}
        aria-label={open ? "Close chat" : "Chat with us"}
        className="fixed bottom-6 right-6 z-50 flex size-14 items-center justify-center rounded-full bg-primary text-white shadow-lg transition-transform duration-fast hover:scale-105"
      >
        {open ? <X className="size-6" aria-hidden="true" /> : <MessageCircle className="size-6" aria-hidden="true" />}
        {hasUnread && !open && (
          <span className="absolute -right-0.5 -top-0.5 size-3.5 rounded-full border-2 border-surface bg-critical" aria-hidden="true" />
        )}
      </button>

      {open && (
        <div className="fixed bottom-24 right-6 z-50 flex h-[520px] max-h-[70vh] w-[360px] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-surface shadow-xl">
          <div className="flex items-center justify-between bg-primary px-4 py-3 text-white">
            <div>
              <p className="text-sm font-bold">Chat with OncoFlow</p>
              <p className="text-xs text-white/70">We typically reply within a few minutes</p>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close chat" className="text-white/80 hover:text-white">
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>

          {loading ? (
            <div className="flex flex-1 items-center justify-center text-sm text-neutral-400">Loading…</div>
          ) : !inquiry ? (
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              <p className="text-sm text-neutral-600">
                Tell us a bit about yourself and what you need — a real team member will reply here.
              </p>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary-50"
              />
              <input
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="Email or phone number"
                className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary-50"
              />
              <textarea
                value={firstMessage}
                onChange={(e) => setFirstMessage(e.target.value)}
                placeholder="How can we help?"
                rows={3}
                className="w-full resize-none rounded-xl border border-neutral-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary-50"
              />
              {error && <p className="text-xs text-critical">{error}</p>}
              <button
                onClick={startInquiry}
                disabled={sending || !name.trim() || !contact.trim() || !firstMessage.trim()}
                className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {sending ? "Starting…" : "Start Chat"}
              </button>
            </div>
          ) : (
            <>
              <div className="flex-1 space-y-2.5 overflow-y-auto p-4">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${
                      m.senderType === "VISITOR" ? "ml-auto bg-primary text-white" : "bg-neutral-100 text-neutral-800"
                    }`}
                  >
                    <p>{m.content}</p>
                    <p className={`mt-0.5 text-[10px] ${m.senderType === "VISITOR" ? "text-white/60" : "text-neutral-400"}`}>
                      {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                ))}
                <div ref={threadEndRef} />
              </div>
              {error && <p className="px-4 pb-1 text-xs text-critical">{error}</p>}
              {inquiry.status === "CLOSED" && (
                <p className="px-4 pb-1 text-xs text-neutral-400">
                  This chat was marked resolved — sending a message will reopen it.
                </p>
              )}
              <div className="flex items-center gap-2 border-t border-neutral-200 p-3">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendFollowUp()}
                  placeholder="Type a message…"
                  className="flex-1 rounded-xl border border-neutral-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary-50"
                />
                <button
                  onClick={sendFollowUp}
                  disabled={sending || !draft.trim()}
                  aria-label="Send"
                  className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-white disabled:opacity-50"
                >
                  <Send className="size-4" aria-hidden="true" />
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
