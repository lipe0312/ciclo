// Prova de isolamento: a conta A tenta ler/alterar dados da B em TODAS as rotas /api/* e ferramentas MCP.
// Falha se qualquer query perder o filtro user_id (vazamento de MARCA_B ou mudança no export da B).
import { test } from "node:test";
import assert from "node:assert/strict";
import { EQUIPMENT } from "@ciclo/core";
import { routeSignatures } from "../src/api.ts";
import { toolNames } from "../src/mcp.ts";
import { call, makeEnv, mcp } from "./fakes.ts";

const D = "2026-11-05", ALL = EQUIPMENT.map((e) => e.id), PNG = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
const SID = "0b7c6a2e-1d2f-4a3b-8c9d-0e1f2a3b4c5d";
const profile = (tag: string) => ({ data: { level: 1, priorities: ["ombro"], minutes: 60, daysTarget: 4, prefs: {}, pinned: {}, avoid: [], goal: { statement: `${tag} objetivo` } } });

async function seed(env: any, user: string, tag: string) {
  const c = (m: string, p: string, body?: unknown) => call(env, m, p, { user, body });
  const ok = async (p: Promise<{ status: number; text: string }>) => { const r = await p; assert.ok(r.status < 300, r.text); return r as any; };
  await ok(c("PUT", "/api/profile", profile(tag)));
  await ok(c("PUT", "/api/gyms/acad1", { name: `${tag} academia`, equipment: ALL }));
  await ok(c("PUT", `/api/checkin/${D}`, { sleepH: 7, energy: 2, soreness: 1, stress: 2, food: 0, note: `${tag} nota` }));
  await ok(c("PUT", `/api/attendance/${D}`, { status: "folga", reason: `${tag} motivo` }));
  await ok(c("PUT", `/api/measurements/${D}`, { armCm: 33 }));
  const plan = (await ok(c("POST", "/api/plan-day", { date: D, daysLeft: 3 }))).data.plan;
  await ok(c("PUT", `/api/day-plan/${D}`, { plan: { ...plan, name: `${tag} plano` }, gymId: "acad1" }));
  await ok(c("POST", "/api/plan-edits", { date: D, edit: { index: 0, sets: 2 } }));
  await ok(c("POST", "/api/sessions", { id: SID, date: D, plan }));
  await ok(c("POST", `/api/sessions/${SID}/sets`, { exerciseId: plan.items[0].exerciseId, setNo: 1, kg: 10, reps: 10 }));
  await ok(c("POST", `/api/sessions/${SID}/skip`, { exerciseId: plan.items[1].exerciseId, reason: "ocupado" }));
  const pain = (await ok(c("POST", "/api/pains", { region: "ombro_e", intensity: 2, context: `${tag} dor` }))).data.id;
  const inbox = (await ok(c("POST", "/api/inbox", { text: `${tag} pedido` }))).data.id;
  await ok(c("POST", "/api/food", { date: D, text: `${tag} comida` }));
  const media = (await ok(call(env, "POST", `/api/media?note=${tag}`, { user, raw: PNG, ct: "image/png" }))).data.id;
  const tok = (await ok(c("POST", "/api/account/tokens", { label: `${tag} token` }))).data;
  const exp = (await c("GET", "/api/account/export")).data;
  return { pain, inbox, media, tokenId: tok.id, token: tok.token, edit: exp.plan_edit[0].id, uid: exp.user.id };
}
const snap = async (env: any, user: string) => {
  const e = (await call(env, "GET", "/api/account/export", { user })).data;
  delete e.exportadoEm; delete e.user.last_seen_at; return JSON.stringify(e);
};

