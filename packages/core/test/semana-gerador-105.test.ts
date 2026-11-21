// #105 A semana do app sai do gerador determinístico (#65) quando está limpa (nada feito, nada ajustado, sem a divisão da
// pessoa); com treino feito ou escolha do dono, o planWeek reorganiza como antes. Campo de saúde opcional no perfil só gera
// os avisos que encaminham a um profissional. Dados fictícios.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AVISOS_SAUDE, DOWS, EQUIPMENT, MUSCLE_IDS, avisosDaSemana, avisosSaude, diasDoPlano, gerarSemana, mensagemPerfil, planWeek, semanaComGerador,
  validarSemana, validateProfilePatch, weekDates, weeklyTargets,
} from "../src/index.ts";
import type { BaseGerador, MuscleId, TreinoAtual, WeekInput, WeekProfile } from "../src/index.ts";

const ALL = EQUIPMENT.map((e) => e.id);
const PRIOS: MuscleId[] = ["ombro", "biceps", "triceps"];
const MON = "2026-11-09";
const D = weekDates(MON);
const prof = (o: Partial<WeekProfile> = {}): WeekProfile => ({
  daysUsual: ["seg", "ter", "qui", "sex"], daysTarget: 4, minutes: 60, priorities: PRIOS, dayGym: {}, gyms: [{ id: "a1", equipment: ALL }], ...o,
});
const inp = (o: Partial<WeekInput> = {}, p: Partial<WeekProfile> = {}): WeekInput => ({
  weekStart: MON, today: D[0], sets: {}, attendance: {}, targets: weeklyTargets(1, PRIOS), profile: prof(p), ...o,
});
const BASE: BaseGerador = { sexo: "m", nivel: 1 };
const treinos = (r: ReturnType<typeof semanaComGerador>) => r.plan.days.filter((d) => d.kind !== "folga" && d.plan);

test("semana limpa: os dias de treino são os do gerarSemana e a semana passa no validarSemana", () => {
  const i = inp(), r = semanaComGerador(i, BASE);
  assert.equal(r.fonte, "gerador");
  assert.ok(r.perfil);
  const g = gerarSemana(r.perfil);
  assert.deepEqual(treinos(r).map((d) => d.dow), g.dias.map((d) => d.dow));
  for (const d of treinos(r)) assert.deepEqual(d.plan!.items, g.dias.find((x) => x.dow === d.dow)!.itens, d.dow);
  assert.deepEqual(validarSemana({ dias: diasDoPlano(r.plan) }, r.perfil), []);
  // o resumo do dia sai dos itens (séries, minutos, músculos) e o nome descreve o conteúdo
  for (const d of treinos(r)) {
    assert.equal(d.plan!.setsTotal, d.plan!.items.reduce((a, x) => a + x.sets, 0));
    assert.ok(d.plan!.name.length > 0 && d.plan!.why.length > 0);
    assert.deepEqual(d.plan!.prehab, []);
  }
  // folgas e o resto da semana (cardio, academia) continuam do planWeek
  assert.equal(r.plan.days.length, 7);
  assert.equal(r.plan.days.find((d) => d.date === D[2])!.kind, "folga");
});

test("propriedade: perfis variados (dias, minutos, sexo, dores, sem academia, alvos baixos) → 0 semanas inválidas", () => {
  let n = 0, seed = 105;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  for (let k = 0; k < 120; k++) {
    const dias = DOWS.filter(() => rnd() < 0.55);
    if (dias.length < 2) continue;
    const prios = MUSCLE_IDS.filter(() => rnd() < 0.25).slice(0, 3);
    const semAcad = rnd() < 0.2;
    const fator = rnd() < 0.3 ? 0.6 : 1; // deload
    const alvos = Object.fromEntries(MUSCLE_IDS.map((m) => [m, Math.round(weeklyTargets(1, prios)[m] * fator)])) as Record<MuscleId, number>;
    const i = inp({ targets: alvos }, {
      daysUsual: dias, daysTarget: dias.length, minutes: [30, 45, 60, 75, 90][Math.floor(rnd() * 5)], priorities: prios,
      gyms: semAcad ? [] : [{ id: "a1", equipment: ALL }], pains: rnd() < 0.3 ? [{ region: "ombro_d", intensity: 2 }] : [],
    });
    const r = semanaComGerador(i, { sexo: rnd() < 0.5 ? "f" : "m", nivel: (Math.floor(rnd() * 4)) as 0 | 1 | 2 | 3 });
    if (r.fonte !== "gerador") continue;
    n++;
    assert.deepEqual(validarSemana({ dias: diasDoPlano(r.plan) }, r.perfil!), [], `perfil ${k}`);
  }
  assert.ok(n >= 40, `o gerador foi usado em ${n} semanas`);
});

