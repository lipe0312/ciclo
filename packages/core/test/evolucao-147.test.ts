// #147 Evolução por período: janela (semana, mês, 3/6 meses, 1 ano, Tudo, personalizado), agrupamento automático por dia,
// semana ou mês (meses de tamanhos diferentes e virada de ano), comparação com o período anterior de mesmo tamanho e com o
// começo, cobertura de registro (com a regra da #115 para a média de comida) e conquistas sempre na direção do objetivo.
// Dados fictícios.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_MESES, baldesDe, consultasEvolucao, difTextoEvo, evolucao, fimDoMes, grupoDe, janelaEvolucao, mesValido, mesesEntre, somaMeses,
} from "../src/evolucao.ts";
import type { EvolucaoOpts, EvolucaoRaw, JanelaEvo } from "../src/evolucao.ts";
import { REGRAS_MEDIAS_PADRAO } from "../src/comida-medias.ts";

const J = (periodo: string, hoje: string, o: { de?: string; ate?: string; primeiro?: string | null } = {}): JanelaEvo => {
  const r = janelaEvolucao(periodo, hoje, o);
  assert.ok(r.ok, r.ok ? "" : r.erro);
  return r.j;
};
const raw = (de: string, ate: string, x: Partial<EvolucaoRaw> = {}): EvolucaoRaw => ({
  de, ate, sets: [], e1rm: [], sessoes: [], presenca: [], cardio: [], refeicoes: [], naoComi: [], bebida: [], agua: [], sono: [], alcool: [],
  peso: [], medidas: [], recordeAntes: [], primeiro: null, comecoCorpo: { peso: null, braco: null, cintura: null, ombro: null }, regrasMedias: REGRAS_MEDIAS_PADRAO, ...x,
});
const GANHAR = { bracoCm: 1.5, cinturaCm: 0, pesoKg: 1.5 }, PERDER = { bracoCm: 0, cinturaCm: -3, pesoKg: -4 };
const opts = (hoje: string, objetivo = GANHAR, x: Partial<EvolucaoOpts> = {}): EvolucaoOpts =>
  ({ hoje, prioridades: ["ombro", "biceps", "triceps"], diasMeta: 3, objetivo, metaProteina: 150, metaKcal: 2500, ...x });

// ---------- meses e agrupamento ----------
test("meses: formato AAAA-MM, contagem inclusiva, soma com virada de ano e fim do mês (28, 29, 30 e 31)", () => {
  assert.ok(mesValido("2026-11") && mesValido("2027-01"));
  for (const x of ["2026-13", "2026-00", "2026-1", "26-11", "2026-11-01", "2026-11'; DROP TABLE x;--", null, 202611]) assert.equal(mesValido(x), false, String(x));
  assert.equal(mesesEntre("2026-01", "2026-12"), 12);
  assert.equal(mesesEntre("2025-12", "2026-12"), 13);
  assert.equal(mesesEntre("2026-11", "2026-11"), 1);
  assert.equal(somaMeses("2026-11", 2), "2027-01");
  assert.equal(somaMeses("2026-01", -1), "2025-12");
  assert.deepEqual(["2026-02", "2028-02", "2026-04", "2026-12"].map(fimDoMes), ["2026-02-28", "2028-02-29", "2026-04-30", "2026-12-31"]);
  assert.equal(MAX_MESES, 12);
});

test("agrupamento: até 1 mês por dia, até 3 meses por semana, acima disso por mês", () => {
  assert.deepEqual([7, 28, 31, 59, 62, 90, 92, 120, 181, 366].map(grupoDe), ["dia", "dia", "dia", "semana", "semana", "semana", "semana", "mes", "mes", "mes"]);
  assert.equal(J("semana", "2026-11-12").grupo, "dia");
  assert.equal(J("mes", "2026-11-12").grupo, "dia");
  assert.equal(J("3m", "2026-11-12").grupo, "semana");
  assert.equal(J("6m", "2026-11-12").grupo, "mes");
  assert.equal(J("1a", "2026-11-12").grupo, "mes");
  assert.equal(J("custom", "2026-11-12", { de: "2026-03", ate: "2026-04" }).grupo, "semana");
  assert.equal(J("custom", "2026-11-12", { de: "2026-03", ate: "2026-06" }).grupo, "mes");
  assert.equal(J("tudo", "2026-11-12", { primeiro: "2026-10-20" }).grupo, "mes"); // Tudo é sempre por mês
});

