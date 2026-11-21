// #133 Pelo Worker real: cofre com openrouter e deepseek (validação no host fixo, canário, eco do provedor, isolamento)
// e o perfil de IA (perfil.ia) salvo por conta. Provedores falsos (fetch trocado); chaves fictícias montadas aqui.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { call, makeEnv } from "./fakes.ts";

const KEK = Buffer.alloc(32, 6).toString("base64");
const OR_A = "sk-" + "or-v1-" + "CANARIO" + "a".repeat(57);
const DS_B = "sk-" + "CANARIODS" + "b".repeat(30);
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

type Chamada = { url: string; headers: Record<string, string>; redirect?: string };
function provedorFalso(o: { status?: number; statusKey?: number } = {}) {
  const calls: Chamada[] = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url), headers = { ...(init?.headers as Record<string, string>) };
    calls.push({ url: u, headers, redirect: init?.redirect });
    const eco = () => new Response(JSON.stringify({ error: { message: `bad key ${JSON.stringify(headers)}` } }), { status: o.status ?? o.statusKey });
    if (o.status) return eco();
    if (u.endsWith("/api/v1/key")) return o.statusKey ? eco() : Response.json({ data: { label: "x", is_free_tier: true } });
    if (u.includes("openrouter.ai/api/v1/models")) return Response.json({ data: [{ id: "openai/gpt-4o" }, { id: "meta-llama/llama-3.3-70b-instruct:free" }, { id: "openrouter/auto" }] });
    if (u.includes("api.deepseek.com/models")) return Response.json({ data: [{ id: "deepseek-chat" }, { id: "deepseek-reasoner" }] });
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
  return calls;
}
const nova = (provedor: string, chave: string) => ({ provedor, apelido: "Chave fictícia", chave, tetoDia: 1, tetoMes: 5 });
const dumpD1 = (env: any) => JSON.stringify((env.DB.raw.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[])
  .map((t) => env.DB.raw.prepare(`SELECT * FROM "${t.name}"`).all()));

test("OpenRouter: autentica no endpoint da chave e lista os modelos (host fixo, sem redirect); padrão grátis; a chave não volta nem fica em claro", async () => {
  const logs: string[] = [];
  const orig = { log: console.log, warn: console.warn, error: console.error };
  for (const k of Object.keys(orig) as (keyof typeof orig)[]) console[k] = (...a: unknown[]) => { logs.push(a.map(String).join(" ")); };
  try {
    const env = makeEnv({ KEK_V1: KEK });
    const calls = provedorFalso();
    const r = await call(env, "POST", "/api/account/chaves", { user: "ana", body: nova("openrouter", OR_A) });
    assert.equal(r.status, 201, r.text);
    assert.deepEqual(calls.map((c) => c.url), ["https://openrouter.ai/api/v1/key", "https://openrouter.ai/api/v1/models"]);
    for (const c of calls) { assert.equal(c.headers.Authorization, `Bearer ${OR_A}`); assert.equal(c.redirect, "manual"); }
    assert.equal(r.data.chave.nomeProvedor, "OpenRouter");
    assert.equal(r.data.chave.modelo, "meta-llama/llama-3.3-70b-instruct:free", "ninguém paga sem escolher");
    assert.deepEqual(r.data.chave.modelos.map((m: any) => m.id), ["meta-llama/llama-3.3-70b-instruct:free", "openai/gpt-4o"]);
    const lista = await call(env, "GET", "/api/account/chaves", { user: "ana" });
    assert.ok(lista.data.provedores.some((p: any) => p.id === "openrouter") && lista.data.provedores.some((p: any) => p.id === "deepseek"));
    for (const [rot, txt] of [["POST", r.text], ["GET", lista.text], ["export", (await call(env, "GET", "/api/account/export", { user: "ana" })).text], ["D1", dumpD1(env)], ["console", logs.join("\n")]]) {
      assert.ok(!txt.includes("CANARIO"), `${rot} vazou a chave`);
    }
  } finally { Object.assign(console, orig); }
});

test("OpenRouter: chave recusada no endpoint da chave → 422 com mensagem fixa (corpo que ecoa o cabeçalho é descartado) e sem a 2ª chamada", async () => {
  const env = makeEnv({ KEK_V1: KEK });
  const calls = provedorFalso({ statusKey: 401 });
  const r = await call(env, "POST", "/api/account/chaves", { user: "ana", body: nova("openrouter", OR_A) });
  assert.equal(r.status, 422); assert.equal(r.data.code, "chave_recusada");
  assert.ok(!r.text.includes("CANARIO") && !r.text.includes("Bearer"));
  assert.equal(calls.length, 1);
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM chave_ia").get().n, 0);
});

