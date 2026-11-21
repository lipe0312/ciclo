// #90 Semana de verdade: divisão por dias e método, dias do mesmo tipo com ênfase, exercícios e ordem diferentes,
// volume dividido (não copiado), rótulo que descreve o dia, superséries que não competem, anti-repetição e o resumo
// do histórico. Perfil do caso real (semana de 16/11) com dados fictícios.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EQUIPMENT, EXERCISE_BY_ID, MUSCLES, MUSCLE_IDS, weeklyTargets, weekDates, planWeek, weekView, validarPares,
  SOBREPOSICAO_MAX, sobreposicao, musculosDoRotulo, NOME_ROTULO, exerciciosDoDia, cabecalhoDia,
  exerciciosCansados, REPETE_SEGUIDAS_MAX, altsDoBanco, ajusteVariacao, resumoHistorico, TETO_HISTORICO, estimarTokens,
} from "../src/index.ts";
import type { DayPlan, MuscleId, WeekDay, WeekInput, WeekPlan, WeekProfile } from "../src/index.ts";

const ALL = EQUIPMENT.map((e) => e.id);
const PRIOS: MuscleId[] = ["ombro", "biceps", "triceps"];
const MON = "2026-11-16";
const D = weekDates(MON);
const T = weeklyTargets(1, PRIOS);
// o que a pessoa já faz (#74): os 7 exercícios do caso real
const FAZ = ["Face_Pull", "One-Arm_Incline_Lateral_Raise", "Reverse_Flyes", "Leverage_Iso_Row", "Incline_Dumbbell_Curl", "Cable_Rope_Overhead_Triceps_Extension", "Incline_Dumbbell_Press"];
const prof = (o: Partial<WeekProfile> = {}): WeekProfile => ({
  daysUsual: ["seg", "ter", "qui", "sex"], daysTarget: 4, minutes: 60, priorities: PRIOS, dayGym: {}, gyms: [{ id: "a1", equipment: ALL }],
  familiar: FAZ, pains: [{ region: "escapula_e", intensity: 2 }], ...o,
});
// a variação usa o banco de alternativas da #125 (o Worker injeta o mesmo altsDoBanco)
const inp = (o: Partial<WeekInput> = {}, p: Partial<WeekProfile> = {}): WeekInput => ({ weekStart: MON, today: D[0], sets: {}, attendance: {}, profile: prof(p), targets: T, alternativasDe: altsDoBanco, ...o });
const treinos = (w: WeekPlan) => w.days.filter((d): d is WeekDay & { plan: DayPlan } => d.kind === "treino" && !!d.plan);
const ids = (p: DayPlan) => p.items.map((i) => i.exerciseId);
const doTipo = (w: WeekPlan, g: string) => treinos(w).filter((d) => d.plan.groups.join() === g);
const soma = (w: WeekPlan, m: MuscleId) => treinos(w).reduce((a, d) => a + (d.plan.perMuscle[m] ?? 0), 0);

