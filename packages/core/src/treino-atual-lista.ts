// #74 Ajudas só da tela "Meu treino atual" (lista por popularidade, busca, cobertura e destaque). Módulo à parte para não
// entrar no JS inicial do app: o gerador só precisa de treino-atual.ts.
import { EXERCISES, EXERCISE_BY_ID } from "./catalog.ts";
import type { Exercise } from "./catalog.ts";
import { norm, searchCatalog } from "./search.ts";
import { GRUPOS_TREINO, divisoesDe, grupoDoExercicio } from "./treino-atual.ts";
import type { GrupoTreino, TreinoAtual } from "./treino-atual.ts";

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Quais grupos grandes já têm exercício informado (checklist discreto; nunca trava nada). */
export function coberturaTreinoAtual(t: TreinoAtual | null | undefined): { grupo: GrupoTreino; informado: boolean; n: number }[] {
  const n: Record<GrupoTreino, number> = { peito: 0, costas: 0, ombro: 0, biceps: 0, triceps: 0, pernas: 0, abdomen: 0 };
  for (const d of divisoesDe(t)) for (const x of Array.isArray(d.exercicios) ? d.exercicios : []) {
    if (!isObj(x)) continue;
    const ex = typeof x.id === "string" ? EXERCISE_BY_ID[x.id] : undefined;
    const g = ex ? grupoDoExercicio(ex) : (GRUPOS_TREINO as readonly unknown[]).includes(x.grupo) ? (x.grupo as GrupoTreino) : null;
    if (g) n[g]++;
  }
  return GRUPOS_TREINO.map((grupo) => ({ grupo, informado: n[grupo] > 0, n: n[grupo] }));
}

/** Os exercícios de força de um grupo, do mais comum para o menos comum (empate: ordem do catálogo). */
export function exerciciosDoGrupo(g: GrupoTreino): Exercise[] {
  return EXERCISES.map((e, i) => ({ e, i })).filter(({ e }) => grupoDoExercicio(e) === g)
    .sort((a, b) => (b.e.popularidade ?? 0) - (a.e.popularidade ?? 0) || a.i - b.i).map(({ e }) => e);
}

/** Autocomplete do "digite você mesmo": busca em TODO o catálogo de força (nome, apelidos, sem acento). */
export function buscarExercicioAtual(q: string, limite = 8): Exercise[] {
  if (!norm(q)) return [];
  return (searchCatalog({ q, type: "forca" }) as Exercise[]).slice(0, limite);
}

/** Trecho buscado dentro do nome, para destacar com <span> (nunca HTML): [antes, achado, depois]. Sem achado: [nome, "", ""]. */
export function destacarBusca(nome: string, q: string): [string, string, string] {
  const qq = norm(q);
  // sem acento e minúsculo, com o mesmo comprimento do original (letras pré-compostas do pt-BR): o índice vale no original
  const base = nome.normalize("NFC").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const i = qq && base.length === nome.length ? base.indexOf(qq) : -1;
  if (i < 0) return [nome, "", ""];
  return [nome.slice(0, i), nome.slice(i, i + qq.length), nome.slice(i + qq.length)];
}

