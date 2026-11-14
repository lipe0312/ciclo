// Service worker: app abre sem sinal na academia. /assets/* (nomes com hash do Vite) e /img/* = cache primeiro;
// navegação = rede primeiro com o index.html em cache como reserva. /api e /mcp nunca são cacheados.
// #62: a versão muda a cada build (vite.config.ts troca o marcador pelo hash do bundle): o sw.js novo instala, assume e o app recarrega.
const V = "ciclo-__BUILD__";
const SHELL = ["/", "/index.html", "/icon.svg", "/apple-touch-icon.png", "/manifest.webmanifest"];
self.addEventListener("install", (e) => e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin || u.pathname.startsWith("/api/") || u.pathname.startsWith("/auth/") || u.pathname === "/mcp") return;
  if (e.request.mode === "navigate") {
    e.respondWith(fetch(e.request).then((r) => { const c = r.clone(); caches.open(V).then((x) => x.put("/index.html", c)); return r; }).catch(() => caches.match("/index.html")));
    return;
  }
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((r) => {
    if (r.ok && (u.pathname.startsWith("/img/") || u.pathname.startsWith("/assets/") || SHELL.includes(u.pathname))) { const c = r.clone(); caches.open(V).then((x) => x.put(e.request, c)); }
    return r;
  })));
});
// Web Push do fim do descanso (#25): o servidor manda um push SEM carga; o texto é fixo (nada de dado pessoal no push).
// iOS exige mostrar uma notificação a cada push; a mesma tag "rest" substitui a que o app mostra sozinho (sem duplicar).
self.addEventListener("push", (e) => e.waitUntil(self.registration.showNotification("Descanso acabou", { body: "Próxima série!", tag: "rest", renotify: true, vibrate: [300, 150, 300, 150, 300], icon: "/icon.svg", data: { url: "/#treino/ativo" } })));
self.addEventListener("notificationclick", (e) => { e.notification.close(); e.waitUntil(self.clients.matchAll({ type: "window" }).then((cs) => (cs[0] ? cs[0].focus() : self.clients.openWindow((e.notification.data && e.notification.data.url) || "/#treino")))); });
