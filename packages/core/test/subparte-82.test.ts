// #82 Prioridade por subparte para TODO músculo: a subparte-alvo vem (1) da prioridade fina do perfil, (2) senão da
// subparte mais atrasada na semana, (3) senão do padrão do músculo (docs/09). Teste de propriedade com todos os SubMuscleId.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ALVO_PADRAO, EQUIPMENT, EXERCISES, MUSCLE_IDS, SUB_MUSCLES, SUB_MUSCLE_IDS, SUB_PRINCIPAIS, candidates, dividirPorSubparte, entradaTreinoAtual,
  planDay, planWeek, prioritiesFromSubs, subAlvo, subAlvos, weekDates, weeklyTargets,
} from "../src/index.ts";
import type { DayInput, MuscleId, SubMuscleId, WeekInput } from "../src/index.ts";

const ALL = EQUIPMENT.map((e) => e.id);

test("padrão documentado para todo músculo do orçamento, e sempre uma subparte daquele músculo", () => {
  for (const m of MUSCLE_IDS) {
    const s = ALVO_PADRAO[m];
    assert.ok(s, `${m} sem padrão`);
    assert.equal(SUB_MUSCLES[s!].muscle, m);
    assert.equal(SUB_PRINCIPAIS[m][0], s, `${m}: o padrão é a 1ª subparte principal`);
    for (const x of SUB_PRINCIPAIS[m]) assert.equal(SUB_MUSCLES[x].muscle, m);
  }
  assert.equal(ALVO_PADRAO.ombro, "ombro_lat", "o orçamento ombro continua mirando o lateral");
});

test("ordem da regra: prioridade fina > mais atrasada na semana > padrão", () => {
  assert.equal(subAlvo("peito", {}), "peito_sup");
  assert.equal(subAlvo("peito", { subPrioridades: ["peito_medio"] }), "peito_medio");
  assert.equal(subAlvo("peito", { subVolume: { peito_sup: 4, peito_medio: 2 } }), "peito_medio", "médio atrasado");
  assert.equal(subAlvo("peito", { subPrioridades: ["peito_sup"], subVolume: { peito_sup: 9 } }), "peito_sup", "a prioridade manda");
  assert.equal(subAlvo("costas", { subVolume: { dorsal: 3, costas_meio: 1 } }), "costas_meio");
  assert.equal(subAlvo("triceps", { subVolume: { triceps_longa: 2, triceps_lateral: 2 } }), "triceps_longa", "empate = padrão");
  // prioridade de outro músculo não muda este
  assert.equal(subAlvo("quad", { subPrioridades: ["peito_sup", "adutores"] }), "adutores");
  assert.equal(subAlvo("core", { subPrioridades: ["obliquos"] }), "obliquos");
  // explícito (subAlvo do DayInput, #74) e reposição continuam acima de tudo
  assert.equal(subAlvo("peito", { subAlvo: { peito: "peito_medio" }, subPrioridades: ["peito_sup"] }), "peito_medio");
  assert.equal(subAlvo("peito", { repor: { peito: { sub: "peito_medio", sets: 2 } }, subPrioridades: ["peito_sup"] }), "peito_medio");
});

test("duas subpartes prioritárias no mesmo músculo: volume na proporção da prioridade, cada uma com o melhor exercício para si", () => {
  const xs = subAlvos("costas", { subPrioridades: ["dorsal", "costas_meio"] });
  assert.deepEqual(xs.map((x) => [x.sub, x.peso, x.fina]), [["dorsal", 2, true], ["costas_meio", 1, true]]);
  assert.deepEqual(dividirPorSubparte(6, xs, {}), { dorsal: 4, costas_meio: 2 });
  assert.deepEqual(dividirPorSubparte(1, xs, {}), { dorsal: 1 });
  assert.deepEqual(dividirPorSubparte(1, xs, { dorsal: 3 }), { costas_meio: 1 }, "quem ficou sem volume na semana vem primeiro");
  const base: DayInput = { targets: { costas: 12 }, done: {}, freq: {}, priorities: ["costas"], daysLeft: 1, minutes: 60, lastGroup: null, mode: "normal", equipment: ALL, split: "sup", subPrioridades: ["dorsal", "costas_meio"] };
  const p = planDay(base);
  const costas = p.items.filter((i) => i.muscle === "costas");
  const ex = (id: string) => EXERCISES.find((e) => e.id === id)!;
  assert.ok(costas.some((i) => ex(i.exerciseId).eficiencia?.dorsal === 3), costas.map((i) => i.exerciseId).join());
  assert.ok(costas.some((i) => ex(i.exerciseId).eficiencia?.costas_meio === 3), costas.map((i) => i.exerciseId).join());
  const sets = (s: SubMuscleId) => costas.filter((i) => partePrincipalDe(i.exerciseId) === s).reduce((a, i) => a + i.sets, 0);
  assert.ok(sets("dorsal") > sets("costas_meio"), `dorsal ${sets("dorsal")} × meio ${sets("costas_meio")}`);
});
const partePrincipalDe = (id: string) => EXERCISES.find((e) => e.id === id)?.subMuscles?.[0];

