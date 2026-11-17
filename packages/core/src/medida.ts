// #106 Medida do exercício: repetições (padrão), tempo (isométricos) ou as duas (o app mostra o seletor Tempo | Reps).
// A série por tempo guarda `segundos` (1–3600) e conta como série no volume semanal; não entra no volume kg × reps.
// Lista e referências: docs/09-base-cientifica.md#exercícios-por-tempo.

import { EXERCISE_BY_ID } from "./catalog.ts";
import type { SetLog } from "./loads.ts";

export type Medida = "reps" | "tempo" | "ambos";
export type ModoSerie = "reps" | "tempo";
export const SEGUNDOS_MIN = 1, SEGUNDOS_MAX = 3600;

/** Medida do exercício (fora do catálogo ou sem o campo: reps). */
export function medidaDe(exerciseId: string): Medida {
  const e = Object.prototype.hasOwnProperty.call(EXERCISE_BY_ID, exerciseId) ? EXERCISE_BY_ID[exerciseId] : undefined;
  return e?.medida ?? "reps";
}
/** Como a série começa: tempo nos isométricos, o `medidaPadrao` nos de medida "ambos", reps no resto. */
export function medidaPadraoDe(exerciseId: string): ModoSerie {
  const m = medidaDe(exerciseId);
  if (m === "tempo") return "tempo";
  if (m === "ambos") return EXERCISE_BY_ID[exerciseId].medidaPadrao ?? "reps";
  return "reps";
}
/** Só os exercícios de medida "ambos" mostram o seletor Tempo | Reps. */
export const temSeletorMedida = (exerciseId: string) => medidaDe(exerciseId) === "ambos";
/** Modos aceitos no registro do exercício. */
export const modosAceitos = (exerciseId: string): ModoSerie[] => {
  const m = medidaDe(exerciseId);
  return m === "ambos" ? ["tempo", "reps"] : [m];
};

export const segundosValidos = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= SEGUNDOS_MIN && v <= SEGUNDOS_MAX;

/** "45" (s), "1:30" ou "01:30" (mm:ss) → segundos; fora de 1–3600 ou ilegível: null. */
export function lerSegundos(txt: string | number): number | null {
  const s = String(txt).trim();
  let v: number;
  if (/^\d{1,4}$/.test(s)) v = Number(s);
  else { const m = /^(\d{1,2}):([0-5]\d)$/.exec(s); if (!m) return null; v = Number(m[1]) * 60 + Number(m[2]); }
  return segundosValidos(v) ? v : null;
}
/** 45 → "0:45"; 90 → "1:30"; 3600 → "60:00". */
export const fmtSegundos = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s) % 60).padStart(2, "0")}`;

export interface SerieEntrada { reps?: number | null; segundos?: number | null }
/** Confere a série contra a medida do exercício. null = válida; senão, a mensagem (pt-BR). */
export function erroSerie(exerciseId: string, s: SerieEntrada): string | null {
  const temSeg = s.segundos != null, temReps = s.reps != null;
  if (temSeg && temReps) return "mande reps OU segundos, não os dois";
  if (temSeg) {
    if (!segundosValidos(s.segundos)) return `segundos fora de ${SEGUNDOS_MIN}..${SEGUNDOS_MAX}`;
    return modosAceitos(exerciseId).includes("tempo") ? null : "este exercício é registrado em repetições";
  }
  if (!temReps) return medidaDe(exerciseId) === "tempo" ? "segundos obrigatório (exercício por tempo)" : "reps obrigatório";
  if (typeof s.reps !== "number" || !Number.isInteger(s.reps) || s.reps < 0 || s.reps > 100) return "reps fora de 0..100";
  return modosAceitos(exerciseId).includes("reps") ? null : "este exercício é registrado em tempo (segundos)";
}

export const ehSerieTempo = (s: SetLog) => segundosValidos(s.segundos);
const ehSerieReps = (s: SetLog) => Number.isFinite(s.reps) && s.reps > 0;
/** Séries que contam no volume (por tempo ou por reps); a de 0 reps e sem tempo não conta. */
export const contarSeries = (sets: SetLog[]) => sets.filter((s) => ehSerieTempo(s) || ehSerieReps(s)).length;

export interface RefTempo { ultimo: number; melhor: number; series: number }
/** Progresso por tempo: maior tempo da última sessão com série por tempo, melhor de todas e quantas séries na última. */
export function refsTempo(past: SetLog[][]): RefTempo | null {
  const comTempo = past.map((s) => s.filter(ehSerieTempo)).filter((s) => s.length);
  if (!comTempo.length) return null;
  const max = (a: SetLog[]) => Math.max(...a.map((s) => s.segundos!));
  return { ultimo: max(comTempo[0]), melhor: Math.max(...comTempo.map(max)), series: comTempo[0].length };
}

/** Tempo inicial da série: o maior da última sessão por tempo; sem histórico, o início da faixa (isométrico, `r` em s) ou 30 s. */
export function tempoSugerido(exerciseId: string, past: SetLog[][] = []): number {
  const r = refsTempo(past);
  if (r) return r.ultimo;
  return medidaDe(exerciseId) === "tempo" ? EXERCISE_BY_ID[exerciseId].r[0] : 30;
}

/** Texto da série para histórico e prévia: "0:45" no tempo; "20 kg × 10" ou "12 reps" nas reps. */
export function fmtSerie(s: SetLog): string {
  if (ehSerieTempo(s)) return `${fmtSegundos(s.segundos!)}${s.kg > 0 ? ` · ${s.kg} kg` : ""}`;
  return s.kg > 0 ? `${s.kg} kg × ${s.reps}` : `${s.reps} reps`;
}

/** Valor de recorde em texto (resumo e histórico): tempo em mm:ss, reps em "N reps", carga/e1RM em kg (vírgula decimal). */
export function fmtPrValor(kind: string, v: number): string {
  if (kind === "tempo") return fmtSegundos(v);
  const n = (Math.round(v * 10) / 10).toString().replace(".", ",");
  return kind === "reps" ? `${n} reps` : `${n} kg`;
}
