// Cardio: regras do registro (modalidade, minutos, intensidade, distância opcional), o gasto estimado (MET) e o cardio
// planejado da semana (#44). O app mostra no espaço Treino; o Worker valida com a mesma regra.

import { CARDIO_BY_ID, INTENSITIES, cardioKcal } from "./catalog.ts";
import type { Intensity } from "./catalog.ts";

/** `kcal` = o que o relógio informou (opcional). Sem ele, a kcal vem da estimativa por MET. */
export interface CardioEntry { id: string; date: string; type: string; minutes: number; intensity: Intensity; distanceKm: number | null; kcal?: number | null }
export const CARDIO_MAX_MINUTES = 300;
export const CARDIO_MAX_KM = 200;
export const CARDIO_MAX_KCAL = 3000;

/** Lista da tela (com ícone): cada item é uma modalidade; `esporte` abre a pergunta "qual?" com CARDIO_ESPORTES. */
export interface Modalidade { id: string; nm: string; icon: string; esporte?: boolean }
export const MODALIDADES: Modalidade[] = [
  { id: "Running_Outdoor", nm: "Corrida", icon: "run" },
  { id: "Walking_Outdoor", nm: "Caminhada", icon: "walk" },
  { id: "Running_Treadmill", nm: "Esteira", icon: "run" },
  { id: "Walking_Treadmill", nm: "Esteira inclinada", icon: "walk" },
  { id: "Bicycling_Stationary", nm: "Bike", icon: "bike" },
  { id: "Elliptical_Trainer", nm: "Elíptico", icon: "ellip" },
  { id: "Stairmaster", nm: "Escada", icon: "stairs" },
  { id: "Swimming", nm: "Natação", icon: "swim" },
  { id: "Sprints", nm: "Tiro / sprints", icon: "bolt" },
  { id: "Outro_Esporte", nm: "Esporte", icon: "ball", esporte: true },
];
/** Esportes ("esporte → qual?"). Futsal e afins entram como cardio forte no planejamento. */
export const CARDIO_ESPORTES: { id: string; nm: string }[] = [
  { id: "Futsal", nm: "Futsal" }, { id: "Futebol", nm: "Futebol" }, { id: "Tenis", nm: "Tênis" }, { id: "Beach_Tennis", nm: "Beach tennis" },
  { id: "Basquete", nm: "Basquete" }, { id: "Volei", nm: "Vôlei" }, { id: "Luta", nm: "Luta" }, { id: "Outro_Esporte", nm: "Outro" },
];
export const isEsporte = (type: string) => CARDIO_BY_ID[type]?.modo === "esporte";

/** Regra de domínio (a validação de formato fica no Worker, com http.ts). Devolve a mensagem de erro ou null. */
export function checkCardio(e: { type: string; minutes: number; intensity: Intensity; distanceKm?: number | null; kcal?: number | null }): string | null {
  const c = CARDIO_BY_ID[e.type];
  if (!c) return "tipo de cardio inválido";
  if (!Number.isFinite(e.minutes) || e.minutes < 1 || e.minutes > CARDIO_MAX_MINUTES) return `minutos fora de 1..${CARDIO_MAX_MINUTES}`;
  if (!(e.intensity in INTENSITIES)) return "intensidade inválida";
  if (e.distanceKm != null) {
    if (!c.units.includes("km")) return "distância não vale para este tipo";
    if (!Number.isFinite(e.distanceKm) || e.distanceKm < 0.1 || e.distanceKm > CARDIO_MAX_KM) return `distância inválida (0,1..${CARDIO_MAX_KM} km)`;
  }
  if (e.kcal != null && (!Number.isFinite(e.kcal) || e.kcal < 1 || e.kcal > CARDIO_MAX_KCAL)) return `kcal fora de 1..${CARDIO_MAX_KCAL}`;
  return null;
}

