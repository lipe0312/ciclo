// #77 Regras puras do "voltar" com origem (testáveis sem navegador). A árvore de telas continua no core (C.voltarDe);
// a única exceção é a Semana, aba do Treino com duas portas de entrada: volta para onde a pessoa estava (history.back).
import * as C from "@ciclo/core";

/** Entradas do histórico criadas por este app nesta aba (cada uma marcada com o índice no history.state). */
export interface Pilha { entradas: string[]; idx: number }
export const PILHA_VAZIA: Pilha = { entradas: [], idx: -1 };
const norm = (h: string) => (h && h !== "#" ? h : "#hoje");

/** Atualiza a pilha. `idxGravado`: o índice que a entrada já tinha (voltar/avançar) ou null (entrada nova);
 *  "substituir" = replaceState (filtro, busca): troca a entrada atual. */
export function registrarRota(p: Pilha, hash: string, idxGravado: number | null | "substituir"): Pilha {
  const h = norm(hash);
  if (idxGravado === "substituir" && p.idx >= 0) return { entradas: p.entradas.map((e, i) => (i === p.idx ? h : e)), idx: p.idx };
  if (typeof idxGravado === "number" && idxGravado >= 0 && idxGravado < p.entradas.length) {
    return { entradas: p.entradas.map((e, i) => (i === idxGravado ? h : e)), idx: idxGravado };
  }
  if (p.entradas[p.idx] === h) return p;
  const idx = p.idx + 1;
  return { entradas: [...p.entradas.slice(0, idx), h], idx };
}

export type AcaoVoltar = { tipo: "historico"; nm: string } | ({ tipo: "ir" } & C.Destino);

/** O que o "voltar" faz nesta rota: Semana com origem no app → history.back; o resto → destino do core. */
export function acaoVoltar(r: { screen: string; parts: readonly string[] }, p: Pilha): AcaoVoltar | null {
  const ant = p.idx > 0 ? p.entradas[p.idx - 1] : null;
  if (r.screen === "semana" && !r.parts.length && ant) {
    const tela = ant.replace(/^#/, "").split(/[/?]/)[0] || "hoje";
    return { tipo: "historico", nm: C.nomeDaTela(tela) };
  }
  const d = C.voltarDe(r.screen, r.parts);
  return d ? { tipo: "ir", ...d } : null;
}
