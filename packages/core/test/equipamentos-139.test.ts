// #139 Campo `equipamentos` do perfil (o que a pessoa tem sem academia): validado no core e usado pela semana e pelo plan-day.
// Dados fictícios.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EQUIPMENT_BY_ID, MAX_EQUIPAMENTOS, applyProfilePatch, equipamentoDoDia, normalizeProfile, patchDoPasso, planWeek,
  validateProfilePatch, weeklyTargets,
} from "../src/index.ts";
import type { WeekInput, WeekProfile } from "../src/index.ts";
import { EQUIPAMENTOS_CASA } from "../src/equipamentos-casa.ts";

test("EQUIPAMENTOS_CASA: só IDs do catálogo, sem repetir", () => {
  assert.ok(EQUIPAMENTOS_CASA.length >= 6);
  for (const q of EQUIPAMENTOS_CASA) assert.ok(EQUIPMENT_BY_ID[q], q);
  assert.equal(new Set(EQUIPAMENTOS_CASA).size, EQUIPAMENTOS_CASA.length);
});

test("perfil valida equipamentos: IDs do catálogo, sem repetir, lista vazia vale (= só peso corporal)", () => {
  assert.deepEqual(validateProfilePatch({ equipamentos: ["halteres", "elastico"] }), { ok: true, value: { equipamentos: ["halteres", "elastico"] }, errors: [] });
  assert.equal(validateProfilePatch({ equipamentos: [] }).ok, true);
  const ruim = validateProfilePatch({ equipamentos: ["laser"] });
  assert.equal(ruim.ok, false);
  assert.deepEqual(!ruim.ok && ruim.campos, ["equipamentos"]);
  assert.equal(validateProfilePatch({ equipamentos: ["halteres", "halteres"] }).ok, false, "repetido");
  assert.equal(validateProfilePatch({ equipamentos: "halteres" }).ok, false, "formato");
  assert.equal(validateProfilePatch({ equipamentos: Array(MAX_EQUIPAMENTOS + 1).fill("halteres") }).ok, false, "limite");
  assert.equal(validateProfilePatch({ equipamentos: ["__proto__"] }).ok, false);
});

test("equipamentos substitui no merge e sobrevive ao normalizeProfile (perfil guardado)", () => {
  const a = applyProfilePatch({ equipamentos: ["halteres"] }, { equipamentos: ["elastico"] });
  assert.ok(a.ok);
  assert.deepEqual(a.ok && (a.profile as { equipamentos?: string[] }).equipamentos, ["elastico"]);
  assert.deepEqual(normalizeProfile({ equipamentos: ["halteres", "kettle"] }).equipamentos, ["halteres", "kettle"]);
  assert.equal(normalizeProfile({ equipamentos: ["laser"] }).equipamentos, undefined, "legado inválido sai");
});

test("Primeiros passos: o passo 'onde' salva também os equipamentos (mesmo vazio)", () => {
  assert.deepEqual(patchDoPasso("onde", { places: ["casa"], equipamentos: ["halteres"] }), { places: ["casa"], equipamentos: ["halteres"] });
  assert.deepEqual(patchDoPasso("onde", { places: ["casa"], equipamentos: [] }), { places: ["casa"], equipamentos: [] });
  assert.deepEqual(patchDoPasso("onde", { places: ["academia"] }), { places: ["academia"] });
});

test("equipamentoDoDia: com academia, os aparelhos dela; sem nenhuma, o que a pessoa marcou (equipamentoSemAcademia)", () => {
  const gyms = [{ id: "acad-a", equipment: ["polia", "halteres"] }];
  assert.deepEqual(equipamentoDoDia({ gyms, equipamentos: ["elastico"] }, "acad-a"), ["polia", "halteres"]);
  assert.deepEqual(equipamentoDoDia({ gyms: [], equipamentos: ["elastico", "laser"] }, null), ["elastico"]);
  assert.deepEqual(equipamentoDoDia({ gyms: [] }, null), [], "sem nada marcado: peso corporal");
});

const perfilSemana = (equipamentos?: string[]): WeekProfile => ({
  daysUsual: ["seg", "qua", "sex"], daysTarget: 3, minutes: 60, priorities: ["ombro", "biceps", "triceps"], dayGym: {}, gyms: [], equipamentos,
});
const entrada = (p: WeekProfile): WeekInput => ({
  weekStart: "2026-11-23", today: "2026-11-23", sets: {}, attendance: {}, profile: p, targets: weeklyTargets(1, p.priorities),
});

test("semana sem academia usa o que a pessoa marcou: com halteres entram exercícios com halteres", () => {
  const ids = (eq?: string[]) => planWeek(entrada(perfilSemana(eq))).days.flatMap((d) => d.plan?.items ?? []).map((i) => EXERCISE_EQ(i.exerciseId));
  const so = ids();
  assert.ok(so.every((eq) => eq.length === 0), "sem marcar: só peso corporal");
  const com = ids(["halteres", "banco"]);
  assert.ok(com.some((eq) => eq.includes("halteres")), "marcou halteres: aparecem");
  assert.ok(com.every((eq) => eq.every((q) => ["halteres", "banco"].includes(q))), "nunca um aparelho que não marcou");
});

import { EXERCISE_BY_ID } from "../src/index.ts";
const EXERCISE_EQ = (id: string) => EXERCISE_BY_ID[id]?.eq ?? [];

test("recarregar o app (montarPerfilApp) não descarta os equipamentos marcados", async () => {
  const { montarPerfilApp } = await import("../src/index.ts");
  assert.deepEqual((montarPerfilApp({ equipamentos: ["halteres"] }) as { equipamentos?: string[] }).equipamentos, ["halteres"]);
  assert.equal((montarPerfilApp({}) as { equipamentos?: string[] }).equipamentos, undefined);
});
