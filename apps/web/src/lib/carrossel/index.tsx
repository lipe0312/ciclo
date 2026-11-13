// Carrossel horizontal com scroll-snap (sem JS de arraste). Indicadores clicáveis.
// `inicial` = item que abre centralizado (ex.: hoje na semana, #29); `cls` troca o visual (itens parciais com os vizinhos à mostra).
import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";

export function Carrossel({ items, label, inicial = 0, cls = "" }: { items: ComponentChildren[]; label: string; inicial?: number; cls?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [i, setI] = useState(inicial);
  const centro = (k: number) => { const el = ref.current, c = el?.children[k] as HTMLElement | undefined; return el && c ? c.offsetLeft - (el.clientWidth - c.clientWidth) / 2 : 0; };
  const onScroll = () => {
    const el = ref.current; if (!el) return;
    let best = 0, d = Infinity;
    for (let k = 0; k < items.length; k++) { const x = Math.abs(centro(k) - el.scrollLeft); if (x < d) { d = x; best = k; } }
    setI(best);
  };
  const goTo = (k: number) => ref.current?.scrollTo({ left: centro(k), behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  useEffect(() => { if (inicial > 0 && ref.current) ref.current.scrollLeft = centro(inicial); }, []);
  return <div class={`carrossel ${cls}`} role="region" aria-label={label}>
    <div class="carr-track" ref={ref} onScroll={onScroll}>{items.map((it, k) => <div class="carr-item" key={k}>{it}</div>)}</div>
    {items.length > 1 && <div class="carr-dots">{items.map((_, k) => <button type="button" key={k} aria-label={`${k + 1} de ${items.length}`} aria-current={i === k} onClick={() => goTo(k)}><i /></button>)}</div>}
  </div>;
}