/** kcal de uma sessão: a do relógio, quando informada; senão MET × kg × horas (tipo desconhecido = 0). */
export function cardioKcalOf(e: Pick<CardioEntry, "type" | "intensity" | "minutes"> & { kcal?: number | null }, kg: number): number {
  if (e.kcal != null && e.kcal > 0) return Math.round(e.kcal);
  const c = CARDIO_BY_ID[e.type];
  return c ? cardioKcal(c, e.intensity, kg, e.minutes) : 0;
}
/** Gasto do cardio de um dia (soma das sessões). Entra no gasto do dia ao lado do que a Comida mostra. */
export function cardioDayKcal(rows: readonly CardioEntry[], date: string, kg: number): number {
  return rows.reduce((s, r) => s + (r.date === date ? cardioKcalOf(r, kg) : 0), 0);
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

// ---------- cardio planejado (#44) ----------
/** Dose semanal de cardio. Os números por objetivo são provisórios até a #45 (método por objetivo); o padrão é conservador. */
export interface CardioDose { sessions: number; minutes: number; intensity: Intensity; type: string }
export const CARDIO_DEFAULT: CardioDose = { sessions: 2, minutes: 25, intensity: "zona2", type: "Walking_Treadmill" };
export const CARDIO_DOSE: Record<string, CardioDose> = {
  bracos_ombros: { ...CARDIO_DEFAULT },                                    // controla a cintura sem tirar recuperação dos prioritários
  massa_geral: { ...CARDIO_DEFAULT, minutes: 20 },
  definir: { sessions: 3, minutes: 30, intensity: "moderado", type: "Walking_Treadmill" },
  recompor: { ...CARDIO_DEFAULT, sessions: 3 },
  forca: { ...CARDIO_DEFAULT, sessions: 1, minutes: 20 },
  constancia: { ...CARDIO_DEFAULT },
};
/** Dose do objetivo do perfil; `ajuste` é o que o dono mudou no Perfil e vence a tabela. Objetivo desconhecido → padrão. */
export function cardioDoseFor(goalId?: string | null, ajuste?: Partial<CardioDose> | null): CardioDose {
  const base = (goalId && CARDIO_DOSE[goalId]) || CARDIO_DEFAULT;
  const a = ajuste ?? {};
  const sessions = Number.isFinite(a.sessions) ? Math.max(0, Math.min(7, Math.round(a.sessions!))) : base.sessions;
  const minutes = Number.isFinite(a.minutes) ? Math.max(10, Math.min(120, Math.round(a.minutes!))) : base.minutes;
  return { sessions, minutes, intensity: a.intensity && a.intensity in INTENSITIES ? a.intensity : base.intensity, type: a.type && CARDIO_BY_ID[a.type] ? a.type : base.type };
}
export interface CardioPlanned { type: string; minutes: number; intensity: Intensity; why: string }

/** Uma sessão cumpre a dose se durou ≥ 15 min (esporte de 15 min+ conta como forte; futsal 60 min abate uma sessão). */
export const CARDIO_MIN_COUNT = 15;
export const cardioCounts = (e: Pick<CardioEntry, "minutes">) => e.minutes >= CARDIO_MIN_COUNT;

/** Escolhe os dias do cardio: só dias abertos e fora do dia de perna; prefere folga, depois dia de superior; espaça as sessões. */
export function placeCardio(cand: { date: string; idx: number; folga: boolean }[], n: number): string[] {
  const left = [...cand], out: { date: string; idx: number }[] = [];
  while (out.length < n && left.length) {
    let best = 0, bs = -Infinity;
    left.forEach((c, i) => {
      const dist = out.length ? Math.min(...out.map((o) => Math.abs(o.idx - c.idx))) : 3;
      const score = Math.min(dist, 3) * 10 + (c.folga ? 3 : 0) - c.idx * 0.01;
      if (score > bs) { bs = score; best = i; }
    });
    out.push(left.splice(best, 1)[0]);
  }
  return out.map((o) => o.date).sort();
}
