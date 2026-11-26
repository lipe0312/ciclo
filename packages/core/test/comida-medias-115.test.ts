// #115 Médias de comida com refeições não registradas: dia vazio fica fora, café/almoço/jantar faltando são completados
// com a média da refeição, lanche e ceia não, "não comi" conta 0 de verdade. Cada parâmetro muda a conta. Dados fictícios.
import { test } from "node:test";
import assert from "node:assert/strict";
import { foodAverages } from "../src/index.ts";
import type { FoodEntry } from "../src/index.ts";
import { REGRAS_MEDIAS_PADRAO, diaComMedias, lerRegrasMedias, mediasPorRefeicao, mediasSemana, refeicoesACompletar, regrasMediasDe } from "../src/comida-medias.ts";
import type { RegrasMedias } from "../src/comida-medias.ts";

const ALVO = { kcal: 2500, protein: 150 };
// histórico fictício: café 400 kcal/30 g, almoço 800/50, lanche 300/20, jantar 700/45 (todos os dias de 01 a 05)
const HIST: FoodEntry[] = ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"].flatMap((date) => [
  { date, meal: "cafe" as const, kcal: 400, prot: 30 },
  { date, meal: "almoco" as const, kcal: 800, prot: 50 },
  { date, meal: "lanche" as const, kcal: 300, prot: 20 },
  { date, meal: "jantar" as const, kcal: 700, prot: 45 },
]);
const MEDIAS = mediasPorRefeicao(HIST, "2026-11-05");
const ctx = (regras: RegrasMedias = REGRAS_MEDIAS_PADRAO, naoComi: { date: string; meal: "cafe" | "almoco" | "lanche" | "jantar" | "ceia" }[] = []) => ({ regras, naoComi, medias: MEDIAS });
const com = (over: Partial<RegrasMedias["completar"]>, diaVazio: RegrasMedias["diaVazio"] = "fora"): RegrasMedias => ({ completar: { ...REGRAS_MEDIAS_PADRAO.completar, ...over }, diaVazio });

test("média de cada refeição: só os dias em que ela foi registrada", () => {
  assert.deepEqual(MEDIAS.cafe, { kcal: 400, prot: 30, dias: 5 });
  assert.deepEqual(MEDIAS.jantar, { kcal: 700, prot: 45, dias: 5 });
  assert.equal(MEDIAS.ceia, undefined, "nunca registrou ceia: sem média");
  // dois registros no mesmo café somam antes de tirar a média
  const m = mediasPorRefeicao([{ date: "2026-11-01", meal: "cafe", kcal: 200, prot: 10 }, { date: "2026-11-01", meal: "cafe", kcal: 200, prot: 10 }, { date: "2026-11-02", meal: "cafe", kcal: 600, prot: 40 }], "2026-11-02");
  assert.deepEqual(m.cafe, { kcal: 500, prot: 30, dias: 2 });
});

test("padrão: café, almoço e jantar completáveis; lanche e ceia não; dia vazio fora", () => {
  assert.deepEqual(REGRAS_MEDIAS_PADRAO, { completar: { cafe: true, almoco: true, lanche: false, jantar: true, ceia: false }, diaVazio: "fora" });
});

test("dia sem nenhum registro fica fora da média (padrão)", () => {
  const entries: FoodEntry[] = [
    { date: "2026-11-10", meal: "cafe", kcal: 400, prot: 30 }, { date: "2026-11-10", meal: "almoco", kcal: 800, prot: 50 }, { date: "2026-11-10", meal: "jantar", kcal: 700, prot: 45 },
  ];
  const a = mediasSemana(entries, "2026-11-11", ALVO, 2, ctx());
  assert.equal(a.daysLogged, 1, "o dia 11 (vazio) não entra");
  assert.equal(a.avgKcal, 1900);
  const d = a.days.find((x) => x.date === "2026-11-11")!;
  assert.equal(d.conta, false);
  assert.deepEqual(d.estimadas, [], "dia vazio não é completado");
});

test("dia vazio conta como 0 quando a pessoa escolhe", () => {
  const entries: FoodEntry[] = [{ date: "2026-11-10", meal: "cafe", kcal: 400, prot: 30 }, { date: "2026-11-10", meal: "almoco", kcal: 800, prot: 50 }, { date: "2026-11-10", meal: "jantar", kcal: 700, prot: 45 }];
  const a = mediasSemana(entries, "2026-11-11", ALVO, 2, ctx(com({}, "zero")));
  assert.equal(a.daysLogged, 2);
  assert.equal(a.avgKcal, 950, "(1900 + 0) / 2");
  assert.equal(a.days[1].kcal, 0);
  assert.deepEqual(a.days[1].estimadas, [], "dia contado como 0 não é completado");
});

