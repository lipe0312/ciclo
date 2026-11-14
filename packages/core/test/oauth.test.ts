// #66 OAuth 2.1 do MCP: regras puras (metadata, registro dinâmico, pedido de autorização com PKCE S256, recurso,
// redirecionamento e teto de conexões por pessoa). Tudo fictício.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  OAUTH, grantsParaRevogar, metadataRecurso, metadataServidor, recursoValido, redirecionar, redirectUriValida, urlsOauth,
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
  const ok = validarRegistro({ client_name: "Claude", redirect_uris: ["https://claude.ai/api/mcp/auth_callback"], grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none" });
  assert.ok(ok.ok); if (ok.ok) { assert.equal(ok.value.nome, "Claude"); assert.equal(ok.value.metodo, "none"); }
  const semNome = validarRegistro({ redirect_uris: ["https://claude.ai/cb"] });
  assert.ok(semNome.ok); if (semNome.ok) { assert.equal(semNome.value.nome, "Cliente MCP"); assert.equal(semNome.value.metodo, "none"); }
  const secreto = validarRegistro({ redirect_uris: ["https://claude.ai/cb"], token_endpoint_auth_method: "client_secret_post" });
  assert.ok(secreto.ok && secreto.value.metodo === "client_secret_post");
  for (const ruim of [
    {}, { redirect_uris: [] }, { redirect_uris: "https://claude.ai/cb" }, { redirect_uris: ["http://mal.example/cb"] },
    { redirect_uris: Array(OAUTH.maxRedirects + 1).fill("https://claude.ai/cb") },
    { redirect_uris: ["https://claude.ai/cb"], grant_types: ["client_credentials"] },
    { redirect_uris: ["https://claude.ai/cb"], response_types: ["token"] },
    { redirect_uris: ["https://claude.ai/cb"], token_endpoint_auth_method: "private_key_jwt" },
  ]) {
    const r = validarRegistro(ruim);
    assert.equal(r.ok, false, JSON.stringify(ruim));
    if (!r.ok) assert.ok(["invalid_redirect_uri", "invalid_client_metadata"].includes(r.erro));
  }
  const longo = validarRegistro({ client_name: "x".repeat(300), redirect_uris: ["https://claude.ai/cb"] });
  assert.ok(longo.ok && longo.value.nome.length <= OAUTH.nomeMax, "nome é cortado, não recusa");
});

test("pedido de autorização: exige code + PKCE S256; redirect_uri tem de ser uma das registradas", () => {
  const cli = { redirectUris: ["https://claude.ai/api/mcp/auth_callback"] };
  const base = { response_type: "code", client_id: "c1", redirect_uri: cli.redirectUris[0], code_challenge: CH, code_challenge_method: "S256", state: "xyz", resource: O + "/mcp" };
  const ok = validarPedidoAutorizacao(base, cli, O);
  assert.ok(ok.ok); if (ok.ok) { assert.equal(ok.value.escopo, OAUTH.escopo); assert.equal(ok.value.state, "xyz"); }
  // redirect_uri desconhecida: NUNCA redireciona (open redirect)
  const fora = validarPedidoAutorizacao({ ...base, redirect_uri: "https://mal.example/cb" }, cli, O);
  assert.ok(!fora.ok && !fora.redirecionavel);
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
