// #27 Diário no Worker: checkout em dia sem treino (cardio soma na semana), dias sem abrir → resumo único,
// exames (só texto; texto bruto some ao concluir e após 7 dias) e saúde (álcool/fumo) no resumo de contexto. Dados fictícios.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cardioWeekSummary, EXAM_TTL_MS } from "@ciclo/core";
import { call, makeEnv, mcp } from "./fakes.ts";
import { purgeExpiredExams } from "../src/diario.ts";

const MON = "2026-11-09", TUE = "2026-11-10", WED = "2026-11-11", THU = "2026-11-12", FRI = "2026-11-13";
const ok = async (p: Promise<{ status: number; text: string; data: any }>, st = 200) => { const r = await p; assert.ok(r.status >= st && r.status < 300, `${r.status} ${r.text}`); return r; };
const as = (env: any, user: string) => (m: string, p: string, body?: unknown) => call(env, m, p, { user, body });
async function token(env: any, user: string) { return (await ok(call(env, "POST", "/api/account/tokens", { user, body: { label: "t" } }), 201)).data.token as string; }
const tool = async (env: any, tok: string, name: string, args: Record<string, unknown> = {}) => {
  const r = await mcp(env, tok, name, args); assert.equal(r.status, 200);
  return { err: !!r.data.result.isError, out: r.data.result.isError ? r.data.result.content[0].text : JSON.parse(r.data.result.content[0].text) };
};

test("checkout em dia sem treino: grava, cardio do checkout soma no resumo da semana sem duplicar, e valida", async () => {
  const env = makeEnv(), c = as(env, "ana");
  await ok(c("POST", "/api/cardio", { date: MON, type: "Running_Treadmill", minutes: 25, intensity: "zona2" }), 201);
  const body = { trained: false, cardio: { type: "Trail_Running_Walking", minutes: 40, steps: 9000 }, waterMl: 2000, alcohol: 2, smoke: true, smokeQty: 3, caffeineLate: false, mood: 4, note: "dia de descanso fictício" };
  await ok(c("PUT", `/api/checkout/${TUE}`, body));
  await ok(c("PUT", `/api/checkout/${TUE}`, body)); // regravar não duplica o cardio
  const d = (await ok(c("GET", `/api/diario?from=${MON}&to=${WED}`))).data;
  assert.equal(d.checkouts.length, 1);
  assert.deepEqual({ ...d.checkouts[0], updatedAt: 0 }, { date: TUE, trained: false, cardio: { type: "Trail_Running_Walking", minutes: 40, steps: 9000 }, waterMl: 2000, alcohol: 2, smoke: true, smokeQty: 3, caffeineLate: false, mood: 4, sleptWell: null, note: "dia de descanso fictício", source: "app", updatedAt: 0 });
  const week = (await ok(c("GET", `/api/state?date=${TUE}`))).data.week.cardio;
  assert.equal(week.length, 2, "checkout entra no cardio da semana");
  assert.equal(cardioWeekSummary(week, MON, "2026-11-15", 70).minutes, 65);
  // tirou o cardio do checkout → some do resumo
  await ok(c("PUT", `/api/checkout/${TUE}`, { ...body, cardio: { steps: 5000 } }));
  assert.equal((await ok(c("GET", `/api/state?date=${TUE}`))).data.week.cardio.length, 1);
  const bad = async (b: object, re: RegExp) => { const x = await c("PUT", `/api/checkout/${TUE}`, b); assert.equal(x.status, 400, x.text); assert.match(x.data.error, re); };
  await bad({ alcohol: 31 }, /alcohol/);
  await bad({ smoke: "sim" }, /smoke/);
  await bad({ mood: 0 }, /mood/);
  await bad({ cardio: { type: "x'; DROP TABLE checkout;--", minutes: 10 } }, /cardio.type/);
  await bad({ cardio: { minutes: 10 } }, /cardio.type/);
  await bad({ note: "x".repeat(1001) }, /note/);
  assert.equal((await c("PUT", "/api/checkout/ontem", {})).status, 400);
});

test("resumo dos dias (formulário da #27) grava os dias, não apaga o que existia e libera a faixa", async () => {
  const env = makeEnv(), c = as(env, "ana");
  await ok(c("PUT", `/api/checkout/${WED}`, { mood: 3, note: "já tinha" }));
  await ok(c("POST", "/api/diario/resumo", { dias: [
    { date: TUE, trained: true, alcohol: 0, sleptWell: true },
    { date: WED, trained: false, alcohol: 3, sleptWell: false, note: "aniversário" },
    { date: THU, trained: false, sleptWell: true },
  ] }));
  const d = (await ok(c("GET", `/api/diario?from=${MON}&to=${FRI}`))).data;
  assert.deepEqual(d.checkouts.map((x: any) => x.date), [TUE, WED, THU], "registros no calendário");
  const wed = d.checkouts.find((x: any) => x.date === WED);
  assert.equal(wed.mood, 3, "não apaga o que já existia"); assert.equal(wed.alcohol, 3); assert.equal(wed.note, "aniversário");
  assert.equal(d.reminder.absence, null);
  const att = (await ok(c("GET", `/api/state?date=${FRI}`))).data.week.attendance;
  assert.deepEqual(att.map((a: any) => [a.date, a.status]), [[TUE, "fui"], [WED, "nao_fui"], [THU, "nao_fui"]]);
  const s = (await ok(c("PUT", "/api/diario/lembrete", { snoozedOn: FRI, absenceDays: 4 }))).data;
  assert.equal(s.snoozedOn, FRI); assert.equal(s.absenceDays, 4);
  assert.equal((await c("POST", "/api/diario/resumo", { dias: [] })).status, 400);
  assert.equal((await c("POST", "/api/diario/resumo", { dias: [{ date: TUE }, { date: TUE }] })).status, 400);
  assert.equal((await c("GET", `/api/diario?from=2026-01-01&to=${FRI}`)).status, 400, "intervalo de até 62 dias");
});

