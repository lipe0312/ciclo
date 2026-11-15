// #74 Meu treino atual, eficiência por subparte, Trocar na mesma parte e troca forçada que rebalanceia a semana.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EQUIPMENT, EXERCISES, EXERCISE_BY_ID, MUSCLES, SUB_MUSCLES, weeklyTargets, weekDates, planWeek, planDay, alternativas, candidates,
  validarTreinoAtual, validateProfilePatch, applyProfilePatch, faltaParaGerar, validarParaGerar, perfilVazio, coberturaTreinoAtual, familiaresDoTreino,
  entradaTreinoAtual, exerciciosDoGrupo, buscarExercicioAtual, lembradasDoTreino, destacarBusca, partePrincipal, grupoDoExercicio,
  creditoSubpartes, volumeSubpartes, creditoMusculos, trocasDoDia, motivoReposicao, GRUPOS_TREINO, FAMILIAR, EFICIENCIA_PESO, POPULAR_PESO, REPOSICAO,
} from "../src/index.ts";
import type { DayInput, MuscleId, Sets, TreinoAtual, WeekInput, WeekProfile } from "../src/index.ts";

const ALL = EQUIPMENT.map((e) => e.id);
const PRIOS: MuscleId[] = ["ombro", "biceps", "triceps"];
const MON = "2026-11-09";
const D = weekDates(MON);
const T = weeklyTargets(1, PRIOS);
const prof = (o: Partial<WeekProfile> = {}): WeekProfile => ({
  daysUsual: ["seg", "ter", "qui", "sex"], daysTarget: 4, minutes: 60, priorities: PRIOS, dayGym: {}, gyms: [{ id: "a1", equipment: ALL }], ...o,
});
const inp = (o: Partial<WeekInput> = {}): WeekInput => ({ weekStart: MON, today: D[0], sets: {}, attendance: {}, profile: prof(), targets: T, ...o });
const dia = (o: Partial<DayInput> = {}): DayInput => ({
  targets: T, done: {}, freq: {}, priorities: PRIOS, daysLeft: 3, minutes: 60, lastGroup: null, mode: "normal", equipment: ALL, ...o,
});

// ---------- catálogo ----------
test("catálogo: todo exercício fora do planOff tem subMuscles e eficiência, e a subparte principal tem a maior nota", () => {
  for (const e of EXERCISES) {
    if (e.planOff) continue;
    assert.ok(e.subMuscles?.length, `${e.id} sem subMuscles`);
    assert.ok(e.eficiencia && Object.keys(e.eficiencia).length, `${e.id} sem eficiência`);
    const p = e.subMuscles![0], max = Math.max(...Object.values(e.eficiencia!));
    assert.equal(e.eficiencia![p], max, `${e.id}: a principal (${p}) precisa da maior nota`);
    for (const s of Object.keys(e.eficiencia!)) assert.ok(SUB_MUSCLES[s as keyof typeof SUB_MUSCLES], `${e.id} → ${s}`);
  }
  for (const e of EXERCISES) assert.ok(e.popularidade && e.popularidade >= 1 && e.popularidade <= 5, `${e.id} popularidade`);
});

test("eficiência segue a pesquisa: desenvolvimento quase não pega o posterior; crucifixo inverso pega", () => {
  assert.equal(EXERCISE_BY_ID.Seated_Dumbbell_Press.eficiencia?.ombro_post, undefined);
  assert.equal(EXERCISE_BY_ID.Reverse_Machine_Flyes.eficiencia?.ombro_post, 3);
  assert.equal(EXERCISE_BY_ID.Cable_Rope_Overhead_Triceps_Extension.eficiencia?.triceps_longa, 3);
  assert.ok((EXERCISE_BY_ID.Seated_Leg_Curl.eficiencia?.isquio ?? 0) > (EXERCISE_BY_ID.Lying_Leg_Curls.eficiencia?.isquio ?? 0), "flexora sentada > deitada");
  assert.ok((EXERCISE_BY_ID.Standing_Calf_Raises.eficiencia?.pant ?? 0) > (EXERCISE_BY_ID.Seated_Calf_Raise.eficiencia?.pant ?? 0), "em pé > sentado");
  assert.ok(FAMILIAR > EFICIENCIA_PESO * 2 && REPOSICAO > FAMILIAR && POPULAR_PESO * 4 < 1, "familiar forte, popularidade só desempata");
});

