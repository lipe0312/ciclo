// #66 OAuth 2.1 do MCP de ponta a ponta no Worker real: 401 com WWW-Authenticate → metadata → registro dinâmico →
// authorize → tela (sessão) → código → token com PKCE S256 → /mcp; refresh girado, reuso derruba, revogar na Conta,
// isolamento entre contas e a chave manual (#55) segue valendo. Tudo fictício.
import { test } from "node:test";
import assert from "node:assert/strict";
import { OAUTH } from "@ciclo/core";
import { call, mcp } from "./fakes.ts";
import { contaPorConvite, dono, entrar, envConta, ip } from "./conta-helpers.ts";
import { purgeOauth, s256 } from "../src/oauth.ts";

const O = "http://localhost:8791";
const CB = "https://claude.ai/api/mcp/auth_callback";
const VERIFIER = "verificador-ficticio-".padEnd(64, "x");
const form = (o: Record<string, string>) => new URLSearchParams(o).toString();
const post = (env: unknown, path: string, body: Record<string, string>, headers: Record<string, string> = {}) =>
  call(env, "POST", path, { raw: new TextEncoder().encode(form(body)), ct: "application/x-www-form-urlencoded", headers: { ...ip(), ...headers } });

async function registrarCliente(env: unknown, extra: Record<string, unknown> = {}) {
  const r = await call(env, "POST", "/oauth/register", { body: { client_name: "Claude", redirect_uris: [CB], grant_types: ["authorization_code", "refresh_token"], ...extra }, headers: ip() });
  assert.equal(r.status, 201, r.text);
  return r.data as { client_id: string; client_secret?: string };
}

/** authorize → (tela) decidir com a sessão → código na redirect_uri. */
async function autorizar(env: unknown, clientId: string, cookie: string, o: { permitir?: boolean; state?: string } = {}) {
  const q = new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: CB, code_challenge: await s256(VERIFIER), code_challenge_method: "S256", state: o.state ?? "estado-1", scope: "ciclo", resource: `${O}/mcp` });
  const a = await call(env, "GET", `/oauth/authorize?${q}`, { headers: ip() });
  assert.equal(a.status, 302, a.text);
  const loc = a.headers.get("location")!;
  assert.match(loc, /^\/autorizar\?req=[0-9a-f]{32}$/);
  const req = loc.split("=")[1];
  const info = await call(env, "GET", `/oauth/pedido/${req}`, { headers: { Cookie: cookie } });
  assert.equal(info.status, 200); assert.equal(info.data.destino, "claude.ai"); assert.equal(info.data.verificado, true);
  assert.equal(info.data.cliente, undefined, "o client_name não é identidade: a tela mostra o destino");
  const d = await call(env, "POST", "/oauth/decidir", { body: { req, permitir: o.permitir ?? true }, headers: { Cookie: cookie, Origin: O } });
  assert.equal(d.status, 200, d.text);
  return new URL(d.data.redirect);
}

async function trocar(env: unknown, clientId: string, code: string, extra: Record<string, string> = {}) {
  return post(env, "/oauth/token", { grant_type: "authorization_code", code, redirect_uri: CB, client_id: clientId, code_verifier: VERIFIER, resource: `${O}/mcp`, ...extra });
}

test("descoberta: /mcp sem token → 401 com resource_metadata; metadata do recurso e do servidor", async () => {
  const env = envConta();
  const r = await call(env, "POST", "/mcp", { body: { jsonrpc: "2.0", id: 1, method: "tools/list" } });
  assert.equal(r.status, 401);
  const h = r.headers.get("www-authenticate")!;
  assert.ok(h.includes(`resource_metadata="${O}/.well-known/oauth-protected-resource/mcp"`), h);
  for (const p of ["/.well-known/oauth-protected-resource/mcp", "/.well-known/oauth-protected-resource"]) {
    const m = await call(env, "GET", p);
    assert.equal(m.status, 200); assert.equal(m.data.resource, `${O}/mcp`); assert.deepEqual(m.data.authorization_servers, [O]);
    assert.equal(m.headers.get("access-control-allow-origin"), "*");
  }
  const s = await call(env, "GET", "/.well-known/oauth-authorization-server");
  assert.equal(s.data.issuer, O); assert.deepEqual(s.data.code_challenge_methods_supported, ["S256"]);
  assert.equal(s.data.registration_endpoint, `${O}/oauth/register`);
  assert.equal((await call(env, "OPTIONS", "/oauth/token")).status, 204);
});

