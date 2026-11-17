// #108 Worker real sobre D1 em memória: o treino salvo pelo MCP num dia sem treino é o que a semana mostra (o "Ver"
// abre esse); abrir a semana não gera nada; "Gerar treino" gera pelo gerador validado e abre o pedido revisar_treino
// (isolado por user_id); a revisão da IA (MCP ou caixa) válida é aplicada e a inválida é descartada. Dados fictícios.
import { test } from "node:test";
import assert from "node:assert/strict";
import { EXERCISES, gerarTreinoDia, validarSemana } from "@ciclo/core";
import type { PerfilGerador } from "@ciclo/core";
import { call, makeEnv, mcp } from "./fakes.ts";

const QUA = "2026-11-18", TER = "2026-11-17", SEX = "2026-11-20";
const EQ = ["halteres", "banco", "polia", "barra"];
const DIAS = ["seg", "ter", "qui", "sex"];
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
const perfil: PerfilGerador = { sexo: null, nivel: 1, prioridades: ["ombro"], equipamentos: EQ, dias: DIAS, diasMeta: 4, minutos: 60 };
const inbox = (env: any, user: string) => env.DB.raw.prepare("SELECT i.action, i.tier, i.status, i.text, i.change FROM inbox i JOIN user u ON u.id = i.user_id WHERE u.email LIKE ?1").all(`${user}%`);
const naQuarta = (t: any) => t.mock.method(Date, "now", () => Date.parse(`${QUA}T15:00:00Z`));

test("regressão: treino salvo pelo MCP para hoje (dia sem treino) é o que a semana mostra no dia, não um extra aleatório", async (t) => {
  naQuarta(t);
  const env = makeEnv();
  const a = await conta(env, "ana");
  const antes = (await a.c("GET", `/api/week?date=${QUA}`)).data.week.days.find((d: any) => d.date === QUA);
  assert.equal(antes.status, "livre");
  const ids = ["ombro", "biceps", "triceps"].map((m) => EXERCISES.find((e) => e.m === m && !e.planOff && e.eq.every((q) => EQ.includes(q)))!.id);
  const r = await tool(env, a.token, "ciclo_salvar_treino_do_dia", { date: QUA, nome: "Braços do Chat", motivo: "teste", itens: ids.map((id) => ({ id, sets: 3 })) });
  assert.equal(r.salvo, true, JSON.stringify(r));
  const w = (await a.c("GET", `/api/week?date=${QUA}`)).data.week;
  const d = w.days.find((x: any) => x.date === QUA);
  assert.equal(d.status, "hoje", "com treino salvo o dia deixa de ser livre (o botão é Ver, não Ver extra)");
  assert.equal(d.plan.name, "Braços do Chat");
  assert.deepEqual(d.plan.items.map((i: any) => i.exerciseId), ids);
});

test("abrir a semana não gera nada; Gerar treino gera, valida e cria o pedido revisar_treino só na conta certa", async (t) => {
  naQuarta(t);
  const env = makeEnv();
  const a = await conta(env, "ana"), b = await conta(env, "bia");
  for (let k = 0; k < 2; k++) await a.c("GET", `/api/week?date=${QUA}`);
  assert.equal(inbox(env, "ana").length, 0, "abrir não cria pedido");
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM day_plan WHERE date = ?1").get(QUA).n, 0, "abrir não salva treino");

  const g = await a.c("POST", `/api/week/day/${QUA}/gerar-treino`, { today: QUA });
  assert.equal(g.status, 200, g.text);
  const d = g.data.week.days.find((x: any) => x.date === QUA);
  assert.equal(d.status, "hoje");
  assert.equal(d.plan.revisao, "pendente");
  assert.ok(d.plan.items.length > 0);
  // o dia salvo, dentro da semana do gerador, passa no validarSemana
  const ger = gerarTreinoDia(perfil, "qua")!;
  const semana = { dias: ger.semana.dias.map((x) => (x.dow === "qua" ? { ...x, itens: d.plan.items } : x)) };
  assert.deepEqual(validarSemana(semana, ger.perfil), []);
  const [p] = inbox(env, "ana");
  assert.equal(p.action, "revisar_treino"); assert.equal(p.tier, "haiku"); assert.equal(p.status, "pendente");
  assert.ok(p.text.startsWith(`[revisar_treino ${QUA}]`));
  assert.equal(inbox(env, "bia").length, 0, "nada na caixa da outra conta");
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM day_plan WHERE date = ?1").get(QUA).n, 1);

  assert.equal((await a.c("POST", `/api/week/day/${QUA}/gerar-treino`, { today: QUA })).status, 409, "já tem treino");
  assert.equal((await a.c("POST", `/api/week/day/${TER}/gerar-treino`, { today: QUA })).status, 400, "dia que já passou");
  assert.equal((await a.c("POST", `/api/week/day/${SEX}/gerar-treino`, { today: QUA })).status, 409, "sexta já tem treino planejado");
  // a outra conta não vê a pendência da A nem consegue revisar o dia dela
  assert.deepEqual((await tool(env, b.token, "ciclo_revisar_treino")).pendentes, []);
  assert.match((await tool(env, b.token, "ciclo_revisar_treino", { date: QUA, aplicar: true })).erro, /pendente/);
});

