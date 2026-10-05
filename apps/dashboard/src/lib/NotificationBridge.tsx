import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Bell, X } from "lucide-react";
import { getSocket } from "./socket";
import { useAuth } from "./auth";
import { enablePush, pushPermission, resyncPush } from "./push";

// What a live alert says on screen. Mirrors the server's generic wording; specifics are in the page itself.
const LIVE_TEXT: Record<string, string> = {
  NEW_MESSAGE: "You have a new message.",
  SLA_BREACH: "A conversation has passed its response time.",
  SPECIALIST_ESCALATION: "A patient escalation needs attention.",
  NURSING_CASE_SUBMITTED: "A nursing case is waiting for your review.",
  NURSING_CASE_REVIEWED: "One of your cases has been reviewed.",
  IDENTITY_MISMATCH_REPORTED: "A nurse reported an identity mismatch.",
  APPOINTMENT_CONFIRMED: "An appointment was confirmed.",
  APPOINTMENT_RESCHEDULED: "An appointment was rescheduled.",
  APPOINTMENT_SCHEDULED: "A new appointment was scheduled.",
  APPOINTMENT_REMINDER: "You have an upcoming appointment.",
  AVAILABILITY_CHANGED: "A consultant's availability changed.",
  INVOICE_PAID: "A payment was received.",
  LAB_RESULT_REVIEWED: "A lab result has been reviewed.",
  CONVERSATION_FEEDBACK: "You received feedback on a conversation.",
};

interface Toast { id: number; text: string }
const BANNER_DISMISSED_KEY = "oncoflow.pushBannerDismissed";

// Fired on window for every live notification, so any page can refresh itself without its own socket wiring.
export const NOTIFICATION_EVENT = "oncoflow:notification";

const PushStateContext = createContext<{ permission: NotificationPermission | "unsupported"; refresh: () => void }>({ permission: "unsupported", refresh: () => {} });
export const usePushState = () => useContext(PushStateContext);

// Mounted once for every signed-in staff user: keeps one socket alive, shows live alerts as toasts, re-attaches
// this device's push registration to whoever is signed in, and offers device notifications once.
export function NotificationBridge({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [permission, setPermission] = useState(pushPermission());
  const [bannerHidden, setBannerHidden] = useState(() => { try { return localStorage.getItem(BANNER_DISMISSED_KEY) === "1"; } catch { return false; } });
  const nextId = useRef(1);
  const userId = user?.id ?? null;

  const refresh = useCallback(() => setPermission(pushPermission()), []);

  useEffect(() => {
    if (!userId) return;
    const socket = getSocket();
    // The socket authenticates by cookie at handshake, so it reconnects when the signed-in user changes.
    if (socket.connected) socket.disconnect();
    socket.connect();
    const onNotification = (n: { type?: string }) => {
      window.dispatchEvent(new CustomEvent(NOTIFICATION_EVENT, { detail: n }));
      const id = nextId.current++;
      setToasts((t) => [...t.slice(-3), { id, text: LIVE_TEXT[n.type ?? ""] ?? "You have a new notification." }]);
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 7000);
    };
    socket.on("notification:new", onNotification);
    void resyncPush();
    return () => { socket.off("notification:new", onNotification); };
  }, [userId]);

  async function turnOn() {
    try { await enablePush(); } finally { refresh(); }
  }
  function dismissBanner() {
    setBannerHidden(true);
    try { localStorage.setItem(BANNER_DISMISSED_KEY, "1"); } catch { /* per-viewer convenience only */ }
  }

  return (
    <PushStateContext.Provider value={{ permission, refresh }}>
      {children}
      {userId && permission === "default" && !bannerHidden && (
        <div role="region" aria-label="Enable notifications" className="fixed bottom-4 left-4 z-50 flex max-w-sm items-start gap-3 rounded-admin-md border border-admin-border bg-white p-4 shadow-lg">
          <Bell className="mt-0.5 size-5 shrink-0 text-admin-sidebar-cta" aria-hidden="true" />
          <div className="text-admin-body-sm text-admin-text">
            <p className="font-semibold">Get alerts on this device</p>
            <p className="mt-0.5 text-admin-text-secondary">Be told about new messages and escalations even when OncoFlow is closed. Alerts never show patient details.</p>
            <div className="mt-3 flex gap-2">
              <button onClick={() => void turnOn()} className="rounded-admin-sm bg-admin-sidebar-cta px-3 py-1.5 text-admin-body-sm text-white">Turn on</button>
              <button onClick={dismissBanner} className="rounded-admin-sm px-3 py-1.5 text-admin-body-sm text-admin-text-secondary hover:bg-admin-card-alt">Not now</button>
            </div>
          </div>
        </div>
      )}
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto flex items-start gap-2 rounded-admin-md border border-admin-border bg-white p-3 shadow-lg">
            <Bell className="mt-0.5 size-4 shrink-0 text-admin-sidebar-cta" aria-hidden="true" />
            <p className="flex-1 text-admin-body-sm text-admin-text">{t.text}</p>
            <button onClick={() => setToasts((all) => all.filter((x) => x.id !== t.id))} aria-label="Dismiss" className="text-admin-text-secondary hover:text-admin-text"><X className="size-4" /></button>
          </div>
        ))}
      </div>
    </PushStateContext.Provider>
  );
}