test("relato ao Claude: ciclo_registrar_resumo_dias grava com 'confira' e ciclo_diario lê", async () => {
  const env = makeEnv(), c = as(env, "ana"), tok = await token(env, "ana");
  await ok(c("POST", "/api/diario/abrir", { today: MON }));
  await ok(c("POST", "/api/diario/abrir", { today: FRI }));
  await ok(c("PUT", `/api/checkout/${THU}`, { alcohol: 1, note: "nota do dono", mood: 4 })); // registro do app antes do relato
  const w = await tool(env, tok, "ciclo_registrar_resumo_dias", { dias: [{ date: TUE, trained: true }, { date: WED, alcohol: 2 }, { date: THU, alcohol: 5, note: "relato", sleptWell: true, trained: false }] });
  assert.equal(w.err, false, String(w.out));
  const d = (await ok(c("GET", `/api/diario?from=${MON}&to=${FRI}`))).data;
  assert.deepEqual(d.checkouts.map((x: any) => [x.date, x.source]), [[TUE, "claude"], [WED, "claude"], [THU, "app"]], "não troca a origem do registro do app");
  const thu = d.checkouts.find((x: any) => x.date === THU);
  assert.equal(thu.alcohol, 1, "não troca o álcool do dono"); assert.equal(thu.note, "nota do dono", "não troca a nota do dono");
  assert.equal(thu.sleptWell, true, "completa o que faltava"); assert.equal(thu.trained, false); assert.equal(thu.mood, 4);
  assert.equal(d.reminder.absence, null);
  assert.equal((await tool(env, tok, "ciclo_registrar_resumo_dias", { dias: [{ date: TUE, alcohol: 99 }] })).err, true);
  const r = (await tool(env, tok, "ciclo_diario", { from: MON, to: FRI })).out;
  assert.equal(r.checkouts.length, 3); assert.match(r.saude, /álcool 2 noites \(3 doses\)/);
});

test("exame: só texto (PDF não sobe); texto bruto some ao concluir; resumo validado; recusa sem o texto", async () => {
  const env = makeEnv(), c = as(env, "ana"), tok = await token(env, "ana");
  const pdf = await call(env, "POST", "/api/exames", { user: "ana", raw: new Uint8Array(6 * 1024 * 1024), ct: "application/pdf" });
  assert.equal(pdf.status, 413, "arquivo nunca é aceito pelo servidor");
  assert.equal((await c("POST", "/api/exames", { text: "x".repeat(60001) })).status, 400);
  assert.equal((await c("POST", "/api/exames", { text: "   " })).status, 400);
  const e = (await ok(c("POST", "/api/exames", { label: "Sangue (fictício)", text: "VITAMINA D 22 ng/mL (ref. 30 a 100)" }), 201)).data;
  const e2 = (await ok(c("POST", "/api/exames", { label: "Urina (fictício)", text: "pH 6,0" }), 201)).data;
  const p1 = (await tool(env, tok, "ciclo_exame_pendente")).out;
  assert.equal(p1.exame.id, e.id, "1 por chamada, o mais antigo primeiro"); assert.match(p1.exame.texto, /VITAMINA D/); assert.equal(p1.depoisDeste, 1);
  await ok(c("DELETE", `/api/exames/${e2.id}`));
  assert.equal((await tool(env, tok, "ciclo_exame_concluir", { id: e.id, resumo: { marcadores: [{ nome: "Vitamina D", valor: 22, status: "talvez" }] } })).err, true, "resumo inválido não apaga nada");
  assert.ok(env.DB.raw.prepare("SELECT raw_text FROM health_exam WHERE id = ?").get(e.id).raw_text);
  const fim = await tool(env, tok, "ciclo_exame_concluir", { id: e.id, resumo: { data: "2026-10-30", marcadores: [{ nome: "Vitamina D", valor: 22, unidade: "ng/mL", referencia: "30–100", status: "fora" }], mudancas: ["Conversar com o médico sobre vitamina D"] } });
  assert.equal(fim.err, false, String(fim.out));
  const row = env.DB.raw.prepare("SELECT raw_text, status, analyzed_at, summary_json FROM health_exam WHERE id = ?").get(e.id);
  assert.equal(row.raw_text, null, "texto bruto apagado do banco"); assert.equal(row.status, "analisado"); assert.ok(row.analyzed_at);
  assert.match(row.summary_json, /não é diagnóstico/);
  assert.equal((await tool(env, tok, "ciclo_exame_concluir", { id: e.id, resumo: { marcadores: [{ nome: "a", valor: 1, status: "dentro" }] } })).err, true, "não conclui 2×");
  assert.deepEqual((await tool(env, tok, "ciclo_exame_pendente")).out, { exame: null, depoisDeste: 0 });
  const ex = (await ok(c("GET", `/api/diario?from=${MON}&to=${FRI}`))).data.exams[0];
  assert.equal(ex.status, "analisado"); assert.equal(ex.hasText, false); assert.equal(ex.summary.marcadores[0].status, "fora");
  assert.ok(!JSON.stringify(ex).includes("VITAMINA D 22"), "o app não recebe o texto bruto");
  await ok(c("DELETE", `/api/exames/${e.id}`));
  assert.equal((await c("DELETE", `/api/exames/${e.id}`)).status, 404);
});

