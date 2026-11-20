// #121 Um só treino do dia no Worker real (D1 em memória): o que a IA salva é o que a Semana (/api/week), o app ao abrir
// (/api/state → Hoje/Começar), o MCP (ciclo_semana_ver, ciclo_contexto) e a regra da caixa leem. Regerar (IA ou algoritmo)
// substitui: só a última existe e nenhum caminho abre a anterior (não há "voltar versão"). Sem IA, os acessos batem.
// Isolamento: regerar da A não apaga o treino salvo da B. Dados fictícios.
import { test } from "node:test";
import assert from "node:assert/strict";
import { EXERCISES } from "@ciclo/core";
import { call, makeEnv, mcp } from "./fakes.ts";

const QUA = "2026-11-18", SEX = "2026-11-20";
const EQ = ["halteres", "banco", "polia", "barra"];
const DIAS = ["seg", "ter", "qua", "sex"];
async function tool(env: unknown, token: string, name: string, args: Record<string, unknown> = {}) {
  const r = await mcp(env, token, name, args);
  assert.equal(r.status, 200, r.text);
  const txt = r.data.result.content[0].text as string;
  return r.data.result.isError ? { erro: txt } : JSON.parse(txt);
}
async function conta(env: any, user: string) {
  const c = (m: string, p: string, body?: unknown) => call(env, m, p, { user, body });
  assert.equal((await c("PUT", "/api/profile", { data: { level: 1, priorities: ["ombro"], minutes: 60, daysTarget: 4, daysUsual: DIAS, prefs: {}, pinned: {}, avoid: [], goal: { statement: "objetivo fictício" } } })).status, 200);
  assert.equal((await c("PUT", "/api/gyms/acad1", { name: "Academia Exemplo", equipment: EQ })).status, 200);
  const t = await c("POST", "/api/account/tokens", { label: "teste" });
  return { token: t.data.token as string, c };
}
const ids = (ms: string[]) => ms.map((m) => EXERCISES.find((e) => e.m === m && !e.planOff && e.eq.every((q) => EQ.includes(q)))!.id);
const naQuarta = (t: any) => t.mock.method(Date, "now", () => Date.parse(`${QUA}T15:00:00Z`));
const fmt = (p: any) => p?.items.map((i: any) => `${i.exerciseId} ${i.sets}×${i.reps.join("–")}`) ?? null;

/** Os acessos ao treino de hoje: Semana/Hoje (/api/week), Começar (/api/state.dayPlan), MCP (ciclo_semana_ver). */
async function acessos(env: any, a: { token: string; c: any }, d = QUA) {
  const w = (await a.c("GET", `/api/week?date=${QUA}`)).data.week;
  const st = (await a.c("GET", `/api/state?date=${QUA}`)).data;
  const sem = await tool(env, a.token, "ciclo_semana_ver", { date: QUA });
  const pd = await tool(env, a.token, "ciclo_planejar_dia", { date: d, daysLeft: 2 }); // "o que treino hoje" pelo MCP
  const dia = w.days.find((x: any) => x.date === d);
  const mcpSem = sem.dias.find((x: any) => x.date === d).itens ?? null;
  assert.deepEqual(pd.itens?.map((i: any) => `${i.id} ${i.sets}×${i.reps.join("–")}`) ?? null, mcpSem, "ciclo_planejar_dia = ciclo_semana_ver");
  return { semana: fmt(dia.plan), comecar: fmt(st.dayPlan?.plan), mcp: mcpSem, nome: dia.plan?.name, st };
}
/** "ID séries" do que foi mandado à IA, para comparar com cada acesso. */
const mandado = (ms: string[], sets: number) => ids(ms).map((id) => `${id} ${sets}`);
const idSets = (l: string[] | null) => l?.map((x) => x.split("×")[0]) ?? null;
const linhas = (env: any, d: string) => env.DB.raw.prepare("SELECT plan, source FROM day_plan WHERE date = ?1").all(d);

