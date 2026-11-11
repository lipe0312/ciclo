// Ajuste de volume por feedback e deload (#24, absorve #14 e #15). Roda no começo da semana com os dados da anterior.
// - pump, dor residual e desempenho → ±1–2 séries por músculo (limites 4–20). Só sobe volume se o músculo teve 2×.
// - deload: fim do bloco (4 semanas de carga) ou antes, com ≥ 3 exercícios estagnados ou 2 semanas de prontidão "segurar".
// O motivo vira texto curto para a tela da semana ("+1 série de tríceps: pouca dor, progrediu").

import { MUSCLES, MUSCLE_IDS } from "./catalog.ts";
import type { MuscleId } from "./catalog.ts";
import { readiness } from "./checkin.ts";
import type { Checkin } from "./checkin.ts";
import { stalled } from "./loads.ts";

export const VOLUME_MIN = 4;
export const VOLUME_MAX = 20;
/** Semanas de carga por bloco; a seguinte é deload. */
export const BLOCK_LOAD_WEEKS = 4;
export const DELOAD_FACTOR = 0.6;

export type Perf = "subiu" | "igual" | "caiu";
export interface MuscleSignal { pump?: number | null; soreness?: number | null; perf?: Perf | null; freq?: number }
export interface VolumeChange { muscle: MuscleId; delta: number; reasons: string[]; text: string }

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function changeText(m: MuscleId, delta: number, reasons: string[]): string {
  const k = Math.abs(delta);
  return `${delta > 0 ? "+" : "−"}${k} série${k > 1 ? "s" : ""} de ${MUSCLES[m].nm.toLowerCase()}: ${reasons.join(", ")}`;
}

/** Quanto mexer em um músculo. Dor alta ou queda de desempenho mandam (segurança primeiro). */
export function volumeDelta(s: MuscleSignal): { delta: number; reasons: string[] } {
  const sore = s.soreness ?? 1;
  const down: string[] = [];
  if (sore >= 1.5) down.push("muita dor residual");
  if (s.perf === "caiu") down.push("desempenho caiu");
  if (down.length) return { delta: -Math.min(2, down.length), reasons: down };
  if ((s.freq ?? 0) < 2) return { delta: 0, reasons: [] }; // 2× por músculo antes de bater volume
  const up: string[] = [];
  if (s.perf === "subiu" && sore < 1) up.push("pouca dor", "progrediu");
  if (s.pump != null && s.pump < 0.75 && sore < 1.5) up.push("pump baixo");
  const delta = (up.includes("progrediu") ? 1 : 0) + (up.includes("pump baixo") ? 1 : 0);
  return { delta: Math.min(2, delta), reasons: delta ? up : [] };
}

/** Aplica os sinais sobre o ajuste acumulado (offsets) e devolve os alvos novos e o que mudou. */
export function adjustVolume(base: Record<MuscleId, number>, offsets: Partial<Record<MuscleId, number>>, signals: Partial<Record<MuscleId, MuscleSignal>>) {
  const off: Partial<Record<MuscleId, number>> = {};
  const changes: VolumeChange[] = [];
  const targets = {} as Record<MuscleId, number>;
  for (const m of MUSCLE_IDS) {
    const prev = offsets[m] ?? 0;
    const cur = clamp(base[m] + prev, VOLUME_MIN, VOLUME_MAX);
    const { delta, reasons } = signals[m] ? volumeDelta(signals[m]!) : { delta: 0, reasons: [] };
    const next = clamp(cur + delta, VOLUME_MIN, VOLUME_MAX);
    targets[m] = next;
    off[m] = next - base[m];
    if (next !== cur) changes.push({ muscle: m, delta: next - cur, reasons, text: changeText(m, next - cur, reasons) });
  }
  return { targets, offsets: off, changes };
}

export interface DeloadInput { weeksSinceDeload: number; stalledExercises: number; holdWeeks: number }
export function deloadCheck(d: DeloadInput): { on: boolean; reason: string | null } {
  if (d.weeksSinceDeload >= BLOCK_LOAD_WEEKS) return { on: true, reason: `Fim do bloco: ${BLOCK_LOAD_WEEKS} semanas de carga, esta é de deload.` };
  if (d.weeksSinceDeload >= 2 && d.stalledExercises >= 3) return { on: true, reason: `${d.stalledExercises} exercícios estagnados: semana de deload para recuperar.` };
  if (d.holdWeeks >= 2) return { on: true, reason: `${d.holdWeeks} semanas seguidas com prontidão "segurar": semana de deload.` };
  return { on: false, reason: null };
}
export const deloadTargets = (t: Record<MuscleId, number>) =>
  Object.fromEntries(MUSCLE_IDS.map((m) => [m, Math.max(VOLUME_MIN, Math.round(t[m] * DELOAD_FACTOR))])) as Record<MuscleId, number>;