test("caso real, 4 dias: Superior A e B com ênfase, exercícios e ordem diferentes (sobreposição ≤ X)", () => {
  const w = planWeek(inp());
  assert.deepEqual(treinos(w).map((d) => `${d.plan.tipo}${d.plan.letra}`), ["supA", "infA", "supB", "infB"]);
  const [a, b] = doTipo(w, "sup").map((d) => d.plan);
  assert.ok(sobreposicao(ids(a), ids(b)) <= SOBREPOSICAO_MAX, `sobreposição ${sobreposicao(ids(a), ids(b))}: ${ids(a)} × ${ids(b)}`);
  assert.notDeepEqual(a.enfase, b.enfase);
  assert.deepEqual(a.enfase, ["ombro", "triceps", "peito"], "Superior A = ombro lateral + tríceps + peito");
  assert.deepEqual(b.enfase, ["biceps", "costas", "post"], "Superior B = bíceps + costas + ombro posterior");
  // a ordem: o foco do dia vem primeiro
  assert.equal(a.items[0].muscle, "ombro");
  assert.equal(b.items[0].muscle, "biceps");
  assert.notEqual(a.name, b.name);
  // inferiores também variam (agachamento × leg press, stiff × mesa flexora)
  const [ia, ib] = doTipo(w, "inf").map((d) => d.plan);
  assert.ok(sobreposicao(ids(ia), ids(ib)) <= SOBREPOSICAO_MAX, `${ids(ia)} × ${ids(ib)}`);
  // a variação sai do que a pessoa já faz primeiro (#74) e o "por quê" explica
  assert.ok(FAZ.filter((id) => ids(a).includes(id) || ids(b).includes(id)).length >= 4, "os exercícios que já faz continuam na semana");
  assert.ok(b.why.some((x) => /Variação B/.test(x) && /estímulo/.test(x)), b.why.join(" | "));
  // a variação vem do banco (#125): a lateral de A é trocada por uma alternativa da lista dela
  const latA = a.items.find((i) => i.muscle === "ombro")!.exerciseId, latB = b.items.find((i) => i.muscle === "ombro")!.exerciseId;
  assert.ok(altsDoBanco(latA).includes(latB), `${latA} → ${latB}`);
  assert.ok(ajusteVariacao(latB, [latA], altsDoBanco) > 0 && ajusteVariacao(latA, [latA], altsDoBanco) < 0);
});

test("volume: cada foco ≥ 2× e a semana dentro do orçamento; o volume é dividido entre os dias, não copiado", () => {
  const i = inp(), w = planWeek(i), v = weekView(i, w);
  for (const m of PRIOS) assert.ok((v.projected.freq[m] ?? 0) >= 2, `${m} 2×`);
  for (const m of MUSCLE_IDS) assert.ok(soma(w, m) <= T[m], `${m}: ${soma(w, m)} > ${T[m]}`);
  const [a, b] = doTipo(w, "sup").map((d) => d.plan);
  assert.notDeepEqual(a.perMuscle, b.perMuscle, "as séries não são as mesmas nos dois dias");
  assert.ok((a.perMuscle.ombro ?? 0) > (b.perMuscle.ombro ?? 0), "ombro tem mais séries no dia de ênfase dele");
  assert.ok((b.perMuscle.biceps ?? 0) > (a.perMuscle.biceps ?? 0), "bíceps tem mais séries no dia de ênfase dele");
});

test("rótulo = músculos de maior volume do dia; contagem do cabeçalho = tamanho da lista", () => {
  const w = planWeek(inp());
  for (const d of treinos(w)) {
    const p = d.plan, rot = musculosDoRotulo(p.perMuscle, p.enfase ?? []);
    assert.ok(rot.length >= 1 && rot.length <= 2);
    const outros = MUSCLE_IDS.filter((m) => !rot.includes(m)).map((m) => p.perMuscle[m] ?? 0);
    for (const m of rot) assert.ok((p.perMuscle[m] ?? 0) >= Math.max(0, ...outros), `${p.name}: ${m} não é dos de maior volume`);
    assert.ok(p.name.endsWith(rot.map((m) => NOME_ROTULO[m]).join(" e ")), p.name);
    assert.doesNotMatch(p.name, /ênfase em braços/);
    const lista = exerciciosDoDia(p);
    assert.equal(lista.length, p.prehab.length + p.items.length);
    assert.match(cabecalhoDia(p), new RegExp(`^${lista.length} exercícios · ${p.setsTotal} séries · ~${p.estMinutes} min$`));
  }
  assert.ok(treinos(w).some((d) => d.plan.prehab.length > 0), "o caso real tem fortalecimento pela dor (o 7º item)");
});

