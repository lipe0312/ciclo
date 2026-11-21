// #90 Resumo do histórico: uma função pura que o algoritmo e a IA usam igual. Números já calculados (a IA avalia, não
// recalcula): séries efetivas por músculo e subparte contra a meta, frequência, exercícios mais repetidos e os "cansados"
// (anti-repetição), tendência de carga dos focos, preferências, dores e faltas. Janela: gerar a semana → mês + última
// semana; treino avulso → mês + últimos N dias (padrão 7). Teto de tamanho com teste (TETO_HISTORICO).

import { EXERCISE_BY_ID, MUSCLE_IDS, SUB_MUSCLES } from "./catalog.ts";
import type { MuscleId, SubMuscleId } from "./catalog.ts";
import { ALVO_PADRAO } from "./plan-day.ts";
import type { Pain } from "./plan-day.ts";
import { creditoSubpartes } from "./semana-volume.ts";
import { exerciciosCansados } from "./semana-variacao.ts";
import { epley } from "./loads.ts";

/** Teto do resumo em tokens, medido com estimarTokens em teste. Com a fatia de gerar/tempo (≤ 500), fecha nos 1,5k do #45. */
export const TETO_HISTORICO = 1000;
/** Dias do mês e da janela curta padrão. */
export const JANELA_MES = 28, JANELA_DIAS = 7;
/** A subparte alvo de um foco está atrasada abaixo desta fração do volume do músculo no mês. */
export const SUB_META_FRAC = 0.5;
const MAX = { repetidos: 8, cansados: 8, cargas: 6, atrasadas: 6 };

export interface EstadoHistorico {
  hoje: string;
  /** séries das últimas semanas (≥ 28 dias para o mês inteiro) */
  series: readonly { date: string; exerciseId: string; muscle: MuscleId; kg?: number | null; reps?: number | null }[];
  /** alvo semanal por músculo (séries) */
  alvo: Partial<Record<MuscleId, number>>;
  prioridades?: readonly MuscleId[];
  subAlvo?: Partial<Record<MuscleId, SubMuscleId>>;
  /** `sempre` (fixado por músculo) e `nunca` (evitar) */
  sempre?: Partial<Record<MuscleId, string>>;
  nunca?: readonly string[];
  dores?: readonly Pain[];
  /** datas de "não fui" no mês */
  faltas?: readonly string[];
}
export type JanelaHistorico = { tipo: "semana" } | { tipo: "dia"; dias?: number };
export interface ResumoHistorico {
  janela: { tipo: "semana" | "dia"; mes: [string, string]; recente: [string, string] };
  /** por músculo, em uma linha: "feito/meta · sessões× · falta n · mês x/sem" (janela recente; média semanal do mês) */
  musculos: Partial<Record<MuscleId, string>>;
  /** subparte alvo dos focos abaixo da meta no mês (séries efetivas) */
  atrasadas: { parte: SubMuscleId; feito: number; meta: number }[];
  /** exercícios mais repetidos no mês: sessões com ele / sessões do músculo */
  repetidos: { id: string; sessoes: number; de: number }[];
  /** anti-repetição: variar na próxima geração (exceto `sempre`) */
  cansados: string[];
  /** e1RM dos focos: 2 últimas semanas × 2 anteriores (%) */
  cargas: { id: string; pct: number }[];
  sempre: string[]; nunca: string[];
  dores: { regiao: string; intensidade: number }[];
  faltas: number;
}

