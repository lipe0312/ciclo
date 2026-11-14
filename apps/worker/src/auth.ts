// Autenticação (falha fechada) e contas:
// - App e /api (#54): 1º a sessão própria (cookie __Host-ciclo, criada por passkey ou código de recuperação; auth-conta.ts);
//   2º, durante a transição, o JWT do Cloudflare Access, se os secrets existirem (verificado aqui; e-mail em ALLOWED_EMAILS).
//   Sem os secrets ACCESS_* o caminho do Access simplesmente não existe (falha fechada).
// - /mcp e /mcp/media: token do Claude POR USUÁRIO (tabela mcp_token, só o hash SHA-256), comparação em tempo constante.
//   #66: a chave manual (#55) ou o token de acesso OAuth (1 h, expires_at; oauth.ts), no mesmo formato.
// - Local: DEV_NO_AUTH=1 só em localhost/127.0.0.1; usuário de dev pelo cabeçalho x-dev-user ou cookie ciclo_dev_user.
//   O MCP_TOKEN global vale só aí, como bootstrap do usuário de dev "dev".
import { maxUsers, tokenValido } from "@ciclo/core";
import type { AuthUser, Env } from "./env.ts";
import { authenticateSession } from "./auth-conta.ts";

type Jwk = JsonWebKey & { kid: string };
let certCache: { team: string; at: number; keys: Jwk[] } | null = null;

const b64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const parseJson = (u8: Uint8Array) => JSON.parse(new TextDecoder().decode(u8));
const hex = (buf: ArrayBuffer | Uint8Array) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

export const DEV_USER_RE = /^[a-z0-9_-]{1,32}$/;
export const DEV_DEFAULT_USER = "dev";
export const devEmail = (slug: string) => `${slug}@dev.localhost`;
const LAST_SEEN_EVERY_MS = 5 * 60_000;

export function isLocalDev(req: Request, env: Env): boolean {
  const host = new URL(req.url).hostname;
  return env.DEV_NO_AUTH === "1" && (host === "localhost" || host === "127.0.0.1");
}

