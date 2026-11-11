import { test } from "node:test";
import assert from "node:assert/strict";
import {
  setStats, bestMark, exerciseRefs, sessionVolumeVsAvg, detectPrs, sessionSummary, epley,
  sessionProgress, nextPending, nextSetIndex, adjustRest, restLeftMs, mergeSessionSets,
  checkCardio, cardioWeekSummary, cardioKcalOf,
} from "../src/index.ts";
import type { SetLog } from "../src/index.ts";

const S = (kg: number, reps: number): SetLog => ({ kg, reps });
// Dados fictícios: rosca em 5 sessões, a mais recente primeiro.
const PAST: SetLog[][] = [
  [S(12, 12), S(12, 11), S(12, 10)],   // última vez: média 11 reps, 12 kg
  [S(10, 12), S(10, 12), S(10, 11)],
  [S(10, 10), S(10, 10), S(10, 9)],
  [S(8, 12), S(8, 12)],
  [S(20, 3)],                           // 5ª: fora da janela de 4, mas conta na melhor marca
];

test("setStats: média de reps/carga, volume e melhor e1RM de uma sessão", () => {
  const s = setStats(PAST[0])!;
  assert.equal(s.n, 3);
  assert.equal(s.avgKg, 12);
  assert.equal(s.avgReps, 11);
  assert.equal(s.volume, 12 * 12 + 12 * 11 + 12 * 10);
  assert.ok(Math.abs(s.bestE1rm - epley(12, 12)) < 1e-9);
  assert.equal(setStats([]), null);
});

test("bestMark: maior e1RM entre todas as sessões, não a maior carga", () => {
  const b = bestMark(PAST)!;
  // 12×12 → e1RM 16,8; 20×3 → 22; a série de 20×3 vence por e1RM
  assert.deepEqual({ kg: b.kg, reps: b.reps }, { kg: 20, reps: 3 });
  assert.ok(Math.abs(b.e1rm - 22) < 1e-9);
  assert.equal(bestMark([]), null);
  assert.equal(bestMark([[]]), null);
});

test("exerciseRefs: última vez e média das últimas 4 (só 4 sessões entram)", () => {
  const r = exerciseRefs(PAST);
  assert.equal(r.last!.avgReps, 11);
  assert.equal(r.last!.avgKg, 12);
  assert.equal(r.avg4!.sessions, 4);
  // 4 sessões: 3+3+3+2 = 11 séries. reps: 33 + 35 + 29 + 24 = 121 → 121/11. kg: 36+30+30+16 = 112 → 112/11
  assert.ok(Math.abs(r.avg4!.avgReps - 121 / 11) < 1e-9);
  assert.ok(Math.abs(r.avg4!.avgKg - 112 / 11) < 1e-9);
  assert.equal(r.best!.kg, 20);
});

test("exerciseRefs: sem histórico devolve nulos; 1 sessão = última e média iguais", () => {
  assert.deepEqual(exerciseRefs([]), { last: null, avg4: null, best: null });
  const r = exerciseRefs([PAST[0]]);
  assert.equal(r.avg4!.sessions, 1);
  assert.equal(r.avg4!.avgReps, r.last!.avgReps);
});

test("exerciseRefs: ignora séries sem repetição (0 reps) e sessões vazias", () => {
  const r = exerciseRefs([[S(10, 0)], [], PAST[1]]);
  assert.equal(r.last!.avgKg, 10);
  assert.equal(r.avg4!.sessions, 1);
});

test("avg4 volume: média do volume por sessão", () => {
  const r = exerciseRefs(PAST);
  const vols = [432 + 0, 120 + 120 + 110, 100 + 100 + 90, 8 * 12 * 2];
  vols[0] = 12 * 12 + 12 * 11 + 12 * 10;
  assert.equal(r.avg4!.avgVolume, vols.reduce((a, b) => a + b, 0) / 4);
});

test("sessionVolumeVsAvg: soma só os exercícios com histórico e dá a diferença em %", () => {
  const cur = { rosca: [S(12, 12), S(12, 12), S(12, 12)], novo: [S(5, 10)] };
  const past = { rosca: [[S(12, 10), S(12, 10), S(12, 10)], [S(10, 10), S(10, 10), S(10, 10)]] };
  const v = sessionVolumeVsAvg(cur, past);
  assert.equal(v.current, 12 * 12 * 3 + 50);
  assert.equal(v.avg4, (360 + 300) / 2);
  assert.equal(v.comparable, 432);
  assert.equal(v.pct, Math.round((432 / 330 - 1) * 100)); // +31
  assert.equal(sessionVolumeVsAvg({ x: [S(1, 1)] }, {}).pct, null);
});