test("fluxo completo: registro → consentimento com a sessão → token PKCE → ferramentas do MCP da própria conta", async () => {
  const env = envConta();
  const d = await dono(env);
  const c = await registrarCliente(env);
  const volta = await autorizar(env, c.client_id, d.cookie);
  assert.equal(volta.origin + volta.pathname, CB);
  assert.equal(volta.searchParams.get("state"), "estado-1"); assert.equal(volta.searchParams.get("iss"), O);
  const code = volta.searchParams.get("code")!;
  const t = await trocar(env, c.client_id, code);
  assert.equal(t.status, 200, t.text);
  assert.equal(t.data.token_type, "Bearer"); assert.equal(t.data.expires_in, OAUTH.acessoS); assert.ok(t.data.refresh_token);
  assert.equal(t.headers.get("cache-control"), "no-store");
  const list = await call(env, "POST", "/mcp", { bearer: t.data.access_token, body: { jsonrpc: "2.0", id: 1, method: "tools/list" } });
  assert.equal(list.status, 200);
  const nomes = list.data.result.tools.map((x: { name: string }) => x.name);
  for (const n of ["ciclo_contexto", "ciclo_planejar_dia", "ciclo_salvar_treino_do_dia", "ciclo_responder_pedido", "ciclo_chat_pendentes"]) assert.ok(nomes.includes(n), n);
  // código é de uso único
  assert.equal((await trocar(env, c.client_id, code)).data.error, "invalid_grant");
  // a conexão aparece na Conta (mesma lista da chave manual) e não conta no teto das manuais
  const tk = (await call(env, "GET", "/api/account/tokens", { headers: { Cookie: d.cookie } })).data;
  assert.equal(tk.tokens.length, 1); assert.equal(tk.tokens[0].kind, "oauth"); assert.match(tk.tokens[0].label, /Conector/); assert.equal(tk.ativos, 0);
  assert.ok(!JSON.stringify(env.DB.raw.prepare("SELECT * FROM mcp_token").all()).includes(t.data.access_token), "só o hash fica no banco");
});

test("PKCE, cliente e redirect: verifier errado, outro cliente, redirect diferente e código vencido falham", async () => {
  const env = envConta();
  const d = await dono(env);
  const c = await registrarCliente(env), outro = await registrarCliente(env);
  const code1 = (await autorizar(env, c.client_id, d.cookie)).searchParams.get("code")!;
  assert.equal((await trocar(env, c.client_id, code1, { code_verifier: "outro-verificador-".padEnd(64, "y") })).data.error, "invalid_grant");
  const code2 = (await autorizar(env, c.client_id, d.cookie)).searchParams.get("code")!;
  assert.equal((await trocar(env, outro.client_id, code2)).data.error, "invalid_grant");
  const code3 = (await autorizar(env, c.client_id, d.cookie)).searchParams.get("code")!;
  assert.equal((await trocar(env, c.client_id, code3, { redirect_uri: "https://claude.ai/outra" })).data.error, "invalid_grant");
  const code4 = (await autorizar(env, c.client_id, d.cookie)).searchParams.get("code")!;
  env.DB.raw.prepare("UPDATE oauth_code SET expires_at = 1").run();
  assert.equal((await trocar(env, c.client_id, code4)).data.error, "invalid_grant");
  assert.equal((await trocar(env, c.client_id, "a".repeat(64), { resource: "https://outro.example/mcp" })).data.error, "invalid_target");
  assert.equal((await post(env, "/oauth/token", { grant_type: "password", client_id: c.client_id })).data.error, "unsupported_grant_type");
  assert.equal((await post(env, "/oauth/token", { grant_type: "authorization_code", client_id: "f".repeat(32) })).status, 401);
});

