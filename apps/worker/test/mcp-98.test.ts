// #98 Treino salvo pelo MCP aparece na semana sozinho e o resumo por músculo sai dos itens salvos (nunca do plano antigo).
import { test } from "node:test";
import assert from "node:assert/strict";
import { EXERCISES, MUSCLES } from "@ciclo/core";
import { call, makeEnv, mcp } from "./fakes.ts";

const SEG = "2026-11-16", TER = "2026-11-17";
const EQ = ["halteres", "banco", "polia", "barra"];
async function tool(env: unknown, token: string, name: string, args: Record<string, unknown> = {}) {
  const r = await mcp(env, token, name, args);
  assert.equal(r.status, 200, r.text);
  const txt = r.data.result.content[0].text as string;
  return r.data.result.isError ? { erro: txt } : JSON.parse(txt);
}
async function conta(env: any, user: string) {
  const c = (m: string, p: string, body?: unknown) => call(env, m, p, { user, body });
  assert.equal((await c("PUT", "/api/profile", { data: { level: 1, priorities: ["ombro"], minutes: 60, daysTarget: 4, daysUsual: ["seg", "ter", "qui", "sex"], prefs: {}, pinned: {}, avoid: [], goal: { statement: "objetivo fictício" } } })).status, 200);
  assert.equal((await c("PUT", "/api/gyms/acad1", { name: "Academia Exemplo", equipment: EQ })).status, 200);
  const t = await c("POST", "/api/account/tokens", { label: "teste" });
  return { token: t.data.token as string, c };
}
const idsSup = () => ["peito", "costas", "ombro", "biceps", "triceps"].map((m) => EXERCISES.find((e) => e.m === m && e.eq.every((q) => EQ.includes(q)))!.id);

test("salvar o dia pelo MCP: semana (MCP e /api/state do app) já traz o dia novo, com resumo só de superior", async (t) => {
  t.mock.method(Date, "now", () => Date.parse(`${SEG}T15:00:00Z`));
  const env = makeEnv();
  const a = await conta(env, "ana");
  await tool(env, a.token, "ciclo_semana_ver"); // nasce a semana (v1) com o treino gerado de antes
  const ids = idsSup();
  const r = await tool(env, a.token, "ciclo_salvar_treino_do_dia", { date: TER, nome: "Superior A", motivo: "teste", itens: ids.map((id) => ({ id, sets: 3 })) });
  assert.equal(r.salvo, true, JSON.stringify(r));
  assert.equal(r.naSemana, true);
  const sem = await tool(env, a.token, "ciclo_semana_ver");
  const dia = sem.dias.find((d: any) => d.date === TER);
  assert.equal(dia.nome, "Superior A");
  assert.deepEqual(dia.itens.map((x: string) => x.split(" ")[0]), ids);
  assert.equal(dia.min, 15 * 3);
  const w = (await a.c("GET", `/api/week?date=${SEG}`)).data.week;
  const d = w.days.find((x: any) => x.date === TER);
  assert.equal(d.plan.name, "Superior A");
  assert.equal(d.source, "claude");
  const musc = Object.keys(d.plan.perMuscle);
  assert.ok(musc.length > 0 && musc.every((m) => MUSCLES[m as keyof typeof MUSCLES].group === "sup"), `só superior: ${musc}`);
  assert.equal(Object.values(d.plan.perMuscle).reduce((s: number, n: any) => s + n, 0), 15);
  assert.equal(d.plan.setsTotal, 15);
});

test("resumo antigo no D1 (pernas num plano de superior) é recalculado ao ler a semana, uma vez só", async (t) => {
  t.mock.method(Date, "now", () => Date.parse(`${SEG}T15:00:00Z`));
  const env = makeEnv();
  const a = await conta(env, "bia");
  const antes = (await a.c("GET", `/api/week?date=${SEG}`)).data.week;
  const gerado = antes.days.find((x: any) => x.date === TER).plan; // plano gerado (outro treino)
  const ids = idsSup();
  const plano = { ...gerado, name: "Superior A", items: gerado.items.slice(0, 2).map((i: any, k: number) => ({ ...i, exerciseId: ids[k] })), perMuscle: { gluteo: 4, quad: 4, isquio: 4, pant: 4, core: 2 }, setsTotal: 18 };
  assert.equal((await a.c("PUT", `/api/day-plan/${TER}`, { plan: plano, gymId: "acad1", source: "claude" })).status, 200);
  const w1 = (await a.c("GET", `/api/week?date=${SEG}`)).data.week;
  const d = w1.days.find((x: any) => x.date === TER);
  assert.equal(d.plan.name, "Superior A");
  assert.equal(Object.values(d.plan.perMuscle).reduce((s: number, n: any) => s + n, 0), d.plan.items.reduce((s: number, i: any) => s + i.sets, 0));
  assert.ok(!("gluteo" in d.plan.perMuscle));
  assert.equal((await a.c("GET", `/api/week?date=${SEG}`)).data.week.version, w1.version, "estável: ler de novo não cria versão");
});

test("dia já treinado ou montado à mão: o MCP não sobrescreve (fica a prévia que já existe)", async (t) => {
  t.mock.method(Date, "now", () => Date.parse(`${SEG}T15:00:00Z`));
  const env = makeEnv();
  const a = await conta(env, "caio");
  await tool(env, a.token, "ciclo_semana_ver");
  const itens = idsSup().map((id) => ({ id, sets: 3 }));
  assert.equal((await tool(env, a.token, "ciclo_salvar_treino_do_dia", { date: TER, motivo: "teste", itens })).salvo, true);
  const ed = await a.c("POST", "/api/plan-edits", { date: TER, edit: { index: 0, sets: 2 } });
  assert.equal(ed.status, 200, ed.text);
  const r = await tool(env, a.token, "ciclo_salvar_treino_do_dia", { date: TER, motivo: "teste 2", itens: itens.slice(0, 3) });
  assert.equal(r.salvo, false); assert.equal(r.conflito, "manual");
});

test("ciclo_treino_atual_salvar reaplica a semana sozinho", async (t) => {
  t.mock.method(Date, "now", () => Date.parse(`${SEG}T15:00:00Z`));
  const env = makeEnv();
  const a = await conta(env, "dani");
  const v1 = (await tool(env, a.token, "ciclo_semana_ver")).versao;
  const r = await tool(env, a.token, "ciclo_treino_atual_salvar", { treinoAtual: { divisoes: [{ nome: "A", grupos: ["peito"], exercicios: [{ id: idsSup()[0] }] }] } });
  assert.equal(r.salvo, true, JSON.stringify(r)); assert.equal(r.naSemana, true);
  assert.ok((await tool(env, a.token, "ciclo_semana_ver")).versao > v1);
});