test("café faltando é completado com a média do café; lanche faltando não", () => {
  const entries: FoodEntry[] = [{ date: "2026-11-10", meal: "almoco", kcal: 900, prot: 60 }, { date: "2026-11-10", meal: "jantar", kcal: 600, prot: 40 }];
  const d = diaComMedias(entries, "2026-11-10", ctx());
  assert.deepEqual(d.estimadas, [{ meal: "cafe", kcal: 400, prot: 30 }], "só o café: lanche e ceia não são completados por padrão");
  assert.equal(d.kcal, 1900, "900 + 600 + 400 (café pela média)");
  assert.equal(d.prot, 130);
  assert.deepEqual(d.real, { kcal: 1500, prot: 100 });
  assert.equal(d.conta, true);
  // na média da semana o valor estimado entra e fica marcado
  const a = mediasSemana(entries, "2026-11-10", ALVO, 1, ctx());
  assert.equal(a.avgKcal, 1900);
  assert.equal(a.diasEstimados, 1);
});

test("almoço e jantar faltando também são completados; refeição sem média fica de fora (sem chutar)", () => {
  const d = diaComMedias([{ date: "2026-11-10", meal: "lanche", kcal: 300, prot: 20 }], "2026-11-10", ctx());
  assert.deepEqual(d.estimadas.map((e) => e.meal), ["cafe", "almoco", "jantar"]);
  assert.equal(d.kcal, 300 + 400 + 800 + 700);
  const semMedia = diaComMedias([{ date: "2026-11-10", meal: "lanche", kcal: 300, prot: 20 }], "2026-11-10", { ...ctx(com({ ceia: true })), medias: {} });
  assert.deepEqual(semMedia.estimadas, [], "sem histórico da refeição não há média para completar");
  assert.equal(semMedia.kcal, 300);
});

test("\"não comi\" conta 0 de verdade e não é completado", () => {
  const entries: FoodEntry[] = [{ date: "2026-11-10", meal: "almoco", kcal: 900, prot: 60 }, { date: "2026-11-10", meal: "jantar", kcal: 600, prot: 40 }];
  const d = diaComMedias(entries, "2026-11-10", ctx(REGRAS_MEDIAS_PADRAO, [{ date: "2026-11-10", meal: "cafe" }]));
  assert.deepEqual(d.estimadas, []);
  assert.deepEqual(d.naoComi, ["cafe"]);
  assert.equal(d.kcal, 1500);
  // só "não comi" no dia: o dia entra (a pessoa registrou que não comeu) e o resto completável é completado
  const so = diaComMedias([], "2026-11-12", ctx(REGRAS_MEDIAS_PADRAO, [{ date: "2026-11-12", meal: "cafe" }]));
  assert.equal(so.conta, true);
  assert.deepEqual(so.estimadas.map((e) => e.meal), ["almoco", "jantar"]);
  // registro na refeição vence o "não comi" (a pessoa comeu depois)
  const v = diaComMedias([{ date: "2026-11-10", meal: "cafe", kcal: 200, prot: 10 }], "2026-11-10", ctx(REGRAS_MEDIAS_PADRAO, [{ date: "2026-11-10", meal: "cafe" }]));
  assert.deepEqual(v.naoComi, []);
  // não comi o lanche também vale (não muda a conta, mas fica registrado)
  const l = diaComMedias(entries, "2026-11-10", ctx(REGRAS_MEDIAS_PADRAO, [{ date: "2026-11-10", meal: "lanche" }]));
  assert.deepEqual(l.naoComi, ["lanche"]);
});

test("cada parâmetro alterado muda a conta: desligar o café, ligar o lanche, ligar a ceia", () => {
  const entries: FoodEntry[] = [{ date: "2026-11-10", meal: "almoco", kcal: 900, prot: 60 }];
  const base = diaComMedias(entries, "2026-11-10", ctx()).estimadas.map((e) => e.meal);
  assert.deepEqual(base, ["cafe", "jantar"]);
  assert.deepEqual(diaComMedias(entries, "2026-11-10", ctx(com({ cafe: false }))).estimadas.map((e) => e.meal), ["jantar"], "café desligado");
  assert.deepEqual(diaComMedias(entries, "2026-11-10", ctx(com({ jantar: false }))).estimadas.map((e) => e.meal), ["cafe"], "jantar desligado");
  assert.deepEqual(diaComMedias([{ date: "2026-11-10", meal: "cafe", kcal: 1, prot: 1 }], "2026-11-10", ctx(com({ almoco: false }))).estimadas.map((e) => e.meal), ["jantar"], "almoço desligado");
  assert.deepEqual(diaComMedias(entries, "2026-11-10", ctx(com({ lanche: true }))).estimadas.map((e) => e.meal), ["cafe", "lanche", "jantar"], "lanche ligado");
  const ceia = { ...MEDIAS, ceia: { kcal: 200, prot: 10, dias: 3 } };
  assert.deepEqual(diaComMedias(entries, "2026-11-10", { regras: com({ ceia: true }), naoComi: [], medias: ceia }).estimadas.map((e) => e.meal), ["cafe", "jantar", "ceia"], "ceia ligada");
  // estrito: nada completado
  const estrito = com({ cafe: false, almoco: false, jantar: false });
  assert.equal(diaComMedias(entries, "2026-11-10", ctx(estrito)).kcal, 900);
  // sem contexto: o comportamento antigo (só o registrado; dia vazio fora)
  const a = foodAverages(entries, "2026-11-10", ALVO, 1);
  assert.equal(a.avgKcal, 900);
});

