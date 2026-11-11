// Semana completa planejada (#24): gerador, faltas, extra/48 h, compensatório, ações, diff, ajuste de volume e deload.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EQUIPMENT, EXERCISE_BY_ID, MUSCLES, MUSCLE_IDS, weeklyTargets, weekDates,
  planWeek, weekView, replanAfterMiss, extraSession, compensatoryOffer, applyDayAction, diffWeeks, trainingDows,
  adjustVolume, volumeDelta, deloadCheck, weekProgression, holdWeeks, perfByMuscle, BONUS_MAX,
} from "../src/index.ts";
import type { DayPlan, MuscleId, Sets, WeekInput, WeekPlan, WeekProfile } from "../src/index.ts";

const ALL = EQUIPMENT.map((e) => e.id);
const PRIOS: MuscleId[] = ["ombro", "biceps", "triceps"];
const MON = "2026-11-09";
const D = weekDates(MON); // seg..dom
const SUP = MUSCLE_IDS.filter((m) => MUSCLES[m].group === "sup");
const INF = MUSCLE_IDS.filter((m) => MUSCLES[m].group === "inf");
const T = weeklyTargets(1, PRIOS);
const prof = (o: Partial<WeekProfile> = {}): WeekProfile => ({
  daysUsual: ["seg", "ter", "qui", "sex"], daysTarget: 4, minutes: 60, priorities: PRIOS, dayGym: {}, gyms: [{ id: "a1", equipment: ALL }], ...o,
});
const inp = (o: Partial<WeekInput> = {}): WeekInput => ({ weekStart: MON, today: D[0], sets: {}, attendance: {}, profile: prof(), targets: T, ...o });
const day = (w: WeekPlan, i: number) => w.days[i];
const groupsOf = (p: DayPlan | null) => [...new Set((p?.items ?? []).map((i) => MUSCLES[i.muscle].group))].sort();
/** treinou exatamente o planejado nos dias indicados */
const did = (w: WeekPlan, idx: number[]) => Object.fromEntries(idx.map((i) => [D[i], { ...day(w, i).plan!.perMuscle }])) as Record<string, Sets>;

test("segunda de manhã: 4 dias habituais planejados inteiros, alternando superior/inferior, todo músculo 2×", () => {
  const i = inp();
  const w = planWeek(i);
  const v = weekView(i, w);
  assert.deepEqual(w.days.filter((d) => d.kind === "treino").map((d) => d.dow), ["seg", "ter", "qui", "sex"]);
  assert.deepEqual([0, 1, 3, 4].map((k) => groupsOf(day(w, k).plan).join()), ["sup", "inf", "sup", "inf"]);
  for (const k of [0, 1, 3, 4]) {
    const p = day(w, k).plan!;
    assert.ok(p.items.length >= 4, `${D[k]} vazio`);
    for (const it of p.items) assert.equal(it.nm, EXERCISE_BY_ID[it.exerciseId].nm, "nome hidratado do catálogo");
  }
  assert.deepEqual(v.days.map((d) => d.status), ["hoje", "planejado", "folga", "planejado", "planejado", "folga", "folga"]);
  for (const m of MUSCLE_IDS) assert.ok((v.projected.freq[m] ?? 0) >= 2, `${m} 2×`);
  for (const m of MUSCLE_IDS) assert.ok((v.projected.done[m] ?? 0) <= T[m] + 2, `${m} não estoura o orçamento: ${v.projected.done[m]} > ${T[m]}`);
  assert.ok(v.closePct >= 60, `fecha em ${v.closePct}% (60 min/dia limita)`);
  assert.equal(v.offer, null);
});

test("semana de 3 dias: superior, inferior e corpo inteiro → todo músculo 2×", () => {
  const i = inp({ profile: prof({ daysUsual: ["seg", "qua", "sex"], daysTarget: 3 }) });
  const w = planWeek(i), v = weekView(i, w);
  assert.deepEqual([0, 2, 4].map((k) => groupsOf(day(w, k).plan).join()), ["sup", "inf", "inf,sup"]);
  assert.equal(day(w, 4).plan!.name, "Corpo inteiro");
  // o que não coube nos 60 min fica escrito; o resto (e toda prioridade) pega 2×
  for (const m of MUSCLE_IDS) if (!day(w, 4).plan!.dropped.includes(m)) assert.ok((v.projected.freq[m] ?? 0) >= 2, m);
  for (const m of PRIOS) assert.ok((v.projected.freq[m] ?? 0) >= 2, m);
  const longo = inp({ profile: prof({ daysUsual: ["seg", "qua", "sex"], daysTarget: 3, minutes: 90 }) });
  const v90 = weekView(longo, planWeek(longo));
  for (const m of MUSCLE_IDS) assert.ok((v90.projected.freq[m] ?? 0) >= 2, `${m} com 90 min`);
});

