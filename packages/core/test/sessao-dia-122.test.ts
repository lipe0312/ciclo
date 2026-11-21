// #122 Treino em andamento segue o treino do dia: antes de começar pega a versão nova; começado, a mudança entra na MESMA
// sessão sem perder séries; recarregar/outro aparelho retomam a aberta; "Treinar de novo" é a única forma de abrir a 2ª;
// terminada não volta a contar. Dados fictícios.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_SESSION_MS, assinaturaTreino, nextPending, sessionProgress, trocarTreinoLocal } from "../src/index.ts";
import type { DayPlan, PlanItem } from "../src/index.ts";
import { acaoComecar, sessaoAberta, seguirTreinoDoDia, terminadaVence } from "../src/sessao-dia.ts";
import type { PlanoSessao, SessaoViva } from "../src/sessao-dia.ts";

const item = (exerciseId: string, sets = 3): PlanItem => ({ exerciseId, nm: exerciseId, muscle: "ombro", kind: "cabo", sets, reps: [10, 15], rest: 60, alts: [] });
const dia = (nome: string, ids: string[], sets = 3): DayPlan => ({
  name: nome, mode: "normal", groups: ["sup"], items: ids.map((i) => item(i, sets)), prehab: [], why: [], dropped: [], missing: [],
  cap: 20, setsTotal: ids.length * sets, estMinutes: 30, weekClosePct: 0, suggestCompensatory: false, perMuscle: {},
});
const log = (done: boolean, kg = 10, reps = 12) => ({ done, kg, reps });
/** Começar: copia o treino do dia e guarda de onde veio. */
const comecar = (d: DayPlan): SessaoViva => ({ plan: { ...structuredClone(d), doDia: assinaturaTreino(d) } as PlanoSessao, logs: {}, skipped: {}, cur: 0 });
const ids = (s: SessaoViva) => s.plan.items.map((i) => `${i.exerciseId}${i.trocado ? "*" : ""} ${i.sets}`);
const T0 = Date.parse("2026-11-20T10:00:00Z"), HOJE = "2026-11-20";

test("1) IA troca exercício antes de começar → o Começar abre o novo", () => {
  const antigo = dia("A", ["Face_Pull", "Crunch"]), novo = dia("A (IA)", ["Lateral_Raise", "Curl"]);
  let local = antigo, visto = assinaturaTreino(antigo);
  if (trocarTreinoLocal({ sessaoAberta: false, doDia: novo, visto })) { local = novo; visto = assinaturaTreino(novo); }
  const s = comecar(local);
  assert.deepEqual(ids(s), ["Lateral_Raise 3", "Curl 3"]);
  assert.equal(s.plan.doDia, visto);
});

test("2) séries registradas não se perdem: trocado com séries fica (marcado, não repete), sem séries sai, novo entra, com aviso", () => {
  const s = comecar(dia("A", ["Face_Pull", "Crunch", "Curl"]));
  s.logs.Face_Pull = [log(true), log(true), log(false)]; // 2 de 3 feitas
  s.logs.Crunch = [log(false), log(false), log(false)]; // nenhuma feita
  s.logs.Curl = [log(true)];
  s.cur = 2;
  const r = seguirTreinoDoDia(s, dia("A (IA)", ["Lateral_Raise", "Curl"]), { nome: (id) => id.replace("_", " ") })!;
  assert.ok(r);
  assert.deepEqual(ids(r.sessao), ["Face_Pull* 2", "Lateral_Raise 3", "Curl 3"]);
  assert.deepEqual(r.sessao.logs.Face_Pull.map((l) => l.done), [true, true], "fica só com as feitas");
  assert.equal(r.sessao.logs.Crunch, undefined, "trocado sem séries sai");
  assert.deepEqual(r.sessao.logs.Curl.map((l) => l.done), [true], "séries do que ficou continuam");
  assert.deepEqual([r.entrou, r.saiu, r.trocados], [["Lateral_Raise"], ["Crunch"], ["Face_Pull"]]);
  assert.match(r.aviso, /entrou Lateral Raise; saiu Crunch; Face Pull ficou com as séries feitas \(trocado\)/);
  assert.equal(r.sessao.plan.items[r.sessao.cur!].exerciseId, "Curl", "continua no mesmo exercício");
  // o trocado não se repete: está resolvido no progresso e o "próximo" pula ele
  const pl = r.sessao.plan.items.map((i) => ({ exerciseId: i.exerciseId, sets: i.sets }));
  const p = sessionProgress(pl, r.sessao.logs, r.sessao.skipped);
  assert.equal(p.setsDone, 3);
  assert.equal(p.setsTotal, 2 + 3 + 3);
  assert.equal(nextPending(pl, r.sessao.logs, r.sessao.skipped, 0), 1, "pula o trocado e vai ao novo");
});

