// Folha (bottom sheet). O conteúdo é uma função: re-renderiza junto com o estado.
import type { VNode } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { Icon } from "../ui/index.tsx";

type Content = () => VNode | null;
let content: Content | null = null;
let lastFocus: Element | null = null;
let rerender: () => void = () => {};
export function openSheet(c: Content) { if (!content) lastFocus = document.activeElement; content = c; rerender(); }
export function closeSheet() { if (!content) return; content = null; rerender(); (lastFocus as HTMLElement | null)?.focus?.(); }
export const isSheetOpen = () => !!content;

export function Folha({ tick }: { tick: number }) {
  const ref = useRef<HTMLDivElement>(null);
  void tick;
  const open = !!content;
  useEffect(() => { if (open) ref.current?.querySelector<HTMLElement>("button,input,select,textarea")?.focus(); }, [open]);
  // Esc fecha só a folha (o "voltar" da tela vê o defaultPrevented e não sai junto).
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape" && content) { e.preventDefault(); closeSheet(); } }; addEventListener("keydown", k); return () => removeEventListener("keydown", k); }, []);
  // #64 arrastar para baixo fecha (só quando a folha está no topo da rolagem, para não brigar com o scroll).
  const drag = useRef({ y0: -1, dy: 0, t0: 0 });
  const onStart = (e: TouchEvent) => { const el = ref.current; drag.current = { y0: el && el.scrollTop <= 0 ? e.touches[0].clientY : -1, dy: 0, t0: e.timeStamp }; };
  const onMove = (e: TouchEvent) => {
    const d = drag.current, el = ref.current; if (d.y0 < 0 || !el) return;
    d.dy = Math.max(0, e.touches[0].clientY - d.y0);
    if (d.dy > 0) { el.style.transition = "none"; el.style.transform = `translateY(${d.dy}px)`; }
  };
  const onEnd = (e: TouchEvent) => {
    const d = drag.current, el = ref.current; if (d.y0 < 0 || !el) return;
    el.style.transition = ""; el.style.transform = "";
    const rapido = d.dy > 40 && d.dy / Math.max(1, e.timeStamp - d.t0) > 0.6;
    if (d.dy > 96 || rapido) closeSheet();
    drag.current.y0 = -1;
  };
  return <>
    <div class={`scrim ${open ? "open" : ""}`} onClick={closeSheet} />
    <div ref={ref} class={`sheet ${open ? "open" : ""}`} role="dialog" aria-modal="true" aria-labelledby="sheetTitle"
      onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd} onTouchCancel={onEnd}>
      {open && <span class="grabber" aria-hidden="true" />}{content?.()}</div>
  </>;
}
export const setSheetRerender = (f: () => void) => { rerender = f; };

/** Cabeçalho padrão de folha: kicker + título + fechar. */
export const SheetHead = ({ kicker, title }: { kicker: string; title: string }) =>
  <div class="row between start"><div><p class="kicker">{kicker}</p><h2 id="sheetTitle" style="margin-top:4px">{title}</h2></div>
    <button type="button" class="iconbtn" onClick={closeSheet} aria-label="Fechar"><Icon id="x" /></button></div>;
