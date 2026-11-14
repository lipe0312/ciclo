// #71 Primeiros passos da conta nova pela API: rascunho aceito, PATCH por passo (mescla, sem padrão por baixo),
// "Pular por agora" e "Gerar semana" sem erro com perfil parcial, e erro com texto humano.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PROFILE, EQUIPMENT, perfilVazio, planDay } from "@ciclo/core";
import { call, makeEnv } from "./fakes.ts";

const D = "2026-11-12";
const profileOf = (env: any, user: string) => {
  const r = env.DB.raw.prepare("SELECT data FROM profile WHERE user_id = (SELECT id FROM user WHERE email = ?1)").get(`${user}@dev.localhost`);
  return r ? JSON.parse(r.data) : null;
};

test("PATCH por passo: só os campos do passo, mescla com o que já está salvo e não inventa padrão", async () => {
  const env = makeEnv();
  const c = (m: string, p: string, body?: unknown) => call(env, m, p, { user: "nova", body });
  assert.equal((await c("PATCH", "/api/profile", { data: { goal: { id: "shape_v", statement: "Ombro largo", horizonWeeks: 16 } } })).status, 200);
  assert.equal((await c("PATCH", "/api/profile", { data: { level: 0 } })).status, 200);
  assert.equal((await c("PATCH", "/api/profile", { data: { diet: { mode: "leve" } } })).status, 200);
  assert.equal((await c("PATCH", "/api/profile", { data: { sex: "f", weightKg: 61.5 } })).status, 200);
  const p = profileOf(env, "nova");
  assert.equal(p.goal.id, "shape_v"); assert.equal(p.goal.statement, "Ombro largo"); assert.equal(p.level, 0);
  assert.deepEqual(p.diet, { mode: "leve" }, "comida: só o modo respondido, sem whey nem kcal do padrão");
  assert.equal(p.sex, "f"); assert.equal(p.weightKg, 61.5);
  for (const k of ["age", "heightCm", "bodyType", "fatWhere", "minutes", "daysTarget", "daysUsual", "hour", "dynamics", "places", "dayGym"]) assert.equal(p[k], undefined, `${k} não pode vir do padrão`);
  // o estado devolve o rascunho como está (o app monta o resto vazio)
  const st = (await c("GET", `/api/state?date=${D}`)).data;
  assert.equal(st.profile.diet.mode, "leve"); assert.equal(st.profile.bodyType, undefined);
  assert.notEqual(st.profile.weightKg, DEFAULT_PROFILE.weightKg);
});

test("rascunho com campos vazios (null, \"\", goal.id vazio, places []) é aceito no PUT e no PATCH", async () => {
  const env = makeEnv();
  const c = (m: string, p: string, body?: unknown) => call(env, m, p, { user: "nova", body });
  const r = await c("PUT", "/api/profile", { data: perfilVazio() });
  assert.equal(r.status, 200, r.text);
  assert.equal((await c("PATCH", "/api/profile", { data: { goal: { id: "", statement: "" }, places: [], age: null, bodyType: "" } })).status, 200);
  const p = profileOf(env, "nova");
  assert.equal(p.goal.id, undefined); assert.equal(p.places, undefined); assert.equal(p.age, undefined); assert.equal(p.sex, undefined);
});

test("Pular por agora com perfil parcial: salva o respondido, marca 'pulado' e conclui sem erro", async () => {
  const env = makeEnv();
  const c = (m: string, p: string, body?: unknown) => call(env, m, p, { user: "nova", body });
  await c("PATCH", "/api/profile", { data: { goal: { id: "saude" } } });
  const r = await c("PATCH", "/api/profile", { data: { level: 1, meta: { checkup: "pulado" } } });
  assert.equal(r.status, 200, r.text);
  assert.equal((await c("PATCH", "/api/account", { onboarding: "concluido" })).status, 200);
  const p = profileOf(env, "nova");
  assert.equal(p.goal.id, "saude"); assert.equal(p.level, 1); assert.equal(p.meta.checkup, "pulado");
  assert.equal(p.goal.horizonWeeks, 12, "objetivo ganha as metas iniciais dele");
  const st = (await c("GET", `/api/state?date=${D}`)).data;
  assert.equal(st.onboarding, "concluido"); assert.equal(st.profile.meta.checkup, "pulado");
});

test("Gerar semana com perfil parcial (sem corpo e sem comida): perfil, lugar, treino e conclusão sem erro", async () => {
  const env = makeEnv();
  const c = (m: string, p: string, body?: unknown) => call(env, m, p, { user: "nova", body });
  const respostas = { goal: { id: "bracos_ombros", statement: "Braço maior" }, subPriorities: ["ombro_lat", "biceps"], level: 1, daysUsual: ["seg", "qua", "sex"], daysTarget: 3, minutes: 60, places: ["academia"] };
  const r = await c("PATCH", "/api/profile", { data: { ...respostas, dayGym: { seg: "acad1", qua: "acad1", sex: "acad1" }, meta: { filledBy: "app", confirmed: true, checkup: "feito" } } });
  assert.equal(r.status, 200, r.text);
  assert.equal((await c("PUT", "/api/gyms/acad1", { name: "Academia 1", kind: "academia", equipment: EQUIPMENT.map((e) => e.id), busyHours: [] })).status, 200);
  const plan = planDay({ targets: {} as never, done: {}, freq: {}, priorities: ["ombro", "biceps"], daysLeft: 3, minutes: 60, lastGroup: null, mode: "normal", focus: null, equipment: EQUIPMENT.map((e) => e.id), crowded: false, prefs: {}, pinned: {}, avoid: [], pains: [] });
  assert.equal((await c("PUT", `/api/day-plan/${D}`, { plan, gymId: "acad1", source: "core" })).status, 200);
  assert.equal((await c("PATCH", "/api/account", { onboarding: "concluido" })).status, 200);
  const p = profileOf(env, "nova");
  assert.equal(p.meta.checkup, "feito"); assert.deepEqual(p.priorities, ["ombro", "biceps"]); assert.equal(p.sex, undefined); assert.equal(p.diet, undefined);
});

test("erro de validação do perfil volta com texto humano (nunca 'goal.id deve ser …')", async () => {
  const env = makeEnv();
  const c = (m: string, p: string, body?: unknown) => call(env, m, p, { user: "nova", body });
  for (const [m, data] of [["PATCH", { goal: { id: "inventado" } }], ["PUT", { goal: { id: "x" }, age: 500 }], ["PATCH", { campo: 1 }]] as const) {
    const r = await c(m, "/api/profile", { data });
    assert.equal(r.status, 400);
    assert.equal(r.data.code, "perfil_invalido");
    assert.match(r.data.error, /^Não deu para salvar: confira /);
    assert.ok(!/deve ser|bracos_ombros|goal\.id|campo desconhecido/.test(r.data.error), r.data.error);
  }
  assert.equal((await c("PATCH", "/api/profile", { data: [] })).status, 400);
  assert.equal(profileOf(env, "nova"), null, "nada gravado");
});