test("divisão por número de dias: 2 → corpo inteiro A/B; 3 → A/B/C; 4 → Sup/Inf A/B; 5 → híbrido com os focos à frente; 6 → PPL", () => {
  const casos: [string[], string[]][] = [
    [["seg", "qui"], ["fullA", "fullB"]],
    [["seg", "qua", "sex"], ["fullA", "fullB", "fullC"]],
    [["seg", "ter", "qui", "sex"], ["supA", "infA", "supB", "infB"]],
    [["seg", "ter", "qua", "qui", "sex"], ["supA", "infA", "supB", "infB", "supC"]],
    [["seg", "ter", "qua", "qui", "sex", "sab"], ["pushA", "pullA", "legsA", "pushB", "pullB", "legsB"]],
  ];
  for (const [dias, esperado] of casos) {
    const i = inp({}, { daysUsual: dias, daysTarget: dias.length, minutes: 75 });
    const w = planWeek(i), v = weekView(i, w);
    assert.deepEqual(treinos(w).map((d) => `${d.plan.tipo}${d.plan.letra}`), esperado, `${dias.length} dias`);
    for (const m of PRIOS) assert.ok((v.projected.freq[m] ?? 0) >= 2, `${dias.length} dias: ${m} 2×`);
    const nomes = treinos(w).map((d) => d.plan.name);
    assert.equal(new Set(nomes).size, nomes.length, `${dias.length} dias: nomes repetidos ${nomes}`);
  }
  // 5 dias: o 3º superior é dos focos
  const w5 = planWeek(inp({}, { daysUsual: ["seg", "ter", "qua", "qui", "sex"], daysTarget: 5 }));
  assert.deepEqual(treinos(w5)[4].plan.enfase, PRIOS);
  // 6 dias: empurrar e puxar não misturam músculos
  const w6 = planWeek(inp({}, { daysUsual: ["seg", "ter", "qua", "qui", "sex", "sab"], daysTarget: 6 }));
  const push = ["peito", "ombro", "triceps"], pull = ["costas", "post", "biceps"];
  for (const d of treinos(w6)) {
    const ms = Object.keys(d.plan.perMuscle);
    if (d.plan.tipo === "push") assert.ok(ms.every((m) => push.includes(m)), ms.join());
    if (d.plan.tipo === "pull") assert.ok(ms.every((m) => pull.includes(m)), ms.join());
    if (d.plan.tipo === "legs") assert.ok(ms.every((m) => MUSCLES[m as MuscleId].group === "inf"), ms.join());
  }
});

test("método muda a frequência: 1× (bro split), 2× (padrão) e 3× nos focos", () => {
  const um = inp({}, { daysUsual: ["seg", "qua", "sex"], daysTarget: 3, frequencia: 1 });
  const v1 = weekView(um, planWeek(um));
  assert.deepEqual(treinos(v1).map((d) => d.plan.tipo), ["push", "pull", "legs"]);
  for (const m of MUSCLE_IDS) assert.ok((v1.projected.freq[m] ?? 0) <= 1, `${m} 1×`);
  for (const m of PRIOS) assert.equal(v1.projected.freq[m], 1, `${m} 1×`);

  const dois = inp({}, { daysUsual: ["seg", "ter", "qui", "sab"], daysTarget: 4 });
  const v2 = weekView(dois, planWeek(dois));
  for (const m of PRIOS) assert.equal(v2.projected.freq[m], 2, `${m} 2×`);

  const tres = inp({}, { daysUsual: ["seg", "ter", "qui", "sab"], daysTarget: 4, frequencia: 3 });
  const w3 = planWeek(tres), v3 = weekView(tres, w3);
  for (const m of PRIOS) assert.ok((v3.projected.freq[m] ?? 0) >= 3, `${m} 3×: ${v3.projected.freq[m]}`);
  for (const d of w3.days) assert.deepEqual(d.warn, [], "3× sem quebrar as 48 h");
  for (const m of MUSCLE_IDS) assert.ok(soma(w3, m) <= T[m], `${m} no orçamento`);
});