test("semana de 5 dias: nunca o mesmo grupo em dias seguidos (48 h)", () => {
  const i = inp({ profile: prof({ daysUsual: ["seg", "ter", "qua", "qui", "sex"], daysTarget: 5 }) });
  const w = planWeek(i);
  const g = [0, 1, 2, 3, 4].map((k) => groupsOf(day(w, k).plan).join());
  for (let k = 1; k < 5; k++) assert.notEqual(g[k], g[k - 1], `${g}`);
  for (const d of w.days) assert.deepEqual(d.warn, []);
  for (const m of MUSCLE_IDS) assert.ok((weekView(i, w).projected.freq[m] ?? 0) >= 2, m);
});

test("meta maior que os dias habituais: completa com o dia mais afastado", () => {
  assert.deepEqual(trainingDows(["seg", "qua"], 3), ["seg", "qua", "sex"]);
  assert.deepEqual(trainingDows(["seg", "ter", "qui", "sex"], 3), ["seg", "ter", "qui", "sex"], "nunca tira dia habitual: o app supõe que você vai");
});

test("falta na terça: aviso pendente; 'não fui' leva o inferior para quinta; 'fui e esqueci' mantém", () => {
  const w0 = planWeek(inp());
  const ctx = { today: D[3], sets: did(w0, [0]), prev: w0 };
  const pend = weekView(inp(ctx), planWeek(inp(ctx)));
  assert.deepEqual(pend.misses, [D[1]], "terça passou sem treino e sem resposta");
  assert.equal(pend.days[1].status, "pendente");

  const miss = replanAfterMiss(inp(ctx), D[1], "nao_fui");
  const v = weekView(inp({ ...ctx, attendance: { [D[1]]: "nao_fui" } }), miss);
  assert.equal(v.days[1].status, "faltou");
  assert.deepEqual(v.misses, []);
  assert.deepEqual(groupsOf(miss.days[3].plan), ["inf"], "quinta vira inferior");
  const infAfter = INF.reduce((a, m) => a + (miss.days[3].plan!.perMuscle[m] ?? 0) + (miss.days[4].plan!.perMuscle[m] ?? 0), 0);
  const infBefore = INF.reduce((a, m) => a + (w0.days[3].plan!.perMuscle[m] ?? 0) + (w0.days[4].plan!.perMuscle[m] ?? 0), 0);
  assert.ok(infAfter > infBefore, `inferior redistribuído: ${infBefore} → ${infAfter}`);

  const fui = replanAfterMiss(inp(ctx), D[1], "fui");
  assert.deepEqual(groupsOf(fui.days[3].plan), ["sup"], "fui e esqueci: conta o planejado, quinta segue superior");
  assert.equal(weekView(inp({ ...ctx, attendance: { [D[1]]: "fui" } }), fui).days[1].status, "feito");
});

test("treino extra no sábado: respeita 48 h (nada de superior depois de sexta superior) e não dobra o volume", () => {
  const w0 = planWeek(inp());
  // seg sup ✓, ter inf ✓, qui faltou, sex fez superior
  const sets = { ...did(w0, [0, 1]), [D[4]]: { ...w0.days[0].plan!.perMuscle } };
  const i = inp({ today: D[5], sets, attendance: { [D[3]]: "nao_fui" }, prev: w0 });
  const v = weekView(i, planWeek(i));
  assert.equal(v.days[5].status, "livre");
  const x = v.extraToday!;
  assert.ok(x.items.length > 0);
  assert.match(x.name, /^Extra/);
  for (const it of x.items) assert.equal(MUSCLES[it.muscle].group, "inf", `${it.muscle} treinou ontem`);
  for (const m of MUSCLE_IDS) {
    const done = Object.values(sets).reduce((a, s) => a + (s[m] ?? 0), 0);
    assert.ok(done + (x.perMuscle[m] ?? 0) <= Math.max(done, T[m]), `${m}: ${done} + ${x.perMuscle[m]} > ${T[m]}`);
  }
});

