// #54 Conta própria: login por passkey (WebAuthn verificado com WebCrypto, ES256/RS256), convite de uso único,
// teto de contas, sessão no cookie __Host-ciclo, códigos de recuperação e gestão de aparelhos/pessoas.
// #62: cadastro por convite amarrado ao e-mail (nome, sobrenome, sexo, nascimento, aceite LGPD), dono só com o código
// E o e-mail do secret OWNER_EMAIL, sessão deslizante de 30 dias com teto de 180, Face ID de novo (app fechado há mais
// de 7 dias e ações sensíveis) e aviso de login em aparelho novo. O caminho do Cloudflare Access saiu.
// Regras puras no core (conta.ts e cadastro.ts). Aqui: SQL (sempre com bind e user_id), cookie e criptografia.
import {
  AUTH_TENTATIVAS, CONSENT_DOCS, CONSENT_VERSAO, INVITE_LEN, INVITE_MS, INVITE_MSG, RECOVERY_COUNT, RECOVERY_LEN, SESSION_MAX_MS, aparelhoDe,
  b64urlDecode, b64urlEncode, backupEligible, cborDecode, checkClientData, codeFromBytes, consentPendente, coseToJwk, counterOk, derToRawEcdsa,
  emailValido, faceIdRecente, formatCode, inviteState, maxUsers, mesmoEmail, nomeValido, normalizeCode, parseAuthData, precisaFaceId,
  sessionAlive, sessionExpiry, sessionRenewal, vagas, validarCadastro, validarPerfilConta,
} from "@ciclo/core";
import type { Cadastro, Jwk } from "@ciclo/core";
import type { AuthUser, Env } from "./env.ts";
import { HttpError, json, readJson, str } from "./http.ts";
import { cookie, sha256Hex, timingSafeEqualHex, touchUser, userRowToAuth } from "./auth.ts";
import type { UserRow } from "./auth.ts";
import type { Handler } from "./comida.ts";
import {
  anotarFalha, anotarFalhaGlobal, bloqueioRestante, chaveIp, contarJanela, estadoGlobal, exigirCotaGlobal, exigirTurnstile, lerFalhas,
  precisaTurnstile, turnstileLigado,
} from "./limites.ts";
import { segredosFaltando, webauthnWhere } from "./ambiente.ts";

export const SESSION_COOKIE = "__Host-ciclo";
const CHALLENGE_MS = 5 * 60_000;
const MAX_PASSKEYS = 10;
const SEEN_EVERY_MS = 5 * 60_000;
/** Teto amplo de POST em /auth/* por IP (janela fixa). As tentativas que validam segredo têm o limite de 5/min e o bloqueio da #56. */
export const AUTH_LIMIT = { max: 30, windowMs: 10 * 60_000 } as const;

const te = new TextEncoder();
const rnd = (n: number) => crypto.getRandomValues(new Uint8Array(n));
const hex = (u8: Uint8Array) => [...u8].map((b) => b.toString(16).padStart(2, "0")).join("");
const sha = async (u8: Uint8Array) => new Uint8Array(await crypto.subtle.digest("SHA-256", u8));
const eqBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);
const syntheticEmail = (uid: string) => `p-${uid.replace(/-/g, "")}@passkey.invalid`;

export const sessionCookie = (token: string, maxAgeMs: number) =>
  `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.floor(maxAgeMs / 1000)}`;