// ---------- validação ----------
const TA: TreinoAtual = { divisoes: [
  { nome: "A", grupos: ["peito", "triceps"], exercicios: [{ id: "Barbell_Bench_Press_-_Medium_Grip", sets: 4, reps: 8, kg: 60 }, { id: "Incline_Dumbbell_Press" }, { id: "Triceps_Pushdown" }, { id: "Cable_Rope_Overhead_Triceps_Extension" }] },
  { nome: "B", grupos: ["costas", "biceps"], exercicios: [{ id: "Wide-Grip_Lat_Pulldown" }, { id: "Seated_Cable_Rows" }, { id: "Barbell_Curl", reps: 10, kg: 25 }, { id: "Hammer_Curls" }] },
  { nome: "C", grupos: ["pernas", "abdomen"], exercicios: [{ id: "Leg_Press" }, { id: "Leg_Extensions" }, { id: "Lying_Leg_Curls" }, { id: "Barbell_Hip_Thrust" }, { id: "Standing_Calf_Raises" }, { id: "Cable_Crunch" }] },
  { nome: "D", grupos: ["ombro"], exercicios: [{ id: "Seated_Dumbbell_Press" }, { id: "Side_Lateral_Raise" }, { id: "Reverse_Machine_Flyes" }, { nome: "Elevação Y no cabo do meu jeito", grupo: "ombro" }] },
] };

test("treinoAtual: valida grupos grandes e IDs só do catálogo; o perfil aceita e o faltaParaGerar ignora", () => {
  assert.equal(validarTreinoAtual(TA).ok, true);
  assert.equal(validateProfilePatch({ treinoAtual: TA }).ok, true);
  const r = applyProfilePatch(perfilVazio(), { treinoAtual: TA });
  assert.ok(r.ok && r.profile.treinoAtual);
  for (const ruim of [
    { divisoes: [{ nome: "A", grupos: ["ombro_post"], exercicios: [] }] },           // subparte no 1º nível: nunca
    { divisoes: [{ nome: "A", grupos: ["ombro"], exercicios: [{ id: "Supino_Inventado" }] }] },
    { divisoes: [{ nome: "A", grupos: ["ombro"], exercicios: [{ id: "Side_Lateral_Raise" }, { id: "Side_Lateral_Raise" }] }] },
    { divisoes: [{ nome: "A", grupos: ["ombro"], exercicios: [{ id: "Side_Lateral_Raise", sets: 99 }] }] },
    { divisoes: Array.from({ length: 8 }, (_, i) => ({ nome: `T${i}`, grupos: [], exercicios: [] })) },
    { divisoes: [{ nome: "<b>A</b>", grupos: [], exercicios: [] }] },
    { divisoes: [], extra: 1 },
  ]) assert.equal(validarTreinoAtual(ruim).ok, false, JSON.stringify(ruim).slice(0, 80));
  // opcional: sem treinoAtual, nada falta para gerar; com ele, o que falta é o mesmo
  const base = { goal: { id: "massa_geral" }, level: 1, daysUsual: ["seg"], minutes: 60, places: ["academia"] };
  assert.deepEqual(faltaParaGerar(base), []);
  assert.deepEqual(faltaParaGerar({ ...base, treinoAtual: { divisoes: [] } }), []);
  assert.equal(validarParaGerar({ ...base, treinoAtual: TA }).ok, true);
});