test("edição manual e pedido de repetir pelo Chat não são sobrescritos pela variação automática", () => {
  const base = planWeek(inp());
  const seg = base.days[0].plan!;
  // Chat: "repita o mesmo treino de segunda na quinta" → salvo como fixo (source claude)
  const repetido = { ...seg, name: "Superior A · repetido" };
  const w = planWeek(inp({ fixed: { [D[3]]: { plan: repetido, source: "claude" } } }));
  assert.deepEqual(ids(w.days[3].plan!), ids(seg), "quinta = segunda, como pedido");
  assert.deepEqual(w.days[3].plan!.items.map((i) => i.sets), seg.items.map((i) => i.sets));
  assert.deepEqual(ids(w.days[0].plan!), ids(seg), "a segunda não muda para 'variar' da quinta");
  // edição manual
  const manual = { ...seg, name: "Meu treino", items: seg.items.slice(0, 3).map((i) => ({ ...i, manual: true })) };
  const wm = planWeek(inp({ fixed: { [D[3]]: { plan: manual, source: "manual" } } }));
  assert.deepEqual(ids(wm.days[3].plan!), ids(manual));
  assert.equal(wm.days[3].plan!.name, "Meu treino");
});

test("superséries: com o formato superserie, os dois dias superiores têm pares que não competem", () => {
  const w = planWeek(inp({}, { formato: "superserie" }));
  for (const d of doTipo(w, "sup")) {
    assert.ok(d.plan.items.some((i) => i.par), `${d.dow} sem par`);
    assert.deepEqual(validarPares(d.plan.items, ALL), [], d.plan.items.map((i) => `${i.par ?? "-"} ${i.exerciseId}`).join(", "));
  }
});

// ---------- anti-repetição ----------
const DIAS_4SEM = Array.from({ length: 28 }, (_, k) => new Date(Date.parse(MON + "T12:00:00Z") - (28 - k) * 864e5).toISOString().slice(0, 10));
/** 4 semanas fazendo o mesmo treino superior 2× por semana (seg e qui) */
const historico4 = (ex: string[]) => DIAS_4SEM.filter((_, k) => k % 7 === 0 || k % 7 === 3).map((date) => ({ date, ids: ex }));

test("anti-repetição: 4 semanas repetindo o mesmo exercício → a geração varia; `sempre` fica", () => {
  const lat = "One-Arm_Incline_Lateral_Raise";
  const sess = historico4([lat, "Incline_Dumbbell_Curl"]);
  const cans = exerciciosCansados(sess);
  assert.ok(cans.includes(lat) && cans.includes("Incline_Dumbbell_Curl"), cans.join());
  assert.ok(!exerciciosCansados(sess.slice(-(REPETE_SEGUIDAS_MAX - 1))).includes(lat), "poucas sessões: não cansa");
  const antes = planWeek(inp());
  assert.ok(doTipo(antes, "sup").some((d) => ids(d.plan).includes(lat)), "sem histórico, o que já faz entra");
  const w = planWeek(inp({ cansados: cans }));
  for (const d of doTipo(w, "sup")) assert.ok(!ids(d.plan).includes(lat), `${d.dow}: ${ids(d.plan)}`);
  assert.ok(doTipo(w, "sup").every((d) => (d.plan.perMuscle.ombro ?? 0) > 0), "o músculo continua, só o exercício muda");
  const fixo = planWeek(inp({ cansados: cans }, { pinned: { ombro: lat } }));
  for (const d of doTipo(fixo, "sup")) assert.ok(ids(d.plan).includes(lat), "`sempre` garante presença");
});

// ---------- resumo do histórico ----------
const HOJE = "2026-11-20";
const serie = (date: string, exerciseId: string, muscle: MuscleId, kg = 10, reps = 10) => ({ date, exerciseId, muscle, kg, reps });
const dias = (n: number) => Array.from({ length: n }, (_, k) => new Date(Date.parse(HOJE + "T12:00:00Z") - k * 864e5).toISOString().slice(0, 10));

