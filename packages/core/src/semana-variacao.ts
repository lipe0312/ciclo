// #90 Semana de verdade: tipo de cada dia (divisão pelo nº de dias e pela frequência do método), a ênfase de cada
// variação (A/B/C), o rótulo que descreve o dia pelos músculos de maior volume, a variação de exercício pelo banco de
// alternativas (#125) e a anti-repetição pelo histórico. TS puro e determinístico; o planDay e o planWeek só chamam.

import { EXERCISE_BY_ID, MUSCLES, MUSCLE_IDS } from "./catalog.ts";
import type { Group, MuscleId } from "./catalog.ts";

/** Tipo do dia. Empurrar/puxar/pernas = superior/inferior com só uma parte dos músculos. */
export type TipoDia = "sup" | "inf" | "full" | "push" | "pull" | "legs";
export const TIPO_NM: Record<TipoDia, string> = { sup: "Superior", inf: "Inferior", full: "Corpo inteiro", push: "Empurrar", pull: "Puxar", legs: "Pernas" };
export const TIPO_GRUPOS: Record<TipoDia, Group[]> = { sup: ["sup"], inf: ["inf"], full: ["sup", "inf"], push: ["sup"], pull: ["sup"], legs: ["inf"] };
/** Blocos de ênfase: Superior A = empurrar (ombro lateral + tríceps + peito), B = puxar (bíceps + costas + ombro posterior);
 *  Inferior A = joelho (quadríceps + panturrilha), B = quadril (posterior + glúteo + abdômen). */
export const EMPURRAR: readonly MuscleId[] = ["peito", "ombro", "triceps"];
export const PUXAR: readonly MuscleId[] = ["costas", "post", "biceps"];
export const JOELHO: readonly MuscleId[] = ["quad", "pant"];
export const QUADRIL: readonly MuscleId[] = ["isquio", "gluteo", "core"];

/** Estímulos por músculo na semana quando o método não diz outra coisa (regra 4: 2× antes de bater volume). */
export const FREQ_PADRAO = 2;
/** Máximo de exercícios em comum entre dois dias do mesmo tipo (fração da lista maior). */
export const SOBREPOSICAO_MAX = 0.34;
/** Parte do volume semanal que vai para o dia de ênfase do músculo (× a divisão igual) e para o outro dia. */
export const ENFASE_MAIS = 1.25;
export const ENFASE_MENOS = 0.75;
/** Penalidade (pontos do ranqueamento) para repetir o exercício do outro dia do mesmo tipo: maior que o "já faz" (+4). */
export const VARIAR = 6;
/** Bônus para a alternativa do banco (#125) do exercício do outro dia; cai com a posição na lista. */
export const BANCO_PESO = 2;
/** Anti-repetição: no máximo X sessões seguidas do músculo com o mesmo exercício… */
export const REPETE_SEGUIDAS_MAX = 4;
/** …nem em mais de Y das últimas 4 semanas. */
export const REPETE_PCT_MAX = 0.75;
export const REPETE_SEMANAS = 4;
/** Penalidade do exercício "cansado" (repetido demais): maior que o "já faz" (+4); `sempre` (fixado) não sofre. */
export const CANSADO = 6;

const rank = (m: MuscleId, prios: readonly MuscleId[]) => (prios.includes(m) ? prios.indexOf(m) : 50 - MUSCLES[m].base / 100);
const ordenar = (ms: readonly MuscleId[], prios: readonly MuscleId[]) => [...ms].sort((a, b) => rank(a, prios) - rank(b, prios) || MUSCLE_IDS.indexOf(a) - MUSCLE_IDS.indexOf(b));

/** Músculos que o tipo treina. */
export function musculosDoTipo(t: TipoDia): MuscleId[] {
  if (t === "push") return [...EMPURRAR];
  if (t === "pull") return [...PUXAR];
  const g = TIPO_GRUPOS[t];
  return MUSCLE_IDS.filter((m) => g.includes(MUSCLES[m].group));
}

