// Vida: para onde o app cresce (módulos).
export default function Vida() {
  const mods: [string, string, string, boolean][] = [["Treino", "ativo", "semana flexível, cronômetro, cargas, mídia do aparelho", true], ["Comida", "ativo", "registro por voz, meta adaptativa, proteína", true], ["Corpo", "ativo", "mapa de dor, medidas, peso", true],
    ["Sono e energia", "via check-in", "já coletado todo dia; vira gráfico", true], ["Hábitos", "depois", "água, passos, leitura — sem culpa", false], ["Agenda", "depois", "Google Calendar: encaixa o treino na semana", false],
    ["Finanças", "depois", "gastos, metas, alertas", false], ["Estudos / projetos", "depois", "tarefas e sessões de foco", false], ["Diário", "depois", "1 linha por dia; o Claude resume o mês", false]];
  return <><p class="kicker">Para onde o app cresce</p><h1 style="margin-bottom:6px">Vida em módulos</h1>
    <p class="sub" style="margin-bottom:16px;max-width:640px">Cada área é um módulo com tabelas, ferramentas MCP e um card no “Hoje”. Um único connector; o Claude cruza os dados (ex.: 3 noites ruins → semana de manutenção).</p>
    <div class="modgrid">{mods.map(([n, s, d, on]) => <div key={n} class={`mod ${on ? "on" : ""}`}><div class="row between"><h3>{n}</h3><span class={`badge ${on ? "acc" : ""}`}>{s}</span></div><p class="small sub">{d}</p></div>)}</div></>;
}
