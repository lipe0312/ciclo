// #55 "Conectar meu Claude": token por pessoa (teto de 5, expira sem uso em 90 dias, revogado = 401, o ✅ do teste),
// escopo do MCP (o user_id vem só do token: mandar o user_id de outra conta não muda nada, em TODAS as ferramentas,
// lista gerada do roteador) e apagar a conta pela tela (tokens, sessões, passkeys e R2 somem). Tudo fictício.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_MCP_TOKENS, TOKEN_IDLE_MS } from "@ciclo/core";
import { TOOLS, toolNames } from "../src/mcp.ts";
import { USER_TABLES, deleteAccount } from "../src/db.ts";
import { call, makeEnv, mcp } from "./fakes.ts";
import { contaPorConvite, dono, envConta } from "./conta-helpers.ts";

const D = "2026-11-05";
const rpc = (env: unknown, token: string, method: string, params: Record<string, unknown> = {}) =>
  call(env, "POST", "/mcp", { bearer: token, body: { jsonrpc: "2.0", id: 1, method, params } });

test("chave: no máximo 5 ativas; revogar libera; o ✅ do teste acende na 1ª chamada MCP", async () => {
  const env = makeEnv();
  const ids: string[] = [];
  for (let i = 0; i < MAX_MCP_TOKENS; i++) {
    const r = await call(env, "POST", "/api/account/tokens", { user: "ana", body: { label: `chave ${i}` } });
    assert.equal(r.status, 201, r.text); ids.push(r.data.id);
  }
  const cheio = await call(env, "POST", "/api/account/tokens", { user: "ana", body: {} });
  assert.equal(cheio.status, 409); assert.equal(cheio.data.code, "max_tokens");
  assert.equal((await call(env, "POST", "/api/account/tokens", { user: "bia", body: {} })).status, 201, "o teto é por pessoa");
  assert.equal((await call(env, "DELETE", `/api/account/tokens/${ids[0]}`, { user: "ana" })).status, 200);
  const nova = await call(env, "POST", "/api/account/tokens", { user: "ana", body: { label: "claude.ai" } });
  assert.equal(nova.status, 201);

  // o passo "Teste" da tela: lastUsedAt nulo até o Claude chamar; depois, preenchido
  const antes = (await call(env, "GET", "/api/account/tokens", { user: "ana" })).data;
  assert.equal(antes.max, 5); assert.equal(antes.ativos, 5);
  assert.equal(antes.tokens.find((t: any) => t.id === nova.data.id).lastUsedAt, null);
  assert.equal((await rpc(env, nova.data.token, "tools/list")).status, 200);
  const depois = (await call(env, "GET", "/api/account/tokens", { user: "ana" })).data.tokens.find((t: any) => t.id === nova.data.id);
  assert.ok(depois.lastUsedAt > 0); assert.equal(depois.estado, "ativo");
  assert.equal((await call(env, "GET", "/api/account/tokens", { user: "ana" })).data.tokens.find((t: any) => t.id === ids[0]).estado, "revogado");
});

test("chave sem uso há 90 dias expira: 401 no MCP, aviso na lista e sai do teto", async () => {
  const env = makeEnv();
  const t = (await call(env, "POST", "/api/account/tokens", { user: "ana", body: {} })).data;
  const velho = Date.now() - TOKEN_IDLE_MS - 60_000;
  env.DB.raw.prepare("UPDATE mcp_token SET created_at = ?1, last_used_at = NULL WHERE id = ?2").run(velho, t.id);
  assert.equal((await mcp(env, t.token, "ciclo_estado", { date: D })).status, 401);
  const l = (await call(env, "GET", "/api/account/tokens", { user: "ana" })).data;
  assert.equal(l.tokens[0].estado, "expirado"); assert.equal(l.ativos, 0);
  // perto de expirar: ainda vale e a tela avisa
  env.DB.raw.prepare("UPDATE mcp_token SET created_at = ?1 WHERE id = ?2").run(Date.now() - TOKEN_IDLE_MS + 5 * 86_400_000, t.id);
  assert.equal((await call(env, "GET", "/api/account/tokens", { user: "ana" })).data.tokens[0].estado, "expirando");
  assert.equal((await mcp(env, t.token, "ciclo_estado", { date: D })).status, 200);
});