/** Tipos fixos da semana curta (nº de dias de treino, frequência do método); null = escolha dia a dia (4+ dias). */
export function tiposCurtos(n: number, freq: number): TipoDia[] | null {
  if (n <= 2) return freq <= 1 ? ["sup", "inf"] : ["full", "full"];
  if (n === 3) return freq <= 1 ? ["push", "pull", "legs"] : ["full", "full", "full"];
  return null;
}
/** Tipos entre os quais a semana de 4+ dias escolhe: superior/inferior (5 e 7 dias: híbrido, os focos à frente);
 *  com 6 dias ou método 1×, empurrar/puxar/pernas. */
export const tiposLongos = (n: number, freq: number): TipoDia[] => (n === 6 || freq <= 1 ? ["push", "pull", "legs"] : ["sup", "inf"]);

/** Os dois blocos de um grupo, o que tem a prioridade mais alta primeiro. */
function blocos(a: readonly MuscleId[], b: readonly MuscleId[], prios: readonly MuscleId[]): [readonly MuscleId[], readonly MuscleId[]] {
  const best = (ms: readonly MuscleId[]) => Math.min(...ms.map((m) => rank(m, prios)));
  return best(b) < best(a) ? [b, a] : [a, b];
}
/** Ênfase da variação `k` (0 = A, 1 = B, 2 = C) do tipo: o que vem primeiro no dia e ganha a maior parte do volume.
 *  A variação C é dos focos (as prioridades do grupo). */
export function enfaseDoDia(t: TipoDia, k: number, prios: readonly MuscleId[]): MuscleId[] {
  const parte = (a: readonly MuscleId[], b: readonly MuscleId[], g: Group) => {
    const [x, y] = blocos(a, b, prios);
    const focos = prios.filter((m) => MUSCLES[m].group === g);
    return ordenar(k === 0 ? x : k === 1 ? y : focos.length ? focos : x, prios);
  };
  const sup = parte(EMPURRAR, PUXAR, "sup"), inf = parte(JOELHO, QUADRIL, "inf");
  if (t === "sup") return sup;
  if (t === "inf" || t === "legs") return inf;
  if (t === "full") return [...sup, ...inf];
  const bloco = ordenar(t === "push" ? EMPURRAR : PUXAR, prios);
  return k % 2 ? [...bloco.slice(1), bloco[0]] : bloco; // empurrar B começa por outro músculo
}
export const letraDe = (k: number) => "ABCDEFG"[Math.min(6, Math.max(0, k))];

// ---------- rótulo ----------
export const NOME_ROTULO: Record<MuscleId, string> = {
  peito: "peito", costas: "costas", ombro: "ombros", post: "ombro posterior", biceps: "bíceps", triceps: "tríceps",
  quad: "quadríceps", isquio: "posterior de coxa", gluteo: "glúteos", pant: "panturrilha", core: "abdômen",
};
/** Os (até 2) músculos de maior volume do dia; empate → a ênfase do dia, depois a ordem do catálogo. */
export function musculosDoRotulo(perMuscle: Partial<Record<MuscleId, number>>, enfase: readonly MuscleId[] = []): MuscleId[] {
  const r = (m: MuscleId) => (enfase.includes(m) ? enfase.indexOf(m) : 50 + MUSCLE_IDS.indexOf(m));
  return MUSCLE_IDS.filter((m) => (perMuscle[m] ?? 0) > 0).sort((a, b) => (perMuscle[b] ?? 0) - (perMuscle[a] ?? 0) || r(a) - r(b)).slice(0, 2);
}
/** "Superior A · ombros e tríceps": o tipo, a letra e os músculos de maior volume (o nome descreve o conteúdo). */
export function rotuloDia(base: string, perMuscle: Partial<Record<MuscleId, number>>, enfase: readonly MuscleId[] = [], letra?: string | null): string {
  const ms = musculosDoRotulo(perMuscle, enfase);
  const cab = letra ? `${base} ${letra}` : base;
  return ms.length ? `${cab} · ${ms.map((m) => NOME_ROTULO[m]).join(" e ")}` : cab;
}

