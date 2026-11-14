// #64 Saída previsível: botão "voltar" na barra do topo, Esc no computador e gesto da borda esquerda no app
// instalado (iOS não tem botão de voltar no PWA). Todos levam ao mesmo destino: C.voltarDe (pilha própria do core).
import { useEffect } from "preact/hooks";
import * as C from "@ciclo/core";
import { go, href } from "../roteador/index.ts";
import type { Route } from "../roteador/index.ts";
import { isSheetOpen } from "../folha/index.tsx";
import { Icon } from "../ui/index.tsx";

export const destinoDe = (r: Route) => C.voltarDe(r.screen, r.parts);
const hrefDe = (d: C.Destino) => href(d.screen, d.parts);

const digitando = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
const instalado = () => matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** Esc (sem folha aberta e fora de campo de texto) e arrasto da borda esquerda → destino do voltar. */
export function useGestosVoltar(r: Route, ativo: boolean) {
  useEffect(() => {
    const d = ativo ? destinoDe(r) : null;
    if (!d) return;
    const k = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || isSheetOpen() || digitando(e.target)) return;
      go(hrefDe(d));
    };
    let x0 = -1, y0 = 0;
    const ts = (e: TouchEvent) => { const t = e.touches[0]; x0 = e.touches.length === 1 && t.clientX < 24 && !isSheetOpen() ? t.clientX : -1; y0 = t.clientY; };
    const te = (e: TouchEvent) => {
      if (x0 < 0) return;
      const t = e.changedTouches[0], dx = t.clientX - x0, dy = Math.abs(t.clientY - y0);
      x0 = -1;
      if (dx > 72 && dy < 48) go(hrefDe(d));
    };
    addEventListener("keydown", k);
    const gesto = instalado();
    if (gesto) { addEventListener("touchstart", ts, { passive: true }); addEventListener("touchend", te, { passive: true }); }
    return () => { removeEventListener("keydown", k); if (gesto) { removeEventListener("touchstart", ts); removeEventListener("touchend", te); } };
  }, [r.screen, r.parts.join("/"), ativo]);
}

/** Botão "‹ Destino" da barra do topo. */
export function Voltar({ route }: { route: Route }) {
  const d = destinoDe(route);
  if (!d) return null;
  return <a class="voltar" href={hrefDe(d)} aria-label={`Voltar para ${d.nm}`}><Icon id="back" /><span>{d.nm}</span></a>;
}