// Argumentos mínimos a partir do inputSchema publicado em tools/list (a lista acompanha o roteador sozinha).
function gerar(s: any): unknown {
  if (!s || typeof s !== "object") return "x";
  if (Array.isArray(s.enum)) return s.enum[0];
  switch (s.type) {
    case "string": return /YYYY-MM-DD/.test(s.description ?? "") || /date|de|ate|from|to/.test(s.__nome ?? "") ? D : "x";
    case "integer": case "number": return s.minimum ?? 1;
    case "boolean": return true;
    case "array": return Array.from({ length: Math.max(1, s.minItems ?? 1) }, () => gerar(s.items));
    case "object": {
      const o: Record<string, unknown> = {};
      for (const k of s.required ?? []) o[k] = gerar({ ...s.properties?.[k], __nome: k });
      return o;
    }
    default: return "x";
  }
}

test("escopo: o token da A nunca lê nem escreve a B, mesmo mandando o user_id da B, em todas as ferramentas", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("[]", { status: 200 }));
  const env = makeEnv();
  const seed = async (user: string, tag: string) => {
    const c = (m: string, p: string, body?: unknown) => call(env, m, p, { user, body });
    assert.equal((await c("PUT", "/api/profile", { data: { level: 1, priorities: ["ombro"], minutes: 60, daysTarget: 4, prefs: {}, pinned: {}, avoid: [], goal: { statement: `${tag} objetivo` } } })).status, 200);
    await c("PUT", "/api/gyms/acad1", { name: `${tag} academia`, equipment: ["halteres", "banco"] });
    await c("PUT", `/api/checkin/${D}`, { sleepH: 7, energy: 2, soreness: 1, stress: 2, food: 0, note: `${tag} nota joelho` });
    const food = (await c("POST", "/api/food", { date: D, text: `${tag} comida`, meal: "cafe" })).data.id;
    const inbox = (await c("POST", "/api/inbox", { text: `${tag} pedido` })).data.id;
    const tok = (await c("POST", "/api/account/tokens", { label: `${tag} chave` })).data;
    await mcp(env, tok.token, "ciclo_memoria_salvar", { fato: `${tag} prefere halteres` });
    const exp = (await c("GET", "/api/account/export")).data;
    return { uid: exp.user.id as string, email: exp.user.email as string, token: tok.token as string, tokenId: tok.id as string, food, inbox };
  };
  const B = await seed("bia", "MARCA_B");
  const A = await seed("ana", "MARCA_A");
  const snapB = async () => { const e = (await call(env, "GET", "/api/account/export", { user: "bia" })).data; delete e.exportadoEm; delete e.user.last_seen_at; return JSON.stringify(e); };
  const antes = await snapB();
  const segredos = ["MARCA_B", B.uid, B.email, B.food, B.inbox, B.tokenId];
  const semVazar = (onde: string, txt: string) => { for (const s of segredos) assert.ok(!txt.includes(s), `${onde} vazou ${s}`); };

  const list = await rpc(env, A.token, "tools/list");
  const tools = list.data.result.tools as { name: string; inputSchema: any }[];
  assert.deepEqual(tools.map((x) => x.name).sort(), [...toolNames].sort(), "lista vem do roteador");
  const PROIBIDOS = /^(user_?id|uid|usuario|conta|account|email|owner)$/i;
  for (const x of tools) {
    assert.equal(x.inputSchema.additionalProperties, false, `${x.name} aceita campo extra`);
    for (const k of Object.keys(x.inputSchema.properties ?? {})) assert.ok(!PROIBIDOS.test(k), `${x.name} aceita ${k}`);
  }

  // cada chamada precisa chegar ao handler da ferramenta (não pode parar antes, por exemplo no limite de escrita)
  const chegou = new Map<string, number>();
  for (const tool of TOOLS) {
    const run = tool.run;
    t.mock.method(tool, "run", (...a: Parameters<typeof run>) => { chegou.set(tool.name, (chegou.get(tool.name) ?? 0) + 1); return run(...a); });
  }
  const intrusos = { user_id: B.uid, userId: B.uid, uid: B.uid, email: B.email, conta: B.uid };
  for (const x of tools) {
    const base = gerar(x.inputSchema) as Record<string, unknown>;
    for (const args of [{ ...base, ...intrusos }, { ...base, ...intrusos, id: B.inbox }, { ...base, ...intrusos, id: B.food }]) {
      const r = await mcp(env, A.token, x.name, args);
      assert.equal(r.status, 200, `${x.name}: ${r.text}`);
      semVazar(x.name, r.text);
    }
  }
  const naoChegou = TOOLS.filter((x) => (chegou.get(x.name) ?? 0) < 3).map((x) => `${x.name}${x.readOnly ? "" : " (escrita)"}`);
  assert.deepEqual(naoChegou, [], "chamadas que não chegaram ao handler");
  assert.ok(TOOLS.some((x) => !x.readOnly), "há ferramentas de escrita na lista");
  // quem chama é a A: as leituras trazem a A (prova de que o token, e não o parâmetro, escolhe a conta)
  const est = await mcp(env, A.token, "ciclo_contexto", { user_id: B.uid });
  assert.ok(est.text.includes("MARCA_A")); semVazar("ciclo_contexto", est.text);
  const res = await rpc(env, A.token, "resources/read", { uri: "ciclo://contexto", user_id: B.uid });
  assert.ok(res.text.includes("MARCA_A")); semVazar("resources/read", res.text);

  assert.equal(await snapB(), antes, "dados da B mudaram por chamadas com o token da A");
  assert.equal((await mcp(env, B.token, "ciclo_estado", { date: D })).status, 200, "o token da B segue valendo");
  // revogado → 401 na próxima chamada
  assert.equal((await call(env, "DELETE", `/api/account/tokens/${A.tokenId}`, { user: "ana" })).status, 200);
  assert.equal((await rpc(env, A.token, "tools/list")).status, 401);
});

