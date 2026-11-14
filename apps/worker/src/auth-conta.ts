// #54 Conta própria: login por passkey (WebAuthn verificado com WebCrypto, ES256/RS256), convite de uso único,
// teto de contas, sessão de 90 dias no cookie __Host-ciclo, códigos de recuperação e gestão de aparelhos/pessoas.
// Regras puras no core (packages/core/src/conta.ts). Aqui: SQL (sempre com bind e user_id), cookie e criptografia.
// Convivência com o Cloudflare Access: ver authenticateApi em auth.ts e docs/05-deploy-gratis.md.
import {
  INVITE_LEN, INVITE_MS, INVITE_MSG, RECOVERY_COUNT, RECOVERY_LEN, SESSION_MS, aparelhoDe, b64urlDecode, b64urlEncode, backupEligible,
  cborDecode, checkClientData, codeFromBytes, coseToJwk, counterOk, derToRawEcdsa, formatCode, inviteState, maxUsers, nomeValido,
  normalizeCode, parseAuthData, sessionAlive, sessionRenewal, vagas,
} from "@ciclo/core";
import type { Jwk } from "@ciclo/core";
import type { AuthUser, Env } from "./env.ts";
import { HttpError, json, readJson, str } from "./http.ts";
import { cookie, sha256Hex, timingSafeEqualHex, touchUser, userRowToAuth } from "./auth.ts";
import type { UserRow } from "./auth.ts";
import type { Handler } from "./comida.ts";
import { segredosFaltando, webauthnWhere } from "./ambiente.ts";

export const SESSION_COOKIE = "__Host-ciclo";
const CHALLENGE_MS = 5 * 60_000;
const MAX_PASSKEYS = 10;
const SEEN_EVERY_MS = 5 * 60_000;
/** Tentativas em /auth/* por IP (janela fixa). A proteção ampla (Turnstile etc.) é a #56. */
export const AUTH_LIMIT = { max: 30, windowMs: 10 * 60_000 } as const;

const te = new TextEncoder();
const rnd = (n: number) => crypto.getRandomValues(new Uint8Array(n));
const hex = (u8: Uint8Array) => [...u8].map((b) => b.toString(16).padStart(2, "0")).join("");
const sha = async (u8: Uint8Array) => new Uint8Array(await crypto.subtle.digest("SHA-256", u8));
const eqBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);
const syntheticEmail = (uid: string) => `p-${uid.replace(/-/g, "")}@passkey.invalid`;

export const sessionCookie = (token: string, maxAgeMs = SESSION_MS) =>
  `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.floor(maxAgeMs / 1000)}`;