test("janela: semana e mês com o anterior de mesmo tamanho (dias decorridos), inclusive fevereiro e virada de ano", () => {
  const s = J("semana", "2027-01-01"); // sexta
  assert.deepEqual([s.inicio, s.fim, s.ate, s.decorridos], ["2026-12-28", "2027-01-03", "2027-01-01", 5]);
  assert.deepEqual(s.anterior, { inicio: "2026-12-21", fim: "2026-12-25" });
  const fev = J("mes", "2026-02-15");
  assert.deepEqual([fev.inicio, fev.fim, fev.decorridos], ["2026-02-01", "2026-02-28", 15]);
  assert.deepEqual(fev.anterior, { inicio: "2026-01-01", fim: "2026-01-15" });
  const mar = J("mes", "2026-03-31"); // o anterior (fevereiro) para no fim dele
  assert.deepEqual(mar.anterior, { inicio: "2026-02-01", fim: "2026-02-28" });
  const jan = J("mes", "2027-01-10");
  assert.deepEqual(jan.anterior, { inicio: "2026-12-01", fim: "2026-12-10" });
});

test("janela: 3 e 6 meses, 1 ano e Tudo", () => {
  const t = J("3m", "2026-11-27");
  assert.deepEqual([t.inicio, t.fim, t.decorridos], ["2026-09-01", "2026-11-30", 88]);
  assert.deepEqual(t.anterior, { inicio: "2026-06-01", fim: "2026-08-27" });
  const s = J("6m", "2027-02-10");
  assert.deepEqual([s.inicio, s.fim, s.ate], ["2026-09-01", "2027-02-28", "2027-02-10"]);
  assert.equal(s.anterior!.inicio, "2026-03-01");
  const a = J("1a", "2026-11-27");
  assert.deepEqual([a.inicio, a.anterior!.inicio], ["2025-12-01", "2024-12-01"]);
  const tudo = J("tudo", "2026-11-27", { primeiro: "2025-06-10" });
  assert.deepEqual([tudo.inicio, tudo.ate, tudo.anterior], ["2025-06-01", "2026-11-27", null]);
  assert.deepEqual(tudo.base, { inicio: "2026-11-01", fim: "2026-11-27" }, "Tudo compara o último mês com o primeiro");
  assert.deepEqual(tudo.comeco, { inicio: "2025-06-10", fim: "2025-06-30" });
  const novo = J("tudo", "2026-11-27", { primeiro: null });
  assert.equal(novo.inicio, "2026-11-01");
});

test("janela personalizada: de um mês a outro, de 2 a 12 meses; fora disso é erro", () => {
  const c = J("custom", "2026-11-27", { de: "2025-12", ate: "2026-11" });
  assert.deepEqual([c.inicio, c.fim, c.meses], ["2025-12-01", "2026-11-30", 12]);
  const passado = J("custom", "2026-11-27", { de: "2026-01", ate: "2026-02" });
  assert.deepEqual([passado.ate, passado.decorridos], ["2026-02-28", 59]);
  assert.deepEqual(passado.anterior, { inicio: "2025-11-01", fim: "2025-12-29" });
  for (const [de, ate] of [["2025-11", "2026-11"], ["2026-05", "2026-05"], ["2026-06", "2026-05"], ["2026-11", "2026-12"], ["2026-13", "2026-12"], [undefined, "2026-05"]]) {
    const r = janelaEvolucao("custom", "2026-11-27", { de, ate });
    assert.equal(r.ok, false, `${de}..${ate}`);
  }
  assert.equal(janelaEvolucao("decada", "2026-11-27").ok, false);
});

