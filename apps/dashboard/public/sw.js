// Service worker for OncoFlow device notifications. It only ever shows what the server sent: a generic title
// and body (no patient details) and a path to open. Specifics appear inside the app after sign-in.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
  const title = data.title || "OncoFlow";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "You have a new notification.",
      // Same tag replaces the previous alert of that kind rather than stacking dozens of them.
      tag: data.tag || "oncoflow",
      renotify: true,
      icon: "/oncoflow-logo.svg",
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of all) {
      if ("focus" in client) { await client.focus(); if ("navigate" in client) await client.navigate(url); return; }
    }
    await self.clients.openWindow(url);
  })());
});
