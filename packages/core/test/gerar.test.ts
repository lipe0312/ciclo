// #44: gerar outro treino (aparelhos livres, estilo, mais leve, adiantar) e cardio por modalidade (planejado e registrado).
// Dados fictícios. Cada variante de geração e a conta do cardio têm teste.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CARDIO_BY_ID, CARDIO_DOSE, CARDIO_ESPORTES, EQUIPMENT, EXERCISE_BY_ID, INTENSITIES, MODALIDADES, MUSCLES, MUSCLE_IDS,
  applyDayAction, cardioDayKcal, cardioDoseFor, cardioKcalOf, checkCardio, planWeek, regenerarDia, sugerirAdiantar, weekDates, weekView, weeklyTargets,
} from "../src/index.ts";
import type { CardioEntry, DayPlan, MuscleId, WeekInput, WeekProfile } from "../src/index.ts";

const ALL = EQUIPMENT.map((e) => e.id);
const PRIOS: MuscleId[] = ["ombro", "biceps", "triceps"];
const MON = "2026-11-09";
const D = weekDates(MON);
const T = weeklyTargets(1, PRIOS);
const prof = (o: Partial<WeekProfile> = {}): WeekProfile => ({
  daysUsual: ["seg", "ter", "qui", "sex"], daysTarget: 4, minutes: 60, priorities: PRIOS, dayGym: {}, gyms: [{ id: "a1", equipment: ALL }], ...o,
});
const inp = (o: Partial<WeekInput> = {}): WeekInput => ({ weekStart: MON, today: D[0], sets: {}, attendance: {}, profile: prof(), targets: T, ...o });
const eqOf = (p: DayPlan) => new Set(p.items.flatMap((i) => EXERCISE_BY_ID[i.exerciseId].eq));
const sum = (p: DayPlan) => p.items.reduce((s, i) => s + i.sets, 0);
const ok = <T extends object>(r: T | { error: string }): T => { assert.ok(!("error" in r), "error" in r ? r.error : ""); return r as T; };

// ---------- gerar outro treino ----------
test("aparelhos: desmarcar 3 → treino novo sem eles e com o mesmo volume da semana", () => {
  const i = inp(), w = planWeek(i);
  const antes = w.days[0].plan!;
  const ocupados = [...eqOf(antes)].filter((q) => q !== "halteres").slice(0, 3);
  assert.equal(ocupados.length, 3);
  const r = ok(regenerarDia(w, i, D[0], { livres: ALL.filter((q) => !ocupados.includes(q)) }));
  const depois = r.plan.days[0].plan!;
  assert.notDeepEqual(depois.items.map((x) => x.exerciseId), antes.items.map((x) => x.exerciseId), "trocou exercícios");
  for (const q of ocupados) assert.ok(!eqOf(depois).has(q), `usou ${q} ocupado`);
  assert.equal(depois.missing.length, 0, "todo músculo achou opção");
  assert.deepEqual(depois.perMuscle, antes.perMuscle, "mesmas séries por músculo");
  const v0 = weekView(i, w), v1 = weekView({ ...i, overrides: r.overrides }, r.plan);
  assert.deepEqual(v1.projected.done, v0.projected.done, "mesmo volume da semana");
  assert.deepEqual(v1.projected.freq, v0.projected.freq, "2× por músculo preservado");
});

test("aparelhos: a escolha vale só naquele dia (os outros dias continuam com a academia toda)", () => {
  const i = inp(), w = planWeek(i);
  const r = ok(regenerarDia(w, i, D[0], { livres: ALL.filter((q) => q !== "polia") }));
  assert.ok(!eqOf(r.plan.days[0].plan!).has("polia"));
  assert.deepEqual(r.plan.days[3].plan!.items.map((x) => x.exerciseId), w.days[3].plan!.items.map((x) => x.exerciseId));
  assert.deepEqual(r.overrides[D[0]].opts?.ocupados, ["polia"]);
});

