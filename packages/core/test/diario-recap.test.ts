// #42 Diário 2.0: janelas do recap (fds/semana/mês) com bordas e fuso, álcool → kcal, refeições faltando,
// modo de confirmação, entrada do dia e "vai treinar hoje?". Dados fictícios.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  reviewWindow, diaDoDiario, emFimDeSemana, recapKindOf, mergeRecap, alcoolKcal, totalDoses, bebidaTexto, ALCOOL_KCAL,
  refeicoesFaltando, estimativaRefeicao, recapModo, recapLinhas, recapMes, entradaDoDia, sugerirTreinoHoje, recapDias,
} from "../src/index.ts";
import type { RecapPeriodo } from "../src/index.ts";

// America/Bahia = UTC-3 o ano todo (sem horário de verão)
const at = (iso: string) => Date.parse(`${iso}:00-03:00`);
const FRI = "2026-11-13", SAT = "2026-11-14", SUN = "2026-11-15", MON = "2026-11-16", TUE = "2026-11-17";
const FDS: RecapPeriodo = { kind: "fds", from: FRI, to: SUN };

test("dia do diário começa às 07:00 no fuso America/Bahia", () => {
  assert.equal(diaDoDiario(at(`${MON}T06:59`)), SUN);
  assert.equal(diaDoDiario(at(`${MON}T07:00`)), MON);
  // 09:30 UTC = 06:30 em Salvador (ainda domingo no diário), mas já 07:30 em UTC+1
  assert.equal(diaDoDiario(Date.parse(`${MON}T09:30:00Z`), "America/Bahia"), SUN);
  assert.equal(diaDoDiario(Date.parse(`${MON}T09:30:00Z`), "UTC"), MON);
});

test("fim de semana = sexta 19:00 até domingo 23:59 (borda 18:59/19:00)", () => {
  assert.equal(emFimDeSemana(at(`${FRI}T18:59`)), false);
  assert.equal(emFimDeSemana(at(`${FRI}T19:00`)), true);
  assert.equal(emFimDeSemana(at(`${SAT}T03:00`)), true);
  assert.equal(emFimDeSemana(at(`${SUN}T23:59`)), true);
  assert.equal(emFimDeSemana(at(`${MON}T00:00`)), false);
  // durante o fds nunca há review: ele só aparece a partir de segunda 07:00
  assert.equal(reviewWindow("2026-11-12", at(`${FRI}T18:59`)).kind, "nada");
  assert.equal(reviewWindow("2026-11-12", at(`${FRI}T19:00`)).kind, "nada");
  assert.equal(reviewWindow(FRI, at(`${SUN}T23:59`)).kind, "nada");
});

test("segunda 06:59 ainda não; 07:00 → recap do fds (sexta a domingo)", () => {
  assert.deepEqual(reviewWindow(FRI, at(`${MON}T06:59`)), { kind: "nada", from: null, to: null, hoje: SUN });
  assert.deepEqual(reviewWindow(FRI, at(`${MON}T07:00`)), { kind: "fds", from: FRI, to: SUN, hoje: MON });
});

test("abriu no sábado e depois segunda 07:05 → recap do fds aparece mesmo assim", () => {
  assert.deepEqual(reviewWindow(SAT, at(`${MON}T07:05`)), { kind: "fds", from: FRI, to: SUN, hoje: MON });
  assert.equal(reviewWindow(SUN, at(`${MON}T07:05`)).kind, "fds", "abriu até no domingo");
  // não abriu na segunda: na terça ainda pede o mesmo fds
  assert.deepEqual(reviewWindow(SAT, at(`${TUE}T12:00`)), { kind: "fds", from: FRI, to: SUN, hoje: TUE });
  // já abriu segunda depois das 07:00: não pede de novo
  assert.equal(reviewWindow(MON, at(`${MON}T20:00`)).kind, "nada");
  assert.equal(reviewWindow(MON, at(`${TUE}T08:00`)).kind, "nada");
});

