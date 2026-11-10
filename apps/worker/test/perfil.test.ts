// Perfil: salvar pelo MCP (parcial, validado, só da conta do token) e flag "treino desatualizado".
import { test } from "node:test";
import assert from "node:assert/strict";
import { EQUIPMENT } from "@ciclo/core";
import { call, makeEnv, mcp } from "./fakes.ts";

const D = "2026-11-05", ALL = EQUIPMENT.map((e) => e.id);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function token(env: any, user: string) { return (await call(env, "POST", "/api/account/tokens", { user, body: { label: "t" } })).data.token as string; }
const profileOf = (env: any, user: string) => JSON.parse(env.DB.raw.prepare("SELECT data FROM profile WHERE user_id = (SELECT id FROM user WHERE email = ?1)").get(`${user}@dev.localhost`).data);
const historyN = (env: any, user: string) => env.DB.raw.prepare("SELECT COUNT(*) AS n FROM profile_history WHERE user_id = (SELECT id FROM user WHERE email = ?1)").get(`${user}@dev.localhost`).n;

test("ciclo_salvar_perfil: salva parcial, valida, mescla e marca 'preenchido pelo Claude'", async () => {
  const env = makeEnv();
  const t = await token(env, "ana");
  const r = await mcp(env, t, "ciclo_salvar_perfil", { perfil: { subPriorities: ["ombro_lat", "biceps", "triceps_longa"], minutes: 45, weekStart: "dom", goal: { id: "forca", statement: "Ficar mais forte" } }, concluirPrimeirosPassos: true });
  assert.ok(!r.data.result.isError, r.text);
  const out = JSON.parse(r.data.result.content[0].text);
  assert.equal(out.salvo, true); assert.equal(out.contexto.versao, 1); assert.deepEqual(out.contexto.prioridades, ["Ombro lateral", "Bíceps", "Tríceps · cabeça longa"]);
  const p = profileOf(env, "ana");
  assert.equal(p.minutes, 45); assert.equal(p.weekStart, "dom"); assert.deepEqual(p.priorities, ["ombro", "biceps", "triceps"]);
  assert.deepEqual(p.meta, { filledBy: "claude", confirmed: false });
  assert.equal(p.goal.horizonWeeks, 12, "o resto do objetivo fica");
  assert.equal((await call(env, "GET", "/api/account", { user: "ana" })).data.onboarding, "concluido");
  // segunda chamada parcial mescla e versiona
  const r2 = await mcp(env, t, "ciclo_salvar_perfil", { perfil: { daysTarget: 3, prefs: { biceps: "cabo" } } });
  assert.equal(JSON.parse(r2.data.result.content[0].text).contexto.versao, 2);
  const p2 = profileOf(env, "ana");
  assert.equal(p2.minutes, 45); assert.equal(p2.daysTarget, 3); assert.equal(p2.prefs.biceps, "cabo"); assert.equal(historyN(env, "ana"), 2);
  // aparece no estado do app
  assert.equal((await call(env, "GET", "/api/state?date=" + D, { user: "ana" })).data.profile.meta.filledBy, "claude");
});

test("ciclo_salvar_perfil: entrada inválida é recusada e nada é gravado", async () => {
  const env = makeEnv();
  const t = await token(env, "ana");
  await mcp(env, t, "ciclo_salvar_perfil", { perfil: { minutes: 50 } });
  const before = JSON.stringify(profileOf(env, "ana")), n = historyN(env, "ana");
  const bad: Record<string, unknown>[] = [
    { subPriorities: ["ombro_lat", "biceps", "triceps_longa", "peito_sup"] }, { subPriorities: ["ombro_inventado"] }, { priorities: ["a", "b", "c", "d"] },
    { age: 3 }, { weekStart: "segunda" }, { minutes: "60" }, { avoid: ["Exercicio_Inventado"] }, { foo: 1 }, { prefs: { ombro: "foguete" } },
  ];
  for (const perfil of bad) {
    const r = await mcp(env, t, "ciclo_salvar_perfil", { perfil });
    assert.equal(r.status, 200); assert.equal(r.data.result.isError, true, JSON.stringify(perfil));
  }
  for (const args of [{}, { perfil: null }, { perfil: [] }, { perfil: "x" }]) assert.equal((await mcp(env, t, "ciclo_salvar_perfil", args)).data.result.isError, true, JSON.stringify(args));
  assert.equal(JSON.stringify(profileOf(env, "ana")), before); assert.equal(historyN(env, "ana"), n);
  // o mesmo vale para o app (PUT /api/profile)
  assert.equal((await call(env, "PUT", "/api/profile", { user: "ana", body: { data: { priorities: ["ombro", "biceps", "triceps", "peito"] } } })).status, 400);
  assert.equal((await call(env, "PUT", "/api/profile", { user: "ana", body: { data: { subPriorities: ["x"] } } })).status, 400);
  assert.equal(JSON.stringify(profileOf(env, "ana")), before);
});