test("3) IA altera o dia de novo com o treino em andamento → mesma sessão, sem duplicar itens nem séries (idempotente)", () => {
  const s = comecar(dia("A", ["Face_Pull", "Curl"]));
  s.logs.Face_Pull = [log(true)]; s.logs.Curl = [log(true), log(true)];
  const novo = dia("A (IA)", ["Lateral_Raise", "Curl"]);
  const r1 = seguirTreinoDoDia(s, novo)!;
  assert.equal(seguirTreinoDoDia(r1.sessao, novo), null, "mesmo treino do dia de novo: nada muda");
  assert.equal(seguirTreinoDoDia(r1.sessao, structuredClone(novo)), null);
  // terceira versão: volta o Face_Pull → entra de novo, sem duplicar e mantendo a série feita
  const r2 = seguirTreinoDoDia(r1.sessao, dia("A (IA 2)", ["Face_Pull", "Curl", "Curl"]))!;
  assert.deepEqual(ids(r2.sessao), ["Face_Pull 3", "Curl 3"], "Lateral sem série sai; Curl repetido não duplica");
  assert.deepEqual(r2.sessao.logs.Face_Pull.map((l) => l.done), [true]);
  assert.equal(Object.values(r2.sessao.logs).flat().filter((l) => l.done).length, 3, "nenhuma série a mais nem a menos");
  // sem treino do dia (folga) não mexe; o mesmo que o aparelho já adotou (visto) também não
  assert.equal(seguirTreinoDoDia(s, null), null);
  assert.equal(seguirTreinoDoDia(s, novo, { visto: assinaturaTreino(novo) }), null);
  // mais séries feitas que o novo pede: o item fica com todas as feitas
  const t = comecar(dia("B", ["Curl"], 3)); t.logs.Curl = [log(true), log(true), log(true), log(true)];
  assert.deepEqual(ids(seguirTreinoDoDia(t, dia("B2", ["Curl"], 2))!.sessao), ["Curl 4"]);
});

test("4) recarregar ou abrir em outro aparelho → retoma a sessão aberta (nunca abre outra)", () => {
  const sessoes = [{ id: "s1", date: HOJE, started_at: T0, finished_at: null }];
  assert.deepEqual(acaoComecar({ local: null, sessoes, date: HOJE, now: T0 + 60_000 }), { tipo: "retomar", id: "s1" }, "outro aparelho");
  assert.deepEqual(acaoComecar({ local: { id: "s1" }, sessoes, date: HOJE, now: T0 + 60_000 }), { tipo: "retomar", id: "s1" }, "recarregar");
  assert.equal(sessaoAberta(sessoes, HOJE, T0 + 1000)?.id, "s1");
  assert.equal(sessaoAberta(sessoes, HOJE, T0 + MAX_SESSION_MS), null, "passou de 2 h: fechada");
  assert.equal(sessaoAberta(sessoes, "2026-11-21", T0), null, "outro dia");
});

test("5) Treinar de novo depois de terminar → 2ª sessão no dia", () => {
  const sessoes = [{ id: "s1", date: HOJE, started_at: T0, finished_at: T0 + 3600_000 }];
  assert.deepEqual(acaoComecar({ local: { id: "s1", finishedAt: T0 + 3600_000 }, sessoes, date: HOJE, now: T0 + 4000_000 }), { tipo: "nova" });
  assert.deepEqual(acaoComecar({ local: null, sessoes, date: HOJE, now: T0 + 4000_000 }), { tipo: "nova" });
  // com a 2ª aberta, recarregar retoma a 2ª (a mais recente aberta)
  const duas = [...sessoes, { id: "s2", date: HOJE, started_at: T0 + 4000_000, finished_at: null }];
  assert.deepEqual(acaoComecar({ local: null, sessoes: duas, date: HOJE, now: T0 + 4100_000 }), { tipo: "retomar", id: "s2" });
});

test("6) terminar → recarregar → cronômetro parado e sem descanso (local terminado vence o servidor ainda aberto)", () => {
  const local = { id: "s1", finishedAt: T0 + 3600_000, closedBy: "usuario", rest: { until: T0 + 3700_000, fired: false } };
  const a = terminadaVence(local, { finishedAt: null });
  assert.equal(a.terminada, true);
  assert.equal(a.sessao!.finishedAt, T0 + 3600_000, "não reabre");
  assert.equal(a.sessao!.rest, null, "sem descanso");
  assert.equal(a.reenviarFim, true, "o fim que ficou na fila é reenviado");
  // terminada no servidor (outro aparelho/fechamento) → local para também
  const b = terminadaVence({ id: "s1", finishedAt: null, rest: { until: 1, fired: false } }, { finishedAt: T0 + 100, closedBy: "usuario" });
  assert.deepEqual([b.terminada, b.sessao!.finishedAt, b.sessao!.rest, b.reenviarFim], [true, T0 + 100, null, false]);
  // aberta nos dois: segue aberta
  assert.equal(terminadaVence({ finishedAt: null }, { finishedAt: null }).terminada, false);
});