test("revisão da IA: inválida é descartada (fica a do app); válida pela caixa é aplicada e o selo some", async (t) => {
  naQuarta(t);
  const env = makeEnv();
  const a = await conta(env, "ana");
  const d0 = (await a.c("POST", `/api/week/day/${QUA}/gerar-treino`, { today: QUA })).data.week.days.find((x: any) => x.date === QUA).plan;
  const [pend] = (await tool(env, a.token, "ciclo_revisar_treino")).pendentes;
  assert.equal(pend.date, QUA);
  assert.deepEqual(pend.itens.map((i: any) => i.id), d0.items.map((i: any) => i.exerciseId));

  // inválida: ID inventado → fica a determinística, com as violações
  const ruim = await tool(env, a.token, "ciclo_revisar_treino", { date: QUA, itens: [{ id: "Exercicio_Inventado", sets: 3 }] });
  assert.equal(ruim.aplicado, false); assert.equal(ruim.revisao, "mantida");
  assert.ok(ruim.violacoes.length > 0);
  let d = (await a.c("GET", `/api/week?date=${QUA}`)).data.week.days.find((x: any) => x.date === QUA).plan;
  assert.deepEqual(d.items.map((i: any) => i.exerciseId), d0.items.map((i: any) => i.exerciseId));
  assert.equal(d.revisao, "mantida");
  const [p] = inbox(env, "ana");
  assert.equal(p.status, "respondido", "o pedido revisar_treino foi resolvido");
  assert.equal((await tool(env, a.token, "ciclo_revisar_treino")).pendentes.length, 0);

  // válida, pela caixa (ciclo_responder_pedido): gera em outro dia livre e devolve os mesmos itens com 1 série a menos no último
  const SAB = "2026-11-21";
  const g = await a.c("POST", `/api/week/day/${SAB}/gerar-treino`, { today: QUA });
  assert.equal(g.status, 200, g.text);
  const plano = g.data.week.days.find((x: any) => x.date === SAB).plan;
  const id = env.DB.raw.prepare("SELECT id FROM inbox WHERE action = 'revisar_treino' AND status = 'pendente'").get().id;
  const itens = plano.items.map((i: any) => ({ id: i.exerciseId, sets: i.sets }));
  const r = await tool(env, a.token, "ciclo_responder_pedido", { id, resposta: "Revisado.", itens });
  assert.equal(r.change.aplicado, true, JSON.stringify(r));
  d = (await a.c("GET", `/api/week?date=${QUA}`)).data.week.days.find((x: any) => x.date === SAB).plan;
  assert.equal(d.revisao, "revisada");
});

test("revisão chega depois de o dono editar o dia à mão: a edição fica e o pedido revisar_treino sai da fila", async (t) => {
  naQuarta(t);
  const env = makeEnv();
  const a = await conta(env, "ana");
  const g = await a.c("POST", `/api/week/day/${QUA}/gerar-treino`, { today: QUA });
  assert.equal(g.status, 200, g.text);
  const ed = await a.c("POST", "/api/plan-edits", { date: QUA, edit: { index: 0, sets: 2 } });
  assert.equal(ed.status, 200, ed.text);
  const antes = env.DB.raw.prepare("SELECT plan, source FROM day_plan WHERE date = ?1").get(QUA);
  assert.equal(antes.source, "manual");
  const id = env.DB.raw.prepare("SELECT id FROM inbox WHERE action = 'revisar_treino'").get().id;
  const r = await tool(env, a.token, "ciclo_responder_pedido", { id, resposta: "Revisado.", itens: [{ id: "Exercicio_Inventado", sets: 3 }] });
  assert.ok(!r.erro, JSON.stringify(r));
  assert.match(r.change.nota, /já revisado|editado/);
  const p = env.DB.raw.prepare("SELECT status FROM inbox WHERE id = ?1").get(id);
  assert.equal(p.status, "respondido", "não fica na fila para sempre");
  assert.deepEqual(env.DB.raw.prepare("SELECT plan, source FROM day_plan WHERE date = ?1").get(QUA), antes, "a edição à mão não é sobrescrita");
  assert.match((await tool(env, a.token, "ciclo_revisar_treino", { date: QUA, aplicar: true })).erro, /pendente/);
});

test("gerar-treino recusa `today` com mais de 1 dia de diferença do relógio do servidor", async (t) => {
  naQuarta(t);
  const env = makeEnv();
  const a = await conta(env, "ana");
  assert.equal((await a.c("POST", `/api/week/day/${SEX}/gerar-treino`, { today: SEX })).status, 400, "2 dias no futuro");
  assert.equal((await a.c("POST", `/api/week/day/${QUA}/gerar-treino`, { today: "2026-11-09" })).status, 400, "semana passada");
});
