// #125 Banco de alternativas fixas (fonte única do Trocar) e superséries pareadas de verdade (podeParear, par A1/A2).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BANCO_ALTERNATIVAS, EQUIPMENT, EXERCISES, EXERCISE_BY_ID, alternativas, desparear, hydrate, idsAlternativas, partePrincipal,
  parear, parearItens, planDay, podeParear, motivoSemPar, topAlternativas, validarPares, weeklyTargets,
} from "../src/index.ts";
import type { DayInput, MuscleId, PlanItem } from "../src/index.ts";

const ALL = EQUIPMENT.map((e) => e.id);
const EXCLUIDO = "Scapular_Pull-Up"; // só aquecimento: a regra da #74 nunca o oferece

// ---------- 1. validação do banco ----------
test("banco: IDs existem, mesma subparte principal, sem planOff, sem repetir, até 6 e ≥ 2 quando o catálogo permite", () => {
  for (const [de, lista] of Object.entries(BANCO_ALTERNATIVAS)) {
    const ex = EXERCISE_BY_ID[de];
    assert.ok(ex, `${de} não está no catálogo`);
    assert.ok(lista.length <= 6, `${de}: no máximo 6`);
    assert.equal(new Set(lista.map(([id]) => id)).size, lista.length, `${de}: repetido`);
    for (const [id, motivo] of lista) {
      const a = EXERCISE_BY_ID[id];
      assert.ok(a, `${de} → ${id} não está no catálogo`);
      assert.notEqual(id, de, `${de}: ele mesmo`);
      assert.ok(!a.planOff, `${de} → ${id} é planOff`);
      assert.notEqual(id, EXCLUIDO);
      assert.equal(partePrincipal(a), partePrincipal(ex), `${de} → ${id}: subparte ${partePrincipal(a)} ≠ ${partePrincipal(ex)}`);
      assert.ok(motivo.length >= 8 && motivo.length <= 70, `${de} → ${id}: motivo curto e claro`);
    }
  }
  // todo exercício de força que entra na montagem tem lista; mínimo de 2 quando existem 2 no catálogo
  for (const ex of EXERCISES.filter((e) => !e.planOff && e.id !== EXCLUIDO)) {
    const lista = BANCO_ALTERNATIVAS[ex.id];
    assert.ok(lista, `${ex.id} sem lista no banco`);
    const possiveis = EXERCISES.filter((e) => e.id !== ex.id && !e.planOff && e.id !== EXCLUIDO && partePrincipal(e) === partePrincipal(ex)).length;
    assert.ok(lista.length >= Math.min(2, possiveis), `${ex.id}: ${lista.length} alternativas, o catálogo permite ${possiveis}`);
  }
});

test("banco: exemplos do dono (rosca inclinada → bayesiana antes da martelo; lateral com halter → cabo, inclinada)", () => {
  const ids = (id: string) => BANCO_ALTERNATIVAS[id].map(([x]) => x);
  assert.equal(ids("Incline_Dumbbell_Curl")[0], "Standing_Biceps_Cable_Curl");
  assert.ok(!ids("Incline_Dumbbell_Curl").includes("Hammer_Curls"), "martelo é outra porção (braquial)");
  assert.deepEqual(ids("Side_Lateral_Raise").slice(0, 3), ["Cable_Seated_Lateral_Raise", "Standing_Low-Pulley_Deltoid_Raise", "One-Arm_Incline_Lateral_Raise"]);
});