test("authorize: cliente ou redirect desconhecido nunca redireciona; erro do pedido volta com state e iss; sem PKCE recusa", async () => {
  const env = envConta();
  const c = await registrarCliente(env);
  const base = { response_type: "code", client_id: c.client_id, redirect_uri: CB, code_challenge: await s256(VERIFIER), code_challenge_method: "S256", state: "s1" };
  const semCliente = await call(env, "GET", `/oauth/authorize?${new URLSearchParams({ ...base, client_id: "0".repeat(32) })}`, { headers: ip() });
  assert.equal(semCliente.status, 400); assert.equal(semCliente.headers.get("location"), null);
  const mal = await call(env, "GET", `/oauth/authorize?${new URLSearchParams({ ...base, redirect_uri: "https://mal.example/cb" })}`, { headers: ip() });
  assert.equal(mal.status, 400); assert.equal(mal.headers.get("location"), null);
  const plain = await call(env, "GET", `/oauth/authorize?${new URLSearchParams({ ...base, code_challenge_method: "plain" })}`, { headers: ip() });
  assert.equal(plain.status, 302);
  assert.equal(plain.headers.get("cache-control"), "no-store"); assert.equal(plain.headers.get("referrer-policy"), "no-referrer");
  const u = new URL(plain.headers.get("location")!);
  assert.equal(u.searchParams.get("error"), "invalid_request"); assert.equal(u.searchParams.get("state"), "s1"); assert.equal(u.searchParams.get("iss"), O);
  // registro com redirect http fora do loopback é recusado
  const r = await call(env, "POST", "/oauth/register", { body: { redirect_uris: ["http://mal.example/cb"] }, headers: ip() });
  assert.equal(r.status, 400); assert.equal(r.data.error, "invalid_redirect_uri");
});

test("consentimento: sem sessão → 401 (entra com o Face ID); negar volta access_denied; pedido é de uso único", async () => {
  const env = envConta();
  const d = await dono(env);
  const c = await registrarCliente(env);
  const q = new URLSearchParams({ response_type: "code", client_id: c.client_id, redirect_uri: CB, code_challenge: await s256(VERIFIER), code_challenge_method: "S256" });
  const req = (await call(env, "GET", `/oauth/authorize?${q}`, { headers: ip() })).headers.get("location")!.split("=")[1];
  const info = await call(env, "GET", `/oauth/pedido/${req}`);
  assert.equal(info.status, 200); assert.equal(info.data.conta, null);
  assert.equal((await call(env, "POST", "/oauth/decidir", { body: { req, permitir: true }, headers: { Origin: O } })).status, 401);
  assert.equal((await call(env, "POST", "/oauth/decidir", { body: { req, permitir: true }, headers: { Cookie: d.cookie, Origin: "https://mal.example" } })).status, 403);
  const nao = await call(env, "POST", "/oauth/decidir", { body: { req, permitir: false }, headers: { Cookie: d.cookie, Origin: O } });
  assert.equal(new URL(nao.data.redirect).searchParams.get("error"), "access_denied");
  assert.equal((await call(env, "POST", "/oauth/decidir", { body: { req, permitir: true }, headers: { Cookie: d.cookie, Origin: O } })).status, 404, "uso único");
});

test("refresh: gira os dois tokens; o refresh antigo reusado derruba a conexão; access vencido → 401", async () => {
  const env = envConta();
  const d = await dono(env);
  const c = await registrarCliente(env);
  const t1 = (await trocar(env, c.client_id, (await autorizar(env, c.client_id, d.cookie)).searchParams.get("code")!)).data;
  const r = await post(env, "/oauth/token", { grant_type: "refresh_token", refresh_token: t1.refresh_token, client_id: c.client_id });
  assert.equal(r.status, 200, r.text);
  assert.notEqual(r.data.access_token, t1.access_token); assert.notEqual(r.data.refresh_token, t1.refresh_token);
  assert.equal((await mcp(env, t1.access_token, "ciclo_memoria_listar")).status, 401, "o access anterior caiu");
  assert.equal((await mcp(env, r.data.access_token, "ciclo_memoria_listar")).status, 200);
  // access vencido
  env.DB.raw.prepare("UPDATE mcp_token SET expires_at = 1").run();
  assert.equal((await mcp(env, r.data.access_token, "ciclo_memoria_listar")).status, 401);
  // reuso do refresh antigo = roubo provável: a conexão é revogada
  const reuso = await post(env, "/oauth/token", { grant_type: "refresh_token", refresh_token: t1.refresh_token, client_id: c.client_id });
  assert.equal(reuso.data.error, "invalid_grant");
  assert.equal((await post(env, "/oauth/token", { grant_type: "refresh_token", refresh_token: r.data.refresh_token, client_id: c.client_id })).data.error, "invalid_grant");
});

