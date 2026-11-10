import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PROFILE, SUB_MUSCLE_IDS, applyProfilePatch, contextSummary, goalPreset, isPlanStale, planFingerprint,
  prioritiesFromSubs, validatePriorities, validateProfilePatch,
} from "../src/index.ts";

// ---- prioridades por subdivisão (mapa de músculos) ----
test("prioridades: no máximo 3 subdivisões, IDs válidos, sem repetir", () => {
  assert.equal(validatePriorities(["ombro_lat", "biceps", "triceps_longa"]).ok, true);
  assert.equal(validatePriorities([]).ok, true);
  const four = validatePriorities(["ombro_lat", "biceps", "triceps_longa", "peito_sup"]);
  assert.equal(four.ok, false); assert.match(four.errors[0], /até 3/);
  const bad = validatePriorities(["ombro_lat", "ombro_inventado"]);
  assert.equal(bad.ok, false); assert.match(bad.errors.join(), /ombro_inventado/);
  assert.equal(validatePriorities(["biceps", "biceps"]).ok, false);
  assert.equal(validatePriorities("biceps").ok, false);
  assert.equal(validatePriorities([{ id: "biceps" }]).ok, false);
});

test("prioridades: o músculo sai da subdivisão, na ordem e sem repetir", () => {
  assert.deepEqual(prioritiesFromSubs(["ombro_lat", "biceps", "triceps_longa"]), ["ombro", "biceps", "triceps"]);
  assert.deepEqual(prioritiesFromSubs(["triceps_longa", "triceps_lateral", "ombro_lat"]), ["triceps", "ombro"]);
  assert.deepEqual(prioritiesFromSubs([]), []);
});

test("objetivo sugere subdivisões válidas (até 3)", () => {
  for (const id of ["bracos_ombros", "massa_geral", "definir", "recompor", "forca", "constancia"]) {
    const subs = goalPreset(id);
    assert.ok(validatePriorities(subs).ok, id);
    assert.ok(subs.every((s) => SUB_MUSCLE_IDS.includes(s)));
  }
  assert.deepEqual(goalPreset("bracos_ombros"), ["ombro_lat", "biceps", "triceps_longa"]);
  assert.deepEqual(goalPreset("nao_existe"), []);
});

// ---- validação do perfil ----
test("perfil: aceita parcial válido e devolve só o que veio", () => {
  const r = validateProfilePatch({ age: 31, weekStart: "qua", daysUsual: ["seg", "qui"], goal: { id: "forca" }, subPriorities: ["ombro_lat"] });
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.value, { age: 31, weekStart: "qua", daysUsual: ["seg", "qui"], goal: { id: "forca" }, subPriorities: ["ombro_lat"] });
});

test("perfil: 'a semana começa em' aceita os 7 dias", () => {
  for (const d of ["seg", "ter", "qua", "qui", "sex", "sab", "dom"]) assert.equal(validateProfilePatch({ weekStart: d }).ok, true, d);
  assert.equal(validateProfilePatch({ weekStart: "segunda" }).ok, false);
});

test("perfil: recusa fora de faixa, tipo errado, campo desconhecido e ID inventado", () => {
  const bad: [Record<string, unknown>, RegExp][] = [
    [{ age: 5 }, /age/], [{ age: "30" }, /age/], [{ heightCm: 400 }, /heightCm/], [{ weightKg: 10 }, /weightKg/],
    [{ level: 4 }, /level/], [{ daysTarget: 0 }, /daysTarget/], [{ minutes: 500 }, /minutes/], [{ sex: "x" }, /sex/],
    [{ priorities: ["ombro", "biceps", "triceps", "peito"] }, /priorities/], [{ priorities: ["inventado"] }, /priorities/],
    [{ subPriorities: ["a", "b", "c", "d"] }, /subPriorities/], [{ avoid: ["Exercicio_Que_Nao_Existe"] }, /avoid/],
    [{ pinned: { ombro: "Exercicio_Que_Nao_Existe" } }, /pinned/], [{ prefs: { ombro: "foguete" } }, /prefs/],
    [{ diet: { mode: "xxx" } }, /diet\.mode/], [{ diet: { kcal: 99999 } }, /diet\.kcal/], [{ goal: { horizonWeeks: 7 } }, /horizonWeeks/],
    [{ remembered: [{ exerciseId: "Barbell_Curl", kg: 20, reps: 10, confidence: "talvez" }] }, /remembered/],
    [{ remembered: new Array(5).fill({ exerciseId: "Barbell_Curl", kg: 20, reps: 10, confidence: "certeza" }) }, /remembered/],
    [{ daysUsual: ["seg", "xyz"] }, /daysUsual/], [{ dayGym: { seg: "../x" } }, /dayGym/], [{ tiers: { Hoje: "gpt" } }, /tiers/],
    [{ foo: 1 }, /foo/], [{ __proto__x: 1 } as Record<string, unknown>, /__proto__x/],
  ];
  for (const [patch, re] of bad) {
    const r = validateProfilePatch(patch);
    assert.equal(r.ok, false, JSON.stringify(patch));
    if (!r.ok) assert.match(r.errors.join(" | "), re, JSON.stringify(patch));
  }
  assert.equal(validateProfilePatch(null).ok, false);
  assert.equal(validateProfilePatch([]).ok, false);
  assert.equal(validateProfilePatch("x").ok, false);
});