// ---------- 2. alternativas() lê o banco ----------
test("alternativas: mesma subparte principal, na ordem do banco, e o filtro da academia manda o que falta para 'precisa de aparelho'", () => {
  const alt = alternativas("Side_Lateral_Raise", { equipment: ALL });
  assert.ok(alt.mesmaParte.every((a) => partePrincipal(a.ex) === "ombro_lat"));
  const banco = BANCO_ALTERNATIVAS.Side_Lateral_Raise.map(([id]) => id);
  assert.deepEqual(alt.mesmaParte.slice(0, banco.length).map((a) => a.ex.id), banco, "banco primeiro, na ordem");
  assert.equal(alt.mesmaParte[0].motivo, BANCO_ALTERNATIVAS.Side_Lateral_Raise[0][1]);
  // academia só com halteres e banco: o que pede polia/elástico sai da lista e vai para semAparelho
  const casa = alternativas("Side_Lateral_Raise", { equipment: ["halteres", "banco"] });
  for (const a of casa.mesmaParte) assert.ok(a.ex.eq.every((q) => ["halteres", "banco"].includes(q)), `${a.ex.id} sem aparelho`);
  assert.deepEqual(casa.mesmaParte.map((a) => a.ex.id).slice(0, 2), ["One-Arm_Incline_Lateral_Raise", "Seated_Side_Lateral_Raise"]);
  for (const id of ["Cable_Seated_Lateral_Raise", "Standing_Low-Pulley_Deltoid_Raise", "Lateral_Raise_-_With_Bands"]) assert.ok(casa.semAparelho.some((e) => e.id === id), id);
  assert.equal(casa.semAparelho[0].id, "Cable_Seated_Lateral_Raise", "precisa de aparelho também na ordem do banco");
});

test("alternativas: 'nunca' sai, dor vai para o fim (marcada) e o que a pessoa já faz sobe; top 3 pula a dor", () => {
  const nunca = alternativas("Side_Lateral_Raise", { equipment: ALL, avoid: ["Cable_Seated_Lateral_Raise"] });
  assert.ok(!nunca.mesmaParte.some((a) => a.ex.id === "Cable_Seated_Lateral_Raise"));
  assert.ok(!nunca.semAparelho.some((e) => e.id === "Cable_Seated_Lateral_Raise"));
  // dor leve no cotovelo: tríceps testa (estresse 3 no cotovelo) fica no fim, marcado, e o top 3 não o traz
  const dor = alternativas("Cable_Rope_Overhead_Triceps_Extension", { equipment: ALL, pains: [{ region: "cotovelo_d", intensity: 1 }] });
  const i = dor.mesmaParte.findIndex((a) => a.blockedByPain);
  assert.ok(i > 0 && dor.mesmaParte.slice(i).every((a) => a.blockedByPain), "bloqueados por dor no fim");
  assert.ok(topAlternativas(dor, 3).every((a) => !a.blockedByPain));
  const fam = alternativas("Side_Lateral_Raise", { equipment: ALL, familiar: ["Seated_Side_Lateral_Raise"] });
  assert.equal(fam.mesmaParte[0].ex.id, "Seated_Side_Lateral_Raise");
  assert.ok(fam.mesmaParte[0].familiar);
});

test("alternativas: banco esgotado pela academia cai na regra da #74 (outra parte do grupo) com motivo", () => {
  // rosca martelo só tem a martelo no cabo no banco; sem polia, a mesma parte esgota e o top 3 vem da regra
  const alt = alternativas("Hammer_Curls", { equipment: ["halteres", "banco"] });
  assert.equal(alt.mesmaParte.length, 0);
  assert.ok(alt.semAparelho.some((e) => e.id === "Cable_Hammer_Curls_-_Rope_Attachment"));
  const top = topAlternativas(alt, 3);
  assert.equal(top.length, 3);
  assert.ok(top.every((a) => a.ex.m === "biceps" && /outra parte/.test(a.motivo)), JSON.stringify(top.map((a) => [a.ex.id, a.motivo])));
  // exercício fora do banco (planOff) também cai na regra
  assert.ok(alternativas("Barbell_Shrug", { equipment: ALL }).outraParte.length > 0);
});

test("mesma lista e mesma ordem: idsAlternativas é o que o Detalhe, o Trocar e o MCP mostram (mesma academia → mesmo resultado)", () => {
  const ctx = { equipment: ["halteres", "banco", "polia", "ez"] };
  for (const id of ["Incline_Dumbbell_Curl", "Side_Lateral_Raise", "Triceps_Pushdown", "Reverse_Flyes"]) {
    const a = idsAlternativas(id, ctx), b = idsAlternativas(id, { ...ctx });
    assert.deepEqual(a, b);
    assert.deepEqual(a, alternativas(id, ctx).mesmaParte.map((x) => x.ex.id));
    assert.deepEqual(topAlternativas(alternativas(id, ctx), 3).map((x) => x.ex.id), a.slice(0, 3), id);
  }
});

