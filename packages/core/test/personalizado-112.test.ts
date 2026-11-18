// #112 Exercício personalizado (cus_) em todos os caminhos: Trocar pelo músculo, Meu treino atual e sem virar troca forçada.
import { test } from "node:test";
import assert from "node:assert/strict";
import { EQUIPMENT, alternativasDoMusculo, applyProfilePatch, normalizeProfile, grupoDoExercicio, trocasDoDia, validarTreinoAtual, validateProfilePatch } from "../src/index.ts";
import type { DayPlan } from "../src/index.ts";

const ALL = EQUIPMENT.map((e) => e.id);
const MEU = "cus_abc12345xyz", OUTRO = "cus_zzz99999aaa";
const treino = (id: string) => ({ divisoes: [{ nome: "A", grupos: ["pernas"], exercicios: [{ id, sets: 3 }] }] });

test("alternativasDoMusculo: mesmo músculo em mesmaParte, resto do grupo em outraParte", () => {
  const alt = alternativasDoMusculo("pant", { equipment: ALL });
  assert.equal(alt.parte, null);
  assert.ok(alt.mesmaParte.length >= 1 && alt.mesmaParte.every((a) => a.ex.m === "pant"));
  assert.ok(alt.outraParte.length >= 1 && alt.outraParte.every((a) => a.ex.m !== "pant" && grupoDoExercicio(a.ex) === "pernas"));
  const fam = alternativasDoMusculo("pant", { equipment: ALL, familiar: [alt.mesmaParte.at(-1)!.ex.id] });
  assert.equal(fam.mesmaParte[0].ex.id, alt.mesmaParte.at(-1)!.ex.id, "o que a pessoa já faz vem primeiro");
  assert.ok(alternativasDoMusculo("post", { equipment: ["halteres"] }).semAparelho.length > 0);
});

test("validarTreinoAtual aceita cus_ só se for desta conta", () => {
  assert.equal(validarTreinoAtual(treino(MEU)).ok, false, "sem a lista da conta, cus_ é recusado");
  assert.equal(validarTreinoAtual(treino(OUTRO), "treinoAtual", new Set([MEU])).ok, false, "cus_ de outra conta é recusado");
  const ok = validarTreinoAtual(treino(MEU), "treinoAtual", new Set([MEU]));
  assert.ok(ok.ok);
  assert.equal((ok.value.divisoes[0].exercicios[0] as { id: string }).id, MEU);
});

test("perfil: treinoAtual com cus_ passa com o contexto da conta", () => {
  assert.equal(validateProfilePatch({ treinoAtual: treino(MEU) }).ok, false);
  assert.equal(validateProfilePatch({ treinoAtual: treino(MEU) }, { personalizados: new Set([MEU]) }).ok, true);
  assert.equal(applyProfilePatch({}, { treinoAtual: treino(OUTRO) }, { personalizados: new Set([MEU]) }).ok, false);
  assert.equal(applyProfilePatch({}, { treinoAtual: treino(MEU) }, { personalizados: new Set([MEU]) }).ok, true);
});

test("perfil já salvo com cus_ no treinoAtual continua legível (validado na gravação)", () => {
  assert.equal(normalizeProfile({ treinoAtual: treino(MEU) }).treinoAtual?.divisoes[0].exercicios[0].id, MEU);
  assert.equal(normalizeProfile({ treinoAtual: treino("cus_<x>") }).treinoAtual, undefined, "ID malformado continua fora");
});

test("personalizado feito no lugar do planejado não vira troca forçada", () => {
  const plan = { items: [{ exerciseId: "Reverse_Flyes", muscle: "post", sets: 3, reps: [10, 15] }] } as unknown as DayPlan;
  assert.deepEqual(trocasDoDia(plan, { [MEU]: 3 }, "2026-11-16"), []);
  assert.ok(trocasDoDia(plan, { Seated_Dumbbell_Press: 3 }, "2026-11-16").length > 0, "controle: catálogo de outra parte vira troca");
});
