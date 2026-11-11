// Ponte entre o estado e o core: o que o app pergunta ao core (plano do dia, sugestão de carga) e
// gravações compartilhadas entre telas (perfil, academia, dor, comida).
import { C, S, today } from "./index.ts";
import { SERVER, send } from "../api/index.ts";
import { DOW, dowIdx, uid } from "../util.ts";

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
export function profileChanged() {
  if (S.plan && !(S.session && !S.session.finishedAt)) {
    const act = C.planFreezeAction(S.ui.planFp, S.profile, { frozen: S.ui.locked, frozenByProfile: S.ui.planSource === "perfil" });
    if (act === "freeze") { S.ui.locked = true; S.ui.planSource = "perfil"; }
    else if (act === "unfreeze") { S.ui.locked = false; S.ui.planSource = undefined; }
  }
  clearTimeout(profileTimer); profileTimer = setTimeout(() => send("PUT", "/api/profile", { data: S.profile }), 600);
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

// comida: estimativa rápida offline (porções caseiras, ~TACO). O Claude refina.
const FOOD_TABLE: [RegExp, number, number][] = [
  [/ovo/, 70, 6], [/pão|pao/, 140, 4.5], [/arroz/, 200, 4], [/feij/, 140, 9], [/frango/, 250, 45], [/carne|bife|patinho/, 300, 40], [/whey/, 120, 24],
  [/banana/, 90, 1], [/leite/, 120, 6], [/iogurte/, 100, 8], [/queijo/, 100, 7], [/macarr/, 300, 10], [/batata/, 150, 3], [/aveia/, 110, 4], [/peixe|tilápia|atum/, 180, 30], [/salada|alface|tomate/, 25, 1],
];
export function estimateFood(text: string) {
  let kcal = 0, prot = 0;
  for (const part of String(text).toLowerCase().split(/[,;\n+]| e /)) {
    const row = FOOD_TABLE.find(([re]) => re.test(part)); if (!row) continue;
    const k = Math.min(Number(part.match(/(\d+)/)?.[1] ?? 1), 6);
    kcal += row[1] * k; prot += row[2] * k;
  }
  return { kcal, prot };
}
export const foodTotals = (d: string) => S.food.filter((f) => f.date === d).reduce((a, f) => ({ kcal: a.kcal + f.kcal, prot: a.prot + f.prot }), { kcal: 0, prot: 0 });
export function addFood(text: string) { const e = estimateFood(text); S.food.push({ id: uid(), date: today, text, ...e }); send("POST", "/api/food", { date: today, text }).catch(() => {}); }
