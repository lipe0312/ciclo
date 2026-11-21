// #123 No Worker real (D1 em memória): "feito" só ao terminar; cancelar treino descarta sessão/séries/descanso e o dia volta
// a pendente; Treinei ↔ check-in; retirar o treino do dia reorganiza a semana uma vez; corrigir séries num dia feito (app e
// MCP, prévia → confirmar) recalcula o volume. Isolamento: a conta B nunca alcança nada da A. Dados fictícios.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MCP_ORCAMENTO_BYTES } from "@ciclo/core";
import { sendDueRests } from "../src/push.ts";
import { call, makeEnv, mcp } from "./fakes.ts";

const SEX = "2026-11-20", EX = "Incline_Dumbbell_Curl", EX2 = "Cable_Seated_Lateral_Raise";
const S1 = "0b7c6a2e-1d2f-4a3b-8c9d-0e1f2a3b4c5d", S2 = "1c8d7b3f-2e30-4b4c-9d0e-1f2a3b4c5d6e";
const PLAN = { name: "Braços (fictício)", groups: ["sup"], items: [{ exerciseId: EX, sets: 3 }, { exerciseId: EX2, sets: 3 }] };
const agora = (t: any) => t.mock.method(Date, "now", () => Date.parse(`${SEX}T15:00:00Z`));

async function conta(env: any, user: string) {
  const c = async (m: string, p: string, body?: unknown) => { const r = await call(env, m, p, { user, body }); return r; };
  const ok = async (m: string, p: string, body?: unknown) => { const r = await c(m, p, body); assert.ok(r.status < 300, `${m} ${p}: ${r.status} ${r.text}`); return r.data; };
  await ok("PUT", "/api/profile", { data: { level: 1, priorities: ["ombro"], minutes: 60, daysTarget: 4, daysUsual: ["ter", "qua", "qui", "sex"], prefs: {}, pinned: {}, avoid: [], goal: { statement: "objetivo fictício" } } });
  await ok("PUT", "/api/gyms/acad1", { name: "Academia Exemplo", equipment: ["halteres", "banco", "polia", "barra"] });
  const token = (await ok("POST", "/api/account/tokens", { label: "teste" })).token as string;
  const comecar = (id: string) => ok("POST", "/api/sessions", { id, date: SEX, plan: PLAN, startedAt: Date.now() });
  const serie = (sid: string, n: number, ex = EX, kg = 10) => ok("POST", `/api/sessions/${sid}/sets`, { exerciseId: ex, setNo: n, kg, reps: 10 });
  const terminar = (sid: string) => ok("POST", `/api/sessions/${sid}/finish`, { feedback: {} });
  const hoje = async () => (await ok("GET", `/api/week?date=${SEX}`)).week.days.find((d: any) => d.date === SEX);
  const done = async () => (await ok("GET", `/api/state?date=${SEX}`)).week.done;
  return { c, ok, token, comecar, serie, terminar, hoje, done };
}
async function tool(env: unknown, token: string, name: string, args: Record<string, unknown> = {}) {
  const r = await mcp(env, token, name, args);
  assert.equal(r.status, 200, r.text);
  const txt = r.data.result.content[0].text as string;
  assert.ok(Buffer.byteLength(txt) <= MCP_ORCAMENTO_BYTES);
  return r.data.result.isError ? { erro: txt } : JSON.parse(txt);
}
const n = (env: any, sql: string, ...a: unknown[]) => Number(env.DB.raw.prepare(sql).get(...a).n);
/** id da conta de dev (o e-mail é derivado do apelido) */
const uid = (env: any, user: string) => env.DB.raw.prepare("SELECT id FROM user WHERE email LIKE ?").get(`${user}%`).id as string;

test("começar e sair sem terminar → o dia não está feito; Terminar marca", async (t) => {
  agora(t);
  const env = makeEnv(), a = await conta(env, "ana");
  await a.comecar(S1);
  assert.equal((await a.hoje()).status, "hoje", "só começou");
  assert.equal(n(env, "SELECT COUNT(*) AS n FROM attendance WHERE date = ?", SEX), 0, "Começar não grava presença");
  await a.serie(S1, 1); await a.serie(S1, 2); // fez 2 séries e saiu (X) sem terminar
  assert.equal((await a.hoje()).status, "hoje", "sessão aberta com séries ainda não é feito");
  await a.terminar(S1);
  assert.equal((await a.hoje()).status, "feito");
  assert.equal(env.DB.raw.prepare("SELECT source FROM attendance WHERE date = ?").get(SEX).source, "fim");
});