// ---------- 3. podeParear ----------
test("podeParear: aceita antagonistas, superior × inferior e ombro lateral × braço; recusa o mesmo motor", () => {
  assert.equal(podeParear("Dumbbell_Bicep_Curl", "Triceps_Pushdown", ALL), true, "bíceps × tríceps");
  assert.equal(podeParear("Incline_Dumbbell_Press", "Seated_Cable_Rows", ALL), true, "peito × costas");
  assert.equal(podeParear("Side_Lateral_Raise", "Hammer_Curls", ALL), true, "ombro lateral × bíceps");
  assert.equal(podeParear("Side_Lateral_Raise", "Leg_Extensions", ALL), true, "superior × inferior");
  assert.equal(podeParear("Leg_Extensions", "Seated_Leg_Curl", ALL), true, "quadríceps × posterior");
  assert.equal(podeParear("Dumbbell_Bicep_Curl", "Hammer_Curls", ALL), false, "mesmo motor");
  assert.equal(podeParear("Triceps_Pushdown", "EZ-Bar_Skullcrusher", ALL), false, "mesmo motor");
  assert.equal(podeParear("Dumbbell_Bench_Press", "Seated_Dumbbell_Press", ALL), false, "peito × desenvolvimento: ombro anterior compete");
  assert.equal(podeParear("Chin-Up", "Dumbbell_Bicep_Curl", ALL), false, "puxada supinada já cansa o bíceps");
  assert.equal(podeParear("Dumbbell_Bicep_Curl", "Dumbbell_Bicep_Curl", ALL), false);
  assert.match(motivoSemPar("Dumbbell_Bicep_Curl", "Hammer_Curls", ALL) ?? "", /mesmo/);
  // dois aparelhos concorridos diferentes (polia e leg press): recusa; aparelho que a academia não tem: recusa
  assert.equal(podeParear("Triceps_Pushdown", "Leg_Press", ALL), false);
  assert.equal(podeParear("Triceps_Pushdown", "Standing_Biceps_Cable_Curl", ALL), true, "a mesma polia serve aos dois");
  assert.equal(podeParear("Dumbbell_Bicep_Curl", "Triceps_Pushdown", ["halteres"]), false);
  assert.equal(podeParear("cus_x", "Triceps_Pushdown", ALL), false, "fora do catálogo não pareia");
});

// ---------- 4. par no plano ----------
const it = (id: string, sets = 3, extra: Partial<PlanItem> = {}): PlanItem => {
  const e = EXERCISE_BY_ID[id];
  return { exerciseId: id, nm: e.nm, muscle: e.m, kind: e.kind, sets, reps: e.r, rest: e.rest, alts: [], ...extra };
};

test("parear/desparear à mão: A1/A2 lado a lado; refazer o par solta o antigo", () => {
  const items = [it("Dumbbell_Bicep_Curl"), it("Hammer_Curls"), it("Triceps_Pushdown"), it("Side_Lateral_Raise")];
  const p = parear(items, 0, 2);
  assert.deepEqual(p.map((x) => [x.exerciseId, x.par ?? null]), [["Dumbbell_Bicep_Curl", "A1"], ["Triceps_Pushdown", "A2"], ["Hammer_Curls", null], ["Side_Lateral_Raise", null]]);
  const q = parear(p, 2, 3);
  assert.deepEqual(q.map((x) => x.par ?? null), ["A1", "A2", "B1", "B2"]);
  const r = desparear(q, 1);
  assert.deepEqual(r.map((x) => x.par ?? null), [null, null, "A1", "A2"], "letras renomeadas na ordem");
  assert.deepEqual(validarPares(q, ALL), []);
});

