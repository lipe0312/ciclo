// #73 Hoje como home: cartão de boas-vindas com prazo, "Complete o perfil" adiável, caminho de evolução, médias de 7 dias
// (proteína, água, sono), próximo treino e atalhos. Dados fictícios.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BOAS_VINDAS_DIAS, PERFIL_ADIA_DIAS, atalhosHome, cartaoBoasVindas, cartaoCompletePerfil, ctxDoPerfil, dataSP, homeView, marcosEvolucao,
  mediasSemana, proximoTreino,
} from "../src/index.ts";
import type { HomeRaw, MarcosRaw } from "../src/index.ts";

const HOJE = "2026-11-12"; // quinta
const add = (iso: string, n: number) => new Date(Date.parse(iso + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);

// ---------- cartão de boas-vindas ----------
test("boas-vindas: aparece logo depois do checkup e nos dias 1 e 2", () => {
  const base = { checkupEm: HOJE, primeiroTreinoEm: null, dispensadoEm: null };
  assert.equal(cartaoBoasVindas({ ...base, hoje: HOJE }), "mostrar");
  assert.equal(cartaoBoasVindas({ ...base, hoje: add(HOJE, 1) }), "mostrar");
  assert.equal(cartaoBoasVindas({ ...base, hoje: add(HOJE, 2) }), "mostrar"); // limite: 2 dias ainda mostra
});

test("boas-vindas: gatilho 1, o 1º treino esconde (mesmo no dia do checkup)", () => {
  assert.equal(cartaoBoasVindas({ checkupEm: HOJE, primeiroTreinoEm: HOJE, dispensadoEm: null, hoje: HOJE }), "oculto");
  assert.equal(cartaoBoasVindas({ checkupEm: HOJE, primeiroTreinoEm: add(HOJE, -30), dispensadoEm: null, hoje: HOJE }), "oculto");
});

test("boas-vindas: gatilho 2, 3 dias depois do checkup some de vez", () => {
  const base = { checkupEm: HOJE, primeiroTreinoEm: null, dispensadoEm: null };
  assert.equal(BOAS_VINDAS_DIAS, 3);
  assert.equal(cartaoBoasVindas({ ...base, hoje: add(HOJE, 3) }), "oculto"); // limite: 3 dias esconde
  assert.equal(cartaoBoasVindas({ ...base, hoje: add(HOJE, 40) }), "oculto");
});

test("boas-vindas: gatilho 3, dispensar esconde e não volta", () => {
  assert.equal(cartaoBoasVindas({ checkupEm: HOJE, primeiroTreinoEm: null, dispensadoEm: HOJE, hoje: HOJE }), "oculto");
  assert.equal(cartaoBoasVindas({ checkupEm: HOJE, primeiroTreinoEm: null, dispensadoEm: HOJE, hoje: add(HOJE, 1) }), "oculto");
});

test("boas-vindas: sem checkup feito não há cartão; data inválida não mostra", () => {
  assert.equal(cartaoBoasVindas({ checkupEm: null, primeiroTreinoEm: null, dispensadoEm: null, hoje: HOJE }), "oculto");
  assert.equal(cartaoBoasVindas({ checkupEm: "ontem", primeiroTreinoEm: null, dispensadoEm: null, hoje: HOJE }), "oculto");
});

// ---------- complete o perfil ----------
test("complete o perfil: aparece enquanto falta algo; 'Lembrar depois' esconde por 7 dias", () => {
  assert.equal(PERFIL_ADIA_DIAS, 7);
  assert.equal(cartaoCompletePerfil({ falta: 2, adiadoEm: null, hoje: HOJE }), "mostrar");
  assert.equal(cartaoCompletePerfil({ falta: 0, adiadoEm: null, hoje: HOJE }), "oculto");
  assert.equal(cartaoCompletePerfil({ falta: 2, adiadoEm: HOJE, hoje: add(HOJE, 6) }), "oculto");
  assert.equal(cartaoCompletePerfil({ falta: 2, adiadoEm: HOJE, hoje: add(HOJE, 7) }), "mostrar");
});

test("dataSP: dia em America/Sao_Paulo (UTC−3)", () => {
  assert.equal(dataSP(Date.UTC(2026, 10, 12, 2, 59)), "2026-11-11"); // 23h59 em SP
  assert.equal(dataSP(Date.UTC(2026, 10, 12, 3, 0)), "2026-11-12");
  assert.equal(dataSP(null), null);
});

// ---------- caminho de evolução ----------
const VAZIO: MarcosRaw = { contaEm: HOJE, perfilEm: null, semanaEm: null, primeiroTreinoEm: null, primeiraMedidaEm: null, diasComida: [], diasTreino: [] };

test("marcos: conta vazia, só 'conta criada' feito e o próximo é o perfil", () => {
  const m = marcosEvolucao(VAZIO);
  assert.deepEqual(m.map((x) => x.id), ["conta", "perfil", "semana", "treino", "medida", "comida7", "semanas4"]);
  assert.deepEqual(m.map((x) => x.feito), [true, false, false, false, false, false, false]);
  assert.equal(m[0].data, HOJE);
  assert.deepEqual(m.filter((x) => x.proximo).map((x) => x.id), ["perfil"]);
  assert.ok(m.every((x) => x.href.startsWith("#") && x.texto && x.cta));
  assert.equal(m.find((x) => x.id === "treino")!.href, "#treino");
  assert.equal(m.find((x) => x.id === "medida")!.href, "#corpo");
  assert.equal(m.find((x) => x.id === "comida7")!.href, "#comida");
  assert.equal(m.find((x) => x.id === "comida7")!.progresso, "0 de 7");
});

test("marcos: conta cheia, tudo feito com data e nenhum 'próximo'", () => {
  // 4 semanas seguidas: segundas 19/10, 26/10, 02/11, 09/11
  const diasTreino = ["2026-10-19", "2026-10-22", "2026-10-27", "2026-11-03", "2026-11-10"];
  const diasComida = Array.from({ length: 9 }, (_, i) => add("2026-10-20", i));
  const m = marcosEvolucao({ contaEm: "2026-10-15", perfilEm: "2026-10-15", semanaEm: "2026-10-16", primeiroTreinoEm: "2026-10-19", primeiraMedidaEm: "2026-10-18", diasComida, diasTreino });
  assert.ok(m.every((x) => x.feito));
  assert.ok(!m.some((x) => x.proximo));
  assert.equal(m.find((x) => x.id === "comida7")!.data, "2026-10-26"); // o 7º dia
  assert.equal(m.find((x) => x.id === "semanas4")!.data, "2026-11-10"); // 1º treino da 4ª semana seguida
});

test("marcos: caminho parcial, progresso de comida e da sequência viva", () => {
  const m = marcosEvolucao({ ...VAZIO, perfilEm: HOJE, semanaEm: HOJE, primeiroTreinoEm: add(HOJE, -10), diasComida: [add(HOJE, -2), add(HOJE, -1), add(HOJE, -1), HOJE], diasTreino: [add(HOJE, -10), add(HOJE, -3)] });
  assert.deepEqual(m.map((x) => x.feito), [true, true, true, true, false, false, false]);
  assert.deepEqual(m.filter((x) => x.proximo).map((x) => x.id), ["medida"]);
  assert.equal(m.find((x) => x.id === "comida7")!.progresso, "3 de 7"); // dia repetido conta uma vez
  assert.equal(m.find((x) => x.id === "semanas4")!.progresso, "2 de 4");
  // sequência quebrada há tempo não conta como progresso
  const velho = marcosEvolucao({ ...VAZIO, diasTreino: ["2026-09-01", "2026-09-08"] }, HOJE);
  assert.equal(velho.find((x) => x.id === "semanas4")!.progresso, "0 de 4");
});

// ---------- médias da semana ----------
test("médias: proteína, água e sono de 7 dias contra a semana passada; dia sem registro fica null", () => {
  const raw = {
    comida: [{ date: HOJE, kcal: 2000, prot: 120 }, { date: add(HOJE, -1), kcal: 2000, prot: 100 }, { date: add(HOJE, -8), kcal: 2000, prot: 90 }],
    agua: [{ date: HOJE, litros: 2.5 }, { date: add(HOJE, -2), litros: 1.5 }, { date: add(HOJE, -9), litros: 3 }],
    sono: [{ date: HOJE, horas: 7 }, { date: add(HOJE, -1), horas: 8 }, { date: add(HOJE, -10), horas: 6 }],
  };
  const [p, a, s] = mediasSemana(raw, HOJE, 130);
  assert.deepEqual([p.id, a.id, s.id], ["prot", "agua", "sono"]);
  assert.equal(p.media, 110); assert.equal(p.meta, 130); assert.equal(p.anterior, 90); assert.equal(p.variacao, "sobe");
  assert.equal(p.dias.length, 7); assert.equal(p.dias[6].v, 120); assert.equal(p.dias[0].v, null);
  assert.equal(a.media, 2); assert.equal(a.anterior, 3); assert.equal(a.variacao, "desce");
  assert.equal(s.media, 7.5); assert.equal(s.anterior, 6); assert.equal(s.variacao, "sobe");
  assert.equal(s.dias[5].v, 8);
});

test("médias: sem dado não vira 0, vem o estado vazio com CTA", () => {
  const ms = mediasSemana({ comida: [], agua: [], sono: [] }, HOJE, 130);
  for (const m of ms) {
    assert.equal(m.media, null); assert.equal(m.variacao, null);
    assert.ok(m.dias.every((d) => d.v === null));
    assert.ok(m.vazio.texto && m.vazio.cta && m.vazio.href.startsWith("#"));
  }
  assert.match(ms[1].vazio.texto, /checkout/);
  // só a semana atual: sem comparação
  const so = mediasSemana({ comida: [], agua: [], sono: [{ date: HOJE, horas: 7 }] }, HOJE, 130);
  assert.equal(so[2].media, 7); assert.equal(so[2].anterior, null); assert.equal(so[2].variacao, null);
  // valores absurdos ficam de fora
  const ruim = mediasSemana({ comida: [], agua: [{ date: HOJE, litros: Number.NaN }], sono: [{ date: HOJE, horas: -1 }] }, HOJE, 130);
  assert.equal(ruim[1].media, null); assert.equal(ruim[2].media, null);
});

// ---------- próximo treino ----------
test("próximo treino: hoje com plano → null; senão o próximo dia com treino", () => {
  const d = (date: string, kind: string, status = "planejado", temPlano = true) => ({ date, kind, status, temPlano });
  const semana = [d("2026-11-09", "treino", "feito"), d("2026-11-12", "folga", "folga", false), d("2026-11-13", "treino"), d("2026-11-14", "treino")];
  assert.deepEqual(proximoTreino(semana, HOJE), { hojeTreino: false, proximo: "2026-11-13" });
  assert.deepEqual(proximoTreino([d(HOJE, "treino")], HOJE), { hojeTreino: true, proximo: null });
  assert.deepEqual(proximoTreino([d(HOJE, "treino", "feito")], HOJE), { hojeTreino: false, proximo: null });
  assert.deepEqual(proximoTreino([], HOJE), { hojeTreino: false, proximo: null });
});

// ---------- atalhos ----------
test("atalhos: 6 destinos certos, cada um com micro-status", () => {
  const a = atalhosHome({ hoje: HOJE, semana: { feitos: 2, treinos: 4 }, ultimaMedida: add(HOJE, -12), diasComida: 3, checkinHoje: false, academias: 1 });
  assert.deepEqual(a.map((x) => [x.id, x.href]), [["semana", "#semana"], ["corpo", "#corpo"], ["comida", "#comida"], ["diario", "#diario"], ["chat", "#chat"], ["academias", "#academias"]]);
  assert.equal(a[0].status, "2 de 4 treinos");
  assert.equal(a[1].status, "última medida há 12 dias");
  assert.equal(a[2].status, "3 de 7 dias registrados");
  assert.equal(a[3].status, "check-in pendente");
  assert.equal(a[5].status, "1 lugar");
  const z = atalhosHome({ hoje: HOJE, semana: null, ultimaMedida: null, diasComida: 0, checkinHoje: true, academias: 0 });
  assert.equal(z[0].status, "sem plano ainda"); assert.equal(z[1].status, "nenhuma medida ainda"); assert.equal(z[3].status, "check-in feito hoje");
  assert.equal(z[5].status, "nenhum lugar ainda");
  assert.equal(atalhosHome({ hoje: HOJE, semana: null, ultimaMedida: HOJE, diasComida: 1, checkinHoje: true, academias: 2 })[1].status, "medido hoje");
});

// ---------- homeView ----------
const NADA: HomeRaw = { sets: [], e1rm: [], sessoes: [], presenca: [], cardio: [], pesos: [], medidas: [], comida: [], checkins: [], checkouts: [] };
const ctx = { ...ctxDoPerfil(null), hoje: HOJE, diasDevidos: 7, aparelhosSemMidia: 0 };

test("homeView: leva boas-vindas, marcos e médias; conta antiga (sem os campos novos) não quebra", () => {
  const v = homeView(NADA, ctx);
  assert.equal(v.boasVindas, "oculto");
  assert.equal(v.marcos.length, 7);
  assert.equal(v.medias.length, 3);
  assert.equal(v.perfilAdiadoEm, null);
  const w = homeView({ ...NADA, checkupEm: HOJE, contaEm: HOJE, perfilEm: HOJE, sono: [{ date: HOJE, horas: 7 }] }, ctx);
  assert.equal(w.boasVindas, "mostrar");
  assert.equal(w.medias[2].media, 7);
  // o 1º treino esconde; a dispensa também; a data do servidor manda
  assert.equal(homeView({ ...NADA, checkupEm: HOJE, primeiroTreinoEm: HOJE }, ctx).boasVindas, "oculto");
  assert.equal(homeView({ ...NADA, checkupEm: HOJE, boasVindasDispensadoEm: HOJE }, ctx).boasVindas, "oculto");
  assert.equal(homeView({ ...NADA, checkupEm: HOJE }, { ...ctx, hojeServidor: add(HOJE, 3) }).boasVindas, "oculto");
});