test("treino extra no meio da semana bloqueia o músculo de amanhã e o resto se reorganiza", () => {
  // quarta livre: terça foi inferior (ontem) e quinta é superior (amanhã) → nada recuperado → descanso
  const w0 = planWeek(inp());
  const i = inp({ today: D[2], sets: did(w0, [0, 1]), prev: w0 });
  const x = weekView(i, planWeek(i)).extraToday!;
  assert.equal(x.items.length, 0);
  assert.match(x.name, /descanso/);
  // virou "extra" pedido: o plano da semana reserva o dia e quinta/sexta continuam válidas
  const r = applyDayAction(planWeek(i), {}, { type: "extra", date: D[2] }, i);
  assert.ok("overrides" in r);
  const w = planWeek({ ...i, overrides: r.overrides });
  assert.equal(w.days[2].kind, "extra");
  assert.deepEqual(w.days[3].warn, []);
});

test("semana fechada → extra vira bônus curto só de prioridades (máx. +4 por músculo)", () => {
  const sets: Record<string, Sets> = { [D[0]]: Object.fromEntries(MUSCLE_IDS.map((m) => [m, T[m]])) as Sets };
  const x = extraSession({
    targets: T, done: sets[D[0]], freq: Object.fromEntries(MUSCLE_IDS.map((m) => [m, 2])), priorities: PRIOS, minutes: 60,
    equipment: ALL, blocked: [],
  });
  assert.match(x.name, /bônus/);
  assert.ok(x.items.length > 0);
  for (const it of x.items) assert.ok(PRIOS.includes(it.muscle), it.muscle);
  for (const m of PRIOS) assert.ok((x.perMuscle[m] ?? 0) <= Math.min(3, BONUS_MAX), m);
  const over = extraSession({ targets: T, done: { ...sets[D[0]], ombro: T.ombro + BONUS_MAX, biceps: T.biceps + BONUS_MAX, triceps: T.triceps + BONUS_MAX }, freq: {}, priorities: PRIOS, minutes: 60, equipment: ALL, blocked: [] });
  assert.equal(over.items.length, 0, "bônus esgotado: não passa de +4");
});

test("compensatório: oferecido quando sobra 1 treino e um grupo fica < 2× sem dia que cubra", () => {
  const w0 = planWeek(inp());
  const i = inp({ today: D[4], sets: did(w0, [0, 1]), attendance: { [D[3]]: "nao_fui" }, prev: w0 });
  const w = planWeek(i);
  const o = compensatoryOffer(i, w)!;
  assert.ok(o, "oferecido");
  assert.equal(o.date, D[4]);
  const covered = Object.keys(w.days[4].plan!.perMuscle);
  for (const m of o.muscles) assert.ok(!covered.includes(m), `${m} já está na sexta`);
  assert.ok(o.coveredWith.length > 0, "o compensatório dá o 2º estímulo a quem falta");
  for (const k of [o.outWith, o.outWithout, o.outExpress]) assert.ok(Number.isInteger(k) && k >= 0);
  assert.match(o.why, /Sobrou só 1 treino/);
  // "deixar a semana fechar assim" some com a oferta; e a semana seguinte não dobra (targets não mudam por falta)
  const r = applyDayAction(w, {}, { type: "manter", date: D[4] }, i);
  assert.ok("overrides" in r);
  assert.equal(compensatoryOffer(i, planWeek({ ...i, overrides: r.overrides })), null);
});

test("compensatório: NÃO oferecido com 2+ treinos pela frente", () => {
  const w0 = planWeek(inp());
  const i = inp({ today: D[1], sets: did(w0, [0]), prev: w0 });
  assert.equal(compensatoryOffer(i, planWeek(i)), null);
});

test("compensatório: NÃO oferecido no último dia quando todo músculo já tem 2×", () => {
  const p = prof({ daysUsual: ["seg", "ter", "qua", "qui", "sex"], daysTarget: 5 });
  const w0 = planWeek(inp({ profile: p }));
  const i = inp({ profile: p, today: D[4], sets: did(w0, [0, 1, 2, 3]), prev: w0 });
  assert.equal(compensatoryOffer(i, planWeek(i)), null);
});