// ---------- lista e cabeçalho do dia ----------
type ComListas<T> = { prehab: readonly T[]; items: readonly T[] };
/** A lista que a tela mostra: fortalecimento primeiro, depois os exercícios. */
export const exerciciosDoDia = <T>(p: ComListas<T>): T[] => [...(p.prehab ?? []), ...p.items];
/** Cabeçalho do dia: a contagem é sempre a da lista mostrada. */
export function cabecalhoDia(p: ComListas<unknown> & { setsTotal: number; estMinutes: number }): string {
  const n = exerciciosDoDia(p).length;
  return `${n} ${n === 1 ? "exercício" : "exercícios"} · ${p.setsTotal} séries · ~${p.estMinutes} min`;
}

// ---------- variação e anti-repetição ----------
/** Fração de exercícios em comum (sobre a lista maior). */
export function sobreposicao(a: readonly string[], b: readonly string[]): number {
  const n = Math.max(a.length, b.length);
  if (!n) return 0;
  const sb = new Set(b);
  return [...new Set(a)].filter((x) => sb.has(x)).length / n;
}
/** Alternativas ordenadas de um exercício (o banco da #125: `altsDoBanco`). Injetado por quem gera a semana (Worker), para o
 *  banco (~6 KB) não entrar no JS inicial do app; sem ele, vale a mesma subparte principal do catálogo. */
export type AlternativasDe = (id: string) => readonly string[];
/** Ajuste do ranqueamento para variar do outro dia do mesmo tipo: o usado perde VARIAR; a alternativa do banco ganha. */
export function ajusteVariacao(id: string, usados: readonly string[], altsDe?: AlternativasDe | null): number {
  if (!usados.length) return 0;
  if (usados.includes(id)) return -VARIAR;
  let best = 0;
  for (const u of usados) {
    if (altsDe) { const k = altsDe(u).indexOf(id); if (k >= 0) best = Math.max(best, BANCO_PESO * (1 - k / 6)); }
    else if (EXERCISE_BY_ID[u]?.subMuscles?.[0] && EXERCISE_BY_ID[u].subMuscles![0] === EXERCISE_BY_ID[id]?.subMuscles?.[0]) best = Math.max(best, BANCO_PESO / 2);
  }
  return best;
}

export interface SessaoExercicios { date: string; ids: readonly string[] }
const semanaIdx = (ref: string, d: string) => Math.floor((Date.parse(ref + "T12:00:00Z") - Date.parse(d + "T12:00:00Z")) / 6048e5);
/** Exercícios repetidos demais (anti-repetição): em ≥ X sessões seguidas do músculo, ou em mais de Y das últimas 4 semanas.
 *  `sessoes` = sessões das últimas semanas (data + exercícios feitos). `sempre` nunca entra (passe os fixados em `exceto`). */
export function exerciciosCansados(sessoes: readonly SessaoExercicios[], exceto: readonly string[] = [], muscleOf: (id: string) => MuscleId | undefined = musculoPadrao): string[] {
  const ord = [...sessoes].sort((a, b) => (a.date < b.date ? 1 : -1));
  if (!ord.length) return [];
  const ref = ord[0].date;
  const porMusculo = new Map<MuscleId, SessaoExercicios[]>();
  for (const s of ord) for (const m of new Set(s.ids.map(muscleOf).filter((x): x is MuscleId => !!x))) porMusculo.set(m, [...(porMusculo.get(m) ?? []), s]);
  const out = new Set<string>();
  for (const s of ord) for (const id of s.ids) {
    if (out.has(id) || exceto.includes(id)) continue;
    const m = muscleOf(id);
    const ss = m ? porMusculo.get(m) ?? [] : [];
    let seguidas = 0;
    for (const x of ss) { if (x.ids.includes(id)) seguidas++; else break; }
    const semanas = new Set(ss.filter((x) => x.ids.includes(id)).map((x) => semanaIdx(ref, x.date)).filter((w) => w < REPETE_SEMANAS)).size;
    if (seguidas >= REPETE_SEGUIDAS_MAX || semanas / REPETE_SEMANAS > REPETE_PCT_MAX) out.add(id);
  }
  return [...out].sort();
}
const musculoPadrao = (id: string): MuscleId | undefined => (Object.hasOwn(EXERCISE_BY_ID, id) ? EXERCISE_BY_ID[id].m : undefined);
