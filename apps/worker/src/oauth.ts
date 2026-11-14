// #66 OAuth 2.1 do MCP no Worker (spec de autorização do MCP 2026-07-28). Conectar = colar a URL do /mcp no claude.ai,
// que descobre tudo sozinho: 401 com WWW-Authenticate → /.well-known/oauth-protected-resource → /.well-known/oauth-authorization-server
// → registro dinâmico → /oauth/authorize (tela /autorizar com a sessão ou o Face ID) → /oauth/token com PKCE S256.
// A conexão vira uma linha de mcp_token (kind 'oauth'): mesma lista da Conta, revogável igual à chave manual (#55).
// Todo SQL com bind; segredos só como SHA-256; nada de dado pessoal em log. Regras puras em packages/core/src/oauth.ts.
import {
  OAUTH, grantsParaRevogar, listaRedirects, metadataRecurso, redirectPermitido, metadataServidor, recursoValido, redirecionar, tokenValido,
  validarPedidoAutorizacao, validarRegistro, verifierValido,
} from "@ciclo/core";
import type { AuthUser, Env } from "./env.ts";
import { HttpError, json, readForm, readJson, str } from "./http.ts";
import { sha256Hex, timingSafeEqualHex } from "./auth.ts";
import { chaveIp, contarJanela } from "./limites.ts";
import { exigirFaceId } from "./auth-conta.ts";