test("revogar: na Conta (DELETE da lista) ou pelo /oauth/revoke; a chave manual segue como plano B", async () => {
  const env = envConta();
  const d = await dono(env);
  const c = await registrarCliente(env);
  const t = (await trocar(env, c.client_id, (await autorizar(env, c.client_id, d.cookie)).searchParams.get("code")!)).data;
  const lista = (await call(env, "GET", "/api/account/tokens", { headers: { Cookie: d.cookie } })).data.tokens;
  assert.equal((await call(env, "DELETE", `/api/account/tokens/${lista[0].id}`, { headers: { Cookie: d.cookie, Origin: O } })).status, 200);
  assert.equal((await mcp(env, t.access_token, "ciclo_memoria_listar")).status, 401);
  assert.equal((await post(env, "/oauth/token", { grant_type: "refresh_token", refresh_token: t.refresh_token, client_id: c.client_id })).data.error, "invalid_grant");
  const t2 = (await trocar(env, c.client_id, (await autorizar(env, c.client_id, d.cookie)).searchParams.get("code")!)).data;
  assert.equal((await post(env, "/oauth/revoke", { token: t2.refresh_token })).status, 200);
  assert.equal((await mcp(env, t2.access_token, "ciclo_memoria_listar")).status, 401);
  assert.equal((await post(env, "/oauth/revoke", { token: "qualquer-coisa" })).status, 200, "token desconhecido também 200");
  const manual = await call(env, "POST", "/api/account/tokens", { body: { label: "manual" }, headers: { Cookie: d.cookie, Origin: O } });
  assert.equal(manual.status, 201);
  assert.equal((await mcp(env, manual.data.token, "ciclo_memoria_listar")).status, 200);
});

test("teto de conexões OAuth por pessoa e isolamento: o token de uma conta nunca vê a outra", async () => {
  const env = envConta();
  const d = await dono(env);
  const ana = await contaPorConvite(env, d.cookie, "Ana Fictícia");
  const c = await registrarCliente(env);
  const tokens: string[] = [];
  for (let i = 0; i < OAUTH.maxGrants + 1; i++) tokens.push((await trocar(env, c.client_id, (await autorizar(env, c.client_id, d.cookie)).searchParams.get("code")!)).data.access_token);
  assert.equal((await mcp(env, tokens[0], "ciclo_memoria_listar")).status, 401, "a mais antiga saiu");
  assert.equal((await mcp(env, tokens.at(-1)!, "ciclo_memoria_listar")).status, 200);
  const ativos = env.DB.raw.prepare("SELECT COUNT(*) AS n FROM mcp_token WHERE kind = 'oauth' AND revoked_at IS NULL").get().n;
  assert.equal(ativos, OAUTH.maxGrants);
  // memória gravada pela Ana não aparece para o token da dona
  const tAna = (await trocar(env, c.client_id, (await autorizar(env, c.client_id, ana.cookie)).searchParams.get("code")!)).data.access_token;
  assert.equal((await mcp(env, tAna, "ciclo_memoria_salvar", { fato: "prefere halteres (fictício)" })).status, 200);
  const daDona = JSON.parse((await mcp(env, tokens.at(-1)!, "ciclo_memoria_listar")).data.result.content[0].text);
  assert.equal(daDona.fatos.length, 0);
});

test("cliente confidencial (client_secret_basic) e limpeza do cron", async () => {
  const env = envConta();
  const d = await dono(env);
  const c = await registrarCliente(env, { token_endpoint_auth_method: "client_secret_basic" });
  assert.ok(c.client_secret);
  const code = (await autorizar(env, c.client_id, d.cookie)).searchParams.get("code")!;
  const semSegredo = await post(env, "/oauth/token", { grant_type: "authorization_code", code, redirect_uri: CB, client_id: c.client_id, code_verifier: VERIFIER });
  assert.equal(semSegredo.status, 401);
  const code2 = (await autorizar(env, c.client_id, d.cookie)).searchParams.get("code")!;
  const basic = "Basic " + btoa(`${c.client_id}:${c.client_secret}`);
  const ok = await post(env, "/oauth/token", { grant_type: "authorization_code", code: code2, redirect_uri: CB, code_verifier: VERIFIER }, { Authorization: basic });
  assert.equal(ok.status, 200, ok.text);
  // cron: cliente ocioso sem conexão ativa some; com conexão ativa fica
  const ocioso = await registrarCliente(env);
  env.DB.raw.prepare("UPDATE oauth_client SET created_at = 1, last_used_at = NULL WHERE id = ?1").run(ocioso.client_id);
  env.DB.raw.prepare("UPDATE oauth_client SET created_at = 1, last_used_at = 1 WHERE id = ?1").run(c.client_id);
  await purgeOauth(env);
  const ids = env.DB.raw.prepare("SELECT id FROM oauth_client").all().map((r: any) => r.id);
  assert.ok(!ids.includes(ocioso.client_id)); assert.ok(ids.includes(c.client_id));
});

