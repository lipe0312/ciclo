// #82 A divisão que a pessoa já faz ("Meu treino atual", #74): detectar o tipo (ABC, ABCD, ABCDE, PPL, PPL×2,
// superior/inferior, corpo inteiro), comparar com os dias e a frequência do método e dizer se a semana pode segui-la.
// Compatível → a semana segue a divisão, na ordem dela (o gerador só ajusta volume e exercícios). Incompatível → só uma
// sugestão (Manter / Ajustar); "Manter" é respeitado (regra 5) e o risco fica no aviso. Regra: docs/09-base-cientifica.md#divisão-da-pessoa.
// TS puro e determinístico. Sem import de runtime de treino-atual.ts (ele importa daqui).

import { EXERCISE_BY_ID, MUSCLES } from "./catalog.ts";
import type { MuscleId } from "./catalog.ts";
import type { GrupoTreino, TreinoAtual } from "./treino-atual.ts";

export type TipoDivisao = "full" | "sup_inf" | "ppl" | "ppl2" | "abc" | "abcd" | "abcde" | "outra";
export const TIPO_DIVISAO_NM: Record<TipoDivisao, string> = {
  full: "corpo inteiro", sup_inf: "superior/inferior", ppl: "empurrar/puxar/pernas", ppl2: "empurrar/puxar/pernas 2×",
  abc: "ABC", abcd: "ABCD", abcde: "ABCDE", outra: "própria",
};
export interface Divisao {
  tipo: TipoDivisao;
  /** nº de treinos do ciclo (A, B, C…) */
  dias: number;
  /** "A/B/C/D" */
  letras: string;
  /** nome que a pessoa deu a cada treino (dado do usuário: só texto) */
  nomes: string[];
  grupos: GrupoTreino[][];
  /** músculos do orçamento de cada treino, na ordem do catálogo */
  musculos: MuscleId[][];
  /** em quantos treinos do ciclo cada músculo aparece */
  freqPorMusculo: Partial<Record<MuscleId, number>>;
  /** assinatura estável dos grupos (a escolha Manter/Ajustar vale só para ela) */
  assinatura: string;
}
export interface Comparacao { compativel: boolean; avisos: string[] }
export type EscolhaDivisao = "manter" | "ajustar";
export interface DivisaoEscolha { escolha: EscolhaDivisao; assinatura: string }

const ORDEM: readonly GrupoTreino[] = ["peito", "costas", "ombro", "biceps", "triceps", "pernas", "abdomen"];
const NM: Record<GrupoTreino, string> = { peito: "peito", costas: "costas", ombro: "ombro", biceps: "bíceps", triceps: "tríceps", pernas: "pernas", abdomen: "abdômen" };
/** Músculos do orçamento que cada grupo grande treina (ombro = lateral + posterior; pernas = quadríceps, posterior, glúteo, panturrilha). */
export const MUSCULOS_DO_GRUPO: Record<GrupoTreino, MuscleId[]> = {
  peito: ["peito"], costas: ["costas"], ombro: ["ombro", "post"], biceps: ["biceps"], triceps: ["triceps"],
  pernas: ["quad", "isquio", "gluteo", "pant"], abdomen: ["core"],
};
const GRUPO_DE: Record<MuscleId, GrupoTreino> = Object.fromEntries(
  (Object.entries(MUSCULOS_DO_GRUPO) as [GrupoTreino, MuscleId[]][]).flatMap(([g, ms]) => ms.map((m) => [m, g])),
) as Record<MuscleId, GrupoTreino>;
const EMPURRA: readonly GrupoTreino[] = ["peito", "ombro", "triceps"];
const PUXA: readonly GrupoTreino[] = ["costas", "biceps"];
/** Grupos conferidos na frequência quando o chamador não diz: todos menos abdômen (costuma ficar fora da divisão). */
export const GRUPOS_FREQ: readonly GrupoTreino[] = ["peito", "costas", "ombro", "biceps", "triceps", "pernas"];

