import { test } from "node:test";
import assert from "node:assert/strict";
import {
  estimateFood, foodParts, guessMeal, dayTotals, foodAverages, proteinAdherence, topProteinFoods,
  weightTrend, adaptiveTarget, PACE_KG_WEEK, pickVoiceEngine, voiceHelp,
} from "../src/index.ts";
import type { FoodEntry, WeightPoint } from "../src/index.ts";

// ---------- estimativa local ----------
test("estimateFood: 'três ovos, dois pães e um whey' (números por extenso)", () => {
  const e = estimateFood("três ovos, dois pães e um whey");
  assert.equal(e.kcal, 3 * 70 + 2 * 140 + 120);
  assert.equal(e.prot, 3 * 6 + 2 * 4.5 + 24);
});

test("estimateFood: gramas e dígitos não explodem (150 g de frango ≈ 1 porção)", () => {
  assert.deepEqual(estimateFood("150 g de frango"), { kcal: 250, prot: 45 });
  assert.deepEqual(estimateFood("300g de frango"), { kcal: 500, prot: 90 });
  assert.deepEqual(estimateFood("2 ovos"), { kcal: 140, prot: 12 });
  assert.deepEqual(estimateFood("meio abacate misterioso"), { kcal: 0, prot: 0 });
  assert.deepEqual(estimateFood(""), { kcal: 0, prot: 0 });
});

test("foodParts: devolve o que foi reconhecido, por alimento", () => {
  const p = foodParts("café: 3 ovos e 2 pães · almoço: arroz, feijão e frango");
  assert.deepEqual(p.map((x) => x.label), ["Ovo", "Pão", "Arroz", "Feijão", "Frango"]);
});

test("guessMeal: palavra do texto vence a hora; sem palavra, vai pela hora", () => {
  assert.equal(guessMeal("café: 2 ovos", 15), "cafe");
  assert.equal(guessMeal("janta: arroz", 9), "jantar");
  assert.equal(guessMeal("arroz e frango", 12), "almoco");
  assert.equal(guessMeal("uma banana", 16), "lanche");
  assert.equal(guessMeal("arroz e frango", 20), "jantar");
  assert.equal(guessMeal("pão", 7), "cafe");
});

// ---------- médias de 7 dias ----------
// 7 dias fictícios (2026-11-02 .. 2026-11-08); meta 2600 kcal / 140 g. 03/11 e 06/11 sem registro.
const E = (date: string, kcal: number, prot: number, meal: FoodEntry["meal"] = null): FoodEntry => ({ date, kcal, prot, meal });
const WEEK: FoodEntry[] = [
  E("2026-11-02", 800, 40, "cafe"), E("2026-11-02", 1200, 70, "almoco"), E("2026-11-02", 600, 35, "jantar"),   // 2600 / 145
  E("2026-11-04", 2000, 100, "almoco"),                                                                          // 2000 / 100
  E("2026-11-05", 700, 30, "cafe"), E("2026-11-05", 1300, 80, "almoco"), E("2026-11-05", 700, 40, "jantar"),     // 2700 / 150
  E("2026-11-07", 2400, 135, "almoco"),                                                                          // 2400 / 135 (96%: bate)
  E("2026-11-08", 2800, 160, "jantar"),                                                                          // 2800 / 160
  E("2026-10-20", 5000, 300, "almoco"),                                                                          // fora da janela
];

test("dayTotals soma o dia", () => {
  assert.deepEqual(dayTotals(WEEK, "2026-11-02"), { date: "2026-11-02", kcal: 2600, prot: 145, logged: true });
  assert.deepEqual(dayTotals(WEEK, "2026-11-03"), { date: "2026-11-03", kcal: 0, prot: 0, logged: false });
});