test("hoje: refeição que ainda não passou não falta (nem é completada)", () => {
  const entries: FoodEntry[] = [{ date: "2026-11-20", meal: "cafe", kcal: 400, prot: 30 }];
  const manha = diaComMedias(entries, "2026-11-20", { ...ctx(), agora: { date: "2026-11-20", hora: 11 } });
  assert.deepEqual(manha.estimadas, [], "às 11h almoço e jantar ainda vão acontecer");
  const noite = diaComMedias(entries, "2026-11-20", { ...ctx(), agora: { date: "2026-11-20", hora: 23 } });
  assert.deepEqual(noite.estimadas.map((e) => e.meal), ["almoco", "jantar"]);
  const ontem = diaComMedias(entries, "2026-11-19", { ...ctx(), agora: { date: "2026-11-20", hora: 8 } });
  assert.equal(ontem.conta, false, "ontem sem nada: fora");
});

test("refeicoesACompletar: o que a prévia do MCP pergunta (\"não comeu ou esqueceu?\")", () => {
  const f = refeicoesACompletar([{ date: "2026-11-10", meal: "almoco", kcal: 900, prot: 60 }], "2026-11-10", ctx());
  assert.deepEqual(f, [{ meal: "cafe", media: { kcal: 400, prot: 30 } }, { meal: "jantar", media: { kcal: 700, prot: 45 } }]);
  assert.deepEqual(refeicoesACompletar([{ date: "2026-11-10", meal: "almoco", kcal: 900, prot: 60 }], "2026-11-10", ctx(REGRAS_MEDIAS_PADRAO, [{ date: "2026-11-10", meal: "cafe" }])).map((x) => x.meal), ["jantar"]);
  // sem média: ainda pergunta (a resposta "não comi" vale), mas sem número
  assert.deepEqual(refeicoesACompletar([{ date: "2026-11-10", meal: "almoco", kcal: 900, prot: 60 }], "2026-11-10", { ...ctx(com({ ceia: true })), medias: {} }).map((x) => [x.meal, x.media]), [["cafe", null], ["jantar", null], ["ceia", null]]);
});

test("validação das preferências: tipo e valor errados são recusados; leitura do banco cai no padrão", () => {
  assert.deepEqual(lerRegrasMedias({ completar: { cafe: false }, diaVazio: "zero" }), { ok: true, regras: { completar: { ...REGRAS_MEDIAS_PADRAO.completar, cafe: false }, diaVazio: "zero" } });
  assert.equal(lerRegrasMedias({ completar: { cafe: "sim" } }).ok, false, "booleano em texto");
  assert.equal(lerRegrasMedias({ completar: { pizza: true } }).ok, false, "refeição desconhecida");
  assert.equal(lerRegrasMedias({ diaVazio: "meio" }).ok, false);
  assert.equal(lerRegrasMedias({ diaVazio: 0 }).ok, false);
  assert.equal(lerRegrasMedias([]).ok, false);
  assert.equal(lerRegrasMedias(null).ok, false);
  assert.equal(lerRegrasMedias({}).ok, false, "nada para mudar");
  assert.equal(lerRegrasMedias({ completar: [] }).ok, false);
  assert.deepEqual(regrasMediasDe(null), REGRAS_MEDIAS_PADRAO);
  assert.deepEqual(regrasMediasDe({ completar: { cafe: 0, lanche: 1 }, diaVazio: "zero" }), { completar: { ...REGRAS_MEDIAS_PADRAO.completar, cafe: false, lanche: true }, diaVazio: "zero" });
  assert.deepEqual(regrasMediasDe({ completar: { cafe: "x" }, diaVazio: "?" }), REGRAS_MEDIAS_PADRAO, "lixo vira o padrão");
});
