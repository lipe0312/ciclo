// #113 Dias de treino flexíveis pelo Worker: salvar no sábado (cadastro ter–sex) aparece como treino, "treinei" fora do
// cadastro reorganiza a semana e "empurrar" (app e MCP) com prévia → confirmar, só na conta dona. Dados fictícios.
import { test } from "node:test";
import assert from "node:assert/strict";
import { EXERCISES } from "@ciclo/core";
import { call, makeEnv, mcp } from "./fakes.ts";

const QUA = "2026-11-18", QUI = "2026-11-19", SEX = "2026-11-20", SAB = "2026-11-21";
const EQ = ["halteres", "banco", "polia", "barra"];
async function tool(env: unknown, token: string, name: string, args: Record<string, unknown> = {}) {
  const r = await mcp(env, token, name, args);
  assert.equal(r.status, 200, r.text);
  const txt = r.data.result.content[0].text as string;
  return r.data.result.isError ? { erro: txt } : JSON.parse(txt);
}
async function conta(env: any, user: string) {
  const c = (m: string, p: string, body?: unknown) => call(env, m, p, { user, body });
  assert.equal((await c("PUT", "/api/profile", { data: { level: 1, priorities: ["ombro"], minutes: 60, daysTarget: 4, daysUsual: ["ter", "qua", "qui", "sex"], prefs: {}, pinned: {}, avoid: [], goal: { statement: "objetivo fictício" } } })).status, 200);
  assert.equal((await c("PUT", "/api/gyms/acad1", { name: "Academia Exemplo", equipment: EQ })).status, 200);
  const t = await c("POST", "/api/account/tokens", { label: "teste" });
  return { token: t.data.token as string, c };
}
const ids = () => ["ombro", "biceps", "triceps"].map((m) => EXERCISES.find((e) => e.m === m && e.eq.every((q) => EQ.includes(q)))!.id);
const dia = (w: any, d: string) => w.days.find((x: any) => x.date === d);

test("treino salvo pelo MCP no sábado (cadastro ter–sex) aparece como dia de treino na semana", async (t) => {
  t.mock.method(Date, "now", () => Date.parse(`${QUA}T15:00:00Z`));
  const env = makeEnv();
  const a = await conta(env, "ana");
  assert.equal(dia((await a.c("GET", `/api/week?date=${QUA}`)).data.week, SAB).kind, "folga");
  const r = await tool(env, a.token, "ciclo_salvar_treino_do_dia", { date: SAB, nome: "Sábado de braço", motivo: "pedido fictício", itens: ids().map((id) => ({ id, sets: 3 })) });
  assert.equal(r.salvo, true, JSON.stringify(r));
  const sab = dia((await a.c("GET", `/api/week?date=${QUA}`)).data.week, SAB);
  assert.equal(sab.kind, "treino");
  assert.equal(sab.status, "planejado");
  assert.equal(sab.plan.name, "Sábado de braço");
});

test("'treinei' pelo MCP num dia fora do cadastro conta como feito e a semana se reorganiza", async (t) => {
  t.mock.method(Date, "now", () => Date.parse(`${SAB}T15:00:00Z`));
  const env = makeEnv();
  const a = await conta(env, "bia");
  const antes = (await a.c("GET", `/api/week?date=${SAB}`)).data.week;
  assert.equal(dia(antes, SAB).status, "livre");
  const r = await tool(env, a.token, "ciclo_marcar_presenca", { date: SAB, status: "fui" });
  assert.equal(r.naSemana, true);
  const w = (await a.c("GET", `/api/week?date=${SAB}`)).data.week;
  assert.equal(dia(w, SAB).status, "feito");
  assert.ok(dia(w, SAB).plan.setsTotal > 0, "o dia credita volume");
  assert.ok(w.version > antes.version);
  assert.match((await tool(env, a.token, "ciclo_marcar_presenca", { date: "2026-11-22", status: "fui" })).erro, /até hoje/);
  // pelo app (mesmo caminho do aviso): "não treinei" num dia fora do cadastro
  const b = await a.c("POST", `/api/week/day/${SAB}`, { action: "falta", resposta: "nao_fui", today: SAB });
  assert.equal(b.status, 200, b.text);
  assert.equal(dia(b.data.week, SAB).status, "faltou");
});

test("empurrar pelo app: prévia não grava; aplicar leva qua→qui, qui→sex, sex→sáb e hoje vira folga", async (t) => {
  t.mock.method(Date, "now", () => Date.parse(`${QUA}T15:00:00Z`));
  const env = makeEnv();
  const a = await conta(env, "cris");
  const w0 = (await a.c("GET", `/api/week?date=${QUA}`)).data.week;
  const pv = await a.c("POST", "/api/week/empurrar", { today: QUA });
  assert.equal(pv.status, 200, pv.text);
  assert.equal(pv.data.week, null);
  assert.deepEqual(pv.data.moves.map((m: any) => [m.de, m.para]), [[QUA, QUI], [QUI, SEX], [SEX, SAB]]);
  assert.equal((await a.c("GET", `/api/week?date=${QUA}`)).data.week.version, w0.version, "prévia não grava");
  const ap = await a.c("POST", "/api/week/empurrar", { today: QUA, apply: true });
  assert.equal(ap.status, 200, ap.text);
  assert.deepEqual(ap.data.week.days.slice(2).map((d: any) => d.kind), ["folga", "treino", "treino", "treino", "folga"]);
  assert.equal((await a.c("POST", "/api/week/empurrar", { today: "2026-11-10", apply: true })).status, 400, "today fora do dia atual");
});

test("empurrar pelo MCP: sempre prévia + token; confirmar grava uma vez; token de outra conta não serve", async (t) => {
  t.mock.method(Date, "now", () => Date.parse(`${QUA}T15:00:00Z`));
  const env = makeEnv();
  const a = await conta(env, "dani"), b = await conta(env, "edu");
  await tool(env, a.token, "ciclo_salvar_treino_do_dia", { date: QUI, nome: "Quinta do Chat", motivo: "pedido fictício", itens: ids().map((id) => ({ id, sets: 3 })) });
  const pv = await tool(env, a.token, "ciclo_semana_empurrar");
  assert.equal(pv.previa, true);
  assert.match(pv.token, /^prv_/);
  assert.equal(dia((await a.c("GET", `/api/week?date=${QUA}`)).data.week, QUA).kind, "treino", "prévia não grava");
  const wb = (await b.c("GET", `/api/week?date=${QUA}`)).data.week;
  assert.match((await tool(env, b.token, "ciclo_semana_empurrar", { confirmar: pv.token })).erro, /não encontrada/);
  assert.deepEqual((await b.c("GET", `/api/week?date=${QUA}`)).data.week.days.map((d: any) => d.kind), wb.days.map((d: any) => d.kind), "a semana da outra conta não muda");
  const ok = await tool(env, a.token, "ciclo_semana_empurrar", { confirmar: pv.token });
  assert.equal(ok.empurrado, true, JSON.stringify(ok));
  const w = (await a.c("GET", `/api/week?date=${QUA}`)).data.week;
  assert.equal(dia(w, QUA).kind, "folga");
  assert.equal(dia(w, SEX).plan.name, "Quinta do Chat", "o treino salvo anda junto");
  const rep = await tool(env, a.token, "ciclo_semana_empurrar", { confirmar: pv.token });
  assert.equal(rep.jaConfirmado, true, "repetir não empurra de novo");
  assert.equal((await a.c("GET", `/api/week?date=${QUA}`)).data.week.version, w.version);
});
