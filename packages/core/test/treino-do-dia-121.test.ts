// #121 Um só treino do dia: a semana é a fonte única. Hoje e Semana leem o dia dela; o Treino (Começar) troca o que tem no
// aparelho pelo dela sempre que ela muda; regerar (IA ou algoritmo) substitui o salvo, e o anterior não volta por nenhum
// caminho. Sem IA, o algoritmo gera e os três acessos batem. Dados fictícios.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EQUIPMENT, EXERCISES, applyDayAction, assinaturaTreino, planWeek, resumirDia, salvosSubstituidos, treinoDoDia, trocarTreinoLocal, weekDates, weekView, weeklyTargets,
} from "../src/index.ts";
import type { DayOverride, DayPlan, MuscleId, WeekInput, WeekPlan } from "../src/index.ts";

const ALL = EQUIPMENT.map((e) => e.id);
const PRIOS: MuscleId[] = ["ombro", "biceps", "triceps"];
const MON = "2026-11-16";
const D = weekDates(MON);
const QUA = D[2];
const inp = (o: Partial<WeekInput> = {}): WeekInput => ({
  weekStart: MON, today: QUA, sets: {}, attendance: {}, targets: weeklyTargets(1, PRIOS),
  profile: { daysUsual: ["seg", "ter", "qua", "sex"], daysTarget: 4, minutes: 60, priorities: PRIOS, dayGym: {}, gyms: [{ id: "a1", equipment: ALL }] }, ...o,
});
/** Treino fictício salvo pela IA: um exercício de cada músculo pedido, séries diferentes por versão. */
function daIA(nome: string, musculos: MuscleId[], sets: number): DayPlan {
  const base = planWeek(inp()).days[2].plan!;
  const ex = musculos.map((m) => EXERCISES.find((e) => e.m === m && !e.planOff && e.eq.every((q) => ALL.includes(q)))!);
  return resumirDia({ ...base, name: nome, items: ex.map((e) => ({ ...base.items[0], exerciseId: e.id, nm: e.nm, muscle: e.m, sets })), prehab: [], why: ["motivo fictício"] });
}
const itens = (p: DayPlan | null) => p?.items.map((i) => `${i.exerciseId} ${i.sets}`) ?? null;

/** O app (Treino/Começar): o que ele tem no aparelho e o último treino da semana que aplicou. Mesma regra do store. */
function app(local: DayPlan | null, visto: string | null = null) {
  const s = { local, visto, sessao: false };
  return {
    s,
    sincronizar(semana: { days: readonly { date: string; kind: string; plan: DayPlan | null; status?: string }[] }) {
      const doDia = treinoDoDia(semana, QUA);
      if (trocarTreinoLocal({ sessaoAberta: s.sessao, doDia, visto: s.visto })) { s.local = doDia; s.visto = assinaturaTreino(doDia); }
    },
    comecar: () => s.local,
  };
}
const semanaCom = (o: Partial<WeekInput> = {}) => { const i = inp(o); return weekView(i, planWeek(i)); };

test("IA salva o treino do dia: Hoje, Semana e Começar mostram os mesmos exercícios e séries (mesmo com treino antigo no aparelho)", () => {
  const antigo = daIA("Geração antiga", ["peito", "costas"], 4);
  const novo = daIA("Braços do Chat", ["ombro", "biceps", "triceps"], 3);
  const v = semanaCom({ fixed: { [QUA]: { plan: novo, source: "claude" } } });
  const hoje = treinoDoDia(v, QUA); // Hoje (carrossel) e Semana leem o mesmo dia
  assert.deepEqual(itens(hoje), itens(novo));
  assert.equal(v.days[2].status, "hoje");
  // o aparelho tinha a geração antiga (travada de antes): a semana mudou, então o Começar abre a da IA
  const a = app(antigo, assinaturaTreino(antigo));
  a.sincronizar(v);
  assert.deepEqual(itens(a.comecar()), itens(hoje));
  assert.equal(a.comecar()!.name, "Braços do Chat");
  // no meio do treino nada troca
  const b = app(antigo, assinaturaTreino(antigo)); b.s.sessao = true; b.sincronizar(v);
  assert.equal(b.comecar(), antigo);
});

