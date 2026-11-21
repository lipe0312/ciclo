// #123 "Feito" só ao terminar; cancelar treino; Treinei ↔ check-in; corrigir séries (app e MCP) mesmo em dia feito.
// Regras puras do core. Dados fictícios.
import { test } from "node:test";
import assert from "node:assert/strict";
import { dayStatus, planejarCorrecao, presencaAposDescartar, respostaTreinei, cancelarSessaoLocal } from "../src/index.ts";
import type { SerieDia, WeekDay } from "../src/index.ts";

const HOJE = "2026-11-20";
const dia = (date: string, kind: WeekDay["kind"] = "treino"): WeekDay => ({ date, dow: "sex", kind, plan: null, gymId: null, opts: {}, source: "auto", warn: [] });
const ctx = (o: Partial<Parameters<typeof dayStatus>[1]> = {}) => ({ weekStart: "2026-11-16", today: HOJE, sets: {}, attendance: {}, ...o });

test("começar e sair sem terminar → o dia não está feito (nem com série registrada na sessão aberta)", () => {
  // só começou: nada de presença, nada de série
  assert.equal(dayStatus(dia(HOJE), ctx()), "hoje");
  // começou, fez 2 séries e saiu sem terminar: a sessão segue aberta → não é "feito"
  assert.equal(dayStatus(dia(HOJE), ctx({ sets: { [HOJE]: { biceps: 2 } }, abertas: [HOJE] })), "hoje");
  // terminou (Terminar grava a presença) → feito
  assert.equal(dayStatus(dia(HOJE), ctx({ sets: { [HOJE]: { biceps: 2 } }, abertas: [], attendance: { [HOJE]: "fui" } })), "feito");
  // sessão fechada (terminada ou sozinha em 2 h) com séries → feito, como antes
  assert.equal(dayStatus(dia(HOJE), ctx({ sets: { [HOJE]: { biceps: 2 } } })), "feito");
});

test("Treinei → check-in sim; trocar para Não → check-in não e o dia volta a pendente; Não direto = faltou", () => {
  assert.deepEqual(respostaTreinei(undefined, true), { presenca: "fui", checkin: true });
  assert.deepEqual(respostaTreinei("fui", false), { presenca: null, checkin: false }, "começou sem querer: volta a pendente");
  assert.deepEqual(respostaTreinei(undefined, false), { presenca: "nao_fui", checkin: false });
  assert.deepEqual(respostaTreinei("nao_fui", true), { presenca: "fui", checkin: true });
  // pendente de verdade: hoje sem presença
  assert.equal(dayStatus(dia(HOJE), ctx({ attendance: {} })), "hoje");
  assert.equal(dayStatus(dia("2026-11-18"), ctx({ attendance: {} })), "pendente");
});

test("cancelar treino → sessão local some (cronômetro e descanso param) e a lista do dia não tem mais a sessão", () => {
  const week = { sessions: [{ id: "s1", date: HOJE }, { id: "s0", date: "2026-11-18" }], attendance: { "2026-11-18": "fui" } as Record<string, string> };
  const r = cancelarSessaoLocal({ id: "s1", date: HOJE, rest: { until: Date.now() + 60_000 } }, week);
  assert.equal(r.sessao, null);
  assert.deepEqual(r.week.sessions.map((s) => s.id), ["s0"]);
  assert.equal(r.week.attendance[HOJE], undefined, "dia pendente");
  assert.equal(r.week.attendance["2026-11-18"], "fui", "outro dia intacto");
  assert.equal(week.sessions.length, 2, "não muta a entrada");
});

test("descartar o treino do dia: só a presença automática some, e só quando não sobra sessão", () => {
  assert.equal(presencaAposDescartar({ status: "fui", source: "fim" }, 0), "apagar");
  assert.equal(presencaAposDescartar({ status: "fui", source: "inicio" }, 0), "apagar");
  assert.equal(presencaAposDescartar({ status: "fui", source: "fim" }, 1), "manter", "sobrou outra sessão");
  assert.equal(presencaAposDescartar({ status: "fui", source: "app" }, 0), "manter", "Treinei da pessoa fica");
  assert.equal(presencaAposDescartar(null, 0), "manter");
});

const S = (sessao: string, exercicio: string, serie: number, kg = 10, reps = 10, inicio = 1): SerieDia =>
  ({ sessao, exercicio, serie, musculo: exercicio === "Lateral_Raise" ? "ombro" : "biceps", kg, reps, segundos: null, rir: null, inicio });
