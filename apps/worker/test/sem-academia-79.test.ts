// #79 Gerar treino sem academia cadastrada: buildDayInput nunca devolve "sem_academia"; usa peso corporal e gymId null.
// A semana, o plan-day e o MCP (ciclo_planejar_dia, ciclo_estado) geram e marcam equipamento "sem_academia". Fictício.
import { test } from "node:test";
import assert from "node:assert/strict";
import { EQUIPMENT, EXERCISE_BY_ID, PESO_CORPORAL } from "@ciclo/core";
import { call, makeEnv, mcp } from "./fakes.ts";
import { buildDayInput } from "../src/db.ts";

const D = "2026-11-16"; // segunda
const ALL = EQUIPMENT.map((e) => e.id);
const perfil = { data: { level: 1, priorities: ["ombro", "biceps", "triceps"], minutes: 60, daysTarget: 3, daysUsual: ["seg", "qua", "sex"], places: ["academia"], goal: { id: "bracos_ombros", statement: "objetivo fictício" } } };

async function contaSemAcademia(env: any, user = "ana") {
  const c = (m: string, p: string, body?: unknown) => call(env, m, p, { user, body });
  assert.equal((await c("PUT", "/api/profile", perfil)).status, 200);
  const uid = env.DB.raw.prepare("SELECT id FROM user WHERE email = ?").get(`${user}@dev.localhost`).id as string;
  return { c, uid };
}
const semAparelho = (items: { exerciseId: string }[]) => items.every((i) => EXERCISE_BY_ID[i.exerciseId]?.eq.length === 0);

test("buildDayInput com 0 academias: input com equipamento de peso corporal e gymId null, nunca empty", async () => {
  const env = makeEnv();
  const { uid } = await contaSemAcademia(env);
  const r = await buildDayInput(env as any, uid, { date: D, daysLeft: 3 });
  assert.equal(r.empty, undefined, "não devolve empty");
  assert.ok(!r.empty);
  assert.deepEqual(r.input.equipment, [...PESO_CORPORAL]);
  assert.equal(r.gymId, null);
  assert.equal(r.equipamento, "sem_academia");
  // perfil sem o básico (pulou os Primeiros passos) e sem academia: continua vazio, sem treino aleatório (#63)
  const pulou = await contaSemAcademia(env, "caio");
  assert.equal((await pulou.c("PUT", "/api/profile", { data: { meta: { checkup: "pulado" } } })).status, 200);
  assert.deepEqual(await buildDayInput(env as any, pulou.uid, { date: D, daysLeft: 3 }), { empty: "sem_perfil" });
  // sem perfil continua vazio (Primeiros passos)
  const outro = await contaSemAcademia(env, "bia");
  env.DB.raw.prepare("DELETE FROM profile WHERE user_id = ?").run(outro.uid);
  assert.deepEqual(await buildDayInput(env as any, outro.uid, { date: D, daysLeft: 3 }), { empty: "sem_perfil" });
});

test("sem academia: plan-day e a semana geram com peso corporal; com academia cadastrada e refeita, usam os aparelhos", async () => {
  const env = makeEnv();
  const { c } = await contaSemAcademia(env);
  const pd = await c("POST", "/api/plan-day", { date: D, daysLeft: 3 });
  assert.equal(pd.status, 200, pd.text);
  assert.equal(pd.data.empty, undefined);
  assert.equal(pd.data.gymId, null);
  assert.equal(pd.data.equipamento, "sem_academia");
  assert.ok(pd.data.plan.items.length > 0 && semAparelho(pd.data.plan.items), "só peso corporal");

  const w = await c("GET", `/api/week?date=${D}`);
  assert.equal(w.status, 200, w.text);
  assert.ok(w.data.week, `semana gerada (veio ${w.data.empty})`);
  const treinos = w.data.week.days.filter((d: any) => d.kind === "treino");
  assert.ok(treinos.length >= 2);
  for (const d of treinos) { assert.equal(d.gymId, null); assert.ok(semAparelho(d.plan.items), `${d.date}: só peso corporal`); }
  const st = await c("GET", `/api/state?date=${D}`);
  assert.ok(st.data.dayPlan?.plan?.items?.length > 0, "o Hoje tem o treino");

  // cadastra a academia e refaz: a semana passa a usar os aparelhos e o plan-day deixa de marcar "sem_academia"
  assert.equal((await c("PUT", "/api/gyms/acad1", { name: "Academia Exemplo", equipment: ALL })).status, 200);
  const rg = await c("POST", "/api/week/regenerate", { date: D, reset: true, apply: true });
  assert.equal(rg.status, 200, rg.text);
  const dias = rg.data.week.days.filter((d: any) => d.kind === "treino" && d.date >= D && d.plan);
  assert.ok(dias.some((d: any) => d.gymId === "acad1" && !semAparelho(d.plan.items)), "refazer usou a academia nova");
  const pd2 = await c("POST", "/api/plan-day", { date: D, daysLeft: 3 });
  assert.equal(pd2.data.gymId, "acad1");
  assert.equal(pd2.data.equipamento, undefined);
});

test("MCP sem academia: ciclo_planejar_dia e ciclo_estado geram e dizem equipamento 'sem_academia'", async () => {
  const env = makeEnv();
  const { c } = await contaSemAcademia(env);
  const t = await c("POST", "/api/account/tokens", { label: "teste" });
  assert.equal(t.status, 201, t.text);
  const tool = async (name: string, args: Record<string, unknown>) => {
    const r = await mcp(env, t.data.token, name, args);
    assert.equal(r.status, 200, r.text);
    return JSON.parse(r.data.result.content[0].text);
  };
  // a semana de D já passou (D é fixo): o treino do dia lê a semana gravada; abre-a antes como o app faria
  assert.equal((await c("GET", `/api/week?date=${D}`)).status, 200);
  const dia = await tool("ciclo_planejar_dia", { date: D, daysLeft: 3 });
  assert.equal(dia.vazio, undefined, JSON.stringify(dia));
  assert.equal(dia.equipamento, "sem_academia");
  assert.match(dia.avisoEquipamento, /peso corporal/);
  const previa = await tool("ciclo_planejar_dia", { date: D, daysLeft: 3, minutes: 45 });
  assert.equal(previa.equipamento, "sem_academia");
  assert.ok(previa.itens.length > 0 && previa.itens.every((i: any) => EXERCISE_BY_ID[i.id]?.eq.length === 0));
  const est = await tool("ciclo_estado", { date: D });
  assert.equal(est.equipamento, "sem_academia");
  // com academia, o aviso some
  assert.equal((await c("PUT", "/api/gyms/acad1", { name: "Academia Exemplo", equipment: ALL })).status, 200);
  assert.equal((await tool("ciclo_estado", { date: D })).equipamento, undefined);
});