const te = new TextEncoder();
const rnd = (n: number) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, "0")).join("");
const b64url = (u8: Uint8Array) => btoa(String.fromCharCode(...u8)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
/** PKCE S256: BASE64URL(SHA-256(verifier)). */
export const s256 = async (verifier: string) => b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", te.encode(verifier))));

/** Limite por origem nos endpoints públicos (registro, authorize, token, revoke). */
export const OAUTH_LIMITE = { max: 30, windowMs: 10 * 60_000 } as const;
/** Teto de clientes registrados (o cron limpa os sem conexão há 30 dias). */
export const OAUTH_MAX_CLIENTES = 200;
const CLIENTE_OCIOSO_MS = 30 * 86_400_000;

const ACCESS_RE = /^ciclo_([0-9a-f]{16})_[0-9a-f]{64}$/;
const REFRESH_RE = /^ciclor_([0-9a-f]{16})_[0-9a-f]{64}$/;

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Authorization, Content-Type, MCP-Protocol-Version", "Access-Control-Max-Age": "86400" };
const cors = (r: Response) => { for (const [k, v] of Object.entries(CORS)) r.headers.set(k, v); return r; };
const oErro = (error: string, descricao: string, status = 400, extra: Record<string, string> = {}) => json({ error, error_description: descricao }, status, extra);
const ir = (location: string) => new Response(null, { status: 302, headers: { Location: location, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
const texto = (msg: string, status = 400) => new Response(msg, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'" } });

type Quem = (req: Request, env: Env) => Promise<AuthUser | null>;
type ClienteRow = { id: string; name: string; redirect_uris: string; auth_method: string; secret_hash: string | null };

async function limite(env: Env, req: Request, rota: string) {
  const espera = await contarJanela(env, `oauth:${rota}:${await chaveIp(env, req)}`, OAUTH_LIMITE);
  if (espera) throw new HttpError(429, "muitas tentativas; tente de novo em instantes");
}

const cliente = (env: Env, id: unknown) =>
  typeof id === "string" && /^[0-9a-f]{16,64}$/.test(id)
    ? env.DB.prepare("SELECT id, name, redirect_uris, auth_method, secret_hash FROM oauth_client WHERE id = ?1").bind(id).first<ClienteRow>()
    : Promise.resolve(null);

/** Roteador de /.well-known/* e /oauth/*. null = não é rota daqui. */
export async function handleOauth(req: Request, env: Env, quem: Quem, now = Date.now()): Promise<Response | null> {
  const url = new URL(req.url), p = url.pathname, origin = url.origin;
  const publico = p.startsWith("/.well-known/") || p === "/oauth/register" || p === "/oauth/token" || p === "/oauth/revoke";
  if (req.method === "OPTIONS" && publico) return cors(new Response(null, { status: 204 }));
  try {
    if (req.method === "GET" && (p === "/.well-known/oauth-protected-resource" || p === "/.well-known/oauth-protected-resource/mcp"))
      return cors(json(metadataRecurso(origin), 200, { "Cache-Control": "public, max-age=3600" }));
    if (req.method === "GET" && (p === "/.well-known/oauth-authorization-server" || p === "/.well-known/openid-configuration"))
      return cors(json(metadataServidor(origin), 200, { "Cache-Control": "public, max-age=3600" }));
    if (p.startsWith("/.well-known/")) return null;

    if (p === "/oauth/register" && req.method === "POST") return cors(await registrar(req, env, now));
    if (p === "/oauth/authorize" && req.method === "GET") return await autorizar(req, env, url, now);
    if (p === "/oauth/token" && req.method === "POST") return cors(await token(req, env, origin, now));
    if (p === "/oauth/revoke" && req.method === "POST") return cors(await revogar(req, env, now));
    if (p.startsWith("/oauth/pedido/") && req.method === "GET") return await pedidoInfo(req, env, quem, p.slice("/oauth/pedido/".length), now);
    if (p === "/oauth/decidir" && req.method === "POST") return await decidir(req, env, quem, origin, now);
    return p.startsWith("/oauth/") ? json({ error: "rota não encontrada" }, 404) : null;
  } catch (e) {
    if (e instanceof HttpError) {
      const r = e.status === 429 ? oErro("slow_down", e.message, 429, { "Retry-After": "60" }) : oErro(e.status === 401 ? "invalid_client" : "invalid_request", e.message, e.status);
      return publico ? cors(r) : r;
    }
    return json({ error: "server_error" }, 500);
  }
}

// ---- RFC 7591: registro dinâmico ----
async function registrar(req: Request, env: Env, now: number): Promise<Response> {
  await limite(env, req, "register");
  const v = validarRegistro(await readJson(req, 8 * 1024), listaRedirects(env.OAUTH_REDIRECT_HOSTS));
  if (!v.ok) return oErro(v.erro, v.descricao);
  const id = rnd(16);
  const secret = v.value.metodo === "none" ? null : rnd(32);
  // clientes que nunca obtiveram token somem em 1 h; o teto vale no próprio INSERT (atômico, sem corrida)
  const [, ins] = await env.DB.batch([
    env.DB.prepare("DELETE FROM oauth_client WHERE last_used_at IS NULL AND created_at < ?1").bind(now - OAUTH.clienteSemUsoMs),
    env.DB.prepare("INSERT INTO oauth_client (id, name, redirect_uris, auth_method, secret_hash, created_at) SELECT ?1, ?2, ?3, ?4, ?5, ?6 WHERE (SELECT COUNT(*) FROM oauth_client) < ?7 RETURNING id")
      .bind(id, v.value.nome, JSON.stringify(v.value.redirectUris), v.value.metodo, secret ? await sha256Hex(secret) : null, now, OAUTH_MAX_CLIENTES),
  ]);
  if (!ins.results?.length) return oErro("temporarily_unavailable", "muitos clientes registrados; tente mais tarde", 503);
  return json({
    client_id: id, client_id_issued_at: Math.floor(now / 1000), client_name: v.value.nome, redirect_uris: v.value.redirectUris,
    grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: v.value.metodo,
    ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
  }, 201);
}

// ---- GET /oauth/authorize → tela /autorizar ----
async function autorizar(req: Request, env: Env, url: URL, now: number): Promise<Response> {
  await limite(env, req, "authorize");
  const q = Object.fromEntries(url.searchParams);
  const c = await cliente(env, q.client_id);
  if (!c) return texto("Conexão inválida: este aplicativo não está registrado no Ciclo. Volte ao Claude e adicione o conector de novo.");
  const v = validarPedidoAutorizacao(q, { redirectUris: JSON.parse(c.redirect_uris) as string[], permitidos: listaRedirects(env.OAUTH_REDIRECT_HOSTS) }, url.origin);
  if (!v.ok) {
    if (!v.redirecionavel) return texto(`Conexão inválida: ${v.descricao}. Volte ao Claude e tente de novo.`);
    return ir(redirecionar(v.redirectUri, { error: v.erro, error_description: v.descricao, state: v.state, iss: url.origin }));
  }
  const rid = rnd(16);
  await env.DB.prepare("INSERT INTO oauth_request (id, client_id, redirect_uri, code_challenge, state, resource, expires_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)")
    .bind(rid, c.id, v.value.redirectUri, v.value.challenge, v.value.state, v.value.resource, now + OAUTH.pedidoMs).run();
  return ir(`/autorizar?req=${rid}`);
}

const pedidoId = (v: unknown) => (typeof v === "string" && /^[0-9a-f]{32}$/.test(v) ? v : null);

/** Dados da tela de consentimento: para onde volta (o host é a identidade; o client_name não, qualquer um escolhe),
 *  se está na allowlist e se já há sessão. Sem segredo nenhum. */
async function pedidoInfo(req: Request, env: Env, quem: Quem, id: string, now: number): Promise<Response> {
  const rid = pedidoId(id);
  const r = rid ? await env.DB.prepare("SELECT redirect_uri FROM oauth_request WHERE id = ?1 AND expires_at > ?2").bind(rid, now).first<{ redirect_uri: string }>() : null;
  if (!r) return json({ error: "pedido vencido ou inválido: volte ao Claude e tente de novo", code: "vencido" }, 404);
  const u = await quem(req, env).catch(() => null);
  const verificado = redirectPermitido(r.redirect_uri, listaRedirects(env.OAUTH_REDIRECT_HOSTS)) === "verificado";
  return json({ destino: new URL(r.redirect_uri).host, verificado, conta: u ? { nome: u.name } : null });
}

/** POST /oauth/decidir {req, permitir}: só com sessão. Devolve para onde o navegador vai (o app do Claude). */
async function decidir(req: Request, env: Env, quem: Quem, origin: string, now: number): Promise<Response> {
  // falha fechada: só a própria página (/autorizar) decide
  if (req.headers.get("Origin") !== origin && req.headers.get("Sec-Fetch-Site") !== "same-origin") return json({ error: "origem inválida" }, 403);
  const b = await readJson<Record<string, unknown>>(req, 2 * 1024);
  const rid = pedidoId(b.req);
  if (!rid) throw new HttpError(400, "req inválido");
  // negar não precisa de conta; permitir pede o Face ID agora, mesmo com sessão ativa
  // (o pedido não é consumido: a tela faz a passkey e tenta de novo)
  const u = b.permitir === true ? await quem(req, env).catch(() => null) : null;
  if (b.permitir === true) {
    if (!u) return json({ error: "entre com o Face ID primeiro", code: "entrar" }, 401);
    // #62: o mesmo Face ID recente das ações sensíveis (exigirFaceId); MCP sem aceite dos termos fica bloqueado (#62)
    try { exigirFaceId(u, now); } catch { return json({ error: "confirme com o Face ID", code: "reauth" }, 403); }
    if (u.aceitePendente) return json({ error: "aceite os termos e a privacidade atualizados no app do Ciclo antes de conectar", code: "aceite" }, 403);
  }
  // uso único: o pedido sai na mesma leitura (não dá para permitir duas vezes)
  const r = await env.DB.prepare("DELETE FROM oauth_request WHERE id = ?1 RETURNING client_id, redirect_uri, code_challenge, state, resource, expires_at").bind(rid)
    .first<{ client_id: string; redirect_uri: string; code_challenge: string; state: string | null; resource: string | null; expires_at: number }>();
  if (!r || r.expires_at <= now) return json({ error: "pedido vencido: volte ao Claude e tente de novo", code: "vencido" }, 404);
  if (b.permitir !== true) return json({ redirect: redirecionar(r.redirect_uri, { error: "access_denied", error_description: "a pessoa não permitiu", state: r.state, iss: origin }) });
  const code = rnd(32);
  await env.DB.prepare("INSERT INTO oauth_code (code_hash, user_id, client_id, redirect_uri, code_challenge, resource, expires_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)")
    .bind(await sha256Hex(code), u!.id, r.client_id, r.redirect_uri, r.code_challenge, r.resource, now + OAUTH.codigoMs).run();
  return json({ redirect: redirecionar(r.redirect_uri, { code, state: r.state, iss: origin }) });
}

// ---- /oauth/token ----
/** Autentica o cliente no /token: público (client_id), client_secret_post ou client_secret_basic. */
async function autenticarCliente(req: Request, env: Env, f: Record<string, string>): Promise<ClienteRow> {
  let id = f.client_id, secret = f.client_secret;
  const basic = /^Basic\s+(.+)$/i.exec(req.headers.get("Authorization") ?? "");
  if (basic) {
    try { const [a, ...s] = atob(basic[1]).split(":"); id = decodeURIComponent(a); secret = decodeURIComponent(s.join(":")); } catch { throw new HttpError(401, "Authorization Basic inválido"); }
  }
  const c = await cliente(env, id);
  if (!c) throw new HttpError(401, "cliente desconhecido");
  if (c.auth_method !== "none") {
    if (!secret || !c.secret_hash || !timingSafeEqualHex(await sha256Hex(secret), c.secret_hash)) throw new HttpError(401, "client_secret inválido");
  }
  return c;
}

async function emitir(env: Env, uid: string, c: ClienteRow, now: number) {
  // teto de conexões OAuth por pessoa: a mais antiga sai para caber a nova (a chave manual não conta)
  const { results } = await env.DB.prepare("SELECT id, created_at AS createdAt FROM mcp_token WHERE user_id = ?1 AND kind = 'oauth' AND revoked_at IS NULL ORDER BY created_at, rowid").bind(uid).all<{ id: string; createdAt: number }>();
  const sair = grantsParaRevogar(results, OAUTH.maxGrants);
  const id = rnd(8), access = `ciclo_${id}_${rnd(32)}`, refresh = `ciclor_${id}_${rnd(32)}`;
  await env.DB.batch([
    ...sair.map((t) => env.DB.prepare("UPDATE mcp_token SET revoked_at = ?3 WHERE id = ?1 AND user_id = ?2").bind(t, uid, now)),
    env.DB.prepare("INSERT INTO mcp_token (id, user_id, hash, label, created_at, kind, client_id, refresh_hash, expires_at) VALUES (?1, ?2, ?3, ?4, ?5, 'oauth', ?6, ?7, ?8)")
      .bind(id, uid, await sha256Hex(access), `Conector · ${c.name}`.slice(0, 60), now, c.id, await sha256Hex(refresh), now + OAUTH.acessoS * 1000),
    env.DB.prepare("UPDATE oauth_client SET last_used_at = ?2 WHERE id = ?1").bind(c.id, now),
  ]);
  return { access_token: access, token_type: "Bearer", expires_in: OAUTH.acessoS, refresh_token: refresh, scope: OAUTH.escopo };
}

async function token(req: Request, env: Env, origin: string, now: number): Promise<Response> {
  await limite(env, req, "token");
  const f = await readForm(req);
  const c = await autenticarCliente(req, env, f);
  if (f.resource != null && !recursoValido(f.resource, origin)) return oErro("invalid_target", "resource não é este servidor");

  if (f.grant_type === "authorization_code") {
    if (typeof f.code !== "string" || !/^[0-9a-f]{64}$/.test(f.code)) return oErro("invalid_grant", "código inválido");
    if (!verifierValido(f.code_verifier)) return oErro("invalid_grant", "code_verifier inválido");
    // uso único: o código sai na mesma leitura, mesmo que o resto falhe (código vazado não serve duas vezes)
    const k = await env.DB.prepare("DELETE FROM oauth_code WHERE code_hash = ?1 RETURNING user_id, client_id, redirect_uri, code_challenge, expires_at").bind(await sha256Hex(f.code))
      .first<{ user_id: string; client_id: string; redirect_uri: string; code_challenge: string; expires_at: number }>();
    if (!k || k.expires_at <= now) return oErro("invalid_grant", "código vencido ou já usado");
    if (k.client_id !== c.id) return oErro("invalid_grant", "código de outro cliente");
    if (f.redirect_uri != null && f.redirect_uri !== k.redirect_uri) return oErro("invalid_grant", "redirect_uri diferente da autorização");
    if (!timingSafeEqualHex(await s256(f.code_verifier), k.code_challenge)) return oErro("invalid_grant", "PKCE não confere");
    const u = await env.DB.prepare("SELECT id FROM user WHERE id = ?1 AND deleted_at IS NULL").bind(k.user_id).first<{ id: string }>();
    if (!u) return oErro("invalid_grant", "conta não existe mais");
    return json(await emitir(env, u.id, c, now));
  }

  if (f.grant_type === "refresh_token") {
    const m = REFRESH_RE.exec(f.refresh_token ?? "");
    if (!m) return oErro("invalid_grant", "refresh_token inválido");
    const row = await env.DB.prepare(`SELECT t.id, t.user_id, t.client_id, t.refresh_hash, t.created_at, t.last_used_at, u.deleted_at FROM mcp_token t JOIN user u ON u.id = t.user_id
      WHERE t.id = ?1 AND t.kind = 'oauth' AND t.revoked_at IS NULL`).bind(m[1])
      .first<{ id: string; user_id: string; client_id: string; refresh_hash: string | null; created_at: number; last_used_at: number | null; deleted_at: number | null }>();
    if (!row || row.client_id !== c.id || row.deleted_at != null) return oErro("invalid_grant", "refresh_token inválido");
    const got = await sha256Hex(f.refresh_token);
    if (!row.refresh_hash || !timingSafeEqualHex(got, row.refresh_hash)) {
      // refresh já girado sendo reusado = possível roubo: derruba a conexão (OAuth 2.1 §4.3.1)
      await env.DB.prepare("UPDATE mcp_token SET revoked_at = ?2 WHERE id = ?1 AND revoked_at IS NULL").bind(row.id, now).run();
      return oErro("invalid_grant", "refresh_token reusado: conexão revogada");
    }
    if (!tokenValido({ createdAt: row.created_at, lastUsedAt: row.last_used_at, revokedAt: null }, now)) return oErro("invalid_grant", "conexão expirou por falta de uso");
    const access = `ciclo_${row.id}_${rnd(32)}`, refresh = `ciclor_${row.id}_${rnd(32)}`;
    const up = await env.DB.prepare("UPDATE mcp_token SET hash = ?3, refresh_hash = ?4, expires_at = ?5, last_used_at = ?6 WHERE id = ?1 AND refresh_hash = ?2 AND revoked_at IS NULL")
      .bind(row.id, row.refresh_hash, await sha256Hex(access), await sha256Hex(refresh), now + OAUTH.acessoS * 1000, now).run();
    if (!up.meta.changes) return oErro("invalid_grant", "refresh_token já usado");
    return json({ access_token: access, token_type: "Bearer", expires_in: OAUTH.acessoS, refresh_token: refresh, scope: OAUTH.escopo });
  }
  return oErro("unsupported_grant_type", "use authorization_code ou refresh_token");
}

// ---- RFC 7009: revogação (sempre 200, mesmo para token desconhecido) ----
async function revogar(req: Request, env: Env, now: number): Promise<Response> {
  await limite(env, req, "revoke");
  const f = await readForm(req);
  const t = str(f.token, "token", 200) ?? "";
  const m = ACCESS_RE.exec(t) ?? REFRESH_RE.exec(t);
  if (m) {
    const h = await sha256Hex(t);
    await env.DB.prepare("UPDATE mcp_token SET revoked_at = ?3 WHERE id = ?1 AND kind = 'oauth' AND (hash = ?2 OR refresh_hash = ?2) AND revoked_at IS NULL").bind(m[1], h, now).run();
  }
  return new Response(null, { status: 200, headers: { "Cache-Control": "no-store" } });
}

/** Cron: pedidos e códigos vencidos; clientes sem token em 1 h; clientes sem conexão ativa há 30 dias. */
export async function purgeOauth(env: Env, now = Date.now()) {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM oauth_request WHERE expires_at <= ?1").bind(now),
    env.DB.prepare("DELETE FROM oauth_code WHERE expires_at <= ?1").bind(now),
    env.DB.prepare("DELETE FROM oauth_client WHERE last_used_at IS NULL AND created_at < ?1").bind(now - OAUTH.clienteSemUsoMs), // nunca obteve token: 1 h
    env.DB.prepare(`DELETE FROM oauth_client WHERE COALESCE(last_used_at, created_at) < ?1
      AND NOT EXISTS (SELECT 1 FROM mcp_token t WHERE t.client_id = oauth_client.id AND t.revoked_at IS NULL)`).bind(now - CLIENTE_OCIOSO_MS),
  ]);
}