test("regerar duas vezes (IA e algoritmo): só a última vale; nenhum caminho abre a anterior", () => {
  // IA salva duas vezes no mesmo dia: o salvo é por dia (um só), a semana e o app ficam com a 2ª
  const ia1 = daIA("Chat 1", ["peito", "costas"], 3), ia2 = daIA("Chat 2", ["ombro", "biceps"], 4);
  const salvos: Record<string, { plan: DayPlan; source: "claude" | "manual" }> = {};
  const a = app(null);
  for (const p of [ia1, ia2]) { salvos[QUA] = { plan: p, source: "claude" }; a.sincronizar(semanaCom({ fixed: { ...salvos } })); }
  assert.deepEqual(Object.keys(salvos), [QUA]);
  assert.deepEqual(itens(treinoDoDia(semanaCom({ fixed: salvos }), QUA)), itens(ia2));
  assert.deepEqual(itens(a.comecar()), itens(ia2));
  // o mesmo treino de novo (a semana não mudou): não volta para nada antigo
  a.sincronizar(semanaCom({ fixed: salvos }));
  assert.deepEqual(itens(a.comecar()), itens(ia2));

  // algoritmo: "Gerar outro" no dia salvo pela IA substitui o salvo; de novo, substitui o 1º gerado
  const ctx = inp({ fixed: salvos });
  assert.deepEqual(salvosSubstituidos({ tipo: "dia", date: QUA }, salvos, ctx, { manual: true }), [QUA]);
  const fixed = { ...salvos };
  for (const d of salvosSubstituidos({ tipo: "dia", date: QUA }, fixed, ctx, { manual: true })) delete fixed[d];
  let plan: WeekPlan = planWeek(inp({ fixed })), overrides: Record<string, DayOverride> = {};
  const geracoes: DayPlan[] = [];
  for (const g of [{ ocupados: ["polia"] }, { ocupados: ["halteres"], estilo: "maquina" as const }]) {
    const r = applyDayAction(plan, overrides, { type: "outro", date: QUA, geracao: g }, inp());
    assert.ok(!("error" in r));
    overrides = r.overrides;
    plan = planWeek(inp({ overrides, fixed, prev: plan }));
    const v = weekView(inp({ overrides, fixed }), plan);
    geracoes.push(treinoDoDia(v, QUA)!);
    a.sincronizar(v);
  }
  const [g1, g2] = geracoes;
  assert.notDeepEqual(itens(g1), itens(ia2), "o 1º gerado substituiu o da IA");
  assert.notDeepEqual(itens(g2), itens(g1), "o 2º gerado é outro treino");
  assert.deepEqual(itens(a.comecar()), itens(g2), "o Começar abre só o último");
  assert.deepEqual(itens(treinoDoDia(weekView(inp({ overrides, fixed }), plan), QUA)), itens(g2), "Hoje/Semana: só o último");
});

test("regerar não apaga o que já passou nem a edição manual (salvo se a pessoa pedir); a semana toda só os dias abertos", () => {
  const salvos = { [D[0]]: { source: "claude" }, [D[1]]: { source: "claude" }, [QUA]: { source: "manual" }, [D[4]]: { source: "claude" } };
  const ctx = inp({ sets: { [D[1]]: { ombro: 3 } } });
  assert.deepEqual(salvosSubstituidos({ tipo: "semana" }, salvos, ctx, { manual: false }), [D[4]], "seg passou, ter treinou, qua é manual");
  assert.deepEqual(salvosSubstituidos({ tipo: "semana" }, salvos, ctx, { manual: true }), [QUA, D[4]]);
  assert.deepEqual(salvosSubstituidos({ tipo: "dia", date: QUA }, salvos, ctx, { manual: false }), [], "a IA não apaga edição manual");
  assert.deepEqual(salvosSubstituidos({ tipo: "dia", date: QUA }, salvos, ctx, { manual: true }), [QUA], "o toque da pessoa no dia substitui");
  assert.deepEqual(salvosSubstituidos({ tipo: "dia", date: QUA }, salvos, inp({ attendance: { [QUA]: "fui" } }), { manual: true }), [], "dia com presença não muda");
});

test("sem IA: o algoritmo gera a semana e Hoje, Semana e Começar mostram o mesmo treino", () => {
  const i = inp();
  const w = planWeek(i), v = weekView(i, w);
  const hoje = treinoDoDia(v, QUA);
  assert.ok(hoje && hoje.items.length > 0, "quarta é dia de treino");
  assert.deepEqual(itens(treinoDoDia(w, QUA)), itens(hoje), "a semana guardada e a vista dão o mesmo dia");
  // o aparelho tinha um treino calculado localmente (outro algoritmo): a 1ª semana que chega manda
  const local = { ...hoje, name: "Calculado no aparelho", items: hoje.items.slice(1) };
  const a = app(local);
  a.sincronizar(v);
  assert.deepEqual(itens(a.comecar()), itens(hoje));
  // folga e dia livre não têm treino (nada é gerado ao abrir); extra feito tem
  assert.equal(treinoDoDia(v, D[3]), null);
  assert.equal(treinoDoDia({ days: [{ date: QUA, kind: "folga", plan: hoje, status: "livre" }] }, QUA), null);
  assert.deepEqual(itens(treinoDoDia({ days: [{ date: QUA, kind: "folga", plan: hoje, status: "extra" }] }, QUA)), itens(hoje));
  // sem treino na semana o app não troca nada
  assert.equal(trocarTreinoLocal({ sessaoAberta: false, doDia: null, visto: null }), false);
});
