import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EQUIPMENT, EXERCISES, EXERCISE_BY_ID, planDay, weeklyTargets, resolveSession, MAX_SESSION_MS,
  exerciseOutcome, startLoad, nextTarget, stalled, hydrate, validateItems, applyManualEdit,
  readiness, coverage, weekDates, mondayOf, classify, fmtClock,
} from "../src/index.ts";
import type { DayInput, MuscleId } from "../src/index.ts";

const ALL = EQUIPMENT.map((e) => e.id);
const PRIOS: MuscleId[] = ["ombro", "biceps", "triceps"];
// Cenário do protótipo: seg Superior A, ter Inferior A, hoje quinta.
const base = (o: Partial<DayInput> = {}): DayInput => ({
  targets: weeklyTargets(1, PRIOS),
  done: { peito: 6, costas: 7, ombro: 6, post: 2, biceps: 5, triceps: 4, quad: 6, isquio: 4, gluteo: 3, pant: 3, core: 2 },
  freq: { peito: 1, costas: 1, ombro: 1, post: 1, biceps: 1, triceps: 1, quad: 1, isquio: 1, gluteo: 1, pant: 1, core: 1 },
  priorities: PRIOS, daysLeft: 1, minutes: 60, lastGroup: "inf", mode: "normal", equipment: ALL, ...o,
});

test("catálogo: todo exercício usa aparelho existente; IDs únicos", () => {
  const eq = new Set(ALL);
  for (const e of EXERCISES) for (const q of e.eq) assert.ok(eq.has(q), `${e.id} → ${q}`);
  assert.equal(new Set(EXERCISES.map((e) => e.id)).size, EXERCISES.length);
});

test("1 dia restante, modo normal: segue o próximo grupo e SUGERE compensatório (não gera sozinho)", () => {
  const p = planDay(base());
  assert.deepEqual(p.groups, ["sup"]);
  assert.equal(p.mode, "normal");
  assert.equal(p.suggestCompensatory, true);
  assert.ok(p.items.every((i) => ["peito", "costas", "ombro", "post", "biceps", "triceps"].includes(i.muscle)));
});

test("compensatório só quando pedido: corpo inteiro, cabe em 60 min, prioridades primeiro", () => {
  const p = planDay(base({ mode: "compensatorio" }));
  assert.deepEqual(p.groups, ["sup", "inf"]);
  assert.ok(p.setsTotal <= 20, `séries ${p.setsTotal}`);
  assert.ok(PRIOS.includes(p.items[0].muscle));
  for (const m of PRIOS) assert.ok((p.perMuscle[m] ?? 0) >= 2, m);
  assert.ok(p.items.some((i) => i.muscle === "quad"));
});

test("2 dias restantes: superior hoje com volume dividido", () => {
  const p = planDay(base({ daysLeft: 2 }));
  assert.deepEqual(p.groups, ["sup"]);
  assert.equal(p.suggestCompensatory, false);
});

test("foco em ombro: ombro lateral abre o treino com ≥ 4 séries", () => {
  const p = planDay(base({ daysLeft: 3, focus: ["ombro"], lastGroup: "sup" }));
  assert.equal(p.items[0].muscle, "ombro");
  assert.ok((p.perMuscle.ombro ?? 0) >= 4);
  assert.match(p.name, /Foco/);
});

test("40 min corta não prioritários antes das prioridades", () => {
  const p = planDay(base({ mode: "compensatorio", minutes: 40 }));
  assert.ok(p.setsTotal <= 13);
  for (const m of PRIOS) assert.ok((p.perMuscle[m] ?? 0) >= 2, m);
  assert.ok(p.dropped.length > 0);
});

test("sem polia: nenhum exercício de polia; com academia cheia evita aparelhos disputados", () => {
  const p = planDay(base({ equipment: ALL.filter((e) => e !== "polia") }));
  assert.ok(p.items.every((i) => !EXERCISE_BY_ID[i.exerciseId].eq.includes("polia")));
  const c = planDay(base({ crowded: true }));
  const busy = c.items.filter((i) => EXERCISE_BY_ID[i.exerciseId].eq.some((q) => q === "polia" || q === "rack")).length;
  const normal = planDay(base()).items.filter((i) => EXERCISE_BY_ID[i.exerciseId].eq.some((q) => q === "polia" || q === "rack")).length;
  assert.ok(busy <= normal);
});

test("preferência por músculo: bíceps em máquina quando disponível", () => {
  const p = planDay(base({ prefs: { biceps: "maquina" } }));
  const b = p.items.find((i) => i.muscle === "biceps")!;
  assert.equal(b.kind, "maquina");
});

test("dor forte no ombro: bloqueia exercícios com estresse no ombro e adiciona fortalecimento", () => {
  const p = planDay(base({ pains: [{ region: "ombro_e", intensity: 3 }] }));
  for (const i of p.items) assert.equal(EXERCISE_BY_ID[i.exerciseId].joints.ombro ?? 0, 0, i.exerciseId);
  assert.ok(p.prehab.length >= 1);
});

