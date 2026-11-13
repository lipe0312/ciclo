// #41 Onboarding 2.0: prioridades por grupo (até 5), mais objetivos, "onde treina" multi e mini-assistentes.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PROFILE, GOAL_IDS, GOAL_INFO, METODOS, MUSCLES, PRIORITY_GROUP_IDS, SUB_MUSCLE_IDS, MAX_PRIORITIES,
  applyProfilePatch, fatorRampa, goalDefaults, goalPreset, groupOfSub, groupsOfSubs, moveGroup, normalizeProfile, parametrosDoPerfil,
  planDay, prioritiesFromSubs, priorityGroups, resumoMetodo, toggleGroup, toggleSub, validatePriorities, validateProfilePatch, weeklyTargets,
} from "../src/index.ts";
import type { PriorityGroupId, SubMuscleId } from "../src/index.ts";

const perfil = (goal: string, extra: Record<string, unknown> = {}) => ({ ...DEFAULT_PROFILE, goal: { ...DEFAULT_PROFILE.goal, id: goal }, ...extra });

// ---------- grupos ----------
test("grupos: os 8 grupos do quiz, cada subdivisão do mapa pertence a um grupo e o preset começa pelo principal", () => {
  assert.deepEqual([...PRIORITY_GROUP_IDS], ["ombro", "biceps", "triceps", "peito", "costas", "pernas", "gluteo", "abdomen"]);
  for (const s of SUB_MUSCLE_IDS) assert.ok(PRIORITY_GROUP_IDS.includes(groupOfSub(s)), s);
  for (const g of PRIORITY_GROUP_IDS) {
    const { nm, subs } = priorityGroups[g];
    assert.ok(nm && subs.length >= 1, g);
    for (const s of subs) assert.equal(groupOfSub(s), g, `${g}: ${s} fora do grupo`);
  }
  assert.equal(priorityGroups.ombro.subs[0], "ombro_lat", "ombro: lateral primeiro");
  assert.equal(priorityGroups.triceps.subs[0], "triceps_longa");
  assert.equal(priorityGroups.biceps.nm, "Bíceps");
  // subdivisões soltas também caem no grupo certo (modo avançado do Perfil)
  assert.equal(groupOfSub("braquial"), "biceps"); assert.equal(groupOfSub("antebraco"), "biceps"); assert.equal(groupOfSub("ombro_post"), "ombro");
  assert.equal(groupOfSub("trapezio"), "costas"); assert.equal(groupOfSub("adutores"), "pernas"); assert.equal(groupOfSub("obliquos"), "abdomen");
  assert.equal(groupOfSub("gluteo"), "gluteo");
});

test("grupos: tocar escolhe o grupo (subdivisões do preset, na ordem), tocar de novo retira, o 6º toque é recusado", () => {
  let subs: SubMuscleId[] = [];
  const t = (g: PriorityGroupId) => { const r = toggleGroup(subs, g); subs = r.subs; return r; };
  assert.equal(t("ombro").changed, true);
  assert.deepEqual(subs, priorityGroups.ombro.subs);
  t("biceps");
  assert.deepEqual(groupsOfSubs(subs), ["ombro", "biceps"], "ordem do toque");
  t("triceps"); t("peito"); t("costas");
  assert.equal(groupsOfSubs(subs).length, 5);
  const sixth = toggleGroup(subs, "pernas");
  assert.equal(sixth.changed, false); assert.equal(sixth.reason, "max"); assert.deepEqual(sixth.subs, subs);
  // tocar de novo no ombro retira todas as subdivisões dele e libera a vaga
  const r = toggleGroup(subs, "ombro");
  assert.equal(r.changed, true); assert.ok(!r.subs.some((s) => groupOfSub(s) === "ombro"));
  assert.deepEqual(groupsOfSubs(r.subs), ["biceps", "triceps", "peito", "costas"]);
  assert.equal(toggleGroup(r.subs, "pernas").changed, true);
  assert.equal(MAX_PRIORITIES, 5);
});

test("grupos: toggleSub (modo avançado) respeita o limite de grupos e de subdivisões", () => {
  let subs: SubMuscleId[] = [];
  for (const s of ["ombro_lat", "biceps", "triceps_longa", "peito_medio", "dorsal"] as SubMuscleId[]) subs = toggleSub(subs, s).subs;
  assert.equal(toggleSub(subs, "quad").reason, "max", "6º grupo");
  const mais = toggleSub(subs, "ombro_post");
  assert.equal(mais.changed, true, "outra subparte de um grupo que já está dentro");
  assert.deepEqual(toggleSub(mais.subs, "ombro_post").subs, subs, "tocar de novo retira só a subparte");
  assert.ok(validatePriorities(mais.subs).ok);
});