test("perfil: não confia em __proto__ / constructor (poluição de protótipo)", () => {
  const evil = JSON.parse('{"prefs":{"__proto__":{"x":"livre"}},"goal":{"__proto__":{"polluted":1}}}');
  const r = validateProfilePatch(evil);
  assert.equal(r.ok, false);
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
});

test("perfil: patch parcial mescla com o que já existe (objetos e mapas) e null apaga a chave do mapa", () => {
  const base = { ...structuredClone(DEFAULT_PROFILE), pinned: { ombro: "Side_Lateral_Raise" }, prefs: { biceps: "cabo" } };
  const r = applyProfilePatch(base, { goal: { horizonWeeks: 8 }, pinned: { ombro: null, biceps: "Barbell_Curl" }, prefs: { triceps: "maquina" }, minutes: 45 });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.profile.goal.horizonWeeks, 8);
  assert.equal(r.profile.goal.id, base.goal.id, "o resto do objetivo fica");
  assert.deepEqual(r.profile.pinned, { biceps: "Barbell_Curl" });
  assert.deepEqual(r.profile.prefs, { biceps: "cabo", triceps: "maquina" });
  assert.equal(r.profile.minutes, 45);
  assert.equal(base.minutes, 60, "não muta a entrada");
});

test("perfil: subdivisões escolhem as prioridades; trocar as prioridades limpa subdivisões de fora", () => {
  const a = applyProfilePatch(DEFAULT_PROFILE, { subPriorities: ["ombro_lat", "peito_sup", "triceps_longa"] });
  assert.equal(a.ok, true);
  if (a.ok) assert.deepEqual(a.profile.priorities, ["ombro", "peito", "triceps"]);
  const b = applyProfilePatch({ ...DEFAULT_PROFILE, subPriorities: ["ombro_lat", "biceps"], priorities: ["ombro", "biceps"] }, { priorities: ["ombro", "costas"] });
  assert.equal(b.ok, true);
  if (b.ok) { assert.deepEqual(b.profile.priorities, ["ombro", "costas"]); assert.deepEqual(b.profile.subPriorities, ["ombro_lat"]); }
  const c = applyProfilePatch(DEFAULT_PROFILE, { priorities: ["ombro"], subPriorities: ["biceps"] });
  assert.equal(c.ok, false, "subdivisão de músculo que não é prioridade");
});

test("perfil: aplicar patch inválido não devolve perfil", () => {
  const r = applyProfilePatch(DEFAULT_PROFILE, { age: 500 });
  assert.equal(r.ok, false);
});

// ---- treino desatualizado ----
test("fingerprint: muda com o que muda o treino, não com o que não muda", () => {
  const base = planFingerprint(DEFAULT_PROFILE);
  assert.equal(planFingerprint(structuredClone(DEFAULT_PROFILE)), base);
  assert.notEqual(planFingerprint({ ...DEFAULT_PROFILE, minutes: 45 }), base);
  assert.notEqual(planFingerprint({ ...DEFAULT_PROFILE, priorities: ["peito"] }), base);
  assert.notEqual(planFingerprint({ ...DEFAULT_PROFILE, avoid: ["Pullups"] }), base);
  assert.notEqual(planFingerprint({ ...DEFAULT_PROFILE, weekStart: "qua" }), base);
  assert.equal(planFingerprint({ ...DEFAULT_PROFILE, tone: "tecnico" }), base, "tom do Claude não muda o treino");
  assert.equal(planFingerprint({ ...DEFAULT_PROFILE, diet: { ...DEFAULT_PROFILE.diet, typical: "ovo" } }), base);
  assert.equal(planFingerprint({ ...DEFAULT_PROFILE, age: 40 }), base);
  // ordem das chaves não importa
  assert.equal(planFingerprint({ ...DEFAULT_PROFILE, prefs: { a: 1, b: 2 } as never }), planFingerprint({ ...DEFAULT_PROFILE, prefs: { b: 2, a: 1 } as never }));
});

