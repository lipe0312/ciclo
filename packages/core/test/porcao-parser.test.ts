// #80 Parser próprio em modo sombra: normaliza, separa itens, etiqueta (quantidade, medida, vago, alimento, preparo),
// compara com a IA guardando só etiquetas (sem texto cru), aprende porções com N confirmações e só pula a IA com a flag do dono.
// Frases inventadas ou anonimizadas (fictício).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  APELIDOS, PULAR_IA_PADRAO, aprenderPorcoes, compararSombra, metricasSombra, normalizarParser, parsePorcao, podePularIA, separarItens,
} from "../src/porcao-parser.ts";

type E = { a: string | null; q?: number | null; m?: string | null; v?: string | null; p?: string | null };
const T: [string, E[]][] = [
  ["3 ovos", [{ a: "ovo", q: 3 }]],
  ["três ovos e dois pães", [{ a: "ovo", q: 3 }, { a: "pao", q: 2 }]],
  ["um pouco de arroz", [{ a: "arroz", v: "pouco" }]],
  ["muito feijão", [{ a: "feijao", v: "muito" }]],
  ["bastante feijão", [{ a: "feijao", v: "muito" }]],
  ["2 colheres de whey", [{ a: "whey", q: 2, m: "colher de sopa" }]],
  ["meio copo de suco", [{ a: "suco", q: 0.5, m: "copo" }]],
  ["um pratão de macarrão", [{ a: "macarrao", q: 1, m: "pratao" }]],
  ["um prato daqueles de macarrão", [{ a: "macarrao", m: "pratao" }]],
  ["meio prato de arroz", [{ a: "arroz", q: 0.5, m: "prato" }]],
  ["dois pegador de macarrão", [{ a: "macarrao", q: 2, m: "pegador" }]],
  ["uma coisa desse tipo", [{ a: null }]],
  ["uma coisa tipo um wrap", [{ a: null }]],
  ["frango grelhado", [{ a: "frango", p: "grelhado" }]],
  ["frango frito", [{ a: "frango", p: "frito" }]],
  ["150 g de frango", [{ a: "frango", q: 150, m: "g" }]],
  ["200g de patinho", [{ a: "carne", q: 200, m: "g" }]],
  ["2 filés de tilápia", [{ a: "tilapia", q: 2, m: "file" }]],
  ["um bife", [{ a: "carne", q: 1 }]],
  ["arroz, feijão e salada", [{ a: "arroz" }, { a: "feijao" }, { a: "salada" }]],
  ["arroz com feijão", [{ a: "arroz" }, { a: "feijao" }]],
  ["pão de sal com manteiga", [{ a: "pao" }, { a: null }]],
  ["2 cacetinhos", [{ a: "pao", q: 2 }]],
  ["pão francês", [{ a: "pao" }]],
  ["1 pão de queijo", [{ a: "pao-queijo", q: 1 }]],
  ["4 pães de queijo", [{ a: "pao-queijo", q: 4 }]],
  ["2 fatias de pão de forma", [{ a: "pao-forma", q: 2, m: "fatia" }]],
  ["uma fatia de queijo", [{ a: "queijo", q: 1, m: "fatia" }]],
  ["queijo minas", [{ a: "queijo-minas" }]],
  ["uma colher de requeijão", [{ a: "requeijao", q: 1, m: "colher de sopa" }]],
  ["um copo de leite", [{ a: "leite", q: 1, m: "copo" }]],
  ["um copo americano de leite", [{ a: "leite", q: 1, m: "copo americano" }]],
  ["um pote de iogurte", [{ a: "iogurte", q: 1, m: "pote" }]],
  ["uma banana", [{ a: "banana", q: 1 }]],
  ["duas bananas e uma maçã", [{ a: "banana", q: 2 }, { a: "maca", q: 1 }]],
  ["meio mamão", [{ a: "mamao", q: 0.5 }]],
  ["3 colheres de aveia", [{ a: "aveia", q: 3, m: "colher de sopa" }]],
  ["uma concha de feijão", [{ a: "feijao", q: 1, m: "concha" }]],
  ["duas conchas de feijão", [{ a: "feijao", q: 2, m: "concha" }]],
  ["uma escumadeira de arroz", [{ a: "arroz", q: 1, m: "escumadeira" }]],
  ["arroz integral", [{ a: "arroz-integral" }]],
  ["batata doce", [{ a: "batata-doce" }]],
  ["batata-doce cozida", [{ a: "batata-doce", p: "cozido" }]],
  ["aipim", [{ a: "mandioca" }]],
  ["macaxeira frita", [{ a: "mandioca", p: "frito" }]],
  ["cuscuz", [{ a: "cuscuz" }]],
  ["uma tapioca", [{ a: "tapioca", q: 1 }]],
  ["2 fatias de pizza", [{ a: "pizza", q: 2, m: "fatia" }]],
  ["pizza de calabresa", [{ a: "pizza" }]],
  ["lasanha", [{ a: "lasanha" }]],
  ["estrogonofe de frango", [{ a: "strogonoff" }]],
  ["escondidinho de carne seca", [{ a: "escondidinho" }]],
  ["feijoada completa", [{ a: "feijoada" }]],
  ["frango à parmegiana", [{ a: "parmegiana" }]],
  ["yakisoba", [{ a: "yakisoba" }]],
  ["um x-salada", [{ a: "hamburguer", q: 1 }]],
  ["hambúrguer", [{ a: "hamburguer" }]],
  ["açaí de 500", [{ a: "acai", q: 500 }]],
  ["uma lata de refri", [{ a: "refri", q: 1, m: "lata" }]],
  ["um scoop de whey mais uma banana", [{ a: "whey", q: 1, m: "scoop" }, { a: "banana", q: 1 }]],
  ["atum", [{ a: "atum" }]],
  ["uma lata de atum", [{ a: "atum", q: 1, m: "lata" }]],
  ["carne moída", [{ a: "carne-moida" }]],
  ["um punhado de amendoim", [{ a: "amendoim", q: 1, m: "punhado" }]],
  ["pasta de amendoim", [{ a: "amendoim" }]],
  ["peito de frango assado", [{ a: "frango", p: "assado" }]],
  ["peixe", [{ a: "tilapia" }]],
  ["salada de alface e tomate", [{ a: "salada" }, { a: "salada" }]],
  ["um pouquinho de arroz", [{ a: "arroz", v: "pouco" }]],
  ["ovo frito", [{ a: "ovo", p: "frito" }]],
];