export const CLEAR_SESSION = `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

const countUsers = async (env: Env) => (await env.DB.prepare("SELECT COUNT(*) AS n FROM user").first<{ n: number }>())?.n ?? 0;
export const maxUsersOf = (env: Env) => maxUsers(env.MAX_USERS);

// ---- sessão ----
/** Prepara a sessão nova (o INSERT vai dentro do batch de quem chama) e devolve o cookie. `cond` amarra o INSERT a uma condição SQL. */
async function sessionStmt(env: Env, uid: string, req: Request, via: "passkey" | "recuperacao", now: number, cond = "1", condArgs: unknown[] = []) {
  const token = hex(rnd(32)), h = await sha256Hex(token), sid = hex(rnd(8));
  const ua = (req.headers.get("User-Agent") ?? "").slice(0, 300) || null;
  const base = 7; // ?1..?6 abaixo; as condições usam ?7 em diante
  const stmt = env.DB.prepare(`INSERT INTO sessions (id_hash, id, user_id, created_at, expires_at, last_seen_at, user_agent, via)
    SELECT ?1, ?2, ?3, ?4, ?5, ?4, ?6, '${via}' WHERE ${cond.replace(/\?(\d+)/g, (_m, n) => `?${Number(n) + base - 1}`)}`)
    .bind(h, sid, uid, now, now + SESSION_MS, ua, ...condArgs);
  return { stmt, cookie: sessionCookie(token), sid };
}

/** Usuário da sessão do cookie (renovada no uso) ou null. Nunca lança por cookie malformado. */
export async function authenticateSession(req: Request, env: Env, now = Date.now()): Promise<{ user: AuthUser; setCookie?: string } | null> {
  const token = cookie(req, SESSION_COOKIE);
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  const row = await env.DB.prepare(`SELECT s.id AS sid, s.expires_at, s.last_seen_at AS s_seen, u.id, u.email, u.name, u.role, u.created_at, u.last_seen_at, u.onboarding_done_at, u.deleted_at
    FROM sessions s JOIN user u ON u.id = s.user_id WHERE s.id_hash = ?1`).bind(await sha256Hex(token))
    .first<UserRow & { sid: string; expires_at: number; s_seen: number | null }>();
  if (!row || row.deleted_at != null || !sessionAlive(row.expires_at, now)) return null;
  const renew = sessionRenewal(row.expires_at, now);
  if (renew) await env.DB.prepare("UPDATE sessions SET expires_at = ?2, last_seen_at = ?3 WHERE id = ?1 AND user_id = ?4").bind(row.sid, renew, now, row.id).run();
  else if (row.s_seen == null || now - row.s_seen >= SEEN_EVERY_MS) await env.DB.prepare("UPDATE sessions SET last_seen_at = ?2 WHERE id = ?1 AND user_id = ?3").bind(row.sid, now, row.id).run();
  await touchUser(env, row, now);
  return { user: { ...userRowToAuth(row), via: "sessao", sessionId: row.sid }, setCookie: renew ? sessionCookie(token) : undefined };
}

// ---- limite de tentativas (/auth/*) ----
/** Pepper do HMAC do IP: secret AUTH_PEPPER (recomendado); sem ele, o OWNER_SETUP_CODE; em último caso, fixo (só dev/teste). */
const pepperOf = (env: Env) => env.AUTH_PEPPER || env.OWNER_SETUP_CODE || "ciclo-auth-dev";
async function hmacHex(key: string, msg: string) {
  const k = await crypto.subtle.importKey("raw", te.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(new Uint8Array(await crypto.subtle.sign("HMAC", k, te.encode(msg))));
}
export async function hitAuthLimit(env: Env, req: Request, now = Date.now()): Promise<number> {
  const ip = req.headers.get("CF-Connecting-IP") ?? "local";
  const key = "ip:" + (await hmacHex(pepperOf(env), ip)).slice(0, 32); // nunca o IP puro nem um hash adivinhável
  const { max, windowMs } = AUTH_LIMIT, w = now - (now % windowMs);
  const r = await env.DB.prepare(`INSERT INTO auth_rate_limit (key, window_start, count) VALUES (?1, ?2, 1)
    ON CONFLICT(key) DO UPDATE SET count = CASE WHEN window_start = ?2 THEN count + 1 ELSE 1 END, window_start = ?2 RETURNING count`)
    .bind(key, w).first<{ count: number }>();
  return (r?.count ?? 0) > max ? Math.ceil((w + windowMs - now) / 1000) : 0;
}

// ---- desafio WebAuthn ----
type ChallengeData = { mode?: "convite" | "reset" | "bootstrap" | "adicionar"; uid?: string; nome?: string; invite?: string; email?: string | null; nova?: boolean };
async function newChallenge(env: Env, kind: "login" | "registro", uid: string | null, data: ChallengeData, now: number) {
  const challenge = b64urlEncode(rnd(32)), id = hex(rnd(16));
  await env.DB.batch([
    env.DB.prepare("DELETE FROM auth_challenge WHERE expires_at <= ?1").bind(now),
    env.DB.prepare("INSERT INTO auth_challenge (id, challenge, kind, user_id, data, expires_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)")
      .bind(id, challenge, kind, uid, JSON.stringify(data), now + CHALLENGE_MS),
  ]);
  return { id, challenge };
}
/** Consome o desafio (uso único): some do banco na primeira tentativa, certa ou errada. */
async function takeChallenge(env: Env, id: unknown, kind: "login" | "registro", now: number) {
  if (typeof id !== "string" || !/^[0-9a-f]{32}$/.test(id)) throw new HttpError(400, "desafio inválido");
  const row = await env.DB.prepare("DELETE FROM auth_challenge WHERE id = ?1 AND kind = ?2 RETURNING challenge, user_id, data, expires_at")
    .bind(id, kind).first<{ challenge: string; user_id: string | null; data: string; expires_at: number }>();
  if (!row || row.expires_at <= now) throw new HttpError(400, "desafio vencido; tente de novo");
  return { challenge: row.challenge, uid: row.user_id, data: JSON.parse(row.data) as ChallengeData };
}

// ---- verificação WebAuthn (WebCrypto) ----
const field = (o: unknown, k: string, max = 16_384): string => {
  const v = (o as Record<string, unknown> | null)?.[k];
  if (typeof v !== "string" || !v || v.length > max) throw new HttpError(400, `credencial sem ${k}`);
  return v;
};
const dec = (s: string) => { try { return b64urlDecode(s); } catch { throw new HttpError(400, "credencial malformada"); } };

async function verifyRegistration(req: Request, env: Env, cred: unknown, challenge: string) {
  const { rpId, origin } = webauthnWhere(req, env);
  const resp = (cred as Record<string, unknown> | null)?.response;
  const cdBytes = dec(field(resp, "clientDataJSON"));
  const err = checkClientData(new TextDecoder().decode(cdBytes), { type: "webauthn.create", challenge, origin });
  if (err) throw new HttpError(400, `passkey recusada (${err})`);
  let ad, jwk: Jwk, authData: Uint8Array;
  try {
    const att = cborDecode(dec(field(resp, "attestationObject", 65_536))).value;
    if (!(att instanceof Map) || !(att.get("authData") instanceof Uint8Array)) throw new Error("attestationObject");
    authData = att.get("authData") as Uint8Array;
    ad = parseAuthData(authData);
    if (!ad.credId || !ad.cose) throw new Error("sem credencial");
    jwk = coseToJwk(ad.cose);
  } catch (e) { throw new HttpError(400, `passkey recusada (${e instanceof Error ? e.message : "formato"})`); }
  if (!eqBytes(ad.rpIdHash, await sha(te.encode(rpId)))) throw new HttpError(400, "passkey recusada (rpId)");
  if (!ad.up || !ad.uv) throw new HttpError(400, "passkey recusada: confirme com Face ID, Touch ID ou senha do aparelho");
  const id = b64urlEncode(ad.credId);
  if (field(cred, "id", 1400) !== id) throw new HttpError(400, "passkey recusada (id)");
  await importJwk(jwk); // falha aqui = chave inválida
  const tr = (resp as Record<string, unknown>).transports;
  const transports = Array.isArray(tr) ? tr.filter((t): t is string => typeof t === "string" && /^[a-z-]{1,16}$/.test(t)).slice(0, 6) : [];
  return { id, jwk, counter: ad.signCount, transports, synced: backupEligible(authData) };
}

async function importJwk(jwk: Jwk) {
  try {
    return jwk.alg === "ES256"
      ? await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"])
      : await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  } catch { throw new HttpError(400, "passkey recusada (chave)"); }
}

async function verifyAssertion(req: Request, env: Env, cred: unknown, challenge: string, now: number) {
  const { rpId, origin } = webauthnWhere(req, env);
  const id = field(cred, "id", 1400);
  const pk = await env.DB.prepare("SELECT p.id, p.user_id, p.public_key, p.alg, p.counter FROM passkeys p WHERE p.id = ?1")
    .bind(id).first<{ id: string; user_id: string; public_key: string; alg: "ES256" | "RS256"; counter: number }>();
  if (!pk) throw new HttpError(401, "passkey não reconhecida neste app");
  const resp = (cred as Record<string, unknown>).response;
  const cdBytes = dec(field(resp, "clientDataJSON")), adBytes = dec(field(resp, "authenticatorData")), sig = dec(field(resp, "signature"));
  const err = checkClientData(new TextDecoder().decode(cdBytes), { type: "webauthn.get", challenge, origin });
  if (err) throw new HttpError(401, `login recusado (${err})`);
  let ad;
  try { ad = parseAuthData(adBytes); } catch { throw new HttpError(401, "login recusado (authData)"); }
  if (!eqBytes(ad.rpIdHash, await sha(te.encode(rpId)))) throw new HttpError(401, "login recusado (rpId)");
  if (!ad.up || !ad.uv) throw new HttpError(401, "login recusado: confirme com Face ID, Touch ID ou senha do aparelho");
  const uh = (resp as Record<string, unknown>).userHandle;
  if (typeof uh === "string" && uh && b64urlEncode(te.encode(pk.user_id)) !== uh) throw new HttpError(401, "login recusado (conta)");
  const key = await importJwk(JSON.parse(pk.public_key) as Jwk);
  const msg = new Uint8Array(adBytes.length + 32); msg.set(adBytes); msg.set(await sha(cdBytes), adBytes.length);
  let ok = false;
  try {
    ok = pk.alg === "ES256"
      ? await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, derToRawEcdsa(sig), msg)
      : await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, sig, msg);
  } catch { ok = false; }
  if (!ok) throw new HttpError(401, "login recusado (assinatura)");
  if (!counterOk(pk.counter, ad.signCount)) throw new HttpError(401, "login recusado: esta passkey parece clonada. Use outra ou um código de recuperação.");
  const up = await env.DB.prepare("UPDATE passkeys SET counter = ?2, last_used_at = ?3 WHERE id = ?1 AND user_id = ?4 AND counter = ?5")
    .bind(pk.id, ad.signCount, now, pk.user_id, pk.counter).run();
  if (!up.meta.changes) throw new HttpError(401, "login recusado (tente de novo)");
  return pk.user_id;
}

// ---- códigos ----
const newCode = (len: number) => codeFromBytes(rnd(Math.ceil((len * 5) / 8)), len);
async function recoveryStmts(env: Env, uid: string, now: number, cond = "1", condArgs: unknown[] = []) {
  const codes = Array.from({ length: RECOVERY_COUNT }, () => newCode(RECOVERY_LEN));
  const stmts = await Promise.all(codes.map(async (c) => env.DB.prepare(
    `INSERT INTO recovery_codes (user_id, code_hash, created_at) SELECT ?1, ?2, ?3 WHERE ${cond.replace(/\?(\d+)/g, (_m, n) => `?${Number(n) + 3}`)}`)
    .bind(uid, await sha256Hex("rc:" + c), now, ...condArgs)));
  return { codes: codes.map(formatCode), stmts };
}
const inviteHash = (code: string) => sha256Hex("inv:" + code);

/** Usuário já autenticado por outro meio (cookie, Access ou dev local) — para adicionar passkey ou promover a owner. */
export type Quem = (req: Request, env: Env) => Promise<AuthUser | null>;

// ---- rotas /auth/* (sem sessão; limitadas por IP) ----
export async function handleAuth(req: Request, env: Env, quem: Quem, now = Date.now()): Promise<Response> {
  const url = new URL(req.url), path = url.pathname;
  try {
    if (req.method === "GET" && path === "/auth/status") {
      const owner = await env.DB.prepare("SELECT (SELECT COUNT(*) FROM user WHERE role = 'owner') AS o, (SELECT COUNT(*) FROM passkeys) AS p").first<{ o: number; p: number }>();
      return json({ bootstrap: bootstrapOpen(env, owner) });
    }
    if (req.method !== "POST") return json({ error: "rota não encontrada" }, 404);
    if (segredosFaltando(env).length) return json({ error: "ambiente de testes sem os secrets AUTH_PEPPER e OWNER_SETUP_CODE" }, 503);
    const wait = await hitAuthLimit(env, req, now);
    if (wait) return json({ error: "muitas tentativas; espere alguns minutos" }, 429, { "Retry-After": String(wait) });
    const b = await readJson<Record<string, unknown>>(req, 70 * 1024);

    if (path === "/auth/login/options") {
      const c = await newChallenge(env, "login", null, {}, now);
      return json({ challengeId: c.id, options: { challenge: c.challenge, rpId: webauthnWhere(req, env).rpId, timeout: 120_000, userVerification: "required", allowCredentials: [] } });
    }
    if (path === "/auth/login") {
      const c = await takeChallenge(env, b.challengeId, "login", now);
      const uid = await verifyAssertion(req, env, b.credential, c.challenge, now);
      const s = await sessionStmt(env, uid, req, "passkey", now, "EXISTS (SELECT 1 FROM user WHERE id = ?1 AND deleted_at IS NULL)", [uid]);
      await env.DB.batch([s.stmt]);
      return json({ ok: true }, 200, { "Set-Cookie": s.cookie });
    }
    if (path === "/auth/register/options") return await registerOptions(req, env, b, quem, now);
    if (path === "/auth/register") return await register(req, env, b, now);
    if (path === "/auth/recover") {
      const code = normalizeCode(b.codigo, RECOVERY_LEN);
      if (!code) throw new HttpError(400, "código no formato XXXX-XXXX-XX");
      const ch = await sha256Hex("rc:" + code);
      const r = await env.DB.prepare("SELECT user_id FROM recovery_codes WHERE code_hash = ?1 AND used_at IS NULL").bind(ch).first<{ user_id: string }>();
      if (!r) throw new HttpError(401, "código inválido ou já usado");
      // Um batch só (transação): o código é queimado e a sessão só nasce se ESTA requisição o queimou.
      const s = await sessionStmt(env, r.user_id, req, "recuperacao", now, "EXISTS (SELECT 1 FROM recovery_codes WHERE code_hash = ?1 AND user_id = ?2 AND used_at = ?3)", [ch, r.user_id, now]);
      await env.DB.batch([
        env.DB.prepare("UPDATE recovery_codes SET used_at = ?2 WHERE code_hash = ?1 AND user_id = ?3 AND used_at IS NULL").bind(ch, now, r.user_id),
        s.stmt,
      ]);
      if (!(await env.DB.prepare("SELECT 1 FROM sessions WHERE id = ?1 AND user_id = ?2").bind(s.sid, r.user_id).first())) throw new HttpError(401, "código inválido ou já usado");
      const left = await env.DB.prepare("SELECT COUNT(*) AS n FROM recovery_codes WHERE user_id = ?1 AND used_at IS NULL").bind(r.user_id).first<{ n: number }>();
      return json({ ok: true, restantes: left?.n ?? 0 }, 200, { "Set-Cookie": s.cookie });
    }
    if (path === "/auth/logout") {
      const token = cookie(req, SESSION_COOKIE);
      if (token && /^[0-9a-f]{64}$/.test(token)) await env.DB.prepare("DELETE FROM sessions WHERE id_hash = ?1").bind(await sha256Hex(token)).run();
      return json({ ok: true }, 200, { "Set-Cookie": CLEAR_SESSION });
    }
    return json({ error: "rota não encontrada" }, 404);
  } catch (e) {
    if (e instanceof HttpError) return json(e.code ? { error: e.message, code: e.code } : { error: e.message }, e.status);
    console.error("auth", path, e instanceof Error ? e.message : "erro");
    return json({ error: "erro interno" }, 500);
  }
}

function bootstrapOpen(env: Env, c: { o: number; p: number } | null) {
  return !!env.OWNER_SETUP_CODE && env.OWNER_SETUP_CODE.length >= 16 && (c?.o ?? 0) === 0 && (c?.p ?? 0) === 0;
}

async function registerOptions(req: Request, env: Env, b: Record<string, unknown>, quem: Quem, now: number): Promise<Response> {
  let data: ChallengeData, targetUid: string, userName: string;
  const nomeIn = b.nome == null || b.nome === "" ? null : nomeValido(b.nome);
  if (b.nome != null && b.nome !== "" && !nomeIn) throw new HttpError(400, "nome de 1 a 40 letras");
  if (b.setup != null) {
    // Primeira conta: OWNER_SETUP_CODE (secret). Fecha para sempre quando já existe owner ou qualquer passkey.
    const c = await env.DB.prepare("SELECT (SELECT COUNT(*) FROM user WHERE role = 'owner') AS o, (SELECT COUNT(*) FROM passkeys) AS p").first<{ o: number; p: number }>();
    if (!bootstrapOpen(env, c)) throw new HttpError(403, "o primeiro acesso já foi feito");
    const got = typeof b.setup === "string" ? b.setup.trim() : "";
    if (!timingSafeEqualHex(await sha256Hex(got), await sha256Hex(env.OWNER_SETUP_CODE!))) throw new HttpError(403, "código de configuração errado");
    const me = await quem(req, env); // dono que já usa o app pelo Access: vira owner da conta que já tem os dados
    if (!me && !nomeIn) throw new HttpError(400, "nome obrigatório");
    if (!me && (await countUsers(env)) >= maxUsersOf(env)) throw new HttpError(409, "sem vagas");
    targetUid = me?.id ?? crypto.randomUUID(); userName = nomeIn ?? me?.name ?? "Dono";
    data = { mode: "bootstrap", uid: targetUid, nome: userName, nova: !me };
  } else if (b.convite != null) {
    const code = normalizeCode(b.convite, INVITE_LEN);
    const inv = code ? await env.DB.prepare("SELECT user_id, email, expires_at, used_at FROM invites WHERE code_hash = ?1").bind(await inviteHash(code))
      .first<{ user_id: string | null; email: string | null; expires_at: number; used_at: number | null }>() : null;
    const st = inviteState(inv, now);
    if (st !== "ok") throw new HttpError(st === "inexistente" ? 404 : 410, INVITE_MSG[st], `convite_${st}`);
    if (inv!.user_id) {
      const u = await env.DB.prepare("SELECT name FROM user WHERE id = ?1").bind(inv!.user_id).first<{ name: string | null }>();
      targetUid = inv!.user_id; userName = u?.name ?? nomeIn ?? "Ciclo";
      data = { mode: "reset", uid: targetUid, invite: await inviteHash(code!), nome: userName }; // só o hash vai ao banco
    } else {
      if (!nomeIn) throw new HttpError(400, "nome obrigatório");
      if ((await countUsers(env)) >= maxUsersOf(env)) throw new HttpError(409, `sem vagas: o app aceita até ${maxUsersOf(env)} contas`, "sem_vagas");
      targetUid = crypto.randomUUID(); userName = nomeIn;
      data = { mode: "convite", uid: targetUid, invite: await inviteHash(code!), nome: nomeIn, email: inv!.email, nova: true };
    }
  } else {
    const me = await quem(req, env);
    if (!me) throw new HttpError(401, "entre primeiro para adicionar uma passkey");
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM passkeys WHERE user_id = ?1").bind(me.id).first<{ n: number }>();
    if ((n?.n ?? 0) >= MAX_PASSKEYS) throw new HttpError(409, `máximo de ${MAX_PASSKEYS} passkeys; apague uma`);
    targetUid = me.id; userName = me.name ?? "Ciclo";
    data = { mode: "adicionar", uid: me.id };
  }
  const { results: ex } = data.nova ? { results: [] as { id: string }[] }
    : await env.DB.prepare("SELECT id FROM passkeys WHERE user_id = ?1").bind(targetUid).all<{ id: string }>();
  const c = await newChallenge(env, "registro", data.nova ? null : targetUid, data, now);
  return json({
    challengeId: c.id,
    options: {
      challenge: c.challenge, rp: { name: "Ciclo", id: new URL(req.url).hostname },
      user: { id: b64urlEncode(te.encode(targetUid)), name: userName, displayName: userName },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
      timeout: 120_000, attestation: "none",
      authenticatorSelection: { residentKey: "required", requireResidentKey: true, userVerification: "required" },
      excludeCredentials: ex.map((r) => ({ type: "public-key", id: r.id })),
    },
  });
}

async function register(req: Request, env: Env, b: Record<string, unknown>, now: number): Promise<Response> {
  const c = await takeChallenge(env, b.challengeId, "registro", now);
  const pk = await verifyRegistration(req, env, b.credential, c.challenge);
  const d = c.data, uid = d.uid!;
  if (await env.DB.prepare("SELECT 1 FROM passkeys WHERE id = ?1").bind(pk.id).first()) throw new HttpError(409, "esta passkey já está cadastrada");
  const max = maxUsersOf(env);
  const pkInsert = (cond: string, args: unknown[]) => env.DB.prepare(
    `INSERT INTO passkeys (id, user_id, public_key, alg, counter, transports, synced, created_at) SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8 WHERE ${cond.replace(/\?(\d+)/g, (_m, n) => `?${Number(n) + 8}`)}`)
    .bind(pk.id, uid, JSON.stringify(pk.jwk), pk.jwk.alg, pk.counter, JSON.stringify(pk.transports), pk.synced ? 1 : 0, now, ...args);
  let codes: string[] | undefined;
  let s;
  if (d.mode === "convite" || d.mode === "reset") {
    const ih = d.invite!; // já é o hash (auth_challenge.data nunca guarda o código)
    // Tudo numa transação: o convite só é gasto se ainda vale; o resto só acontece se ESTE convite foi gasto por esta conta.
    const used = "EXISTS (SELECT 1 FROM invites WHERE code_hash = ?1 AND used_by = ?2 AND used_at = ?3)";
    const usedArgs = [ih, uid, now];
    const rc = await recoveryStmts(env, uid, now, used, usedArgs);
    s = await sessionStmt(env, uid, req, "passkey", now, used, usedArgs);
    const stmts = d.mode === "convite"
      ? [
        env.DB.prepare(`INSERT INTO user (id, email, name, role, created_at, last_seen_at) SELECT ?1, ?2, ?3, 'user', ?4, ?4
          WHERE (SELECT COUNT(*) FROM user) < ?5 AND EXISTS (SELECT 1 FROM invites WHERE code_hash = ?6 AND used_at IS NULL AND user_id IS NULL AND expires_at > ?4)`)
          .bind(uid, d.email ?? syntheticEmail(uid), d.nome!, now, max, ih),
        env.DB.prepare("UPDATE invites SET used_by = ?2, used_at = ?3 WHERE code_hash = ?1 AND used_at IS NULL AND user_id IS NULL AND expires_at > ?3 AND EXISTS (SELECT 1 FROM user WHERE id = ?2)")
          .bind(ih, uid, now),
      ]
      : [
        env.DB.prepare("UPDATE invites SET used_by = ?2, used_at = ?3 WHERE code_hash = ?1 AND used_at IS NULL AND user_id = ?2 AND expires_at > ?3").bind(ih, uid, now),
        // reset de acesso: passkeys, sessões e códigos antigos deixam de valer (os dados ficam)
        ...["passkeys", "sessions", "recovery_codes"].map((t) => env.DB.prepare(`DELETE FROM ${t} WHERE user_id = ?2 AND ${used}`).bind(ih, uid, now)),
      ];
    try {
      await env.DB.batch([...stmts, pkInsert(used, usedArgs), ...rc.stmts, s.stmt]);
    } catch (e) {
      if (e instanceof Error && /UNIQUE/i.test(e.message)) throw new HttpError(409, "não deu para criar a conta com este convite; peça um novo a quem te convidou"); // sem revelar se o e-mail existe
      throw e;
    }
    const ok = await env.DB.prepare("SELECT 1 FROM invites WHERE code_hash = ?1 AND used_by = ?2 AND used_at = ?3").bind(ih, uid, now).first();
    if (!ok) {
      const left = await countUsers(env);
      if (d.mode === "convite" && left >= max) throw new HttpError(409, `sem vagas: o app aceita até ${max} contas`, "sem_vagas");
      throw new HttpError(410, "este convite não vale mais. Peça um novo.", "convite_usado");
    }
    codes = rc.codes;
  } else if (d.mode === "bootstrap") {
    const cond = "EXISTS (SELECT 1 FROM user WHERE id = ?1 AND role = 'owner')";
    const rc = await recoveryStmts(env, uid, now, cond, [uid]);
    s = await sessionStmt(env, uid, req, "passkey", now, cond, [uid]);
    const first = d.nova
      ? env.DB.prepare(`INSERT INTO user (id, email, name, role, created_at, last_seen_at) SELECT ?1, ?2, ?3, 'owner', ?4, ?4
          WHERE (SELECT COUNT(*) FROM user) < ?5 AND NOT EXISTS (SELECT 1 FROM user WHERE role = 'owner') AND NOT EXISTS (SELECT 1 FROM passkeys)`)
        .bind(uid, syntheticEmail(uid), d.nome!, now, max)
      : env.DB.prepare(`UPDATE user SET role = 'owner', name = COALESCE(name, ?2) WHERE id = ?1
          AND NOT EXISTS (SELECT 1 FROM user WHERE role = 'owner') AND NOT EXISTS (SELECT 1 FROM passkeys)`).bind(uid, d.nome!);
    await env.DB.batch([first, pkInsert(cond, [uid]), ...rc.stmts, s.stmt]);
    if (!(await env.DB.prepare("SELECT 1 FROM passkeys WHERE id = ?1 AND user_id = ?2").bind(pk.id, uid).first())) throw new HttpError(403, "o primeiro acesso já foi feito");
    codes = rc.codes;
  } else {
    if (!c.uid || c.uid !== uid) throw new HttpError(400, "desafio inválido");
    const cond = "(SELECT COUNT(*) FROM passkeys WHERE user_id = ?1) < ?2";
    s = await sessionStmt(env, uid, req, "passkey", now, "EXISTS (SELECT 1 FROM passkeys WHERE id = ?1 AND user_id = ?2)", [pk.id, uid]);
    await env.DB.batch([pkInsert(cond, [uid, MAX_PASSKEYS]), s.stmt]);
    if (!(await env.DB.prepare("SELECT 1 FROM passkeys WHERE id = ?1").bind(pk.id).first())) throw new HttpError(409, `máximo de ${MAX_PASSKEYS} passkeys`);
  }
  return json({ ok: true, ...(codes ? { codigos: codes } : {}), sincronizada: pk.synced }, 201, { "Set-Cookie": s.cookie });
}

// ---- rotas autenticadas em /api/account/* ----
const owner = (u: AuthUser) => { if (u.role !== "owner") throw new HttpError(403, "só o dono do app"); };

export function registerConta(on: (method: string, path: string, h: Handler) => void) {
  on("GET", "/api/account/devices", async (_req, env, _p, u) => {
    const [s, p, rc] = await env.DB.batch([
      env.DB.prepare("SELECT id, created_at, expires_at, last_seen_at, user_agent, via FROM sessions WHERE user_id = ?1 AND expires_at > ?2 ORDER BY COALESCE(last_seen_at, created_at) DESC LIMIT 50").bind(u.id, Date.now()),
      env.DB.prepare("SELECT id, created_at, last_used_at, synced, transports FROM passkeys WHERE user_id = ?1 ORDER BY created_at").bind(u.id),
      env.DB.prepare("SELECT COUNT(*) AS n FROM recovery_codes WHERE user_id = ?1 AND used_at IS NULL").bind(u.id),
    ]);
    type S = { id: string; created_at: number; expires_at: number; last_seen_at: number | null; user_agent: string | null; via: string };
    type P = { id: string; created_at: number; last_used_at: number | null; synced: number; transports: string };
    return json({
      sessions: (s.results as S[]).map((r) => ({ id: r.id, aparelho: aparelhoDe(r.user_agent), createdAt: r.created_at, lastSeenAt: r.last_seen_at, expiresAt: r.expires_at, via: r.via, atual: r.id === u.sessionId })),
      passkeys: (p.results as P[]).map((r) => ({ id: r.id, createdAt: r.created_at, lastUsedAt: r.last_used_at, sincronizada: !!r.synced })),
      codigosRestantes: (rc.results[0] as { n: number } | undefined)?.n ?? 0,
      via: u.via ?? null,
    });
  });

  on("DELETE", "/api/account/sessions/:id", async (_req, env, p, u) => {
    const r = await env.DB.prepare("DELETE FROM sessions WHERE id = ?1 AND user_id = ?2").bind(p.id, u.id).run();
    if (!r.meta.changes) throw new HttpError(404, "sessão não encontrada");
    return p.id === u.sessionId ? json({ ok: true }, 200, { "Set-Cookie": CLEAR_SESSION }) : json({ ok: true });
  });

  // "Sair de todos": toda sessão da conta (inclusive esta) deixa de valer na hora. Tokens do Claude ficam (revogue em Conta).
  on("POST", "/api/account/logout-all", async (_req, env, _p, u) => {
    const r = await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?1").bind(u.id).run();
    return json({ ok: true, encerradas: r.meta.changes }, 200, { "Set-Cookie": CLEAR_SESSION });
  });

  on("DELETE", "/api/account/passkeys/:id", async (_req, env, p, u) => {
    const r = await env.DB.prepare("DELETE FROM passkeys WHERE id = ?1 AND user_id = ?2 AND (SELECT COUNT(*) FROM passkeys WHERE user_id = ?2) > 1").bind(p.id, u.id).run();
    if (r.meta.changes) return json({ ok: true });
    const mine = await env.DB.prepare("SELECT 1 FROM passkeys WHERE id = ?1 AND user_id = ?2").bind(p.id, u.id).first();
    throw mine ? new HttpError(409, "é a sua única passkey: adicione outra antes de apagar") : new HttpError(404, "passkey não encontrada");
  });

  on("POST", "/api/account/recovery-codes", async (_req, env, _p, u) => {
    const now = Date.now(), rc = await recoveryStmts(env, u.id, now);
    await env.DB.batch([env.DB.prepare("DELETE FROM recovery_codes WHERE user_id = ?1").bind(u.id), ...rc.stmts]);
    return json({ codigos: rc.codes, aviso: "guarde agora: os códigos não aparecem de novo" }, 201);
  });

  // ---- owner: pessoas e convites (nunca dado de saúde: só nome, papel, criação e último acesso) ----
  on("GET", "/api/account/people", async (_req, env, _p, u) => {
    owner(u);
    const now = Date.now();
    const [pp, inv] = await env.DB.batch([
      env.DB.prepare("SELECT id, name, role, created_at, last_seen_at FROM user ORDER BY created_at LIMIT 50"),
      env.DB.prepare("SELECT id, email, user_id, created_at, expires_at FROM invites WHERE created_by = ?1 AND used_at IS NULL AND expires_at > ?2 ORDER BY created_at DESC LIMIT 50").bind(u.id, now),
    ]);
    type R = { id: string; name: string | null; role: string; created_at: number; last_seen_at: number | null };
    type I = { id: string; email: string | null; user_id: string | null; created_at: number; expires_at: number };
    return json({
      vagas: vagas(pp.results.length, maxUsersOf(env)),
      people: (pp.results as R[]).map((r) => ({ id: r.id, nome: r.name ?? "Sem nome", role: r.role, createdAt: r.created_at, lastSeenAt: r.last_seen_at, eu: r.id === u.id })),
      invites: (inv.results as I[]).map((r) => ({ id: r.id, email: r.email, reset: !!r.user_id, createdAt: r.created_at, expiresAt: r.expires_at })),
    });
  });

  on("POST", "/api/account/invites", async (req, env, _p, u) => {
    owner(u);
    const b = await readJson<Record<string, unknown>>(req, 2 * 1024);
    const raw = str(b.email, "email", 254, false);
    const email = raw ? raw.trim().toLowerCase() : null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "email inválido");
    const max = maxUsersOf(env);
    if ((await countUsers(env)) >= max) throw new HttpError(409, `sem vagas: o app aceita até ${max} contas`, "sem_vagas");
    return json(await createInvite(req, env, u.id, null, email), 201);
  });

  on("DELETE", "/api/account/invites/:id", async (_req, env, p, u) => {
    owner(u);
    const r = await env.DB.prepare("DELETE FROM invites WHERE id = ?1 AND created_by = ?2 AND used_at IS NULL").bind(p.id, u.id).run();
    if (!r.meta.changes) throw new HttpError(404, "convite não encontrado");
    return json({ ok: true });
  });

  // Resetar o acesso de outra pessoa: as sessões e os tokens do Claude caem agora; o convite novo troca as passkeys e os códigos. Os dados ficam.
  on("POST", "/api/account/people/:id/reset", async (req, env, p, u) => {
    owner(u);
    if (p.id === u.id) throw new HttpError(400, "para você mesmo, use um código de recuperação ou adicione uma passkey");
    const t = await env.DB.prepare("SELECT id FROM user WHERE id = ?1").bind(p.id).first<{ id: string }>();
    if (!t) throw new HttpError(404, "pessoa não encontrada");
    // sessões caem e os tokens do Claude dela são revogados agora (quem tinha acesso perde tudo); os dados ficam
    await env.DB.batch([
      env.DB.prepare("DELETE FROM sessions WHERE user_id = ?1").bind(t.id),
      env.DB.prepare("UPDATE mcp_token SET revoked_at = ?2 WHERE user_id = ?1 AND revoked_at IS NULL").bind(t.id, Date.now()),
    ]);
    return json(await createInvite(req, env, u.id, t.id, null), 201);
  });
}

async function createInvite(req: Request, env: Env, by: string, forUid: string | null, email: string | null) {
  const code = newCode(INVITE_LEN), now = Date.now(), id = hex(rnd(8));
  await env.DB.prepare("INSERT INTO invites (code_hash, id, created_by, user_id, email, created_at, expires_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)")
    .bind(await inviteHash(code), id, by, forUid, email, now, now + INVITE_MS).run();
  const shown = formatCode(code);
  return { id, codigo: shown, expiresAt: now + INVITE_MS, link: `${new URL(req.url).origin}/#entrar?convite=${shown}`, aviso: "envie agora: o código não aparece de novo" };
}

/** Limpeza (cron de hora em hora): sessões vencidas, desafios velhos, convites vencidos há 30 dias e contadores antigos. */
export async function purgeAuth(env: Env, now = Date.now()) {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE expires_at <= ?1").bind(now),
    env.DB.prepare("DELETE FROM auth_challenge WHERE expires_at <= ?1").bind(now),
    env.DB.prepare("DELETE FROM invites WHERE used_at IS NULL AND expires_at <= ?1").bind(now - 30 * 86_400_000),
    env.DB.prepare("DELETE FROM auth_rate_limit WHERE window_start <= ?1").bind(now - AUTH_LIMIT.windowMs),
  ]);
}
