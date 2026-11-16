// #93 Meu treino atual não pode sumir: recarregar o perfil do servidor mantém o treino, e um PUT sem o campo não o apaga.
import { test } from "node:test";
import assert from "node:assert/strict";
import { manterTreinoAtual, montarPerfilApp } from "../src/index.ts";

const TREINO = { divisoes: [
  { nome: "A", grupos: ["peito", "triceps"], exercicios: [{ id: "Incline_Dumbbell_Press" }, { nome: "Supino fictício", grupo: "peito" }, { id: "Butterfly" }] },
  { nome: "B", grupos: ["costas"], exercicios: [{ id: "Wide-Grip_Lat_Pulldown" }, { id: "Seated_Cable_Rows" }, { id: "Leverage_Iso_Row" }] },
] };

test("montarPerfilApp (recarregar/sync) mantém o treinoAtual salvo", () => {
  const p = montarPerfilApp({ level: 1, treinoAtual: TREINO }) as unknown as Record<string, unknown>;
  assert.deepEqual(p.treinoAtual, TREINO);
  assert.equal("treinoAtual" in (montarPerfilApp({ level: 1 }) as object), false, "sem cadastro continua sem o campo");
});

test("manterTreinoAtual: PUT sem o campo não zera; com o campo (inclusive 'estou começando') vale o novo", () => {
  const salvo = { level: 1, treinoAtual: TREINO };
  assert.deepEqual(manterTreinoAtual(salvo, { level: 2 }), { level: 2, treinoAtual: TREINO });
  assert.deepEqual(manterTreinoAtual(salvo, { level: 2, treinoAtual: { divisoes: [] } }), { level: 2, treinoAtual: { divisoes: [] } });
  assert.deepEqual(manterTreinoAtual({ level: 1 }, { level: 2 }), { level: 2 });
  assert.deepEqual(manterTreinoAtual(null, { level: 2 }), { level: 2 });
});

import { divisoesSalvaveis, jaTreinaRespondido } from "../src/index.ts";

test("divisoesSalvaveis: um treino com erro não derruba os outros (erro no B não perde o A)", () => {
  const ruim = { nome: "B", grupos: ["costas"], exercicios: [{ id: "id_que_nao_existe" }] };
  assert.deepEqual(divisoesSalvaveis({ divisoes: [TREINO.divisoes[0] as never, ruim as never] }).divisoes.map((d) => d.nome), ["A"]);
  assert.deepEqual(divisoesSalvaveis(undefined), { divisoes: [] });
});

test("jaTreinaRespondido: Primeiros passos (nível) ou o cadastro já respondem; sem nada, pergunta", () => {
  assert.equal(jaTreinaRespondido({}), null);
  assert.equal(jaTreinaRespondido({ level: null }), null);
  assert.equal(jaTreinaRespondido({ level: 0 }), "nao");
  assert.equal(jaTreinaRespondido({ level: 2 }), "sim");
  assert.equal(jaTreinaRespondido({ level: 2, treinoAtual: { divisoes: [] } }), "nao", "disse 'estou começando' no Meu treino atual");
  assert.equal(jaTreinaRespondido({ treinoAtual: TREINO }), "sim");
});
