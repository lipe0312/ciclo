// #114 Versão da conta: sobe a cada escrita (app ou MCP), isolada por conta, e o app lê barato (GET /api/version e no /api/state).
import { test } from "node:test";
import assert from "node:assert/strict";
import { call, makeEnv, mcp } from "./fakes.ts";

const D = "2026-11-16";
const ver = async (env: unknown, user: string) => (await call(env, "GET", "/api/version", { user })).data.version as number;
async function token(env: unknown, user: string) {
  const t = await call(env, "POST", "/api/account/tokens", { user, body: { label: "teste" } });
  assert.equal(t.status, 201, t.text);
  return t.data.token as string;
}
const tool = async (env: unknown, tok: string, name: string, args: Record<string, unknown> = {}) => {
  const r = await mcp(env, tok, name, args); assert.equal(r.status, 200, r.text); return r.data.result;
};

test("conta sem escrita: versão 0, e o /api/state traz a mesma versão", async () => {
  const env = makeEnv();
  assert.equal(await ver(env, "ana"), 0);
  assert.equal((await call(env, "GET", `/api/state?date=${D}`, { user: "ana" })).data.contaVersao, 0);
});

test("escrita pelo app sobe exatamente +1; leitura e escrita recusada não sobem", async () => {
  const env = makeEnv();
  await call(env, "GET", "/api/version", { user: "ana" });
  const v0 = await ver(env, "ana");
  await call(env, "GET", `/api/state?date=${D}`, { user: "ana" }); await call(env, "GET", `/api/diario?from=${D}&to=${D}`, { user: "ana" });
  assert.equal(await ver(env, "ana"), v0, "ler não muda");
  assert.equal((await call(env, "POST", "/api/inbox", { user: "ana", body: { text: "" } })).status, 400);
  assert.equal(await ver(env, "ana"), v0, "pedido inválido (4xx) não muda");
  assert.equal((await call(env, "POST", "/api/inbox", { user: "ana", body: { text: "pedido fictício" } })).status, 201);
  assert.equal(await ver(env, "ana"), v0 + 1);
  assert.equal((await call(env, "GET", `/api/state?date=${D}`, { user: "ana" })).data.contaVersao, v0 + 1, "o /api/state traz a versão atual");
});

test("escrita pelo MCP muda a versão; ferramenta só de leitura não", async () => {
  const env = makeEnv();
  const tok = await token(env, "ana");
  const v0 = await ver(env, "ana");
  await tool(env, tok, "ciclo_catalogo", { muscle: "ombro" });
  await tool(env, tok, "ciclo_diario", { from: D, to: D });
  assert.equal(await ver(env, "ana"), v0, "leitura pelo MCP não muda");
  const r = await tool(env, tok, "ciclo_registrar_dor", { region: "ombro_e", intensity: 1 });
  assert.ok(!r.isError, JSON.stringify(r));
  assert.equal(await ver(env, "ana"), v0 + 1, "escrita pelo MCP sobe a versão que o app confere");
});

test("MCP: prévia (simular), retorno com erro e salvamento recusado (salvo:false) NÃO sobem a versão; o confirmar de verdade sobe", async () => {
  const env = makeEnv();
  const tok = await token(env, "ana");
  const v0 = await ver(env, "ana");
  const previa = await tool(env, tok, "ciclo_comida_registrar", { texto: "2 ovos e pão", simular: true });
  assert.ok(!previa.isError, JSON.stringify(previa));
  const p = JSON.parse(previa.content[0].text);
  assert.equal(p.previa, true, "foi mesmo uma prévia");
  assert.equal(await ver(env, "ana"), v0, "prévia não grava nada");
  const erro = await tool(env, tok, "ciclo_comida_registrar", { confirmar: "prv_" + "0".repeat(32) });
  assert.equal(erro.isError, true);
  assert.equal(await ver(env, "ana"), v0, "erro (prévia inexistente) não sobe");
  const recusado = await tool(env, tok, "ciclo_salvar_treino_do_dia", { date: D, itens: [{ id: "x_inexistente", sets: 2 }], motivo: "t" });
  assert.ok(recusado.isError || JSON.parse(recusado.content[0].text).salvo === false, recusado.content?.[0]?.text);
  assert.equal(await ver(env, "ana"), v0, "salvamento recusado não sobe");
  const feito = await tool(env, tok, "ciclo_comida_registrar", { confirmar: p.token });
  assert.ok(!feito.isError, JSON.stringify(feito));
  assert.equal(await ver(env, "ana"), v0 + 1, "confirmar grava e sobe");
  await tool(env, tok, "ciclo_comida_registrar", { confirmar: p.token });
  assert.equal(await ver(env, "ana"), v0 + 1, "confirmar repetido (jaConfirmado) não sobe de novo");
});

test("com ctx (produção), a versão sobe via waitUntil sem atrasar a resposta", async () => {
  const env = makeEnv();
  const { default: worker } = await import("../src/index.ts");
  const pend: Promise<unknown>[] = [];
  const ctx = { waitUntil: (p: Promise<unknown>) => { pend.push(p); }, passThroughOnException() {} };
  const r = await worker.fetch(new Request("http://localhost:8791/api/inbox", { method: "POST", headers: { "x-dev-user": "ana", "content-type": "application/json" }, body: JSON.stringify({ text: "pedido fictício" }) }), env, ctx as any);
  assert.equal(r.status, 201);
  assert.equal(pend.length, 1, "a subida da versão foi para o waitUntil");
  await Promise.all(pend);
  assert.equal(await ver(env, "ana"), 1);
});

test("isolamento: escrita da conta A (app e MCP) nunca muda a versão da B, e a B lê só a dela", async () => {
  const env = makeEnv();
  const tokA = await token(env, "ana");
  await call(env, "POST", "/api/inbox", { user: "bia", body: { text: "pedido da bia" } });
  const vB = await ver(env, "bia");
  assert.ok(vB >= 1);
  const vA0 = await ver(env, "ana");
  await call(env, "POST", "/api/inbox", { user: "ana", body: { text: "pedido da ana" } });
  await tool(env, tokA, "ciclo_registrar_dor", { region: "ombro_e", intensity: 1 });
  assert.equal(await ver(env, "ana"), vA0 + 2);
  assert.equal(await ver(env, "bia"), vB, "a versão da B não anda com escritas da A");
  assert.equal((await call(env, "GET", `/api/state?date=${D}`, { user: "bia" })).data.contaVersao, vB);
  const n = env.DB.raw.prepare("SELECT COUNT(*) AS n FROM conta_versao").get().n;
  assert.equal(n, 2, "uma linha por conta (ana e bia)");
});