const SERIES = [S("a", "Incline_Dumbbell_Curl", 1), S("a", "Incline_Dumbbell_Curl", 2), S("a", "Incline_Dumbbell_Curl", 3), S("a", "Lateral_Raise", 1, 6, 15)];

test("apagar séries num dia feito → o volume da semana recalcula (antes → depois)", () => {
  const r = planejarCorrecao({ series: SERIES, sessoes: [{ id: "a", inicio: 1 }], semana: { biceps: 9, ombro: 4 } },
    { apagar: [{ exercicioId: "Incline_Dumbbell_Curl", series: [2, 3] }] });
  assert.ok(!("erro" in r));
  assert.deepEqual(r.apagar, [{ sessao: "a", exercicio: "Incline_Dumbbell_Curl", serie: 2 }, { sessao: "a", exercicio: "Incline_Dumbbell_Curl", serie: 3 }]);
  assert.deepEqual(r.volume, { biceps: "9 → 7" });
  assert.equal(r.descartar.length, 0);
});

test("remover um exercício inteiro e corrigir uma série (validada pela medida)", () => {
  const r = planejarCorrecao({ series: SERIES, sessoes: [{ id: "a", inicio: 1 }], semana: { biceps: 9, ombro: 4 } },
    { apagar: [{ exercicioId: "Lateral_Raise" }], corrigir: [{ exercicioId: "Incline_Dumbbell_Curl", serie: 1, kg: 12, reps: 8 }] });
  assert.ok(!("erro" in r));
  assert.equal(r.apagar.length, 1);
  assert.deepEqual(r.corrigir, [{ sessao: "a", exercicio: "Incline_Dumbbell_Curl", serie: 1, kg: 12, reps: 8, segundos: null, rir: null }]);
  assert.deepEqual(r.volume, { ombro: "4 → 3" });
  assert.ok(r.linhas.some((l) => /10 kg × 10 → 12 kg × 8/.test(l)));
  const bad = planejarCorrecao({ series: SERIES, sessoes: [{ id: "a", inicio: 1 }] }, { corrigir: [{ exercicioId: "Incline_Dumbbell_Curl", serie: 1, segundos: 30 }] });
  assert.ok("erro" in bad && /repetições/.test(bad.erro));
  const fora = planejarCorrecao({ series: SERIES, sessoes: [{ id: "a", inicio: 1 }] }, { apagar: [{ exercicioId: "Incline_Dumbbell_Curl", series: [7] }] });
  assert.ok("erro" in fora && /série 7/.test(fora.erro));
  const nada = planejarCorrecao({ series: SERIES, sessoes: [{ id: "a", inicio: 1 }] }, {});
  assert.ok("erro" in nada);
});

test("sessão duplicada no mesmo dia: descartar tira as séries dela; mesclar junta na 1ª sem mudar o volume", () => {
  const dup = [...SERIES, S("b", "Incline_Dumbbell_Curl", 1, 10, 10, 2), S("b", "Incline_Dumbbell_Curl", 2, 10, 10, 2)];
  const ses = [{ id: "a", inicio: 1 }, { id: "b", inicio: 2 }];
  const d = planejarCorrecao({ series: dup, sessoes: ses, semana: { biceps: 11, ombro: 4 } }, { descartarSessao: "b" });
  assert.ok(!("erro" in d));
  assert.deepEqual(d.descartar, ["b"]);
  assert.deepEqual(d.volume, { biceps: "11 → 9" });
  // a numeração do dia segue a ordem das sessões: as séries 4 e 5 do curl são as da "b"
  const m = planejarCorrecao({ series: dup, sessoes: ses, semana: { biceps: 11 } }, { mesclar: true });
  assert.ok(!("erro" in m));
  assert.deepEqual(m.mover, [
    { sessao: "b", exercicio: "Incline_Dumbbell_Curl", serie: 1, para: "a", paraSerie: 4 },
    { sessao: "b", exercicio: "Incline_Dumbbell_Curl", serie: 2, para: "a", paraSerie: 5 },
  ]);
  assert.deepEqual(m.descartar, ["b"]);
  assert.deepEqual(m.volume, {}, "mesclar não muda o volume");
  const so1 = planejarCorrecao({ series: SERIES, sessoes: [{ id: "a", inicio: 1 }] }, { mesclar: true });
  assert.ok("erro" in so1 && /uma sessão/.test(so1.erro));
  const alheia = planejarCorrecao({ series: dup, sessoes: ses }, { descartarSessao: "zzz" });
  assert.ok("erro" in alheia && /sessão/.test(alheia.erro));
});