test("ausência de 2 a 7 dias → semana (com o fds dentro); > 3 semanas → mês", () => {
  assert.deepEqual(reviewWindow("2026-11-11", at(`${MON}T08:00`)), { kind: "semana", from: "2026-11-12", to: SUN, hoje: MON }, "qua → seg");
  assert.deepEqual(reviewWindow("2026-11-09", at(`${MON}T08:00`)), { kind: "semana", from: "2026-11-10", to: SUN, hoje: MON }, "7 dias");
  assert.deepEqual(reviewWindow("2026-11-10", at("2026-11-13T08:00")), { kind: "semana", from: "2026-11-11", to: "2026-11-12", hoje: "2026-11-13" }, "no meio da semana");
  assert.equal(reviewWindow("2026-11-11", at("2026-11-12T08:00")).kind, "nada", "1 dia não é ausência");
  // 25 dias fora → mês (médias)
  const m = reviewWindow("2026-10-22", at(`${MON}T08:00`));
  assert.deepEqual(m, { kind: "mes", from: "2026-10-23", to: SUN, hoje: MON });
  // 40 dias fora: só os últimos 30
  assert.deepEqual(reviewWindow("2026-10-07", at(`${MON}T08:00`)), { kind: "mes", from: "2026-10-17", to: SUN, hoje: MON });
  // 21 dias ainda é semana, mas com no máximo 14 dias (um formulário só)
  assert.deepEqual(reviewWindow("2026-10-26", at(`${MON}T08:00`)), { kind: "semana", from: "2026-11-02", to: SUN, hoje: MON });
  assert.equal(reviewWindow(null, at(`${MON}T08:00`)).kind, "nada", "1º uso não pede");
});

test("tipo do período e um review por vez (junta o pendente com o novo)", () => {
  assert.equal(recapKindOf(FRI, SUN), "fds");
  assert.equal(recapKindOf("2026-11-12", SUN), "semana");
  assert.equal(recapKindOf("2026-10-23", SUN), "mes");
  assert.deepEqual(mergeRecap(null, { from: FRI, to: SUN }), { kind: "fds", from: FRI, to: SUN });
  assert.deepEqual(mergeRecap({ from: "2026-11-10", to: "2026-11-11" }, { from: FRI, to: SUN }), { kind: "semana", from: "2026-11-10", to: SUN });
  assert.deepEqual(mergeRecap({ from: FRI, to: SUN }, null), { kind: "fds", from: FRI, to: SUN });
  assert.equal(mergeRecap(null, null), null);
  assert.equal(mergeRecap({ from: "2026-09-01", to: "2026-09-02" }, { from: FRI, to: SUN })!.from, "2026-10-17", "no máximo 30 dias");
  assert.deepEqual(recapDias(FDS), [FRI, SAT, SUN]);
});

test("álcool → kcal: cerveja lata 150, taça de vinho 125, dose de destilado 100", () => {
  assert.deepEqual(ALCOOL_KCAL, { cerveja: 150, vinho: 125, destilado: 100 });
  assert.equal(alcoolKcal({ cerveja: 2 }), 300);
  assert.equal(alcoolKcal({ cerveja: 1, vinho: 2, destilado: 3 }), 700);
  assert.equal(alcoolKcal({}), 0);
  assert.equal(alcoolKcal({ cerveja: -2, vinho: Number.NaN }), 0, "valor inválido não conta");
  assert.equal(totalDoses({ cerveja: 2, destilado: 1 }), 3);
  assert.equal(bebidaTexto({ cerveja: 2 }), "Bebida: 2 cervejas (lata)");
  assert.equal(bebidaTexto({ cerveja: 1, vinho: 1, destilado: 2 }), "Bebida: 1 cerveja (lata), 1 taça de vinho, 2 doses de destilado");
});

