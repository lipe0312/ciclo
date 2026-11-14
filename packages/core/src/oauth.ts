// #66 OAuth 2.1 do MCP (spec de autorização do MCP 2026-07-28): conectar = colar a URL no claude.ai e entrar com o
// Face ID. Regras puras: metadata (RFC 9728 e RFC 8414), registro dinâmico (RFC 7591), pedido de autorização com
// PKCE S256 obrigatório, recurso (RFC 8707), iss na resposta (RFC 9207) e teto de conexões por pessoa.
// O Worker guarda os dados (só hashes) e chama daqui. A chave manual da #55 continua como plano B.

export const OAUTH = {
  escopo: "ciclo",
  /** código de autorização: uso único, 5 min */
  codigoMs: 5 * 60_000,
  /** pedido aguardando a tela de consentimento: 10 min */
  pedidoMs: 10 * 60_000,
  /** token de acesso: 1 h (o refresh renova; a conexão some com 90 dias sem uso, regra da #55) */
  acessoS: 3600,
  /** consentir exige Face ID (passkey) feito há no máximo 2 min, mesmo com sessão ativa */
  faceIdMs: 2 * 60_000,
  /** cliente registrado que nunca obteve token some em 1 h */
  clienteSemUsoMs: 3600_000,
  /** conexões OAuth ativas por pessoa (a mais antiga sai para caber a nova) */
  maxGrants: 3,
  maxRedirects: 5,
  uriMax: 500,
  nomeMax: 80,
  stateMax: 500,
} as const;

const semBarra = (o: string) => o.replace(/\/+$/, "");

export function urlsOauth(origin: string) {
  const o = semBarra(origin);
  return {
    issuer: o,
    recurso: `${o}/mcp`,
    metaRecurso: `${o}/.well-known/oauth-protected-resource/mcp`,
    authorize: `${o}/oauth/authorize`,
    token: `${o}/oauth/token`,
    register: `${o}/oauth/register`,
    revoke: `${o}/oauth/revoke`,
  };
}

/** RFC 9728: o /mcp diz quem autoriza. */
export function metadataRecurso(origin: string) {
  const u = urlsOauth(origin);
  return { resource: u.recurso, authorization_servers: [u.issuer], scopes_supported: [OAUTH.escopo], bearer_methods_supported: ["header"], resource_name: "Ciclo" };
}

export const METODOS_AUTH = ["none", "client_secret_post", "client_secret_basic"] as const;
export type MetodoAuth = (typeof METODOS_AUTH)[number];

/** RFC 8414: endpoints e capacidades. Só S256 (plain não existe aqui). */
export function metadataServidor(origin: string) {
  const u = urlsOauth(origin);
  return {
    issuer: u.issuer,
    authorization_endpoint: u.authorize,
    token_endpoint: u.token,
    registration_endpoint: u.register,
    revocation_endpoint: u.revoke,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: [...METODOS_AUTH],
    revocation_endpoint_auth_methods_supported: [...METODOS_AUTH],
    scopes_supported: [OAUTH.escopo],
    authorization_response_iss_parameter_supported: true,
  };
}

/** Cabeçalho do 401 do /mcp (RFC 9728 §5.1 + escopo da RFC 6750 §3). */
export const wwwAuthenticate = (origin: string) =>
  `Bearer realm="ciclo", resource_metadata="${urlsOauth(origin).metaRecurso}", scope="${OAUTH.escopo}"`;

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);
/** redirect_uri aceitável: https sem fragmento e sem usuário/senha, ou http só no loopback (apps nativos e ferramentas locais). */
export function redirectUriValida(v: unknown): v is string {
  if (typeof v !== "string" || !v || v.length > OAUTH.uriMax) return false;
  let u: URL;
  try { u = new URL(v); } catch { return false; }
  if (u.hash || v.includes("#") || u.username || u.password) return false;
  if (u.protocol === "https:") return !!u.hostname;
  return u.protocol === "http:" && LOOPBACK.has(u.hostname);
}

/** #66 (segurança): só o callback publicado pela Anthropic para os apps hospedados (claude.ai na web, Desktop, celular).
 *  O claude.com é a mesma empresa (precaução, caso o domínio mude). O nome do cliente NUNCA é identidade: vale o destino. */