test("apagar a conta pela tela: tokens, sessões, passkeys e R2 somem; o resto continua", async () => {
  const env = envConta();
  const d = await dono(env);
  const ana = await contaPorConvite(env, d.cookie, "Ana Fictícia");
  const as = (m: string, p: string, o: Record<string, unknown> = {}) => call(env, m, p, { user: ana.cookie, ...o });
  const tok = (await as("POST", "/api/account/tokens", { body: { label: "claude.ai" } })).data;
  assert.equal((await as("POST", "/api/media", { raw: new Uint8Array([137, 80, 78, 71, 1]), ct: "image/png" })).status, 201);
  const dTok = (await call(env, "POST", "/api/account/tokens", { user: d.cookie, body: {} })).data;
  // convite com o e-mail de uma terceira pessoa: o export da dona não leva esse e-mail
  assert.equal((await call(env, "POST", "/api/account/invites", { user: d.cookie, body: { email: "terceira@exemplo.com" } })).status, 201);
  const expDona = await call(env, "GET", "/api/account/export", { user: d.cookie });
  assert.ok(expDona.data.invites.some((i: any) => i.tipo === "criado_por_mim"));
  assert.ok(!expDona.text.includes("terceira@exemplo.com"), "e-mail de terceiro no export");
  const donaUid = expDona.data.user.id;
  // a regra da dona vale dentro do lote (atômica): chamada direta, sem a checagem da API, não apaga nada
  assert.equal(await deleteAccount(env, donaUid), false);
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM mcp_token WHERE user_id = ?1").get(donaUid).n, 1);
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM user WHERE id = ?1").get(donaUid).n, 1);
  const uid = (await as("GET", "/api/account/export")).data.user.id;
  const n = (t: string) => env.DB.raw.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE user_id = ?1`).get(uid).n;
  assert.ok(n("mcp_token") && n("sessions") && n("passkeys"));
  assert.ok([...env.MEDIA.m.keys()].some((k: string) => k.includes(uid)));

  assert.equal((await as("DELETE", "/api/account", { body: { confirm: "apagar" } })).status, 400, "a tela manda APAGAR depois de a pessoa digitar");
  assert.equal((await as("DELETE", "/api/account", { body: { confirm: "APAGAR" } })).status, 200);
  for (const t of ["mcp_token", "sessions", "passkeys", "recovery_codes"]) assert.equal(n(t), 0, t);
  assert.ok(![...env.MEDIA.m.keys()].some((k: string) => k.includes(uid)), "R2 da conta");
  assert.equal((await mcp(env, tok.token, "ciclo_estado", { date: D })).status, 401);
  assert.equal((await as("GET", "/api/account")).status, 401);
  // a dona segue (com o token dela) e, agora sozinha, pode se apagar
  assert.equal((await mcp(env, dTok.token, "ciclo_estado", { date: D })).status, 200);
  assert.equal((await call(env, "DELETE", "/api/account", { user: d.cookie, body: { confirm: "APAGAR" } })).status, 200);
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM invites WHERE created_by = ?1").get(donaUid).n, 0, "convites que a dona criou");
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM user").get().n, 0);
});

test("USER_TABLES cobre toda tabela com coluna user_id (as migrations de verdade)", () => {
  const db = makeEnv().DB.raw;
  const EXCECOES: string[] = []; // tabela com user_id que NÃO deve ser apagada com a conta (nenhuma hoje)
  const tabelas = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all().map((r: any) => r.name as string)
    .filter((t: string) => db.prepare("SELECT COUNT(*) AS n FROM pragma_table_info(?1) WHERE name = 'user_id'").get(t).n > 0);
  assert.deepEqual(tabelas.filter((t: string) => !EXCECOES.includes(t)).sort(), [...USER_TABLES].sort());
});