test("refeições faltando: lista exatamente as sem registro (sexta do fds só conta a janta)", () => {
  const reg = [
    { date: FRI, meal: "almoco" as const }, // antes das 19:00: fora do fds
    { date: SAT, meal: "cafe" as const }, { date: SAT, meal: "lanche" as const },
    { date: SUN, meal: "cafe" as const }, { date: SUN, meal: "almoco" as const }, { date: SUN, meal: "jantar" as const },
    { date: SUN, meal: null }, // sem refeição: não cobre nenhuma
    { date: MON, meal: "almoco" as const }, // fora do período
  ];
  assert.deepEqual(refeicoesFaltando(FDS, reg), [
    { date: FRI, meals: ["jantar"] },
    { date: SAT, meals: ["almoco", "jantar"] },
    { date: SUN, meals: ["lanche"] },
  ]);
  const tudo = [{ date: FRI, meal: "jantar" as const }, ...["cafe", "almoco", "lanche", "jantar"].flatMap((m) => [{ date: SAT, meal: m as "cafe" }, { date: SUN, meal: m as "cafe" }])];
  assert.deepEqual(refeicoesFaltando(FDS, tudo), []);
  const sem: RecapPeriodo = { kind: "semana", from: "2026-11-12", to: FRI };
  assert.deepEqual(refeicoesFaltando(sem, []).map((d) => d.meals.length), [4, 4], "na semana a sexta conta o dia todo");
});

test("'não lembro' vira estimativa (média da refeição no histórico; sem histórico, um padrão), nunca zero", () => {
  assert.equal(estimativaRefeicao("almoco", [{ meal: "almoco", kcal: 700 }, { meal: "almoco", kcal: 900 }, { meal: "cafe", kcal: 300 }]), 800);
  assert.ok(estimativaRefeicao("jantar", []) > 0);
  assert.ok(estimativaRefeicao("lanche", [{ meal: "lanche", kcal: null }]) > 0);
});

test("fds todo registrado → 1 tela de confirmação; com dia em branco → recap completo; mês → curto", () => {
  const todos = [FRI, SAT, SUN].map((date) => ({ date, checkin: date !== FRI, checkout: true }));
  assert.equal(recapModo(FDS, todos), "confirmar");
  assert.equal(recapModo(FDS, todos.filter((d) => d.date !== SAT)), "completo");
  assert.equal(recapModo(FDS, [{ date: FRI, checkin: false, checkout: false }, ...todos.slice(1)]), "completo");
  assert.equal(recapModo({ kind: "mes", from: "2026-10-23", to: SUN }, todos), "mes");
});

test("linhas da confirmação: álcool, sono, treino/cardio e lacunas de comida por dia", () => {
  const l = recapLinhas(FDS, {
    checkins: [{ date: SAT, sleepH: 6 }, { date: SUN, sleepH: 8 }],
    checkouts: [{ date: FRI, alcohol: 3, trained: false, cardioMin: null, cardioType: null }, { date: SAT, alcohol: 0, trained: false, cardioMin: 60, cardioType: "Futsal" }, { date: SUN, alcohol: null, trained: null, cardioMin: null, cardioType: null }],
    faltando: [{ date: SUN, meals: ["jantar"] }],
  });
  assert.deepEqual(l.map((x) => x.label), ["Sexta à noite", "Sábado", "Domingo"]);
  assert.equal(l[0].texto, "3 doses");
  assert.equal(l[1].texto, "dormiu 6 h · cardio 60 min (Futsal)");
  assert.equal(l[2].texto, "dormiu 8 h");
  assert.deepEqual(l[2].lacunas, ["sem janta registrada"]);
});

test("mês: médias, não dia a dia", () => {
  const p: RecapPeriodo = { kind: "mes", from: "2026-10-23", to: SUN };
  const r = recapMes(p, { checkins: [{ date: "2026-10-25", sleepH: 6 }, { date: "2026-11-01", sleepH: 8 }], checkouts: [{ date: "2026-10-30", alcohol: 4, trained: true }, { date: "2026-11-06", alcohol: 3, trained: false }], treinos: 5 });
  assert.equal(r.dias, 24); assert.equal(r.sonoMedio, 7); assert.equal(r.dosesSemana, 2); assert.equal(r.treinosSemana, 1.5); assert.equal(r.diasRegistrados, 4);
});