test("estilo: mais peso livre e mais máquina mudam a mistura; tanto faz deixa como está", () => {
  const i = inp(), w = planWeek(i);
  const share = (p: DayPlan, k: string) => p.items.filter((x) => x.kind === k).reduce((s, x) => s + x.sets, 0);
  const livre = ok(regenerarDia(w, i, D[0], { estilo: "livre" })).plan.days[0].plan!;
  const maq = ok(regenerarDia(w, i, D[0], { estilo: "maquina" })).plan.days[0].plan!;
  assert.ok(share(livre, "livre") > share(maq, "livre"), "livre tem mais peso livre");
  assert.ok(share(maq, "maquina") >= share(livre, "maquina"), "máquina tem mais máquina");
  assert.deepEqual(livre.perMuscle, w.days[0].plan!.perMuscle, "volume por músculo igual");
  const igual = ok(regenerarDia(w, i, D[0], { estilo: null })).plan.days[0].plan!;
  assert.deepEqual(igual.items.map((x) => x.exerciseId), w.days[0].plan!.items.map((x) => x.exerciseId));
});

test("mais leve: menos séries e RIR maior, nenhum músculo sai (2× da semana intacto) e desfazer volta ao anterior", () => {
  const i = inp(), w = planWeek(i);
  const antes = w.days[0].plan!;
  const r = ok(regenerarDia(w, i, D[0], { leve: true }));
  const depois = r.plan.days[0].plan!;
  assert.ok(sum(depois) < sum(antes), `${sum(depois)} < ${sum(antes)}`);
  assert.ok(depois.items.every((x) => (x.rir ?? 0) >= 3), "RIR 3");
  assert.ok(antes.items.every((x) => x.rir == null), "normal não marca RIR");
  assert.equal(depois.leve, true);
  for (const m of MUSCLE_IDS) assert.equal((depois.perMuscle[m] ?? 0) > 0, (antes.perMuscle[m] ?? 0) > 0, `${m} continua no dia`);
  const v = weekView({ ...i, overrides: r.overrides }, r.plan);
  for (const m of MUSCLE_IDS) assert.ok((v.projected.freq[m] ?? 0) >= 2, `${m} 2×`);
  // o que ficou de fora vai para os outros dias do mesmo grupo (não some do orçamento)
  assert.ok(sum(r.plan.days[3].plan!) >= sum(w.days[3].plan!), "quinta (superior) absorve parte");
  // desfazer = voltar às escolhas anteriores gera a versão anterior, igualzinha
  const volta = planWeek({ ...i, overrides: {}, prev: r.plan });
  assert.deepEqual(volta.days[0].plan, antes);
});

test("adiantar: o músculo mais atrás ganha séries sem passar do que falta na semana", () => {
  const i = inp(), w = planWeek(i), v = weekView(i, w);
  const m = sugerirAdiantar(v, w.days[0].plan!, PRIOS);
  assert.ok(m, "há sugestão");
  assert.ok(w.days[0].plan!.groups.includes(MUSCLES[m!].group), "só músculo do grupo de hoje");
  const r = ok(regenerarDia(w, i, D[0], { adiantar: m }));
  const a = w.days[0].plan!, b = r.plan.days[0].plan!;
  assert.ok((b.perMuscle[m!] ?? 0) > (a.perMuscle[m!] ?? 0), `${m}: ${a.perMuscle[m!]} → ${b.perMuscle[m!]}`);
  const v1 = weekView({ ...i, overrides: r.overrides }, r.plan);
  for (const k of MUSCLE_IDS) assert.ok((v1.projected.done[k] ?? 0) <= Math.max(T[k], v.projected.done[k] ?? 0), `${k} não dobra: ${v1.projected.done[k]} > ${T[k]}`);
  // outro músculo do dia também vale
  const outro = a.groups.length ? MUSCLE_IDS.find((k) => MUSCLES[k].group === a.groups[0] && k !== m && (a.perMuscle[k] ?? 0) > 0)! : m!;
  assert.ok(ok(regenerarDia(w, i, D[0], { adiantar: outro })).plan.days[0].plan);
});

test("adiantar sem nada atrás na semana: sem sugestão", () => {
  const i = inp(), w = planWeek(i), v = weekView(i, w);
  const cheio = { ...v, targets: Object.fromEntries(MUSCLE_IDS.map((m) => [m, 0])) as Record<MuscleId, number> };
  assert.equal(sugerirAdiantar(cheio, w.days[0].plan!, PRIOS), null);
});

