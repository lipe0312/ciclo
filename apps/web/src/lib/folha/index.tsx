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
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") closeSheet(); }; addEventListener("keydown", k); return () => removeEventListener("keydown", k); }, []);
  return <>
    <div class={`scrim ${open ? "open" : ""}`} onClick={closeSheet} />
    <div ref={ref} class={`sheet ${open ? "open" : ""}`} role="dialog" aria-modal="true" aria-labelledby="sheetTitle">{content?.()}</div>
  </>;
}
export const setSheetRerender = (f: () => void) => { rerender = f; };

/** Cabeçalho padrão de folha: kicker + título + fechar. */
export const SheetHead = ({ kicker, title }: { kicker: string; title: string }) =>
  <div class="row between start"><div><p class="kicker">{kicker}</p><h2 id="sheetTitle" style="margin-top:4px">{title}</h2></div>
    <button type="button" class="iconbtn" onClick={closeSheet} aria-label="Fechar"><Icon id="x" /></button></div>;