test("IA salva o treino de hoje → Semana, Hoje/Começar, MCP e a regra da caixa mostram os mesmos exercícios e séries", async (t) => {
  naQuarta(t);
  const env = makeEnv();
  const a = await conta(env, "ana");
  const antes = await acessos(env, a); // a semana já tinha um treino do algoritmo para hoje
  const r = await tool(env, a.token, "ciclo_salvar_treino_do_dia", { date: QUA, nome: "Braços do Chat", motivo: "teste", itens: ids(["ombro", "biceps", "triceps"]).map((id) => ({ id, sets: 3 })) });
  assert.equal(r.salvo, true, JSON.stringify(r));
  const x = await acessos(env, a);
  assert.equal(x.nome, "Braços do Chat");
  assert.deepEqual(idSets(x.semana), mandado(["ombro", "biceps", "triceps"], 3));
  assert.deepEqual(x.comecar, x.semana, "o app abre (e começa) o mesmo da semana");
  assert.deepEqual(x.mcp, x.semana, "o MCP lê o mesmo");
  assert.notDeepEqual(x.comecar, antes.comecar, "não ficou a geração anterior");
  // regra da caixa ("qual meu treino de hoje") responde com o mesmo treino
  const cx = await a.c("POST", "/api/inbox", { text: "Qual meu treino de hoje?", date: QUA });
  assert.equal(cx.status, 201, cx.text);
  for (const id of ids(["ombro", "biceps", "triceps"])) assert.ok(cx.data.response.includes(EXERCISES.find((e) => e.id === id)!.nm), cx.data.response);
});

test("regerar duas vezes: só a última existe; nenhum caminho abre a anterior (IA e algoritmo); isolado por conta", async (t) => {
  naQuarta(t);
  const env = makeEnv();
  const a = await conta(env, "ana"), b = await conta(env, "bia");
  // B tem um treino salvo pela IA hoje: nada do que a A faz pode apagá-lo
  assert.equal((await tool(env, b.token, "ciclo_salvar_treino_do_dia", { date: QUA, nome: "Da B", motivo: "b", itens: ids(["peito", "costas"]).map((id) => ({ id, sets: 3 })) })).salvo, true);

  // IA duas vezes
  const r1 = await tool(env, a.token, "ciclo_salvar_treino_do_dia", { date: QUA, nome: "Chat 1", motivo: "1", itens: ids(["peito", "costas"]).map((id) => ({ id, sets: 3 })) });
  const r2 = await tool(env, a.token, "ciclo_salvar_treino_do_dia", { date: QUA, nome: "Chat 2", motivo: "2", itens: ids(["ombro", "biceps"]).map((id) => ({ id, sets: 4 })) });
  assert.ok(r1.salvo && r2.salvo);
  let x = await acessos(env, a);
  assert.equal(x.nome, "Chat 2");
  for (const v of [x.semana, x.comecar, x.mcp]) assert.deepEqual(idSets(v), mandado(["ombro", "biceps"], 4));
  const ia2 = x.semana;
  assert.equal(linhas(env, QUA).filter((l: any) => l.plan.includes("Chat")).length, 1, "um treino salvo por dia");
  // não existe caminho para voltar a uma geração antiga
  assert.equal((await a.c("PUT", "/api/week", { date: QUA, version: 1 })).status, 404);

  // algoritmo duas vezes ("Gerar outro" no app): o 1º substitui o da IA; o 2º substitui o 1º
  const g1 = await a.c("POST", `/api/week/day/${QUA}`, { action: "outro", today: QUA, opts: { ocupados: ["polia"] } });
  assert.equal(g1.status, 200, g1.text);
  const p1 = fmt(g1.data.week.days.find((d: any) => d.date === QUA).plan);
  assert.notDeepEqual(p1, ia2, "o algoritmo substituiu o treino da IA");
  assert.equal(linhas(env, QUA).filter((l: any) => l.plan.includes("Chat")).length, 0, "o salvo da IA saiu");
  const g2 = await a.c("POST", `/api/week/day/${QUA}`, { action: "outro", today: QUA, opts: { ocupados: ["halteres"], estilo: "maquina" } });
  assert.equal(g2.status, 200, g2.text);
  x = await acessos(env, a);
  assert.notDeepEqual(x.semana, p1, "o 2º gerado é outro treino");
  for (const v of [x.comecar, x.mcp]) assert.deepEqual(v, x.semana);
  for (const v of [x.semana, x.comecar, x.mcp]) { assert.notDeepEqual(v, p1); assert.notDeepEqual(v, ia2); }

  // a IA "regenera a semana" (ciclo_semana_gerar): o treino de sexta que ela salvou também é substituído
  assert.equal((await tool(env, a.token, "ciclo_salvar_treino_do_dia", { date: SEX, nome: "Sexta do Chat", motivo: "s", itens: ids(["ombro"]).map((id) => ({ id, sets: 3 })) })).salvo, true);
  const rg = await tool(env, a.token, "ciclo_semana_gerar", { date: QUA });
  assert.equal(rg.refeita, true, JSON.stringify(rg));
  assert.notEqual(rg.dias.find((d: any) => d.date === SEX).nome, "Sexta do Chat");
  assert.equal(linhas(env, SEX).length, 0);

  // a B continua com o dela
  const xb = await acessos(env, b);
  assert.equal(xb.nome, "Da B");
  assert.equal(linhas(env, QUA).filter((l: any) => l.plan.includes("Da B")).length, 1);
});