test("baldes por semana: começa no dia 1 (meio da semana), cruza o fim de fevereiro e a semana atual fica em andamento", () => {
  const j = J("3m", "2026-03-15"); // 1/jan é quinta; 15/mar é domingo
  const b = baldesDe(j, "2025-01-01");
  assert.equal(b.length, 11);
  assert.deepEqual([b[0].inicio, b[0].fim, b[0].dias], ["2026-01-01", "2026-01-04", 4]);
  assert.ok(b.some((x) => x.inicio === "2026-02-23" && x.fim === "2026-03-01"), "a semana atravessa fevereiro → março");
  assert.equal(b.reduce((s, x) => s + x.dias, 0), j.decorridos);
  assert.equal(b.at(-1)!.andamento, true);
  assert.equal(b.filter((x) => x.andamento).length, 1);
});

test("baldes por mês: tamanhos de cada mês, virada de ano no rótulo e mês atual em andamento", () => {
  const b = baldesDe(J("6m", "2027-02-10"), "2026-01-01");
  assert.deepEqual(b.map((x) => x.rotulo), ["set/26", "out/26", "nov/26", "dez/26", "jan/27", "fev/27"]);
  assert.deepEqual(b.map((x) => x.dias), [30, 31, 30, 31, 31, 10]);
  assert.deepEqual(b.map((x) => x.andamento), [false, false, false, false, false, true]);
  const bis = baldesDe(J("1a", "2028-02-29"), "2027-01-01");
  assert.equal(bis.length, 12);
  assert.deepEqual([bis.at(-1)!.dias, bis.at(-1)!.rotulo], [29, "fev/28"]);
  assert.equal(bis[0].rotulo, "mar/27");
  // antes do 1º registro não há barra (não é "zero")
  const curto = baldesDe(J("6m", "2026-11-27"), "2026-09-15");
  assert.deepEqual(curto.map((x) => x.rotulo), ["set", "out", "nov"]);
  assert.deepEqual(baldesDe(J("6m", "2026-11-27"), null), []);
});

test("baldes por dia: a semana tem rótulo do dia da semana; o mês, o número do dia", () => {
  assert.deepEqual(baldesDe(J("semana", "2026-11-12"), "2026-01-01").map((x) => x.rotulo), ["seg", "ter", "qua", "qui"]);
  const m = baldesDe(J("mes", "2026-11-12"), "2026-01-01");
  assert.equal(m.length, 12);
  assert.deepEqual([m[0].rotulo, m.at(-1)!.rotulo, m.at(-1)!.andamento, m[0].andamento], ["1", "12", true, false]);
});

test("consultas: nunca mais de 12 meses por consulta; o anterior e o começo entram sem passar do teto", () => {
  const all = (j: JanelaEvo) => { const c = consultasEvolucao(j); assert.ok(c.every((x) => mesesEntre(x.de, x.ate) >= 1 && mesesEntre(x.de, x.ate) <= 12), JSON.stringify(c)); return c; };
  assert.deepEqual(all(J("6m", "2026-11-27")), [{ de: "2025-12", ate: "2026-11" }]);
  assert.deepEqual(all(J("1a", "2026-11-27")), [{ de: "2024-12", ate: "2025-11" }, { de: "2025-12", ate: "2026-11" }]);
  assert.deepEqual(all(J("mes", "2026-01-10")), [{ de: "2025-12", ate: "2026-01" }]);
  const tudo = all(J("tudo", "2026-11-27", { primeiro: "2024-03-02" }));
  assert.deepEqual(tudo, [{ de: "2024-03", ate: "2024-11" }, { de: "2024-12", ate: "2025-11" }, { de: "2025-12", ate: "2026-11" }]);
  const comComeco = all(J("mes", "2026-11-12", { primeiro: "2025-02-03" }));
  assert.deepEqual(comComeco, [{ de: "2025-02", ate: "2025-02" }, { de: "2026-10", ate: "2026-11" }]);
});

