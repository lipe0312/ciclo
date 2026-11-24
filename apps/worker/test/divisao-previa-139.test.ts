// #139 Prévia antes de Manter/Ajustar a divisão: POST /api/week/regenerate com `divisaoEscolha` mostra o que muda sem salvar
// nada (nem a escolha, nem uma versão nova); com apply é recusado (a escolha grava pelo PATCH do perfil). Dados fictícios.
import { test } from "node:test";
import assert from "node:assert/strict";
import { EQUIPMENT } from "@ciclo/core";
import { call, makeEnv } from "./fakes.ts";

const D = "2026-11-16"; // segunda
const div = (...gs: string[][]) => ({ divisoes: gs.map((g, i) => ({ nome: `Treino ${"ABCD"[i]}`, grupos: g, exercicios: [] })) });
const perfil = { data: {
  level: 2, priorities: ["ombro", "biceps", "triceps"], minutes: 60, daysTarget: 4, daysUsual: ["seg", "ter", "qui", "sex"], places: ["academia"],
  goal: { id: "bracos_ombros", statement: "objetivo fictício" }, treinoAtual: div(["peito", "triceps"], ["costas", "biceps"], ["pernas"], ["ombro"]),
} };

test("prévia da divisão: mostra o diff de 'manter' sem gravar; apply e escolha inválida são recusados", async () => {
  const env = makeEnv();
  const c = (m: string, p: string, body?: unknown) => call(env, m, p, { user: "ana", body });
  assert.equal((await c("PUT", "/api/profile", perfil)).status, 200);
  assert.equal((await c("PUT", "/api/gyms/acad1", { name: "Academia Exemplo", equipment: EQUIPMENT.map((e) => e.id) })).status, 200);
  const w = await c("GET", `/api/week?date=${D}`);
  const d = w.data.week.divisao;
  assert.ok(d && !d.seguindo && !d.compativel, "ABCD em 4 dias: a semana não segue a divisão (só sugere)");
  const versao = w.data.week.version;

  const previa = await c("POST", "/api/week/regenerate", { date: D, divisaoEscolha: { escolha: "manter", assinatura: d.assinatura } });
  assert.equal(previa.status, 200, previa.text);
  assert.ok(previa.data.diff.length > 0, "manter muda os dias abertos");
  assert.equal(previa.data.week, null);
  const depois = await c("GET", `/api/week?date=${D}`);
  assert.equal(depois.data.week.version, versao, "a prévia não grava versão");
  assert.equal(depois.data.week.divisao.escolha ?? null, null, "a prévia não grava a escolha");

  assert.equal((await c("POST", "/api/week/regenerate", { date: D, apply: true, divisaoEscolha: { escolha: "manter", assinatura: d.assinatura } })).status, 400);
  assert.equal((await c("POST", "/api/week/regenerate", { date: D, divisaoEscolha: { escolha: "sempre", assinatura: d.assinatura } })).status, 400);
});