test("apagar a conta leva as conexões e códigos OAuth junto", async () => {
  const env = envConta();
  const d = await dono(env);
  const c = await registrarCliente(env);
  await autorizar(env, c.client_id, d.cookie); // código pendente
  await trocar(env, c.client_id, (await autorizar(env, c.client_id, d.cookie)).searchParams.get("code")!);
  assert.equal((await call(env, "DELETE", "/api/account", { body: { confirm: "APAGAR" }, headers: { Cookie: d.cookie, Origin: O } })).status, 200);
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM oauth_code").get().n, 0);
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM mcp_token").get().n, 0);
});

test("B1 phishing: redirect de atacante é recusado no registro e no authorize, mesmo com o nome \"Claude\"", async () => {
  const env = envConta();
  for (const uri of ["https://atacante.example/api/mcp/auth_callback", "https://claude.ai.atacante.example/api/mcp/auth_callback", "https://claude.ai/outro"]) {
    const r = await call(env, "POST", "/oauth/register", { body: { client_name: "Claude", redirect_uris: [uri] }, headers: ip() });
    assert.equal(r.status, 400, uri); assert.equal(r.data.error, "invalid_redirect_uri");
  }
  // cliente registrado quando a allowlist (OAUTH_REDIRECT_HOSTS) era outra: o authorize confere de novo e não redireciona
  const largo = envConta({ OAUTH_REDIRECT_HOSTS: "https://atacante.example/" });
  const c = await call(largo, "POST", "/oauth/register", { body: { client_name: "Claude", redirect_uris: ["https://atacante.example/cb"] }, headers: ip() });
  assert.equal(c.status, 201);
  largo.OAUTH_REDIRECT_HOSTS = undefined;
  const q = new URLSearchParams({ response_type: "code", client_id: c.data.client_id, redirect_uri: "https://atacante.example/cb", code_challenge: await s256(VERIFIER), code_challenge_method: "S256" });
  const a = await call(largo, "GET", `/oauth/authorize?${q}`, { headers: ip() });
  assert.equal(a.status, 400); assert.equal(a.headers.get("location"), null);
});

test("loopback (dev/CLI) é aceito, mas a tela marca \"app não verificado\"", async () => {
  const env = envConta();
  const r = await call(env, "POST", "/oauth/register", { body: { client_name: "Claude", redirect_uris: ["http://localhost:3118/callback"] }, headers: ip() });
  assert.equal(r.status, 201);
  const q = new URLSearchParams({ response_type: "code", client_id: r.data.client_id, redirect_uri: "http://localhost:3118/callback", code_challenge: await s256(VERIFIER), code_challenge_method: "S256" });
  const req = (await call(env, "GET", `/oauth/authorize?${q}`, { headers: ip() })).headers.get("location")!.split("=")[1];
  const info = await call(env, "GET", `/oauth/pedido/${req}`);
  assert.equal(info.data.verificado, false); assert.equal(info.data.destino, "localhost:3118");
});

test("consentir: falha fechada sem Origin/Sec-Fetch-Site da própria origem; pede Face ID recente (#62), mesmo com sessão", async () => {
  const env = envConta();
  const d = await dono(env);
  const c = await registrarCliente(env);
  const q = new URLSearchParams({ response_type: "code", client_id: c.client_id, redirect_uri: CB, code_challenge: await s256(VERIFIER), code_challenge_method: "S256" });
  const req = (await call(env, "GET", `/oauth/authorize?${q}`, { headers: ip() })).headers.get("location")!.split("=")[1];
  assert.equal((await call(env, "POST", "/oauth/decidir", { body: { req, permitir: true }, headers: { Cookie: d.cookie } })).status, 403, "sem Origin");
  assert.equal((await call(env, "POST", "/oauth/decidir", { body: { req, permitir: true }, headers: { Cookie: d.cookie, "Sec-Fetch-Site": "cross-site" } })).status, 403);
  // Face ID antigo (#62 exigirFaceId): pede o Face ID de novo e NÃO consome o pedido
  env.DB.raw.prepare("UPDATE sessions SET reauth_at = 1").run();
  const velha = await call(env, "POST", "/oauth/decidir", { body: { req, permitir: true }, headers: { Cookie: d.cookie, "Sec-Fetch-Site": "same-origin" } });
  assert.equal(velha.status, 403); assert.equal(velha.data.code, "reauth");
  // Face ID agora (login por passkey = sessão com reauth recente) → permite
  const nova = await entrar(env, d.auth);
  const ok = await call(env, "POST", "/oauth/decidir", { body: { req, permitir: true }, headers: { Cookie: nova.cookie, "Sec-Fetch-Site": "same-origin" } });
  assert.equal(ok.status, 200, ok.text); assert.ok(new URL(ok.data.redirect).searchParams.get("code"));
});

