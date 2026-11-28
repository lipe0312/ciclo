// #164 `node scripts/smoke.mjs <url> [--sha <commit>] [--ambiente staging|producao]`: confere o app NO AR depois do deploy (CI).
//   /api/health 200, com o ambiente e o commit esperados · / 200 com CSP · /mcp sem token → 401 · /api/state sem sessão → 401.
// Com CF_ACCESS_CLIENT_ID e CF_ACCESS_CLIENT_SECRET no ambiente, manda os cabeçalhos do service token do Cloudflare Access (staging, #167).
// A saída NUNCA imprime cabeçalho nem corpo de resposta (log do CI é público): só rota, status e o que não bateu.
// Sem dependência; o teste (apps/worker/test/ci-164.test.ts) usa um fetch falso.
import { fileURLToPath } from "node:url";

const SHA_RE = /^[0-9a-f]{7,40}$/;
const AMBIENTES = { staging: "staging", producao: null }; // o /api/health devolve ambiente: "staging" no staging e null na produção

/** Cabeçalhos do service token do Access, só se as DUAS variáveis existirem. */
export function cabecalhosAccess(env = process.env) {
  const id = env.CF_ACCESS_CLIENT_ID?.trim(), segredo = env.CF_ACCESS_CLIENT_SECRET?.trim();
  return id && segredo ? { "CF-Access-Client-Id": id, "CF-Access-Client-Secret": segredo } : {};
}

/** Lê `<url> [--sha X] [--ambiente Y]`. Só https (ou http://localhost, para teste local). */
export function lerArgs(argv) {
  const o = { url: null, sha: null, ambiente: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--sha" || a === "--ambiente") {
      const v = argv[++i];
      if (!v || v.startsWith("--")) throw new Error(`${a} pede um valor`);
      if (a === "--sha") { if (!SHA_RE.test(v)) throw new Error("--sha precisa ser o hash do commit (7 a 40 hex)"); o.sha = v; }
      else { if (!(v in AMBIENTES)) throw new Error(`--ambiente: ${Object.keys(AMBIENTES).join(" | ")}`); o.ambiente = v; }
    } else if (a.startsWith("-")) throw new Error(`opção desconhecida: ${a}`);
    else if (o.url) throw new Error("só uma URL");
    else o.url = a;
  }
  if (!o.url) throw new Error("uso: node scripts/smoke.mjs <url> [--sha <commit>] [--ambiente staging|producao]");
  let u;
  try { u = new URL(o.url); } catch { throw new Error("URL inválida"); }
  const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
  if (u.protocol !== "https:" && !(local && u.protocol === "http:")) throw new Error("a URL precisa ser https");
  o.url = u.origin;
  return o;
}

/**
 * Roda as checagens. `fetch` e `sleep` injetáveis (teste). O /api/health tenta de novo algumas vezes: logo depois do deploy
 * a borda pode responder a versão anterior por alguns segundos. Devolve { ok, linhas } — `linhas` é o que o CLI imprime.
 */
export async function smoke({ url, sha = null, ambiente = null, fetch: f = globalThis.fetch, env = process.env, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), tentativas = 6, esperaMs = 5000 }) {
  const base = url.replace(/\/$/, "");
  const access = cabecalhosAccess(env);
  const linhas = [];
  let ok = true;
  const pedir = async (metodo, caminho, { corpo, cabecalhos = {} } = {}) => {
    try {
      // redirect manual: o Access sem service token responde 302 para o login, e um 200 da tela de login não pode passar
      return await f(base + caminho, { method: metodo, redirect: "manual", headers: { ...access, ...cabecalhos }, body: corpo });
    } catch { return null; }
  };
  const marca = (passou, texto) => { linhas.push(`${passou ? "✔" : "✖"} ${texto}`); if (!passou) ok = false; };

  // 1. /api/health: 200, ok, ambiente e commit
  let motivo = "sem resposta";
  for (let t = 1; t <= tentativas; t++) {
    const r = await pedir("GET", "/api/health");
    let dados = null;
    if (r) { try { dados = await r.json(); } catch { dados = null; } }
    if (!r) motivo = "sem resposta (rede)";
    else if (r.status !== 200) motivo = `HTTP ${r.status}`;
    else if (!dados || dados.ok !== true) motivo = "resposta sem ok: true";
    else if (ambiente && dados.ambiente !== AMBIENTES[ambiente]) motivo = `ambiente diferente do esperado (${ambiente})`;
    else if (sha && dados.version !== sha) motivo = `versão no ar ainda não é o commit ${sha.slice(0, 7)}`;
    else { motivo = null; break; }
    if (t < tentativas) await sleep(esperaMs);
  }
  marca(!motivo, `/api/health${motivo ? `: ${motivo}` : ` 200${ambiente ? ` (${ambiente})` : ""}${sha ? ` · commit ${sha.slice(0, 7)}` : ""}`}`);

  // 2. / : 200 com a CSP (vem do _headers dos assets)
  const raiz = await pedir("GET", "/");
  const csp = raiz?.headers?.get?.("content-security-policy") ?? "";
  marca(raiz?.status === 200 && /default-src/.test(csp), raiz?.status !== 200 ? `/: ${raiz ? `HTTP ${raiz.status}` : "sem resposta"} (esperado 200)` : csp ? "/ 200 com CSP" : "/: sem o cabeçalho Content-Security-Policy");

  // 3. /mcp sem token → 401
  const mcp = await pedir("POST", "/mcp", { corpo: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }), cabecalhos: { "Content-Type": "application/json" } });
  marca(mcp?.status === 401, `/mcp sem token: ${mcp ? `HTTP ${mcp.status}` : "sem resposta"} (esperado 401)`);

  // 4. /api/state sem sessão → 401
  const st = await pedir("GET", "/api/state");
  marca(st?.status === 401, `/api/state sem sessão: ${st ? `HTTP ${st.status}` : "sem resposta"} (esperado 401)`);

  return { ok, linhas };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  let o;
  try { o = lerArgs(process.argv.slice(2)); } catch (e) { console.error(`✖ ${e.message}`); process.exit(2); }
  const r = await smoke(o);
  for (const l of r.linhas) console.log(l);
  if (!r.ok) { console.error("✖ smoke falhou"); process.exit(1); }
  console.log("✔ smoke ok");
}
