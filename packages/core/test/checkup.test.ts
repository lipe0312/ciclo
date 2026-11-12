import { test } from "node:test";
import assert from "node:assert/strict";
import { DIAS_DISPENSA, dispensarCheckup, estadoCheckup, mostrarFaixaCheckup, validateProfilePatch } from "../src/index.ts";

const T = Date.UTC(2026, 10, 11, 12);

test("estado do checkup: nunca, pulado e feito", () => {
  assert.equal(estadoCheckup(false, undefined), "nunca");
  assert.equal(estadoCheckup(false, { checkup: "pulado" }), "nunca"); // ainda no portão dos Primeiros passos
  assert.equal(estadoCheckup(true, { checkup: "pulado" }), "pulado");
  assert.equal(estadoCheckup(true, { checkup: "feito" }), "feito");
  assert.equal(estadoCheckup(true, undefined), "feito"); // conta antiga/Claude: sem marca, vale como feito
  assert.equal(estadoCheckup(true, { filledBy: "app", confirmed: true }), "feito");
});

test("dispensar esconde por 7 dias e depois a faixa volta", () => {
  const ate = dispensarCheckup(T);
  assert.equal(ate - T, DIAS_DISPENSA * 864e5);
  assert.equal(mostrarFaixaCheckup("pulado", null, T), true);
  assert.equal(mostrarFaixaCheckup("pulado", ate, T + 864e5), false);
  assert.equal(mostrarFaixaCheckup("pulado", ate, ate - 1), false);
  assert.equal(mostrarFaixaCheckup("pulado", ate, ate), true);
});

test("concluído nunca mostra a faixa, mesmo sem dispensa", () => {
  assert.equal(mostrarFaixaCheckup("feito", null, T), false);
  assert.equal(mostrarFaixaCheckup("nunca", null, T), true);
});

test("o perfil aceita meta.checkup só com feito/pulado", () => {
  assert.equal(validateProfilePatch({ meta: { checkup: "pulado" } }).ok, true);
  assert.equal(validateProfilePatch({ meta: { checkup: "feito" } }).ok, true);
  assert.equal(validateProfilePatch({ meta: { checkup: "talvez" } }).ok, false);
});