test("trocar a geração, mover e trocar dias; dia que já passou não muda", () => {
  const i = inp({ today: D[1] });
  const w = planWeek(i);
  const g = applyDayAction(w, {}, { type: "gerar", date: D[3], opts: { focus: ["ombro"], minutes: 45 } }, i);
  assert.ok("overrides" in g);
  const w2 = planWeek({ ...i, overrides: g.overrides });
  assert.match(w2.days[3].plan!.name, /Foco: ombro/);
  assert.equal(w2.days[3].plan!.items[0].muscle, "ombro");
  assert.equal(w2.days[3].source, "voce");

  const mv = applyDayAction(w, {}, { type: "mover", date: D[3], to: D[5] }, i);
  assert.ok("overrides" in mv);
  const w3 = planWeek({ ...i, overrides: mv.overrides });
  assert.equal(w3.days[3].kind, "folga");
  assert.equal(w3.days[5].kind, "treino");
  assert.ok(w3.days[5].plan!.items.length > 0);

  const sw = applyDayAction(w2, g.overrides, { type: "trocar", date: D[3], to: D[4] }, i);
  assert.ok("overrides" in sw);
  assert.match(planWeek({ ...i, overrides: sw.overrides }).days[4].plan!.name, /Foco: ombro/);

  assert.deepEqual(applyDayAction(w, {}, { type: "folga", date: D[0] }, i), { error: "esse dia já passou ou já tem treino registrado" });
  assert.ok("error" in applyDayAction(w, {}, { type: "mover", date: D[3], to: D[4] }, i), "destino ocupado → trocar");
});

test("foco escolhido em dias seguidos do mesmo grupo gera aviso de 48 h (escolha respeitada)", () => {
  const i = inp();
  const w = planWeek({ ...i, overrides: { [D[1]]: { kind: "treino", opts: { split: "sup" } } } });
  assert.deepEqual(groupsOf(w.days[1].plan), ["sup"]);
  assert.match(w.days[1].warn[0], /Menos de 48 h/);
});

test("regenerar com diff: mostra o que muda por dia", () => {
  const i = inp();
  const a = planWeek(i);
  const b = planWeek({ ...i, profile: prof({ minutes: 40 }) });
  const d = diffWeeks(a, b);
  assert.ok(d.length > 0);
  assert.ok(d.every((x) => x.lines.length > 0 || x.before !== x.after));
  assert.deepEqual(diffWeeks(a, a), []);
  const f = diffWeeks(a, planWeek({ ...i, overrides: { [D[4]]: { kind: "folga" } } })).find((x) => x.date === D[4])!;
  assert.equal(f.after, "folga");
  assert.ok(f.lines.every((l) => l.startsWith("−")));
});

// ---------- ajuste de volume e deload ----------
test("ajuste: pouca dor + progrediu → +1 série, com o motivo escrito", () => {
  const r = adjustVolume(T, {}, { triceps: { soreness: 0, perf: "subiu", pump: 1.5, freq: 2 } });
  assert.equal(r.targets.triceps, T.triceps + 1);
  assert.deepEqual(r.changes.map((c) => c.text), ["+1 série de tríceps: pouca dor, progrediu"]);
  const two = adjustVolume(T, {}, { ombro: { soreness: 0, perf: "subiu", pump: 0.2, freq: 2 } });
  assert.equal(two.changes[0].text, "+2 séries de ombro lateral: pouca dor, progrediu, pump baixo");
});

test("ajuste: dor residual alta ou queda → −1/−2; sem 2× não sobe; limites 4–20", () => {
  assert.deepEqual(volumeDelta({ soreness: 2, perf: "subiu", freq: 2 }), { delta: -1, reasons: ["muita dor residual"] });
  assert.equal(volumeDelta({ soreness: 2, perf: "caiu", freq: 2 }).delta, -2);
  assert.equal(volumeDelta({ soreness: 0, perf: "subiu", pump: 0, freq: 1 }).delta, 0, "2× antes de volume");
  const top = adjustVolume({ ...T, triceps: 20 }, {}, { triceps: { soreness: 0, perf: "subiu", freq: 2 } });
  assert.equal(top.targets.triceps, 20); assert.equal(top.changes.length, 0);
  const low = adjustVolume({ ...T, core: 4 }, {}, { core: { soreness: 2, freq: 2 } });
  assert.equal(low.targets.core, 4);
  // ajuste acumula pelas semanas (offsets)
  assert.equal(adjustVolume(T, { triceps: 2 }, {}).targets.triceps, T.triceps + 2);
});