test("grupos: mover um grupo leva as subdivisões dele juntas", () => {
  let subs: SubMuscleId[] = [...priorityGroups.ombro.subs, ...priorityGroups.biceps.subs, ...priorityGroups.triceps.subs];
  subs = moveGroup(subs, "triceps", -1);
  assert.deepEqual(groupsOfSubs(subs), ["ombro", "triceps", "biceps"]);
  assert.deepEqual(moveGroup(subs, "ombro", -1), subs, "já é o primeiro");
  assert.deepEqual(moveGroup(subs, "biceps", 1), subs, "já é o último");
  assert.deepEqual(subs, [...priorityGroups.ombro.subs, ...priorityGroups.triceps.subs, ...priorityGroups.biceps.subs]);
});

test("validação: até 5 grupos (e 10 subdivisões); 6 grupos ou repetidos recusam", () => {
  assert.equal(validatePriorities(["ombro_lat", "biceps", "triceps_longa", "peito_sup"]).ok, true, "4 grupos agora cabe");
  const cinco: SubMuscleId[] = ["ombro_lat", "biceps", "triceps_longa", "peito_sup", "dorsal"];
  assert.equal(validatePriorities(cinco).ok, true);
  const seis = validatePriorities([...cinco, "quad"]);
  assert.equal(seis.ok, false); assert.match(seis.errors.join(), /até 5/);
  assert.equal(validatePriorities(["biceps", "biceps"]).ok, false);
  const doze = SUB_MUSCLE_IDS.filter((s) => ["costas", "ombro", "biceps", "triceps"].includes(groupOfSub(s)));
  assert.ok(doze.length > 10 && groupsOfSubs(doze).length <= 5);
  assert.equal(validatePriorities(doze).ok, false, "mais de 10 subdivisões");
  // pelo perfil: priorities (músculos) segue o mesmo limite de grupos
  assert.equal(validateProfilePatch({ priorities: ["ombro", "biceps", "triceps", "peito", "costas"] }).ok, true);
  assert.equal(validateProfilePatch({ priorities: ["ombro", "biceps", "triceps", "peito", "costas", "quad"] }).ok, false);
});

test("quiz: o grupo vira as subdivisões certas e o plano prioriza esses músculos (ombro → lateral primeiro)", () => {
  let subs: SubMuscleId[] = [];
  for (const g of ["ombro", "biceps", "triceps"] as PriorityGroupId[]) subs = toggleGroup(subs, g).subs;
  assert.equal(subs[0], "ombro_lat");
  const priorities = prioritiesFromSubs(subs);
  assert.deepEqual(priorities, ["ombro", "post", "biceps", "triceps"]);
  const a = applyProfilePatch(DEFAULT_PROFILE, { subPriorities: subs });
  assert.equal(a.ok, true);
  if (!a.ok) return;
  assert.deepEqual(a.profile.priorities, priorities);
  const alvo = weeklyTargets(1, a.profile.priorities), base = weeklyTargets(1, []);
  for (const m of ["ombro", "biceps", "triceps"] as const) assert.equal(alvo[m], base[m] + 4, m);
  assert.equal(alvo.peito, base.peito, "o que não é prioridade não ganha");
  // o plano do dia coloca os prioritários na frente
  const plano = planDay({
    targets: alvo, done: {}, freq: {}, priorities: a.profile.priorities, daysLeft: 2, minutes: 60, lastGroup: null, mode: "normal", focus: null,
    equipment: ["halteres", "banco", "polia", "puxador", "barrafixa"], crowded: false, prefs: {}, pinned: {}, avoid: [], pains: [],
  });
  const ms = plano.items.map((i) => i.muscle);
  assert.ok(ms.includes("ombro") && ms.includes("biceps") && ms.includes("triceps"), ms.join());
  const primeiro = Math.min(...(["ombro", "biceps", "triceps"] as const).map((m) => ms.indexOf(m)));
  assert.ok(primeiro <= 1, "um prioritário abre o treino");
});

