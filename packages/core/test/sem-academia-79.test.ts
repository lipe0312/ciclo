// #79 Treino sem academia cadastrada: equipamento padrão (peso corporal + o que a pessoa marcou) e a faixa de aviso.
// Dados fictícios.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FAIXA_SEM_ACADEMIA_DIAS, MUSCLE_IDS, PESO_CORPORAL, equipamentoSemAcademia, faixaSemAcademia, gerarSemana, planDay, validarSemana, weeklyTargets,
} from "../src/index.ts";
import type { MuscleId, PerfilGerador } from "../src/index.ts";

test("equipamentoSemAcademia: sem nada marcado = só peso corporal", () => {
  assert.deepEqual(equipamentoSemAcademia(null), PESO_CORPORAL);
  assert.deepEqual(equipamentoSemAcademia({}), PESO_CORPORAL);
  assert.deepEqual(equipamentoSemAcademia({ equipamentos: [] }), PESO_CORPORAL);
  assert.deepEqual(PESO_CORPORAL, [], "peso corporal não pede aparelho (exercícios com eq [])");
});

test("equipamentoSemAcademia: usa o que a pessoa marcou (só IDs do catálogo, sem repetir)", () => {
  assert.deepEqual(equipamentoSemAcademia({ equipamentos: ["halteres", "elastico", "halteres", "laser", 3, "__proto__"] }), ["halteres", "elastico"]);
  assert.deepEqual(equipamentoSemAcademia({ equipamentos: "halteres" }), PESO_CORPORAL, "formato errado vira peso corporal");
});

const perfil = (equipamentos: string[] | null): PerfilGerador => ({
  sexo: "m", nivel: 1, prioridades: ["ombro", "biceps", "triceps"], equipamentos, dias: ["seg", "qua", "sex"], minutos: 60,
});

test("perfil sem academia e sem equipamento: semana válida só com peso corporal, 2× por músculo que dá para treinar", () => {
  const p = perfil(equipamentoSemAcademia({}));
  const s = gerarSemana(p);
  assert.deepEqual(validarSemana(s, p), [], "validarSemana sem violação");
  const itens = s.dias.flatMap((d) => d.itens);
  assert.ok(itens.length > 0, "a semana tem treino");
  const vezes: Partial<Record<MuscleId, number>> = {};
  for (const d of s.dias) for (const m of new Set(d.itens.map((i) => i.muscle))) vezes[m] = (vezes[m] ?? 0) + 1;
  for (const m of Object.keys(vezes) as MuscleId[]) assert.ok(vezes[m]! >= 2, `${m}: 2× na semana`);
  // o que não dá sem aparelho fica de fora com o motivo (nunca um exercício que pede aparelho)
  for (const f of s.fora) assert.equal(f.motivo, "aparelho");
});

test("marcou halteres e elástico: entram exercícios com eles e a semana segue válida", () => {
  const p = perfil(equipamentoSemAcademia({ equipamentos: ["halteres", "elastico"] }));
  const s = gerarSemana(p);
  assert.deepEqual(validarSemana(s, p), []);
  assert.ok(s.fora.length < gerarSemana(perfil([])).fora.length, "com halteres menos músculos ficam de fora");
});

test("planDay com o equipamento sem academia: só exercícios sem aparelho", () => {
  const plan = planDay({
    targets: weeklyTargets(1, ["ombro"]), done: {}, freq: {}, priorities: ["ombro"], daysLeft: 3, minutes: 45, lastGroup: null,
    mode: "normal", focus: null, equipment: equipamentoSemAcademia({}), crowded: false, prefs: {}, pinned: {}, avoid: [], pains: [],
  });
  assert.ok(plan.items.length > 0, "gera treino");
  assert.ok(plan.items.every((i) => MUSCLE_IDS.includes(i.muscle)));
});

test("faixa de aviso: só com 0 academias; dispensar esconde por 7 dias", () => {
  assert.equal(FAIXA_SEM_ACADEMIA_DIAS, 7);
  assert.equal(faixaSemAcademia({ academias: 0, dispensadaEm: null, hoje: "2026-11-20" }), "mostrar");
  assert.equal(faixaSemAcademia({ academias: 1, dispensadaEm: null, hoje: "2026-11-20" }), "oculto");
  assert.equal(faixaSemAcademia({ academias: 0, dispensadaEm: "2026-11-20", hoje: "2026-11-26" }), "oculto", "6 dias depois");
  assert.equal(faixaSemAcademia({ academias: 0, dispensadaEm: "2026-11-20", hoje: "2026-11-27" }), "mostrar", "7 dias depois volta");
  assert.equal(faixaSemAcademia({ academias: 0, dispensadaEm: "lixo", hoje: "2026-11-27" }), "mostrar");
});

test("perfil aceita a data da dispensa da faixa em meta.avisos (vale em qualquer aparelho)", async () => {
  const { validateProfilePatch } = await import("../src/index.ts");
  assert.equal(validateProfilePatch({ meta: { avisos: { semAcademia: "2026-11-20" } } }).ok, true);
  assert.equal(validateProfilePatch({ meta: { avisos: { semAcademia: "ontem" } } }).ok, false);
  assert.equal(validateProfilePatch({ meta: { avisos: { outro: "2026-11-20" } } }).ok, false);
});

test("sem academia só gera com o básico do perfil respondido (quem pulou os Primeiros passos fica no Hoje vazio, #63)", async () => {
  const { semBaseParaGerar } = await import("../src/index.ts");
  const completo = { goal: { id: "bracos_ombros" }, level: 1, daysUsual: ["seg", "qua"], minutes: 60, places: ["academia"] };
  assert.equal(semBaseParaGerar(completo, 0), false, "perfil completo sem academia: gera");
  assert.equal(semBaseParaGerar({ meta: { checkup: "pulado" } }, 0), true, "pulou: não gera treino aleatório");
  assert.equal(semBaseParaGerar({ minutes: 60 }, 2), false, "com academia, igual a antes");
});