type Papel = "full" | "sup" | "inf" | "push" | "pull" | "outro";
function papel(gs: readonly GrupoTreino[]): Papel {
  const perna = gs.includes("pernas"), push = gs.some((g) => EMPURRA.includes(g)), pull = gs.some((g) => PUXA.includes(g));
  if (perna) return push && pull ? "full" : !push && !pull ? "inf" : "outro";
  if (push && pull) return "sup";
  if (push) return "push";
  if (pull) return "pull";
  return "outro";
}

/** Grupos do treino: os marcados + os dos exercícios cadastrados (do catálogo pelo músculo; livres pelo grupo). */
function gruposDe(d: { grupos?: unknown; exercicios?: unknown }): GrupoTreino[] {
  const set = new Set<GrupoTreino>();
  for (const g of Array.isArray(d.grupos) ? d.grupos : []) if (ORDEM.includes(g)) set.add(g);
  for (const x of Array.isArray(d.exercicios) ? d.exercicios : []) {
    if (!x || typeof x !== "object") continue;
    const id = (x as { id?: unknown }).id, g = (x as { grupo?: unknown }).grupo;
    if (typeof id === "string") { const ex = EXERCISE_BY_ID[id]; if (ex) set.add(GRUPO_DE[ex.m]); }
    else if (typeof g === "string" && ORDEM.includes(g as GrupoTreino)) set.add(g as GrupoTreino);
  }
  return ORDEM.filter((g) => set.has(g));
}

/** Detecta o tipo da divisão do "Meu treino atual". null = sem divisão (nada a seguir). */
export function detectarDivisao(t: TreinoAtual | null | undefined): Divisao | null {
  const ds = Array.isArray(t?.divisoes) ? t!.divisoes : [];
  const linhas = ds.map((d) => ({ nome: typeof d?.nome === "string" ? d.nome : "", grupos: gruposDe(d ?? {}) })).filter((d) => d.grupos.length > 0);
  if (!linhas.length) return null;
  const n = linhas.length;
  const papeis = linhas.map((d) => papel(d.grupos));
  const so = (ok: Papel[]) => papeis.every((p) => ok.includes(p));
  const conta = (p: Papel) => papeis.filter((x) => x === p).length;
  let tipo: TipoDivisao;
  if (so(["full"])) tipo = "full";
  else if (so(["sup", "inf"]) && conta("sup") && conta("inf")) tipo = "sup_inf";
  else if (so(["push", "pull", "inf"]) && conta("push") === conta("pull") && conta("pull") === conta("inf") && (n === 3 || n === 6)) tipo = n === 3 ? "ppl" : "ppl2";
  else tipo = n === 3 ? "abc" : n === 4 ? "abcd" : n === 5 ? "abcde" : "outra";
  const musculos = linhas.map((d) => d.grupos.flatMap((g) => MUSCULOS_DO_GRUPO[g]).sort((a, b) => MUSCLE_ORDER(a) - MUSCLE_ORDER(b)));
  const freqPorMusculo: Partial<Record<MuscleId, number>> = {};
  for (const ms of musculos) for (const m of ms) freqPorMusculo[m] = (freqPorMusculo[m] ?? 0) + 1;
  return {
    tipo, dias: n, letras: linhas.map((_, i) => "ABCDEFG"[i]).join("/"), nomes: linhas.map((d) => d.nome),
    grupos: linhas.map((d) => d.grupos), musculos, freqPorMusculo, assinatura: linhas.map((d) => d.grupos.join(".")).join("|"),
  };
}
const MUSCLE_KEYS = Object.keys(MUSCLES) as MuscleId[];
const MUSCLE_ORDER = (m: MuscleId) => MUSCLE_KEYS.indexOf(m);

