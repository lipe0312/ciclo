// #108 Ver extra abria um treino aleatório: o treino salvo (MCP/Chat/à mão) num dia sem treino sumia da semana e o
// "Ver extra" mostrava o extra calculado na hora. Agora: o dia salvo aparece; sem treino, "Gerar treino" usa o gerador
// determinístico (#65), passa no validarSemana e fica com "revisão da IA pendente". Dados fictícios.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ACAO_REVISAR_TREINO, EQUIPMENT, EXERCISES, MUSCLES, MUSCLE_IDS, dataDoPedidoRevisao, gerarTreinoDia, pedidoRevisaoTreino, perfilComDia,
  planWeek, planoDoDiaGerado, resumirDia, revisarTreinoDia, validarSemana, weekDates, weekView, weeklyTargets,
} from "../src/index.ts";
import type { DayPlan, MuscleId, PerfilGerador, WeekInput } from "../src/index.ts";

const ALL = EQUIPMENT.map((e) => e.id);
const PRIOS: MuscleId[] = ["ombro", "biceps", "triceps"];
const MON = "2026-11-09";
const D = weekDates(MON);
const inp = (o: Partial<WeekInput> = {}): WeekInput => ({
  weekStart: MON, today: D[0], sets: {}, attendance: {}, targets: weeklyTargets(1, PRIOS),
  profile: { daysUsual: ["seg", "ter", "qui", "sex"], daysTarget: 4, minutes: 60, priorities: PRIOS, dayGym: {}, gyms: [{ id: "a1", equipment: ALL }] }, ...o,
});
const perfil = (o: Partial<PerfilGerador> = {}): PerfilGerador => ({ sexo: "m", nivel: 1, prioridades: PRIOS, equipamentos: ALL, dias: ["seg", "ter", "qui", "sex"], minutos: 60, ...o });
/** O treino que o "Claude" salvou: 3 exercícios de superior, IDs do catálogo. */
function salvoPeloChat(): DayPlan {
  const ids = ["ombro", "biceps", "triceps"].map((m) => EXERCISES.find((e) => e.m === m && !e.planOff)!);
  const base = planWeek(inp()).days[0].plan!;
  return resumirDia({ ...base, name: "Braços do Chat", items: ids.map((e, k) => ({ ...base.items[0], exerciseId: e.id, nm: e.nm, muscle: e.m, sets: 3 + k })), prehab: [], why: ["motivo fictício"] });
}

test("regressão: treino salvo pelo MCP num dia sem treino (hoje, quarta) aparece no dia, não o extra calculado", () => {
  const plano = salvoPeloChat();
  const i = inp({ today: D[2], fixed: { [D[2]]: { plan: plano, source: "claude" } } });
  const v = weekView(i, planWeek(i));
  const qua = v.days[2];
  assert.notEqual(qua.status, "livre", "com treino salvo o dia não é mais livre (era aí que o Ver extra abria outro)");
  assert.equal(qua.status, "hoje");
  assert.equal(qua.source, "claude");
  assert.equal(qua.plan!.name, "Braços do Chat");
  assert.deepEqual(qua.plan!.items.map((x) => [x.exerciseId, x.sets]), plano.items.map((x) => [x.exerciseId, x.sets]));
  assert.equal(v.extraToday, null, "nenhum extra calculado por cima");
});

test("regressão: treino salvo para um dia de folga futuro aparece como planejado, com os mesmos itens", () => {
  const plano = salvoPeloChat();
  const i = inp({ fixed: { [D[5]]: { plan: plano, source: "claude" } } });
  const sab = weekView(i, planWeek(i)).days[5];
  assert.equal(sab.status, "planejado");
  assert.deepEqual(sab.plan!.items.map((x) => x.exerciseId), plano.items.map((x) => x.exerciseId));
});

test("dia sem nada salvo continua livre (o app mostra Gerar treino) e a folga marcada à mão vence o plano salvo", () => {
  const v = weekView(inp({ today: D[2] }), planWeek(inp({ today: D[2] })));
  assert.equal(v.days[2].status, "livre");
  assert.equal(v.days[2].plan, null);
  const i = inp({ today: D[2], overrides: { [D[2]]: { kind: "folga", opts: {} } }, fixed: { [D[2]]: { plan: salvoPeloChat(), source: "claude" } } });
  assert.equal(planWeek(i).days[2].kind, "folga");
});

