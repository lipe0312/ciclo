// #159 Resumo de treino da Home (Semana | Mês): janela do período, dias contra a meta, séries, cardio, duração média e diferença
// contra o período anterior de mesmo tamanho. Dados fictícios.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DETALHE_SEMANAS, difTexto, homeView, janelaResumo, resumoTreino } from "../src/index.ts";
import type { HomeRaw, ResumoRaw } from "../src/index.ts";

const VAZIO: ResumoRaw = { sets: [], sessoes: [], presenca: [], cardio: [], duracoes: [] };
const MIN = 60_000;
const t = (d: string, h: number, m = 0) => Date.parse(`${d}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`);

test("janela da semana: segunda a domingo, a corrente em andamento; o anterior tem o mesmo tamanho", () => {
  const q = janelaResumo("2026-11-12", "semana"); // quinta
  assert.deepEqual([q.inicio, q.fim, q.decorridos, q.total], ["2026-11-09", "2026-11-12", 4, 7]);
  assert.deepEqual([q.antInicio, q.antFim], ["2026-11-02", "2026-11-05"]);
  const seg = janelaResumo("2026-11-09", "semana");
  assert.deepEqual([seg.inicio, seg.fim, seg.decorridos, seg.antInicio, seg.antFim], ["2026-11-09", "2026-11-09", 1, "2026-11-02", "2026-11-02"]);
  const dom = janelaResumo("2026-11-15", "semana");
  assert.deepEqual([dom.inicio, dom.decorridos, dom.antFim], ["2026-11-09", 7, "2026-11-08"]);
});

test("janela da semana na virada de ano: a semana começa em dezembro", () => {
  const q = janelaResumo("2026-01-01", "semana"); // quinta
  assert.deepEqual([q.inicio, q.fim, q.decorridos], ["2025-12-29", "2026-01-01", 4]);
  assert.deepEqual([q.antInicio, q.antFim], ["2025-12-22", "2025-12-25"]);
});

test("janela do mês: 28, 30 e 31 dias, bissexto e virada de ano", () => {
  const fev = janelaResumo("2026-02-15", "mes");
  assert.deepEqual([fev.inicio, fev.total, fev.decorridos, fev.antInicio, fev.antFim], ["2026-02-01", 28, 15, "2026-01-01", "2026-01-15"]);
  const mar31 = janelaResumo("2026-03-31", "mes"); // o anterior (fevereiro) só tem 28 dias: não passa do fim dele
  assert.deepEqual([mar31.total, mar31.decorridos, mar31.antInicio, mar31.antFim], [31, 31, "2026-02-01", "2026-02-28"]);
  assert.equal(janelaResumo("2028-03-30", "mes").antFim, "2028-02-29"); // fevereiro de 2028 tem 29
  const abr30 = janelaResumo("2026-04-30", "mes");
  assert.deepEqual([abr30.total, abr30.decorridos, abr30.antInicio, abr30.antFim], [30, 30, "2026-03-01", "2026-03-30"]);
  const jan = janelaResumo("2026-01-10", "mes");
  assert.deepEqual([jan.inicio, jan.antInicio, jan.antFim], ["2026-01-01", "2025-12-01", "2025-12-10"]);
  assert.equal(janelaResumo("2026-07-31", "mes").antFim, "2026-06-30");
});

test("dias treinados contra a meta: sessão e 'fui' no mesmo dia contam uma vez; só a janela entra", () => {
  const raw: ResumoRaw = { ...VAZIO,
    sessoes: ["2026-11-09", "2026-11-11", "2026-11-05"], presenca: ["2026-11-11", "2026-11-12", "2026-11-13"] }; // 13 é futuro; 05 é da semana passada
  const r = resumoTreino(raw, { hoje: "2026-11-12", diasMeta: 4 });
  assert.equal(r.semana.atual.dias, 3);
  assert.equal(r.semana.meta, 4);
  assert.equal(r.semana.anterior.dias, 1); // 05/11 está nos mesmos 4 dias (seg a qui) da semana passada
  assert.equal(r.semana.dif.dias, 2);
  // mês de novembro: meta de 4 por semana proporcional aos 30 dias = round(4 × 30 / 7) = 17
  assert.equal(r.mes.meta, 17);
  assert.equal(r.mes.atual.dias, 4); // 05, 09, 11 e 12
});

