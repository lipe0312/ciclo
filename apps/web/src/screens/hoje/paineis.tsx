// Painéis de evolução da Home (#29): objetivo com metas e ritmo, volume por músculo, e1RM, peso, braço × cintura,
// presença e cardio. SVG próprio (lib/grafico); o valor SEMPRE vem escrito e a cor nunca é o único sinal.
// Cada painel tem 2 CTAs: um para alterar e um para ver o detalhe.
import type { ComponentChildren } from "preact";
import { C, S } from "../../lib/store/index.ts";
import { EXB, mName } from "../../lib/store/regras.ts";
import { Card, Icon } from "../../lib/ui/index.tsx";
import { Colunas, Linha } from "../../lib/grafico/index.tsx";
import { fmt } from "../../lib/util.ts";

const sinal = (n: number, d = 1) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${fmt(Math.abs(n), d)}`;
const ult = <T,>(a: T[]) => a[a.length - 1];
const PAINEL = C.PAINEL_SEMANAS;
const ultimas = <T,>(a: T[]) => a.slice(-PAINEL);
const media = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const semDados = (t: string) => <p class="small sub" style="margin-top:8px">{t}</p>;

export function Ritmo({ r }: { r: C.Ritmo }) {
  return <span class={`badge ${r === "atras" ? "warn" : r === "sem_dados" ? "" : "ok"}`}>{r === "a_frente" ? <Icon id="spark" /> : null}{C.RITMO_TXT[r]}</span>;
}

/** Cartão de painel: título, valor-resumo, gráfico e as duas CTAs (alterar / ver detalhe). */
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

// ---------- volume ----------
export function Volume({ view }: { view: C.HomeView }) {
  const t = C.weeklyTargets(S.profile.level, S.profile.priorities);
  const ms = C.MUSCLE_IDS.filter((m) => view.series.volume[m]);
  const tem = ms.some((m) => view.series.volume[m]!.some((n) => n > 0));
  return <Painel titulo="Volume por músculo" resumo={<span class="small sub">últimas {PAINEL} semanas</span>} alterar={["Mudar prioridades", "#perfil/prioridades"]} detalhe={["Ver a semana", "#semana"]}>
    {!tem ? semDados("Os músculos prioritários aparecem aqui depois dos primeiros treinos.") : ms.map((m) => {
      const v = ultimas(view.series.volume[m]!), atual = ult(v), meta = t[m] ?? 0;
      return <div class="hm-linha" key={m}>
        <div class="row between wrapx" style="gap:6px"><span class="small"><b>{mName(m)}</b></span><span class="small num">esta semana <b>{atual}</b> / {meta} séries <span class="sub">· média {fmt(media(v), 1)}</span></span></div>
        <Colunas values={v} label={`${mName(m)}, séries por semana`} meta={meta} />
      </div>;
    })}
    <p class="tiny sub" style="margin-top:8px">Tracejado = meta semanal de séries. Verde = semana em andamento.</p>
  </Painel>;
}

// ---------- e1RM ----------
export function ForcaPainel({ view }: { view: C.HomeView }) {
  const ex = view.series.e1rm;
  return <Painel titulo="Força (e1RM)" resumo={<span class="small sub">exercícios-chave</span>} alterar={["Mudar cargas lembradas", "#perfil/experiencia"]} detalhe={["Ver histórico", "#treino/historico"]}>
    {!ex.length ? semDados("Precisa de um exercício feito em 2 semanas diferentes para mostrar a evolução.") : ex.map((e) => <div class="hm-linha" key={e.exerciseId}>
      <div class="row between wrapx" style="gap:6px"><span class="small"><b>{EXB[e.exerciseId]?.nm ?? e.exerciseId}</b></span>
        <span class="small num"><b>{fmt(e.atual, 1)} kg</b> <span style={e.delta < 0 ? "color:var(--warn)" : "color:var(--ok)"}>{sinal(e.delta)} kg</span></span></div>
      <Linha values={ultimas(e.serie).filter((v): v is number => v != null)} label={`${EXB[e.exerciseId]?.nm ?? e.exerciseId}, e1RM`} unit=" kg" />
    </div>)}
    <p class="tiny sub" style="margin-top:8px">e1RM = carga máxima estimada para 1 repetição (Epley). Sobe quando a força sobe.</p>
  </Painel>;
}

// ---------- peso ----------
export function PesoPainel({ view }: { view: C.HomeView }) {
  const p = view.series.peso, serie = ultimas(p.serie).filter((v): v is number => v != null);
  const txt = p.trend.perWeek == null ? "tendência precisa de mais pesagens" : `${sinal(p.trend.perWeek, 2)} kg/semana`;
  return <Painel titulo="Peso em tendência" resumo={p.ultimo != null ? <span class="num"><b>{fmt(p.ultimo, 1)}</b> <span class="small sub">kg</span></span> : undefined} alterar={["Registrar peso", "#diario"]} detalhe={["Ver medidas", "#corpo"]}>
    {serie.length < 2 ? semDados("Pese-se no check-in da manhã: com 2 semanas de dados a linha aparece.") : <><Linha values={serie} label="Peso semanal" unit=" kg" /><p class="small num" style="margin-top:4px">{txt}</p></>}
  </Painel>;
}

// ---------- braço × cintura ----------
export function BracoCintura({ view }: { view: C.HomeView }) {
  const b = view.series.braco, c = view.series.cintura;
  const linha = (nome: string, pts: { value: number }[]) => <div class="hm-linha" key={nome}>
    <div class="row between wrapx" style="gap:6px"><span class="small"><b>{nome}</b></span>
      <span class="small num">{pts.length ? <><b>{fmt(ult(pts).value, 1)} cm</b> {pts.length > 1 && <span class="sub">({sinal(ult(pts).value - pts[0].value)} desde {pts.length} medidas)</span>}</> : "sem medidas"}</span></div>
    {pts.length > 1 && <Linha values={pts.map((p) => p.value)} label={`${nome}, medidas`} unit=" cm" />}</div>;
  return <Painel titulo="Braço × cintura" resumo={<span class="small sub">o que importa</span>} alterar={["Medir agora", "#corpo"]} detalhe={["Ver metas", "#perfil/objetivo"]}>
    {!b.length && !c.length ? semDados("Meça braço e cintura a cada 15 dias: o braço sobe e a cintura fica parada.") : <>{linha("Braço", b)}{linha("Cintura", c)}</>}
  </Painel>;
}

// ---------- presença e aderência ----------
export function PresencaPainel({ view }: { view: C.HomeView }) {
  const p = view.series.presenca, sem = ultimas(p.semana), ad = ultimas(p.aderencia);
  const fechadas = ad.slice(0, -1), metaPct = S.profile.goal.metrics.aderenciaPct;
  const med = fechadas.length ? Math.round(media(fechadas)) : null;
  return <Painel titulo="Presença e aderência" resumo={med != null ? <span class="num"><b>{med}%</b> <span class="small sub">média</span></span> : undefined} alterar={["Mudar dias de treino", "#perfil/rotina"]} detalhe={["Ver a semana", "#semana"]}>
    {sem.every((n) => n === 0) ? semDados("Cada treino iniciado conta como presença. Os números aparecem depois do primeiro.") : <>
      <Colunas values={sem} label="Dias treinados por semana" meta={p.meta} max={p.meta} />
      <p class="small num" style="margin-top:4px">Esta semana <b>{ult(sem)}</b> de {p.meta} dias · {med != null ? <>aderência das semanas fechadas <b>{med}%</b> (meta {metaPct}%)</> : "aderência depois da 1ª semana fechada"}</p></>}
  </Painel>;
}

// ---------- cardio ----------
export function CardioPainel({ view }: { view: C.HomeView }) {
  const v = ultimas(view.series.cardio), total = v.reduce((a, b) => a + b, 0);
  return <Painel titulo="Cardio por semana" resumo={<span class="small sub num">minutos</span>} alterar={["Registrar cardio", "#treino/cardio"]} detalhe={["Ver treinos", "#treino/historico"]}>
    {total === 0 ? semDados("Sem cardio registrado nestas semanas. Registre ao terminar: soma na semana.") : <>
      <Colunas values={v} label="Minutos de cardio por semana" unit=" min" />
      <p class="small num" style="margin-top:4px">Esta semana <b>{ult(v)} min</b> · média <b>{fmt(media(v), 0)} min</b>/semana</p></>}
  </Painel>;
}
