// #74 "Meu treino atual": as divisões que a pessoa já faz (ex.: "A: Peito + Tríceps"), por GRUPO grande (nunca subparte),
// com os exercícios de cada uma. Opcional: nunca trava gerar o treino; com cadastro, o gerador só prioriza o que ela já faz.
// IDs só do catálogo. Exercício que não está no catálogo fica como texto livre `{ nome, grupo }`, sem id: o gerador não o usa
// como exercício (só, se o texto casar com o nome/apelido de um do catálogo, como sinal fraco de familiaridade). TS puro.

import { EXERCISES, EXERCISE_BY_ID, SUB_MUSCLES } from "./catalog.ts";
import type { Exercise, MuscleId, SubMuscleId } from "./catalog.ts";
import type { Remembered } from "./loads.ts";
import { norm } from "./search.ts";

export const GRUPOS_TREINO = ["peito", "costas", "ombro", "biceps", "triceps", "pernas", "abdomen"] as const;
export type GrupoTreino = (typeof GRUPOS_TREINO)[number];
export const GRUPO_TREINO_NM: Record<GrupoTreino, string> = {
  peito: "Peito", costas: "Costas", ombro: "Ombro", biceps: "Bíceps", triceps: "Tríceps", pernas: "Pernas", abdomen: "Abdômen",
};
const GRUPO_DO_MUSCULO: Record<MuscleId, GrupoTreino> = {
  peito: "peito", costas: "costas", ombro: "ombro", post: "ombro", biceps: "biceps", triceps: "triceps",
  quad: "pernas", isquio: "pernas", gluteo: "pernas", pant: "pernas", core: "abdomen",
};
export const grupoDoMusculo = (m: MuscleId): GrupoTreino => GRUPO_DO_MUSCULO[m];
export const grupoDoExercicio = (ex: Pick<Exercise, "m">): GrupoTreino => GRUPO_DO_MUSCULO[ex.m];

/** Nome curto da subparte, em letra pequena ao lado do exercício ("posterior", "superior", "cabeça longa"…). */
const PARTE_CURTA: Record<SubMuscleId, string> = {
  ombro_ant: "anterior", ombro_lat: "lateral", ombro_post: "posterior", dorsal: "dorsal", costas_meio: "meio das costas",
  trapezio: "trapézio", lombar: "lombar", biceps: "bíceps", braquial: "braquial", triceps_longa: "cabeça longa",
  triceps_lateral: "cabeça lateral", antebraco: "antebraço", peito_sup: "superior", peito_medio: "médio", quad: "quadríceps",
  isquio: "posterior de coxa", gluteo: "glúteo", adutores: "adutores", pant: "panturrilha", abdomen: "abdômen", obliquos: "oblíquos",
};
export const parteCurta = (s: SubMuscleId): string => PARTE_CURTA[s] ?? SUB_MUSCLES[s]?.nm ?? s;
/** A subparte principal do exercício (a que o Trocar preserva). */
export const partePrincipal = (ex: Pick<Exercise, "subMuscles">): SubMuscleId | null => ex.subMuscles?.[0] ?? null;

export interface ExercicioAtual { id: string; sets?: number; reps?: number; kg?: number }
/** Exercício fora do catálogo: só texto e o grupo onde a pessoa estava. Nunca tem id. */
export interface ExercicioLivre { nome: string; grupo: GrupoTreino }
export type ItemTreinoAtual = ExercicioAtual | ExercicioLivre;
export interface DivisaoAtual { nome: string; grupos: GrupoTreino[]; exercicios: ItemTreinoAtual[] }
export interface TreinoAtual { divisoes: DivisaoAtual[] }
export const ehLivre = (it: ItemTreinoAtual): it is ExercicioLivre => !("id" in it);

