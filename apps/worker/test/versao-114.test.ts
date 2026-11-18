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
