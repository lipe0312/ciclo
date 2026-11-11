// Web Push do fim do descanso (tela bloqueada). Sem dependência: JWT VAPID (ES256) com Web Crypto e envio SEM carga
// (o service worker mostra o texto fixo "Descanso acabou"), então não há criptografia de payload nem dado pessoal no push.
// Agendamento: cron de 1 min (grátis) varre `rest_timer`; atraso máximo ≈ 1 min. Durable Object Alarm seria exato, mas
// exige classe + migração de DO; para descansos de 60–180 s o cron basta (ver docs/05-deploy-gratis.md).
import type { Env } from "./env.ts";

/** O endpoint vem do navegador do usuário e o Worker faz POST nele: só serviços de push conhecidos (evita SSRF). */
const PUSH_HOSTS: RegExp[] = [
  /^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /^[a-z0-9-]+\.push\.apple\.com$/, /^[a-z0-9.-]+\.notify\.windows\.com$/,
];
export function validEndpoint(s: unknown): s is string {
  if (typeof s !== "string" || s.length > 700) return false;
  let u: URL;
  try { u = new URL(s); } catch { return false; }
  return u.protocol === "https:" && !u.username && !u.password && !u.port && PUSH_HOSTS.some((re) => re.test(u.hostname));
}

const enc = new TextEncoder();
export const b64u = (b: ArrayBuffer | Uint8Array) => {
  const a = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = ""; for (const x of a) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
export const fromB64u = (s: string) => {
  const t = s.replace(/-/g, "+").replace(/_/g, "/"), p = atob(t + "=".repeat((4 - (t.length % 4)) % 4));
  return Uint8Array.from(p, (c) => c.charCodeAt(0));
};

export const pushEnabled = (env: Env) => !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);

/** Cabeçalho `Authorization: vapid t=<jwt>, k=<chave pública>` (RFC 8292) para o serviço do `endpoint`. */
export async function vapidAuth(env: Env, endpoint: string, nowMs = Date.now()): Promise<string> {
  const pub = fromB64u(env.VAPID_PUBLIC_KEY!), d = env.VAPID_PRIVATE_KEY!;
  if (pub.length !== 65 || pub[0] !== 4) throw new Error("VAPID_PUBLIC_KEY inválida");
  const key = await crypto.subtle.importKey("jwk", { kty: "EC", crv: "P-256", x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33)), d, ext: true }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const head = b64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = b64u(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(nowMs / 1000) + 12 * 3600, sub: env.VAPID_SUBJECT || "mailto:ciclo@example.com" })));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(`${head}.${body}`));
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${env.VAPID_PUBLIC_KEY}`;
}

/** Envia o push vazio (sem seguir redirecionamentos: o destino validado é o único que recebe a chamada). Devolve o status HTTP (404/410 = assinatura morta). Erro de rede = 0. */
export async function sendPush(env: Env, endpoint: string): Promise<number> {
  if (!validEndpoint(endpoint)) return 400;
  try {
    const r = await fetch(endpoint, { method: "POST", redirect: "manual", headers: { Authorization: await vapidAuth(env, endpoint), TTL: "120", Urgency: "high", "Content-Length": "0" } });
    return r.status;
  } catch { return 0; }
}

/** Cron de 1 min: manda o push de cada descanso vencido (só para a conta dona do timer) e marca como enviado. */
export async function sendDueRests(env: Env, now = Date.now()): Promise<number> {
  if (!pushEnabled(env)) return 0;
  const { results } = await env.DB.prepare(`SELECT r.user_id, p.endpoint FROM rest_timer r
      JOIN push_subscription p ON p.user_id = r.user_id
      JOIN session s ON s.user_id = r.user_id AND s.id = r.session_id AND s.finished_at IS NULL
    WHERE r.sent_at IS NULL AND r.fire_at <= ?1 AND r.fire_at > ?2 LIMIT 200`).bind(now, now - 10 * 60_000).all<{ user_id: string; endpoint: string }>();
  let sent = 0;
  const claimed = new Set<string>();
  for (const row of results) {
    if (!claimed.has(row.user_id)) {
      const c = await env.DB.prepare("UPDATE rest_timer SET sent_at = ?2 WHERE user_id = ?1 AND sent_at IS NULL AND fire_at <= ?2").bind(row.user_id, now).run();
      if (!c.meta.changes) continue;
      claimed.add(row.user_id);
    }
    const st = await sendPush(env, row.endpoint);
    if (st >= 200 && st < 300) sent++;
    else if (st === 404 || st === 410) await env.DB.prepare("DELETE FROM push_subscription WHERE user_id = ?1 AND endpoint = ?2").bind(row.user_id, row.endpoint).run();
  }
  await env.DB.prepare("DELETE FROM rest_timer WHERE fire_at < ?1").bind(now - 24 * 3600_000).run();
  return sent;
}