test("conta apagada: refresh e access param de valer (deleted_at e exclusão)", async () => {
  const env = envConta();
  const d = await dono(env);
  const c = await registrarCliente(env);
  const t = (await trocar(env, c.client_id, (await autorizar(env, c.client_id, d.cookie)).searchParams.get("code")!)).data;
  env.DB.raw.prepare("UPDATE user SET deleted_at = 1").run();
  assert.equal((await post(env, "/oauth/token", { grant_type: "refresh_token", refresh_token: t.refresh_token, client_id: c.client_id })).data.error, "invalid_grant");
  assert.equal((await mcp(env, t.access_token, "ciclo_memoria_listar")).status, 401);
  env.DB.raw.prepare("UPDATE user SET deleted_at = NULL").run();
  const t2 = (await trocar(env, c.client_id, (await autorizar(env, c.client_id, d.cookie)).searchParams.get("code")!)).data;
  assert.equal((await call(env, "DELETE", "/api/account", { body: { confirm: "APAGAR" }, headers: { Cookie: d.cookie, Origin: O } })).status, 200);
  assert.equal((await post(env, "/oauth/token", { grant_type: "refresh_token", refresh_token: t2.refresh_token, client_id: c.client_id })).data.error, "invalid_grant");
  assert.equal((await mcp(env, t2.access_token, "ciclo_memoria_listar")).status, 401);
});

test("registro: cliente que nunca obteve token some em 1 h; o teto é atômico", async () => {
  const env = envConta();
  const a = await registrarCliente(env);
  env.DB.raw.prepare("UPDATE oauth_client SET created_at = ?1").run(Date.now() - OAUTH.clienteSemUsoMs - 1000);
  await registrarCliente(env);
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM oauth_client WHERE id = ?1").get(a.client_id).n, 0);
  const ins = env.DB.raw.prepare("INSERT INTO oauth_client (id, name, redirect_uris, created_at) VALUES (?1, 'x', '[]', ?2)");
  const n0 = env.DB.raw.prepare("SELECT COUNT(*) AS n FROM oauth_client").get().n;
  for (let i = n0; i < 200; i++) ins.run(i.toString(16).padStart(32, "0"), Date.now());
  const cheio = await call(env, "POST", "/oauth/register", { body: { redirect_uris: [CB] }, headers: ip() });
  assert.equal(cheio.status, 503);
});

test("#62 aceite pendente: o consentimento recusa e o token OAuth também não usa o /mcp", async () => {
  const env = envConta();
  const d = await dono(env);
  const c = await registrarCliente(env);
  const t = (await trocar(env, c.client_id, (await autorizar(env, c.client_id, d.cookie)).searchParams.get("code")!)).data;
  const tabela = env.DB.raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE '%consent%'").all().map((r: any) => r.name)[0];
  env.DB.raw.prepare(`DELETE FROM ${tabela}`).run(); // termos "atualizados": ninguém aceitou ainda
  const r = await mcp(env, t.access_token, "ciclo_memoria_listar");
  assert.equal(r.status, 403); assert.equal(r.data.code, "aceite");
  const q = new URLSearchParams({ response_type: "code", client_id: c.client_id, redirect_uri: CB, code_challenge: await s256(VERIFIER), code_challenge_method: "S256" });
  const req = (await call(env, "GET", `/oauth/authorize?${q}`, { headers: ip() })).headers.get("location")!.split("=")[1];
  const nao = await call(env, "POST", "/oauth/decidir", { body: { req, permitir: true }, headers: { Cookie: d.cookie, Origin: O } });
  assert.ok([401, 403].includes(nao.status), nao.text);
  assert.ok(!nao.data.redirect);
});