type Ck = Pick<Checkin, "sleepH" | "energy" | "soreness" | "stress">;
/** Semanas seguidas (da mais recente) em que metade ou mais dos check-ins deram "segurar" (mín. 2 check-ins). */
export function holdWeeks(checkinsByWeek: Ck[][]): number {
  let k = 0;
  for (const w of checkinsByWeek) {
    if (w.length < 2 || w.filter((c) => readiness(c).label === "segurar").length * 2 < w.length) break;
    k++;
  }
  return k;
}

export interface ProgressionInput {
  base: Record<MuscleId, number>;                                          // weeklyTargets do perfil
  prevWeeks: { offsets?: Partial<Record<MuscleId, number>>; deload?: boolean }[]; // semanas anteriores, a mais recente primeiro
  checkinsByWeek: Ck[][];                                                  // [0] = semana passada
  pump: Partial<Record<MuscleId, number[]>>;                               // pump no fim dos treinos da semana passada (0–2)
  freq: Partial<Record<MuscleId, number>>;                                 // estímulos na semana passada
  /** melhor e1RM de cada exercício por sessão, em ordem cronológica; week 0 = semana passada, 1 = retrasada */
  e1rm: { exerciseId: string; muscle: MuscleId; week: number; value: number }[];
}
export interface Progression {
  targets: Record<MuscleId, number>; offsets: Partial<Record<MuscleId, number>>;
  changes: VolumeChange[]; deload: { on: boolean; reason: string | null }; stalled: number;
}

/** Desempenho por músculo: melhor e1RM da semana passada × retrasada, nos exercícios que aparecem nas duas. */
export function perfByMuscle(e1rm: ProgressionInput["e1rm"]): Partial<Record<MuscleId, Perf>> {
  const best = new Map<string, { m: MuscleId; w0: number; w1: number }>();
  for (const r of e1rm) {
    const b = best.get(r.exerciseId) ?? { m: r.muscle, w0: 0, w1: 0 };
    if (r.week === 0) b.w0 = Math.max(b.w0, r.value); else if (r.week === 1) b.w1 = Math.max(b.w1, r.value);
    best.set(r.exerciseId, b);
  }
  const ratios: Partial<Record<MuscleId, number[]>> = {};
  for (const b of best.values()) if (b.w0 > 0 && b.w1 > 0) (ratios[b.m] ??= []).push(b.w0 / b.w1);
  const out: Partial<Record<MuscleId, Perf>> = {};
  for (const m of MUSCLE_IDS) { const r = avg(ratios[m] ?? []); if (r != null) out[m] = r > 1.01 ? "subiu" : r < 0.98 ? "caiu" : "igual"; }
  return out;
}

export function stalledCount(e1rm: ProgressionInput["e1rm"]): number {
  const series = new Map<string, number[]>();
  for (const r of e1rm) (series.get(r.exerciseId) ?? series.set(r.exerciseId, []).get(r.exerciseId)!).push(r.value);
  return [...series.values()].filter((s) => stalled(s, 3)).length;
}

/** Alvos da semana nova: base do perfil + ajuste acumulado + feedback da semana passada; deload quando a regra manda. */
export function weekProgression(p: ProgressionInput): Progression {
  const last = p.prevWeeks[0];
  let weeksSinceDeload = 0;
  for (const w of p.prevWeeks) { if (w.deload) break; weeksSinceDeload++; }
  const stalledN = stalledCount(p.e1rm);
  const deload = deloadCheck({ weeksSinceDeload, stalledExercises: stalledN, holdWeeks: holdWeeks(p.checkinsByWeek) });
  const offsets = last?.offsets ?? {};
  // feedback de semana de deload (ou sem semana anterior) não mexe no volume
  const useSignals = !!last && !last.deload && !deload.on;
  const soreness = avg((p.checkinsByWeek[0] ?? []).map((c) => c.soreness));
  const perf = perfByMuscle(p.e1rm);
  const signals: Partial<Record<MuscleId, MuscleSignal>> = {};
  if (useSignals) for (const m of MUSCLE_IDS) signals[m] = { pump: avg(p.pump[m] ?? []), soreness, perf: perf[m] ?? null, freq: p.freq[m] ?? 0 };
  const adj = adjustVolume(p.base, offsets, signals);
  return { ...adj, targets: deload.on ? deloadTargets(adj.targets) : adj.targets, deload, stalled: stalledN };
}
