// #113 Dias de treino flexíveis: os dias cadastrados são só referência para distribuir a semana, nunca bloqueio.
// Qualquer dia aceita treino (salvo, gerado, registrado), "treinei"/"não treinei" vale em qualquer dia e "empurrar"
// leva os treinos de hoje em diante um dia à frente. Dados fictícios.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EQUIPMENT, EXERCISES, MUSCLE_IDS, applyDayAction, empurrarTreinos, planWeek, resumirDia, weekDates, weekView, weeklyTargets,
} from "../src/index.ts";
import type { DayPlan, MuscleId, Sets, WeekInput, WeekPlan } from "../src/index.ts";

const ALL = EQUIPMENT.map((e) => e.id);
const PRIOS: MuscleId[] = ["ombro", "biceps", "triceps"];
const MON = "2026-11-16";
const D = weekDates(MON); // seg..dom
const TER_SEX = ["ter", "qua", "qui", "sex"];
const inp = (o: Partial<WeekInput> = {}, dias = TER_SEX): WeekInput => ({
  weekStart: MON, today: D[0], sets: {}, attendance: {}, targets: weeklyTargets(1, PRIOS),
  profile: { daysUsual: dias, daysTarget: dias.length, minutes: 60, priorities: PRIOS, dayGym: {}, gyms: [{ id: "a1", equipment: ALL }] }, ...o,
});
/** Treino fictício salvo pela IA: 3 exercícios de braço/ombro do catálogo. */
function salvo(nome = "Braços do Chat"): DayPlan {
  const ids = ["ombro", "biceps", "triceps"].map((m) => EXERCISES.find((e) => e.m === m && !e.planOff)!);
  const base = planWeek(inp()).days[1].plan!;
  return resumirDia({ ...base, name: nome, items: ids.map((e, k) => ({ ...base.items[0], exerciseId: e.id, nm: e.nm, muscle: e.m, sets: 3 + k })), prehab: [], why: ["motivo fictício"] });
}
const did = (w: WeekPlan, idx: number[]) => Object.fromEntries(idx.map((i) => [D[i], { ...w.days[i].plan!.perMuscle }])) as Record<string, Sets>;
const total = (s: Sets) => MUSCLE_IDS.reduce((a, m) => a + (s[m] ?? 0), 0);

test("treino salvo no sábado (cadastro ter–sex) aparece no sábado como dia de treino", () => {
  const plano = salvo();
  const i = inp({ today: D[3], fixed: { [D[5]]: { plan: plano, source: "claude" } } });
  const v = weekView(i, planWeek(i));
  const sab = v.days[5];
  assert.equal(sab.kind, "treino", "dia fora do cadastro com treino salvo é dia de treino");
  assert.equal(sab.status, "planejado");
  assert.equal(sab.plan!.name, "Braços do Chat");
  assert.deepEqual(sab.plan!.items.map((x) => x.exerciseId), plano.items.map((x) => x.exerciseId));
  assert.equal(v.days.filter((d) => d.kind !== "folga").length, 5, "conta nos treinos da semana");
  // no próprio sábado ele é o treino de hoje
  const hoje = inp({ today: D[5], fixed: { [D[5]]: { plan: plano, source: "claude" } } });
  assert.equal(weekView(hoje, planWeek(hoje)).days[5].status, "hoje");
});

test("gerar num dia fora do cadastro (pedido à IA ou no app) vira dia de treino", () => {
  const i = inp({ today: D[2] });
  const w = planWeek(i);
  assert.equal(w.days[5].kind, "folga");
  const r = applyDayAction(w, {}, { type: "gerar", date: D[5], opts: { focus: ["ombro"] } }, i);
  assert.ok(!("error" in r));
  const w2 = planWeek({ ...i, overrides: r.overrides, prev: w });
  assert.equal(w2.days[5].kind, "treino");
  assert.ok((w2.days[5].plan?.perMuscle.ombro ?? 0) > 0, "sábado com ombro");
});

