// Service worker: app abre sem sinal na academia. /assets/* (nomes com hash do Vite) e /img/* = cache primeiro;
// navegação = rede primeiro com o index.html em cache como reserva. /api e /mcp nunca são cacheados.
// #66: v0.3.0 limpa caches antigos que possam ter guardado o index.html no lugar de um chunk (ver abaixo).
const V = "ciclo-v0.3.0";
const SHELL = ["/", "/index.html", "/icon.svg", "/manifest.webmanifest"];
self.addEventListener("install", (e) => e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin || u.pathname.startsWith("/api/") || u.pathname.startsWith("/oauth/") || u.pathname === "/autorizar" || u.pathname === "/mcp") return;
  if (e.request.mode === "navigate") {
    e.respondWith(fetch(e.request).then((r) => { const c = r.clone(); caches.open(V).then((x) => x.put("/index.html", c)); return r; }).catch(() => caches.match("/index.html")));
    return;
  }
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((r) => {
    // #66: chunk que sumiu num deploy volta como index.html (200, fallback de SPA). Guardar isso quebraria o import()
    // do pdf.js para sempre (MIME text/html). Em /assets/* só entra no cache o que não é HTML.
    const html = (r.headers.get("Content-Type") || "").includes("text/html");
    if (r.ok && !(html && u.pathname.startsWith("/assets/")) && (u.pathname.startsWith("/img/") || u.pathname.startsWith("/assets/") || SHELL.includes(u.pathname))) { const c = r.clone(); caches.open(V).then((x) => x.put(e.request, c)); }
    return r;
  })));
});
// Web Push do fim do descanso (#25): o servidor manda um push SEM carga; o texto é fixo (nada de dado pessoal no push).
// iOS exige mostrar uma notificação a cada push; a mesma tag "rest" substitui a que o app mostra sozinho (sem duplicar).
self.addEventListener("push", (e) => e.waitUntil(self.registration.showNotification("Descanso acabou", { body: "Próxima série!", tag: "rest", renotify: true, vibrate: [300, 150, 300, 150, 300], icon: "/icon.svg", data: { url: "/#treino/ativo" } })));
self.addEventListener("notificationclick", (e) => { e.notification.close(); e.waitUntil(self.clients.matchAll({ type: "window" }).then((cs) => (cs[0] ? cs[0].focus() : self.clients.openWindow((e.notification.data && e.notification.data.url) || "/#treino")))); });