test("conta A não lê nem altera dados da conta B (todas as rotas e ferramentas)", async () => {
  const env = makeEnv();
  const B = await seed(env, "bia", "MARCA_B");
  const A = await seed(env, "ana", "MARCA_A");
  const before = await snap(env, "bia");
  const r2Before = [...env.MEDIA.m.keys()].filter((k: string) => k.includes(B.uid)).length;
  const secrets = ["MARCA_B", B.uid, B.pain, B.inbox, B.media, B.tokenId, B.edit, "bia@"];
  const noLeak = (label: string, text: string) => { for (const s of secrets) assert.ok(!text.includes(s), `${label} vazou ${s}`); };

  const a = (m: string, p: string, body?: unknown) => call(env, m, p, { user: "ana", body });
  const cases: [string, () => Promise<{ status: number; text: string }>, number?][] = [
    ["GET /api/state", () => a("GET", `/api/state?date=${D}`)],
    ["GET /api/account", () => a("GET", "/api/account")],
    ["PATCH /api/account", () => a("PATCH", "/api/account", { onboarding: "concluido" })],
    ["GET /api/account/export", () => a("GET", "/api/account/export")],
    ["GET /api/account/tokens", () => a("GET", "/api/account/tokens")],
    ["POST /api/account/tokens", () => a("POST", "/api/account/tokens", { label: "x" })],
    ["DELETE /api/account/tokens/:id", () => a("DELETE", `/api/account/tokens/${B.tokenId}`), 404],
    ["PUT /api/measurements/:date", () => a("PUT", `/api/measurements/${D}`, { armCm: 40 })],
    ["PUT /api/profile", () => a("PUT", "/api/profile", profile("A2"))],
    ["PUT /api/gyms/:id", () => a("PUT", "/api/gyms/acad1", { name: "A2", equipment: ["halteres"] })],
    ["PUT /api/checkin/:date", () => a("PUT", `/api/checkin/${D}`, { sleepH: 5, energy: 1, soreness: 0, stress: 1, food: 1 })],
    ["PUT /api/attendance/:date", () => a("PUT", `/api/attendance/${D}`, { status: "fui" })],
    ["POST /api/plan-day", () => a("POST", "/api/plan-day", { date: D, daysLeft: 2, gymId: "acad1" })],
    ["PUT /api/day-plan/:date", () => a("PUT", `/api/day-plan/${D}`, { plan: { items: [] } })],
    ["POST /api/plan-edits", () => a("POST", "/api/plan-edits", { date: D, edit: { index: 0, sets: 3 } }), 422],
    ["POST /api/sessions/:id/sets", () => a("POST", `/api/sessions/${SID}/sets`, { exerciseId: "x", muscle: "ombro", setNo: 2, reps: 1 })],
    ["POST /api/sessions/:id/skip", () => a("POST", `/api/sessions/${SID}/skip`, { exerciseId: "x", reason: "dor" })],
    ["POST /api/sessions/:id/finish", () => a("POST", `/api/sessions/${SID}/finish`, { feedback: {} })],
    ["POST /api/sessions", () => a("POST", "/api/sessions", { id: SID, date: D, plan: {} })],
    ["POST /api/pains", () => a("POST", "/api/pains", { region: "ombro_e", intensity: 3 })],
    ["POST /api/pains/:id/resolve", () => a("POST", `/api/pains/${B.pain}/resolve`), 404],
    ["POST /api/inbox", () => a("POST", "/api/inbox", { text: "oi" })],
    ["POST /api/inbox/:id/status", () => a("POST", `/api/inbox/${B.inbox}/status`, { status: "descartado" }), 404],
    ["POST /api/food", () => a("POST", "/api/food", { date: D, text: "arroz" })],
    ["POST /api/transcribe", () => call(env, "POST", "/api/transcribe", { user: "ana", raw: PNG, ct: "audio/webm" })],
    ["POST /api/media", () => call(env, "POST", "/api/media", { user: "ana", raw: PNG, ct: "image/png" })],
    ["GET /api/media", () => a("GET", "/api/media")],
    ["GET /api/media/:id", () => a("GET", `/api/media/${B.media}`), 404],
  ];
  const tools: [string, Record<string, unknown>, boolean?][] = [
    ["ciclo_estado", { date: D }], ["ciclo_catalogo", { muscle: "ombro", gymId: "acad1" }], ["ciclo_planejar_dia", { date: D, daysLeft: 2 }],
    ["ciclo_salvar_treino_do_dia", { date: D, itens: [{ id: "x_inexistente", sets: 2 }], motivo: "t" }],
    ["ciclo_responder_pedido", { id: B.inbox, resposta: "oi" }, true], ["ciclo_marcar_presenca", { date: D, status: "nao_fui" }],
    ["ciclo_registrar_dor", { region: "ombro_e", intensity: 1 }], ["ciclo_registrar_comida", { texto: "pão", date: D }],
    ["ciclo_revisar_edicoes", {}], ["ciclo_concluir_revisao", { id: B.edit, review: "ok" }, true],
  ];
  assert.deepEqual(cases.map((c) => c[0]).concat("DELETE /api/account").sort(), routeSignatures().sort(), "toda rota precisa de caso de isolamento");
  assert.deepEqual(tools.map((t) => t[0]).sort(), [...toolNames].sort(), "toda ferramenta MCP precisa de caso");

  for (const [sig, run, status] of cases) {
    const r = await run();
    if (status) assert.equal(r.status, status, `${sig}: ${r.text}`); else assert.ok(r.status < 300, `${sig}: ${r.status} ${r.text}`);
    noLeak(sig, r.text);
  }
  for (const [name, args, isErr] of tools) {
    const r = await mcp(env, A.token, name, args);
    assert.equal(r.status, 200); assert.equal(!!r.data.result.isError, !!isErr, `${name}: ${r.text}`);
    noLeak(name, r.text);
  }
  const up = await call(env, "POST", "/mcp/media", { bearer: A.token, raw: PNG, ct: "image/png" });
  assert.equal(up.status, 201);
  noLeak("export A", (await a("GET", "/api/account/export")).text);

  assert.equal((await a("DELETE", "/api/account", { confirm: "APAGAR" })).status, 200);
  assert.equal(await snap(env, "bia"), before, "dados da B mudaram");
  assert.equal([...env.MEDIA.m.keys()].filter((k: string) => k.includes(B.uid)).length, r2Before);
  assert.equal((await mcp(env, B.token, "ciclo_estado")).status, 200);
});
