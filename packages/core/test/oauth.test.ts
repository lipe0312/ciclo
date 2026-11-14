// #66 OAuth 2.1 do MCP: regras puras (metadata, registro dinâmico, pedido de autorização com PKCE S256, recurso,
// redirecionamento e teto de conexões por pessoa). Tudo fictício.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  OAUTH, REDIRECTS_PADRAO, grantsParaRevogar, listaRedirects, redirectPermitido, metadataRecurso, metadataServidor, recursoValido, redirecionar, redirectUriValida, urlsOauth,
  validarPedidoAutorizacao, validarRegistro, verifierValido, wwwAuthenticate,
} from "../src/index.ts";

const O = "https://ciclo.exemplo.workers.dev";
const CH = "a".repeat(43);

test("metadata: recurso aponta para o servidor de autorização; servidor anuncia S256, registro e iss", () => {
  const u = urlsOauth(O + "/");
  assert.equal(u.issuer, O); assert.equal(u.recurso, O + "/mcp");
  const r = metadataRecurso(O);
  assert.equal(r.resource, O + "/mcp"); assert.deepEqual(r.authorization_servers, [O]);
  assert.deepEqual(r.scopes_supported, [OAUTH.escopo]); assert.deepEqual(r.bearer_methods_supported, ["header"]);
  const s = metadataServidor(O);
  assert.equal(s.issuer, O);
  assert.equal(s.authorization_endpoint, O + "/oauth/authorize"); assert.equal(s.token_endpoint, O + "/oauth/token");
  assert.equal(s.registration_endpoint, O + "/oauth/register"); assert.equal(s.revocation_endpoint, O + "/oauth/revoke");
  assert.deepEqual(s.code_challenge_methods_supported, ["S256"], "só S256 (plain fica de fora)");
  assert.deepEqual(s.response_types_supported, ["code"]);
  assert.deepEqual(s.grant_types_supported, ["authorization_code", "refresh_token"]);
  assert.equal(s.authorization_response_iss_parameter_supported, true);
  assert.ok(s.token_endpoint_auth_methods_supported.includes("none"));
});

test("WWW-Authenticate do 401 leva resource_metadata e scope", () => {
  const h = wwwAuthenticate(O);
  assert.match(h, /^Bearer /);
  assert.ok(h.includes(`resource_metadata="${O}/.well-known/oauth-protected-resource/mcp"`));
  assert.ok(h.includes(`scope="${OAUTH.escopo}"`));
});

test("redirect_uri: https sem fragmento nem usuário, ou http só no loopback", () => {
  for (const ok of ["https://claude.ai/api/mcp/auth_callback", "http://localhost:6274/oauth/callback", "http://127.0.0.1:33418/cb", "http://[::1]:8080/cb"])
    assert.equal(redirectUriValida(ok), true, ok);
  for (const ruim of ["http://claude.ai/cb", "https://claude.ai/cb#x", "https://user:pw@claude.ai/cb", "javascript:alert(1)", "ftp://x.y/z", "/relativa", "", 5, null, "https://" + "a".repeat(600) + ".com"])
    assert.equal(redirectUriValida(ruim), false, String(ruim));
});