// ---------- objetivos ----------
const NOVOS = ["shape_v", "perder_barriga", "saude", "retorno"];
test("objetivos: 10, com texto, frase do que muda, preset de prioridades, metas válidas e método completo", () => {
  assert.equal(GOAL_IDS.length, 10);
  for (const n of NOVOS) assert.ok((GOAL_IDS as readonly string[]).includes(n), n);
  for (const id of GOAL_IDS) {
    const i = GOAL_INFO[id];
    assert.ok(i.nm && i.desc && i.statement && i.muda.length > 20, `${id}: texto`);
    assert.ok(i.statement.length <= 140, `${id}: statement cabe no schema`);
    const subs = goalPreset(id);
    assert.ok(validatePriorities(subs).ok, `${id}: preset`);
    assert.ok(METODOS[id], `${id}: método`);
    const d = goalDefaults(id);
    const r = validateProfilePatch({ goal: { id, statement: d.statement, horizonWeeks: d.horizonWeeks, metrics: d.metrics } });
    assert.equal(r.ok, true, `${id}: metas ${JSON.stringify(r.errors)}`);
    assert.equal(applyProfilePatch(DEFAULT_PROFILE, { goal: { id }, subPriorities: subs }).ok, true, id);
  }
  assert.deepEqual(goalPreset("bracos_ombros"), ["ombro_lat", "biceps", "triceps_longa"], "os antigos não mudam");
  assert.deepEqual(groupsOfSubs(goalPreset("shape_v")), ["ombro", "costas"]);
  assert.ok(goalPreset("perder_barriga").length > 0 && !goalPreset("perder_barriga").includes("abdomen"), "barriga não se perde com abdominal");
  assert.equal(new Set(GOAL_IDS.map((g) => GOAL_INFO[g].nm)).size, 10, "nomes diferentes");
});

test("objetivos: metas e volume seguem o método do objetivo (sinal do peso, cintura, volume)", () => {
  assert.ok(goalDefaults("perder_barriga").metrics.cinturaCm < 0 && goalDefaults("perder_barriga").metrics.pesoKg < 0);
  assert.ok(goalDefaults("shape_v").metrics.cinturaCm <= 0 && goalDefaults("shape_v").metrics.bracoCm > 0);
  assert.equal(goalDefaults("saude").metrics.pesoKg, 0);
  for (const id of GOAL_IDS) {
    const m = METODOS[id], d = goalDefaults(id);
    if (m.comida.kcal === "deficit") assert.ok(d.metrics.pesoKg < 0, `${id}: déficit perde peso`);
    if (m.comida.kcal === "superavit") assert.ok(d.metrics.pesoKg > 0, `${id}: superávit ganha peso`);
  }
  const vb = parametrosDoPerfil(perfil("shape_v", { priorities: ["ombro", "costas"] }));
  assert.deepEqual(vb.volume.ombro, METODOS.shape_v.volume.prioridade);
  assert.deepEqual(vb.volume.peito, [METODOS.shape_v.volume.manter, METODOS.shape_v.volume.manter]);
  assert.equal(parametrosDoPerfil(perfil("perder_barriga")).kcal, "deficit");
  assert.ok(parametrosDoPerfil(perfil("saude")).cardioMin[0] >= 150, "saúde: cardio da OMS");
  assert.notEqual(parametrosDoPerfil(perfil("shape_v")).proteinaG, parametrosDoPerfil(perfil("perder_barriga")).proteinaG);
});

test("retorno: volume reduzido nas 2 primeiras semanas e normal depois; os outros objetivos não mudam", () => {
  assert.equal(METODOS.retorno.rampa.semanas, 2);
  assert.ok(METODOS.retorno.rampa.fator < 1 && METODOS.retorno.rampa.fator >= 0.4);
  for (const id of GOAL_IDS) if (id !== "retorno") assert.equal(METODOS[id].rampa.fator, 1, id);
  const p = (since?: string) => perfil("retorno", { goal: { ...DEFAULT_PROFILE.goal, id: "retorno", ...(since ? { since } : {}) } });
  assert.equal(fatorRampa(p("2026-03-02"), "2026-03-02"), METODOS.retorno.rampa.fator, "dia 0");
  assert.equal(fatorRampa(p("2026-03-02"), "2026-03-15"), METODOS.retorno.rampa.fator, "13 dias: ainda na semana 2");
  assert.equal(fatorRampa(p("2026-03-02"), "2026-03-16"), 1, "14 dias: acabou");
  assert.equal(fatorRampa(p(), "2026-03-02"), 1, "sem data de início não reduz");
  assert.equal(fatorRampa(perfil("forca", { goal: { ...DEFAULT_PROFILE.goal, id: "forca", since: "2026-03-02" } }), "2026-03-02"), 1);
  const cheio = weeklyTargets(1, ["ombro"]), leve = weeklyTargets(1, ["ombro"], false, METODOS.retorno.rampa.fator);
  for (const m of Object.keys(MUSCLES) as (keyof typeof MUSCLES)[]) assert.ok(leve[m] <= cheio[m] && leve[m] >= 4, m);
  assert.ok(leve.ombro < cheio.ombro);
  assert.deepEqual(weeklyTargets(1, ["ombro"], false, 1), cheio);
  const vol = parametrosDoPerfil(p("2026-03-02"), "2026-03-02").volume.ombro, vol2 = parametrosDoPerfil(p("2026-03-02"), "2026-03-30").volume.ombro;
  assert.ok(vol[1] < vol2[1], "o resumo do método também reduz");
  const linhas = resumoMetodo(p("2026-03-02"), "2026-03-02");
  assert.ok(linhas.length <= 10 && linhas.every((l) => l.length <= 200));
  assert.ok(linhas.join("\n").match(/2 primeiras semanas/));
  assert.ok(!resumoMetodo(p("2026-03-02"), "2026-04-20").join("\n").match(/2 primeiras semanas/), "depois da rampa a linha some");
});