test("exame não analisado: texto bruto some depois de 7 dias (cron e leitura)", async () => {
  const env = makeEnv(), c = as(env, "ana"), tok = await token(env, "ana");
  const e = (await ok(c("POST", "/api/exames", { text: "TSH 2,1 (fictício)" }), 201)).data;
  const created = env.DB.raw.prepare("SELECT created_at, expires_at FROM health_exam WHERE id = ?").get(e.id);
  assert.equal(created.expires_at - created.created_at, EXAM_TTL_MS);
  await purgeExpiredExams(env, created.expires_at - 1);
  assert.ok(env.DB.raw.prepare("SELECT raw_text FROM health_exam WHERE id = ?").get(e.id).raw_text, "antes de 7 dias fica");
  // cron de 30 min (todas as contas)
  const worker = (await import("../src/index.ts")).default as any;
  const waits: Promise<unknown>[] = [];
  const at = Math.ceil((created.expires_at + 1) / 1800e3) * 1800e3; // próximo minuto :00/:30 depois do prazo
  await worker.scheduled({ scheduledTime: at }, env, { waitUntil: (p: Promise<unknown>) => waits.push(p) });
  await Promise.all(waits);
  const row = env.DB.raw.prepare("SELECT raw_text, status FROM health_exam WHERE id = ?").get(e.id);
  assert.equal(row.raw_text, null); assert.equal(row.status, "expirado");
  assert.equal((await tool(env, tok, "ciclo_exame_pendente")).out.exame, null);
  assert.equal((await tool(env, tok, "ciclo_exame_concluir", { id: e.id, resumo: { marcadores: [{ nome: "TSH", valor: 2.1, status: "dentro" }] } })).err, true, "vencido não conclui");
  // vencido pelo relógio: ciclo_exame_pendente (só leitura) já não mostra; o GET do Diário apaga sem esperar o cron
  const e2 = (await ok(c("POST", "/api/exames", { text: "glicemia fictícia" }), 201)).data;
  env.DB.raw.prepare("UPDATE health_exam SET expires_at = 1 WHERE id = ?").run(e2.id);
  assert.equal((await tool(env, tok, "ciclo_exame_pendente")).out.exame, null);
  await ok(c("GET", `/api/diario?from=${MON}&to=${FRI}`));
  assert.equal(env.DB.raw.prepare("SELECT raw_text FROM health_exam WHERE id = ?").get(e2.id).raw_text, null);
});

test("álcool e fumo no resumo de contexto (ciclo_estado) e nas médias; 3 noites com álcool → manutenção sugerida", async () => {
  const env = makeEnv(), c = as(env, "ana"), tok = await token(env, "ana");
  for (const [d, alcohol, smoke] of [[MON, 2, true], [TUE, 1, false], [WED, 4, true]] as const) await ok(c("PUT", `/api/checkout/${d}`, { alcohol, smoke, cardio: { type: "Rope_Jumping", minutes: 10 } }));
  await ok(c("PUT", `/api/checkin/${MON}`, { sleepH: 7, energy: 2, soreness: 1, stress: 2, food: 0 }));
  const s = (await tool(env, tok, "ciclo_estado", { date: WED })).out.saude;
  assert.equal(s.alcoolNoites, 3); assert.equal(s.alcoolDoses, 7); assert.equal(s.fumoDias, 2); assert.equal(s.cardioMin, 30);
  assert.equal(s.manutencaoSugerida, true);
  assert.match(s.texto, /álcool 3 noites \(7 doses\) · fumo 2 dias/); assert.match(s.texto, /manutenção sugerida/);
  // a conta B não vê a saúde da A
  const tb = await token(env, "bia");
  const sb = (await tool(env, tb, "ciclo_estado", { date: WED })).out.saude;
  assert.equal(sb.alcoolNoites, 0); assert.equal(sb.manutencaoSugerida, false);
});
