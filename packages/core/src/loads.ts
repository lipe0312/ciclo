// Cargas: e1RM (Epley), carga inicial a partir das "cargas que você lembra" e dupla progressão.
// Leve de propósito: se não lembrar de nada, a 1ª sessão calibra (RIR 3).

import { EXERCISE_BY_ID } from "./catalog.ts";

export const epley = (kg: number, reps: number) => kg * (1 + reps / 30);
export const fromE1rm = (e1rm: number, reps: number) => e1rm / (1 + reps / 30);
export const roundTo = (kg: number, step: number) => (step > 0 ? Math.round(kg / step) * step : Math.round(kg * 2) / 2);

export interface Remembered { exerciseId: string; kg: number; reps: number; confidence: "certeza" | "aproximado" }
export interface StartLoad { kg: number | null; source: "mesmo_exercicio" | "familia" | "calibrar"; note: string }

/** Carga inicial para `targetReps` com folga (RIR ~2–3). */
export function startLoad(exerciseId: string, remembered: Remembered[], targetReps: number): StartLoad {
  const ex = EXERCISE_BY_ID[exerciseId];
  if (!ex) return { kg: null, source: "calibrar", note: "Exercício fora do catálogo: comece leve e anote." };
  const safety = (c: Remembered) => (c.confidence === "certeza" ? 0.9 : 0.82);
  const same = remembered.find((r) => r.exerciseId === exerciseId);
  if (same) {
    const kg = roundTo(fromE1rm(epley(same.kg, same.reps), targetReps) * safety(same), ex.inc);
    return { kg, source: "mesmo_exercicio", note: `Do que você lembrou (${same.kg} kg × ${same.reps}).` };
  }
  if (ex.fam && ex.ratio) {
    const rel = remembered
      .map((r) => ({ r, e: EXERCISE_BY_ID[r.exerciseId] }))
      .find((x) => x.e?.fam === ex.fam && x.e.ratio);
    if (rel) {
      const anchor = epley(rel.r.kg, rel.r.reps) / (rel.e!.ratio as number);
      const kg = roundTo(fromE1rm(anchor * ex.ratio, targetReps) * safety(rel.r) * 0.95, ex.inc);
      return { kg, source: "familia", note: `Estimado a partir de ${rel.e!.nm}. Ajuste na 1ª série.` };
    }
  }
  return { kg: null, source: "calibrar", note: "1ª vez: escolha uma carga em que sobrariam ~3 reps. O app aprende daqui." };
}

export interface SetLog { kg: number; reps: number; rir?: number }
/** Dupla progressão: todas as séries no topo da faixa → sobe carga e volta ao fundo; senão +1 rep. */
export function nextTarget(last: SetLog[], range: [number, number], inc: number): { kg: number; reps: number; reason: string } | null {
  if (!last.length) return null;
  const kg = Math.max(...last.map((s) => s.kg));
  const top = last.filter((s) => s.kg === kg);
  if (top.every((s) => s.reps >= range[1] && (s.rir ?? 1) <= 2)) {
    return { kg: inc > 0 ? kg + inc : kg, reps: range[0], reason: inc > 0 ? `Bateu ${range[1]} em todas: +${inc} kg.` : "Bateu o topo: tente mais reps ou uma variação mais difícil." };
  }
  const minReps = Math.min(...top.map((s) => s.reps));
  return { kg, reps: Math.min(range[1], minReps + 1), reason: "Mesma carga, +1 rep na série mais fraca." };
}

/** Estagnação: e1RM não melhorou nas últimas `n` sessões. */
export function stalled(bestE1rmPerSession: number[], n = 3): boolean {
  if (bestE1rmPerSession.length < n + 1) return false;
  const before = Math.max(...bestE1rmPerSession.slice(0, -n));
  return bestE1rmPerSession.slice(-n).every((v) => v <= before * 1.005);
}
