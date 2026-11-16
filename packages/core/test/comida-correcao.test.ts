// #87 Comida pelo Chat: item informado (rótulo/estimativa) vira item próprio e o total é a soma dos itens; editar um
// registro inteiro com antes → depois por item (renomear, quantidade); registros vagos ("Não lembro"); vários dias numa
// frase ("sábado A, domingo B", "fim de semana", "ontem", "dia 12"). Tudo fictício.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aplicarItensInformados, dentroDoLimite, diffItens, ehRegistroVago, ehTextoVago, interpretarComida, lerItensGravados,
  planejarEdicao, separarDias, somarItens, validarItem,
} from "../src/index.ts";
import type { ItemGravado, ItemInformado, ItemPreviaInformado } from "../src/index.ts";

const HOJE = "2026-11-16"; // segunda-feira

test("item não reconhecido enviado pelo Chat vira item próprio; o total é a soma dos itens (não só o total)", () => {
  const i = interpretarComida({ texto: "café: 2 ovos e suco de uva marata", hoje: HOJE, hora: 8 });
  assert.ok(i.duvidas.some((d) => /uva/.test(d)), "o parser não reconhece o suco");
  const suco: ItemInformado = { nome: "Suco de uva Maratá", quantidade: "300 ml", g: 300, kcal: 210, proteina: 0, fonte: "rotulo" };
  const j = aplicarItensInformados(i, [suco]);
  const r = j.refeicoes[0];
  const item = r.itens.find((x) => x.nome === "Suco de uva Maratá") as ItemPreviaInformado;
  assert.ok(item, "virou item");
  assert.equal(item.kcal, 210); assert.equal(item.fonte, "rotulo"); assert.equal(item.quantidade, "300 ml");
  assert.equal(r.kcal, somarItens(r.itens).kcal, "refeição = soma dos itens");
  assert.equal(r.kcal, i.refeicoes[0].kcal + 210);
  assert.equal(j.total.kcal, j.refeicoes.reduce((s, x) => s + x.kcal, 0), "total = soma");
  assert.ok(!j.duvidas.some((d) => /uva/.test(d)), "a dúvida do suco some");
  assert.ok(j.suposicoes.some((s) => /rótulo/.test(s)));
});

test("item informado com o mesmo nome substitui os valores do parser (override por item)", () => {
  const i = interpretarComida({ texto: "almocei 150 g de frango grelhado", hoje: HOJE, hora: 12 });
  const nome = i.refeicoes[0].itens[0].nome;
  const j = aplicarItensInformados(i, [{ nome, kcal: 300, proteina: 40, fonte: "estimativa" }]);
  assert.equal(j.refeicoes[0].itens.length, 1);
  assert.equal(j.refeicoes[0].kcal, 300); assert.equal(j.refeicoes[0].prot, 40);
});

test("item informado para outra refeição cria a refeição; somarItens arredonda", () => {
  const i = interpretarComida({ texto: "almocei arroz e feijão", hoje: HOJE, hora: 12 });
  const j = aplicarItensInformados(i, [{ nome: "Pizza de calabresa", quantidade: "2 fatias", kcal: 560, proteina: 24.44, fonte: "estimativa", refeicao: "jantar" }]);
  assert.deepEqual(j.refeicoes.map((r) => r.refeicao), ["almoco", "jantar"]);
  assert.equal(j.refeicoes[1].hora, "20:00"); assert.equal(j.refeicoes[1].prot, 24.4);
  assert.deepEqual(somarItens([{ kcal: 10.4, prot: 1.04 }, { kcal: 10.4, prot: 1.04 }]), { kcal: 21, prot: 2.1 });
});

test("validação do item: nome obrigatório e limpo, kcal/proteína negativas ou absurdas recusadas", () => {
  assert.equal(validarItem({ nome: "  ", kcal: 1, proteina: 0, fonte: "rotulo" }).ok, false);
  assert.equal(validarItem({ nome: "x", kcal: -5, proteina: 0, fonte: "rotulo" }).ok, false);
  assert.equal(validarItem({ nome: "x", kcal: 99999, proteina: 0, fonte: "rotulo" }).ok, false);
  assert.equal(validarItem({ nome: "x", kcal: 100, proteina: 500, fonte: "rotulo" }).ok, false);
  assert.equal(validarItem({ nome: "x", kcal: Number.NaN, proteina: 0, fonte: "rotulo" }).ok, false);
  assert.equal(validarItem({ nome: "x", kcal: 1, proteina: 0, fonte: "inventada" as never }).ok, false);
  const v = validarItem({ nome: "<img src=x onerror=alert(1)>'; DROP TABLE food_log;--\u0000", kcal: 1, proteina: 0, fonte: "estimativa" });
  assert.ok(v.ok); if (v.ok) { assert.ok(!v.item.nome.includes("\u0000")); assert.ok(v.item.nome.length <= 80); }
});