test("dor na escápula: aquecimento com face pull ou equivalente", () => {
  const p = planDay(base({ pains: [{ region: "escapula_e", intensity: 2 }] }));
  assert.ok(p.prehab.some((x) => EXERCISE_BY_ID[x.exerciseId].prehab?.includes("escapula")));
});

test("sessão: iniciou = foi; fecha sozinha em 2 h", () => {
  const t0 = 1_000_000;
  assert.deepEqual(resolveSession({}, t0), { status: "nao_iniciado", attended: false });
  assert.equal(resolveSession({ startedAt: t0 }, t0 + 60_000).status, "em_andamento");
  const auto = resolveSession({ startedAt: t0 }, t0 + MAX_SESSION_MS + 1);
  assert.equal(auto.status, "fechado_auto");
  assert.equal(auto.attended, true);
  assert.equal(auto.endedAt, t0 + MAX_SESSION_MS);
  assert.equal(exerciseOutcome(3, 0, false), "nao_registrado");
  assert.equal(exerciseOutcome(3, 0, true), "nao_fiz");
  assert.equal(exerciseOutcome(3, 2, false), "parcial");
  assert.equal(fmtClock(3_725_000), "1:02:05");
});

test("cargas: mesmo exercício, família e calibração", () => {
  const rem = [{ exerciseId: "Barbell_Bench_Press_-_Medium_Grip", kg: 60, reps: 8, confidence: "certeza" as const }];
  const same = startLoad("Barbell_Bench_Press_-_Medium_Grip", rem, 8);
  assert.equal(same.source, "mesmo_exercicio");
  assert.ok(same.kg! < 60 && same.kg! > 45);
  const fam = startLoad("Incline_Dumbbell_Press", rem, 10);
  assert.equal(fam.source, "familia");
  assert.ok(fam.kg! >= 14 && fam.kg! <= 24, String(fam.kg));
  assert.equal(startLoad("Leg_Press", rem, 12).source, "calibrar");
  assert.deepEqual(nextTarget([{ kg: 12, reps: 12 }, { kg: 12, reps: 12 }], [8, 12], 1)!.kg, 13);
  assert.deepEqual(nextTarget([{ kg: 12, reps: 12 }, { kg: 12, reps: 9 }], [8, 12], 1), { kg: 12, reps: 10, reason: "Mesma carga, +1 rep na série mais fraca." });
  assert.equal(stalled([100, 104, 103, 104, 102]), true);
  assert.equal(stalled([100, 101, 103, 105]), false);
});

test("validador: hidrata formato compacto e acusa aparelho/dor/exercício próprio", () => {
  const inp = base({ equipment: ALL.filter((e) => e !== "polia"), pains: [{ region: "cotovelo_d", intensity: 3 }] });
  const { items, issues } = hydrate([
    { id: "Incline_Dumbbell_Curl", sets: 3 },
    { id: "Cable_Rope_Overhead_Triceps_Extension", sets: 3 },
    { id: "rosca_spider_do_ze", sets: 3, nm: "Rosca spider", muscle: "biceps" },
    { id: "nao_existe", sets: 2 },
  ], inp);
  assert.equal(items.length, 3);
  assert.ok(issues.some((i) => i.code === "proprio"));
  assert.ok(issues.some((i) => i.code === "id_desconhecido"));
  const v = validateItems(items, inp);
  assert.ok(v.some((i) => i.code === "aparelho"));
  assert.ok(v.some((i) => i.code === "dor"));
});

test("edição manual aplica na hora e pede revisão", () => {
  const inp = base({ daysLeft: 2 });
  const plan = planDay(inp);
  const r = applyManualEdit(plan, { index: 0, exerciseId: "Side_Lateral_Raise", sets: 4 }, inp);
  assert.equal(r.plan.items[0].exerciseId, "Side_Lateral_Raise");
  assert.equal(r.plan.items[0].manual, true);
  assert.equal(r.needsReview, true);
});

test("check-in: prontidão, cobertura da semana, datas", () => {
  assert.equal(readiness({ sleepH: 8, energy: 3, soreness: 0, stress: 1 }).label, "pronto");
  assert.equal(readiness({ sleepH: 5, energy: 1, soreness: 2, stress: 3 }).label, "segurar");
  assert.equal(mondayOf("2026-11-12"), "2026-11-09");
  const dates = weekDates("2026-11-09");
  assert.equal(dates[6], "2026-11-15");
  const cov = coverage([{ date: "2026-11-09" }, { date: "2026-11-11" }], dates, "2026-11-12");
  assert.deepEqual(cov, { filled: 2, due: 4, missing: ["2026-11-10", "2026-11-12"] });
});

test("classificador de pedidos escolhe o modelo", () => {
  assert.deepEqual(classify("senti dor na escápula esquerda"), { action: "dor", tier: "opus" });
  assert.deepEqual(classify("comi 3 ovos e pão"), { action: "registrar_comida", tier: "haiku" });
  assert.deepEqual(classify("não gostei da dinâmica de hoje"), { action: "nao_gostei", tier: "sonnet" });
  assert.equal(classify("oi").tier, "sonnet");
});