test("alvos da semana (progressão/deload) entram na régua: volume nunca passa do alvo; alvo 0 tira o músculo", () => {
  const alvos = { ...weeklyTargets(1, PRIOS), peito: 0, quad: 3 };
  const r = semanaComGerador(inp({ targets: alvos }), BASE);
  assert.equal(r.fonte, "gerador");
  const vol: Partial<Record<MuscleId, number>> = {};
  for (const d of treinos(r)) for (const it of d.plan!.items) vol[it.muscle] = (vol[it.muscle] ?? 0) + it.sets;
  assert.equal(vol.peito ?? 0, 0, "alvo 0: fora da semana");
  assert.ok((vol.quad ?? 0) <= 3, "quad no máximo 3 séries");
  for (const m of MUSCLE_IDS) assert.ok((vol[m] ?? 0) <= alvos[m], `${m} ≤ alvo`);
  assert.deepEqual(validarSemana({ dias: diasDoPlano(r.plan) }, r.perfil!), []);
});

test("semana ajustada ou já treinada: o planWeek reorganiza como antes (o gerador não passa por cima)", () => {
  const casos: [string, WeekInput][] = [
    ["override", inp({ overrides: { [D[1]]: { kind: "treino", opts: { focus: ["ombro"] } } } })],
    ["salvo", inp({ fixed: { [D[0]]: { plan: planWeek(inp()).days[0].plan!, source: "manual" } } })],
    ["treinou", inp({ today: D[1], sets: { [D[0]]: { ombro: 3 } } })],
    ["dia de treino passou", inp({ today: D[2] })],
  ];
  for (const [nome, i] of casos) {
    const r = semanaComGerador(i, BASE);
    assert.equal(r.fonte, "semana", nome);
    assert.equal(r.perfil, null, nome);
    assert.deepEqual(r.plan, planWeek(i), nome);
  }
});

test("a divisão da pessoa (Meu treino atual seguido) continua mandando: sem gerador", () => {
  const t: TreinoAtual = { divisoes: [
    { nome: "A", grupos: ["peito", "costas", "ombro"], exercicios: [] }, { nome: "B", grupos: ["pernas", "biceps", "triceps"], exercicios: [] },
    { nome: "C", grupos: ["peito", "costas", "ombro"], exercicios: [] }, { nome: "D", grupos: ["pernas", "biceps", "triceps"], exercicios: [] },
  ] };
  const i = inp({}, { treinoAtual: t });
  const r = semanaComGerador(i, BASE);
  assert.equal(r.fonte, "semana");
  assert.deepEqual(r.plan, planWeek(i));
});

test("saúde: gestação, pós-parto e RED-S só geram aviso que encaminha a profissional; sem marcação, nenhum", () => {
  assert.deepEqual([...AVISOS_SAUDE], ["gestacao", "pos_parto", "red_s"]);
  assert.deepEqual(avisosSaude([]), []);
  assert.deepEqual(avisosSaude(undefined), []);
  for (const s of AVISOS_SAUDE) {
    const a = avisosSaude([s]);
    assert.equal(a.length, 1, s);
    assert.match(a[0], /profissional/);
    assert.doesNotMatch(a[0], /diagn[oó]stico:|você tem/i, "nada de diagnóstico");
  }
  assert.equal(avisosSaude(["gestacao", "pos_parto"]).length, 1, "gestação e pós-parto: um aviso só");
  assert.deepEqual(avisosSaude(["xyz", "__proto__"]), [], "valor desconhecido não vira aviso");
  // a semana (que é gravada) nunca leva o aviso de saúde: ele sai na leitura, do perfil atual (desmarcou → some)
  const r = semanaComGerador(inp(), BASE), fb = semanaComGerador(inp({ today: D[2] }), BASE);
  assert.ok(!JSON.stringify(r.plan).includes("profissional de saúde") && !JSON.stringify(fb.plan).includes("profissional de saúde"));
  assert.ok(!("saude" in r.perfil!), "a entrada do gerador não leva a saúde");
  const com = avisosDaSemana(r.plan, ["gestacao"]), sem = avisosDaSemana(r.plan, []);
  assert.ok(com.some((x) => /profissional de saúde/.test(x)));
  assert.ok(!sem.some((x) => /profissional de saúde/.test(x)));
  assert.deepEqual(sem, r.plan.avisos ?? [], "sem marcação, só os avisos do gerador");
  assert.deepEqual(avisosDaSemana({}, ["red_s"]), avisosSaude(["red_s"]), "semana do planWeek (sem avisos) também recebe");
});

test("perfil: campo saude opcional, validado (só os 3 sinais, sem repetir) e com nome humano no erro", () => {
  const ok = validateProfilePatch({ saude: ["gestacao", "red_s"] });
  assert.ok(ok.ok);
  assert.deepEqual(ok.ok && ok.value.saude, ["gestacao", "red_s"]);
  assert.ok(validateProfilePatch({ saude: [] }).ok, "lista vazia = nada marcado");
  for (const ruim of [["xyz"], "gestacao", ["gestacao", "gestacao"], ["gestacao", "pos_parto", "red_s", "red_s"], [1]]) {
    const r = validateProfilePatch({ saude: ruim });
    assert.equal(r.ok, false, JSON.stringify(ruim));
    assert.deepEqual(!r.ok && r.campos, ["saude"]);
  }
  assert.equal(mensagemPerfil(["saude"]), "Não deu para salvar: confira saúde.");
});