test(`parser: tabela com ${T.length} frases (≥ 60)`, () => {
  assert.ok(T.length >= 60);
  const erros: string[] = [];
  for (const [frase, esp] of T) {
    const got = parsePorcao(frase);
    if (got.length !== esp.length) { erros.push(`${frase}: ${got.length} itens (esperava ${esp.length}) ${JSON.stringify(got.map((g) => g.alimento))}`); continue; }
    esp.forEach((e, i) => {
      const g = got[i];
      if (g.alimento !== e.a) erros.push(`${frase}[${i}] alimento ${g.alimento} ≠ ${e.a}`);
      if (e.q !== undefined && g.qtd !== e.q) erros.push(`${frase}[${i}] qtd ${g.qtd} ≠ ${e.q}`);
      if (e.m !== undefined && g.medida !== e.m) erros.push(`${frase}[${i}] medida ${g.medida} ≠ ${e.m}`);
      if (e.v !== undefined && g.vago !== e.v) erros.push(`${frase}[${i}] vago ${g.vago} ≠ ${e.v}`);
      if (e.p !== undefined && g.preparo !== e.p) erros.push(`${frase}[${i}] preparo ${g.preparo} ≠ ${e.p}`);
    });
  }
  assert.deepEqual(erros, []);
});

test("normaliza (sem acento, por extenso → número, meio = 0,5) e separa por vírgula, e, com, mais", () => {
  assert.equal(normalizarParser("Três OVOS e Meia banana"), "3 ovos e 0.5 banana");
  assert.equal(normalizarParser("um pouco de arroz"), "um pouco de arroz", "\"um pouco\" não vira 1");
  assert.deepEqual(separarItens("arroz, feijão e frango com salada mais suco"), ["arroz", "feijao", "frango", "salada", "suco"]);
  assert.equal(APELIDOS["cacetinho"], "pao");
});

test("modo sombra: grava só a comparação (etiquetas e ids), nunca o texto cru", () => {
  const frase = "suco de uva Maratá e 2 fatias de pizza da Joana";
  const c = compararSombra(parsePorcao(frase), [{ key: "suco", g: 350 }, { key: "pizza", g: 220 }]);
  const json = JSON.stringify(c);
  for (const palavra of ["marata", "Maratá", "uva", "joana", "Joana", frase]) assert.ok(!json.includes(palavra), `vazou "${palavra}"`);
  assert.deepEqual(c.idsParser, ["suco", "pizza"]); assert.deepEqual(c.idsIA, ["suco", "pizza"]);
  assert.equal(c.concordou, true);
  assert.ok(c.tags.flat().includes("?"), "palavra desconhecida vira ?");
  assert.ok(typeof c.erroG === "number");
  const d = compararSombra(parsePorcao("frango"), [{ key: "carne", g: 150 }]);
  assert.equal(d.concordou, false);
});

test("aprende porção só com N confirmações coerentes; a métrica por categoria e a flag de pular a IA (desligada)", () => {
  const par = (g: number) => ({ texto: "um prato de arroz", itens: [{ key: "arroz", g }] });
  assert.deepEqual(aprenderPorcoes([par(200)], 2), [], "1 confirmação não basta");
  const ok = aprenderPorcoes([par(200), par(220), { texto: "2 ovos", itens: [{ key: "ovo", g: 100 }] }], 2);
  assert.deepEqual(ok, [{ alimento: "arroz", medida: "prato", gramas: 210, n: 2 }]);
  assert.deepEqual(aprenderPorcoes([par(100), par(300)], 2), [], "valores incoerentes não viram regra");
  // número no texto: gramas por unidade
  assert.deepEqual(aprenderPorcoes([{ texto: "2 conchas de feijão", itens: [{ key: "feijao", g: 280 }] }, { texto: "uma concha de feijão", itens: [{ key: "feijao", g: 140 }] }], 2),
    [{ alimento: "feijao", medida: "concha", gramas: 140, n: 2 }]);

  const rows = [...Array(200)].map((_, i) => ({ categoria: "grao", concordou: i < 196, erroG: 10 }));
  const m = metricasSombra(rows);
  assert.equal(m.grao.n, 200); assert.equal(m.grao.taxa, 0.98); assert.equal(m.grao.erroMedioG, 10);
  assert.equal(PULAR_IA_PADRAO, false);
  assert.equal(podePularIA(m, "grao"), false, "a flag vem desligada");
  assert.equal(podePularIA(m, "grao", true), true);
  assert.equal(podePularIA(metricasSombra(rows.slice(0, 150)), "grao", true), false, "menos de 200 casos");
  assert.equal(podePularIA(m, "massa", true), false);
});