test("deload: fim do bloco, 3 estagnados ou 2 semanas 'segurar'; volume ×0,6 e sem ajuste por feedback", () => {
  assert.equal(deloadCheck({ weeksSinceDeload: 4, stalledExercises: 0, holdWeeks: 0 }).on, true);
  assert.equal(deloadCheck({ weeksSinceDeload: 2, stalledExercises: 3, holdWeeks: 0 }).on, true);
  assert.equal(deloadCheck({ weeksSinceDeload: 1, stalledExercises: 0, holdWeeks: 2 }).on, true);
  assert.equal(deloadCheck({ weeksSinceDeload: 3, stalledExercises: 2, holdWeeks: 1 }).on, false);
  const hold = { sleepH: 5 as const, energy: 1 as const, soreness: 2 as const, stress: 3 as const };
  const ok = { sleepH: 8 as const, energy: 3 as const, soreness: 0 as const, stress: 1 as const };
  assert.equal(holdWeeks([[hold, hold, ok], [hold, hold], [ok, ok]]), 2);
  const p = weekProgression({ base: T, prevWeeks: [{}, {}, {}, {}], checkinsByWeek: [], pump: { triceps: [0] }, freq: { triceps: 2 }, e1rm: [] });
  assert.equal(p.deload.on, true);
  assert.match(p.deload.reason!, /Fim do bloco/);
  assert.equal(p.targets.costas, Math.round(T.costas * 0.6));
  assert.deepEqual(p.changes, []);
});

test("progressão da semana: e1RM subiu + pouca dor → +1 tríceps com motivo; estagnação conta", () => {
  const e1rm = [
    { exerciseId: "Cable_Rope_Overhead_Triceps_Extension", muscle: "triceps" as MuscleId, week: 1, value: 26 },
    { exerciseId: "Cable_Rope_Overhead_Triceps_Extension", muscle: "triceps" as MuscleId, week: 0, value: 28 },
  ];
  assert.equal(perfByMuscle(e1rm).triceps, "subiu");
  const ok = { sleepH: 8 as const, energy: 3 as const, soreness: 0 as const, stress: 1 as const };
  const p = weekProgression({ base: T, prevWeeks: [{ offsets: {} }], checkinsByWeek: [[ok, ok, ok]], pump: { triceps: [1, 2] }, freq: { triceps: 2 }, e1rm });
  assert.equal(p.deload.on, false);
  assert.equal(p.targets.triceps, T.triceps + 1);
  assert.deepEqual(p.changes.map((c) => c.text), ["+1 série de tríceps: pouca dor, progrediu"]);
  assert.equal(p.offsets.triceps, 1);
  const flat = Array.from({ length: 5 }, (_, k) => ["A", "B", "C"].map((id) => ({ exerciseId: id, muscle: "peito" as MuscleId, week: 4 - k, value: 50 }))).flat();
  assert.equal(weekProgression({ base: T, prevWeeks: [{}, {}], checkinsByWeek: [], pump: {}, freq: {}, e1rm: flat }).deload.on, true);
});

test("semana planejada usa os alvos ajustados (deload planeja menos séries)", () => {
  const i = inp();
  const full = weekView(i, planWeek(i)).projected.done;
  const p = weekProgression({ base: T, prevWeeks: [{}, {}, {}, {}], checkinsByWeek: [], pump: {}, freq: {}, e1rm: [] });
  const dl = weekView({ ...i, targets: p.targets }, planWeek({ ...i, targets: p.targets })).projected.done;
  assert.ok(MUSCLE_IDS.reduce((a, m) => a + (dl[m] ?? 0), 0) < MUSCLE_IDS.reduce((a, m) => a + (full[m] ?? 0), 0));
  assert.equal(SUP.length + INF.length, MUSCLE_IDS.length);
});
