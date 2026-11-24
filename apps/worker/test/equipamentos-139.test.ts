// #139 `equipamentos` do perfil (sem academia): o PATCH valida, e a semana, o plan-day e o MCP usam o que a pessoa marcou.
// Dados fictícios.
import { test } from "node:test";
import assert from "node:assert/strict";
import { EXERCISE_BY_ID } from "@ciclo/core";
import { call, makeEnv, mcp } from "./fakes.ts";

const D = "2026-11-16"; // segunda
const perfil = { data: { level: 1, priorities: ["ombro", "biceps", "triceps"], minutes: 60, daysTarget: 3, daysUsual: ["seg", "qua", "sex"], places: ["casa"], goal: { id: "bracos_ombros", statement: "objetivo fictício" } } };
const MARCADOS = ["halteres", "banco", "elastico"];
const soMarcados = (items: { exerciseId: string }[]) => items.every((i) => (EXERCISE_BY_ID[i.exerciseId]?.eq ?? []).every((q) => MARCADOS.includes(q)));
const usaHalteres = (items: { exerciseId: string }[]) => items.some((i) => EXERCISE_BY_ID[i.exerciseId]?.eq.includes("halteres"));

test("PATCH /api/profile valida equipamentos (aparelho fora do catálogo recusa)", async () => {
  const env = makeEnv();
  const c = (m: string, p: string, body?: unknown) => call(env, m, p, { user: "ana", body });
  assert.equal((await c("PUT", "/api/profile", perfil)).status, 200);
  assert.equal((await c("PATCH", "/api/profile", { data: { equipamentos: ["laser"] } })).status, 400);
  const ok = await c("PATCH", "/api/profile", { data: { equipamentos: MARCADOS } });
  assert.equal(ok.status, 200, ok.text);
  assert.deepEqual((await c("GET", `/api/state?date=${D}`)).data.profile.equipamentos, MARCADOS);
});

test("sem academia: semana, plan-day e MCP usam o que a pessoa marcou (e só isso)", async () => {
  const env = makeEnv();
  const c = (m: string, p: string, body?: unknown) => call(env, m, p, { user: "ana", body });
  assert.equal((await c("PUT", "/api/profile", { data: { ...perfil.data, equipamentos: MARCADOS } })).status, 200);

  const pd = await c("POST", "/api/plan-day", { date: D, daysLeft: 3 });
  assert.equal(pd.status, 200, pd.text);
  assert.equal(pd.data.equipamento, "sem_academia");
  assert.ok(soMarcados(pd.data.plan.items) && usaHalteres(pd.data.plan.items), "plan-day com halteres");

  const w = await c("GET", `/api/week?date=${D}`);
  assert.ok(w.data.week, w.text);
  const itens = w.data.week.days.filter((d: any) => d.kind === "treino").flatMap((d: any) => d.plan.items);
  assert.ok(itens.length && soMarcados(itens) && usaHalteres(itens), "a semana usa os halteres marcados");

  const t = await c("POST", "/api/account/tokens", { label: "teste" });
  const r = await mcp(env, t.data.token, "ciclo_planejar_dia", { date: D, daysLeft: 3, minutes: 45 });
  const previa = JSON.parse(r.data.result.content[0].text);
  assert.equal(previa.equipamento, "sem_academia");
  assert.match(previa.avisoEquipamento, /marcou/);
  assert.ok(previa.itens.every((i: any) => (EXERCISE_BY_ID[i.id]?.eq ?? []).every((q) => MARCADOS.includes(q))));
  const p = await mcp(env, t.data.token, "ciclo_perfil_atualizar", { perfil: { equipamentos: ["kettle"] } });
  assert.equal(p.status, 200, p.text);
  assert.deepEqual((await c("GET", `/api/state?date=${D}`)).data.profile.equipamentos, ["kettle"]);
});