test("gerar outro: dia que já passou ou já tem treino registrado não muda", () => {
  const i = inp({ today: D[2] }), w = planWeek(i);
  assert.match((regenerarDia(w, i, D[0], { leve: true }) as { error: string }).error, /passou|registrado/);
  assert.match((regenerarDia(w, i, "2026-12-31", { leve: true }) as { error: string }).error, /fora da semana/);
});

test("gerar outro: aparelho desconhecido é rejeitado; DayAction 'outro' guarda as escolhas e volta a vazio", () => {
  const i = inp(), w = planWeek(i);
  const a = applyDayAction(w, {}, { type: "outro", date: D[0], geracao: { ocupados: ["polia"], estilo: "livre", leve: true, adiantar: "triceps" } }, i);
  assert.deepEqual(ok(a).overrides[D[0]].opts, { ocupados: ["polia"], estilo: "livre", leve: true, adiantar: "triceps" });
  const limpa = applyDayAction(w, ok(a).overrides, { type: "outro", date: D[0], geracao: {} }, i);
  assert.deepEqual(ok(limpa).overrides[D[0]].opts, {});
  assert.match((regenerarDia(w, i, D[0], { livres: ["nao_existe"] }) as { error: string }).error, /livres|aparelho/);
});

// ---------- cardio por modalidade ----------
test("cardio: modalidades do dono existem, com ícone e MET por intensidade (Compendium)", () => {
  const nomes = MODALIDADES.map((m) => m.nm.toLowerCase()).join("|");
  for (const k of ["corrida", "caminhada", "esteira", "bike", "elíptico", "escada", "natação", "esporte", "tiro"]) assert.match(nomes, new RegExp(k), k);
  for (const m of MODALIDADES) {
    assert.ok(m.icon, m.id);
    const c = CARDIO_BY_ID[m.id]; assert.ok(c, `${m.id} no registro`);
    const [a, b, f] = (["zona2", "moderado", "intervalado"] as const).map((k) => c.met[k]);
    assert.ok(a > 0 && a <= b && b <= f, `${m.id} MET crescente`);
  }
  assert.deepEqual(CARDIO_ESPORTES.map((e) => e.id).sort(), ["Basquete", "Beach_Tennis", "Futebol", "Futsal", "Luta", "Outro_Esporte", "Tenis", "Volei"].sort());
  assert.deepEqual(Object.values(INTENSITIES).map((x) => x.nm), ["Leve", "Moderado", "Forte"]);
});

test("cardio: futsal 60 min moderado → kcal por MET (peso 70 kg) e soma no gasto do dia", () => {
  const futsal = cardioKcalOf({ type: "Futsal", minutes: 60, intensity: "moderado" }, 70);
  assert.equal(futsal, Math.round(CARDIO_BY_ID.Futsal.met.moderado * 70));
  assert.ok(futsal >= 400 && futsal <= 800, `faixa plausível: ${futsal}`);
  const rows: CardioEntry[] = [
    { id: "1", date: D[1], type: "Futsal", minutes: 60, intensity: "moderado", distanceKm: null },
    { id: "2", date: D[1], type: "Walking_Treadmill", minutes: 20, intensity: "zona2", distanceKm: null },
    { id: "3", date: D[2], type: "Running_Treadmill", minutes: 30, intensity: "zona2", distanceKm: 4 },
  ];
  assert.equal(cardioDayKcal(rows, D[1], 70), futsal + cardioKcalOf(rows[1], 70));
  assert.equal(cardioDayKcal(rows, D[3], 70), 0);
});

test("cardio: kcal do relógio vale mais que a estimativa por MET", () => {
  assert.equal(cardioKcalOf({ type: "Futsal", minutes: 60, intensity: "moderado", kcal: 512 }, 70), 512);
  assert.equal(cardioDayKcal([{ id: "1", date: D[0], type: "Futsal", minutes: 60, intensity: "moderado", distanceKm: null, kcal: 480 }], D[0], 70), 480);
});