test("exercício livre: texto curto sem HTML, fica { nome, grupo } e nunca vira ID", () => {
  const livre = (nome: unknown, grupo: unknown = "ombro") => validarTreinoAtual({ divisoes: [{ nome: "A", grupos: ["ombro"], exercicios: [{ nome, grupo }] }] });
  const ok = livre("  Elevação   Y no cabo ");
  assert.ok(ok.ok);
  assert.deepEqual(ok.ok && ok.value.divisoes[0].exercicios[0], { nome: "Elevação Y no cabo", grupo: "ombro" });
  for (const ruim of ["<script>x</script>", "a", "x".repeat(41), "linha\u0000", 42]) assert.equal(livre(ruim).ok, false, String(ruim));
  assert.equal(livre("Remada alta", "ombro_post").ok, false, "grupo só grande");
  assert.equal(validarTreinoAtual({ divisoes: [{ nome: "A", grupos: [], exercicios: [{ nome: "x y", grupo: "ombro", id: "Side_Lateral_Raise" }] }] }).ok, false, "livre não carrega id");
  // nunca vira ID; se o texto casa com um nome/apelido do catálogo, é só sinal fraco
  const f = familiaresDoTreino({ divisoes: [{ nome: "A", grupos: ["ombro"], exercicios: [{ nome: "Elevação lateral com halteres", grupo: "ombro" }, { nome: "Coisa minha", grupo: "ombro" }] }] });
  assert.deepEqual(f.fortes, []);
  assert.deepEqual(f.fracos, ["Side_Lateral_Raise"]);
});

test("cobertura: quais grupos grandes já têm exercício (catálogo e livre contam)", () => {
  const c = coberturaTreinoAtual(TA);
  assert.deepEqual(c.map((x) => x.grupo), [...GRUPOS_TREINO]);
  assert.deepEqual(c.find((x) => x.grupo === "ombro"), { grupo: "ombro", informado: true, n: 4 });
  assert.equal(c.find((x) => x.grupo === "pernas")!.n, 5);
  assert.equal(c.find((x) => x.grupo === "abdomen")!.n, 1);
  assert.ok(coberturaTreinoAtual(null).every((x) => !x.informado && x.n === 0));
  assert.deepEqual(coberturaTreinoAtual({ divisoes: [{ nome: "A", grupos: ["ombro"], exercicios: [{ id: "Reverse_Flyes" }] }] }).filter((x) => x.informado).map((x) => x.grupo), ["ombro"]);
});

test("lista do grupo por popularidade, busca em tudo, carga lembrada e destaque com texto puro", () => {
  const ombro = exerciciosDoGrupo("ombro");
  assert.ok(ombro.every((e) => grupoDoExercicio(e) === "ombro") && ombro.some((e) => e.m === "post"), "posterior entra em Ombro");
  for (let i = 1; i < ombro.length; i++) assert.ok((ombro[i - 1].popularidade ?? 0) >= (ombro[i].popularidade ?? 0));
  assert.ok(buscarExercicioAtual("rosca").every((e) => e.type === "forca"));
  assert.ok(buscarExercicioAtual("crucifixo inverso").some((e) => e.id === "Bent_Over_Dumbbell_Rear_Delt_Raise_With_Head_On_Bench"));
  assert.ok(buscarExercicioAtual("elevacao lateral").some((e) => e.id === "Side_Lateral_Raise"), "sem acento");
  assert.deepEqual(buscarExercicioAtual("   "), []);
  assert.deepEqual(lembradasDoTreino(TA), [
    { exerciseId: "Barbell_Bench_Press_-_Medium_Grip", kg: 60, reps: 8, confidence: "aproximado" },
    { exerciseId: "Barbell_Curl", kg: 25, reps: 10, confidence: "aproximado" },
  ]);
  assert.deepEqual(destacarBusca("Elevação lateral", "elevacao"), ["", "Elevação", " lateral"]);
  assert.deepEqual(destacarBusca("Rosca direta", "xyz"), ["Rosca direta", "", ""]);
});

