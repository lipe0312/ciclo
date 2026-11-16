// #63 Começo vazio e guiado: para onde vai "Montar meu primeiro treino" e quando os chips desmarcados pulsam.
import { test } from "node:test";
import assert from "node:assert/strict";
import { PASSOS_PP, PULSO_VISITAS, devePulsar, faltaParaGerar, passoParaMontarTreino, perfilVazio, pulsoAoAbrir, pulsoAoTocar } from "../src/index.ts";

test("Montar meu primeiro treino: abre no 1º passo que falta; sem falta, no resumo (que gera a semana)", () => {
  assert.equal(passoParaMontarTreino(faltaParaGerar(perfilVazio())), PASSOS_PP.indexOf("objetivo"));
  const p = perfilVazio();
  p.goal.id = "bracos_ombros";
  assert.equal(passoParaMontarTreino(faltaParaGerar(p)), PASSOS_PP.indexOf("experiencia"));
  assert.equal(passoParaMontarTreino([]), PASSOS_PP.indexOf("resumo"));
  assert.equal(passoParaMontarTreino([{ passo: null, rotulo: "x" }]), PASSOS_PP.indexOf("resumo"));
});

test("conta nova: nenhum padrão marcado (músculos, objetivo, dias, lugares)", () => {
  const p = perfilVazio();
  assert.equal(p.goal.id, ""); assert.deepEqual(p.subPriorities, []); assert.deepEqual(p.priorities, []);
  assert.deepEqual(p.daysUsual, []); assert.deepEqual(p.places, []); assert.equal(p.daysTarget, null);
});

test("pulso: só nas primeiras visitas e para depois do 1º toque", () => {
  let s = pulsoAoAbrir(null);
  assert.deepEqual(s, { visitas: 1, interagiu: false });
  assert.equal(devePulsar(s), true);
  for (let i = 1; i < PULSO_VISITAS; i++) s = pulsoAoAbrir(s);
  assert.equal(s.visitas, PULSO_VISITAS); assert.equal(devePulsar(s), true);
  s = pulsoAoAbrir(s);
  assert.equal(devePulsar(s), false, "passou das primeiras visitas");
  const t = pulsoAoTocar(pulsoAoAbrir(null));
  assert.equal(devePulsar(t), false, "tocou: para");
  assert.equal(devePulsar(pulsoAoAbrir(t)), false, "e não volta");
  assert.equal(devePulsar(null), false, "sem visita registrada não pulsa");
  assert.deepEqual(pulsoAoAbrir({ visitas: -3, interagiu: "x" } as any), { visitas: 1, interagiu: false }, "lixo do aparelho vira estado limpo");
});