test("itens gravados: lê o formato novo e o antigo ({key,g,kcal,prot}); lixo vira null", () => {
  assert.equal(lerItensGravados(null), null);
  assert.equal(lerItensGravados("{oops"), null);
  assert.equal(lerItensGravados('{"a":1}'), null);
  const velho = lerItensGravados('[{"key":"ovo","g":100,"kcal":143,"prot":13}]')!;
  assert.match(velho[0].nome, /^Ovo/); assert.equal(velho[0].qtd, "100 g"); assert.equal(velho[0].fonte, "parser");
  const novo = lerItensGravados('[{"nome":"Suco","qtd":"300 ml","g":300,"kcal":210,"prot":0,"fonte":"rotulo"}]')!;
  assert.equal(novo[0].fonte, "rotulo");
});

test("editar: troca descrição + itens + kcal + proteína; totais = soma; 'Não lembro' não fica", () => {
  const reg = { id: "r1", texto: "Não lembro (estimativa)", itens: null, kcal: 700, prot: null, manual: false };
  const e = planejarEdicao(reg, { itens: [
    { nome: "Pizza de calabresa", quantidade: "3 fatias", kcal: 840, proteina: 36, fonte: "estimativa" },
    { nome: "Refrigerante", quantidade: "350 ml", kcal: 150, proteina: 0, fonte: "rotulo" },
  ] });
  assert.ok(e.ok);
  if (e.ok) {
    assert.equal(e.depois.kcal, 990); assert.equal(e.depois.prot, 36);
    assert.equal(e.depois.descricao, "Pizza de calabresa (3 fatias), Refrigerante (350 ml)");
    assert.ok(!ehTextoVago(e.depois.descricao));
    assert.deepEqual(e.antes, { descricao: "Não lembro (estimativa)", itens: [], kcal: 700, prot: null });
  }
  // descrição vaga é recusada; registro editado à mão só com forcar
  const vaga = planejarEdicao(reg, { descricao: "não lembro direito", itens: [{ nome: "Pizza", kcal: 800, proteina: 30, fonte: "estimativa" }] });
  assert.deepEqual(vaga, { ok: false, motivo: "vago" });
  assert.deepEqual(planejarEdicao({ ...reg, manual: true }, { itens: [{ nome: "Pizza", kcal: 1, proteina: 1, fonte: "estimativa" }] }), { ok: false, motivo: "manual" });
  assert.ok(planejarEdicao({ ...reg, manual: true }, { itens: [{ nome: "Pizza", kcal: 1, proteina: 1, fonte: "estimativa" }] }, true).ok);
  assert.deepEqual(planejarEdicao(reg, { itens: [] }), { ok: false, motivo: "sem_itens" });
});

test("prévia da edição: renomear e mudar a quantidade aparecem como antes → depois por item", () => {
  const antes: ItemGravado[] = [
    { nome: "Néctar de uva", qtd: "200 ml", g: 200, kcal: 120, prot: 0, fonte: "parser" },
    { nome: "Pão francês", qtd: "1 un", g: 50, kcal: 150, prot: 4, fonte: "parser" },
    { nome: "Manteiga", qtd: "10 g", g: 10, kcal: 72, prot: 0, fonte: "parser" },
  ];
  const depois: ItemGravado[] = [
    { nome: "Pão francês", qtd: "2 un", g: 100, kcal: 300, prot: 8, fonte: "estimativa" },
    { nome: "Suco de uva integral", qtd: "300 ml", g: 300, kcal: 210, prot: 0, fonte: "rotulo" },
    { nome: "Manteiga", qtd: "10 g", g: 10, kcal: 72, prot: 0, fonte: "parser" },
  ];
  const d = diffItens(antes, depois);
  const pao = d.find((x) => x.depois?.startsWith("Pão"))!;
  assert.equal(pao.tipo, "mudou"); assert.deepEqual(pao.mudou, ["quantidade", "kcal", "proteina"]);
  assert.equal(pao.antes, "Pão francês (1 un)"); assert.equal(pao.depois, "Pão francês (2 un)");
  const suco = d.find((x) => x.depois?.startsWith("Suco"))!;
  assert.equal(suco.tipo, "mudou"); assert.equal(suco.antes, "Néctar de uva (200 ml)"); assert.ok(suco.mudou!.includes("nome") && suco.mudou!.includes("quantidade"));
  assert.equal(d.find((x) => x.depois?.startsWith("Manteiga"))!.tipo, "igual");
  // renomear casa pela palavra em comum antes da ordem ("café" puro não vira o suco)
  const d3 = diffItens([{ nome: "Café", qtd: null, g: null, kcal: 0, prot: 0, fonte: "parser" }, antes[0]], [depois[1]]);
  assert.deepEqual(d3.map((x) => x.tipo), ["mudou", "saiu"]); assert.equal(d3[0].antes, "Néctar de uva (200 ml)"); assert.equal(d3[1].antes, "Café");
  // item a mais e a menos
  const d2 = diffItens(antes.slice(0, 1), []);
  assert.deepEqual(d2, [{ tipo: "saiu", antes: "Néctar de uva (200 ml)" }]);
  assert.deepEqual(diffItens([], depois.slice(1, 2)), [{ tipo: "novo", depois: "Suco de uva integral (300 ml)" }]);
});