test("edição manual: a IA não substitui; o toque da pessoa em Gerar outro sim", async (t) => {
  naQuarta(t);
  const env = makeEnv();
  const a = await conta(env, "ana");
  const r = await tool(env, a.token, "ciclo_salvar_treino_do_dia", { date: QUA, motivo: "x", itens: ids(["ombro", "biceps", "triceps"]).map((id) => ({ id, sets: 3 })) });
  assert.equal(r.salvo, true);
  assert.equal((await a.c("POST", "/api/plan-edits", { date: QUA, edit: { index: 0, sets: 2 } })).status, 200);
  const x = await acessos(env, a);
  assert.equal(x.semana[0].split(" ")[1].split("×")[0], "2", "a edição à mão é o treino do dia");
  for (const v of [x.comecar, x.mcp]) assert.deepEqual(v, x.semana);
  // IA pedindo para gerar o dia de novo não apaga a escolha da pessoa
  await tool(env, a.token, "ciclo_semana_gerar", { date: QUA, dia: QUA, foco: ["peito"] });
  assert.deepEqual((await acessos(env, a)).semana, x.semana);
  // a pessoa pede outro: substitui
  assert.equal((await a.c("POST", `/api/week/day/${QUA}`, { action: "outro", today: QUA, opts: {} })).status, 200);
  const y = await acessos(env, a);
  assert.notDeepEqual(y.semana, x.semana);
  assert.deepEqual(y.comecar, y.semana);
});

test("sem IA: o algoritmo gera e Semana, Hoje/Começar e MCP batem (também depois de regenerar a semana)", async (t) => {
  naQuarta(t);
  const env = makeEnv();
  const a = await conta(env, "ana");
  const x = await acessos(env, a);
  assert.ok(x.semana?.length, "quarta é dia de treino");
  assert.deepEqual(x.comecar, x.semana);
  assert.deepEqual(x.mcp, x.semana);
  assert.ok(x.st.dayPlan.profileFp, "o app ainda sabe com que perfil o treino foi feito");
  assert.equal(linhas(env, QUA).length, 0, "abrir não grava treino do dia");
  const rg = await a.c("POST", "/api/week/regenerate", { date: QUA, apply: true });
  assert.equal(rg.status, 200, rg.text);
  const y = await acessos(env, a);
  assert.deepEqual(y.comecar, y.semana);
  assert.deepEqual(y.mcp, y.semana);
  // sábado é folga: sem treino para o Começar (nada é calculado só porque o app abriu)
  t.mock.method(Date, "now", () => Date.parse("2026-11-21T15:00:00Z"));
  const st = (await a.c("GET", "/api/state?date=2026-11-21")).data;
  assert.equal(st.dayPlan, null, "dia livre: nada calculado para o Começar");
});