test("cardio: validação de modalidade, kcal e distância opcionais", () => {
  assert.equal(checkCardio({ type: "Futsal", minutes: 60, intensity: "intervalado" }), null);
  assert.equal(checkCardio({ type: "Swimming", minutes: 30, intensity: "zona2", distanceKm: 1.2 }), null);
  assert.match(checkCardio({ type: "Futsal", minutes: 60, intensity: "moderado", distanceKm: 3 })!, /distância/);
  assert.match(checkCardio({ type: "Futsal", minutes: 60, intensity: "moderado", kcal: 5000 })!, /kcal/);
  assert.match(checkCardio({ type: "Futsal", minutes: 60, intensity: "moderado", kcal: 0 })!, /kcal/);
});

// ---------- cardio planejado por objetivo ----------
const cardioDias = (w: ReturnType<typeof planWeek>) => w.days.filter((d) => d.cardio);

test("cardio planejado: sem objetivo conhecido usa o padrão conservador (2× 20–30 min leve), fora do dia de perna", () => {
  const w = planWeek(inp());
  const dose = cardioDoseFor(undefined);
  assert.equal(dose.sessions, 2);
  assert.ok(dose.minutes >= 20 && dose.minutes <= 30);
  assert.equal(dose.intensity, "zona2");
  const dias = cardioDias(w);
  assert.equal(dias.length, 2);
  for (const d of dias) {
    assert.ok(!d.plan || d.kind === "folga" || !d.plan.groups.includes("inf"), `${d.date} é dia de perna`);
    assert.equal(d.cardio!.minutes, dose.minutes);
    assert.equal(d.cardio!.intensity, dose.intensity);
    assert.ok(CARDIO_BY_ID[d.cardio!.type]);
  }
  assert.ok(Math.abs(D.indexOf(dias[0].date) - D.indexOf(dias[1].date)) >= 2, "espaçado");
});

test("cardio planejado: o objetivo do perfil manda; trocar o objetivo muda a dose", () => {
  const a = planWeek(inp({ profile: prof({ goalId: "bracos_ombros" }) }));
  const b = planWeek(inp({ profile: prof({ goalId: "definir" }) }));
  const doseA = cardioDoseFor("bracos_ombros"), doseB = cardioDoseFor("definir");
  assert.notDeepEqual(doseA, doseB);
  assert.equal(cardioDias(a).length, doseA.sessions);
  assert.equal(cardioDias(b).length, doseB.sessions);
  assert.ok(doseB.sessions > doseA.sessions || doseB.minutes > doseA.minutes);
  assert.ok(Object.keys(CARDIO_DOSE).includes("bracos_ombros"));
  // ajuste do próprio perfil vence a tabela
  const c = planWeek(inp({ profile: prof({ goalId: "bracos_ombros", cardio: { sessions: 1, minutes: 20 } }) }));
  assert.equal(cardioDias(c).length, 1);
  assert.equal(cardioDias(c)[0].cardio!.minutes, 20);
  assert.equal(cardioDoseFor("bracos_ombros", { sessions: 0 }).sessions, 0);
  assert.equal(cardioDias(planWeek(inp({ profile: prof({ cardio: { sessions: 0 } }) }))).length, 0);
});

test("cardio planejado: um futsal registrado abate o cardio da semana", () => {
  const futsal: CardioEntry = { id: "f", date: D[0], type: "Futsal", minutes: 60, intensity: "moderado", distanceKm: null };
  const sem = planWeek(inp({ today: D[1] })), com = planWeek(inp({ today: D[1], cardioLog: [futsal] }));
  assert.equal(cardioDias(sem).length, 2);
  assert.equal(cardioDias(com).length, 1, "um de dois já foi cumprido pelo futsal");
  const dois = planWeek(inp({ today: D[1], cardioLog: [futsal, { ...futsal, id: "g", date: D[1] }] }));
  assert.equal(cardioDias(dois).length, 0);
  // cardio leve muito curto não abate
  assert.equal(cardioDias(planWeek(inp({ today: D[1], cardioLog: [{ ...futsal, type: "Walking_Treadmill", minutes: 8, intensity: "zona2" }] }))).length, 2);
});

test("cardio planejado: só em dia que ainda não passou", () => {
  const w = planWeek(inp({ today: D[3] }));
  for (const d of cardioDias(w)) assert.ok(d.date >= D[3], d.date);
});
