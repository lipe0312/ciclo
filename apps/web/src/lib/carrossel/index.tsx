// Carrossel horizontal com scroll-snap (sem JS de arraste). Indicadores clicáveis.
import type { ComponentChildren } from "preact";
import { useRef, useState } from "preact/hooks";

export function Carrossel({ items, label }: { items: ComponentChildren[]; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [i, setI] = useState(0);
  const onScroll = () => { const el = ref.current; if (el) setI(Math.round(el.scrollLeft / Math.max(1, el.clientWidth))); };
  const goTo = (k: number) => ref.current?.scrollTo({ left: k * ref.current.clientWidth, behavior: "smooth" });
  return <div class="carrossel" role="region" aria-label={label}>
    <div class="carr-track" ref={ref} onScroll={onScroll}>{items.map((it, k) => <div class="carr-item" key={k}>{it}</div>)}</div>
    {items.length > 1 && <div class="carr-dots">{items.map((_, k) => <button type="button" key={k} aria-label={`${k + 1} de ${items.length}`} aria-current={i === k} onClick={() => goTo(k)}><i /></button>)}</div>}
  </div>;
}