test("cancelar treino → sessão e séries descartadas, descanso (push) parado, dia pendente; a B não cancela o da A", async (t) => {
  agora(t);
  const env = makeEnv(), a = await conta(env, "ana"), b = await conta(env, "bia");
  await a.comecar(S1); await a.serie(S1, 1);
  await a.ok("PUT", `/api/sessions/${S1}/rest`, { seconds: 30 });
  assert.equal((await b.ok("DELETE", `/api/sessions/${S1}`)).cancelada, false, "a B não alcança a sessão da A");
  assert.equal(n(env, "SELECT COUNT(*) AS n FROM set_log WHERE session_id = ?", S1), 1);
  const r = await a.ok("DELETE", `/api/sessions/${S1}`);
  assert.equal(r.cancelada, true);
  assert.equal((await a.c("GET", `/api/sessions/${S1}`)).status, 404);
  assert.equal(n(env, "SELECT COUNT(*) AS n FROM set_log WHERE session_id = ?", S1), 0);
  assert.equal(n(env, "SELECT COUNT(*) AS n FROM rest_timer"), 0, "cronômetro de descanso parado");
  assert.equal(await sendDueRests(env, Date.now() + 60_000), 0, "sem push");
  assert.equal((await a.hoje()).status, "hoje", "dia pendente");
  assert.equal((await a.ok("GET", `/api/state?date=${SEX}`)).week.sessions.length, 0);
  // terminado não se cancela (corrige-se); o Começar seguinte abre uma nova normalmente
  await a.comecar(S2); await a.terminar(S2);
  assert.equal((await a.ok("DELETE", `/api/sessions/${S2}`)).cancelada, false);
});

test("Treinei → check-in sim; trocar para Não → check-in não e dia pendente; Não direto = faltou", async (t) => {
  agora(t);
  const env = makeEnv(), a = await conta(env, "ana");
  const marcar = (resposta: string) => a.ok("POST", `/api/week/day/${SEX}`, { action: "falta", resposta, today: SEX });
  const checkin = () => env.DB.raw.prepare("SELECT trained FROM checkout WHERE user_id = ? AND date = ?").get(uid(env, "ana"), SEX)?.trained;
  let w = await marcar("fui");
  assert.equal(w.week.days.find((d: any) => d.date === SEX).status, "feito");
  assert.equal(checkin(), 1);
  w = await marcar("nao_fui"); // começou sem querer
  assert.equal(w.week.days.find((d: any) => d.date === SEX).status, "hoje", "volta a pendente");
  assert.equal(checkin(), 0);
  assert.equal(n(env, "SELECT COUNT(*) AS n FROM attendance WHERE user_id = ? AND date = ?", uid(env, "ana"), SEX), 0);
  w = await marcar("nao_fui");
  assert.equal(w.week.days.find((d: any) => d.date === SEX).status, "faltou");
});

test("retirar o treino do dia → dia vazio e a semana reorganizada uma vez", async (t) => {
  agora(t);
  const env = makeEnv(), a = await conta(env, "ana");
  const w0 = (await a.ok("GET", `/api/week?date=${SEX}`)).week;
  assert.ok(w0.days.find((d: any) => d.date === SEX).plan?.items.length);
  const r = await a.ok("POST", `/api/week/day/${SEX}`, { action: "folga", today: SEX });
  const d = r.week.days.find((x: any) => x.date === SEX);
  assert.equal(d.kind, "folga"); assert.equal(d.plan, null); assert.equal(d.status, "livre");
  assert.equal(r.week.version, w0.version + 1);
  assert.equal((await a.ok("GET", `/api/week?date=${SEX}`)).week.version, w0.version + 1, "ler de novo não reorganiza outra vez");
});

test("apagar e editar séries num dia feito (app) → volume da semana recalculado; a B não mexe no da A", async (t) => {
  agora(t);
  const env = makeEnv(), a = await conta(env, "ana"), b = await conta(env, "bia");
  await a.comecar(S1); await a.serie(S1, 1); await a.serie(S1, 2); await a.serie(S1, 3); await a.serie(S1, 1, EX2);
  await a.terminar(S1);
  assert.equal((await a.done()).biceps, 3);
  assert.equal((await b.ok("DELETE", `/api/sessions/${S1}/sets/${EX}/3`)).removed, false);
  assert.equal((await b.ok("DELETE", `/api/sessions/${S1}/exercises/${EX2}`)).removed, 0);
  assert.equal((await b.ok("POST", `/api/sessions/${S1}/sets`, { corrigir: true, exerciseId: EX, setNo: 1, kg: 99, reps: 1 })).saved, false);
  const del = await a.ok("DELETE", `/api/sessions/${S1}/sets/${EX}/3`);
  assert.equal(del.removed, true);
  assert.equal(del.summary.sets, 3, "resumo refeito");
  assert.equal((await a.done()).biceps, 2);
  assert.equal((await a.ok("POST", `/api/sessions/${S1}/sets`, { corrigir: true, exerciseId: EX, setNo: 1, kg: 12, reps: 8 })).saved, true, "edita em sessão terminada");
  // série da fila offline (de antes da correção) chegando depois: não desfaz a correção nem volta a série apagada
  assert.equal((await a.ok("POST", `/api/sessions/${S1}/sets`, { exerciseId: EX, setNo: 3, kg: 10, reps: 10 })).saved, false);
  assert.equal((await a.ok("POST", `/api/sessions/${S1}/sets`, { exerciseId: EX, setNo: 1, kg: 10, reps: 10 })).saved, false);
  assert.equal((await a.done()).biceps, 2, "volume segue o corrigido");
  const rem = await a.ok("DELETE", `/api/sessions/${S1}/exercises/${EX2}`);
  assert.equal(rem.removed, 1);
  assert.equal((await a.done()).ombro ?? 0, 0);
  const s = await a.ok("GET", `/api/sessions/${S1}`);
  assert.deepEqual(s.plan.items.map((i: any) => i.exerciseId), [EX]);
  assert.deepEqual(s.sets.map((x: any) => [x.setNo, x.kg, x.reps]), [[1, 12, 8], [2, 10, 10]]);
  assert.equal((await a.hoje()).status, "feito");
});