test("objetivos: goal.since só aceita data", () => {
  assert.equal(validateProfilePatch({ goal: { since: "2026-03-02" } }).ok, true);
  for (const v of ["ontem", "2026-13-40x", 20260302, "2026-3-2"]) assert.equal(validateProfilePatch({ goal: { since: v } }).ok, false, String(v));
});

// ---------- onde treina e mini-assistentes ----------
test("onde treina: academia, casa ou os dois (multi), nada de aparelho no perfil", () => {
  assert.deepEqual(DEFAULT_PROFILE.places, ["academia"]);
  for (const v of [["academia"], ["casa"], ["academia", "casa"]]) assert.equal(validateProfilePatch({ places: v }).ok, true, v.join());
  for (const v of [[], ["hotel"], ["casa", "casa"], ["academia", "casa", "casa"], "casa"]) assert.equal(validateProfilePatch({ places: v }).ok, false, JSON.stringify(v));
});

test("mini-assistente: meta.assistentes guarda 'visto' por tela e mescla com o resto do meta", () => {
  const ok = applyProfilePatch(DEFAULT_PROFILE, { meta: { assistentes: { academias: true } } });
  assert.equal(ok.ok, true);
  if (!ok.ok) return;
  assert.deepEqual(ok.profile.meta.assistentes, { academias: true });
  assert.equal(ok.profile.meta.filledBy, "app", "o resto do meta fica");
  const dois = applyProfilePatch(ok.profile, { meta: { filledBy: "claude", confirmed: false } });
  assert.equal(dois.ok && dois.profile.meta.assistentes?.academias, true, "Claude salvando o perfil não apaga o 'visto'");
  for (const v of [{ "../x": true }, { academias: "sim" }, { academias: false }, [true]]) assert.equal(validateProfilePatch({ meta: { assistentes: v } }).ok, false, JSON.stringify(v));
  assert.equal(validateProfilePatch({ meta: { assistentes: Object.fromEntries(Array.from({ length: 13 }, (_, i) => [`t${i}`, true])) } }).ok, false, "limite de telas");
});

// ---------- perfil antigo ----------
test("perfil antigo: subdivisões antigas, objetivos antigos e sem os campos novos abrem sem erro", () => {
  const velho = { priorities: ["ombro", "biceps", "triceps"], subPriorities: ["ombro_lat", "biceps", "triceps_longa"], goal: { id: "recompor", statement: "x", horizonWeeks: 12, metrics: { bracoCm: 1, cinturaCm: -1, pesoKg: 0, aderenciaPct: 80 } }, meta: { filledBy: "app", confirmed: true } };
  const n = normalizeProfile(velho);
  assert.deepEqual(n.subPriorities, ["ombro_lat", "biceps", "triceps_longa"]);
  assert.equal(n.goal.id, "recompor"); assert.equal(n.places, undefined, "campo novo não é inventado");
  assert.equal(validateProfilePatch(n).ok, true);
  assert.deepEqual(groupsOfSubs(n.subPriorities as SubMuscleId[]), ["ombro", "biceps", "triceps"]);
  const m = applyProfilePatch({ ...DEFAULT_PROFILE, ...n }, { places: ["casa"] });
  assert.equal(m.ok && m.profile.places[0], "casa");
});

test("perfil antigo: excesso de prioridades é cortado em 5 grupos, mantendo a ordem", () => {
  const n = normalizeProfile({ priorities: ["ombro", "biceps", "triceps", "peito", "costas", "quad", "gluteo"] });
  assert.equal(groupsOfSubs(n.subPriorities).length, 5);
  assert.deepEqual(groupsOfSubs(n.subPriorities), ["ombro", "biceps", "triceps", "peito", "costas"]);
  assert.ok(validatePriorities(n.subPriorities).ok);
  assert.ok(validateProfilePatch(n).ok);
});