// ---------- comparação ----------
test("comparação: o período contra o anterior de mesmo tamanho e contra o começo (1º registro)", () => {
  const j = J("mes", "2026-11-12", { primeiro: "2026-06-01" });
  assert.deepEqual(j.comeco, { inicio: "2026-06-01", fim: "2026-06-12" });
  const r = raw("2026-10", "2026-11", { sessoes: ["2026-11-02", "2026-11-05", "2026-11-09", "2026-10-03", "2026-10-10", "2026-10-20"], primeiro: "2026-06-01",
    cardio: [{ date: "2026-11-05", minutes: 30 }, { date: "2026-10-03", minutes: 20 }] });
  const c = raw("2026-06", "2026-06", { sessoes: ["2026-06-01", "2026-06-04"], primeiro: "2026-06-01" });
  const v = evolucao(j, [r, c], opts("2026-11-12"));
  assert.deepEqual([v.treino.dias.valor, v.treino.dias.anterior, v.treino.dias.difAnterior], [3, 2, 1], "o dia 20/10 passa dos 12 dias decorridos");
  assert.deepEqual([v.treino.dias.comeco, v.treino.dias.difComeco], [2, 1]);
  assert.deepEqual([v.treino.cardio.valor, v.treino.cardio.difAnterior, v.treino.cardio.difComeco], [30, 10, 30]);
  assert.equal(v.baldes.length, 12);
  assert.deepEqual(v.treino.dias.baldes.slice(0, 5), [0, 1, 0, 0, 1]);
  // começo dentro do próprio período: não compara
  const recente = evolucao(J("mes", "2026-11-12", { primeiro: "2026-11-02" }), [r], opts("2026-11-12"));
  assert.equal(recente.comeco, null);
  assert.equal(recente.treino.dias.difComeco, null);
});

test("comparação do corpo: último valor do período contra o do anterior e contra a 1ª medida de todas", () => {
  const j = J("mes", "2026-11-20", { primeiro: "2026-03-01" });
  const r = raw("2026-10", "2026-11", { primeiro: "2026-03-01",
    peso: [{ date: "2026-10-05", kg: 72.0 }, { date: "2026-10-15", kg: 72.2 }, { date: "2026-11-03", kg: 72.5 }, { date: "2026-11-18", kg: 72.9 }],
    medidas: [{ date: "2026-10-10", braco: 33.0, cintura: 79.0, ombro: null }, { date: "2026-11-10", braco: 33.6, cintura: 79.2, ombro: 118 }],
    comecoCorpo: { peso: { date: "2026-03-01", value: 70.0 }, braco: { date: "2026-03-01", value: 32.0 }, cintura: { date: "2026-03-01", value: 80.0 }, ombro: null } });
  const v = evolucao(j, [r], opts("2026-11-20"));
  assert.deepEqual([v.corpo.peso.valor, v.corpo.peso.anterior, v.corpo.peso.difAnterior, v.corpo.peso.comeco, v.corpo.peso.difComeco], [72.9, 72.2, 0.7, 70, 2.9]);
  assert.deepEqual([v.corpo.braco.valor, v.corpo.braco.difAnterior, v.corpo.braco.difComeco], [33.6, 0.6, 1.6]);
  assert.deepEqual([v.corpo.cintura.difAnterior, v.corpo.cintura.difComeco], [0.2, -0.8]);
  assert.deepEqual([v.corpo.ombro.valor, v.corpo.ombro.anterior, v.corpo.ombro.difAnterior], [118, null, null]);
  assert.equal(v.corpo.peso.registrados, 2);
});