export const CLEAR_SESSION = `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

const countUsers = async (env: Env) => (await env.DB.prepare("SELECT COUNT(*) AS n FROM user").first<{ n: number }>())?.n ?? 0;
export const maxUsersOf = (env: Env) => maxUsers(env.MAX_USERS);

// ---- sessão ----
type Via = "passkey" | "recuperacao";
/** Prepara a sessão nova (o INSERT vai dentro do batch de quem chama) e devolve o cookie. `cond` amarra o INSERT a uma condição SQL.
 *  `reauth` = houve Face ID agora (login e cadastro; código de recuperação não). `avisoOk` = null abre o aviso de aparelho novo. */
async function sessionStmt(env: Env, uid: string, req: Request, via: Via, now: number, o: { cond?: string; condArgs?: unknown[]; reauth?: boolean; avisoOk?: number | null } = {}) {
  const token = hex(rnd(32)), h = await sha256Hex(token), sid = hex(rnd(8));
  const ua = (req.headers.get("User-Agent") ?? "").slice(0, 300) || null;
  const exp = sessionExpiry(now, now);
  const base = 10; // ?1..?9 abaixo; as condições usam ?10 em diante
  const cond = (o.cond ?? "1").replace(/\?(\d+)/g, (_m, n) => `?${Number(n) + base - 1}`);
  const stmt = env.DB.prepare(`INSERT INTO sessions (id_hash, id, user_id, created_at, expires_at, last_seen_at, user_agent, via, reauth_at, aviso_ok)
    SELECT ?1, ?2, ?3, ?4, ?5, ?4, ?6, ?7, ?8, ?9 WHERE ${cond}`)
    .bind(h, sid, uid, now, exp, ua, via, o.reauth ? now : null, o.avisoOk === undefined ? now : o.avisoOk, ...(o.condArgs ?? []));
  return { stmt, cookie: sessionCookie(token, exp - now), sid };
}

/** Login num aparelho que nenhuma outra sessão viva da conta usa = aviso em Conta → Segurança ("Não fui eu"). */
async function avisoDeAparelho(env: Env, uid: string, req: Request, now: number): Promise<number | null> {
  const meu = aparelhoDe(req.headers.get("User-Agent"));
  const { results } = await env.DB.prepare("SELECT user_agent FROM sessions WHERE user_id = ?1 AND expires_at > ?2 LIMIT 50").bind(uid, now).all<{ user_agent: string | null }>();
  return results.some((r) => aparelhoDe(r.user_agent) === meu) ? now : null;
}

type SessaoRow = UserRow & { sid: string; s_created: number; expires_at: number; s_seen: number | null; reauth_at: number | null; trava: number; aceites: number };
const SESSAO_SQL = `SELECT s.id AS sid, s.created_at AS s_created, s.expires_at, s.last_seen_at AS s_seen, s.reauth_at, s.trava,
    u.id, u.email, u.name, u.role, u.created_at, u.last_seen_at, u.onboarding_done_at, u.deleted_at,
    (SELECT COUNT(*) FROM consent c WHERE c.user_id = u.id AND ((c.doc = 'termos' AND c.versao = ?2) OR (c.doc = 'privacidade' AND c.versao = ?3))) AS aceites
  FROM sessions s JOIN user u ON u.id = s.user_id WHERE s.id_hash = ?1`;

/** Sessão do cookie, viva (30 dias sem uso e 180 desde o login), sem renovar nem olhar a trava. null = sem sessão. */
async function sessaoDoCookie(req: Request, env: Env, now: number): Promise<{ row: SessaoRow; token: string } | null> {
  const token = cookie(req, SESSION_COOKIE);
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  const row = await env.DB.prepare(SESSAO_SQL).bind(await sha256Hex(token), CONSENT_VERSAO.termos, CONSENT_VERSAO.privacidade).first<SessaoRow>();
  if (!row || row.deleted_at != null || !sessionAlive({ createdAt: row.s_created, expiresAt: row.expires_at }, now)) return null;
  return { row, token };
}

/** Usuário da sessão do cookie (renovada no uso) ou null. Nunca lança por cookie malformado.
 *  `trava`: o app voltou depois de mais de 7 dias fechado → pede Face ID de novo, sem deslogar (a sessão continua). */
export async function authenticateSession(req: Request, env: Env, now = Date.now()): Promise<{ user: AuthUser; setCookie?: string; trava?: boolean } | null> {
  const s = await sessaoDoCookie(req, env, now);
  if (!s) return null;
  const { row, token } = s;
  const user: AuthUser = { ...userRowToAuth(row), via: "sessao", sessionId: row.sid, reauthAt: row.reauth_at, aceitePendente: row.aceites < CONSENT_DOCS.length };
  if (row.trava || precisaFaceId({ lastSeenAt: row.s_seen, createdAt: row.s_created }, now)) {
    if (!row.trava) await env.DB.prepare("UPDATE sessions SET trava = 1 WHERE id = ?1 AND user_id = ?2").bind(row.sid, row.id).run();
    return { user, trava: true };
  }
  const renew = sessionRenewal({ createdAt: row.s_created, expiresAt: row.expires_at }, now);
  if (renew) await env.DB.prepare("UPDATE sessions SET expires_at = ?2, last_seen_at = ?3 WHERE id = ?1 AND user_id = ?4").bind(row.sid, renew, now, row.id).run();
  else if (row.s_seen == null || now - row.s_seen >= SEEN_EVERY_MS) await env.DB.prepare("UPDATE sessions SET last_seen_at = ?2 WHERE id = ?1 AND user_id = ?3").bind(row.sid, now, row.id).run();
  await touchUser(env, row, now);
  return { user, setCookie: renew ? sessionCookie(token, renew - now) : undefined };
}

/** #62: ações sensíveis (chave do Chat, convidar, apagar conta, códigos de recuperação, sair de todos) pedem Face ID nos últimos 5 min. */
export function exigirFaceId(u: AuthUser, now = Date.now()) {
  if (u.via === "dev") return; // só localhost com DEV_NO_AUTH (não há passkey)
  if (u.via !== "sessao" || !faceIdRecente(u.reauthAt, now)) throw new HttpError(403, "confirme com o Face ID para continuar", "reauth");
}

// ---- limite de tentativas (/auth/*) ----
/** Teto amplo por IP (HMAC com AUTH_PEPPER; nunca o IP puro). */
export const hitAuthLimit = async (env: Env, req: Request, now = Date.now()) => contarJanela(env, "ip:" + (await chaveIp(env, req)), AUTH_LIMIT, now);

// ---- desafio WebAuthn ----
type ChallengeData = {
  mode?: "convite" | "reset" | "bootstrap" | "adicionar" | "reauth"; uid?: string; nome?: string; invite?: string; email?: string | null; nova?: boolean;
  cadastro?: Cadastro; // #62: sobrenome, sexo e nascimento (sem segredo) para criar a conta no fim da cerimônia
};
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
/** #62 aceite gravado (termos e privacidade, versão vigente, data e HMAC do IP), amarrado a uma condição SQL do batch. */
async function consentStmts(env: Env, req: Request, uid: string, now: number, cond = "1", condArgs: unknown[] = []) {
  const ipHash = await chaveIp(env, req).catch(() => null);
  return CONSENT_DOCS.map((doc) => env.DB.prepare(
    `INSERT OR IGNORE INTO consent (user_id, doc, versao, aceito_em, ip_hash) SELECT ?1, ?2, ?3, ?4, ?5 WHERE ${cond.replace(/\?(\d+)/g, (_m, n) => `?${Number(n) + 5}`)}`)
    .bind(uid, doc, CONSENT_VERSAO[doc], now, ipHash, ...condArgs));
}

/** Usuário já autenticado (cookie ou dev local) — para adicionar passkey. */
export type Quem = (req: Request, env: Env) => Promise<AuthUser | null>;

// ---- rotas /auth/* (sem sessão; limitadas por IP) ----
export async function handleAuth(req: Request, env: Env, quem: Quem, now = Date.now()): Promise<Response> {
  const url = new URL(req.url), path = url.pathname;
  try {
    if (req.method === "GET" && path === "/auth/status") {
      const c = await env.DB.prepare("SELECT (SELECT COUNT(*) FROM user WHERE role = 'owner') AS o, (SELECT COUNT(*) FROM passkeys) AS p, (SELECT COUNT(*) FROM user) AS n").first<{ o: number; p: number; n: number }>();
      // #62: a tela #entrar diz "Acesso só por convite · X de 10 vagas usadas" (só a contagem, nenhum dado de conta)
      return json({ bootstrap: bootstrapOpen(env, c), turnstile: turnstileLigado(env) ? env.TURNSTILE_SITE_KEY : null, vagas: vagas(c?.n ?? 0, maxUsersOf(env)), versoes: CONSENT_VERSAO });
    }
    if (req.method === "GET" && path === "/auth/legal") {
      // #62 #privacidade: controlador = nome do dono (do banco) e o e-mail de contato (secret OWNER_EMAIL; nunca no repositório)
      const o = await env.DB.prepare("SELECT name, sobrenome FROM user WHERE role = 'owner'").first<{ name: string | null; sobrenome: string | null }>();
      const nome = [o?.name, o?.sobrenome].filter(Boolean).join(" ") || null;
      return json({ controlador: { nome, email: emailValido(env.OWNER_EMAIL) }, versoes: CONSENT_VERSAO });
    }
    if (req.method !== "POST") return json({ error: "rota não encontrada" }, 404);
    if (segredosFaltando(env).length) return json({ error: "ambiente de testes sem os secrets AUTH_PEPPER e OWNER_SETUP_CODE" }, 503);
    const wait = await hitAuthLimit(env, req, now);
    if (wait) return json({ error: "muitas tentativas; espere alguns minutos" }, 429, { "Retry-After": String(wait) });
    const b = await readJson<Record<string, unknown>>(req, 70 * 1024);
    if (path === "/auth/logout") return await logout(req, env);
    return await tentativa(req, env, path, b, now, () => rotaAuth(req, env, quem, url, path, b, now));
  } catch (e) {
    if (e instanceof HttpError) return json(e.code ? { error: e.message, code: e.code } : { error: e.message }, e.status);
    console.error("auth", path, e instanceof Error ? e.message : "erro");
    return json({ error: "erro interno" }, 500);
  }
}

/** #56: toda rota de /auth/* (menos sair) passa pelo bloqueio de 15 min depois de 10 falhas seguidas do IP. As que validam
 *  segredo (login, registro, recuperação, convite, setup) contam 5/min por IP; recuperação e setup também têm limite global.
 *  Turnstile (quando ligado): sempre para criar conta por convite e, depois de 3 falhas seguidas, para começar qualquer tentativa. */
async function tentativa(req: Request, env: Env, path: string, b: Record<string, unknown>, now: number, rota: () => Promise<Response>): Promise<Response> {
  const ipk = await chaveIp(env, req), fk = "f:" + ipk;
  const f = await lerFalhas(env, fk);
  const preso = bloqueioRestante(f, now);
  if (preso) return json({ error: "muitas tentativas erradas; espere 15 minutos", code: "bloqueado" }, 429, { "Retry-After": String(preso) });
  const opcoesComSegredo = path === "/auth/register/options" && (b.setup != null || b.convite != null);
  const conta = path === "/auth/login" || path === "/auth/register" || path === "/auth/recover" || path === "/auth/convite" || path === "/auth/reauth" || opcoesComSegredo;
  if (conta) {
    const wait = await contarJanela(env, "t:" + ipk, AUTH_TENTATIVAS, now);
    if (wait) return json({ error: "muitas tentativas; espere um pouco", code: "limite" }, 429, { "Retry-After": String(wait) });
  }
  const inicio = path === "/auth/login/options" || path === "/auth/register/options" || path === "/auth/recover";
  let robo = (path === "/auth/register/options" && b.convite != null) || (inicio && precisaTurnstile(f, now));
  // Limite global (só falhas de verificação contam): no teto, passa quem tem Turnstile válido; sem Turnstile ligado, espera.
  const g = path === "/auth/recover" ? "recover" as const : path === "/auth/register/options" && b.setup != null ? "setup" as const : null;
  if (g) {
    const st = await estadoGlobal(env, g, now);
    if (st.estado === "fechado" || (st.estado === "turnstile" && !turnstileLigado(env)))
      return json({ error: "muitas tentativas no app; espere um pouco", code: "limite_global" }, 429, { "Retry-After": String(st.espera) });
    if (st.estado === "turnstile") robo = true;
  }
  if (robo) await exigirTurnstile(env, req, b.turnstile);
  try { return await rota(); } catch (e) {
    if (conta && e instanceof HttpError && e.status >= 400 && e.status < 500 && e.status !== 429) await anotarFalha(env, fk, now);
    if (g === "recover" && e instanceof HttpError && e.status === 401) await anotarFalhaGlobal(env, "recover", now);
    if (g === "setup" && e instanceof HttpError && e.code === "setup_errado") await anotarFalhaGlobal(env, "setup", now);
    throw e;
  }
  // O sucesso não zera as falhas do IP: elas decaem sozinhas (15 min sem falha).
}

async function logout(req: Request, env: Env) {
  const token = cookie(req, SESSION_COOKIE);
  if (token && /^[0-9a-f]{64}$/.test(token)) await env.DB.prepare("DELETE FROM sessions WHERE id_hash = ?1").bind(await sha256Hex(token)).run();
  return json({ ok: true }, 200, { "Set-Cookie": CLEAR_SESSION });
}

async function rotaAuth(req: Request, env: Env, quem: Quem, url: URL, path: string, b: Record<string, unknown>, now: number): Promise<Response> {
  if (path === "/auth/login/options") {
    const c = await newChallenge(env, "login", null, {}, now);
    return json({ challengeId: c.id, options: { challenge: c.challenge, rpId: webauthnWhere(req, env).rpId, timeout: 120_000, userVerification: "required", allowCredentials: [] } });
  }
  if (path === "/auth/login") {
    const c = await takeChallenge(env, b.challengeId, "login", now);
    if (c.data.mode === "reauth") throw new HttpError(400, "desafio inválido");
    const uid = await verifyAssertion(req, env, b.credential, c.challenge, now);
    const s = await sessionStmt(env, uid, req, "passkey", now, { cond: "EXISTS (SELECT 1 FROM user WHERE id = ?1 AND deleted_at IS NULL)", condArgs: [uid], reauth: true, avisoOk: await avisoDeAparelho(env, uid, req, now) });
    await env.DB.batch([s.stmt]);
    return json({ ok: true }, 200, { "Set-Cookie": s.cookie });
  }
  // #62 Face ID de novo, na MESMA sessão (sem deslogar): destrava depois de 7 dias fechado e libera ações sensíveis por 5 min.
  if (path === "/auth/reauth/options") {
    const cur = await sessaoDoCookie(req, env, now);
    if (!cur) throw new HttpError(401, "entre de novo", "entrar");
    const { results } = await env.DB.prepare("SELECT id, transports FROM passkeys WHERE user_id = ?1").bind(cur.row.id).all<{ id: string; transports: string }>();
    const ch = await newChallenge(env, "login", cur.row.id, { mode: "reauth", uid: cur.row.id }, now);
    return json({ challengeId: ch.id, options: { challenge: ch.challenge, rpId: webauthnWhere(req, env).rpId, timeout: 120_000, userVerification: "required",
      allowCredentials: results.map((r) => ({ type: "public-key", id: r.id })) } });
  }
  if (path === "/auth/reauth") {
    const cur = await sessaoDoCookie(req, env, now);
    if (!cur) throw new HttpError(401, "entre de novo", "entrar");
    const c = await takeChallenge(env, b.challengeId, "login", now);
    if (c.data.mode !== "reauth" || c.uid !== cur.row.id) throw new HttpError(400, "desafio inválido");
    const uid = await verifyAssertion(req, env, b.credential, c.challenge, now);
    if (uid !== cur.row.id) throw new HttpError(401, "use a passkey desta conta");
    const exp = sessionExpiry(cur.row.s_created, now);
    await env.DB.prepare("UPDATE sessions SET trava = 0, reauth_at = ?3, last_seen_at = ?3, expires_at = ?4 WHERE id = ?1 AND user_id = ?2").bind(cur.row.sid, uid, now, exp).run();
    return json({ ok: true }, 200, { "Set-Cookie": sessionCookie(cur.token, exp - now) });
  }
  // #62 o link /#convite/<código> abre "Crie sua conta no Ciclo": boas-vindas com quem convidou, nome e e-mail travado
  if (path === "/auth/convite") {
    const code = normalizeCode(b.convite, INVITE_LEN);
    const inv = code ? await env.DB.prepare(`SELECT i.user_id, i.email, i.nome, i.expires_at, i.used_at, u.name AS por, t.name AS dono_reset
      FROM invites i LEFT JOIN user u ON u.id = i.created_by LEFT JOIN user t ON t.id = i.user_id WHERE i.code_hash = ?1`).bind(await inviteHash(code))
      .first<{ user_id: string | null; email: string | null; nome: string | null; expires_at: number; used_at: number | null; por: string | null; dono_reset: string | null }>() : null;
    const st = inviteState(inv, now);
    if (st !== "ok") throw new HttpError(st === "inexistente" ? 404 : 410, INVITE_MSG[st], `convite_${st}`);
    return json({ reset: !!inv!.user_id, nome: inv!.user_id ? inv!.dono_reset : inv!.nome, email: inv!.user_id ? null : inv!.email, por: inv!.por ?? "o dono do app", expiresAt: inv!.expires_at });
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
    const s = await sessionStmt(env, r.user_id, req, "recuperacao", now, { cond: "EXISTS (SELECT 1 FROM recovery_codes WHERE code_hash = ?1 AND user_id = ?2 AND used_at = ?3)", condArgs: [ch, r.user_id, now], avisoOk: await avisoDeAparelho(env, r.user_id, req, now) });
    await env.DB.batch([
      env.DB.prepare("UPDATE recovery_codes SET used_at = ?2 WHERE code_hash = ?1 AND user_id = ?3 AND used_at IS NULL").bind(ch, now, r.user_id),
      s.stmt,
    ]);
    if (!(await env.DB.prepare("SELECT 1 FROM sessions WHERE id = ?1 AND user_id = ?2").bind(s.sid, r.user_id).first())) throw new HttpError(401, "código inválido ou já usado");
    const left = await env.DB.prepare("SELECT COUNT(*) AS n FROM recovery_codes WHERE user_id = ?1 AND used_at IS NULL").bind(r.user_id).first<{ n: number }>();
    return json({ ok: true, restantes: left?.n ?? 0 }, 200, { "Set-Cookie": s.cookie });
  }
  return json({ error: "rota não encontrada" }, 404);
}

/** Primeiro acesso aberto: OWNER_SETUP_CODE (≥ 16) e OWNER_EMAIL configurados, nenhum owner e nenhuma passkey ainda. */
function bootstrapOpen(env: Env, c: { o: number; p: number } | null) {
  return !!env.OWNER_SETUP_CODE && env.OWNER_SETUP_CODE.length >= 16 && !!emailValido(env.OWNER_EMAIL) && (c?.o ?? 0) === 0 && (c?.p ?? 0) === 0;
}

/** #62 etapas do cadastro (nome, sobrenome, sexo, nascimento) + aceite dos termos e da privacidade na versão vigente. */
function cadastroDe(b: Record<string, unknown>, now: number): Cadastro {
  const r = validarCadastro(b, new Date(now).toISOString().slice(0, 10));
  if (!r.ok) throw new HttpError(400, r.erros.join("; "), "cadastro");
  const a = b.aceite as Record<string, unknown> | boolean | null | undefined;
  const aceitou = a === true || (!!a && typeof a === "object" && consentPendente(CONSENT_DOCS.map((d) => ({ doc: d, versao: String(a[d] ?? "") }))).length === 0);
  if (!aceitou) throw new HttpError(400, "aceite os termos e a privacidade para criar a conta", "aceite");
  return r.valor!;
}

async function registerOptions(req: Request, env: Env, b: Record<string, unknown>, quem: Quem, now: number): Promise<Response> {
  let data: ChallengeData, targetUid: string, userName: string;
  if (b.setup != null) {
    // #62: o dono nasce SÓ aqui, com o OWNER_SETUP_CODE E o e-mail igual ao secret OWNER_EMAIL, e nasce vazio.
    // O código é exigido sempre antes do Face ID (vazio = errado). Fecha para sempre quando já existe owner ou qualquer passkey.
    const c = await env.DB.prepare("SELECT (SELECT COUNT(*) FROM user WHERE role = 'owner') AS o, (SELECT COUNT(*) FROM passkeys) AS p").first<{ o: number; p: number }>();
    if (!bootstrapOpen(env, c)) throw new HttpError(403, "o primeiro acesso já foi feito");
    const got = typeof b.setup === "string" ? b.setup.trim() : "";
    const codigoOk = timingSafeEqualHex(await sha256Hex(got), await sha256Hex(env.OWNER_SETUP_CODE!));
    if (!got || !codigoOk || !mesmoEmail(b.email, env.OWNER_EMAIL)) throw new HttpError(403, "código de configuração ou e-mail errado", "setup_errado");
    const cad = cadastroDe(b, now);
    if ((await countUsers(env)) >= maxUsersOf(env)) throw new HttpError(409, "sem vagas");
    targetUid = crypto.randomUUID(); userName = cad.nome;
    data = { mode: "bootstrap", uid: targetUid, nome: cad.nome, email: emailValido(env.OWNER_EMAIL), nova: true, cadastro: cad };
  } else if (b.convite != null) {
    const code = normalizeCode(b.convite, INVITE_LEN);
    const inv = code ? await env.DB.prepare("SELECT user_id, email, expires_at, used_at FROM invites WHERE code_hash = ?1").bind(await inviteHash(code))
      .first<{ user_id: string | null; email: string | null; expires_at: number; used_at: number | null }>() : null;
    const st = inviteState(inv, now);
    if (st !== "ok") throw new HttpError(st === "inexistente" ? 404 : 410, INVITE_MSG[st], `convite_${st}`);
    if (inv!.user_id) {
      const u = await env.DB.prepare("SELECT name FROM user WHERE id = ?1").bind(inv!.user_id).first<{ name: string | null }>();
      targetUid = inv!.user_id; userName = u?.name ?? "Ciclo";
      data = { mode: "reset", uid: targetUid, invite: await inviteHash(code!), nome: userName }; // só o hash vai ao banco
    } else {
      // #62: o convite é amarrado ao e-mail; outro e-mail = recusado (o app manda o e-mail travado que veio do convite)
      if (inv!.email && !mesmoEmail(b.email, inv!.email)) throw new HttpError(403, "este convite é de outro e-mail. Peça um convite para o seu.", "convite_email");
      const cad = cadastroDe(b, now);
      if ((await countUsers(env)) >= maxUsersOf(env)) throw new HttpError(409, `sem vagas: o app aceita até ${maxUsersOf(env)} contas`, "sem_vagas");
      await exigirCotaGlobal(env, now); // #56: a 95% do grátis, conta nova por convite para (o dono ainda cria convite e reseta acesso)
      targetUid = crypto.randomUUID(); userName = cad.nome;
      data = { mode: "convite", uid: targetUid, invite: await inviteHash(code!), nome: cad.nome, email: inv!.email, nova: true, cadastro: cad };
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
    s = await sessionStmt(env, uid, req, "passkey", now, { cond: used, condArgs: usedArgs, reauth: true });
    const cad = d.cadastro;
    if (d.mode === "convite" && !cad) throw new HttpError(400, "desafio inválido");
    const stmts = d.mode === "convite"
      ? [
        env.DB.prepare(`INSERT INTO user (id, email, name, sobrenome, sexo, nascimento, role, created_at, last_seen_at) SELECT ?1, ?2, ?3, ?7, ?8, ?9, 'user', ?4, ?4
          WHERE (SELECT COUNT(*) FROM user) < ?5 AND EXISTS (SELECT 1 FROM invites WHERE code_hash = ?6 AND used_at IS NULL AND user_id IS NULL AND expires_at > ?4)`)
          .bind(uid, d.email ?? syntheticEmail(uid), d.nome!, now, max, ih, cad!.sobrenome, cad!.sexo, cad!.nascimento),
        env.DB.prepare("UPDATE invites SET used_by = ?2, used_at = ?3 WHERE code_hash = ?1 AND used_at IS NULL AND user_id IS NULL AND expires_at > ?3 AND EXISTS (SELECT 1 FROM user WHERE id = ?2)")
          .bind(ih, uid, now),
        ...await consentStmts(env, req, uid, now, used, usedArgs),
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
    const cad = d.cadastro;
    if (!cad || !d.email || !d.nova) throw new HttpError(400, "desafio inválido");
    const rc = await recoveryStmts(env, uid, now, cond, [uid]);
    s = await sessionStmt(env, uid, req, "passkey", now, { cond, condArgs: [uid], reauth: true });
    // #62: o dono nasce vazio, com o e-mail do OWNER_EMAIL (sem promover conta antiga: o caminho do Access saiu)
    const first = env.DB.prepare(`INSERT INTO user (id, email, name, sobrenome, sexo, nascimento, role, created_at, last_seen_at) SELECT ?1, ?2, ?3, ?6, ?7, ?8, 'owner', ?4, ?4
        WHERE (SELECT COUNT(*) FROM user) < ?5 AND NOT EXISTS (SELECT 1 FROM user WHERE role = 'owner') AND NOT EXISTS (SELECT 1 FROM passkeys)`)
      .bind(uid, d.email, d.nome!, now, max, cad.sobrenome, cad.sexo, cad.nascimento);
    try {
      await env.DB.batch([first, pkInsert(cond, [uid]), ...rc.stmts, ...await consentStmts(env, req, uid, now, cond, [uid]), s.stmt]);
    } catch (e) {
      if (e instanceof Error && /UNIQUE/i.test(e.message)) throw new HttpError(409, "já existe uma conta com este e-mail; apague-a antes (scripts/limpar-legado.mjs)");
      throw e;
    }
    if (!(await env.DB.prepare("SELECT 1 FROM passkeys WHERE id = ?1 AND user_id = ?2").bind(pk.id, uid).first())) throw new HttpError(403, "o primeiro acesso já foi feito");
    codes = rc.codes;
  } else {
    if (!c.uid || c.uid !== uid) throw new HttpError(400, "desafio inválido");
    const cond = "(SELECT COUNT(*) FROM passkeys WHERE user_id = ?1) < ?2";
    s = await sessionStmt(env, uid, req, "passkey", now, { cond: "EXISTS (SELECT 1 FROM passkeys WHERE id = ?1 AND user_id = ?2)", condArgs: [pk.id, uid], reauth: true });
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
      env.DB.prepare("SELECT id, created_at, expires_at, last_seen_at, user_agent, via, aviso_ok FROM sessions WHERE user_id = ?1 AND expires_at > ?2 AND created_at > ?3 ORDER BY COALESCE(last_seen_at, created_at) DESC LIMIT 50").bind(u.id, Date.now(), Date.now() - SESSION_MAX_MS),
      env.DB.prepare("SELECT id, created_at, last_used_at, synced, transports FROM passkeys WHERE user_id = ?1 ORDER BY created_at").bind(u.id),
      env.DB.prepare("SELECT COUNT(*) AS n FROM recovery_codes WHERE user_id = ?1 AND used_at IS NULL").bind(u.id),
    ]);
    type S = { id: string; created_at: number; expires_at: number; last_seen_at: number | null; user_agent: string | null; via: string; aviso_ok: number | null };
    type P = { id: string; created_at: number; last_used_at: number | null; synced: number; transports: string };
    return json({
      // #62 aviso = login em aparelho novo ainda não confirmado ("Fui eu" / "Não fui eu"); a própria sessão nunca avisa a si mesma
      sessions: (s.results as S[]).map((r) => ({ id: r.id, aparelho: aparelhoDe(r.user_agent), createdAt: r.created_at, lastSeenAt: r.last_seen_at, expiresAt: r.expires_at, via: r.via, atual: r.id === u.sessionId, aviso: r.aviso_ok == null && r.id !== u.sessionId })),
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

  // #62 "Fui eu": o aviso de login em aparelho novo some
  on("POST", "/api/account/sessions/:id/ok", async (_req, env, p, u) => {
    const r = await env.DB.prepare("UPDATE sessions SET aviso_ok = ?3 WHERE id = ?1 AND user_id = ?2").bind(p.id, u.id, Date.now()).run();
    if (!r.meta.changes) throw new HttpError(404, "sessão não encontrada");
    return json({ ok: true });
  });

  // "Sair de todos" (e "Não fui eu"): toda sessão da conta (inclusive esta) deixa de valer na hora. Tokens do Claude ficam (revogue em Conta).
  on("POST", "/api/account/logout-all", async (_req, env, _p, u) => {
    exigirFaceId(u);
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
    exigirFaceId(u); // #62: ver os códigos de recuperação pede Face ID
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
      env.DB.prepare("SELECT id, email, nome, user_id, created_at, expires_at FROM invites WHERE created_by = ?1 AND used_at IS NULL AND expires_at > ?2 ORDER BY created_at DESC LIMIT 50").bind(u.id, now),
    ]);
    type R = { id: string; name: string | null; role: string; created_at: number; last_seen_at: number | null };
    type I = { id: string; email: string | null; nome: string | null; user_id: string | null; created_at: number; expires_at: number };
    return json({
      vagas: vagas(pp.results.length, maxUsersOf(env)),
      people: (pp.results as R[]).map((r) => ({ id: r.id, nome: r.name ?? "Sem nome", role: r.role, createdAt: r.created_at, lastSeenAt: r.last_seen_at, eu: r.id === u.id })),
      invites: (inv.results as I[]).map((r) => ({ id: r.id, email: r.email, nome: r.nome, reset: !!r.user_id, createdAt: r.created_at, expiresAt: r.expires_at })),
    });
  });

  on("POST", "/api/account/invites", async (req, env, _p, u) => {
    owner(u);
    exigirFaceId(u); // #62: convidar pede Face ID
    const b = await readJson<Record<string, unknown>>(req, 2 * 1024);
    // #62: convite amarrado ao e-mail e com o nome de quem foi convidado (aparece nas boas-vindas)
    const email = emailValido(str(b.email, "email", 254));
    if (!email) throw new HttpError(400, "e-mail inválido");
    const nome = nomeValido(b.nome);
    if (!nome) throw new HttpError(400, "nome de 1 a 40 letras");
    const max = maxUsersOf(env);
    if ((await countUsers(env)) >= max) throw new HttpError(409, `sem vagas: o app aceita até ${max} contas`, "sem_vagas");
    if (await env.DB.prepare("SELECT 1 FROM user WHERE email = ?1").bind(email).first()) throw new HttpError(409, "já existe uma conta com este e-mail");
    return json(await createInvite(req, env, u.id, null, email, nome), 201);
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
    exigirFaceId(u);
    if (p.id === u.id) throw new HttpError(400, "para você mesmo, use um código de recuperação ou adicione uma passkey");
    const t = await env.DB.prepare("SELECT id FROM user WHERE id = ?1").bind(p.id).first<{ id: string }>();
    if (!t) throw new HttpError(404, "pessoa não encontrada");
    // sessões caem e os tokens do Claude dela são revogados agora (quem tinha acesso perde tudo); os dados ficam
    await env.DB.batch([
      env.DB.prepare("DELETE FROM sessions WHERE user_id = ?1").bind(t.id),
      env.DB.prepare("UPDATE mcp_token SET revoked_at = ?2 WHERE user_id = ?1 AND revoked_at IS NULL").bind(t.id, Date.now()),
    ]);
    return json(await createInvite(req, env, u.id, t.id, null, null), 201);
  });

  // #62 Conta → Perfil: nome, sobrenome, sexo, nascimento, altura e peso (todos editáveis; os três primeiros não ficam vazios)
  on("PATCH", "/api/account/perfil", async (req, env, _p, u) => {
    const b = await readJson<Record<string, unknown>>(req, 2 * 1024);
    const r = validarPerfilConta(b, new Date().toISOString().slice(0, 10));
    if (!r.ok) throw new HttpError(400, r.erros.join("; "));
    const v = r.valor, has = (k: keyof typeof v) => Object.prototype.hasOwnProperty.call(v, k) ? 1 : 0;
    // CASE WHEN ?n THEN valor ELSE coluna: só o que veio muda; tudo com bind
    await env.DB.prepare(`UPDATE user SET name = CASE WHEN ?2 THEN ?3 ELSE name END, sobrenome = CASE WHEN ?4 THEN ?5 ELSE sobrenome END,
        sexo = CASE WHEN ?6 THEN ?7 ELSE sexo END, nascimento = CASE WHEN ?8 THEN ?9 ELSE nascimento END,
        altura_cm = CASE WHEN ?10 THEN ?11 ELSE altura_cm END, peso_kg = CASE WHEN ?12 THEN ?13 ELSE peso_kg END WHERE id = ?1`)
      .bind(u.id, has("nome"), v.nome ?? null, has("sobrenome"), v.sobrenome ?? null, has("sexo"), v.sexo ?? null,
        has("nascimento"), v.nascimento ?? null, has("alturaCm"), v.alturaCm ?? null, has("pesoKg"), v.pesoKg ?? null).run();
    return json({ ok: true, perfil: await perfilConta(env, u.id) });
  });

  // #62 aceite (de novo) da versão vigente dos termos e da privacidade
  on("POST", "/api/account/consent", async (req, env, _p, u) => {
    const b = await readJson<Record<string, unknown>>(req, 1024);
    if (consentPendente(CONSENT_DOCS.map((d) => ({ doc: d, versao: String(b[d] ?? "") }))).length) throw new HttpError(400, "aceite a versão vigente dos termos e da privacidade", "aceite");
    await env.DB.batch(await consentStmts(env, req, u.id, Date.now()));
    return json({ ok: true, versoes: CONSENT_VERSAO });
  });
}

/** #62 dados da conta (Conta → Perfil e o avatar). Nunca dado de outra conta. */
export async function perfilConta(env: Env, uid: string) {
  const r = await env.DB.prepare("SELECT name, sobrenome, sexo, nascimento, altura_cm, peso_kg FROM user WHERE id = ?1").bind(uid)
    .first<{ name: string | null; sobrenome: string | null; sexo: string | null; nascimento: string | null; altura_cm: number | null; peso_kg: number | null }>();
  return { nome: r?.name ?? null, sobrenome: r?.sobrenome ?? null, sexo: r?.sexo ?? null, nascimento: r?.nascimento ?? null, alturaCm: r?.altura_cm ?? null, pesoKg: r?.peso_kg ?? null };
}

async function createInvite(req: Request, env: Env, by: string, forUid: string | null, email: string | null, nome: string | null) {
  const code = newCode(INVITE_LEN), now = Date.now(), id = hex(rnd(8));
  await env.DB.prepare("INSERT INTO invites (code_hash, id, created_by, user_id, email, nome, created_at, expires_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)")
    .bind(await inviteHash(code), id, by, forUid, email, nome, now, now + INVITE_MS).run();
  const shown = formatCode(code);
  return { id, codigo: shown, expiresAt: now + INVITE_MS, link: `${new URL(req.url).origin}/#convite/${shown}`, aviso: "envie agora: o código não aparece de novo" };
}

/** Limpeza (cron de hora em hora): sessões vencidas, desafios velhos, convites vencidos há 30 dias e contadores antigos. */
export async function purgeAuth(env: Env, now = Date.now()) {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE expires_at <= ?1 OR created_at <= ?2").bind(now, now - SESSION_MAX_MS),
    env.DB.prepare("DELETE FROM auth_challenge WHERE expires_at <= ?1").bind(now),
    env.DB.prepare("DELETE FROM invites WHERE used_at IS NULL AND expires_at <= ?1").bind(now - 30 * 86_400_000),
    env.DB.prepare("DELETE FROM auth_rate_limit WHERE window_start <= ?1").bind(now - AUTH_LIMIT.windowMs),
  ]);
}
