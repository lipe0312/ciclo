// Autenticação (falha fechada):
// - App e /api: Cloudflare Access na borda + verificação do JWT aqui (defesa em profundidade).
// - /mcp: token Bearer próprio (o connector do claude.ai envia no cabeçalho), comparação em tempo constante.
// - Local: DEV_NO_AUTH=1 só funciona em requisições para localhost.
import type { Env } from "./env.ts";

type Jwk = JsonWebKey & { kid: string };
let certCache: { at: number; keys: Jwk[] } | null = null;

const b64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const json = (u8: Uint8Array) => JSON.parse(new TextDecoder().decode(u8));

async function accessKeys(team: string): Promise<Jwk[]> {
  if (certCache && Date.now() - certCache.at < 3600_000) return certCache.keys;
  const r = await fetch(`https://${team}/cdn-cgi/access/certs`, { cf: { cacheTtl: 3600 } } as RequestInit);
  if (!r.ok) throw new Error("certs");
  const keys = ((await r.json()) as { keys: Jwk[] }).keys;
  certCache = { at: Date.now(), keys };
  return keys;
}

export async function verifyAccess(req: Request, env: Env): Promise<{ email: string } | null> {
  const url = new URL(req.url);
  if (env.DEV_NO_AUTH === "1" && (url.hostname === "localhost" || url.hostname === "127.0.0.1")) return { email: "dev@localhost" };
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return null;
  const token = req.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) return null;
  const [h, p, s] = token.split(".");
  if (!h || !p || !s) return null;
  try {
    const header = json(b64url(h)) as { kid: string; alg: string };
    if (header.alg !== "RS256") return null;
    const jwk = (await accessKeys(env.ACCESS_TEAM_DOMAIN)).find((k) => k.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64url(s), new TextEncoder().encode(`${h}.${p}`));
    if (!ok) return null;
    const c = json(b64url(p)) as { aud: string | string[]; exp: number; iss: string; email?: string };
    const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
    if (!aud.includes(env.ACCESS_AUD)) return null;
    if (c.exp * 1000 < Date.now()) return null;
    if (c.iss !== `https://${env.ACCESS_TEAM_DOMAIN}`) return null;
    const allowed = (env.ALLOWED_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
    if (allowed.length && !allowed.includes((c.email ?? "").toLowerCase())) return null;
    return { email: c.email ?? "" };
  } catch {
    return null;
  }
}

async function digest(s: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
}

export async function verifyBearer(req: Request, secret: string | undefined): Promise<boolean> {
  if (!secret || secret.length < 32) return false; // exige token forte (openssl rand -hex 32)
  const got = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!got) return false;
  const [a, b] = [new Uint8Array(await digest(got)), new Uint8Array(await digest(secret))];
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