export const TREINO_ATUAL_LIM = { divisoes: 7, exercicios: 24, nome: 30, livre: 40 } as const;
export const nomeDivisaoPadrao = (i: number) => `Treino ${String.fromCharCode(65 + Math.max(0, Math.min(25, i)))}`;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
/** Texto seguro para nome de divisão ou exercício livre: sem HTML (< >), sem caractere de controle. */
const TEXTO_RUIM = /[<>\u0000-\u001f\u007f]/;
export function textoLivreValido(s: unknown, max: number, min = 2): string | null {
  if (typeof s !== "string") return null;
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length < min || t.length > max || TEXTO_RUIM.test(s)) return null;
  return t;
}

/**
 * Valida o "Meu treino atual" vindo do app ou do Chat: até 7 divisões, só grupos grandes, IDs só do catálogo (de força),
 * sem repetir exercício na mesma divisão; exercício livre = `{ nome, grupo }` (texto curto, sem HTML), nunca com id.
 */
export function validarTreinoAtual(v: unknown, p = "treinoAtual"): { ok: true; value: TreinoAtual; errors: [] } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const err = (m: string) => { if (errors.length < 12) errors.push(m); };
  if (!isObj(v)) return { ok: false, errors: [`${p} deve ser um objeto`] };
  for (const k of Object.keys(v)) if (k !== "divisoes") err(`${p}.${k.slice(0, 40)}: campo desconhecido`);
  const ds = v.divisoes;
  if (!Array.isArray(ds)) return { ok: false, errors: [...errors, `${p}.divisoes deve ser uma lista`] };
  if (ds.length > TREINO_ATUAL_LIM.divisoes) return { ok: false, errors: [...errors, `${p}.divisoes: até ${TREINO_ATUAL_LIM.divisoes} treinos`] };
  const out: DivisaoAtual[] = [];
  ds.forEach((d, i) => {
    const q = `${p}.divisoes[${i}]`;
    if (!isObj(d)) return err(`${q} deve ser um objeto`);
    for (const k of Object.keys(d)) if (!["nome", "grupos", "exercicios"].includes(k)) err(`${q}.${k.slice(0, 40)}: campo desconhecido`);
    const nome = textoLivreValido(d.nome, TREINO_ATUAL_LIM.nome, 1);
    if (!nome) err(`${q}.nome: texto de 1 a ${TREINO_ATUAL_LIM.nome} caracteres, sem < >`);
    const gs = Array.isArray(d.grupos) ? d.grupos : null;
    if (!gs || gs.length > GRUPOS_TREINO.length || !gs.every((g) => (GRUPOS_TREINO as readonly unknown[]).includes(g)) || new Set(gs).size !== gs.length)
      err(`${q}.grupos: lista sem repetir de ${GRUPOS_TREINO.join("|")}`);
    const xs = Array.isArray(d.exercicios) ? d.exercicios : null;
    if (!xs) return err(`${q}.exercicios deve ser uma lista`);
    if (xs.length > TREINO_ATUAL_LIM.exercicios) return err(`${q}.exercicios: até ${TREINO_ATUAL_LIM.exercicios}`);
    const vistos = new Set<string>(), itens: ItemTreinoAtual[] = [];
    xs.forEach((x, j) => {
      const r = `${q}.exercicios[${j}]`;
      if (!isObj(x)) return err(`${r} deve ser um objeto`);
      if (own(x, "id")) {
        for (const k of Object.keys(x)) if (!["id", "sets", "reps", "kg"].includes(k)) err(`${r}.${k.slice(0, 40)}: campo desconhecido`);
        const id = x.id;
        if (typeof id !== "string" || !own(EXERCISE_BY_ID, id)) return err(`${r}: exercício "${typeof id === "string" ? id.slice(0, 60) : typeof id}" não existe no catálogo`);
        if (vistos.has(id)) return err(`${r}: "${id}" repetido no mesmo treino`);
        vistos.add(id);
        const it: ExercicioAtual = { id };
        const inteiro = (k: "sets" | "reps", lo: number, hi: number) => {
          if (x[k] == null) return;
          const n = x[k];
          if (typeof n === "number" && Number.isInteger(n) && n >= lo && n <= hi) it[k] = n; else err(`${r}.${k} deve ser inteiro de ${lo} a ${hi}`);
        };
        inteiro("sets", 1, 10); inteiro("reps", 1, 50);
        if (x.kg != null) { const n = x.kg; if (typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 600) it.kg = Math.round(n * 10) / 10; else err(`${r}.kg deve ser número de 0 a 600`); }
        itens.push(it);
      } else {
        for (const k of Object.keys(x)) if (!["nome", "grupo"].includes(k)) err(`${r}.${k.slice(0, 40)}: campo desconhecido`);
        const nomeL = textoLivreValido(x.nome, TREINO_ATUAL_LIM.livre);
        if (!nomeL) return err(`${r}.nome: texto de 2 a ${TREINO_ATUAL_LIM.livre} caracteres, sem < >`);
        if (!(GRUPOS_TREINO as readonly unknown[]).includes(x.grupo)) return err(`${r}.grupo deve ser ${GRUPOS_TREINO.join("|")}`);
        const chave = "livre:" + norm(nomeL);
        if (vistos.has(chave)) return err(`${r}: "${nomeL}" repetido no mesmo treino`);
        vistos.add(chave);
        itens.push({ nome: nomeL, grupo: x.grupo as GrupoTreino });
      }
    });
    if (nome && gs) out.push({ nome, grupos: [...gs] as GrupoTreino[], exercicios: itens });
  });
  return errors.length ? { ok: false, errors } : { ok: true, value: { divisoes: out }, errors: [] };
}