test("sessionVolumeVsAvg: treino pela metade compara por série, não pelo total", () => {
  const past = { rosca: [[S(10, 10), S(10, 10), S(10, 10), S(10, 10)]] };       // 400 kg em 4 séries = 100/série
  assert.equal(sessionVolumeVsAvg({ rosca: [S(10, 10)] }, past).pct, 0);        // 1 série igual à média: 0%, não −75%
  assert.equal(sessionVolumeVsAvg({ rosca: [S(11, 10), S(11, 10)] }, past).pct, 10);
});

test("detectPrs: e1RM e carga novos; sem histórico não é recorde; corporal compara reps", () => {
  assert.deepEqual(detectPrs([], [S(10, 10)]), []);
  const prs = detectPrs([[S(10, 10), S(10, 9)]], [S(12, 8)]);
  assert.deepEqual(prs.map((p) => p.kind).sort(), ["carga", "e1rm"]);
  assert.equal(prs.find((p) => p.kind === "carga")!.value, 12);
  assert.equal(prs.find((p) => p.kind === "carga")!.prev, 10);
  assert.deepEqual(detectPrs([[S(10, 10)]], [S(10, 10)]), []);
  assert.deepEqual(detectPrs([[S(10, 10)]], [S(10, 9)]), []);
  const bw = detectPrs([[S(0, 8), S(0, 9)]], [S(0, 11)]);
  assert.deepEqual(bw.map((p) => p.kind), ["reps"]);
});

test("sessionSummary: duração, séries, volume, PRs e médias vs última vez", () => {
  const cur = { rosca: [S(12, 12), S(12, 12)], tri: [S(20, 10)] };
  const past = { rosca: PAST, tri: [[S(20, 12)]] };
  const s = sessionSummary(90 * 60e3, cur, past);
  assert.equal(s.durationMs, 5400000);
  assert.equal(s.sets, 3);
  assert.equal(s.volume, 288 + 200);
  const r = s.perExercise.find((x) => x.exerciseId === "rosca")!;
  assert.equal(r.avgReps, 12);
  assert.equal(r.lastAvgReps, 11);
  assert.equal(r.deltaReps, 1);
  assert.equal(r.deltaKg, 0);
  assert.equal(s.perExercise.find((x) => x.exerciseId === "tri")!.deltaReps, -2);
  assert.ok(Array.isArray(s.prs));
});

test("sessionProgress: 3 de 8 exercícios · 11/24 séries; pulados saem do total", () => {
  const items = [{ exerciseId: "a", sets: 3 }, { exerciseId: "b", sets: 3 }, { exerciseId: "c", sets: 3 }];
  const done = (n: number, t: number) => Array.from({ length: t }, (_, i) => ({ done: i < n }));
  const p = sessionProgress(items, { a: done(3, 3), b: done(1, 3) }, {});
  assert.deepEqual(p, { exDone: 1, exTotal: 3, setsDone: 4, setsTotal: 9 });
  const q = sessionProgress(items, { a: done(3, 3) }, { c: "dor" });
  assert.deepEqual(q, { exDone: 2, exTotal: 3, setsDone: 3, setsTotal: 6 });
  const extra = sessionProgress([{ exerciseId: "a", sets: 2 }], { a: done(3, 3) }, {});
  assert.deepEqual(extra, { exDone: 1, exTotal: 1, setsDone: 3, setsTotal: 3 }, "+ série aumenta o total");
});

test("nextPending e nextSetIndex: voltam ao exercício e à série certos", () => {
  const items = [{ exerciseId: "a", sets: 2 }, { exerciseId: "b", sets: 2 }, { exerciseId: "c", sets: 2 }];
  const logs = { a: [{ done: true }, { done: true }], b: [{ done: true }, { done: false }] };
  assert.equal(nextPending(items, logs, {}, 0), 1);
  assert.equal(nextPending(items, logs, { b: "dor" }, 0), 2);
  assert.equal(nextPending(items, logs, {}, 2), 2);
  assert.equal(nextPending(items, { ...logs, b: [{ done: true }, { done: true }], c: [{ done: true }, { done: true }] }, {}, 0), -1);
  assert.equal(nextPending(items, logs, {}, 1, true), 2, "após concluir, procura a partir do próximo");
  assert.equal(nextSetIndex(logs.b), 1);
  assert.equal(nextSetIndex(logs.a), -1);
  assert.equal(nextSetIndex(undefined), 0);
});