test("Gerar treino: o dia sai do gerador determinístico, numa semana que passa no validarSemana", () => {
  for (const [dow, p] of [["qua", perfil()], ["sab", perfil({ sexo: "f", minutos: 45 })], ["dom", perfil({ dias: ["seg"], diasMeta: 1 })], ["seg", perfil({ dias: [] })]] as const) {
    const g = gerarTreinoDia(p, dow)!;
    assert.ok(g, `${dow}: gerou`);
    assert.equal(g.dia.dow, dow);
    assert.ok(g.dia.itens.length > 0);
    assert.deepEqual(validarSemana(g.semana, g.perfil), [], `${dow}: semana válida`);
    assert.ok(g.perfil.dias.includes(dow));
    assert.deepEqual(gerarTreinoDia(p, dow), g, "determinístico");
  }
  assert.deepEqual(perfilComDia(perfil(), "qua").dias, ["seg", "ter", "qua", "qui", "sex"]);
});

test("plano do dia gerado: resumo dos itens, grupos certos e o selo de revisão pendente", () => {
  const g = gerarTreinoDia(perfil(), "qua")!;
  const p = planoDoDiaGerado(g.dia, "pendente");
  assert.equal(p.revisao, "pendente");
  assert.equal(p.setsTotal, g.dia.itens.reduce((s, i) => s + i.sets, 0));
  assert.deepEqual(p.groups.sort(), [...new Set(g.dia.itens.map((i) => MUSCLES[i.muscle].group))].sort());
  assert.ok(p.why.some((w) => /revisão da IA pendente/i.test(w)));
  for (const m of MUSCLE_IDS) assert.equal(p.perMuscle[m] ?? 0, g.dia.itens.filter((i) => i.muscle === m).reduce((s, i) => s + i.sets, 0));
});

test("pedido revisar_treino: tier barato, data no texto e só o JSON compacto do dia", () => {
  const g = gerarTreinoDia(perfil(), "qua")!;
  const r = pedidoRevisaoTreino("2026-11-11", g);
  assert.equal(ACAO_REVISAR_TREINO, "revisar_treino");
  assert.equal(r.tier, "haiku");
  assert.equal(dataDoPedidoRevisao(r.texto), "2026-11-11");
  assert.ok(r.texto.includes(JSON.stringify(g.dia.itens.map((i) => ({ id: i.exerciseId, sets: i.sets })))));
  assert.equal(dataDoPedidoRevisao("[comida 2026-11-11] pão"), null);
  assert.equal(dataDoPedidoRevisao("[revisar_treino 2026-13-99] x"), null);
});

test("revisão da IA: válida é aplicada; inválida é descartada e fica a determinística com as violações", () => {
  const g = gerarTreinoDia(perfil(), "qua")!;
  const compacto = g.dia.itens.map((i) => ({ id: i.exerciseId, sets: i.sets }));
  // sem resposta (a IA aprovou como está) → fica a determinística, sem violação
  assert.deepEqual(revisarTreinoDia(g, null), { dia: g.dia, fonte: "deterministica", violacoes: [] });
  // válida: a mesma lista (a IA não mudou nada que quebre a régua)
  const ok = revisarTreinoDia(g, compacto);
  assert.equal(ok.fonte, "ia", JSON.stringify(ok.violacoes));
  assert.deepEqual(ok.dia.itens.map((i) => i.exerciseId).sort(), compacto.map((i) => i.id).sort());
  // inválidas: ID inventado, séries demais, formato errado, aparelho não marcado
  for (const ruim of [
    [{ id: "Exercicio_Inventado", sets: 3 }, ...compacto],
    compacto.map((i, k) => (k ? i : { ...i, sets: 40 })),
    "não é JSON",
    { dias: [] },
  ] as unknown[]) {
    const r = revisarTreinoDia(g, ruim);
    assert.equal(r.fonte, "deterministica");
    assert.ok(r.violacoes.length > 0);
    assert.deepEqual(r.dia, g.dia);
  }
  const EQ = ["halteres", "banco"];
  const so = gerarTreinoDia(perfil({ equipamentos: EQ }), "qua")!;
  const m = so.dia.itens[0].muscle;
  const semAparelho = EXERCISES.find((e) => e.m === m && !e.planOff && e.eq.some((q) => !EQ.includes(q)))!;
  const r = revisarTreinoDia(so, so.dia.itens.map((i, k) => (k ? { id: i.exerciseId, sets: i.sets } : { id: semAparelho.id, sets: i.sets })));
  assert.equal(r.fonte, "deterministica");
  assert.ok(r.violacoes.some((v) => v.codigo === "aparelho"), JSON.stringify(r.violacoes));
});