test("registro dinâmico: valida URIs, tipos e método de autenticação; nome curto", () => {
  const ok = validarRegistro({ client_name: "Claude", redirect_uris: ["https://claude.ai/api/mcp/auth_callback"], grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none" }, REDIRECTS_PADRAO);
  assert.ok(ok.ok); if (ok.ok) { assert.equal(ok.value.nome, "Claude"); assert.equal(ok.value.metodo, "none"); }
  const semNome = validarRegistro({ redirect_uris: ["https://claude.ai/api/mcp/auth_callback"] }, REDIRECTS_PADRAO);
  assert.ok(semNome.ok); if (semNome.ok) { assert.equal(semNome.value.nome, "Cliente MCP"); assert.equal(semNome.value.metodo, "none"); }
  const secreto = validarRegistro({ redirect_uris: ["http://localhost:6274/cb"], token_endpoint_auth_method: "client_secret_post" }, REDIRECTS_PADRAO);
  assert.ok(secreto.ok && secreto.value.metodo === "client_secret_post");
  for (const ruim of [
    {}, { redirect_uris: [] }, { redirect_uris: "https://claude.ai/cb" }, { redirect_uris: ["http://mal.example/cb"] },
    { redirect_uris: Array(OAUTH.maxRedirects + 1).fill("https://claude.ai/api/mcp/auth_callback") },
    { redirect_uris: ["https://claude.ai/api/mcp/auth_callback"], grant_types: ["client_credentials"] },
    { redirect_uris: ["https://claude.ai/api/mcp/auth_callback"], response_types: ["token"] },
    { redirect_uris: ["https://claude.ai/api/mcp/auth_callback"], token_endpoint_auth_method: "private_key_jwt" },
    { client_name: "Claude", redirect_uris: ["https://atacante.example/api/mcp/auth_callback"] },
    { client_name: "Claude", redirect_uris: ["https://claude.ai.atacante.example/api/mcp/auth_callback"] },
    { redirect_uris: ["https://claude.ai/outro/caminho"] },
  ]) {
    const r = validarRegistro(ruim, REDIRECTS_PADRAO);
    assert.equal(r.ok, false, JSON.stringify(ruim));
    if (!r.ok) assert.ok(["invalid_redirect_uri", "invalid_client_metadata"].includes(r.erro));
  }
  const longo = validarRegistro({ client_name: "x".repeat(300), redirect_uris: ["https://claude.ai/api/mcp/auth_callback"] }, REDIRECTS_PADRAO);
  assert.ok(longo.ok && longo.value.nome.length <= OAUTH.nomeMax, "nome é cortado, não recusa");
});

test("pedido de autorização: exige code + PKCE S256; redirect_uri tem de ser uma das registradas", () => {
  const cli = { redirectUris: ["https://claude.ai/api/mcp/auth_callback"], permitidos: REDIRECTS_PADRAO };
  const base = { response_type: "code", client_id: "c1", redirect_uri: cli.redirectUris[0], code_challenge: CH, code_challenge_method: "S256", state: "xyz", resource: O + "/mcp" };
  const ok = validarPedidoAutorizacao(base, cli, O);
  assert.ok(ok.ok); if (ok.ok) { assert.equal(ok.value.escopo, OAUTH.escopo); assert.equal(ok.value.state, "xyz"); }
  // redirect_uri desconhecida: NUNCA redireciona (open redirect)
  const fora = validarPedidoAutorizacao({ ...base, redirect_uri: "https://mal.example/cb" }, cli, O);
  assert.ok(!fora.ok && !fora.redirecionavel);
  // cliente antigo com URI que saiu da allowlist: não redireciona
  const saiu = validarPedidoAutorizacao(base, { ...cli, permitidos: ["https://claude.com/api/mcp/auth_callback"] }, O);
  assert.ok(!saiu.ok && !saiu.redirecionavel);
  // sem redirect_uri e uma só registrada: usa a registrada
  const so = validarPedidoAutorizacao({ ...base, redirect_uri: undefined }, cli, O);
  assert.ok(so.ok && so.value.redirectUri === cli.redirectUris[0]);
  // erros que voltam para o cliente pelo redirect
  for (const [mexe, erro] of [
    [{ response_type: "token" }, "unsupported_response_type"],
    [{ code_challenge: undefined }, "invalid_request"],
    [{ code_challenge_method: "plain" }, "invalid_request"],
    [{ code_challenge_method: undefined }, "invalid_request"],
    [{ code_challenge: "curto" }, "invalid_request"],
    [{ scope: "admin" }, "invalid_scope"],
    [{ resource: "https://outro.example/mcp" }, "invalid_target"],
    [{ state: "s".repeat(600) }, "invalid_request"],
  ] as const) {
    const r = validarPedidoAutorizacao({ ...base, ...mexe }, cli, O);
    assert.ok(!r.ok && r.redirecionavel && r.erro === erro, `${JSON.stringify(mexe)} → ${JSON.stringify(r)}`);
  }
  // escopos aceitos: ausente, "ciclo" e o offline_access (ignorado)
  for (const scope of [undefined, "ciclo", "ciclo offline_access", "offline_access"]) assert.ok(validarPedidoAutorizacao({ ...base, scope }, cli, O).ok, String(scope));
});

test("recurso (RFC 8707): o /mcp ou a origem; host em maiúsculas é aceito", () => {
  for (const r of [O + "/mcp", O, O + "/", "HTTPS://CICLO.EXEMPLO.WORKERS.DEV/mcp", undefined, null]) assert.equal(recursoValido(r, O), true, String(r));
  for (const r of ["https://outro.example/mcp", O + "/api", O + "/mcp#x", 5]) assert.equal(recursoValido(r, O), false, String(r));
});

test("code_verifier: 43..128 caracteres não reservados", () => {
  assert.equal(verifierValido("A".repeat(43)), true);
  assert.equal(verifierValido("a-b.c_d~".repeat(16)), true);
  assert.equal(verifierValido("A".repeat(42)), false);
  assert.equal(verifierValido("A".repeat(129)), false);
  assert.equal(verifierValido("A".repeat(42) + "+"), false);
  assert.equal(verifierValido(undefined), false);
});

test("redirecionar: acrescenta parâmetros sem perder a query da redirect_uri", () => {
  const u = new URL(redirecionar("https://claude.ai/cb?x=1", { code: "abc", state: "s 1", iss: O, vazio: undefined }));
  assert.equal(u.searchParams.get("x"), "1"); assert.equal(u.searchParams.get("code"), "abc");
  assert.equal(u.searchParams.get("state"), "s 1"); assert.equal(u.searchParams.get("iss"), O);
  assert.equal(u.searchParams.has("vazio"), false);
});

test("teto de conexões OAuth por pessoa: a mais antiga sai para caber a nova", () => {
  const g = (id: string, createdAt: number) => ({ id, createdAt });
  assert.deepEqual(grantsParaRevogar([g("a", 1), g("b", 2)], 3), []);
  assert.deepEqual(grantsParaRevogar([g("b", 2), g("a", 1), g("c", 3)], 3), ["a"]);
  assert.deepEqual(grantsParaRevogar([g("a", 1), g("b", 2), g("c", 3), g("d", 4)], 3), ["a", "b"]);
  assert.deepEqual(grantsParaRevogar([g("a", 5), g("b", 5), g("c", 5)], 3), ["a"], "empate: a ordem de criação decide");
  assert.equal(OAUTH.maxGrants, 3);
});

test("allowlist de redirect: caminho exato do Claude, prefixo com barra final, loopback só como não verificado", () => {
  assert.deepEqual(REDIRECTS_PADRAO, ["https://claude.ai/api/mcp/auth_callback", "https://claude.com/api/mcp/auth_callback"]);
  assert.equal(redirectPermitido("https://claude.ai/api/mcp/auth_callback", REDIRECTS_PADRAO), "verificado");
  assert.equal(redirectPermitido("https://claude.com/api/mcp/auth_callback", REDIRECTS_PADRAO), "verificado");
  assert.equal(redirectPermitido("http://localhost:3118/callback", REDIRECTS_PADRAO), "loopback");
  assert.equal(redirectPermitido("http://127.0.0.1:9/cb", REDIRECTS_PADRAO), "loopback");
  for (const ruim of ["https://atacante.example/api/mcp/auth_callback", "https://claude.ai/api/mcp/auth_callback/x", "https://claude.ai/api/mcp/auth_callback?x=1",
    "https://claude.ai.atacante.example/api/mcp/auth_callback", "https://evil@claude.ai/api/mcp/auth_callback", "http://claude.ai/api/mcp/auth_callback"])
    assert.equal(redirectPermitido(ruim, REDIRECTS_PADRAO), null, ruim);
  // var OAUTH_REDIRECT_HOSTS: lista por vírgula; entrada terminada em "/" é prefixo do caminho no mesmo host
  const l = listaRedirects(" https://claude.ai/api/mcp/auth_callback , https://app.exemplo.dev/oauth/ , http://inseguro.example/x, lixo ");
  assert.deepEqual(l, ["https://claude.ai/api/mcp/auth_callback", "https://app.exemplo.dev/oauth/"], "só https vale; o resto é ignorado");
  assert.equal(redirectPermitido("https://app.exemplo.dev/oauth/cb", l), "verificado");
  assert.equal(redirectPermitido("https://app.exemplo.dev/outro", l), null);
  assert.deepEqual(listaRedirects(undefined), REDIRECTS_PADRAO);
  assert.deepEqual(listaRedirects(""), REDIRECTS_PADRAO);
});
