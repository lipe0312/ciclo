// Cartões de evolução da Home (#29): objetivo com metas e ritmo, e (#159) peso e medidas em versão resumida.
// Os gráficos de volume, e1RM, presença e cardio moram em #treino/resumo (screens/treino-resumo), que baixa sob demanda.
// O valor SEMPRE vem escrito e a cor nunca é o único sinal.
import type { ComponentChildren } from "preact";
import { C, S } from "../../lib/store/index.ts";
import { Card, Icon } from "../../lib/ui/index.tsx";
import { Linha } from "../../lib/grafico/index.tsx";
import { fmt } from "../../lib/util.ts";

const sinal = (n: number, d = 1) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${fmt(Math.abs(n), d)}`;
const ult = <T,>(a: T[]) => a[a.length - 1];

export function Ritmo({ r }: { r: C.Ritmo }) {
  return <span class={`badge ${r === "atras" ? "warn" : r === "sem_dados" ? "" : "ok"}`}>{r === "a_frente" ? <Icon id="spark" /> : null}{C.RITMO_TXT[r]}</span>;
}

/** Cartão de painel: título, valor-resumo, conteúdo e as duas CTAs (alterar / ver detalhe). */
export function Painel({ titulo, resumo, alterar, detalhe, children }: {
  titulo: string; resumo?: ComponentChildren; alterar: [string, string]; detalhe: [string, string]; children: ComponentChildren;
}) {
  return <Card cls="hm-painel">
    <div class="row between start wrapx" style="gap:8px"><h2>{titulo}</h2>{resumo}</div>
    {children}
    <div class="hm-ctas"><a class="btn sm" href={alterar[1]}>{alterar[0]}</a><a class="btn sm ghost" href={detalhe[1]}>{detalhe[0]}<Icon id="arrow" /></a></div>
  </Card>;
}

// ---------- objetivo ----------
function valorMeta(m: C.MetaCard) {
  if (m.id === "freq") return <><b>{m.atual == null ? "—" : `${m.atual}%`}</b> / {m.alvo}%</>;
  if (m.atual == null || m.feito == null) return <span class="sub">sem dados</span>;
  if (m.alvo === 0) return <><b>{sinal(m.feito)}</b> {m.unidade} <span class="sub">· manter (±1)</span></>;
  return <><b>{sinal(m.feito)}</b> / {sinal(m.alvo)} {m.unidade}</>;
}
export function Objetivo({ view }: { view: C.HomeView }) {
  const g = S.profile.goal, h = g.horizonWeeks, sem = view.metas[0].inicio != null ? view.metas[0].semana : 1;
  return <Card cls="hm-painel"><div class="row start"><Icon id="target" style="color:var(--acc);margin-top:3px" /><div style="flex:1;min-width:0">
    <p class="kicker">Objetivo · semana {Math.min(sem, h)} de {h}</p><p class="hm-objetivo">{g.statement}</p>
    <div class="hm-metas">{view.metas.map((m) => <div key={m.id} class="hm-meta">
      <div class="row between" style="gap:6px"><p class="tiny sub">{m.nome}</p><Ritmo r={m.ritmo} /></div>
      <p class="num hm-meta-v">{valorMeta(m)}</p>
      {m.serie.length > 1 ? <Linha values={m.serie} label={`${m.nome}, últimas semanas`} unit={` ${m.unidade}`} /> : <p class="tiny sub">precisa de mais registros</p>}
    </div>)}</div>
    <div class="hm-ctas"><a class="btn sm" href="#perfil/objetivo">Alterar objetivo</a><a class="btn sm ghost" href="#corpo">Ver medidas<Icon id="arrow" /></a></div>
  </div></div></Card>;
}

// ---------- peso e medidas (resumo: número + diferença; o detalhe está em #corpo) ----------
const JANELA_PESO = C.PAINEL_SEMANAS;
function difPalavras(d: number, un: string, quando: string) {
  if (Math.abs(d) < 0.05) return `estável ${quando}`;
  return `${d > 0 ? "subiu" : "desceu"} ${fmt(Math.abs(d), 1)} ${un} ${quando}`;
}
export function MedidasResumo({ view }: { view: C.HomeView }) {
  const p = view.series.peso, serie = p.serie.slice(-JANELA_PESO).filter((v): v is number => v != null);
  const linha = (nome: string, valor: string | null, dif: string) => <div class="rt-medida" key={nome}>
    <span class="small"><b>{nome}</b></span>
    <span class="small num">{valor == null ? <span class="sub">precisa de mais registros</span> : <><b>{valor}</b> <span class="sub">· {dif}</span></>}</span></div>;
  const med = (nome: string, pts: { value: number }[]) => linha(nome, pts.length ? `${fmt(ult(pts).value, 1)} cm` : null,
    pts.length > 1 ? difPalavras(ult(pts).value - pts[0].value, "cm", `desde a 1ª medida (${pts.length})`) : "uma medida só até agora");
  return <Card cls="hm-painel">
    <div class="row between start wrapx" style="gap:8px"><h2>Peso e medidas</h2><span class="small sub">resumo</span></div>
    {linha("Peso", p.ultimo != null ? `${fmt(p.ultimo, 1)} kg` : null, serie.length > 1 ? difPalavras(ult(serie) - serie[0], "kg", `em ${serie.length} semanas com pesagem`) : "uma pesagem só até agora")}
    {med("Braço", view.series.braco)}
    {med("Cintura", view.series.cintura)}
    <div class="hm-ctas"><a class="btn sm" href="#corpo">Ver medidas<Icon id="arrow" /></a></div>
  </Card>;
}
