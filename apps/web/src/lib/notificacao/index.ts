// Aviso do fim do descanso com a tela bloqueada: Web Push (VAPID) + service worker.
// Android Chrome: funciona no navegador e instalado. iPhone (iOS 16.4+): SÓ com o app instalado na Tela de Início (PWA);
// no Safari comum não existe notificação, então o app avisa e continua com vibração/apito na tela.
import { SERVER, api } from "../api/index.ts";

export type PushState = "ativo" | "pedir" | "negado" | "ios-fora-do-pwa" | "indisponivel" | "servidor-off";

const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const standalone = () => matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
const supported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

const fromB64u = (s: string) => {
  const t = s.replace(/-/g, "+").replace(/_/g, "/"), p = atob(t + "=".repeat((4 - (t.length % 4)) % 4));
  return Uint8Array.from(p, (c) => c.charCodeAt(0));
};
const toB64u = (b: ArrayBuffer | null) => (b ? btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") : "");

/** Estado atual (sem pedir nada). */
export async function pushState(): Promise<PushState> {
  if (!SERVER) return "indisponivel";
  if (isIos() && !standalone()) return "ios-fora-do-pwa";
  if (!supported()) return "indisponivel";
  if (Notification.permission === "denied") return "negado";
  try {
    const k = await api<{ publicKey: string | null }>("GET", "/api/push/key");
    if (!k.publicKey) return "servidor-off";
  } catch { /* offline: decide só pelo navegador */ }
  if (Notification.permission !== "granted") return "pedir";
  const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
  return sub ? "ativo" : "pedir";
}

/** Pede a permissão (precisa de um toque do usuário), assina o aparelho e registra no servidor. */
export async function enablePush(): Promise<PushState> {
  const st = await pushState();
  if (st === "ativo" || st !== "pedir") return st;
  try {
    if (Notification.permission === "default" && (await Notification.requestPermission()) !== "granted") return "negado";
    const { publicKey } = await api<{ publicKey: string | null }>("GET", "/api/push/key");
    if (!publicKey) return "servidor-off";
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromB64u(publicKey) }));
    await api("POST", "/api/push/subscribe", { endpoint: sub.endpoint, p256dh: toB64u(sub.getKey("p256dh")), auth: toB64u(sub.getKey("auth")) });
    return "ativo";
  } catch { return "indisponivel"; }
}

/** Garante que a assinatura (se já permitida) está no servidor; silencioso. */
export async function syncPush() { if (SERVER && supported() && Notification.permission === "granted") await enablePush().catch(() => {}); }

export const PUSH_TEXT: Record<PushState, string> = {
  ativo: "Aviso com a tela bloqueada: ligado.",
  pedir: "Ligue o aviso para o celular avisar o fim do descanso com a tela bloqueada.",
  negado: "Notificações bloqueadas neste navegador. Libere nas configurações do site para ser avisado com a tela bloqueada.",
  "ios-fora-do-pwa": "No iPhone o aviso com a tela bloqueada só funciona com o app instalado: Compartilhar → Adicionar à Tela de Início (iOS 16.4 ou mais novo) e abra pelo ícone. No Safari comum, o descanso vibra e apita só com a tela ligada.",
  indisponivel: "Este navegador não avisa com a tela bloqueada; o descanso vibra e apita com a tela ligada.",
  "servidor-off": "O servidor ainda não tem as chaves do aviso (VAPID). Veja docs/05-deploy-gratis.md.",
};