// ---------- cobertura ----------
test("cobertura de comida: dias registrados por barra e quais entraram na média (#115: dia vazio fora, refeição completada, 'não comi' conta)", () => {
  const hist = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"].flatMap((date) => [
    { date, meal: "cafe" as const, kcal: 400, prot: 30 }, { date, meal: "almoco" as const, kcal: 800, prot: 50 }, { date, meal: "jantar" as const, kcal: 700, prot: 45 }]);
  const semana = [
    { date: "2026-11-09", meal: "cafe" as const, kcal: 400, prot: 30 }, { date: "2026-11-09", meal: "almoco" as const, kcal: 800, prot: 50 }, { date: "2026-11-09", meal: "jantar" as const, kcal: 700, prot: 45 },
    { date: "2026-11-10", meal: "almoco" as const, kcal: 800, prot: 50 }, // café e jantar entram pela média da refeição
  ];
  const base = { refeicoes: [...hist, ...semana], naoComi: [{ date: "2026-11-12", meal: "cafe" as const }], primeiro: "2026-11-02" };
  const j = J("semana", "2026-11-12", { primeiro: "2026-11-02" });
  const v = evolucao(j, [raw("2026-11", "2026-11", base)], opts("2026-11-12"));
  assert.deepEqual(v.comida.kcal.cobertura.map((c) => [c.registrados, c.naMedia, c.dias]), [[1, 1, 1], [1, 1, 1], [0, 0, 1], [1, 1, 1]]);
  assert.deepEqual(v.comida.kcal.baldes, [1900, 1900, null, 1500], "11/11 sem nada fica de fora (null, não zero)");
  assert.equal(v.comida.kcal.valor, Math.round((1900 + 1900 + 1500) / 3));
  assert.deepEqual([v.comida.kcal.registrados, v.comida.kcal.naMedia, v.comida.kcal.dias], [3, 3, 4]);
  // a pessoa escolheu "dia vazio conta 0": o 11/11 entra na média
  const zero = evolucao(j, [raw("2026-11", "2026-11", { ...base, regrasMedias: { ...REGRAS_MEDIAS_PADRAO, diaVazio: "zero" } })], opts("2026-11-12"));
  assert.deepEqual(zero.comida.kcal.baldes, [1900, 1900, 0, 1500]);
  assert.equal(zero.comida.kcal.naMedia, 4);
  assert.equal(zero.comida.kcal.valor, Math.round((1900 + 1900 + 0 + 1500) / 4));
  // proteína batida (≥ 95% de 150 g): nenhum dia; com meta de 120 g, 9 e 10 (125 g)
  assert.equal(v.comida.protDias.valor, 0);
  assert.equal(evolucao(j, [raw("2026-11", "2026-11", base)], opts("2026-11-12", GANHAR, { metaProteina: 120 })).comida.protDias.valor, 67);
});

test("cobertura de treino e saúde: dias com resposta (sessão ou presença marcada), água, sono e álcool só nos dias registrados", () => {
  const j = J("semana", "2026-11-12", { primeiro: "2026-11-01" });
  const r = raw("2026-11", "2026-11", { primeiro: "2026-11-01", sessoes: ["2026-11-09"], presenca: [{ date: "2026-11-10", status: "nao_fui" }, { date: "2026-11-11", status: "fui" }],
    sets: [{ date: "2026-11-09", muscle: "ombro", n: 4 }, { date: "2026-11-11", muscle: "ombro", n: 3 }],
    agua: [{ date: "2026-11-09", litros: 2 }, { date: "2026-11-12", litros: 3 }], sono: [{ date: "2026-11-10", horas: 7 }],
    alcool: [{ date: "2026-11-09", doses: 0 }, { date: "2026-11-11", doses: 3 }] });
  const v = evolucao(j, [r], opts("2026-11-12"));
  assert.deepEqual(v.treino.dias.cobertura.map((c) => c.registrados), [1, 1, 1, 0]);
  assert.equal(v.treino.dias.valor, 2, "'não fui' é registro, não treino");
  assert.deepEqual(v.treino.series.find((s) => s.muscle === "ombro")!.s.baldes, [4, 0, 3, 0]);
  assert.deepEqual([v.saude.agua.valor, v.saude.agua.registrados, v.saude.agua.dias], [2.5, 2, 4]);
  assert.deepEqual(v.saude.agua.baldes, [2, null, null, 3]);
  assert.deepEqual([v.saude.sono.valor, v.saude.sono.registrados], [7, 1]);
  assert.deepEqual([v.saude.alcoolNoites.valor, v.saude.alcoolDoses.valor, v.saude.alcoolNoites.registrados], [1, 3, 2]);
});