const juntar = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} e ${xs[xs.length - 1]}`);

/**
 * Compara a divisão com os dias de treino da semana e a frequência do método (padrão 2×, regra 4).
 * - Cabe nos dias: o ciclo se repete (ABC em 6 dias = ABCABC); a frequência de cada grupo é contada nesses dias.
 * - Não cabe (mais treinos que dias): incompatível; o ciclo roda entre as semanas, então a frequência é a média.
 */
export function compararDivisao(d: Divisao, dias: number, metas: { freq?: number; grupos?: readonly GrupoTreino[] } = {}): Comparacao {
  const freq = metas.freq ?? 2, grupos = metas.grupos ?? GRUPOS_FREQ;
  const nd = Math.max(0, Math.round(dias));
  const avisos: string[] = [];
  const noCiclo = (g: GrupoTreino) => d.grupos.filter((gs) => gs.includes(g)).length;
  if (nd < d.dias) {
    const baixo = grupos.filter((g) => (noCiclo(g) * nd) / d.dias < freq).map((g) => NM[g]);
    avisos.push(`Sua divisão tem ${d.dias} treinos e você treina ${nd} dia${nd === 1 ? "" : "s"} por semana: ela não fecha na semana${baixo.length ? ` e ${juntar(baixo)} fica${baixo.length > 1 ? "m" : ""} abaixo de ${freq}× por semana` : ""}.`);
    return { compativel: false, avisos };
  }
  const naSemana = (g: GrupoTreino) => Array.from({ length: nd }, (_, i) => d.grupos[i % d.dias]).filter((gs) => gs.includes(g)).length;
  const fora = grupos.filter((g) => naSemana(g) === 0).map((g) => NM[g]);
  if (fora.length) avisos.push(`Sua divisão não treina ${juntar(fora)}.`);
  const porFreq = new Map<number, string[]>();
  for (const g of grupos) { const k = naSemana(g); if (k > 0 && k < freq) porFreq.set(k, [...(porFreq.get(k) ?? []), NM[g]]); }
  for (const [k, gs] of [...porFreq].sort((a, b) => a[0] - b[0])) avisos.push(`Sua divisão treina ${juntar(gs)} ${k}× por semana.`);
  return { compativel: avisos.length === 0, avisos };
}

/** A escolha (Manter/Ajustar) guardada no perfil vale só para a divisão em que foi feita. */
export function escolhaDaDivisao(d: Divisao | null | undefined, e: unknown): EscolhaDivisao | null {
  if (!d || !e || typeof e !== "object") return null;
  const { escolha, assinatura } = e as { escolha?: unknown; assinatura?: unknown };
  return (escolha === "manter" || escolha === "ajustar") && assinatura === d.assinatura ? escolha : null;
}

/** Assinatura válida (perfil): só grupos conhecidos, "." entre grupos e "|" entre treinos. */
export const assinaturaValida = (s: unknown): s is string =>
  typeof s === "string" && s.length <= 400 && s.split("|").every((t) => t.length > 0 && t.split(".").every((g) => ORDEM.includes(g as GrupoTreino)));

/** Posição no ciclo do 1º treino da semana: 0 quando a divisão cabe nos dias; quando não cabe ("Manter"), o ciclo continua
 *  de uma semana para a outra (ABCDE em 3 dias: ABC, DEA, BCD…), para nenhum treino ficar esquecido. */
export function inicioDoCiclo(d: Divisao, dias: number, weekStart: string): number {
  if (dias <= 0 || dias >= d.dias) return 0;
  const semana = Math.floor((Date.parse(weekStart + "T12:00:00Z") - Date.parse("2024-01-01T12:00:00Z")) / 6048e5);
  return (((semana * dias) % d.dias) + d.dias) % d.dias;
}

/** O que a Semana mostra sobre a divisão da pessoa. */
export interface DivisaoSemana {
  tipo: TipoDivisao; nome: string; letras: string; dias: number; assinatura: string;
  compativel: boolean; avisos: string[]; escolha: EscolhaDivisao | null;
  /** a semana segue a divisão (compatível, ou incompatível com "Manter") */
  seguindo: boolean;
}
export function divisaoDaSemana(d: Divisao | null | undefined, dias: number, escolha: EscolhaDivisao | null | undefined, freq?: number): DivisaoSemana | null {
  if (!d || dias <= 0) return null;
  const c = compararDivisao(d, dias, { freq });
  const e = escolha ?? null;
  return { tipo: d.tipo, nome: TIPO_DIVISAO_NM[d.tipo], letras: d.letras, dias: d.dias, assinatura: d.assinatura, compativel: c.compativel, avisos: c.avisos, escolha: e, seguindo: c.compativel || e === "manter" };
}