test("MCP corrigir: sem confirmar nada muda; com token muda uma vez; dia mudou → simular de novo; isolamento por conta", async (t) => {
  agora(t);
  const env = makeEnv(), a = await conta(env, "ana"), b = await conta(env, "bia");
  await a.comecar(S1); await a.serie(S1, 1); await a.serie(S1, 2); await a.serie(S1, 3); await a.terminar(S1);
  // sobra de antes da #122: 2ª sessão no mesmo dia com o mesmo treino
  await a.comecar(S2); await a.serie(S2, 1); await a.serie(S2, 2); await a.terminar(S2);
  await b.comecar(S1); await b.serie(S1, 1); // a B tem uma sessão com o MESMO id
  const total = () => n(env, "SELECT COUNT(*) AS n FROM set_log WHERE user_id = ?", uid(env, "ana"));
  const dia = await tool(env, a.token, "ciclo_treino_corrigir", { date: SEX });
  assert.equal(dia.sessoes.length, 2);
  assert.equal(dia.series[EX].length, 5);
  // prévia: apagar a série 4 do curl (a 1ª da sessão duplicada)
  const pv = await tool(env, a.token, "ciclo_treino_corrigir", { date: SEX, apagar: [{ exercicioId: EX, series: [4] }] });
  assert.equal(pv.previa, true); assert.match(pv.token, /^prv_/);
  assert.deepEqual(pv.volumeSemana, { biceps: "5 → 4" });
  assert.equal(total(), 5, "sem confirmar nada muda");
  assert.match((await tool(env, b.token, "ciclo_treino_corrigir", { confirmar: pv.token })).erro, /não encontrada/, "token da A não serve na B");
  const ok = await tool(env, a.token, "ciclo_treino_corrigir", { confirmar: pv.token });
  assert.equal(ok.corrigido, true);
  assert.equal(total(), 4);
  assert.equal((await a.done()).biceps, 4, "volume da semana recalculado");
  assert.equal((await tool(env, a.token, "ciclo_treino_corrigir", { confirmar: pv.token })).jaConfirmado, true);
  assert.equal(total(), 4, "repetir não apaga de novo");
  // descartar a sessão duplicada; o dia mudou entre a prévia e o sim → simular de novo
  const pd = await tool(env, a.token, "ciclo_treino_corrigir", { date: SEX, descartarSessao: S2 });
  assert.deepEqual(pd.volumeSemana, { biceps: "4 → 3" });
  await a.ok("POST", `/api/sessions/${S1}/sets`, { corrigir: true, exerciseId: EX, setNo: 4, kg: 10, reps: 10 }); // a pessoa corrigiu no app
  assert.match((await tool(env, a.token, "ciclo_treino_corrigir", { confirmar: pd.token })).erro, /mudou desde a prévia/);
  const pd2 = await tool(env, a.token, "ciclo_treino_corrigir", { date: SEX, descartarSessao: S2 });
  assert.equal((await tool(env, a.token, "ciclo_treino_corrigir", { confirmar: pd2.token })).corrigido, true);
  assert.equal(n(env, "SELECT COUNT(*) AS n FROM session WHERE user_id = ? AND date = ?", uid(env, "ana"), SEX), 1);
  assert.equal((await a.hoje()).status, "feito", "o dia continua feito (sobrou a sessão terminada)");
  // a B não descarta nem vê a sessão da A (mesmo id): a dela fica intacta
  assert.match((await tool(env, b.token, "ciclo_treino_corrigir", { date: SEX, descartarSessao: S2 })).erro, /sessão não encontrada/);
  const pb = await tool(env, b.token, "ciclo_treino_corrigir", { date: SEX, apagar: [{ exercicioId: EX }] });
  await tool(env, b.token, "ciclo_treino_corrigir", { confirmar: pb.token });
  assert.equal(n(env, "SELECT COUNT(*) AS n FROM set_log WHERE user_id = ?", uid(env, "bia")), 0);
  assert.equal(total(), 4, "a correção da B não toca na A");
  // registrar pelo MCP num dia já feito soma na sessão do dia (não abre outra)
  await tool(env, a.token, "ciclo_treino_registrar", { date: SEX, exercicioId: EX2, series: [{ kg: 6, reps: 15 }] });
  assert.equal(n(env, "SELECT COUNT(*) AS n FROM session WHERE user_id = ? AND date = ?", uid(env, "ana"), SEX), 1);
});
