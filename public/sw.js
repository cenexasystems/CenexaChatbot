self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "Cenexa ChatFlow";
  const options = {
    body: payload.body || "A customer needs your attention.",
    icon: "/brand/cenexa-mark.png",
    badge: "/brand/cenexa-mark.png",
    data: { url: payload.url || "/today" },
    tag: payload.tag || "cenexa-owner-alert",
    renotify: true,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const requestedUrl = new URL(event.notification.data?.url || "/today", self.location.origin);
  const targetUrl = requestedUrl.origin === self.location.origin ? requestedUrl.href : new URL("/today", self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => client.url.startsWith(self.location.origin));
      if (existing) {
        existing.navigate(targetUrl);
        return existing.focus();
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