test("resumoHistorico: janela mês + última semana (gerar a semana) e mês + N dias (treino avulso)", () => {
  const e = { hoje: HOJE, series: [serie(HOJE, "Side_Lateral_Raise", "ombro")], alvo: T, prioridades: PRIOS };
  const s = resumoHistorico(e, { tipo: "semana" });
  assert.deepEqual(s.janela, { tipo: "semana", mes: ["2026-10-24", HOJE], recente: ["2026-11-14", HOJE] });
  const d = resumoHistorico(e, { tipo: "dia" });
  assert.deepEqual(d.janela, { tipo: "dia", mes: ["2026-10-24", HOJE], recente: ["2026-11-14", HOJE] }, "padrão: 7 dias");
  const d3 = resumoHistorico(e, { tipo: "dia", dias: 3 });
  assert.deepEqual(d3.janela.recente, ["2026-11-18", HOJE]);
  // séries fora da janela recente não contam no "feito" recente, mas contam no mês
  const velho = resumoHistorico({ ...e, series: [serie("2026-11-01", "Side_Lateral_Raise", "ombro")] }, { tipo: "dia", dias: 3 });
  assert.match(velho.musculos.ombro ?? "", /^0\/6 · 0× · falta 6 · mês 0\.3\/sem$/);
});

test("resumoHistorico: subparte atrasada (ombro lateral sem estímulo), repetição contada e preferências", () => {
  const series = dias(28).filter((_, k) => k % 4 === 0).flatMap((d) => [
    ...[1, 2, 3].map(() => serie(d, "Seated_Dumbbell_Press", "ombro")), // desenvolvimento: anterior, quase nada de lateral
    ...[1, 2, 3, 4, 5, 6].map(() => serie(d, "Incline_Dumbbell_Curl", "biceps")),
  ]);
  const r = resumoHistorico({ hoje: HOJE, series, alvo: T, prioridades: PRIOS, sempre: { biceps: "Incline_Dumbbell_Curl" }, nunca: ["Upright_Barbell_Row"], faltas: ["2026-11-17"] }, { tipo: "semana" });
  assert.ok(r.atrasadas.some((a) => a.parte === "ombro_lat"), JSON.stringify(r.atrasadas));
  assert.ok(!r.atrasadas.some((a) => a.parte === "biceps"), "bíceps em dia");
  const rep = r.repetidos.find((x) => x.id === "Seated_Dumbbell_Press");
  assert.deepEqual(rep, { id: "Seated_Dumbbell_Press", sessoes: 7, de: 7 });
  assert.ok(r.cansados.includes("Seated_Dumbbell_Press"));
  assert.ok(!r.cansados.includes("Incline_Dumbbell_Curl"), "`sempre` não entra na anti-repetição");
  assert.deepEqual(r.sempre, ["Incline_Dumbbell_Curl"]);
  assert.deepEqual(r.nunca, ["Upright_Barbell_Row"]);
  assert.equal(r.faltas, 1);
  assert.match(r.musculos.ombro ?? "", /^6\/14 · 2× · falta 8 · mês 5\.3\/sem$/, "na última semana: 2 sessões de ombro");
});

test("resumoHistorico: dentro do teto de tamanho com histórico pesado", () => {
  const exs = ["Side_Lateral_Raise", "Seated_Dumbbell_Press", "Incline_Dumbbell_Curl", "Hammer_Curls", "Triceps_Pushdown", "Leg_Press", "Romanian_Deadlift", "Leverage_Iso_Row", "Incline_Dumbbell_Press", "Reverse_Flyes", "Cable_Crunch", "Standing_Calf_Raises"];
  const series = dias(40).flatMap((d, k) => exs.flatMap((id) => [1, 2, 3, 4].map((s) => serie(d, id, EXERCISE_BY_ID[id].m, 10 + k + s, 8 + s))));
  const r = resumoHistorico({
    hoje: HOJE, series, alvo: T, prioridades: PRIOS, memoria: Array.from({ length: 20 }, (_, k) => `fato ${k} `.repeat(40)),
    dores: [{ region: "escapula_e", intensity: 2 }, { region: "lombar", intensity: 1 }], faltas: dias(10),
  }, { tipo: "semana" });
  const tok = estimarTokens(JSON.stringify(r));
  assert.ok(tok <= TETO_HISTORICO, `${tok} tokens`);
  assert.ok(r.memoria.length <= 5 && r.memoria.every((m) => m.length <= 140));
  assert.ok(r.cargas.length >= 1 && r.cargas.length <= 6);
});