test("DeepSeek: valida em api.deepseek.com e isola entre contas (B não vê nem mexe na chave de A)", async () => {
  const env = makeEnv({ KEK_V1: KEK });
  provedorFalso();
  const rb = await call(env, "POST", "/api/account/chaves", { user: "bia", body: nova("deepseek", DS_B) });
  assert.equal(rb.status, 201, rb.text);
  assert.equal(rb.data.chave.modelo, "deepseek-chat");
  const la = await call(env, "GET", "/api/account/chaves", { user: "ana" });
  assert.deepEqual(la.data.chaves, []);
  for (const [m, p, b] of [["PATCH", `/api/account/chaves/${rb.data.chave.id}`, { ativo: false }], ["DELETE", `/api/account/chaves/${rb.data.chave.id}`, undefined]] as const) {
    assert.equal((await call(env, m, p, { user: "ana", body: b })).status, 404);
  }
  assert.ok(!rb.text.includes("CANARIO"));
  assert.equal(env.DB.raw.prepare("SELECT ativo FROM chave_ia WHERE id = ?1").get(rb.data.chave.id).ativo, 1);
});

test("formato e host: chave de outro formato recusada sem chamar; provedor fora da lista recusado; CHECK do D1 aceita só os 5", async () => {
  const env = makeEnv({ KEK_V1: KEK });
  const calls = provedorFalso();
  assert.equal((await call(env, "POST", "/api/account/chaves", { user: "ana", body: nova("deepseek", OR_A) })).status, 400);
  assert.equal((await call(env, "POST", "/api/account/chaves", { user: "ana", body: nova("xai", OR_A) })).status, 400);
  assert.equal(calls.length, 0);
  const ins = (p: string) => () => env.DB.raw.prepare(`INSERT INTO chave_ia (id, user_id, provedor, apelido, ultimos4, impressao, ciphertext, iv, dek_cifrada, kek_versao, teto_dia, teto_mes, criado_em)
    VALUES (?1, ?3, ?2, 'x', 'abcd', 'abcdefabcdef', 'c', 'i', 'd', 1, 1, 1, 1)`).run(`id-${p}-000`, p, uid);
  const uid = (env.DB.raw.prepare("SELECT id FROM user LIMIT 1").get() as { id: string }).id;
  ins("openrouter")(); ins("deepseek")();
  assert.throws(ins("xai"));
});

test("perfil.ia: salva pelo PATCH do perfil, valida (sem campo estranho nem principal fora da lista) e fica por conta", async () => {
  const env = makeEnv();
  const ia = { usa: [{ provedor: "claude", acesso: ["assinatura"] }, { provedor: "gemini", acesso: ["chave"] }], principal: "gemini" };
  assert.equal((await call(env, "PATCH", "/api/profile", { user: "ana", body: { data: { ia } } })).status, 200);
  const sa = await call(env, "GET", "/api/state?date=2026-11-21", { user: "ana" });
  assert.deepEqual(sa.data.profile.ia, ia);
  const sb = await call(env, "GET", "/api/state?date=2026-11-21", { user: "bia" });
  assert.equal(sb.data.profile?.ia, undefined, "a conta B não vê o perfil de IA da A");
  for (const bad of [{ usa: [{ provedor: "claude", acesso: ["x"] }] }, { usa: [], principal: "claude" }, { usa: [{ provedor: "outra", acesso: [], nome: "<img src=x>" }] }, { usa: [], hack: 1 }]) {
    assert.equal((await call(env, "PATCH", "/api/profile", { user: "ana", body: { data: { ia: bad } } })).status, 400, JSON.stringify(bad));
  }
  assert.deepEqual((await call(env, "GET", "/api/state?date=2026-11-21", { user: "ana" })).data.profile.ia, ia, "recusado não grava");
});

test("GET /api/account/ia: conexão e provedores com chave ativa, só da própria conta e sem segredo", async () => {
  const env = makeEnv({ KEK_V1: KEK });
  provedorFalso();
  assert.equal((await call(env, "POST", "/api/account/chaves", { user: "bia", body: nova("deepseek", DS_B) })).status, 201);
  const b = await call(env, "GET", "/api/account/ia", { user: "bia" });
  assert.deepEqual(b.data, { conector: "nenhum", chaves: [{ provedor: "deepseek", ativo: true }] });
  assert.ok(!b.text.includes("CANARIO"));
  const a = await call(env, "GET", "/api/account/ia", { user: "ana" });
  assert.deepEqual(a.data, { conector: "nenhum", chaves: [] }, "a conta A não vê a chave da B");
});
