import { api } from "./api";

// Browser-side half of device notifications. Nothing here runs until a signed-in user asks for it: the browser's
// permission prompt is triggered only from a click, never automatically.

export function pushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function pushPermission(): NotificationPermission | "unsupported" {
  return pushSupported() ? Notification.permission : "unsupported";
}

// VAPID keys are URL-safe base64; the browser wants raw bytes.
function keyToBytes(base64: string): Uint8Array {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function registration(): Promise<ServiceWorkerRegistration> {
  return (await navigator.serviceWorker.getRegistration("/")) ?? navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

// The subscription this browser already holds, if any.
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  return (await registration()).pushManager.getSubscription();
}

// Registers this browser's subscription for the signed-in user (moving it if someone else used the browser).
async function sendToServer(sub: PushSubscription) {
  const json = sub.toJSON();
  await api.post("/push/subscriptions", { endpoint: json.endpoint, keys: json.keys });
}

// Asks the browser for permission (must be called from a click), subscribes, and registers the device.
export async function enablePush(): Promise<"enabled" | "denied" | "unavailable"> {
  if (!pushSupported()) return "unavailable";
  const { publicKey } = await api.get<{ publicKey: string | null }>("/push/public-key");
  if (!publicKey) return "unavailable";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";
  const reg = await registration();
  const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(publicKey) as BufferSource });
  await sendToServer(sub);
  return "enabled";
}

// Turns notifications off for this device only: removed on the server first, then in the browser.
export async function disablePush(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  // api.del carries no body, and the server needs the endpoint to know which device to drop.
  await fetch("/api/push/subscriptions", { method: "DELETE", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {});
  await sub.unsubscribe();
}

// After sign-in, re-attach an already-granted subscription to whoever is signed in now, so a device keeps working
// for the current user without another prompt.
export async function resyncPush(): Promise<void> {
  if (!pushSupported() || Notification.permission !== "granted") return;
  const sub = await currentSubscription();
  if (sub) await sendToServer(sub).catch(() => {});
}
