// #29 Home de evolução: trend, ritmo das metas, séries semanais, exercícios-chave e "o que falta registrar" (gaps).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GAPS_MAX, aparelhosSemMidia, ctxDoPerfil, gaps, homeSeries, homeVazio, homeView, ritmoAderencia, ritmoMeta, semanasAte, trend,
} from "../src/index.ts";
import type { HomeCtx, HomeRaw, Registros } from "../src/index.ts";

const HOJE = "2026-11-12"; // quinta; semana de 2026-11-09
const add = (iso: string, n: number) => new Date(Date.parse(iso + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);

test("semanasAte: n segundas-feiras terminando na da semana de hoje", () => {
  assert.deepEqual(semanasAte(HOJE, 3), ["2026-10-26", "2026-11-02", "2026-11-09"]);
  assert.equal(semanasAte(HOJE, 12).length, 12);
});

test("trend: unidade por semana pela reta dos mínimos quadrados", () => {
  const t = trend([{ date: "2026-10-01", value: 33 }, { date: "2026-10-15", value: 33.5 }, { date: "2026-10-29", value: 34 }]);
  assert.equal(t.sentido, "sobe"); assert.equal(t.n, 3);
  assert.ok(Math.abs(t.perWeek! - 0.25) < 1e-9);
  assert.equal(trend([{ date: "2026-10-01", value: 80 }, { date: "2026-10-29", value: 79 }]).sentido, "desce");
  assert.equal(trend([{ date: "2026-10-01", value: 79.2 }, { date: "2026-10-15", value: 79.21 }, { date: "2026-10-29", value: 79.2 }]).sentido, "estavel");
});

test("trend: sem dados quando há menos de 2 pontos ou menos de 7 dias entre eles; ignora valores inválidos", () => {
  assert.deepEqual(trend([]), { perWeek: null, sentido: "sem_dados", n: 0 });
  assert.equal(trend([{ date: "2026-10-01", value: 33 }]).sentido, "sem_dados");
  assert.equal(trend([{ date: "2026-10-01", value: 33 }, { date: "2026-10-05", value: 40 }]).sentido, "sem_dados");
  const t = trend([{ date: "2026-10-01", value: NaN }, { date: "2026-10-01", value: 33 }, { date: "2026-10-15", value: 34 }]);
  assert.equal(t.n, 2); // o NaN fica de fora
  assert.equal(t.sentido, "sobe");
});

test("ritmoMeta: braço +1,5 cm em 12 semanas (ganho esperado cresce com as semanas)", () => {
  const base = { inicio: 33, alvo: 1.5, horizonte: 12 };
  // semana 6 de 12: esperado +0,75
  assert.equal(ritmoMeta({ ...base, atual: 33.75, semana: 6 }).ritmo, "no_ritmo");
  assert.equal(ritmoMeta({ ...base, atual: 33.2, semana: 6 }).ritmo, "atras");
  assert.equal(ritmoMeta({ ...base, atual: 34.2, semana: 6 }).ritmo, "a_frente");
  const r = ritmoMeta({ ...base, atual: 33.75, semana: 6 });
  assert.equal(r.feito, 0.75); assert.equal(r.esperado, 0.75); assert.equal(r.pct, 50);
  // passou do horizonte: o esperado trava na meta
  assert.equal(ritmoMeta({ ...base, atual: 34.5, semana: 20 }).esperado, 1.5);
});

test("ritmoMeta: meta de manter (cintura) só fica 'atrás' se crescer mais que a tolerância", () => {
  const base = { inicio: 79, alvo: 0, horizonte: 12, semana: 6, tolerancia: 1 };
  assert.equal(ritmoMeta({ ...base, atual: 79.6 }).ritmo, "no_ritmo");
  assert.equal(ritmoMeta({ ...base, atual: 78.2 }).ritmo, "no_ritmo");
  assert.equal(ritmoMeta({ ...base, atual: 80.5 }).ritmo, "atras");
});

test("ritmoMeta: meta negativa (perder peso) e falta de dados", () => {
  assert.equal(ritmoMeta({ inicio: 80, atual: 78.2, alvo: -2, horizonte: 10, semana: 5 }).ritmo, "a_frente");
  assert.equal(ritmoMeta({ inicio: 80, atual: 80.4, alvo: -2, horizonte: 10, semana: 5 }).ritmo, "atras");
  assert.equal(ritmoMeta({ inicio: null, atual: 33, alvo: 1.5, horizonte: 12, semana: 3 }).ritmo, "sem_dados");
  assert.equal(ritmoMeta({ inicio: 33, atual: null, alvo: 1.5, horizonte: 12, semana: 3 }).ritmo, "sem_dados");
});

test("ritmoAderencia: compara o % com a meta, com 10 pontos de folga", () => {
  assert.equal(ritmoAderencia(92, 80), "a_frente");
  assert.equal(ritmoAderencia(80, 80), "no_ritmo");
  assert.equal(ritmoAderencia(72, 80), "no_ritmo");
  assert.equal(ritmoAderencia(60, 80), "atras");
  assert.equal(ritmoAderencia(null, 80), "sem_dados");
});

// ---------- séries ----------
const raw = (o: Partial<HomeRaw> = {}): HomeRaw => ({
  sets: [], e1rm: [], sessoes: [], presenca: [], cardio: [], pesos: [], medidas: [], comida: [], checkins: [], checkouts: [], ...o,
});

test("homeSeries: volume por semana só dos músculos pedidos e semana vazia = 0", () => {
  const r = raw({ sets: [
    { date: "2026-11-02", muscle: "ombro", n: 6 }, { date: "2026-11-04", muscle: "ombro", n: 4 }, { date: "2026-11-04", muscle: "peito", n: 5 },
    { date: "2026-11-10", muscle: "ombro", n: 3 },
  ] });
  const s = homeSeries(r, { hoje: HOJE, prioridades: ["ombro", "biceps"], diasMeta: 4, semanas: 3 });
  assert.deepEqual(s.semanas, ["2026-10-26", "2026-11-02", "2026-11-09"]);
  assert.deepEqual(s.volume.ombro, [0, 10, 3]);
  assert.deepEqual(s.volume.biceps, [0, 0, 0]);
  assert.equal(s.volume.peito, undefined);
});

test("homeSeries: frequência 2× = % de músculos treinados em ≥ 2 dias distintos na semana", () => {
  const r = raw({ sets: [
    { date: "2026-11-02", muscle: "ombro", n: 3 }, { date: "2026-11-04", muscle: "ombro", n: 3 }, // ombro 2×
    { date: "2026-11-02", muscle: "peito", n: 3 },                                              // peito 1×
  ] });
  const s = homeSeries(r, { hoje: HOJE, prioridades: ["ombro"], diasMeta: 4, semanas: 2 });
  assert.equal(s.freq2.length, 2);
  assert.equal(s.freq2[0], Math.round((1 / 11) * 100)); // 1 de 11 músculos
  assert.equal(s.freq2[1], 0);
});

test("homeSeries: e1RM por semana (máximo), só exercícios com ≥ 2 semanas, prioritários primeiro", () => {
  const r = raw({ e1rm: [
    { date: "2026-10-27", exerciseId: "Cable_Seated_Lateral_Raise", e1rm: 7 }, { date: "2026-11-03", exerciseId: "Cable_Seated_Lateral_Raise", e1rm: 7.5 },
    { date: "2026-11-05", exerciseId: "Cable_Seated_Lateral_Raise", e1rm: 8 },
    { date: "2026-10-27", exerciseId: "Incline_Dumbbell_Press", e1rm: 30 }, { date: "2026-11-10", exerciseId: "Incline_Dumbbell_Press", e1rm: 33 },
    { date: "2026-11-10", exerciseId: "Face_Pull", e1rm: 20 }, // só 1 semana: fica fora
  ] });
  const s = homeSeries(r, { hoje: HOJE, prioridades: ["ombro"], diasMeta: 4, semanas: 3 });
  assert.deepEqual(s.e1rm.map((e) => e.exerciseId), ["Cable_Seated_Lateral_Raise", "Incline_Dumbbell_Press"]);
  assert.deepEqual(s.e1rm[0].serie, [7, 8, null]);
  assert.equal(s.e1rm[0].atual, 8); assert.equal(s.e1rm[0].delta, 1);
  assert.equal(s.e1rm[1].delta, 3);
});

test("homeSeries: presença por semana (sessões ∪ 'fui'), aderência contra a meta de dias e cardio somado", () => {
  const r = raw({
    sessoes: ["2026-11-02", "2026-11-04", "2026-11-10"], presenca: ["2026-11-04", "2026-11-06"],
    cardio: [{ date: "2026-11-03", minutes: 20 }, { date: "2026-11-05", minutes: 25 }, { date: "2026-11-10", minutes: 30 }],
  });
  const s = homeSeries(r, { hoje: HOJE, prioridades: [], diasMeta: 4, semanas: 3 });
  assert.deepEqual(s.presenca.semana, [0, 3, 1]); // 02, 04 (+06 por 'fui') ; 10
  assert.deepEqual(s.presenca.aderencia, [0, 75, 25]);
  assert.equal(s.presenca.meta, 4);
  assert.deepEqual(s.cardio, [0, 45, 30]);
});

test("homeSeries: peso semanal (média) com tendência e braço × cintura em pontos", () => {
  const r = raw({
    pesos: [{ date: "2026-10-27", kg: 72 }, { date: "2026-10-29", kg: 72.2 }, { date: "2026-11-04", kg: 72.6 }, { date: "2026-11-11", kg: 73 }],
    medidas: [{ date: "2026-10-12", braco: 33, cintura: 79 }, { date: "2026-11-09", braco: 33.6, cintura: 79.2 }],
  });
  const s = homeSeries(r, { hoje: HOJE, prioridades: [], diasMeta: 4, semanas: 3 });
  assert.deepEqual(s.peso.serie, [72.1, 72.6, 73]);
  assert.equal(s.peso.trend.sentido, "sobe");
  assert.equal(s.peso.ultimo, 73);
  assert.deepEqual(s.braco.map((p) => p.value), [33, 33.6]);
  assert.deepEqual(s.cintura.map((p) => p.value), [79, 79.2]);
});

test("homeVazio: conta sem nenhum dado de evolução", () => {
  assert.equal(homeVazio(raw()), true);
  assert.equal(homeVazio(raw({ pesos: [{ date: "2026-11-01", kg: 72 }] })), false);
  assert.equal(homeVazio(raw({ sets: [{ date: "2026-11-01", muscle: "ombro", n: 3 }] })), false);
  assert.equal(homeVazio(raw({ comida: [{ date: "2026-11-01", kcal: 2000, prot: 100 }] })), false);
});

// ---------- gaps ----------
const ok: Registros = { ultimaMedida: add(HOJE, -3), ultimoPeso: add(HOJE, -1), diasComida: 7, diasCheckin: 7, diasDevidos: 7, aparelhosSemMidia: 0, cargasPreenchidas: true };

test("gaps: tudo em dia → nenhuma lacuna", () => {
  assert.deepEqual(gaps(ok, HOJE), []);
});

test("gaps: textos e CTAs dos exemplos da issue, cada um leva à tela certa", () => {
  const g = gaps({ ultimaMedida: add(HOJE, -21), ultimoPeso: add(HOJE, -9), diasComida: 2, diasCheckin: 4, diasDevidos: 7, aparelhosSemMidia: 3, cargasPreenchidas: false }, HOJE);
  const por = Object.fromEntries([...g, ...gaps({ ...ok, aparelhosSemMidia: 3, cargasPreenchidas: false }, HOJE)].map((x) => [x.id, x]));
  assert.equal(por.medidas.texto, "medidas há 21 dias");
  assert.equal(por.peso.texto, "peso há 9 dias");
  assert.equal(por.comida.texto, "comida em 2 de 7 dias");
  assert.equal(por.checkin.texto, "check-in em 4 de 7");
  assert.equal(por.midia?.texto, "3 aparelhos sem mídia");
  assert.equal(por.cargas?.texto, "Perfil: cargas lembradas não preenchidas");
  assert.equal(por.medidas.href, "#corpo");
  assert.equal(por.peso.href, "#diario");
  assert.equal(por.comida.href, "#comida");
  assert.equal(por.checkin.href, "#diario");
  assert.equal(por.midia?.href, "#academias");
  assert.equal(por.cargas?.href, "#perfil/experiencia");
  for (const x of Object.values(por)) assert.ok(x.cta.length > 0);
});

test("gaps: no máximo 5, ordenados por impacto (decrescente), medidas atrasadas pesam mais que mídia", () => {
  const g = gaps({ ultimaMedida: add(HOJE, -21), ultimoPeso: add(HOJE, -9), diasComida: 2, diasCheckin: 4, diasDevidos: 7, aparelhosSemMidia: 3, cargasPreenchidas: false }, HOJE);
  assert.equal(GAPS_MAX, 5);
  assert.equal(g.length, 5);
  const imp = g.map((x) => x.impacto);
  assert.deepEqual(imp, [...imp].sort((a, b) => b - a));
  assert.equal(g[0].id, "medidas");
  assert.ok(!g.some((x) => x.id === "midia"), "o de menor impacto fica de fora");
});

test("gaps: o mesmo problema pesa mais quanto mais grave (medidas há 40 dias > há 16 dias)", () => {
  const a = gaps({ ...ok, ultimaMedida: add(HOJE, -16) }, HOJE)[0];
  const b = gaps({ ...ok, ultimaMedida: add(HOJE, -40) }, HOJE)[0];
  assert.ok(b.impacto > a.impacto);
  const c1 = gaps({ ...ok, diasComida: 4 }, HOJE)[0], c2 = gaps({ ...ok, diasComida: 1 }, HOJE)[0];
  assert.ok(c2.impacto > c1.impacto);
});

test("gaps: abaixo do limite não aparece (peso há 3 dias, medidas há 10, comida 5 de 7, check-in 5 de 7)", () => {
  const g = gaps({ ...ok, ultimoPeso: add(HOJE, -3), ultimaMedida: add(HOJE, -10), diasComida: 5, diasCheckin: 5 }, HOJE);
  assert.deepEqual(g, []);
});

test("gaps: nunca registrou medida/peso vira lacuna com texto próprio e impacto máximo da regra", () => {
  const g = gaps({ ...ok, ultimaMedida: null, ultimoPeso: null }, HOJE);
  assert.deepEqual(g.map((x) => x.id), ["medidas", "peso"]);
  assert.equal(g[0].texto, "nenhuma medida ainda");
  assert.equal(g[1].texto, "nenhum peso ainda");
  assert.equal(gaps({ ...ok, ultimaMedida: null }, HOJE)[0].impacto, gaps({ ...ok, ultimaMedida: add(HOJE, -90) }, HOJE)[0].impacto);
});

test("gaps: singular, dias devidos menores que 7 (conta nova no 3º dia) e empate ordenado por id", () => {
  assert.equal(gaps({ ...ok, aparelhosSemMidia: 1 }, HOJE)[0].texto, "1 aparelho sem mídia");
  const g = gaps({ ...ok, diasDevidos: 3, diasCheckin: 0, diasComida: 0 }, HOJE);
  assert.equal(g.find((x) => x.id === "checkin")?.texto, "check-in em 0 de 3");
  assert.equal(g.find((x) => x.id === "comida")?.texto, "comida em 0 de 3 dias");
  assert.equal(gaps({ ...ok, diasDevidos: 1, diasComida: 0 }, HOJE).find((x) => x.id === "comida")?.texto, "comida em 0 de 1 dia");
  const a = gaps({ ...ok, diasDevidos: 0, diasCheckin: 0, diasComida: 0 }, HOJE);
  assert.deepEqual(a, [], "sem dias devidos não há o que cobrar");
});

// ---------- aparelhos sem mídia ----------
test("aparelhosSemMidia: só lugares que não são casa, só aparelhos de exercícios dos músculos prioritários, por lugar", () => {
  const gyms = [{ id: "acad1", kind: "academia", equipment: ["polia", "halteres", "banco", "legpress"] }, { id: "casa", kind: "casa", equipment: ["polia"] }];
  const todos = aparelhosSemMidia(gyms, [], ["ombro"]);
  assert.ok(todos >= 1, "ombro lateral usa polia/halteres");
  assert.equal(aparelhosSemMidia(gyms, [{ gymId: "acad1", equipmentId: "polia" }], ["ombro"]), todos - 1);
  assert.equal(aparelhosSemMidia(gyms, [{ gymId: "casa", equipmentId: "polia" }], ["ombro"]), todos, "mídia de outro lugar não conta");
  assert.equal(aparelhosSemMidia(gyms, [], []), 0, "sem prioridade não há o que cobrar");
  assert.equal(aparelhosSemMidia([{ id: "casa", kind: "casa", equipment: ["polia"] }], [], ["ombro"]), 0);
});

// ---------- homeView ----------
const ctx = (o: Partial<HomeCtx> = {}): HomeCtx => ({
  hoje: HOJE, prioridades: ["ombro", "biceps", "triceps"], diasMeta: 4,
  meta: { horizonWeeks: 12, bracoCm: 1.5, cinturaCm: 0, pesoKg: 1.5, aderenciaPct: 80 },
  dieta: { kcal: 2650, protein: 140 }, diasDevidos: 7, aparelhosSemMidia: 2, cargasPreenchidas: true, ...o,
});

/** 6 semanas fictícias: 4 treinos por semana, medidas a cada 14 dias, peso semanal, comida em parte dos dias. */
function seis(): HomeRaw {
  const sets: HomeRaw["sets"] = [], sessoes: string[] = [], pesos: HomeRaw["pesos"] = [], e1rm: HomeRaw["e1rm"] = [];
  const m0 = "2026-10-05"; // segunda, 5 semanas antes da de hoje
  for (let w = 0; w < 6; w++) for (const d of [0, 1, 3, 4]) {
    const dia = add(m0, w * 7 + d); if (dia > HOJE) continue;
    sessoes.push(dia);
    for (const m of d % 2 ? ["peito", "costas"] : ["ombro", "biceps", "triceps"]) sets.push({ date: dia, muscle: m, n: 3 });
    e1rm.push({ date: dia, exerciseId: "Cable_Seated_Lateral_Raise", e1rm: 7 + w * 0.4 });
  }
  for (let w = 0; w < 6; w++) pesos.push({ date: add(m0, w * 7 + 2), kg: 72 + w * 0.25 });
  return {
    sets, e1rm, sessoes, presenca: [], cardio: [{ date: add(m0, 2), minutes: 30 }], pesos,
    medidas: [{ date: add(m0, -7), braco: 33, cintura: 79 }, { date: add(m0, 7), braco: 33.3, cintura: 79.1 }, { date: add(m0, 21), braco: 33.7, cintura: 79.2 }],
    comida: [{ date: HOJE, kcal: 2400, prot: 130 }, { date: add(HOJE, -1), kcal: 2800, prot: 150 }, { date: add(HOJE, -2), kcal: 2500, prot: 120 }],
    checkins: [HOJE, add(HOJE, -1), add(HOJE, -2), add(HOJE, -3)], checkouts: [],
  };
}

test("homeView: 6 semanas fictícias — painéis, metas com ritmo, comida e lacunas coerentes", () => {
  const v = homeView(seis(), ctx());
  assert.equal(v.vazio, false);
  assert.equal(v.series.semanas.length, 12);
  assert.deepEqual(v.metas.map((m) => m.id), ["braco", "cintura", "peso", "freq"]);
  const braco = v.metas[0];
  assert.equal(braco.inicio, 33); assert.equal(braco.atual, 33.7); assert.equal(braco.ritmo, "no_ritmo"); // +0,7 de +0,88 esperado na semana 7
  assert.equal(v.metas[1].ritmo, "no_ritmo"); // cintura +0,2 (tolerância 1)
  assert.equal(v.metas[2].id, "peso");
  assert.ok(v.metas[3].serie.length === 12);
  assert.equal(v.comida.hoje.kcal, 2400); assert.equal(v.comida.hoje.prot, 130);
  assert.equal(v.comida.daysLogged, 3); assert.equal(v.comida.avgKcal, 2567); assert.equal(v.comida.protPct, Math.round((133 / 140) * 100));
  const ids = v.gaps.map((g) => g.id);
  assert.ok(ids.includes("medidas"), "última medida há 21 dias");
  assert.ok(ids.includes("comida") && ids.includes("midia"));
  assert.ok(v.gaps.length <= 5);
  assert.ok(v.series.e1rm.length >= 1 && v.series.volume.ombro!.some((n) => n > 0));
});

test("homeView: a última medida/peso vêm de 'ultimas' mesmo fora da janela de 12 semanas", () => {
  const raw = { ...seis(), medidas: [], pesos: [], ultimaMedida: add(HOJE, -100), ultimoPeso: add(HOJE, -2) };
  const g = homeView(raw, ctx()).gaps;
  assert.equal(g.find((x) => x.id === "medidas")?.texto, "medidas há 100 dias");
  assert.equal(g.find((x) => x.id === "peso"), undefined);
});

test("homeView: conta vazia → vazio, metas sem dados e lacunas só do que dá para cobrar", () => {
  const v = homeView({ sets: [], e1rm: [], sessoes: [], presenca: [], cardio: [], pesos: [], medidas: [], comida: [], checkins: [], checkouts: [] }, ctx({ diasDevidos: 1 }));
  assert.equal(v.vazio, true);
  assert.ok(v.metas.slice(0, 3).every((m) => m.ritmo === "sem_dados"));
  assert.equal(v.comida.avgKcal, null);
  assert.ok(v.gaps.length <= 5);
});

test("homeView: meta de cintura com crescimento acima da tolerância fica 'atrás'", () => {
  const raw = { ...seis(), medidas: [{ date: "2026-10-01", braco: 33, cintura: 79 }, { date: "2026-11-09", braco: 33.5, cintura: 81 }] };
  assert.equal(homeView(raw, ctx()).metas[1].ritmo, "atras");
});

test("ctxDoPerfil: lê meta, dieta e cargas do perfil; perfil vazio ou torto cai no padrão", () => {
  const c = ctxDoPerfil({ priorities: ["ombro"], daysTarget: 3, goal: { horizonWeeks: 8, metrics: { bracoCm: 2 } }, diet: { kcal: 2500, protein: 150 }, remembered: [{ exerciseId: "x", kg: 1, reps: 1, confidence: "certeza" }] });
  assert.deepEqual(c.prioridades, ["ombro"]); assert.equal(c.diasMeta, 3);
  assert.equal(c.meta.horizonWeeks, 8); assert.equal(c.meta.bracoCm, 2); assert.equal(c.meta.aderenciaPct, 80);
  assert.deepEqual(c.dieta, { kcal: 2500, protein: 150 }); assert.equal(c.cargasPreenchidas, true);
  const v = ctxDoPerfil(null);
  assert.equal(v.cargasPreenchidas, false); assert.equal(v.meta.horizonWeeks, 12); assert.ok(v.prioridades.length > 0);
  assert.equal(ctxDoPerfil({ daysTarget: "x", goal: { horizonWeeks: NaN }, diet: { kcal: null } }).dieta.kcal, 2650);
});