const addDays = (iso: string, n: number) => new Date(Date.parse(iso + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const r1 = (v: number) => Math.round(v * 10) / 10;
const subDoFoco = (m: MuscleId, sub?: Partial<Record<MuscleId, SubMuscleId>>): SubMuscleId | undefined =>
  sub?.[m] ?? ALVO_PADRAO[m] ?? (Object.keys(SUB_MUSCLES) as SubMuscleId[]).find((s) => SUB_MUSCLES[s].muscle === m);

/** Resumo compacto do histórico para gerar a semana (mês + última semana) ou um treino avulso (mês + N dias). */
export function resumoHistorico(e: EstadoHistorico, j: JanelaHistorico): ResumoHistorico {
  const hoje = e.hoje;
  const n = j.tipo === "dia" ? Math.max(1, Math.min(JANELA_MES, Math.round(j.dias ?? JANELA_DIAS))) : JANELA_DIAS;
  const mes: [string, string] = [addDays(hoje, -(JANELA_MES - 1)), hoje], recente: [string, string] = [addDays(hoje, -(n - 1)), hoje];
  const dentro = (d: string, [a, b]: [string, string]) => d >= a && d <= b;
  const series = e.series.filter((s) => dentro(s.date, mes) && Object.hasOwn(EXERCISE_BY_ID, s.exerciseId) && MUSCLE_IDS.includes(s.muscle));
  const prios = (e.prioridades ?? []).filter((m) => MUSCLE_IDS.includes(m));

  // por músculo: janela recente e média semanal do mês
  const musculos: ResumoHistorico["musculos"] = {};
  for (const m of MUSCLE_IDS) {
    const doM = series.filter((s) => s.muscle === m), rec = doM.filter((s) => dentro(s.date, recente));
    const alvo = e.alvo[m] ?? 0;
    if (!alvo && !doM.length) continue;
    const meta = Math.round((alvo * n) / 7), falta = Math.max(0, meta - rec.length);
    musculos[m] = `${rec.length}/${meta} · ${new Set(rec.map((s) => s.date)).size}×${falta ? ` · falta ${falta}` : ""} · mês ${r1((doM.length * 7) / JANELA_MES)}/sem`;
  }

  // subparte alvo dos focos (séries efetivas pela eficiência) contra a meta do mês
  const credito: Partial<Record<SubMuscleId, number>> = {};
  for (const s of series) for (const [p, v] of Object.entries(creditoSubpartes(s.exerciseId, 1)) as [SubMuscleId, number][]) credito[p] = (credito[p] ?? 0) + v;
  const atrasadas = prios.flatMap((m) => {
    const parte = subDoFoco(m, e.subAlvo);
    if (!parte) return [];
    const meta = Math.round((e.alvo[m] ?? 0) * (JANELA_MES / 7) * SUB_META_FRAC), feito = r1(credito[parte] ?? 0);
    return meta > 0 && feito < meta ? [{ parte, feito, meta }] : [];
  }).slice(0, MAX.atrasadas);

  // sessões (data → exercícios) do mês: repetição e anti-repetição
  const porData = new Map<string, Set<string>>();
  for (const s of series) porData.set(s.date, (porData.get(s.date) ?? new Set()).add(s.exerciseId));
  const sessoes = [...porData].map(([date, ids]) => ({ date, ids: [...ids] }));
  const datasDoMusculo = (m: MuscleId) => new Set(series.filter((s) => s.muscle === m).map((s) => s.date)).size;
  const repetidos = [...new Set(series.map((s) => s.exerciseId))]
    .map((id) => ({ id, sessoes: sessoes.filter((x) => x.ids.includes(id)).length, de: datasDoMusculo(EXERCISE_BY_ID[id].m) }))
    .filter((x) => x.sessoes >= 2).sort((a, b) => b.sessoes - a.sessoes || (a.id < b.id ? -1 : 1)).slice(0, MAX.repetidos);
  const sempre = [...new Set(Object.values(e.sempre ?? {}).filter((x): x is string => typeof x === "string"))].sort();
  const cansados = exerciciosCansados(sessoes, sempre).slice(0, MAX.cansados);

  // tendência de carga dos focos: melhor e1RM das 2 últimas semanas × das 2 anteriores
  const corte = addDays(hoje, -13);
  const best = new Map<string, { m: MuscleId; novo: number; velho: number }>();
  for (const s of series) {
    if (!prios.includes(s.muscle) || !((s.kg ?? 0) > 0) || !((s.reps ?? 0) > 0)) continue;
    const b = best.get(s.exerciseId) ?? { m: s.muscle, novo: 0, velho: 0 };
    const v = epley(s.kg!, s.reps!);
    if (s.date >= corte) b.novo = Math.max(b.novo, v); else b.velho = Math.max(b.velho, v);
    best.set(s.exerciseId, b);
  }
  const cargas = [...best].filter(([, b]) => b.novo > 0 && b.velho > 0)
    .sort(([ia, a], [ib, b]) => prios.indexOf(a.m) - prios.indexOf(b.m) || (ia < ib ? -1 : 1))
    .slice(0, MAX.cargas).map(([id, b]) => ({ id, pct: Math.round((b.novo / b.velho - 1) * 100) }));

  return {
    janela: { tipo: j.tipo, mes, recente }, musculos, atrasadas, repetidos, cansados, cargas,
    sempre, nunca: [...new Set(e.nunca ?? [])].filter((id) => typeof id === "string" && id.length <= 80).slice(0, 20),
    dores: (e.dores ?? []).slice(0, 6).map((d) => ({ regiao: d.region, intensidade: d.intensity })),
    faltas: new Set((e.faltas ?? []).filter((d) => dentro(d, mes))).size,
  };
}