test("'treinei' num dia fora do cadastro conta presença e volume; 'não treinei' não conta", () => {
  const w0 = planWeek(inp());
  const base = { today: D[5], sets: did(w0, [1, 2]), prev: w0 };
  const sem = weekView(inp(base), planWeek(inp(base)));
  assert.equal(sem.days[5].status, "livre");
  const fui = inp({ ...base, attendance: { [D[5]]: "fui" } });
  const w = planWeek(fui), v = weekView(fui, w);
  assert.equal(v.days[5].kind, "treino");
  assert.equal(v.days[5].status, "feito", "presença: dia feito");
  assert.ok(v.days[5].plan && v.days[5].plan.setsTotal > 0, "o dia ganha o treino que credita");
  assert.ok(total(v.projected.done) > total(sem.projected.done), "volume do sábado entra na semana");
  for (const m of MUSCLE_IDS) assert.ok((v.projected.done[m] ?? 0) >= (sem.projected.done[m] ?? 0), m);
  // estável: abrir de novo (com a versão anterior) mantém o mesmo plano do dia feito
  assert.deepEqual(planWeek({ ...fui, prev: w }).days[5].plan, w.days[5].plan);
  // série registrada fora do cadastro: também é dia de treino feito
  const reg = inp({ ...base, sets: { ...base.sets, [D[5]]: { ombro: 3 } } });
  const vr = weekView(reg, planWeek(reg));
  assert.equal(vr.days[5].status, "feito");
  assert.equal(vr.projected.done.ombro, (sem.projected.done.ombro ?? 0) + 3);
  // "não treinei" num dia fora do cadastro com treino salvo: faltou, nada conta
  const nao = inp({ ...base, attendance: { [D[5]]: "nao_fui" }, fixed: { [D[5]]: { plan: salvo(), source: "claude" } } });
  const vn = weekView(nao, planWeek(nao));
  assert.equal(vn.days[5].status, "faltou");
  assert.deepEqual(vn.projected.done, sem.projected.done);
});

test("empurrar na quarta: qua→qui, qui→sex, sex→sáb; hoje vira folga e os dias feitos ficam parados", () => {
  const dias = ["seg", "ter", "qua", "qui", "sex"];
  const w0 = planWeek(inp({}, dias));
  const fixo = salvo("Quinta do Chat");
  const i = inp({ today: D[2], sets: did(w0, [0, 1]), prev: w0, fixed: { [D[3]]: { plan: fixo, source: "claude" } } }, dias);
  const w = planWeek(i);
  const r = empurrarTreinos(i, w);
  assert.ok(!("error" in r), JSON.stringify(r));
  assert.deepEqual(r.moves.map((m) => [m.de, m.para]), [[D[2], D[3]], [D[3], D[4]], [D[4], D[5]]]);
  assert.deepEqual(r.fixos, [{ de: D[3], para: D[4] }], "o treino salvo anda junto");
  const v = weekView({ ...i, overrides: r.overrides, fixed: r.fixed }, r.plan);
  assert.equal(v.days[2].kind, "folga", "hoje vira folga");
  assert.deepEqual(v.days.slice(2).map((d) => d.kind), ["folga", "treino", "treino", "treino", "folga"]);
  assert.equal(r.plan.days[4].plan!.name, "Quinta do Chat", "o salvo de quinta está na sexta");
  for (const k of [0, 1]) {
    assert.deepEqual(r.plan.days[k].plan, w.days[k].plan, "feito não se move");
    assert.equal(v.days[k].status, "feito");
  }
  assert.ok(r.diff.length > 0, "prévia mostra o que muda");
  assert.ok(r.diff.some((x) => x.date === D[2] && x.after === "folga"));
});

test("empurrar: o que passa do domingo volta para o orçamento dos dias que ficam", () => {
  const dias = ["seg", "ter", "qua", "qui", "sex", "sab", "dom"];
  const i = inp({ today: D[4] }, dias);
  const w = planWeek(i);
  const r = empurrarTreinos(i, w);
  assert.ok(!("error" in r));
  assert.deepEqual(r.moves.map((m) => [m.de, m.para]), [[D[4], D[5]], [D[5], D[6]], [D[6], null]]);
  assert.deepEqual(r.plan.days.slice(4).map((d) => d.kind), ["folga", "treino", "treino"]);
  const antes = w.days.slice(5).reduce((a, d) => a + (d.plan?.setsTotal ?? 0), 0);
  const depois = r.plan.days.slice(5).reduce((a, d) => a + (d.plan?.setsTotal ?? 0), 0);
  assert.ok(depois >= antes, `sáb+dom recebem o que sobrou: ${antes} → ${depois}`);
  const v = weekView({ ...i, overrides: r.overrides }, r.plan);
  for (const m of MUSCLE_IDS) assert.ok((v.projected.done[m] ?? 0) <= i.targets[m] + 2, `${m} não estoura o orçamento`);
});

test("empurrar sem treino de hoje em diante: erro claro, nada muda", () => {
  const i = inp({ today: D[5] });
  const r = empurrarTreinos(i, planWeek(i));
  assert.ok("error" in r);
});
