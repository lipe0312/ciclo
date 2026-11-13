// Ponte entre o estado e o core: o que o app pergunta ao core (plano do dia, sugestão de carga) e
// gravações compartilhadas entre telas (perfil, academia, dor, comida).
import { C, S, commit, today } from "./index.ts";
import { SERVER, api, flush, send } from "../api/index.ts";
import { DOW, TZ, addDays, dowIdx, lsGet, lsSet, uid } from "../util.ts";

export const mName = (m: string) => (C.MUSCLES as Record<string, C.Muscle>)[m]?.nm ?? m;
export const EXB = C.EXERCISE_BY_ID;
export const gymById = (id?: string | null) => S.gyms.find((g) => g.id === id) ?? S.gyms[0];
export const defaultGymFor = (iso: string) => S.profile.dayGym?.[DOW[dowIdx(iso)]] ?? S.gyms[0]?.id;

export const FOCUS: [string, string, C.MuscleId[]][] = [["auto", "Automático", []], ["ombro", "Ombros", ["ombro"]], ["bracos", "Braços", ["biceps", "triceps"]], ["peito", "Peito", ["peito"]], ["costas", "Costas", ["costas"]], ["pernas", "Pernas", ["quad", "isquio", "gluteo"]]];

export function lastGroup(): C.Group | "full" | null {
  const past = S.week.sessions.filter((s: any) => s.date < today).slice(-1)[0];
  if (!past) return null;
  const g = past.groups ?? [];
  return g.length === 2 ? "full" : g[0] ?? null;
}
export function dayInput(ui = S.ui, extraPains: any[] = []): C.DayInput {
  const p = S.profile, gym = gymById(ui.gymId);
  return {
    targets: C.weeklyTargets(p.level, p.priorities), done: S.week.done, freq: S.week.freq, priorities: p.priorities,
    daysLeft: ui.daysLeft, minutes: ui.minutes, lastGroup: lastGroup(), mode: ui.mode, focus: ui.focus.length ? ui.focus : null,
    equipment: gym ? gym.equipment : [], crowded: ui.crowded, prefs: p.prefs, pinned: { ...p.pinned, ...ui.swapsToday }, avoid: p.avoid,
    pains: [...S.pains, ...extraPains].map((x) => ({ region: x.region, intensity: x.intensity })),
  };
}
export function computePlan(force = false): C.DayPlan {
  if (S.session && !S.session.finishedAt) return S.session.plan;
  if (S.ui.locked && S.plan && !force) return S.plan;
  S.plan = C.planDay(dayInput()); S.ui.planFp = C.planFingerprint(S.profile);
  return S.plan;
}
export const activePlan = (): C.DayPlan => (S.session && !S.session.finishedAt ? S.session.plan : computePlan());

export function suggestFor(it: C.PlanItem): { kg: number | null; reps: number; note: string } {
  const ex = EXB[it.exerciseId];
  const last = S.history[it.exerciseId];
  if (last?.length && ex) { const t = C.nextTarget(last, it.reps, ex.inc); if (t) return { kg: t.kg, reps: t.reps, note: t.reason }; }
  const sl = C.startLoad(it.exerciseId, S.profile.remembered ?? [], it.reps[1]);
  return { kg: sl.kg, reps: it.reps[0], note: sl.note };
}