test("descanso: +15/−15, pular e restante (o relógio manda, não o intervalo)", () => {
  const now = 1_000_000;
  const r = { until: now + 45_000, fired: false };
  assert.equal(restLeftMs(r, now), 45_000);
  assert.equal(restLeftMs(null, now), 0);
  assert.equal(adjustRest(r, 15_000, now)!.until, now + 60_000);
  assert.equal(adjustRest(r, -15_000, now)!.until, now + 30_000);
  assert.equal(adjustRest(r, -45_000, now), null, "zerou = acabou");
  assert.equal(adjustRest({ until: now - 5000, fired: true }, 15_000, now)!.until, now + 15_000, "venceu: +15 recomeça de agora");
  assert.equal(adjustRest({ until: now - 5000, fired: true }, 15_000, now)!.fired, false);
});

test("mergeSessionSets: recarregar restaura as séries do servidor sem apagar as locais", () => {
  const server = [{ exerciseId: "a", setNo: 1, kg: 10, reps: 12 }, { exerciseId: "a", setNo: 2, kg: 10, reps: 11 }, { exerciseId: "b", setNo: 1, kg: 5, reps: 15 }];
  const fromEmpty = mergeSessionSets({}, server);
  assert.deepEqual(fromEmpty.a.map((l) => l.done), [true, true]);
  assert.equal(fromEmpty.b[0].reps, 15);
  const local = { a: [{ kg: "10", reps: "12", done: true }, { kg: "11", reps: "9", done: false }] };
  const m = mergeSessionSets(local, server);
  assert.equal(m.a[1].done, false, "série local ainda não concluída fica como está");
  assert.equal(m.a[1].kg, "11");
  assert.equal(m.b[0].done, true);
  assert.notEqual(m, local, "não muta a entrada");
  assert.equal(local.a.length, 2);
});

test("cardio: regras do registro", () => {
  assert.equal(checkCardio({ type: "Running_Treadmill", minutes: 30, intensity: "zona2", distanceKm: 4.2 }), null);
  assert.match(checkCardio({ type: "x'; DROP TABLE cardio_log;--", minutes: 30, intensity: "zona2" })!, /tipo/);
  assert.match(checkCardio({ type: "Running_Treadmill", minutes: 0, intensity: "zona2" })!, /minutos/);
  assert.match(checkCardio({ type: "Running_Treadmill", minutes: 301, intensity: "zona2" })!, /minutos/);
  assert.match(checkCardio({ type: "Running_Treadmill", minutes: 20, intensity: "forte" as any })!, /intensidade/);
  assert.match(checkCardio({ type: "Elliptical_Trainer", minutes: 20, intensity: "zona2", distanceKm: 3 })!, /distância/);
  assert.match(checkCardio({ type: "Running_Treadmill", minutes: 20, intensity: "zona2", distanceKm: 0 })!, /distância/);
});

test("cardio: resumo da semana soma sessões, minutos, km e kcal só dentro do intervalo", () => {
  const rows = [
    { id: "1", date: "2026-11-02", type: "Running_Treadmill", minutes: 30, intensity: "moderado" as const, distanceKm: 4 },
    { id: "2", date: "2026-11-04", type: "Bicycling_Stationary", minutes: 45, intensity: "zona2" as const, distanceKm: null },
    { id: "3", date: "2026-11-09", type: "Running_Treadmill", minutes: 20, intensity: "zona2" as const, distanceKm: 3 },
  ];
  const w = cardioWeekSummary(rows, "2026-11-02", "2026-11-08", 72);
  assert.equal(w.sessions, 2);
  assert.equal(w.minutes, 75);
  assert.equal(w.km, 4);
  assert.equal(w.byType.Running_Treadmill.minutes, 30);
  assert.equal(w.kcal, cardioKcalOf(rows[0], 72) + cardioKcalOf(rows[1], 72));
  assert.ok(cardioKcalOf(rows[0], 72) > 200);
  assert.deepEqual(cardioWeekSummary([], "2026-11-02", "2026-11-08", 72), { sessions: 0, minutes: 0, km: 0, kcal: 0, byType: {} });
});