// ---------- gerador ----------
test("quem já treina: ≥ 70% dos exercícios da semana vêm do treino atual quando a academia tem os aparelhos", () => {
  const e = entradaTreinoAtual({ level: 2, treinoAtual: TA });
  assert.equal(e.iniciante, false);
  const w = planWeek(inp({ profile: prof({ familiar: e.familiar }) }));
  const itens = w.days.flatMap((d) => d.plan?.items ?? []);
  assert.ok(itens.length >= 16);
  const meus = itens.filter((i) => e.familiar.includes(i.exerciseId)).length;
  assert.ok(meus / itens.length >= 0.7, `só ${meus}/${itens.length} do treino atual`);
  // sem o treino atual, a semana continua sendo gerada (nada trava) e é outra
  const sem = planWeek(inp()).days.flatMap((d) => d.plan?.items ?? []);
  assert.ok(sem.length >= 16);
  assert.ok(sem.filter((i) => e.familiar.includes(i.exerciseId)).length < meus);
});

test("familiar nunca fura aparelho, dor nem avoid", () => {
  const fam = ["Reverse_Machine_Flyes", "Barbell_Bench_Press_-_Medium_Grip", "Dips_-_Triceps_Version"];
  const sem = candidates("post", { equipment: ALL.filter((q) => q !== "peck"), familiar: fam });
  assert.ok(!sem.some((c) => c.ex.id === "Reverse_Machine_Flyes"), "sem voador, sem crucifixo na máquina");
  const evita = candidates("peito", { equipment: ALL, familiar: fam, avoid: ["Barbell_Bench_Press_-_Medium_Grip"] });
  assert.ok(!evita.some((c) => c.ex.id === "Barbell_Bench_Press_-_Medium_Grip"));
  const dor = planDay(dia({ split: "sup", familiar: fam, pains: [{ region: "ombro_d", intensity: 2 }] }));
  assert.ok(!dor.items.some((i) => i.exerciseId === "Dips_-_Triceps_Version"), "paralela com dor no ombro");
  const p = planDay(dia({ split: "sup", familiar: fam }));
  assert.ok(p.items.some((i) => i.exerciseId === "Reverse_Machine_Flyes"), "com tudo liberado, o que ela já faz entra");
});

test("iniciante: a popularidade só desempata (não passa a eficiência)", () => {
  const c = candidates("ombro", { equipment: ["halteres", "banco"], iniciante: true });
  assert.equal(partePrincipal(c[0].ex), "ombro_lat", "o alvo do orçamento ombro é o lateral");
  const sem = candidates("ombro", { equipment: ["halteres", "banco"] });
  assert.equal(c[0].ex.id, sem[0].ex.id);
});

