import { test } from "node:test";
import assert from "node:assert/strict";
import { call, makeEnv, mcp, BOOT } from "./fakes.ts";
import { RATE_LIMITS } from "../src/db.ts";

test("conta nova: perfil vazio, onboarding pendente, planejar devolve estado vazio", async () => {
  const env = makeEnv();
  const s = await call(env, "GET", "/api/state?date=2026-11-05", { user: "nova" });
  assert.equal(s.status, 200);
  assert.deepEqual(s.data.profile, {}); assert.equal(s.data.onboarding, "pendente"); assert.deepEqual(s.data.gyms, []);
  assert.equal(s.data.account.email, "nova@dev.localhost");
  const p = await call(env, "POST", "/api/plan-day", { user: "nova", body: { date: "2026-11-05", daysLeft: 2 } });
  assert.equal(p.data.plan, null); assert.equal(p.data.empty, "sem_perfil");
  await call(env, "PATCH", "/api/account", { user: "nova", body: { onboarding: "concluido" } });
  assert.equal((await call(env, "GET", "/api/state?date=2026-11-05", { user: "nova" })).data.onboarding, "concluido");
  assert.ok(env.DB.raw.prepare("SELECT last_seen_at FROM user").get().last_seen_at > 0);
});

test("token MCP: criar (uma vez), listar sem valor, revogar → 401; só hash no banco", async () => {
  const env = makeEnv();
  const t = (await call(env, "POST", "/api/account/tokens", { user: "u1", body: { label: "celular" } })).data;
  assert.match(t.token, /^ciclo_[0-9a-f]{16}_[0-9a-f]{64}$/);
  const list = await call(env, "GET", "/api/account/tokens", { user: "u1" });
  assert.ok(!list.text.includes(t.token.split("_")[2])); assert.equal(list.data.tokens.length, 1);
  assert.ok(!JSON.stringify(env.DB.raw.prepare("SELECT * FROM mcp_token").all()).includes(t.token));
  assert.equal((await mcp(env, t.token, "ciclo_estado")).status, 200);
  assert.equal((await mcp(env, t.token.slice(0, -1) + (t.token.endsWith("0") ? "1" : "0"), "ciclo_estado")).status, 401);
  assert.equal((await call(env, "DELETE", `/api/account/tokens/${t.id}`, { user: "u1" })).status, 200);
  assert.equal((await mcp(env, t.token, "ciclo_estado")).status, 401);
});

test("MCP_TOKEN global: só bootstrap em localhost com DEV_NO_AUTH", async () => {
  const env = makeEnv();
  assert.equal((await mcp(env, BOOT, "ciclo_estado")).status, 200);
  const remote = await call(env, "POST", "/mcp", { bearer: BOOT, host: "ciclo.exemplo.workers.dev", body: { jsonrpc: "2.0", id: 1, method: "ping" } });
  assert.equal(remote.status, 401);
  assert.equal((await mcp(makeEnv({ DEV_NO_AUTH: undefined }), BOOT, "ciclo_estado")).status, 401);
});

test("x-dev-user só vale em localhost; fora dele, sem sessão = 401", async () => {
  const env = makeEnv();
  assert.equal((await call(env, "GET", "/api/account", { user: "x", host: "ciclo.exemplo.workers.dev" })).status, 401);
  assert.equal((await call(env, "GET", "/api/account", { headers: { Cookie: "ciclo_dev_user=bob" } })).data.account.email, "bob@dev.localhost");
  assert.equal((await call(env, "GET", "/api/account", { user: "../X" })).status, 401);
});

test("exportar e apagar a conta: linhas e objetos R2 somem", async () => {
  const env = makeEnv();
  await call(env, "PUT", "/api/gyms/g", { user: "z", body: { name: "G", equipment: [] } });
  await call(env, "POST", "/api/pains", { user: "z", body: { region: "cervical", intensity: 1 } });
  await call(env, "POST", "/api/media", { user: "z", raw: new Uint8Array([137, 80, 78, 71, 1, 2]), ct: "image/png" });
  await call(env, "POST", "/api/account/tokens", { user: "z", body: {} });
  await call(env, "GET", "/api/state?date=2026-11-05", { user: "outro" });
  const e = (await call(env, "GET", "/api/account/export", { user: "z" })).data;
  assert.equal(e.gym.length, 1); assert.equal(e.pain.length, 1); assert.equal(e.media.length, 1); assert.ok(!("hash" in e.mcp_token[0]));
  assert.equal(env.MEDIA.m.size, 1);
  assert.equal((await call(env, "DELETE", "/api/account", { user: "z", body: {} })).status, 400);
  assert.equal((await call(env, "DELETE", "/api/account", { user: "z", body: { confirm: "APAGAR" } })).status, 200);
  assert.equal(env.MEDIA.m.size, 0);
  const tables = env.DB.raw.prepare("SELECT name FROM sqlite_master WHERE type='table' AND sql LIKE '%user_id%'").all().map((r: any) => r.name);
  for (const t of tables) assert.equal(env.DB.raw.prepare(`SELECT COUNT(*) n FROM ${t} WHERE user_id = ?`).get(e.user.id).n, 0, t);
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) n FROM user").get().n, 1);
});

test("limite de escrita por usuário → 429 (não afeta outra conta)", async () => {
  const env = makeEnv();
  let last = 0;
  for (let i = 0; i <= RATE_LIMITS.write.max; i++) last = (await call(env, "POST", "/api/inbox", { user: "r", body: { text: "x" } })).status;
  assert.equal(last, 429);
  assert.equal((await call(env, "POST", "/api/inbox", { user: "s", body: { text: "x" } })).status, 201);
});