test("candidates: a prioridade fina leva o exercício nota 3 daquela subparte ao topo", () => {
  const c = candidates("triceps", { equipment: ALL, subPrioridades: ["triceps_lateral"] });
  assert.equal(c[0].ex.eficiencia?.triceps_lateral, 3, c[0].ex.id);
  const d = candidates("triceps", { equipment: ALL, subPrioridades: ["triceps_longa"] });
  assert.equal(d[0].ex.eficiencia?.triceps_longa, 3, d[0].ex.id);
});

test("entradaTreinoAtual leva as prioridades finas do perfil ao gerador", () => {
  assert.deepEqual(entradaTreinoAtual({ level: 1, subPriorities: ["peito_sup", "nada", "gluteo"] }).subPrioridades, ["peito_sup", "gluteo"]);
});

// ---------- propriedade: todos os SubMuscleId ----------
function rng(seed: number) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
const MON = "2026-11-16", D = weekDates(MON);
const DIAS: string[][] = [["seg", "qua", "sex"], ["seg", "ter", "qui", "sex"], ["seg", "ter", "qua", "qui", "sex"], ["seg", "ter", "qua", "qui", "sex", "sab"]];
/** Melhor nota possível na subparte entre os exercícios planejáveis do músculo dela (com todos os aparelhos). */
const melhorNota = (s: SubMuscleId) => Math.max(0, ...EXERCISES.filter((e) => e.m === SUB_MUSCLES[s].muscle && !e.planOff && e.id !== "Scapular_Pull-Up").map((e) => e.eficiencia?.[s] ?? 0));

test("propriedade: cada SubMuscleId marcado como prioridade ganha ≥ 1 exercício com a melhor nota (3 quando o catálogo e o aparelho permitem)", () => {
  const r = rng(82);
  for (const s of SUB_MUSCLE_IDS) {
    for (let k = 0; k < 6; k++) {
      const outros = SUB_MUSCLE_IDS.filter((x) => x !== s && r() < 0.15).slice(0, 2);
      const subs = [s, ...outros].sort(() => r() - 0.5);
      const priorities = prioritiesFromSubs(subs);
      const dias = DIAS[Math.floor(r() * DIAS.length)];
      const i: WeekInput = {
        weekStart: MON, today: D[0], sets: {}, attendance: {}, targets: weeklyTargets(Math.floor(r() * 4) as 0 | 1 | 2 | 3, priorities),
        profile: { daysUsual: dias, daysTarget: dias.length, minutes: 45 + Math.floor(r() * 4) * 15, priorities, dayGym: {}, gyms: [{ id: "a", equipment: ALL }],
          ...entradaTreinoAtual({ level: 1, subPriorities: subs }) },
      };
      const w = planWeek(i);
      const alvo = melhorNota(s);
      const tem = w.days.some((d) => d.plan?.items.some((it) => (EXERCISES.find((e) => e.id === it.exerciseId)?.eficiencia?.[s] ?? 0) >= alvo));
      assert.ok(tem, `${s} (melhor nota ${alvo}) sem exercício · prioridades ${subs.join(",")} · ${dias.length} dias`);
      if (alvo < 3) assert.ok(["trapezio", "lombar", "antebraco", "obliquos"].includes(s), `${s}: catálogo sem nota 3 planejável`);
    }
  }
});

test("sem prioridade fina, a semana alterna a subparte atrasada (peito superior × médio)", () => {
  const priorities: MuscleId[] = ["ombro", "biceps", "triceps"];
  const i: WeekInput = { weekStart: MON, today: D[0], sets: {}, attendance: {}, targets: weeklyTargets(2, priorities),
    profile: { daysUsual: ["seg", "ter", "qui", "sex"], daysTarget: 4, minutes: 60, priorities, dayGym: {}, gyms: [{ id: "a", equipment: ALL }] } };
  const w = planWeek(i);
  const partes = w.days.flatMap((d) => (d.plan?.items ?? []).filter((it) => it.muscle === "peito").map((it) => partePrincipalDe(it.exerciseId)));
  assert.ok(partes.includes("peito_sup") && partes.includes("peito_medio"), partes.join());
});