test("ciclo_salvar_perfil: respeita o usuário do token (não lê nem grava na conta de outra pessoa)", async () => {
  const env = makeEnv();
  const tb = await token(env, "bia"), ta = await token(env, "ana");
  await mcp(env, tb, "ciclo_salvar_perfil", { perfil: { goal: { statement: "MARCA_B objetivo" }, avoid: ["Pullups"], daysTarget: 6, minutes: 90 } });
  const bBefore = JSON.stringify(profileOf(env, "bia")), bN = historyN(env, "bia");
  const bUid = env.DB.raw.prepare("SELECT id FROM user WHERE email = 'bia@dev.localhost'").get().id;
  // ana é conta nova: o patch dela NÃO pode herdar nada da bia (sem filtro por user_id, herdaria)
  const r = await mcp(env, ta, "ciclo_salvar_perfil", { perfil: { minutes: 45 }, userId: bUid, user_id: bUid });
  assert.ok(!r.data.result.isError, r.text);
  const a = profileOf(env, "ana");
  assert.equal(a.minutes, 45); assert.deepEqual(a.avoid, []); assert.equal(a.daysTarget, 4); assert.ok(!JSON.stringify(a).includes("MARCA_B"));
  assert.ok(!r.text.includes("MARCA_B") && !r.text.includes(bUid));
  assert.equal(JSON.stringify(profileOf(env, "bia")), bBefore, "perfil da B mudou"); assert.equal(historyN(env, "bia"), bN);
  assert.equal(historyN(env, "ana"), 1);
  // e a B continua dona do dela
  const rb = await mcp(env, tb, "ciclo_salvar_perfil", { perfil: { minutes: 75 } });
  assert.ok(!rb.data.result.isError);
  const b = profileOf(env, "bia"); assert.equal(b.minutes, 75); assert.deepEqual(b.avoid, ["Pullups"]); assert.equal(profileOf(env, "ana").minutes, 45);
});

test("treino desatualizado: mudar o perfil muda a impressão do treino salvo; o que não muda o treino não alarma", async () => {
  const env = makeEnv();
  const c = (m: string, p: string, body?: unknown) => call(env, m, p, { user: "ana", body });
  const full = (patch: Record<string, unknown> = {}) => ({ data: { ...profileOf(env, "ana"), ...patch } });
  await c("PUT", "/api/profile", { data: { priorities: ["ombro"], minutes: 60 } });
  await c("PUT", "/api/gyms/acad1", { name: "Academia", equipment: ALL });
  const plan = (await c("POST", "/api/plan-day", { date: D, daysLeft: 3 })).data.plan;
  await sleep(5);
  await c("PUT", `/api/day-plan/${D}`, { plan, gymId: "acad1", source: "claude" });
  const fp = async () => (await c("GET", `/api/state?date=${D}`)).data.dayPlan.profileFp as string;
  const { planFingerprint } = await import("@ciclo/core");
  const first = await fp();
  assert.equal(first, planFingerprint(profileOf(env, "ana")), "recém-gerado: impressão igual à do perfil atual");
  await sleep(5);
  await c("PUT", "/api/profile", full({ tone: "motivador", diet: { ...profileOf(env, "ana").diet, typical: "ovo" } }));
  assert.equal(planFingerprint(profileOf(env, "ana")), first, "tom e comida não desatualizam");
  assert.equal(await fp(), first);
  await sleep(5);
  await c("PUT", "/api/profile", full({ minutes: 45 }));
  assert.notEqual(planFingerprint(profileOf(env, "ana")), await fp(), "minutos mudaram: o treino salvo ficou para trás");
  // regenerar (salvar de novo) alinha de novo
  await sleep(5);
  await c("PUT", `/api/day-plan/${D}`, { plan, gymId: "acad1", source: "core" });
  assert.equal(planFingerprint(profileOf(env, "ana")), await fp());
  // outra conta não enxerga o treino nem a impressão
  assert.equal((await call(env, "GET", `/api/state?date=${D}`, { user: "bia" })).data.dayPlan, null);
});