let profileTimer: ReturnType<typeof setTimeout> | undefined;
/** Mudou o perfil: o treino já gerado NÃO se refaz sozinho; congela e fica "desatualizado" até o usuário regenerar. */
export function profileChanged(sync = true) {
  if (S.plan && !(S.session && !S.session.finishedAt)) {
    const act = C.planFreezeAction(S.ui.planFp, S.profile, { frozen: S.ui.locked, frozenByProfile: S.ui.planSource === "perfil" });
    if (act === "freeze") { S.ui.locked = true; S.ui.planSource = "perfil"; }
    else if (act === "unfreeze") { S.ui.locked = false; S.ui.planSource = undefined; }
  }
  if (sync) { clearTimeout(profileTimer); profileTimer = setTimeout(() => send("PUT", "/api/profile", { data: S.profile }), 600); }
}
/** Garante a base de comparação ANTES de qualquer mudança no perfil (demo, 1º acesso direto ao Perfil, recarregar). */
export function ensureBaseline() { if (!S.plan || !S.ui.planFp) { if (!(S.session && !S.session.finishedAt)) computePlan(); } }
/** Treino guardado foi gerado com um perfil diferente do de hoje (e não há treino em andamento). */
export const planIsStale = () => !!S.plan && S.ui.locked && !(S.session && !S.session.finishedAt) && C.isFingerprintStale(S.ui.planFp, S.profile);
/** "Regenerar": refaz o treino com o perfil de hoje e (no servidor) troca o treino guardado. */
export function regeneratePlan() {
  S.ui.locked = false; S.ui.planSource = undefined;
  const plan = computePlan(true);
  if (SERVER) send("PUT", `/api/day-plan/${today}`, { plan, gymId: S.ui.gymId, source: "core" }).catch(() => {});
  return plan;
}
let gymTimer: ReturnType<typeof setTimeout> | undefined;
export function gymChanged(g: { id: string; name: string; equipment: string[]; busyHours: string[] }) {
  S.ui.locked = false; clearTimeout(gymTimer);
  gymTimer = setTimeout(() => send("PUT", `/api/gyms/${encodeURIComponent(g.id)}`, { name: g.name, equipment: g.equipment, busyHours: g.busyHours }), 600);
}

export function addPain(p: { region: string; intensity: number; kind?: string; context?: string }) {
  const row = { id: uid(), created_at: Date.now(), ...p };
  S.pains = S.pains.filter((x) => x.region !== p.region).concat(row);
  send<{ id: string }>("POST", "/api/pains", { region: p.region, intensity: p.intensity, kind: p.kind, context: p.context }).then((r) => { if (r?.id) row.id = r.id; }).catch(() => {});
  S.ui.locked = false;
}

// ---------- comida (#28) ----------
// A estimativa local é a do core (a mesma do servidor); o Claude confere com a TACO depois (fonte "claude").
export const estimateFood = C.estimateFood;
export interface FoodRow { id: string; date: string; text: string; kcal: number | null; prot: number | null; meal: C.Meal | null; source: "local" | "claude"; confidence: string | null }
export interface Template { id: string; name: string; meal: C.Meal | null; text: string; kcal: number | null; prot: number | null }
export interface DietHist { date: string; before: number; after: number; adjust: number; tdee: number | null; trendKgWeek: number | null; code: string; reason: string }
/** Estado da tela Comida que não é do perfil: refeições salvas, histórico das metas e pesos (tendência). */
export const DIET = { templates: [] as Template[], history: [] as DietHist[], weights: [] as C.WeightPoint[], loaded: false, /** por que a meta não mudou (sem dados, revisão recente) */ note: "" };

export const foodRows = (): FoodRow[] => S.food as FoodRow[];
export const foodTotals = (d: string) => foodRows().filter((f) => f.date === d).reduce((a, f) => ({ kcal: a.kcal + (f.kcal ?? 0), prot: a.prot + (f.prot ?? 0) }), { kcal: 0, prot: 0 });
const entries = (): C.FoodEntry[] => foodRows().map((f) => ({ id: f.id, date: f.date, meal: f.meal, kcal: f.kcal, prot: f.prot, text: f.text }));