test("entrada do dia: recap > vai treinar? > check-in > checkout; um por vez; 'mais tarde' até amanhã 07:00", () => {
  const base = { hoje: MON, hora: 8, recap: null, snoozedOn: null, diaSemTreino: false, respostaTreino: null, treinouHoje: false, checkinHoje: false, checkoutOntem: true, checkoutHoje: false };
  const fds = entradaDoDia({ ...base, recap: FDS, diaSemTreino: true });
  assert.equal(fds?.kind, "recap"); assert.equal(fds?.text, "Como foi o fim de semana?"); assert.equal(fds?.href, "#diario/resumo");
  assert.equal(entradaDoDia({ ...base, recap: { kind: "mes", from: "2026-10-23", to: SUN } })?.text, "Resumo do mês · 1 min");
  assert.equal(entradaDoDia({ ...base, recap: FDS, snoozedOn: MON }), null, "mais tarde: some até o próximo dia do diário");
  assert.equal(entradaDoDia({ ...base, recap: FDS, snoozedOn: SUN })?.kind, "recap", "no dia seguinte volta");
  assert.equal(entradaDoDia({ ...base, diaSemTreino: true })?.kind, "treinar");
  assert.equal(entradaDoDia({ ...base, diaSemTreino: true, respostaTreino: "nao" })?.kind, "checkin", "respondeu: segue o dia");
  assert.equal(entradaDoDia({ ...base, diaSemTreino: true, treinouHoje: true })?.kind, "checkin");
  assert.equal(entradaDoDia(base)?.kind, "checkin", "dia de treino: fluxo normal");
  assert.equal(entradaDoDia({ ...base, checkinHoje: true, checkoutOntem: false })?.href, `#diario/checkout/${SUN}`);
  assert.equal(entradaDoDia({ ...base, checkinHoje: true }), null);
  const noite = entradaDoDia({ ...base, checkinHoje: true, hora: 20 });
  assert.equal(noite?.kind, "checkout"); assert.equal(noite?.href, `#diario/checkout/${MON}`);
  assert.equal(entradaDoDia({ ...base, checkinHoje: true, hora: 20, checkoutHoje: true }), null, "enviou o checkout: a faixa some");
});

test("vai treinar hoje? sugere o dia que cobre os músculos abaixo de 2×", () => {
  const targets = { ombro: 12, biceps: 8, triceps: 8, peito: 8, costas: 10, quad: 8, isquio: 6, gluteo: 6, panturrilha: 0, abdomen: 0 } as never;
  const freq = { ombro: 1, biceps: 2, triceps: 1, peito: 2, costas: 2, quad: 1, isquio: 1, gluteo: 2 };
  const dias = [
    { date: "2026-11-18", name: "Inferior A", perMuscle: { quad: 6, isquio: 4, gluteo: 4 } },
    { date: "2026-11-19", name: "Superior B", perMuscle: { ombro: 6, triceps: 4, biceps: 3 } },
    { date: "2026-11-20", name: "Superior C", perMuscle: { peito: 4, costas: 4 } },
  ];
  const s = sugerirTreinoHoje(dias, freq, targets, ["ombro", "biceps", "triceps"]);
  assert.equal(s?.date, "2026-11-19");
  assert.deepEqual(s?.cobre, ["ombro", "triceps"]);
  // empate em quantidade: vence quem cobre prioridade
  const s2 = sugerirTreinoHoje([dias[0], { date: "2026-11-21", name: "Ombro e tríceps", perMuscle: { ombro: 4, triceps: 3 } }], freq, targets, ["ombro"]);
  assert.equal(s2?.date, "2026-11-21");
  assert.equal(sugerirTreinoHoje([dias[2]], freq, targets, []), null, "nenhum dia cobre o que falta");
  assert.equal(sugerirTreinoHoje([], freq, targets, []), null);
});