export const REDIRECTS_PADRAO: readonly string[] = ["https://claude.ai/api/mcp/auth_callback", "https://claude.com/api/mcp/auth_callback"];

/** Var OAUTH_REDIRECT_HOSTS: URLs https separadas por vírgula. Exata, ou prefixo de caminho se terminar em "/".
 *  Vazia ou ausente → REDIRECTS_PADRAO. Entrada que não é https é ignorada. */
export function listaRedirects(v: string | undefined | null): string[] {
  const l = (v ?? "").split(",").map((x) => x.trim()).filter((x) => {
    try { const u = new URL(x); return u.protocol === "https:" && !u.username && !u.password && !u.hash && !u.search; } catch { return false; }
  });
  return l.length ? l : [...REDIRECTS_PADRAO];
}

/** "verificado" = na allowlist; "loopback" = http no localhost (dev/CLI, a tela avisa "app não verificado"); null = recusado. */
export function redirectPermitido(uri: unknown, permitidos: readonly string[]): "verificado" | "loopback" | null {
  if (!redirectUriValida(uri)) return null;
  const u = new URL(uri);
  if (u.protocol === "http:") return "loopback";
  for (const p of permitidos) {
    if (p.endsWith("/")) { const b = new URL(p); if (u.origin === b.origin && u.pathname.startsWith(b.pathname) && !u.search) return "verificado"; }
    else if (uri === p) return "verificado";
  }
  return null;
}

type Erro<E extends string> = { ok: false; erro: E; descricao: string };
const strArr = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");

/** RFC 7591: valida o registro dinâmico. Cliente público por padrão (PKCE); secreto se pedir client_secret_*. */
export function validarRegistro(b: unknown, permitidos: readonly string[]):
  { ok: true; value: { nome: string; redirectUris: string[]; metodo: MetodoAuth } } | Erro<"invalid_redirect_uri" | "invalid_client_metadata"> {
  const o = (b && typeof b === "object" ? b : {}) as Record<string, unknown>;
  const uris = o.redirect_uris;
  if (!strArr(uris) || !uris.length || uris.length > OAUTH.maxRedirects) return { ok: false, erro: "invalid_redirect_uri", descricao: `redirect_uris: de 1 a ${OAUTH.maxRedirects} URIs` };
  if (!uris.every((x) => redirectPermitido(x, permitidos))) return { ok: false, erro: "invalid_redirect_uri", descricao: "redirect_uri fora da lista permitida (OAUTH_REDIRECT_HOSTS) ou não é http no localhost" };
  if (o.grant_types != null && (!strArr(o.grant_types) || !o.grant_types.every((g) => g === "authorization_code" || g === "refresh_token")))
    return { ok: false, erro: "invalid_client_metadata", descricao: "grant_types: authorization_code e refresh_token" };
  if (o.response_types != null && (!strArr(o.response_types) || !o.response_types.every((r) => r === "code")))
    return { ok: false, erro: "invalid_client_metadata", descricao: "response_types: code" };
  const metodo = (o.token_endpoint_auth_method ?? "none") as MetodoAuth;
  if (!METODOS_AUTH.includes(metodo)) return { ok: false, erro: "invalid_client_metadata", descricao: `token_endpoint_auth_method: ${METODOS_AUTH.join(", ")}` };
  const nome = typeof o.client_name === "string" ? o.client_name.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, OAUTH.nomeMax) : "";
  return { ok: true, value: { nome: nome || "Cliente MCP", redirectUris: [...new Set(uris)], metodo } };
}

const NAO_RESERVADO = /^[A-Za-z0-9\-._~]{43,128}$/;
/** RFC 7636: code_verifier (e o challenge S256, que tem 43 caracteres base64url). */
export const verifierValido = (v: unknown): v is string => typeof v === "string" && NAO_RESERVADO.test(v);

/** RFC 8707: o recurso pedido tem de ser este servidor (o /mcp ou a origem). Ausente = este. */
export function recursoValido(r: unknown, origin: string): boolean {
  if (r == null) return true;
  if (typeof r !== "string" || r.includes("#")) return false;
  let u: URL;
  try { u = new URL(r); } catch { return false; }
  const o = new URL(semBarra(origin));
  if (u.origin !== o.origin) return false; // URL já normaliza esquema e host para minúsculas
  return u.pathname === "/" || u.pathname === "" || u.pathname === "/mcp";
}

