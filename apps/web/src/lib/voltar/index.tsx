// #64 Saída previsível: botão "voltar" na barra do topo, Esc no computador e gesto da borda esquerda no app
// instalado (iOS não tem botão de voltar no PWA). Todos levam ao mesmo destino: C.voltarDe (pilha própria do core).
// #77 Exceção: a Semana volta para onde a pessoa estava no app (history.back); aberta direto, vai para o Treino.
import { useEffect } from "preact/hooks";
import type * as C from "@ciclo/core";
import { go, href } from "../roteador/index.ts";
import type { Route } from "../roteador/index.ts";
import { isSheetOpen } from "../folha/index.tsx";
import { Icon } from "../ui/index.tsx";
import { PILHA_VAZIA, acaoVoltar, pilhaSalva, registrarRota } from "./regras.ts";
import type { AcaoVoltar, Pilha } from "./regras.ts";

// Pilha das entradas que o app criou nesta aba. Cada entrada leva o índice no history.state; a pilha sobrevive a recarregar.
const CHAVE = "ciclo:pilha";
let pilha: Pilha = PILHA_VAZIA;
try { pilha = pilhaSalva(sessionStorage.getItem(CHAVE)) ?? PILHA_VAZIA; } catch { /* sem storage */ }
const idxGravado = () => { const v = (history.state as { cicloIdx?: unknown } | null)?.cicloIdx; return typeof v === "number" ? v : null; };
function anotar(modo: "nav" | "substituir") {
  pilha = registrarRota(pilha, location.hash, modo === "substituir" ? "substituir" : idxGravado());
  if (idxGravado() !== pilha.idx) { try { history.replaceState({ ...(history.state ?? {}), cicloIdx: pilha.idx }, ""); } catch { /* ok */ } }
  try { sessionStorage.setItem(CHAVE, JSON.stringify(pilha)); } catch { /* sem storage */ }
}
if (typeof addEventListener === "function") {
  anotar("nav");
  addEventListener("hashchange", () => anotar("nav"));
  addEventListener("rota", () => anotar("substituir"));
}

export const acaoDe = (r: Route) => acaoVoltar(r, pilha);
const hrefDe = (d: C.Destino) => href(d.screen, d.parts);
const executar = (a: AcaoVoltar) => { if (a.tipo === "historico") history.back(); else go(hrefDe(a)); };

const digitando = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
const instalado = () => matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** Esc (sem folha aberta e fora de campo de texto) e arrasto da borda esquerda → destino do voltar. */
export function useGestosVoltar(r: Route, ativo: boolean) {
  useEffect(() => {
    if (!ativo || !acaoDe(r)) return;
    const fazer = () => { const a = acaoDe(r); if (a) executar(a); };
    const k = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || isSheetOpen() || digitando(e.target)) return;
      fazer();
    };
    let x0 = -1, y0 = 0;
    const ts = (e: TouchEvent) => { const t = e.touches[0]; x0 = e.touches.length === 1 && t.clientX < 24 && !isSheetOpen() ? t.clientX : -1; y0 = t.clientY; };
    const te = (e: TouchEvent) => {
      if (x0 < 0) return;
      const t = e.changedTouches[0], dx = t.clientX - x0, dy = Math.abs(t.clientY - y0);
      x0 = -1;
      if (dx > 72 && dy < 48) fazer();
    };
    addEventListener("keydown", k);
    const gesto = instalado();
    if (gesto) { addEventListener("touchstart", ts, { passive: true }); addEventListener("touchend", te, { passive: true }); }
    return () => { removeEventListener("keydown", k); if (gesto) { removeEventListener("touchstart", ts); removeEventListener("touchend", te); } };
  }, [r.screen, r.parts.join("/"), ativo]);
}

/** Botão "‹ Destino" da barra do topo. Com origem no app, é um link para o destino que volta no histórico ao tocar. */
export function Voltar({ route }: { route: Route }) {
  const a = acaoDe(route);
  if (!a) return null;
  const alvo = a.tipo === "historico" ? pilha.entradas[pilha.idx - 1] : hrefDe(a);
  const toque = a.tipo === "historico" ? (e: MouseEvent) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return; e.preventDefault(); history.back(); } : undefined;
  return <a class="voltar" href={alvo} onClick={toque} aria-label={`Voltar para ${a.nm}`}><Icon id="back" /><span>{a.nm}</span></a>;
}
