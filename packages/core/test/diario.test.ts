// #27 Diário: cobertura (check-in + checkout), dias sem abrir, faixa de lembrete, saúde da semana, cardio do checkout e exames.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  diaryCoverage, absenceGap, diaryReminder, healthWeek, healthMaintenance, healthText, checkoutCardioEntry, cardioWeekSummary,
  checkExamFile, checkExamSummary, examExpiresAt, EXAM_MAX_PDF_BYTES, EXAM_TTL_MS, lastDays, weekDates,
} from "../src/index.ts";
import type { CheckoutLite } from "../src/index.ts";

const MON = "2026-11-09";
const W = weekDates(MON); // seg..dom
const MB = 1024 * 1024;

test("cobertura: check-in e checkout por dia; futuro não conta", () => {
  const c = diaryCoverage(W, [W[0], W[1], W[3]], [W[0], W[2]], W[3]);
  assert.deepEqual(c.days.map((d) => d.state), ["completo", "parcial", "parcial", "parcial", "futuro", "futuro", "futuro"]);
  assert.equal(c.checkins, 3); assert.equal(c.checkouts, 2); assert.equal(c.due, 4);
  assert.deepEqual(c.empty, []);
  const v = diaryCoverage(W, [], [], W[1]);
  assert.deepEqual(v.empty, [W[0], W[1]]);
  // o checkout de hoje ainda não está atrasado (é à noite): hoje sem checkout não vira "buraco" de checkout
  assert.deepEqual(diaryCoverage(W, [W[0]], [], W[0]).days[0].state, "parcial");
});

test("dias sem abrir: X configurável (padrão 2); lista os dias faltantes, no máximo 14", () => {
  assert.deepEqual(absenceGap(null, W[4]), { days: 0, missing: [], ask: false }, "1º uso não pergunta");
  assert.equal(absenceGap(W[0], W[0]).ask, false);
  assert.deepEqual(absenceGap(W[0], W[2]), { days: 2, missing: [W[1]], ask: false }, "1 dia faltando < 2");
  const g = absenceGap(W[0], W[4]); // abriu seg, volta sex: ter, qua e qui sem abrir
  assert.equal(g.days, 4); assert.deepEqual(g.missing, [W[1], W[2], W[3]]); assert.equal(g.ask, true);
  assert.equal(absenceGap(W[0], W[4], 4).ask, false, "X = 4 → 3 dias não pergunta");
  assert.equal(absenceGap(W[0], W[3], 2).ask, true, "X = 2 → 2 dias pergunta");
  const long = absenceGap("2026-09-01", W[0]);
  assert.equal(long.missing.length, 14); assert.equal(long.missing[13], "2026-11-08");
  assert.equal(absenceGap(W[4], W[0]).ask, false, "relógio voltou: nada");
});

test("faixa de lembrete: nunca bloqueia; prioridade resumo > check-in > checkout de ontem; 'mais tarde' 1× por dia", () => {
  const base = { today: W[3], checkinToday: false, checkoutYesterday: true, snoozedOn: null, absence: null };
  const r = diaryReminder(base)!;
  assert.equal(r.kind, "checkin"); assert.match(r.text, /Fazer check-in · 10 s/); assert.equal(r.href, "#diario");
  assert.equal(diaryReminder({ ...base, checkinToday: true }), null, "some ao concluir");
  assert.equal(diaryReminder({ ...base, checkinToday: true, checkoutYesterday: false })!.kind, "checkout");
  assert.equal(diaryReminder({ ...base, snoozedOn: W[3] }), null, "adiada hoje");
  assert.equal(diaryReminder({ ...base, snoozedOn: W[2] })!.kind, "checkin", "adiar vale só para o dia");
  const a = diaryReminder({ ...base, absence: { from: W[0], to: W[2] } })!;
  assert.equal(a.kind, "resumo"); assert.match(a.text, /Faz 4 dias/); assert.equal(a.href, "#diario/resumo");
  assert.equal(diaryReminder({ ...base, snoozedOn: W[3], absence: { from: W[0], to: W[2] } }), null);
});

const co = (date: string, o: Partial<CheckoutLite> = {}): CheckoutLite => ({ date, alcohol: null, smoke: null, smokeQty: null, caffeineLate: null, waterMl: null, cardioMin: null, steps: null, mood: null, ...o });

test("saúde da semana: médias de sono, álcool, fumo, água e cardio (checkout + registros de cardio)", () => {
  const checkins = [{ date: W[0], sleepH: 7 }, { date: W[1], sleepH: 6 }, { date: W[2], sleepH: 5 }];
  const outs = [co(W[0], { alcohol: 2, waterMl: 2000, smoke: false }), co(W[1], { alcohol: 0, smoke: true, smokeQty: 5, waterMl: 1000 }), co(W[2], { alcohol: 3, caffeineLate: true, cardioMin: 30, steps: 9000 })];
  const h = healthWeek(W, checkins, outs, 45);
  assert.equal(h.sleepAvg, 6); assert.equal(h.sleepNights, 3);
  assert.equal(h.alcoholNights, 2); assert.equal(h.alcoholUnits, 5);
  assert.equal(h.smokeDays, 1); assert.equal(h.smokeQty, 5);
  assert.equal(h.caffeineLateDays, 1); assert.equal(h.waterAvgMl, 1500);
  assert.equal(h.cardioMin, 45, "cardio vem do resumo da semana (já inclui o do checkout)");
  assert.equal(h.stepsAvg, 9000);
  assert.equal(h.checkouts, 3);
  // fora da semana não conta
  assert.equal(healthWeek(W, [], [co("2026-11-01", { alcohol: 9 })], 0).alcoholUnits, 0);
});