// ---------- Trocar ----------
test("Trocar: mesmaParte nunca muda a subparte principal (posterior, peito superior, tríceps longa)", () => {
  const ctx = { equipment: ALL };
  const post = alternativas("Reverse_Flyes", ctx);
  assert.equal(post.parte, "ombro_post");
  assert.ok(post.mesmaParte.length >= 3);
  assert.ok(post.mesmaParte.every((a) => partePrincipal(a.ex) === "ombro_post"));
  assert.ok(!post.mesmaParte.some((a) => /Press/.test(a.ex.id)), "desenvolvimento nunca é mesma parte do posterior");
  assert.ok(post.outraParte.some((a) => a.ex.id === "Seated_Dumbbell_Press"), "desenvolvimento só em 'outra parte'");
  const sup = alternativas("Incline_Dumbbell_Press", ctx);
  assert.ok(sup.mesmaParte.every((a) => partePrincipal(a.ex) === "peito_sup"));
  assert.ok(!sup.mesmaParte.some((a) => ["Barbell_Bench_Press_-_Medium_Grip", "Dumbbell_Bench_Press", "Leverage_Chest_Press"].includes(a.ex.id)), "sem supino reto");
  const longa = alternativas("Cable_Rope_Overhead_Triceps_Extension", ctx);
  assert.ok(longa.mesmaParte.length >= 2 && longa.mesmaParte.every((a) => partePrincipal(a.ex) === "triceps_longa"), "não devolve só lateral");
  assert.ok(longa.outraParte.some((a) => a.ex.id === "Triceps_Pushdown"));
  // ordem: o que ela já faz → eficiência na parte → catálogo
  const fam = alternativas("Reverse_Flyes", { equipment: ALL, familiar: ["Face_Pull"] });
  assert.equal(fam.mesmaParte[0].ex.id, "Face_Pull");
  assert.ok(fam.mesmaParte[0].familiar);
  for (let i = 2; i < fam.mesmaParte.length; i++) assert.ok(fam.mesmaParte[i - 1].nota >= fam.mesmaParte[i].nota, "por eficiência depois do 'já faço'");
  assert.ok(alternativas("Reverse_Flyes", { equipment: ["halteres"] }).semAparelho.some((e) => e.id === "Reverse_Machine_Flyes"));
});

// ---------- troca forçada ----------
test("troca forçada: credita pelas subpartes reais do exercício feito", () => {
  assert.deepEqual(creditoSubpartes("Seated_Dumbbell_Press", 3), { ombro_ant: 3, ombro_lat: 1.5 });
  assert.equal(creditoSubpartes("Seated_Dumbbell_Press", 3).ombro_post, undefined, "desenvolvimento não credita posterior");
  assert.deepEqual(creditoMusculos({ Seated_Dumbbell_Press: 3, Reverse_Flyes: 2 }), { ombro: 3, post: 2 });
  assert.equal(volumeSubpartes({ Reverse_Flyes: 3, Face_Pull: 2 }).ombro_post, 4);
  const plan = planDay(dia({ split: "sup" }));
  const post = plan.items.find((i) => i.muscle === "post")!;
  assert.ok(post, "o dia tem posterior");
  const feitos: Record<string, number> = Object.fromEntries(plan.items.filter((i) => i !== post).map((i) => [i.exerciseId, i.sets]));
  feitos.Seated_Dumbbell_Press = post.sets;
  const t = trocasDoDia(plan, feitos, D[1]);
  assert.deepEqual(t, [{ date: D[1], planejado: post.exerciseId, feito: "Seated_Dumbbell_Press", parte: "ombro_post", falta: post.sets }]);
  // trocar na mesma parte não deixa falta; pular sem trocar fica com o orçamento
  assert.deepEqual(trocasDoDia(plan, { ...feitos, Seated_Dumbbell_Press: 0, Cable_Rear_Delt_Fly: post.sets }, D[1]).filter((x) => x.parte === "ombro_post"), []);
});

/** Semana de segunda; na terça a pessoa registrou o treino de segunda trocando um exercício. */
function semanaComTroca(planejadoMusculo: MuscleId, feito: string, profile = prof()) {
  const w0 = planWeek(inp({ profile }));
  const seg = w0.days[0].plan!;
  const p = seg.items.find((i) => i.muscle === planejadoMusculo)!;
  assert.ok(p, `segunda planejou ${planejadoMusculo}`);
  const feitos: Record<string, number> = Object.fromEntries(seg.items.filter((i) => i !== p).map((i) => [i.exerciseId, i.sets]));
  feitos[feito] = p.sets;
  const sets: Sets = creditoMusculos(feitos);
  const w1 = planWeek(inp({ profile, today: D[1], sets: { [D[0]]: sets }, feitos: { [D[0]]: feitos }, prev: w0 }));
  return { w0, w1, p, sets };
}

