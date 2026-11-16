// #63 Começo vazio e guiado: o Hoje de uma conta sem treino leva a "Montar meu primeiro treino" (o mínimo do Perfil de treino),
// e os chips desmarcados pulsam de leve nas primeiras visitas até o 1º toque (o CSS respeita prefers-reduced-motion).
import { PASSOS_PP } from "./perfil.ts";
import type { Falta } from "./perfil.ts";

/** Índice do passo do Perfil de treino onde "Montar meu primeiro treino" abre: o 1º que falta; sem falta, o resumo (gera a semana). */
export function passoParaMontarTreino(falta: readonly Falta[]): number {
  const p = falta.find((f) => f.passo)?.passo;
  return PASSOS_PP.indexOf(p ?? "resumo");
}

/** Quantas aberturas do Perfil de treino ainda mostram o pulso. */
export const PULSO_VISITAS = 3;
export interface EstadoPulso { visitas: number; interagiu: boolean }

const limpo = (s: unknown): EstadoPulso | null => {
  const x = s as Partial<EstadoPulso> | null;
  return x && Number.isInteger(x.visitas) && (x.visitas as number) >= 0 && typeof x.interagiu === "boolean" ? { visitas: x.visitas as number, interagiu: x.interagiu } : null;
};
/** Mais uma abertura da tela. */
export function pulsoAoAbrir(s: EstadoPulso | null | undefined): EstadoPulso {
  const x = limpo(s) ?? { visitas: 0, interagiu: false };
  return { visitas: Math.min(x.visitas + 1, 999), interagiu: x.interagiu };
}
/** O 1º toque num chip: o pulso para de vez. */
export const pulsoAoTocar = (s: EstadoPulso | null | undefined): EstadoPulso => ({ visitas: limpo(s)?.visitas ?? 0, interagiu: true });
/** Pulsa só nas primeiras visitas e enquanto a pessoa não tocou em nada. */
export function devePulsar(s: EstadoPulso | null | undefined): boolean {
  const x = limpo(s);
  return !!x && !x.interagiu && x.visitas >= 1 && x.visitas <= PULSO_VISITAS;
}