test("manutenção por saúde: 3+ noites com álcool ou sono médio < 6 h → semana de manutenção sugerida", () => {
  const three = healthWeek(W, [], [co(W[0], { alcohol: 1 }), co(W[1], { alcohol: 2 }), co(W[3], { alcohol: 4 })], 0);
  const m = healthMaintenance(three);
  assert.equal(m.suggest, true); assert.match(m.reasons[0], /3 noites com álcool/);
  assert.equal(healthMaintenance(healthWeek(W, [], [co(W[0], { alcohol: 1 }), co(W[1], { alcohol: 2 })], 0)).suggest, false);
  const sono = healthWeek(W, [5, 5, 6, 5].map((s, i) => ({ date: W[i], sleepH: s })), [], 0);
  assert.equal(healthMaintenance(sono).suggest, true);
  assert.equal(healthMaintenance(healthWeek(W, [{ date: W[0], sleepH: 5 }], [], 0)).suggest, false, "1 noite só não basta");
  const t = healthText(three, m);
  assert.match(t, /álcool 3 noites \(7 doses\)/); assert.match(t, /fumo 0 dias/); assert.match(t, /manutenção sugerida/);
  assert.match(healthText(healthWeek(W, [], [], 0), healthMaintenance(healthWeek(W, [], [], 0))), /sem checkout/);
});

test("cardio do checkout vira registro de cardio (id fixo por dia) e soma no resumo da semana", () => {
  const e = checkoutCardioEntry(W[2], { type: "Trail_Running_Walking", minutes: 40 })!;
  assert.deepEqual(e, { id: `ck-${W[2]}`, date: W[2], type: "Trail_Running_Walking", minutes: 40, intensity: "moderado", distanceKm: null });
  assert.equal(checkoutCardioEntry(W[2], { steps: 8000 }), null, "só passos: não vira sessão de cardio");
  assert.equal(checkoutCardioEntry(W[2], null), null);
  assert.equal(checkoutCardioEntry(W[2], { type: "inexistente", minutes: 10 }), null);
  const week = cardioWeekSummary([{ id: "c1", date: W[0], type: "Running_Treadmill", minutes: 25, intensity: "zona2", distanceKm: 3 }, e], W[0], W[6], 70);
  assert.equal(week.minutes, 65); assert.equal(week.sessions, 2);
});

test("exame: PDF de 5 MB aceito, 6 MB recusado; só PDF; texto expira em 7 dias", () => {
  assert.equal(EXAM_MAX_PDF_BYTES, 5 * MB);
  assert.equal(checkExamFile({ size: 5 * MB, type: "application/pdf" }), null);
  assert.match(checkExamFile({ size: 6 * MB, type: "application/pdf" })!, /5 MB/);
  assert.match(checkExamFile({ size: 1000, type: "image/png" })!, /PDF/);
  assert.match(checkExamFile({ size: 0, type: "application/pdf" })!, /vazio/);
  assert.equal(EXAM_TTL_MS, 7 * 864e5);
  assert.equal(examExpiresAt(1000), 1000 + 7 * 864e5);
});

test("resumo do exame: valida marcadores e mudanças; recusa campos fora do formato; sempre leva o aviso", () => {
  const ok = checkExamSummary({ data: "2026-10-30", marcadores: [{ nome: "Vitamina D", valor: 22, unidade: "ng/mL", referencia: "30–100", status: "fora" }, { nome: "Ferritina", valor: "180", status: "dentro" }], mudancas: ["Sol 15 min/dia e conversar com o médico sobre vitamina D"] });
  assert.ok(ok.ok);
  if (ok.ok) {
    assert.equal(ok.value.marcadores.length, 2); assert.equal(ok.value.marcadores[1].valor, "180");
    assert.match(ok.value.aviso, /não é diagnóstico/i);
  }
  const bad = (x: unknown, re: RegExp) => { const r = checkExamSummary(x); assert.equal(r.ok, false); if (!r.ok) assert.match(r.errors.join("; "), re); };
  bad({ marcadores: [] }, /marcadores/);
  bad({ marcadores: [{ nome: "x", valor: 1, status: "talvez" }] }, /status/);
  bad({ marcadores: [{ nome: "", valor: 1, status: "dentro" }] }, /nome/);
  bad({ marcadores: Array.from({ length: 41 }, () => ({ nome: "a", valor: 1, status: "dentro" })) }, /40/);
  bad({ data: "ontem", marcadores: [{ nome: "a", valor: 1, status: "dentro" }] }, /data/);
  bad({ marcadores: [{ nome: "a", valor: 1, status: "dentro" }], mudancas: ["x".repeat(301)] }, /mudancas/);
  bad({ marcadores: [{ nome: "a", valor: { x: 1 }, status: "dentro" }] }, /valor/);
  bad(null, /resumo/);
});

test("calendário: últimos N dias até hoje, do mais antigo ao mais novo", () => {
  const d = lastDays(W[2], 30);
  assert.equal(d.length, 30); assert.equal(d[29], W[2]); assert.equal(d[0], "2026-10-13");
});