test("troca forçada: o replanejamento põe o posterior num dia seguinte e explica o porquê, sem compensar em dobro", () => {
  const { w1, p, sets } = semanaComTroca("post", "Seated_Dumbbell_Press");
  assert.equal(p.exerciseId, "Reverse_Flyes");
  const qui = w1.days[3];
  const item = qui.plan!.items.find((i) => partePrincipal(EXERCISE_BY_ID[i.exerciseId]) === "ombro_post");
  assert.ok(item, "quinta repõe o ombro posterior");
  assert.equal(EXERCISE_BY_ID[item!.exerciseId].eficiencia?.ombro_post, 3, "com um exercício principal dele");
  assert.deepEqual(qui.repoe?.map((r) => r.parte), ["ombro_post"]);
  const txt = "Ombro posterior entrou na quinta: na segunda você trocou crucifixo inverso com halteres por desenvolvimento com halteres.";
  assert.equal(qui.repoe![0].texto, txt);
  assert.equal(qui.plan!.why[0], txt, "o porquê aparece no treino do dia (Semana e Treino)");
  // nunca em dobro: o que entra para o posterior no resto da semana não passa do que falta
  const resto = w1.days.slice(1).reduce((a, d) => a + (d.plan?.perMuscle.post ?? 0), 0);
  assert.ok(resto <= T.post - (sets.post ?? 0), `posterior ${resto} > falta ${T.post}`);
  assert.equal(motivoReposicao({ date: D[1], planejado: "Reverse_Flyes", feito: "Seated_Dumbbell_Press", parte: "ombro_post", falta: 3 }, D[5]).split(":")[0], "Ombro posterior entrou no sábado");
});

test("troca forçada na mesma músculo, outra parte: peito superior volta na quinta mesmo com o reto no treino atual", () => {
  const profile = prof({ familiar: ["Barbell_Bench_Press_-_Medium_Grip"] });
  // sem troca, a quinta faria o supino reto (o que ela já faz)
  const base = planWeek(inp({ profile })).days[3].plan!;
  assert.ok(base.items.some((i) => i.exerciseId === "Barbell_Bench_Press_-_Medium_Grip"));
  // na segunda, o planejado de peito vira o reto (ela trocou o inclinado pelo reto)
  const w0 = planWeek(inp({ profile }));
  const seg = w0.days[0].plan!;
  seg.items = seg.items.map((i) => i.muscle === "peito" ? { ...i, exerciseId: "Incline_Dumbbell_Press", nm: EXERCISE_BY_ID.Incline_Dumbbell_Press.nm } : i);
  const feitos: Record<string, number> = Object.fromEntries(seg.items.map((i) => [i.muscle === "peito" ? "Barbell_Bench_Press_-_Medium_Grip" : i.exerciseId, i.sets]));
  const w1 = planWeek(inp({ profile, today: D[1], sets: { [D[0]]: creditoMusculos(feitos) }, feitos: { [D[0]]: feitos }, prev: w0 }));
  const qui = w1.days[3];
  assert.ok(qui.plan!.items.some((i) => i.muscle === "peito" && partePrincipal(EXERCISE_BY_ID[i.exerciseId]) === "peito_sup"), "quinta traz o peito superior");
  assert.equal(qui.repoe?.[0]?.parte, "peito_sup");
  assert.match(qui.repoe![0].texto, /^Peito superior entrou na quinta: na segunda você trocou supino inclinado com halteres por supino reto com barra\.$/);
});

test("sem troca, nada de reposição nem porquê extra", () => {
  const w0 = planWeek(inp());
  const seg = w0.days[0].plan!;
  const feitos = Object.fromEntries(seg.items.map((i) => [i.exerciseId, i.sets]));
  const w1 = planWeek(inp({ today: D[1], sets: { [D[0]]: { ...seg.perMuscle } }, feitos: { [D[0]]: feitos }, prev: w0 }));
  assert.ok(w1.days.every((d) => !d.repoe));
  assert.ok(MUSCLES.post && candidates("post", { equipment: ALL })[0].nota === 3);
});
