// #77 Voltar da Semana respeita a origem: history.back quando veio de dentro do app; senão, Treino (regra do core).
import { test } from "node:test";
import assert from "node:assert/strict";
import { PILHA_VAZIA, acaoVoltar, pilhaSalva, registrarRota } from "../src/lib/voltar/regras.ts";
import type { Pilha } from "../src/lib/voltar/regras.ts";

const r = (screen: string, ...parts: string[]) => ({ screen, parts });
/** Navega como o navegador: entrada nova (sem índice no history.state) ou volta/avança (com o índice gravado). */
const nova = (p: Pilha, h: string) => registrarRota(p, h, null);
const pilhaDe = (...hs: string[]) => hs.reduce(nova, PILHA_VAZIA);

test("pilha: entrada nova empilha; voltar/avançar só move o índice; navegar depois de voltar corta o futuro", () => {
  let p = pilhaDe("#treino", "#semana", "#treino/exercicios");
  assert.deepEqual(p, { entradas: ["#treino", "#semana", "#treino/exercicios"], idx: 2 });
  p = registrarRota(p, "#semana", 1); assert.deepEqual(p, { entradas: ["#treino", "#semana", "#treino/exercicios"], idx: 1 }, "history.back");
  p = registrarRota(p, "#treino/exercicios", 2); assert.equal(p.idx, 2, "avançar");
  p = registrarRota(p, "#semana", 1); p = nova(p, "#treino/cardio");
  assert.deepEqual(p, { entradas: ["#treino", "#semana", "#treino/cardio"], idx: 2 });
});

test("tocar na aba Semana depois de Exercícios é entrada nova (não confunde com voltar)", () => {
  const p = pilhaDe("#treino", "#semana", "#treino/exercicios", "#semana");
  assert.deepEqual(acaoVoltar(r("semana"), p), { tipo: "historico", nm: "Treino" });
  assert.equal(p.entradas[p.idx - 1], "#treino/exercicios");
});

test("replaceState troca o topo; índice gravado que a pilha não conhece (recarregou) vira entrada nova", () => {
  let p = pilhaDe("#treino", "#semana");
  p = registrarRota(p, "#semana?x=1", "substituir"); assert.deepEqual(p, { entradas: ["#treino", "#semana?x=1"], idx: 1 });
  assert.deepEqual(registrarRota(PILHA_VAZIA, "#semana", 7), { entradas: ["#semana"], idx: 0 });
  assert.deepEqual(registrarRota(PILHA_VAZIA, "", null), { entradas: ["#hoje"], idx: 0 }, "hash vazio = Hoje");
});

test("Semana com origem no app: history.back com o nome da tela de onde veio", () => {
  assert.deepEqual(acaoVoltar(r("semana"), pilhaDe("#treino", "#semana")), { tipo: "historico", nm: "Treino" });
  assert.deepEqual(acaoVoltar(r("semana"), pilhaDe("#hoje", "#semana")), { tipo: "historico", nm: "Hoje" });
  assert.deepEqual(acaoVoltar(r("semana"), pilhaDe("#treino/cardio", "#semana")), { tipo: "historico", nm: "Treino" });
});

test("Semana aberta direto (sem origem): vai para o Treino", () => {
  assert.deepEqual(acaoVoltar(r("semana"), pilhaDe("#semana")), { tipo: "ir", screen: "treino", parts: [], nm: "Treino" });
  assert.deepEqual(acaoVoltar(r("semana"), PILHA_VAZIA), { tipo: "ir", screen: "treino", parts: [], nm: "Treino" });
});

test("as outras telas seguem a árvore do core (nunca history.back)", () => {
  assert.deepEqual(acaoVoltar(r("treino", "exercicios"), pilhaDe("#treino", "#semana", "#treino/exercicios")), { tipo: "ir", screen: "treino", parts: [], nm: "Treino" });
  assert.deepEqual(acaoVoltar(r("semana", "dia", "2026-11-12"), pilhaDe("#hoje", "#semana/dia/2026-11-12")), { tipo: "ir", screen: "semana", parts: [], nm: "Semana" });
  assert.equal(acaoVoltar(r("hoje"), pilhaDe("#treino", "#hoje")), null);
});

test("pilha salva no aparelho só volta se tiver o formato certo (senão descarta)", () => {
  assert.deepEqual(pilhaSalva('{"entradas":["#treino","#semana"],"idx":1}'), { entradas: ["#treino", "#semana"], idx: 1 });
  for (const ruim of [null, "", "x{", "null", '{"entradas":["#a",3],"idx":0}', '{"entradas":[{"x":1}],"idx":0}', '{"entradas":"#a","idx":0}', '{"entradas":["#a"],"idx":1.5}', '{"entradas":["#a"],"idx":5}'])
    assert.equal(pilhaSalva(ruim), null, String(ruim));
});