export const divisoesDe = (t: unknown): DivisaoAtual[] => (isObj(t) && Array.isArray(t.divisoes) ? (t.divisoes as DivisaoAtual[]) : []);

/** Exercícios do catálogo que a pessoa já faz (fortes) e os que só casam com o texto livre dela pelo nome/apelido (fracos). */
export function familiaresDoTreino(t: TreinoAtual | null | undefined): { fortes: string[]; fracos: string[] } {
  const fortes = new Set<string>(), textos = new Set<string>();
  for (const d of divisoesDe(t)) for (const x of Array.isArray(d.exercicios) ? d.exercicios : []) {
    if (!isObj(x)) continue;
    if (typeof x.id === "string" && EXERCISE_BY_ID[x.id]) fortes.add(x.id);
    else if (typeof (x as { nome?: unknown }).nome === "string") textos.add(norm((x as ExercicioLivre).nome));
  }
  const fracos = textos.size ? EXERCISES.filter((e) => !fortes.has(e.id) && [e.nm, ...(e.aliases ?? [])].some((a) => textos.has(norm(a)))).map((e) => e.id) : [];
  return { fortes: [...fortes], fracos };
}

/** "Como faz" informado (kg × reps) vira carga lembrada aproximada para a carga inicial (loads.ts). */
export function lembradasDoTreino(t: TreinoAtual | null | undefined): Remembered[] {
  const out: Remembered[] = [], vistos = new Set<string>();
  for (const d of divisoesDe(t)) for (const x of Array.isArray(d.exercicios) ? d.exercicios : []) {
    if (!isObj(x) || typeof x.id !== "string" || vistos.has(x.id)) continue;
    const it = x as ExercicioAtual;
    if (typeof it.kg === "number" && it.kg > 0 && typeof it.reps === "number" && it.reps >= 1 && it.reps <= 30) {
      vistos.add(it.id); out.push({ exerciseId: it.id, kg: it.kg, reps: it.reps, confidence: "aproximado" });
    }
  }
  return out;
}

/** O que o gerador recebe do perfil (#74): familiares fortes/fracos e se é iniciante (nunca treinou ou "estou começando"). */
export function entradaTreinoAtual(perfil: { level?: unknown; treinoAtual?: unknown } | null | undefined): { familiar: string[]; familiarFraco: string[]; iniciante: boolean } {
  const t = (perfil?.treinoAtual ?? null) as TreinoAtual | null;
  const { fortes, fracos } = familiaresDoTreino(t);
  const comecando = !!t && Array.isArray(t.divisoes) && t.divisoes.length === 0;
  return { familiar: fortes, familiarFraco: fracos, iniciante: perfil?.level === 0 || comecando };
}
