// #159 Detalhe do treino (#treino/resumo): os gráficos que saíram da Home, com valor escrito em cada barra, meta tracejada com
// legenda e janela curta (4 semanas; 3 meses = 12 semanas é o teto; filtros maiores são da #147). Baixa sob demanda.
// Dado: o mesmo HomeView da Home (servidor: GET /api/home; demonstração: o core sobre dados fictícios).
import { useEffect } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { C, S, calc } from "../../lib/store/index.ts";
import { EXB, mName } from "../../lib/store/regras.ts";
import { Card, Icon, Seg } from "../../lib/ui/index.tsx";
import { Esqueleto, Estado } from "../../lib/estado/index.tsx";
import { href, replace } from "../../lib/roteador/index.ts";
import type { Route } from "../../lib/roteador/index.ts";
import { fmt } from "../../lib/util.ts";
import { H, carregarHome } from "../hoje/estado.ts";
import { ColunasValor, LinhaValor } from "./graficos.tsx";
import "./treino-resumo.css";

const JANELAS: [number, string][] = [[C.DETALHE_SEMANAS.curta, "4 semanas"], [C.DETALHE_SEMANAS.longa, "3 meses"]];
const sinal = (n: number, d = 1) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${fmt(Math.abs(n), d)}`;
const media = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const semDados = <p class="small sub" role="status" style="margin-top:8px">Precisa de mais registros para mostrar este gráfico.</p>;

function Bloco({ titulo, resumo, ctas, children }: { titulo: string; resumo?: ComponentChildren; ctas: [string, string][]; children: ComponentChildren }) {
  return <Card cls="rtd-bloco">
    <div class="row between start wrapx" style="gap:8px"><h2>{titulo}</h2>{resumo}</div>
    {children}
    <div class="hm-ctas">{ctas.map(([t, h], i) => <a key={h} class={`btn sm${i ? " ghost" : ""}`} href={h}>{t}{i > 0 && <Icon id="arrow" />}</a>)}</div>
  </Card>;
}

export default function TreinoResumo({ route }: { route: Route }) {
  useEffect(() => { void carregarHome(true); }, []);
  const n = Number(route.query.j) === C.DETALHE_SEMANAS.longa ? C.DETALHE_SEMANAS.longa : C.DETALHE_SEMANAS.curta;
  const v = H.view;
  const cab = <div style="margin:4px 0 12px"><p class="kicker">Treino</p><h1>Detalhes do treino</h1>
    <p class="small sub" style="margin-top:4px">Semana a semana, de segunda a domingo. A semana atual ainda está em andamento.</p>
    <div style="margin-top:10px"><Seg<number> label="Janela do gráfico" value={n} opts={JANELAS} onPick={(j) => replace(href("treino", ["resumo"], j === C.DETALHE_SEMANAS.curta ? {} : { j: String(j) }))} /></div></div>;
  if (!v) return <>{cab}{H.erro
    ? <Estado tipo="erro" acao={{ label: "Tentar de novo", onClick: () => void carregarHome(true) }}>Sem conexão ou o servidor não respondeu. Seus registros estão salvos.</Estado>
    : <Esqueleto />}</>;
  if (v.vazio) return <>{cab}<Estado tipo="vazio" titulo="Precisa de mais registros" acao={{ label: "Ver o Treino de hoje", href: "#treino" }}>Os gráficos aparecem depois dos primeiros treinos.</Estado></>;

  const s = v.series, semanas = s.semanas.slice(-n);
  const fatia = <T,>(a: T[]) => a.slice(-n);
  return <>{cab}<div class="stack">
    <VolumeBloco view={v} n={n} semanas={semanas} />
    <ForcaBloco view={v} n={n} semanas={semanas} />
    <PresencaBloco sem={fatia(s.presenca.semana)} meta={s.presenca.meta} semanas={semanas} />
    <CardioBloco cardio={fatia(s.cardio)} semanas={semanas} />
  </div></>;
}

function VolumeBloco({ view, n, semanas }: { view: C.HomeView; n: number; semanas: string[] }) {
  const t = C.weeklyTargets(calc().level, S.profile.priorities);
  const pri = S.profile.priorities as string[];
  // prioritários primeiro, na ordem em que a pessoa os escolheu
  const ms = C.MUSCLE_IDS.filter((m) => view.series.volume[m]).sort((a, b) => (pri.indexOf(a) + 1 || 99) - (pri.indexOf(b) + 1 || 99));
  const tem = ms.some((m) => view.series.volume[m]!.slice(-n).some((x) => x > 0));
  return <Bloco titulo="Volume por músculo" resumo={<span class="small sub">séries por semana</span>} ctas={[["Mudar prioridades", "#perfil/prioridades"], ["Ver a semana", "#semana"]]}>
    {!tem ? semDados : ms.map((m) => {
      const vs = view.series.volume[m]!.slice(-n), atual = vs[vs.length - 1], meta = t[m] ?? 0;
      return <div class="rtd-item" key={m}>
        <div class="row between wrapx" style="gap:6px"><span class="small"><b>{mName(m)}</b></span>
          <span class="small num">esta semana <b>{atual}</b> de {meta} séries <span class="sub">· média {fmt(media(vs), 1)}</span></span></div>
        <ColunasValor values={vs} semanas={semanas} label={`${mName(m)}, séries por semana`} unit=" séries" meta={meta} metaTxt={`meta de ${meta} séries por semana`} />
      </div>;
    })}
  </Bloco>;
}

function ForcaBloco({ view, n, semanas }: { view: C.HomeView; n: number; semanas: string[] }) {
  const ex = view.series.e1rm;
  return <Bloco titulo="Força (e1RM)" resumo={<span class="small sub">exercícios-chave</span>} ctas={[["Ver histórico", "#treino/historico"], ["Mudar cargas lembradas", "#perfil/experiencia"]]}>
    {!ex.length ? <p class="small sub" role="status" style="margin-top:8px">Precisa de mais registros: um exercício feito em 2 semanas diferentes mostra a evolução.</p> : ex.map((e) => {
      const vs = e.serie.slice(-n), nn = vs.filter((x): x is number => x != null), nm = EXB[e.exerciseId]?.nm ?? e.exerciseId;
      return <div class="rtd-item" key={e.exerciseId}>
        <div class="row between wrapx" style="gap:6px"><span class="small"><b>{nm}</b></span>
          <span class="small num">{nn.length ? <><b>{fmt(nn[nn.length - 1], 1)} kg</b> <span class="sub">· {nn.length > 1 ? `${sinal(nn[nn.length - 1] - nn[0])} kg em ${n === 4 ? "4 semanas" : "3 meses"}` : "uma semana medida só"}</span></> : <span class="sub">sem registro nesta janela</span>}</span></div>
        {nn.length ? <LinhaValor values={vs} semanas={semanas} label={`${nm}, e1RM`} unit=" kg" /> : semDados}
      </div>;
    })}
    <p class="tiny sub" style="margin-top:8px">e1RM = carga máxima estimada para 1 repetição (Epley). Sobe quando a força sobe.</p>
  </Bloco>;
}

function PresencaBloco({ sem, meta, semanas }: { sem: number[]; meta: number; semanas: string[] }) {
  const atual = sem[sem.length - 1], fechadas = sem.slice(0, -1), noAlvo = fechadas.filter((x) => x >= meta).length;
  return <Bloco titulo="Presença" resumo={<span class="small sub">dias treinados por semana</span>} ctas={[["Mudar dias de treino", "#perfil/rotina"], ["Ver a semana", "#semana"]]}>
    {sem.every((x) => x === 0) ? semDados : <>
      <ColunasValor values={sem} semanas={semanas} label="Dias treinados por semana" unit=" dias" meta={meta} max={meta} metaTxt={`meta de ${meta} ${meta === 1 ? "dia" : "dias"} por semana`} />
      <p class="small num" style="margin-top:6px">Esta semana <b>{atual}</b> de {meta} dias{fechadas.length ? <> · bateu a meta em <b>{noAlvo}</b> de {fechadas.length} {fechadas.length === 1 ? "semana fechada" : "semanas fechadas"}</> : null}</p></>}
  </Bloco>;
}

function CardioBloco({ cardio, semanas }: { cardio: number[]; semanas: string[] }) {
  const total = cardio.reduce((a, b) => a + b, 0), atual = cardio[cardio.length - 1];
  return <Bloco titulo="Cardio" resumo={<span class="small sub">minutos por semana</span>} ctas={[["Registrar cardio", "#treino/cardio"], ["Ver treinos", "#treino/historico"]]}>
    {total === 0 ? <p class="small sub" role="status" style="margin-top:8px">Sem cardio registrado nesta janela. Registre ao terminar: soma na semana.</p> : <>
      <ColunasValor values={cardio} semanas={semanas} label="Minutos de cardio por semana" unit=" min" />
      <p class="small num" style="margin-top:6px">Esta semana <b>{fmt(atual)} min</b> · média <b>{fmt(media(cardio), 0)} min</b> por semana</p></>}
  </Bloco>;
}