test("meta de dias do mês fica entre 1 e o tamanho do mês", () => {
  assert.equal(resumoTreino(VAZIO, { hoje: "2026-02-10", diasMeta: 7 }).mes.meta, 28);
  assert.equal(resumoTreino(VAZIO, { hoje: "2026-02-10", diasMeta: 1 }).mes.meta, 4);
  assert.equal(resumoTreino(VAZIO, { hoje: "2026-02-10", diasMeta: 0 }).semana.meta, 1);
});

test("séries totais e cardio (com média por semana só depois de 7 dias)", () => {
  const raw: ResumoRaw = { ...VAZIO,
    sets: [{ date: "2026-11-09", muscle: "ombro", n: 4 }, { date: "2026-11-09", muscle: "biceps", n: 3 }, { date: "2026-11-11", muscle: "triceps", n: 3 }, { date: "2026-11-03", muscle: "ombro", n: 5 }],
    cardio: [{ date: "2026-11-10", minutes: 20 }, { date: "2026-11-12", minutes: 25 }, { date: "2026-11-03", minutes: 30 }, { date: "2026-10-30", minutes: 40 }] };
  const r = resumoTreino(raw, { hoje: "2026-11-12", diasMeta: 3 });
  assert.equal(r.semana.atual.series, 10);
  assert.equal(r.semana.anterior.series, 5);
  assert.equal(r.semana.dif.series, 5);
  assert.equal(r.semana.atual.cardioMin, 45);
  assert.equal(r.semana.atual.cardioMediaSemana, null); // 4 dias: média por semana ainda não faz sentido
  assert.equal(r.semana.dif.cardioMin, 15);
  assert.equal(r.mes.atual.cardioMin, 75); // 03, 10 e 12 de novembro; 30/10 é do mês passado
  assert.equal(r.mes.atual.cardioMediaSemana, 44); // 75 min em 12 dias = 75 × 7 / 12 = 43,75
  assert.equal(r.mes.atual.series, 15);
});

test("duração média: sessão sem finished_at e a que fechou sozinha ficam fora", () => {
  const raw: ResumoRaw = { ...VAZIO, duracoes: [
    { date: "2026-11-09", startedAt: t("2026-11-09", 18), finishedAt: t("2026-11-09", 18, 50) },
    { date: "2026-11-10", startedAt: t("2026-11-10", 18), finishedAt: t("2026-11-10", 19, 10) },
    { date: "2026-11-11", startedAt: t("2026-11-11", 18), finishedAt: null },
    { date: "2026-11-12", startedAt: t("2026-11-12", 7), finishedAt: t("2026-11-12", 9), auto: true },
    { date: "2026-11-03", startedAt: t("2026-11-03", 18), finishedAt: t("2026-11-03", 18, 40) },
  ] };
  const r = resumoTreino(raw, { hoje: "2026-11-12", diasMeta: 4 });
  assert.equal(r.semana.atual.duracaoMin, 60); // (50 + 70) / 2
  assert.equal(r.semana.atual.sessoesComTempo, 2);
  assert.equal(r.semana.anterior.duracaoMin, 40);
  assert.equal(r.semana.dif.duracaoMin, 20);
  assert.equal(r.mes.atual.duracaoMin, 53); // (50 + 70 + 40) / 3 = 53,3
  // fim antes do início (relógio errado) também não entra
  const ruim = resumoTreino({ ...VAZIO, duracoes: [{ date: "2026-11-09", startedAt: 5 * MIN, finishedAt: 1 * MIN }] }, { hoje: "2026-11-12", diasMeta: 4 });
  assert.equal(ruim.semana.atual.duracaoMin, null);
});

test("conta sem nenhum treino: zeros, sem tempo e sem dados", () => {
  const r = resumoTreino(VAZIO, { hoje: "2026-11-12", diasMeta: 4 });
  for (const p of [r.semana, r.mes]) {
    assert.deepEqual(p.atual, { dias: 0, series: 0, cardioMin: 0, cardioMediaSemana: p === r.mes ? 0 : null, duracaoMin: null, sessoesComTempo: 0 });
    assert.equal(p.temDados, false);
    assert.deepEqual(p.dif, { dias: 0, series: 0, cardioMin: 0, duracaoMin: null });
  }
});

test("períodos com treino têm dados; só o anterior com treino também", () => {
  assert.equal(resumoTreino({ ...VAZIO, sessoes: ["2026-11-03"] }, { hoje: "2026-11-12", diasMeta: 4 }).semana.temDados, true);
  assert.equal(resumoTreino({ ...VAZIO, sessoes: ["2026-09-03"] }, { hoje: "2026-11-12", diasMeta: 4 }).semana.temDados, false);
});