test("poucos dados: conta vazia não quebra e diz que precisa de mais registros", () => {
  const j = J("6m", "2026-11-27", { primeiro: null });
  const v = evolucao(j, [raw("2025-12", "2026-11")], opts("2026-11-27"));
  assert.deepEqual(v.baldes, []);
  assert.deepEqual([v.treino.temDados, v.comida.temDados, v.saude.temDados, v.corpo.temDados], [false, false, false, false]);
  assert.deepEqual(v.conquistas, []);
  assert.equal(v.treino.dias.valor, 0);
  assert.equal(v.comida.kcal.valor, null);
  assert.equal(v.corpo.peso.valor, null);
  assert.deepEqual(evolucao(j, [], opts("2026-11-27")).conquistas, []);
});

// ---------- conquistas ----------
const corpo = (pesos: [string, number][], medidas: [string, number, number][]) => ({
  peso: pesos.map(([date, kg]) => ({ date, kg })), medidas: medidas.map(([date, braco, cintura]) => ({ date, braco, cintura, ombro: null })),
});
const MES = J("mes", "2026-11-20", { primeiro: "2026-01-05" });

test("conquistas: ganhar massa comemora subida (peso, braço com a cintura estável)", () => {
  const r = raw("2026-10", "2026-11", { primeiro: "2026-01-05", ...corpo([["2026-10-08", 72.0], ["2026-11-15", 72.6]], [["2026-10-10", 33.0, 79.0], ["2026-11-10", 34.0, 79.2]]) });
  const c = evolucao(MES, [r], opts("2026-11-20", GANHAR)).conquistas;
  const ids = c.map((x) => x.id.split(":").pop());
  assert.ok(ids.includes("peso"), JSON.stringify(c));
  assert.ok(c.some((x) => x.texto === "Braço +1 cm com a cintura estável"), JSON.stringify(c));
  assert.ok(c.find((x) => x.id.endsWith(":peso"))!.texto.includes("+0,6 kg"));
  assert.ok(c.every((x) => x.aba === "corpo"));
});

test("conquistas: perder peso comemora descida e nunca a subida (nunca contra o objetivo)", () => {
  const subiu = raw("2026-10", "2026-11", { primeiro: "2026-01-05", ...corpo([["2026-10-08", 82.0], ["2026-11-15", 82.9]], [["2026-10-10", 34.0, 90.0], ["2026-11-10", 34.6, 90.8]]) });
  assert.deepEqual(evolucao(MES, [subiu], opts("2026-11-20", PERDER)).conquistas, [], "peso e cintura subiram: nada a comemorar (e nenhuma bronca)");
  const desceu = raw("2026-10", "2026-11", { primeiro: "2026-01-05", ...corpo([["2026-10-08", 82.0], ["2026-11-15", 81.1]], [["2026-10-10", 34.0, 90.0], ["2026-11-10", 34.0, 89.2]]) });
  const c = evolucao(MES, [desceu], opts("2026-11-20", PERDER)).conquistas;
  assert.ok(c.find((x) => x.id.endsWith(":peso"))!.texto.includes("−0,9 kg"), JSON.stringify(c));
  assert.ok(c.find((x) => x.id.endsWith(":cintura"))!.texto.includes("−0,8 cm"));
  // o mesmo dado com objetivo de ganhar: a descida de peso não vira conquista
  assert.ok(!evolucao(MES, [desceu], opts("2026-11-20", GANHAR)).conquistas.some((x) => x.id.endsWith(":peso")));
});

