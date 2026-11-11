// Cardio: regras do registro (tipo, minutos, intensidade, distância opcional) e o resumo da semana.
// O app mostra no espaço Treino; o Worker valida com a mesma regra; a tela da Semana/Hoje só chama o resumo.

import { CARDIO_BY_ID, INTENSITIES, cardioKcal } from "./catalog.ts";
import type { Intensity } from "./catalog.ts";

export interface CardioEntry { id: string; date: string; type: string; minutes: number; intensity: Intensity; distanceKm: number | null }
export const CARDIO_MAX_MINUTES = 300;
export const CARDIO_MAX_KM = 200;

/** Regra de domínio (a validação de formato fica no Worker, com http.ts). Devolve a mensagem de erro ou null. */
export function checkCardio(e: { type: string; minutes: number; intensity: Intensity; distanceKm?: number | null }): string | null {
  const c = CARDIO_BY_ID[e.type];
  if (!c) return "tipo de cardio inválido";
  if (!Number.isFinite(e.minutes) || e.minutes < 1 || e.minutes > CARDIO_MAX_MINUTES) return `minutos fora de 1..${CARDIO_MAX_MINUTES}`;
  if (!(e.intensity in INTENSITIES)) return "intensidade inválida";
  if (e.distanceKm != null) {
    if (!c.units.includes("km")) return "distância não vale para este tipo";
    if (!Number.isFinite(e.distanceKm) || e.distanceKm < 0.1 || e.distanceKm > CARDIO_MAX_KM) return `distância inválida (0,1..${CARDIO_MAX_KM} km)`;
  }
  return null;
}

/** kcal estimada de uma sessão (MET × kg × horas); tipo desconhecido = 0. */
export function cardioKcalOf(e: Pick<CardioEntry, "type" | "intensity" | "minutes">, kg: number): number {
  const c = CARDIO_BY_ID[e.type];
  return c ? cardioKcal(c, e.intensity, kg, e.minutes) : 0;
}

export interface CardioWeek { sessions: number; minutes: number; km: number; kcal: number; byType: Record<string, { sessions: number; minutes: number }> }
/** Resumo de um intervalo de datas (inclusive), p.ex. a semana. Datas em YYYY-MM-DD (comparação de texto). */
export function cardioWeekSummary(rows: CardioEntry[], from: string, to: string, kg: number): CardioWeek {
  const out: CardioWeek = { sessions: 0, minutes: 0, km: 0, kcal: 0, byType: {} };
  for (const r of rows) {
    if (r.date < from || r.date > to) continue;
    out.sessions++; out.minutes += r.minutes; out.km += r.distanceKm ?? 0; out.kcal += cardioKcalOf(r, kg);
    const t = (out.byType[r.type] ??= { sessions: 0, minutes: 0 });
    t.sessions++; t.minutes += r.minutes;
  }
  out.km = Math.round(out.km * 10) / 10;
  return out;
}