test("foodAverages: média só dos dias registrados, 7 dias, % da meta e dias registrados", () => {
  const a = foodAverages(WEEK, "2026-11-08", { kcal: 2600, protein: 140 });
  assert.equal(a.days.length, 7);
  assert.equal(a.days[0].date, "2026-11-02");
  assert.equal(a.daysLogged, 5);
  assert.equal(a.avgKcal, Math.round((2600 + 2000 + 2700 + 2400 + 2800) / 5)); // 2500
  assert.equal(a.avgProt, Math.round((145 + 100 + 150 + 135 + 160) / 5));       // 138
  assert.equal(a.kcalPct, Math.round((2500 / 2600) * 100));
  assert.equal(a.protPct, Math.round((138 / 140) * 100));
  // aderência: 145, 150, 135 (≥ 95% de 140 = 133) e 160 batem; 100 não → 4 de 5
  assert.deepEqual(a.adherence, { hit: 4, of: 5, rate: 80 });
  // por refeição (kcal total 12500): almoço 1200+2000+1300+2400 = 6900
  const almoco = a.byMeal.find((m) => m.meal === "almoco")!;
  assert.equal(almoco.kcal, 6900);
  assert.equal(almoco.share, Math.round((6900 / 12500) * 100));
  assert.equal(a.byMeal.reduce((s, m) => s + m.kcal, 0), 12500);
});

test("foodAverages: semana sem registro não inventa média", () => {
  const a = foodAverages([], "2026-11-08", { kcal: 2600, protein: 140 });
  assert.equal(a.daysLogged, 0);
  assert.equal(a.avgKcal, null);
  assert.equal(a.avgProt, null);
  assert.deepEqual(a.adherence, { hit: 0, of: 0, rate: 0 });
});

test("proteinAdherence: tolerância de 5% para estimativa aproximada", () => {
  assert.deepEqual(proteinAdherence([140, 133, 132.9, 0], 140), { hit: 2, of: 4, rate: 50 });
  assert.deepEqual(proteinAdherence([], 140), { hit: 0, of: 0, rate: 0 });
});

test("topProteinFoods: soma a proteína por alimento e ordena", () => {
  const top = topProteinFoods([
    { date: "2026-11-02", text: "3 ovos e 150 g de frango", kcal: null, prot: null },
    { date: "2026-11-03", text: "2 whey, 1 ovo", kcal: null, prot: null },
  ]);
  // frango 45 · whey 48 · ovo 4*6=24
  assert.deepEqual(top.map((t) => t.label), ["Whey", "Frango", "Ovo"]);
  assert.equal(top[0].prot, 48);
  assert.equal(top[2].prot, 24);
});

// ---------- tendência do peso (EMA α 0,1) ----------
const days = (start: string, n: number) => Array.from({ length: n }, (_, i) => new Date(Date.parse(start + "T12:00:00Z") + i * 864e5).toISOString().slice(0, 10));
const W = (start: string, kgs: number[]): WeightPoint[] => days(start, kgs.length).map((date, i) => ({ date, kg: kgs[i] }));

test("weightTrend: peso estável → tendência 0; ruído diário não move a tendência", () => {
  const flat = weightTrend(W("2026-10-19", Array(21).fill(72)), "2026-11-08");
  assert.equal(flat.perWeek, 0);
  assert.equal(flat.last, 72);
  const noisy = weightTrend(W("2026-10-19", Array.from({ length: 21 }, (_, i) => 72 + (i === 0 ? 0 : i % 2 ? 0.6 : -0.6))), "2026-11-08");
  assert.ok(Math.abs(noisy.perWeek!) < 0.15, `tendência ${noisy.perWeek}`);
});

test("weightTrend: poucos pesos → sem tendência", () => {
  assert.equal(weightTrend(W("2026-11-06", [72, 72.1, 72.2]), "2026-11-08").perWeek, null);
  assert.equal(weightTrend([], "2026-11-08").perWeek, null);
});

// ---------- calorias adaptativas: 3 semanas fictícias ----------
const intake = (start: string, n: number, kcal: number) => days(start, n).map((date) => ({ date, kcal }));

test("adaptiveTarget: peso parado comendo 2400 → gasto 2400; moderado pede ~2675 → +150 (teto semanal)", () => {
  const r = adaptiveTarget({ weights: W("2026-10-19", Array(21).fill(72)), intake: intake("2026-10-19", 21, 2400), currentKcal: 2400, pace: "moderado", end: "2026-11-08" });
  assert.equal(r.code, "ok");
  assert.equal(r.tdee, 2400);
  assert.equal(r.avgIntake, 2400);
  assert.equal(r.adjust, 150);
  assert.equal(r.kcal, 2550);
  assert.deepEqual(r.faixa, [2450, 2650]);
  assert.match(r.reason, /2\.400/);
  assert.match(r.reason, /\+150/);
});