test("conquistas de treino e comida: recorde de e1RM, semanas seguidas na meta, mais dias e proteína batida em mais dias", () => {
  const EX = "Cable_Seated_Lateral_Raise";
  const sess = ["2026-10-06", "2026-10-08", "2026-10-09", "2026-10-13", "2026-10-15", "2026-10-16", "2026-10-26", "2026-10-28", "2026-10-30",
    "2026-11-02", "2026-11-04", "2026-11-06", "2026-11-09", "2026-11-11", "2026-11-13", "2026-11-16", "2026-11-17", "2026-11-18"];
  const prot = (date: string, p: number) => ({ date, meal: "almoco" as const, kcal: 900, prot: p });
  const r = raw("2026-10", "2026-11", { primeiro: "2026-01-05", sessoes: sess,
    e1rm: [{ date: "2026-10-06", exerciseId: EX, muscle: "ombro", e1rm: 9.0 }, { date: "2026-11-04", exerciseId: EX, muscle: "ombro", e1rm: 9.5 }, { date: "2026-11-18", exerciseId: EX, muscle: "ombro", e1rm: 10.2 }],
    recordeAntes: [{ exerciseId: EX, e1rm: 9.8 }],
    refeicoes: [prot("2026-10-02", 100), prot("2026-10-05", 160), prot("2026-10-07", 100), prot("2026-11-02", 160), prot("2026-11-05", 155), prot("2026-11-07", 100)] });
  const v = evolucao(MES, [r], opts("2026-11-20", GANHAR, { nome: () => "Elevação lateral" }));
  const t = (id: string) => v.conquistas.find((x) => x.id.endsWith(`:${id}`))?.texto;
  assert.equal(t(`recorde-${EX}`), "Recorde de força em Elevação lateral: 10,2 kg (e1RM)");
  assert.equal(v.treino.e1rm[0].recorde, true);
  assert.equal(t("semanas"), "4 semanas seguidas na meta de treinos", "a semana de 19/10 não bateu: a sequência começa depois dela");
  assert.equal(t("dias"), "3 dias de treino a mais que o período anterior");
  assert.equal(t("proteina"), "Proteína batida em mais dias: 67% dos dias (eram 33%)");
  // sem histórico antes, o 1º e1RM não é "recorde"
  const novo = evolucao(MES, [{ ...r, recordeAntes: [], e1rm: r.e1rm.slice(1) }], opts("2026-11-20"));
  assert.equal(novo.treino.e1rm[0]?.recorde ?? false, false);
});

test("conquistas: nada melhorou → lista vazia; texto nunca é bronca", () => {
  const r = raw("2026-10", "2026-11", { primeiro: "2026-01-05", sessoes: ["2026-10-02", "2026-10-05", "2026-10-07", "2026-11-03"],
    sono: [{ date: "2026-10-03", horas: 8 }, { date: "2026-11-03", horas: 6 }], alcool: [{ date: "2026-10-03", doses: 1 }, { date: "2026-11-03", doses: 4 }],
    ...corpo([["2026-10-08", 72.0], ["2026-11-15", 71.5]], [["2026-10-10", 34.0, 79.0], ["2026-11-10", 33.5, 80.5]]) });
  assert.deepEqual(evolucao(MES, [r], opts("2026-11-20", GANHAR)).conquistas, []);
  // o que aparece é sempre positivo, sem exclamação nem culpa
  const bom = raw("2026-10", "2026-11", { primeiro: "2026-01-05", sono: [{ date: "2026-10-03", horas: 6 }, { date: "2026-11-03", horas: 7 }],
    agua: [{ date: "2026-10-03", litros: 1.5 }, { date: "2026-11-03", litros: 2.5 }], alcool: [{ date: "2026-10-03", doses: 5 }, { date: "2026-11-03", doses: 1 }] });
  const c = evolucao(MES, [bom], opts("2026-11-20")).conquistas;
  assert.deepEqual(c.map((x) => x.id.split(":").pop()).sort(), ["agua", "alcool", "sono"]);
  for (const x of c) assert.doesNotMatch(x.texto, /!|pior|caiu|falt|abaixo|devia|precisa/i);
  assert.ok(c.every((x) => x.id.startsWith("mes:2026-11-01:")), "o id leva o período: no mês que vem a conquista é outra");
});

test("diferença escrita: nunca só o sinal nem só a cor", () => {
  assert.equal(difTextoEvo(2, ["dia", "dias"], "anterior"), "2 dias a mais que o período anterior");
  assert.equal(difTextoEvo(-1, ["dia", "dias"], "anterior"), "1 dia a menos que o período anterior");
  assert.equal(difTextoEvo(0.5, ["kg", "kg"], "comeco", 1), "0,5 kg a mais que no começo");
  assert.equal(difTextoEvo(0, ["dia", "dias"], "comeco"), "igual ao começo");
  assert.equal(difTextoEvo(null, ["dia", "dias"], "anterior"), "sem dado do período anterior");
});