// ---------- base de alimentos pessoal (#43) ----------
export type ItemBase = C.Alimento & { usos: number };
/** A base pessoal (mais usados primeiro). Vence a base comum nos próximos registros. */
export const FOODBASE = { itens: [] as ItemBase[] };
const fromItem = (i: any): ItemBase | null => {
  const b = C.ALIMENTO_BY_KEY[i?.key]; if (!b) return null;
  return { ...b, nome: i.nome, kcal: i.kcal, prot: i.prot, carb: i.carb, gord: i.gord, unidades: i.unidades, fonte: i.fonte, usos: i.usos ?? 0 };
};
const sortBase = () => FOODBASE.itens.sort((a, b) => b.usos - a.usos);
/** Igual ao servidor: cada alimento reconhecido entra (ou soma um uso) na base pessoal. */
function lembrarLocal(partes: C.ParteReconhecida[]) {
  for (const k of new Set(partes.flatMap((p) => (p.key ? [p.key] : [])))) {
    const it = FOODBASE.itens.find((x) => x.key === k);
    if (it) it.usos++; else if (C.ALIMENTO_BY_KEY[k] && FOODBASE.itens.length < C.MAX_ITENS_PESSOAIS) FOODBASE.itens.push({ ...C.ALIMENTO_BY_KEY[k], usos: 1 });
  }
  sortBase();
}
/** Ajuste da pessoa (por 100 g e unidades): vale para os próximos registros, os antigos ficam. */
export function salvarAlimento(key: string, nome: string, m: C.Macros, unidades: C.Unidade[]) {
  const b = C.ALIMENTO_BY_KEY[key]; if (!b) return;
  const cur = FOODBASE.itens.find((x) => x.key === key);
  const it: ItemBase = { ...b, nome: nome || b.nome, kcal: m.kcal, prot: m.prot, carb: m.carb, gord: m.gord, unidades, fonte: "usuario", usos: cur?.usos ?? 0 };
  FOODBASE.itens = [...FOODBASE.itens.filter((x) => x.key !== key), it]; sortBase();
  send("PUT", `/api/food-items/${encodeURIComponent(key)}`, { nome: it.nome, kcal: m.kcal, prot: m.prot, carb: m.carb, gord: m.gord, unidades }).catch(() => {});
}
/** Volta para a base comum (TACO). */
export function voltarAlimento(key: string) {
  FOODBASE.itens = FOODBASE.itens.filter((x) => x.key !== key);
  send("DELETE", `/api/food-items/${encodeURIComponent(key)}`).catch(() => {});
}
export const estimarTexto = (text: string) => C.estimarComBase(text, FOODBASE.itens);
/** "Faltam X g / ~Y kcal" do dia e até 2 sugestões dos alimentos que a pessoa já come. */
export function faltaDoDia(d: string) {
  const t = foodTotals(d), diet = S.profile.diet;
  return C.faltaHoje({ kcal: diet.kcal, protein: diet.protein }, t, FOODBASE.itens);
}
/** Painel: média dos últimos 7 dias contra a meta, e a semana anterior para a tendência. */
export function foodPanel() {
  const d = S.profile.diet, targets = { kcal: d.kcal, protein: d.protein };
  const cur = C.foodAverages(entries(), today, targets), prev = C.foodAverages(entries(), addDays(today, -7), targets);
  const week = foodRows().filter((f) => f.date >= cur.from && f.date <= today);
  return { cur, prev, top: C.topProteinFoods(week as unknown as C.FoodEntry[]), targets, semana: C.semanaComida(entries(), today, targets) };
}
export const hourNow = () => Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }).format(new Date()));

