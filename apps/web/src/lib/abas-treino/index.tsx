// #77 Abas do espaço Treino: Hoje · Semana · Exercícios · Histórico · Cardio. A mesma barra no Treino e na Semana;
// cada aba é só um link (troca de tela, nunca abre folha) e a atual fica marcada (aria-current).
// Em tela estreita as 5 cabem com rótulo compacto; se ainda assim rolar, a borda ganha um fade e a aba atual fica à vista.
import { useEffect, useRef } from "preact/hooks";

export type AbaTreino = "hoje" | "semana" | "ex" | "hist" | "cardio";
const ABAS: [AbaTreino, string, string][] = [
  ["hoje", "Hoje", "#treino"], ["semana", "Semana", "#semana"], ["ex", "Exercícios", "#treino/exercicios"],
  ["hist", "Histórico", "#treino/historico"], ["cardio", "Cardio", "#treino/cardio"],
];

export function AbasTreino({ atual }: { atual: AbaTreino }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = ref.current;
    if (!nav) return;
    const ajustar = () => {
      const rola = nav.scrollWidth > nav.clientWidth + 1;
      nav.classList.toggle("rola", rola);
      const a = nav.querySelector<HTMLElement>('[aria-current="page"]');
      if (rola && a) nav.scrollLeft = Math.max(0, a.offsetLeft - nav.offsetLeft - (nav.clientWidth - a.offsetWidth) / 2);
      nav.classList.toggle("no-fim", nav.scrollLeft + nav.clientWidth >= nav.scrollWidth - 2);
    };
    const fim = () => nav.classList.toggle("no-fim", nav.scrollLeft + nav.clientWidth >= nav.scrollWidth - 2);
    ajustar();
    addEventListener("resize", ajustar); nav.addEventListener("scroll", fim, { passive: true });
    return () => { removeEventListener("resize", ajustar); nav.removeEventListener("scroll", fim); };
  }, [atual]);
  return <nav ref={ref} class="tabs subnav abas-treino" aria-label="Treino">
    {ABAS.map(([id, nm, h]) => <a key={id} class="chip" href={h} aria-current={id === atual ? "page" : undefined}>{nm}</a>)}</nav>;
}
