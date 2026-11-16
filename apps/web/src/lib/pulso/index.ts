// #63 Pulso dos chips desmarcados: nas primeiras aberturas do app, até o 1º toque. Fica no aparelho (conveniência; sem servidor).
// A regra vive no core (devePulsar); o movimento é CSS (`.pulsa`), desligado por prefers-reduced-motion.
import * as C from "@ciclo/core";
import { lsGet, lsSet } from "../util.ts";

const KEY = "ciclo:pulso";
let atual: C.EstadoPulso | null = null;
/** Conta uma visita por abertura do app (a 1ª vez que alguém pergunta). */
function estado(): C.EstadoPulso {
  if (!atual) { atual = C.pulsoAoAbrir(lsGet<C.EstadoPulso | null>(KEY, null)); lsSet(KEY, atual); }
  return atual;
}
/** Classe para o contêiner dos chips: "pulsa" ou "". */
export const classePulso = () => (C.devePulsar(estado()) ? "pulsa" : "");
/** O 1º toque em qualquer chip ou opção para o pulso de vez. */
export function pararPulso() {
  const s = estado();
  if (!s.interagiu) { atual = C.pulsoAoTocar(s); lsSet(KEY, atual); }
}
/** Só para teste: esquece o estado em memória (relê o aparelho). */
export const _reiniciarPulso = () => { atual = null; };