test("desatualizado: perfil de hoje difere do perfil de quando o treino foi gerado", () => {
  const then = DEFAULT_PROFILE, now = { ...DEFAULT_PROFILE, minutes: 45 };
  assert.equal(isPlanStale(then, then), false);
  assert.equal(isPlanStale(then, now), true);
  assert.equal(isPlanStale(then, { ...then, tone: "motivador" }), false);
  assert.equal(isPlanStale(null, now), false, "sem base de comparação, não alarma");
});

// ---- resumo de contexto do Claude ----
test("contexto: resumo compacto com objetivo, prioridades, rotina e origem", () => {
  const ctx = contextSummary({ ...DEFAULT_PROFILE, subPriorities: ["ombro_lat", "biceps", "triceps_longa"], meta: { filledBy: "claude", confirmed: false } }, 3);
  assert.equal(ctx.versao, 3);
  assert.deepEqual(ctx.prioridades, ["Ombro lateral", "Bíceps", "Tríceps · cabeça longa"]);
  assert.equal(ctx.preenchidoPor, "claude"); assert.equal(ctx.confirmado, false);
  assert.match(ctx.texto, /Braços e ombros/); assert.match(ctx.texto, /Ombro lateral/); assert.match(ctx.texto, /4 dias/);
  assert.ok(ctx.texto.length < 900, "compacto");
  assert.ok(!/undefined|NaN|\[object/.test(ctx.texto));
});

// ---------- frase do plano, completo/melhorar, CTA ----------
import { isFingerprintStale, planSentence, profileCompleteness } from "../src/index.ts";

test("frase do plano: dias, tempo, foco nas subdivisões e meta", () => {
  const s = planSentence({ ...DEFAULT_PROFILE, daysTarget: 3, minutes: 45, subPriorities: ["ombro_lat", "biceps", "triceps_longa"] });
  assert.match(s, /^3 dias por semana, cerca de 45 min/);
  assert.match(s, /foco em ombro lateral, bíceps e tríceps · cabeça longa/);
  assert.match(s, /Meta: braços e ombros maiores mantendo a cintura\.$/);
  assert.match(planSentence({ ...DEFAULT_PROFILE, subPriorities: [] }), /o corpo todo, sem foco/);
  assert.ok(!/undefined|NaN/.test(planSentence({})));
});

test("completo / dá para melhorar: sem cargas lembradas o CTA é o das cargas", () => {
  const c = profileCompleteness(DEFAULT_PROFILE);
  assert.equal(c.blocks.experiencia, false);
  assert.equal(c.badge, "dá para melhorar");
  const sem = profileCompleteness({ ...DEFAULT_PROFILE, daysUsual: ["seg", "ter", "qui", "sex"] });
  assert.equal(sem.next?.block, "experiencia");
  assert.match(sem.next!.cta, /cargas que você lembra/);
  assert.match(sem.next!.why, /cargas iniciais mais certeiras/);
});

test("completo: tudo respondido não tem próximo passo e vira selo 'completo'", () => {
  const full = {
    ...DEFAULT_PROFILE, remembered: [{ exerciseId: "Barbell_Curl", kg: 20, reps: 10, confidence: "certeza" as const }], prefs: { biceps: "cabo" }, daysUsual: ["seg", "ter", "qui", "sex"],
  };
  const c = profileCompleteness(full);
  assert.equal(c.badge, "completo"); assert.equal(c.next, null); assert.equal(c.done, c.total);
});

test("rotina com menos dias marcados que a meta não é 'completa'", () => {
  const c = profileCompleteness({ ...DEFAULT_PROFILE, daysTarget: 5, daysUsual: ["seg", "qua"] });
  assert.equal(c.blocks.rotina, false); assert.equal(c.next?.block, "rotina");
});

test("impressão guardada: desatualizado só quando o perfil de hoje difere dela", () => {
  const fp = planFingerprint(DEFAULT_PROFILE);
  assert.equal(isFingerprintStale(fp, DEFAULT_PROFILE), false);
  assert.equal(isFingerprintStale(fp, { ...DEFAULT_PROFILE, minutes: 90 }), true);
  assert.equal(isFingerprintStale(null, { ...DEFAULT_PROFILE, minutes: 90 }), false);
});

test("o perfil padrão do app passa na validação do servidor", () => {
  assert.equal(validateProfilePatch(structuredClone(DEFAULT_PROFILE)).ok, true);
});