test("vagos: 'Não lembro', confiança baixa/estimativa, sem itens", () => {
  assert.equal(ehTextoVago("Não lembro (estimativa)"), true);
  assert.equal(ehTextoVago("sei lá, qualquer coisa"), true);
  assert.equal(ehTextoVago("arroz, feijão e frango"), false);
  assert.equal(ehRegistroVago({ texto: "Não lembro (estimativa)", itens: null, confianca: "estimativa", kcal: 600 }), "não lembra o que comeu");
  assert.equal(ehRegistroVago({ texto: "pizza", itens: null, confianca: "baixa", kcal: 600 }), "confiança baixa");
  assert.equal(ehRegistroVago({ texto: "coisa estranha", itens: [], confianca: "media", kcal: 0 }), "sem itens reconhecidos");
  assert.equal(ehRegistroVago({ texto: "2 ovos", itens: null, confianca: null, kcal: 140 }), null, "registro do app sem itens não é vago");
});

test("vários dias: 'sábado comi A, domingo B' → 2 dias com as datas certas e o texto sem a palavra do dia", () => {
  const r = separarDias("sábado comi pizza no jantar, domingo almocei lasanha", HOJE);
  assert.deepEqual(r.dias.map((d) => [d.data, d.rotulo]), [["2026-11-14", "sábado"], ["2026-11-15", "domingo"]]);
  assert.match(r.dias[0].texto, /pizza/); assert.doesNotMatch(r.dias[0].texto, /s[aá]bado/i);
  assert.match(r.dias[1].texto, /lasanha/);
  assert.equal(r.marcado, true);
});

test("vários dias: ontem/anteontem/hoje, 'dia 12', '2a feira' e 'fim de semana' (pergunta qual dia)", () => {
  assert.deepEqual(separarDias("ontem jantei frango e hoje almocei arroz", HOJE).dias.map((d) => d.data), ["2026-11-15", HOJE]);
  assert.deepEqual(separarDias("dia 12 almocei strogonoff", HOJE).dias.map((d) => d.data), ["2026-11-12"]);
  assert.deepEqual(separarDias("dia 20 almocei strogonoff", HOJE).dias.map((d) => d.data), ["2026-10-20"], "dia depois de hoje = mês passado");
  assert.equal(separarDias("dia 31 jantei sopa", "2026-11-16").dias[0].data, "2026-10-31");
  assert.deepEqual(separarDias("na sexta-feira jantei sushi", HOJE).dias.map((d) => d.data), ["2026-11-13"]);
  const fds = separarDias("no fim de semana comi pizza", HOJE);
  assert.deepEqual(fds.dias.map((d) => d.data), ["2026-11-14"]); assert.equal(fds.duvidas.length, 1);
  const fds2 = separarDias("no fim de semana: sábado pizza, domingo lasanha", HOJE);
  assert.deepEqual(fds2.dias.map((d) => d.data), ["2026-11-14", "2026-11-15"]); assert.equal(fds2.duvidas.length, 0);
  // sem marca de dia: um dia só (hoje), marcado = false (fluxo antigo)
  const sem = separarDias("2 ovos e pão", HOJE);
  assert.equal(sem.marcado, false); assert.deepEqual(sem.dias.map((d) => d.data), [HOJE]);
  // "segunda vez" não é segunda-feira; "bom dia" não é data
  assert.equal(separarDias("comi a segunda vez arroz, bom dia", HOJE).marcado, false);
  // mesmo dia citado duas vezes junta
  assert.equal(separarDias("sábado almocei arroz, domingo pizza, sábado jantei sopa", HOJE).dias.length, 2);
});

test("limite de 30 dias para trás e nada no futuro", () => {
  assert.equal(dentroDoLimite(HOJE, HOJE), true);
  assert.equal(dentroDoLimite("2026-10-17", HOJE), true);
  assert.equal(dentroDoLimite("2026-10-16", HOJE), false);
  assert.equal(dentroDoLimite("2026-11-17", HOJE), false);
});