export interface PedidoAutorizacao { clientId: string; redirectUri: string; challenge: string; state: string | null; escopo: string; resource: string | null }
type ErroAut = "invalid_request" | "unsupported_response_type" | "invalid_scope" | "invalid_target";

/** Valida o GET /oauth/authorize. `redirecionavel: false` = mostrar o erro na tela, NUNCA redirecionar (cliente ou URI
 *  desconhecidos: evita open redirect). Os outros erros voltam para o cliente pela redirect_uri, com state e iss. */
export function validarPedidoAutorizacao(q: Record<string, unknown>, cliente: { redirectUris: string[]; permitidos: readonly string[] }, origin: string):
  { ok: true; value: PedidoAutorizacao } | { ok: false; redirecionavel: false; descricao: string } | { ok: false; redirecionavel: true; redirectUri: string; state: string | null; erro: ErroAut; descricao: string } {
  const pedida = q.redirect_uri;
  let redirectUri: string;
  if (pedida == null || pedida === "") {
    if (cliente.redirectUris.length !== 1) return { ok: false, redirecionavel: false, descricao: "redirect_uri obrigatória" };
    redirectUri = cliente.redirectUris[0];
  } else if (typeof pedida === "string" && cliente.redirectUris.includes(pedida)) redirectUri = pedida;
  else return { ok: false, redirecionavel: false, descricao: "redirect_uri não registrada para este cliente" };
  // a allowlist pode ter mudado depois do registro: confere de novo (e nunca redireciona para fora dela)
  if (!redirectPermitido(redirectUri, cliente.permitidos)) return { ok: false, redirecionavel: false, descricao: "redirect_uri fora da lista permitida" };
  const st = typeof q.state === "string" ? q.state : null;
  const falha = (erro: ErroAut, descricao: string) => ({ ok: false as const, redirecionavel: true as const, redirectUri, state: st && st.length <= OAUTH.stateMax ? st : null, erro, descricao });
  if (q.state != null && (typeof q.state !== "string" || q.state.length > OAUTH.stateMax)) return falha("invalid_request", "state inválido");
  if (q.response_type !== "code") return falha("unsupported_response_type", "só response_type=code");
  if (q.code_challenge_method !== "S256") return falha("invalid_request", "PKCE obrigatório com code_challenge_method=S256");
  if (!verifierValido(q.code_challenge)) return falha("invalid_request", "code_challenge inválido");
  if (q.scope != null) {
    const pedidos = typeof q.scope === "string" ? q.scope.split(" ").filter(Boolean) : null;
    if (!pedidos || !pedidos.every((s) => s === OAUTH.escopo || s === "offline_access")) return falha("invalid_scope", `escopo aceito: ${OAUTH.escopo}`);
  }
  if (!recursoValido(q.resource, origin)) return falha("invalid_target", "resource não é este servidor");
  return { ok: true, value: { clientId: String(q.client_id ?? ""), redirectUri, challenge: q.code_challenge as string, state: st, escopo: OAUTH.escopo, resource: typeof q.resource === "string" ? q.resource : null } };
}

/** redirect_uri + parâmetros (mantém a query que já existir; ignora vazios). */
export function redirecionar(uri: string, params: Record<string, string | null | undefined>): string {
  const u = new URL(uri);
  for (const [k, v] of Object.entries(params)) if (v != null && v !== "") u.searchParams.set(k, v);
  return u.toString();
}

/** Conexões a revogar para caber uma nova (mantém as max-1 mais recentes). Empate no createdAt: vale a ordem de
 *  entrada (o Worker manda na ordem de criação), para nunca revogar a mais nova por acaso. */
export function grantsParaRevogar(ativos: { id: string; createdAt: number }[], max: number = OAUTH.maxGrants): string[] {
  const ord = ativos.map((g, i) => ({ ...g, i })).sort((a, b) => a.createdAt - b.createdAt || a.i - b.i);
  return ord.slice(0, Math.max(0, ord.length - (max - 1))).map((g) => g.id);
}
