self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
  const title = typeof data.title === "string" ? data.title : "OACA Compass update";
  const destination = typeof data.deepLink === "string" && data.deepLink.startsWith("/") ? data.deepLink : "/app/oaca";
  event.waitUntil(self.registration.showNotification(title, {
    body: "Open Compass for event details.",
    icon: "/assets/navigate-pathway-mark.svg",
    badge: "/assets/navigate-pathway-mark.svg",
    tag: typeof data.id === "string" ? data.id : "oaca-compass",
    renotify: false,
    data: { destination },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destination = event.notification.data?.destination || "/app/oaca";
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    const existing = clients.find((client) => "focus" in client);
    if (existing) { existing.navigate(destination); return existing.focus(); }
    return self.clients.openWindow(destination);
  }));
});
