// Médias e referências do treino: "última vez", média das últimas 4, melhor marca (e1RM), volume vs média e PRs.
// Tudo puro: o app e o Worker mandam as séries (mais recente primeiro) e recebem números.

import { epley } from "./loads.ts";
import type { SetLog } from "./loads.ts";

/** Sessões consideradas na "média das últimas 4". */
export const AVG_SESSIONS = 4;

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const valid = (s: SetLog) => Number.isFinite(s.reps) && s.reps > 0 && Number.isFinite(s.kg) && s.kg >= 0;
const clean = (sets: SetLog[]) => sets.filter(valid);
export const setsVolume = (sets: SetLog[]) => sum(clean(sets).map((s) => s.kg * s.reps));

export interface SetStats { n: number; avgKg: number; avgReps: number; volume: number; bestE1rm: number }
export function setStats(sets: SetLog[]): SetStats | null {
  const c = clean(sets);
  if (!c.length) return null;
  return { n: c.length, avgKg: sum(c.map((s) => s.kg)) / c.length, avgReps: sum(c.map((s) => s.reps)) / c.length, volume: setsVolume(c), bestE1rm: Math.max(...c.map((s) => epley(s.kg, s.reps))) };
}

export interface BestMark { kg: number; reps: number; e1rm: number }
/** Melhor marca = a série de maior e1RM de todas as sessões (empate: a de maior carga). */
export function bestMark(sessions: SetLog[][]): BestMark | null {
  let best: BestMark | null = null;
  for (const s of sessions.flatMap(clean)) {
    const e = epley(s.kg, s.reps);
    if (!best || e > best.e1rm + 1e-9 || (Math.abs(e - best.e1rm) <= 1e-9 && s.kg > best.kg)) best = { kg: s.kg, reps: s.reps, e1rm: e };
  }
  return best;
}

export interface Avg4 { sessions: number; avgKg: number; avgReps: number; avgVolume: number; /** volume médio por série (kg × reps) */ avgSetVolume: number }
export interface ExerciseRefs { last: SetStats | null; avg4: Avg4 | null; best: BestMark | null }
/** `past` = sessões anteriores do exercício, a mais recente primeiro. Sessões sem série válida são ignoradas. */
export function exerciseRefs(past: SetLog[][]): ExerciseRefs {
  const withSets = past.map(clean).filter((s) => s.length);
  if (!withSets.length) return { last: null, avg4: null, best: null };
  const win = withSets.slice(0, AVG_SESSIONS), all = win.flat();
  return {
    last: setStats(withSets[0]),
    avg4: { sessions: win.length, avgKg: sum(all.map((s) => s.kg)) / all.length, avgReps: sum(all.map((s) => s.reps)) / all.length, avgVolume: sum(win.map(setsVolume)) / win.length, avgSetVolume: sum(all.map((x) => x.kg * x.reps)) / all.length },
    best: bestMark(withSets),
  };
}

export interface VolumeVs { current: number; comparable: number; avg4: number; pct: number | null }
/** Volume da sessão vs a média das últimas 4: compara só os exercícios que já têm histórico e pelo volume por série
 *  (treino pela metade não parece "−60%"; série a mais ou a menos que o habitual também não distorce). */
export function sessionVolumeVsAvg(current: Record<string, SetLog[]>, past: Record<string, SetLog[][]>): VolumeVs {
  let cur = 0, comparable = 0, avg4 = 0;
  for (const [id, sets] of Object.entries(current)) {
    const v = setsVolume(sets);
    cur += v;
    const a = exerciseRefs(past[id] ?? []).avg4;
    if (a) { comparable += v; avg4 += a.avgSetVolume * clean(sets).length; }
  }
  return { current: cur, comparable, avg4, pct: avg4 > 0 ? Math.round((comparable / avg4 - 1) * 100) : null };
}

export type PrKind = "e1rm" | "carga" | "reps";
export interface Pr { kind: PrKind; value: number; prev: number }
/** Recordes da sessão atual contra todas as anteriores. Sem histórico não há recorde (é a 1ª vez). */
export function detectPrs(past: SetLog[][], cur: SetLog[]): Pr[] {
  const p = past.flatMap(clean), c = clean(cur);
  if (!p.length || !c.length) return [];
  const max = (a: number[]) => Math.max(...a);
  const out: Pr[] = [];
  const topKgP = max(p.map((s) => s.kg)), topKgC = max(c.map((s) => s.kg));
  if (topKgP === 0 && topKgC === 0) {
    const r = max(c.map((s) => s.reps)), rp = max(p.map((s) => s.reps));
    if (r > rp) out.push({ kind: "reps", value: r, prev: rp });
    return out;
  }
  const eP = max(p.map((s) => epley(s.kg, s.reps))), eC = max(c.map((s) => epley(s.kg, s.reps)));
  if (eC > eP + 1e-9) out.push({ kind: "e1rm", value: Math.round(eC * 10) / 10, prev: Math.round(eP * 10) / 10 });
  if (topKgC > topKgP) out.push({ kind: "carga", value: topKgC, prev: topKgP });
  return out;
}

export interface ExerciseDelta { exerciseId: string; sets: number; avgKg: number; avgReps: number; lastAvgKg: number | null; lastAvgReps: number | null; deltaKg: number | null; deltaReps: number | null }
export interface SessionSummary { durationMs: number; sets: number; volume: number; vs: VolumeVs; prs: (Pr & { exerciseId: string })[]; perExercise: ExerciseDelta[] }
const r1 = (n: number) => Math.round(n * 10) / 10;
/** Resumo do fim do treino: duração, séries, volume, PRs e médias vs última vez. */
export function sessionSummary(durationMs: number, current: Record<string, SetLog[]>, past: Record<string, SetLog[][]>): SessionSummary {
  const perExercise: ExerciseDelta[] = [], prs: SessionSummary["prs"] = [];
  let sets = 0;
  for (const [id, cur] of Object.entries(current)) {
    const st = setStats(cur);
    if (!st) continue;
    sets += st.n;
    const last = exerciseRefs(past[id] ?? []).last;
    perExercise.push({ exerciseId: id, sets: st.n, avgKg: r1(st.avgKg), avgReps: r1(st.avgReps), lastAvgKg: last ? r1(last.avgKg) : null, lastAvgReps: last ? r1(last.avgReps) : null,
      deltaKg: last ? r1(st.avgKg - last.avgKg) : null, deltaReps: last ? r1(st.avgReps - last.avgReps) : null });
    for (const p of detectPrs(past[id] ?? [], cur)) prs.push({ ...p, exerciseId: id });
  }
  return { durationMs, sets, volume: Math.round(sum(Object.values(current).map(setsVolume))), vs: sessionVolumeVsAvg(current, past), prs, perExercise };
}