const fromServer = (e: any): FoodRow => ({ id: e.id, date: e.date, text: e.text, kcal: e.kcal, prot: e.prot, meal: e.meal, source: e.source, confidence: e.confidence });
export async function loadFood() {
  if (!SERVER) return seedDemoComida();
  try {
    await flush();
    const [r, b] = await Promise.all([api<{ entries: any[] }>("GET", `/api/food?from=${addDays(today, -13)}&to=${today}`), api<{ itens: any[] }>("GET", "/api/food-items")]);
    S.food = r.entries.map(fromServer); FOODBASE.itens = b.itens.flatMap((i) => { const x = fromItem(i); return x ? [x] : []; }); commit();
  } catch { /* offline: fica o que há */ }
}
let adaptTried = false;
export async function loadDiet() {
  if (!SERVER) return demoDiet();
  try {
    const r = await api<{ templates: any[]; history: DietHist[]; weights: C.WeightPoint[] }>("GET", `/api/diet?date=${today}`);
    DIET.templates = r.templates; DIET.history = r.history; DIET.weights = r.weights; DIET.loaded = true;
    if (!adaptTried) { // o servidor só revisa 1× a cada 7 dias; abrir a tela várias vezes não muda nada
      adaptTried = true;
      const a = await api<{ changed: boolean; kcal: number; code: string; reason: string }>("POST", "/api/diet/adapt", { date: today });
      DIET.note = a.code === "sem_dados" || a.code === "sem_perfil" ? a.reason : "";
      if (a.changed) { S.profile.diet.kcal = a.kcal; const h = await api<{ history: DietHist[] }>("GET", `/api/diet?date=${today}`); DIET.history = h.history; }
    }
  } catch { /* offline */ }
  commit();
}

/** `meal` omitido = pela palavra do texto ou pela hora. Outras telas (caixa do Claude) chamam só com o texto. */
export function addFood(text: string, meal?: C.Meal | null, over?: { kcal: number | null; prot: number | null }, date = today) {
  if (meal === undefined) meal = C.guessMeal(text, hourNow());
  const e = estimarTexto(text), kcal = over ? over.kcal : e.kcal || null, prot = over ? over.prot : e.prot || null;
  lembrarLocal(e.partes);
  const row: FoodRow = { id: uid(), date, text, kcal, prot, meal, source: "local", confidence: null };
  S.food.push(row);
  send<{ id: string }>("POST", "/api/food", { date, text, meal, ...(over ? { kcal: over.kcal, protein: over.prot } : {}) }).then((r) => { if (r?.id) row.id = r.id; commit(); }).catch(() => {});
  return row;
}
export function editFood(id: string, patch: { text?: string; meal?: C.Meal | null; kcal?: number | null; prot?: number | null }) {
  const row = foodRows().find((f) => f.id === id); if (!row) return;
  const body: Record<string, unknown> = {};
  if (patch.text !== undefined && patch.text !== row.text) {
    row.text = patch.text; const e = estimarTexto(patch.text); row.kcal = e.kcal || null; row.prot = e.prot || null; row.source = "local"; row.confidence = null; body.text = patch.text;
  }
  if (patch.meal !== undefined) { row.meal = patch.meal; body.meal = patch.meal; }
  if ((patch.kcal !== undefined && patch.kcal !== row.kcal) || (patch.prot !== undefined && patch.prot !== row.prot)) {
    if (patch.kcal != null) { row.kcal = patch.kcal; body.kcal = patch.kcal; }
    if (patch.prot != null) { row.prot = patch.prot; body.protein = patch.prot; }
    row.source = "local"; row.confidence = null;
  }
  if (Object.keys(body).length) send("PUT", `/api/food/${encodeURIComponent(id)}`, body).catch(() => {});
}
export function deleteFood(id: string) {
  S.food = foodRows().filter((f) => f.id !== id);
  send("DELETE", `/api/food/${encodeURIComponent(id)}`).catch(() => {});
}
export function saveTemplate(name: string, text: string, meal: C.Meal | null) {
  const e = C.estimateFood(text), t: Template = { id: uid(), name, meal, text, kcal: e.kcal || null, prot: e.prot || null };
  DIET.templates.push(t);
  send<{ id: string }>("POST", "/api/meal-templates", { name, text, meal }).then((r) => { if (r?.id) t.id = r.id; commit(); }).catch(() => { DIET.templates = DIET.templates.filter((x) => x !== t); commit(); });
}
export function deleteTemplate(id: string) {
  DIET.templates = DIET.templates.filter((t) => t.id !== id);
  send("DELETE", `/api/meal-templates/${encodeURIComponent(id)}`).catch(() => {});
}