test("adaptiveTarget: ganhando rápido demais (≈ +0,6 kg/sem) comendo 3000 → baixa 150", () => {
  // 21 dias subindo 0,6 kg/semana (0,0857/dia): a tendência (EMA 0,1) enxerga ~0,45 kg/sem ou mais → gasto < 3000
  const kgs = Array.from({ length: 21 }, (_, i) => 72 + i * (0.6 / 7));
  const r = adaptiveTarget({ weights: W("2026-10-19", kgs), intake: intake("2026-10-19", 21, 3000), currentKcal: 3000, pace: "moderado", end: "2026-11-08" });
  assert.equal(r.code, "ok");
  assert.ok(r.trendKgWeek! > 0.3 && r.trendKgWeek! < 0.6, `trend ${r.trendKgWeek}`);
  assert.ok(r.tdee! < 2700, `tdee ${r.tdee}`);
  assert.equal(r.adjust, -150);
  assert.equal(r.kcal, 2850);
  assert.match(r.reason, /-150/);
});

test("adaptiveTarget: já no ritmo desejado → mantém ('dentro da faixa')", () => {
  // 60 dias subindo 0,25 kg/sem (EMA já aquecida) comendo 2700 → gasto ~2425, ritmo moderado pede ~2700
  const kgs = Array.from({ length: 60 }, (_, i) => 70 + i * (0.25 / 7));
  const r = adaptiveTarget({ weights: W("2026-09-10", kgs), intake: intake("2026-10-19", 21, 2700), currentKcal: 2700, pace: "moderado", end: "2026-11-08" });
  assert.equal(r.code, "dentro");
  assert.equal(r.adjust, 0);
  assert.equal(r.kcal, 2700);
  assert.match(r.reason, /mant/i);
  // peso parado, meta 2660 e o ritmo pede 2675 → também mantém
  const quase = adaptiveTarget({ weights: W("2026-10-19", Array(21).fill(72)), intake: intake("2026-10-19", 21, 2400), currentKcal: 2660, pace: "moderado", end: "2026-11-08" });
  assert.equal(quase.adjust, 0);
  assert.equal(quase.code, "dentro");
});

test("adaptiveTarget: ritmos mudam o alvo (lento < moderado < rápido) e o ajuste é arredondado de 5 em 5", () => {
  const args = { weights: W("2026-10-19", Array(21).fill(72)), intake: intake("2026-10-19", 21, 2400), end: "2026-11-08", currentKcal: 2500 };
  const adj = (pace: keyof typeof PACE_KG_WEEK) => adaptiveTarget({ ...args, pace }).adjust;
  // lento pede 2400+165 = 2565 (+65); moderado e rápido passam do teto semanal (+150)
  assert.equal(adj("lento"), 65);
  assert.equal(adj("moderado"), 150);
  assert.equal(adj("rapido"), 150);
  assert.equal(adaptiveTarget({ ...args, pace: "lento" }).desired, 2565);
  assert.equal(adaptiveTarget({ ...args, pace: "rapido" }).desired, 2840);
});

test("adaptiveTarget: dados insuficientes não mexem na meta e explicam o porquê", () => {
  const poucosPesos = adaptiveTarget({ weights: W("2026-11-05", [72, 72.1]), intake: intake("2026-10-19", 21, 2400), currentKcal: 2650, pace: "moderado", end: "2026-11-08" });
  assert.equal(poucosPesos.code, "sem_dados");
  assert.equal(poucosPesos.adjust, 0);
  assert.equal(poucosPesos.kcal, 2650);
  assert.match(poucosPesos.reason, /peso/i);
  const poucaComida = adaptiveTarget({ weights: W("2026-10-19", Array(21).fill(72)), intake: intake("2026-11-05", 3, 2400), currentKcal: 2650, pace: "moderado", end: "2026-11-08" });
  assert.equal(poucaComida.code, "sem_dados");
  assert.match(poucaComida.reason, /registr/i);
});

test("adaptiveTarget: dia com pouquíssima comida registrada (< 800 kcal) é dia incompleto e não entra", () => {
  const ints = [...intake("2026-10-19", 14, 2400), ...intake("2026-11-02", 7, 300)];
  const r = adaptiveTarget({ weights: W("2026-10-19", Array(21).fill(72)), intake: ints, currentKcal: 2400, pace: "moderado", end: "2026-11-08" });
  assert.equal(r.avgIntake, 2400);
});