test("difTexto escreve o sinal em palavras, no singular e no plural", () => {
  assert.equal(difTexto(1, ["dia", "dias"], "semana"), "1 dia a mais que a semana passada");
  assert.equal(difTexto(-2, ["dia", "dias"], "semana"), "2 dias a menos que a semana passada");
  assert.equal(difTexto(0, ["dia", "dias"], "semana"), "igual à semana passada");
  assert.equal(difTexto(15, ["min", "min"], "mes"), "15 min a mais que o mês passado");
  assert.equal(difTexto(0, ["série", "séries"], "mes"), "igual ao mês passado");
  assert.equal(difTexto(null, ["min", "min"], "semana"), "sem dado na semana passada");
  assert.equal(difTexto(-1, ["série", "séries"], "mes"), "1 série a menos que o mês passado");
});

test("o detalhe usa 4 semanas por padrão e 12 (3 meses) no máximo", () => {
  assert.deepEqual(DETALHE_SEMANAS, { curta: 4, longa: 12 });
});

test("homeView entrega o resumo de treino", () => {
  const raw: HomeRaw = { sets: [{ date: "2026-11-10", muscle: "ombro", n: 4 }], e1rm: [], sessoes: ["2026-11-10"], presenca: [], cardio: [], pesos: [], medidas: [], comida: [], checkins: [], checkouts: [],
    duracoes: [{ date: "2026-11-10", startedAt: t("2026-11-10", 18), finishedAt: t("2026-11-10", 19) }] };
  const v = homeView(raw, { hoje: "2026-11-12", prioridades: ["ombro"], diasMeta: 4, meta: { horizonWeeks: 12, bracoCm: 1.5, cinturaCm: 0, pesoKg: 0, aderenciaPct: 80 }, dieta: { kcal: 2400, protein: 140 }, diasDevidos: 7, aparelhosSemMidia: 0, cargasPreenchidas: true });
  assert.equal(v.treino.semana.atual.dias, 1);
  assert.equal(v.treino.semana.atual.series, 4);
  assert.equal(v.treino.semana.atual.duracaoMin, 60);
});

// ---------- semanas antes do 1º registro não são "0": ficam fora da janela e das médias ----------
import { homeSeries, inicioDaJanela } from "../src/index.ts";
const SEM: HomeRaw = { sets: [], e1rm: [], sessoes: [], presenca: [], cardio: [], pesos: [], medidas: [], comida: [], checkins: [], checkouts: [] };
const O = { hoje: "2026-11-12", prioridades: ["ombro"], diasMeta: 4 };

test("1º registro: a série diz em que semana a conta começou (12 semanas, a atual é a última)", () => {
  // 09/11 é a semana atual (índice 11); 19/10 é o índice 8
  assert.equal(homeSeries({ ...SEM, sessoes: ["2026-10-19", "2026-11-10"] }, O).inicio, 8);
  assert.equal(homeSeries({ ...SEM, sets: [{ date: "2026-11-10", muscle: "ombro", n: 3 }] }, O).inicio, 11);
  assert.equal(homeSeries({ ...SEM, cardio: [{ date: "2026-10-27", minutes: 20 }] }, O).inicio, 9);
  assert.equal(homeSeries({ ...SEM, presenca: ["2026-11-03"] }, O).inicio, 10);
  // o 1º treino de qualquer época (vindo do Worker) vale: conta antiga com semanas paradas continua com zeros reais
  assert.equal(homeSeries({ ...SEM, primeiroTreinoEm: "2025-01-10", sessoes: ["2026-11-10"] }, O).inicio, 0);
  assert.equal(homeSeries({ ...SEM, primeiroTreinoEm: "2026-10-05", sessoes: ["2026-11-10"] }, O).inicio, 6);
  // sem registro nenhum: nenhuma semana tem dado
  assert.equal(homeSeries(SEM, O).inicio, 12);
});

test("inicioDaJanela: a janela de n semanas nunca começa antes do 1º registro", () => {
  assert.equal(inicioDaJanela(12, 12, 8), 8); // 3 meses, conta de 4 semanas: só 4 semanas
  assert.equal(inicioDaJanela(12, 4, 8), 8);  // 4 semanas, conta de 4 semanas
  assert.equal(inicioDaJanela(12, 4, 3), 8);  // conta antiga: as 4 últimas
  assert.equal(inicioDaJanela(12, 12, 0), 0);
  assert.equal(inicioDaJanela(12, 4, 12), 12); // sem registro: janela vazia
});
