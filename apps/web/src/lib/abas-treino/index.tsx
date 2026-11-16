// #77 Abas do espaço Treino: Hoje · Semana · Exercícios · Histórico · Cardio. A mesma barra no Treino e na Semana;
// cada aba é só um link (troca de tela, nunca abre folha) e a atual fica marcada (aria-current).
export type AbaTreino = "hoje" | "semana" | "ex" | "hist" | "cardio";
const ABAS: [AbaTreino, string, string][] = [
  ["hoje", "Hoje", "#treino"], ["semana", "Semana", "#semana"], ["ex", "Exercícios", "#treino/exercicios"],
  ["hist", "Histórico", "#treino/historico"], ["cardio", "Cardio", "#treino/cardio"],
];

export function AbasTreino({ atual }: { atual: AbaTreino }) {
  return <nav class="tabs subnav" aria-label="Treino">
    {ABAS.map(([id, nm, h]) => <a key={id} class="chip" href={h} aria-current={id === atual ? "page" : undefined}>{nm}</a>)}</nav>;
}