// ---------- demonstração (?demo): 3 semanas fictícias, só no aparelho ----------
const DEMO_HIST = "ciclo:v1:demo:dietHist";
const DEMO_DAYS: [string, number, number][][] = [
  [["café: 3 ovos, 2 pães e 1 whey", 610, 51], ["almoço: arroz, feijão e frango", 590, 58], ["jantar: macarrão e carne", 600, 50]],
  [["café: iogurte, aveia e banana", 300, 14], ["almoço: arroz, feijão e peixe", 520, 43], ["lanche: 2 whey e pão", 440, 52], ["jantar: batata e frango", 400, 48]],
  [["café: 2 ovos e pão", 280, 17], ["almoço: arroz, feijão e carne", 640, 53], ["jantar: arroz e frango", 450, 49]],
];
function seedDemoComida() {
  if (!FOODBASE.itens.length) { // base pessoal fictícia: o que o "dono da demo" mais come
    FOODBASE.itens = ([["ovo", 18], ["pao", 14], ["whey", 12], ["frango", 11], ["arroz", 10], ["feijao", 9], ["carne", 6], ["banana", 4]] as const).map(([k, usos]) => ({ ...C.ALIMENTO_BY_KEY[k], usos }));
  }
  if (S.food.length) return;
  const rows: FoodRow[] = [];
  for (let i = 0; i < 21; i++) {
    const date = addDays(today, -20 + i), skip = i % 9 === 4 && i < 20; // alguns dias sem registro: tudo bem faltar
    if (skip) continue;
    for (const [text, kcal, prot] of DEMO_DAYS[i % 3]) {
      const m = /^(café|almoço|lanche|jantar)/.exec(text)?.[1];
      rows.push({ id: `demo-${i}-${rows.length}`, date, text, kcal: Math.round(kcal * 1.45) + (i % 4) * 25, prot, meal: m === "café" ? "cafe" : m === "almoço" ? "almoco" : m === "lanche" ? "lanche" : m === "jantar" ? "jantar" : null, source: i % 2 ? "claude" : "local", confidence: i % 2 ? "media" : null });
    }
  }
  // bebida do Diário (#42): vira registro "bebida-…" na Comida; o painel mostra à parte
  for (const [i, text, kcal] of [[15, "2 latas de cerveja", 300], [19, "1 taça de vinho", 125]] as const) rows.push({ id: `bebida-demo-${i}`, date: addDays(today, -20 + i), text, kcal, prot: 0, meal: null, source: "local", confidence: null });
  S.food = rows; commit();
}
function demoDiet() {
  DIET.note = "";
  DIET.weights = Array.from({ length: 21 }, (_, i) => ({ date: addDays(today, -20 + i), kg: Math.round((71.8 + i * 0.035 + (i % 3 === 0 ? 0.3 : -0.1)) * 10) / 10 }));
  if (!DIET.templates.length) DIET.templates = [{ id: "t1", name: "Marmita", meal: "almoco", text: "arroz, feijão e frango", kcal: 590, prot: 58 }, { id: "t2", name: "Café padrão", meal: "cafe", text: "3 ovos, 2 pães e 1 whey", kcal: 610, prot: 51 }];
  DIET.history = lsGet<DietHist[]>(DEMO_HIST, []);
  if (!DIET.history.length) {
    const r = C.adaptiveTarget({ weights: DIET.weights, intake: C.foodAverages(entries(), addDays(today, -1), { kcal: 1, protein: 1 }, 21).days.filter((d) => d.logged), currentKcal: S.profile.diet.kcal, pace: S.profile.diet.pace, end: addDays(today, -1) });
    if (r.code !== "sem_dados") {
      DIET.history = [{ date: today, before: S.profile.diet.kcal, after: r.kcal, adjust: r.adjust, tdee: r.tdee, trendKgWeek: r.trendKgWeek, code: r.code, reason: r.reason }];
      S.profile.diet.kcal = r.kcal; lsSet(DEMO_HIST, DIET.history);
    }
  }
  DIET.loaded = true; commit();
}