test("validarPares: par incompleto ou de músculos que competem é erro", () => {
  const ruim = [it("Dumbbell_Bicep_Curl", 3, { par: "A1" }), it("Hammer_Curls", 3, { par: "A2" })];
  assert.ok(validarPares(ruim, ALL).some((x) => x.severity === "erro" && x.code === "par"));
  assert.ok(validarPares([it("Dumbbell_Bicep_Curl", 3, { par: "A1" })], ALL).some((x) => x.code === "par"));
  assert.ok(validarPares([it("Dumbbell_Bicep_Curl", 3, { par: "A1" }), it("Triceps_Pushdown", 3, { par: "A1" })], ALL).some((x) => x.code === "par"));
});

test("hydrate: o item compacto aceita {id, sets, par}; par válido passa, par inválido vira erro", () => {
  const inp = { equipment: ALL } as unknown as DayInput;
  const ok = hydrate([{ id: "Dumbbell_Bicep_Curl", sets: 3, par: "A1" }, { id: "Triceps_Pushdown", sets: 3, par: "A2" }], inp);
  assert.deepEqual(ok.items.map((i) => i.par), ["A1", "A2"]);
  assert.ok(!ok.issues.some((i) => i.severity === "erro"));
  const ruim = hydrate([{ id: "Dumbbell_Bicep_Curl", sets: 3, par: "A1" }, { id: "Hammer_Curls", sets: 3, par: "A2" }], inp);
  assert.ok(ruim.issues.some((i) => i.severity === "erro" && i.code === "par"));
});

// ---------- 5. geração com formato superserie ----------
const base = (extra: Partial<DayInput> = {}): DayInput => ({
  targets: weeklyTargets(2, ["ombro", "biceps", "triceps"]), done: {}, freq: {}, priorities: ["ombro", "biceps", "triceps"],
  daysLeft: 4, minutes: 90, lastGroup: null, mode: "normal", equipment: ALL, ...extra,
});

test("superserie: a geração pareia por músculo (podeParear), nunca pela posição; tradicional não pareia", () => {
  // foco em bíceps e tríceps com 5+ séries: a lista sai bíceps, bíceps, tríceps, tríceps. Por posição seriam dois pares do mesmo motor.
  const foco: MuscleId[] = ["biceps", "triceps"];
  const trad = planDay(base({ focus: foco, done: {}, minutes: 90 }));
  assert.ok(trad.items.every((i) => i.par == null), "tradicional sem par");
  const ss = planDay(base({ focus: foco, minutes: 90, formato: "superserie" }));
  const pares = new Map<string, PlanItem[]>();
  for (const i of ss.items) if (i.par) pares.set(i.par[0], [...(pares.get(i.par[0]) ?? []), i]);
  assert.ok(pares.size >= 1, JSON.stringify(ss.items.map((i) => [i.exerciseId, i.par])));
  for (const [, [a, b]] of pares) {
    assert.ok(a && b, "par completo");
    assert.notEqual(a.muscle, b.muscle, `${a.exerciseId} × ${b.exerciseId}: mesmo músculo`);
    assert.ok(podeParear(a.exerciseId, b.exerciseId, ALL));
    assert.equal(ss.items.indexOf(b), ss.items.indexOf(a) + 1, "A1 e A2 lado a lado");
  }
  // posição: se os dois primeiros são do mesmo músculo, nunca formam par
  const [x, y] = ss.items;
  if (x.muscle === y.muscle) assert.ok(!(x.par && y.par && x.par[0] === y.par[0]));
  assert.deepEqual(validarPares(ss.items, ALL), []);
  // mesmo conjunto de séries por músculo: parear só reordena
  assert.deepEqual(ss.perMuscle, trad.perMuscle);
});

test("parearItens: sem par possível, nada muda", () => {
  const items = [it("Dumbbell_Bicep_Curl"), it("Hammer_Curls")];
  assert.deepEqual(parearItens(items, ALL).map((i) => i.par ?? null), [null, null]);
});