test("adaptiveTarget: cintura +1,2 cm em 4 semanas com peso subindo rápido → -150 antes de tudo", () => {
  const kgs = Array.from({ length: 21 }, (_, i) => 72 + i * (0.7 / 7));
  const r = adaptiveTarget({ weights: W("2026-10-19", kgs), intake: intake("2026-10-19", 21, 3000), currentKcal: 3000, pace: "rapido", end: "2026-11-08", waistDeltaCm4w: 1.2 });
  assert.equal(r.code, "cintura");
  assert.equal(r.adjust, -150);
  assert.match(r.reason, /cintura/i);
  // cintura estável: o alerta não dispara
  const ok = adaptiveTarget({ weights: W("2026-10-19", kgs), intake: intake("2026-10-19", 21, 3000), currentKcal: 3000, pace: "rapido", end: "2026-11-08", waistDeltaCm4w: 0.2 });
  assert.notEqual(ok.code, "cintura");
});

test("adaptiveTarget: limites de segurança 1200..6000 kcal", () => {
  const r = adaptiveTarget({ weights: W("2026-10-19", Array.from({ length: 21 }, (_, i) => 72 + i * 0.2)), intake: intake("2026-10-19", 21, 1500), currentKcal: 1250, pace: "lento", end: "2026-11-08" });
  assert.ok(r.kcal >= 1200);
});

test("adaptiveTarget: o ajuste fica sempre em ±150, mesmo com a meta atual fora da faixa de segurança", () => {
  const args = { weights: W("2026-10-19", Array(21).fill(72)), intake: intake("2026-10-19", 21, 2400), end: "2026-11-08", pace: "moderado" as const };
  const baixa = adaptiveTarget({ ...args, currentKcal: 800 });
  assert.equal(baixa.adjust, 150);
  assert.equal(baixa.kcal, 950);
  const alta = adaptiveTarget({ ...args, currentKcal: 7000, pace: "lento" });
  assert.ok(Math.abs(alta.adjust) <= 150);
});

test("adaptiveTarget: números que não fecham (gasto ou tendência implausíveis) não mexem na meta", () => {
  // 21 dias subindo 0,5 kg/dia (~3,5 kg/sem) comendo 1000: gasto estimado negativo
  const kgs = Array.from({ length: 21 }, (_, i) => 60 + i * 0.5);
  const r = adaptiveTarget({ weights: W("2026-10-19", kgs), intake: intake("2026-10-19", 21, 1000), currentKcal: 2650, pace: "moderado", end: "2026-11-08" });
  assert.equal(r.code, "sem_dados");
  assert.equal(r.adjust, 0);
  assert.equal(r.kcal, 2650);
  assert.match(r.reason, /não fecham|implaus/i);
});

// ---------- motor de voz ----------
test("pickVoiceEngine: Whisper > navegador > nenhum, e diz o motivo", () => {
  const base = { secure: true, recorder: true, recognition: true, server: true, serverAi: true };
  assert.equal(pickVoiceEngine(base).engine, "whisper");
  assert.equal(pickVoiceEngine({ ...base, serverAi: false }).engine, "navegador");
  assert.equal(pickVoiceEngine({ ...base, server: false }).engine, "navegador");
  assert.equal(pickVoiceEngine({ ...base, recorder: false }).engine, "navegador");
  assert.equal(pickVoiceEngine({ ...base, serverAi: false, recognition: false }).engine, "nenhum");
  const sem = pickVoiceEngine({ ...base, serverAi: false, recognition: false });
  assert.match(sem.help, /teclado/);
  const inseguro = pickVoiceEngine({ ...base, secure: false });
  assert.equal(inseguro.engine, "nenhum");
  assert.match(inseguro.help, /https/);
});

test("pickVoiceEngine: whisper que falhou nesta sessão cai para o navegador", () => {
  const base = { secure: true, recorder: true, recognition: true, server: true, serverAi: true, whisperFalhou: true };
  assert.equal(pickVoiceEngine(base).engine, "navegador");
  assert.equal(pickVoiceEngine({ ...base, recognition: false }).engine, "nenhum");
});

test("voiceHelp: mensagens por código de erro, sem vazar detalhe", () => {
  assert.match(voiceHelp("permissao"), /permiss/i);
  assert.match(voiceHelp("sem_microfone"), /microfone/i);
  assert.match(voiceHelp("audio_grande"), /longo|grande/i);
  assert.match(voiceHelp("sem_servidor"), /navegador|teclado/i);
  assert.match(voiceHelp("qualquer-coisa"), /tente|teclado/i);
});