export function cookie(req: Request, name: string): string | null {
  for (const part of (req.headers.get("Cookie") ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

async function accessKeys(team: string): Promise<Jwk[]> {
  if (certCache && certCache.team === team && Date.now() - certCache.at < 3600_000) return certCache.keys;
  const r = await fetch(`https://${team}/cdn-cgi/access/certs`, { cf: { cacheTtl: 3600 } } as RequestInit);
  if (!r.ok) throw new Error("certs");
  const keys = ((await r.json()) as { keys: Jwk[] }).keys;
  certCache = { team, at: Date.now(), keys };
  return keys;
}

export const allowedEmails = (env: Env) => (env.ALLOWED_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

/** E-mail verificado da requisição (sem tocar no banco) ou null. */
export async function verifyAccess(req: Request, env: Env): Promise<{ email: string } | null> {
  if (isLocalDev(req, env)) {
    const slug = req.headers.get("x-dev-user") ?? cookie(req, "ciclo_dev_user") ?? DEV_DEFAULT_USER;
    return DEV_USER_RE.test(slug) ? { email: devEmail(slug) } : null;
  }
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return null;
  const token = req.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) return null;
  const [h, p, s] = token.split(".");
  if (!h || !p || !s) return null;
  try {
    const header = parseJson(b64url(h)) as { kid: string; alg: string };
    if (header.alg !== "RS256") return null;
    const jwk = (await accessKeys(env.ACCESS_TEAM_DOMAIN)).find((k) => k.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64url(s), new TextEncoder().encode(`${h}.${p}`));
    if (!ok) return null;
    const c = parseJson(b64url(p)) as { aud: string | string[]; exp: number; iss: string; email?: string };
    const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
    if (!aud.includes(env.ACCESS_AUD)) return null;
    if (typeof c.exp !== "number" || c.exp * 1000 < Date.now()) return null;
    if (c.iss !== `https://${env.ACCESS_TEAM_DOMAIN}`) return null;
    const email = (c.email ?? "").trim().toLowerCase();
    // ALLOWED_EMAILS controla quem cria e usa conta em produção; lista vazia = ninguém (falha fechada).
    if (!email || !allowedEmails(env).includes(email)) return null;
    return { email };
  } catch {
    return null;
  }
}

export type UserRow = { id: string; email: string; name: string | null; role: "owner" | "user"; created_at: number; last_seen_at: number | null; onboarding_done_at: number | null; deleted_at: number | null };
export const userRowToAuth = (u: UserRow): AuthUser => ({ id: u.id, email: u.email, name: u.name, role: u.role, createdAt: u.created_at, onboardingDoneAt: u.onboarding_done_at });

/** Acha ou cria a conta do e-mail (primeiro acesso) e atualiza last_seen_at (no máx. a cada 5 min).
 *  Criar respeita o teto de contas (#54) no mesmo INSERT: com o teto cheio, a conta nova não nasce (401). */
export async function userForEmail(env: Env, email: string, now = Date.now()): Promise<AuthUser | null> {
  const sel = env.DB.prepare("SELECT id, email, name, role, created_at, last_seen_at, onboarding_done_at, deleted_at FROM user WHERE email = ?1").bind(email);
  let u = await sel.first<UserRow>();
  if (!u) {
    await env.DB.prepare("INSERT INTO user (id, email, created_at, last_seen_at) SELECT ?1, ?2, ?3, ?3 WHERE (SELECT COUNT(*) FROM user) < ?4 ON CONFLICT(email) DO NOTHING")
      .bind(crypto.randomUUID(), email, now, maxUsers(env.MAX_USERS)).run();
    u = await sel.first<UserRow>();
  }
  if (!u || u.deleted_at != null) return null;
  await touchUser(env, u, now);
  return userRowToAuth(u);
}

export async function touchUser(env: Env, u: Pick<UserRow, "id" | "last_seen_at">, now: number) {
  if (u.last_seen_at != null && now - u.last_seen_at < LAST_SEEN_EVERY_MS) return;
  await env.DB.prepare("UPDATE user SET last_seen_at = ?2 WHERE id = ?1").bind(u.id, now).run();
}

/** Quem está chamando /api: sessão própria → dev local → JWT do Access (transição). `setCookie` = sessão renovada. */
export async function authenticateApi(req: Request, env: Env): Promise<{ user: AuthUser; setCookie?: string } | null> {
  const s = await authenticateSession(req, env);
  if (s) return s;
  const who = await verifyAccess(req, env);
  const u = who ? await userForEmail(env, who.email) : null;
  return u ? { user: { ...u, via: isLocalDev(req, env) ? "dev" : "access" } } : null;
}

// ---- tokens do Claude (MCP) ----
// Formato: ciclo_<id 16 hex>_<segredo 64 hex>. Busca pela parte pública (id) e compara o hash do token inteiro
// em tempo constante; sem linha, compara com um hash fictício para o tempo não revelar se o id existe.
const TOKEN_RE = /^ciclo_([0-9a-f]{16})_[0-9a-f]{64}$/;
const DUMMY_HASH = "0".repeat(64);

export async function sha256Hex(s: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
}

/** Comparação em tempo constante de duas strings hex de mesmo tamanho (SHA-256). */
export function timingSafeEqualHex(a: string, b: string): boolean {
  const [x, y] = [new TextEncoder().encode(a), new TextEncoder().encode(b)];
  let diff = x.length ^ y.length;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ (y[i] ?? 0);
  return diff === 0;
}

export async function newMcpToken(): Promise<{ id: string; token: string; hash: string }> {
  const rnd = (n: number) => hex(crypto.getRandomValues(new Uint8Array(n)));
  const id = rnd(8), token = `ciclo_${id}_${rnd(32)}`;
  return { id, token, hash: await sha256Hex(token) };
}

const bearer = (req: Request) => (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();

export async function authenticateMcp(req: Request, env: Env, now = Date.now()): Promise<AuthUser | null> {
  const got = bearer(req);
  if (!got) return null;
  const gotHash = await sha256Hex(got);
  const m = TOKEN_RE.exec(got);
  if (m) {
    const row = await env.DB.prepare(`SELECT t.id AS token_id, t.hash, t.created_at AS token_created_at, t.last_used_at, u.id, u.email, u.name, u.role, u.created_at, u.onboarding_done_at, u.last_seen_at, u.deleted_at
      FROM mcp_token t JOIN user u ON u.id = t.user_id WHERE t.id = ?1 AND t.revoked_at IS NULL AND (t.expires_at IS NULL OR t.expires_at > ?2)`).bind(m[1], now)
      .first<UserRow & { token_id: string; hash: string; token_created_at: number; last_used_at: number | null }>();
    const ok = timingSafeEqualHex(gotHash, row?.hash ?? DUMMY_HASH);
    if (!row || !ok || row.deleted_at != null) return null;
    // #55: token sem uso há 90 dias expira (regra no core); revogado já ficou fora do SELECT
    if (!tokenValido({ createdAt: row.token_created_at, lastUsedAt: row.last_used_at, revokedAt: null }, now)) return null;
    if (row.last_used_at == null || now - row.last_used_at >= 60_000) {
      await env.DB.prepare("UPDATE mcp_token SET last_used_at = ?2 WHERE id = ?1").bind(row.token_id, now).run();
    }
    await touchUser(env, row, now);
    return { ...userRowToAuth(row), via: "mcp" };
  }
  // Bootstrap local: MCP_TOKEN global → usuário de dev padrão. Nunca fora de localhost com DEV_NO_AUTH=1.
  if (isLocalDev(req, env) && env.MCP_TOKEN && env.MCP_TOKEN.length >= 32) {
    if (timingSafeEqualHex(gotHash, await sha256Hex(env.MCP_TOKEN))) return userForEmail(env, devEmail(DEV_DEFAULT_USER), now);
  }
  return null;
}
