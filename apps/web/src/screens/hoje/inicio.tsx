// #73 Hoje como home: cartão de boas-vindas que some sozinho, "Hoje é descanso", caminho de evolução, médias de 7 dias com
// barras que crescem ao entrar na tela e os 6 atalhos. As regras ficam no core (home-inicio.ts); aqui só desenha.
import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import * as C from "@ciclo/core";
import { S, today } from "../../lib/store/index.ts";
import { Card, Icon } from "../../lib/ui/index.tsx";
import { DOW_NM, dowIdx, fmt } from "../../lib/util.ts";
import { getSemana } from "../semana/estado.ts";
import { dispensarBoasVindas } from "./estado.ts";

const semMovimento = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const diaCurto = (iso: string) => `${DOW_NM[dowIdx(iso)]} ${Number(iso.slice(8, 10))}`;
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** Sai com fade e colapso de altura (≤ 250 ms; sem movimento quando o sistema pede) e só então avisa. */
function Saida({ children, sair }: { children: (fechar: () => void) => ComponentChildren; sair: () => void }) {
  const [fora, set] = useState(false);
  const fechar = () => { if (fora) return; set(true); setTimeout(sair, semMovimento() ? 0 : 240); };
  return <div class={`hm-sai${fora ? " fora" : ""}`}><div>{children(fechar)}</div></div>;
}

/** #71/#73 Checkup feito: a semana já existe. Some no 1º treino, em 3 dias ou no ✕ (regra: cartaoBoasVindas). */
export const BoasVindas = () => <Saida sair={dispensarBoasVindas}>{(fechar) =>
  <Card cls="hm-vazia hm-bv"><div class="row between start" style="gap:8px">
    <div style="min-width:0"><p class="kicker">Primeiros passos feitos</p><h2 style="margin-top:4px">Sua semana está pronta</h2></div>
    <button type="button" class="btn ghost hm-x" aria-label="Dispensar o cartão de boas-vindas" onClick={fechar}><Icon id="x" /></button></div>
    <p class="small sub" style="margin-top:6px">Os gráficos da sua evolução aparecem aqui depois do 1º treino.</p>
    <a class="btn full" style="margin-top:12px" href="#treino">Ver o treino de hoje<Icon id="arrow" /></a></Card>}</Saida>;

/** Sem treino hoje: uma linha com o próximo dia de treino (a regra é do core). */
export function Descanso() {
  const s = getSemana();
  if (!s) return null;
  const dias = s.days.map((d) => ({ date: d.date, kind: d.kind, status: d.status, temPlano: !!d.plan }));
  const { hojeTreino, proximo } = C.proximoTreino(dias, today);
  if (hojeTreino) return null;
  const feito = s.days.find((d) => d.date === today)?.status === "feito";
  return <p class="hm-descanso small" role="status"><Icon id={feito ? "check" : "moon"} />
    <span>{feito ? "Treino de hoje feito" : "Hoje é descanso"} · {proximo ? <>próximo: <b>{diaCurto(proximo)}</b></> : "sem mais treinos nesta semana"}</span></p>;
}

/** Caminho de evolução: linha do tempo horizontal, marcos feitos com data, o próximo destacado e cada pendente leva à tela certa. */
export function Caminho({ marcos }: { marcos: C.Marco[] }) {
  const trilho = useRef<HTMLOListElement>(null);
  const prox = marcos.find((m) => m.proximo), feitos = marcos.filter((m) => m.feito).length;
  useEffect(() => { // deixa o próximo marco à vista sem rolar a página
    const ol = trilho.current, li = ol?.querySelector<HTMLElement>(".prox");
    if (ol && li) ol.scrollLeft = Math.max(0, li.offsetLeft - ol.clientWidth / 2 + li.clientWidth / 2);
  }, [prox?.id]);
  return <Card cls="hm-caminho">
    <div class="row between wrapx" style="gap:8px"><h2>O caminho até aqui</h2><span class="small sub num">{feitos} de {marcos.length}</span></div>
    <ol class="hm-marcos" ref={trilho} tabIndex={0} aria-label="Marcos da sua evolução">
      {marcos.map((m) => {
        const corpo = <><span class="hm-ponto" aria-hidden="true">{m.feito ? <Icon id="check" /> : null}</span>
          <span class="hm-marco-t">{m.texto}</span>
          <span class="tiny sub num">{m.feito ? ddmm(m.data!) : m.progresso ?? (m.proximo ? "próximo" : "a fazer")}</span>
          {!m.feito && !m.proximo && <span class="tiny hm-marco-cta">{m.cta}</span>}</>;
        return <li key={m.id} class={`${m.feito ? "feito" : ""}${m.proximo ? " prox" : ""}`}>
          {m.feito ? <div class="hm-marco"><span class="sr">Feito: </span>{corpo}</div>
            : m.proximo ? <div class="hm-marco"><span class="sr">Próximo marco: </span>{corpo}</div>
            : <a class="hm-marco" href={m.href}>{corpo}</a>}</li>;
      })}
    </ol>
    {prox ? <a class="btn full" style="margin-top:12px" href={prox.href}>{prox.cta}<Icon id="arrow" /></a>
      : <p class="small sub" style="margin-top:10px">Todos os marcos feitos. Agora é manter o ritmo.</p>}
  </Card>;
}

/** Adiciona `.vis` quando o elemento entra na tela (as barras crescem por CSS; sem observador, já entra visível). */
function useVisivel<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [vis, set] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver !== "function") { set(true); return; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { set(true); io.disconnect(); } }, { threshold: 0.3 });
    io.observe(el); return () => io.disconnect();
  }, []);
  return [ref, vis] as const;
}

const VALOR: Record<C.MediaId, (n: number) => string> = { prot: (n) => fmt(n, 0), agua: (n) => fmt(n, 1), sono: (n) => fmt(n, 1) };
const UN: Record<C.MediaId, string> = { prot: "g", agua: "L", sono: "h" };

function Media({ m }: { m: C.MediaCard }) {
  if (m.media == null) return <div class="hm-media vazio">
    <p class="kicker">{m.nome}</p><p class="small sub" style="margin-top:6px">{m.vazio.texto}</p>
    <a class="btn sm" style="margin-top:auto" href={m.vazio.href}>{m.vazio.cta}</a></div>;
  const v = VALOR[m.id], vals = m.dias.map((d) => d.v ?? 0), teto = Math.max(m.meta ?? 0, ...vals) || 1;
  const dif = m.anterior == null ? null : m.media - m.anterior;
  const desc = m.dias.map((d) => `${diaCurto(d.date)}: ${d.v == null ? "sem registro" : `${v(d.v)} ${UN[m.id]}`}`).join(", ");
  return <div class="hm-media">
    <p class="kicker">{m.nome}</p>
    <p class="hm-media-v num"><span class="hm-media-n">{v(m.media)}</span> <span class="small sub">{m.unidade}</span></p>
    {m.meta != null && <p class="tiny sub num">meta {v(m.meta)} {UN[m.id]}</p>}
    <div class="hm-barras" role="img" aria-label={`${m.nome} nos últimos 7 dias. ${desc}`}>
      {m.meta != null && <span class="hm-meta-l" style={`bottom:${Math.round((m.meta / teto) * 100)}%`} />}
      {m.dias.map((d, i) => <span key={d.date} class={`hm-b${d.v == null ? " nada" : ""}${d.date === today ? " hoje" : ""}`}
        style={`--h:${d.v == null ? 4 : Math.max(6, Math.round((d.v / teto) * 100))};--i:${i}`} />)}
    </div>
    <p class="tiny sub num hm-vs">{m.variacao == null || dif == null ? "sem dado da semana passada"
      : m.variacao === "igual" ? "= igual à semana passada" : `${m.variacao === "sobe" ? "↑" : "↓"} ${v(Math.abs(dif))} ${UN[m.id]} vs. semana passada`}</p>
  </div>;
}

/** Proteína, água e sono: média de 7 dias com barras animadas (scroll com snap no celular, 3 lado a lado no largo). */
export function Medias({ medias }: { medias: C.MediaCard[] }) {
  const [ref, vis] = useVisivel<HTMLDivElement>();
  if (medias.every((m) => m.media == null)) return <section class="hm-medias-s" aria-labelledby="hm-medias-t">
    <Card cls="hm-medias-vazia"><h2 id="hm-medias-t">Médias da semana</h2>
      <p class="small sub" style="margin-top:4px">Registre comida, água e sono para ver suas médias.</p>
      <div class="hm-medias-links">{medias.map((m) => <a key={m.id} class="btn" href={m.vazio.href}>{m.vazio.cta}</a>)}</div></Card></section>;
  return <section class="hm-medias-s" aria-labelledby="hm-medias-t">
    <div class="row between wrapx" style="gap:8px;margin-bottom:8px"><h2 id="hm-medias-t">Médias da semana</h2><span class="small sub">últimos 7 dias</span></div>
    <div ref={ref} class={`hm-medias${vis ? " vis" : ""}`} tabIndex={0} role="group" aria-label="Proteína, água e sono">
      {medias.map((m) => <Media key={m.id} m={m} />)}</div>
  </section>;
}

/** "Um pouco de tudo": 6 atalhos (2×3), cada um com um micro-status. */
export function Atalhos({ view }: { view: C.HomeView }) {
  const s = getSemana();
  const itens = C.atalhosHome({
    hoje: today, semana: s ? { feitos: s.days.filter((d) => d.status === "feito").length, treinos: s.days.filter((d) => d.kind !== "folga").length } : null,
    ultimaMedida: view.ultimaMedida ?? null, diasComida: view.comida.daysLogged, checkinHoje: !!view.checkinHoje, academias: S.gyms.length,
  });
  return <section aria-labelledby="hm-atalhos-t"><h2 id="hm-atalhos-t" style="margin-bottom:8px">Um pouco de tudo</h2>
    <ul class="hm-atalhos">{itens.map((a) => <li key={a.id}><a class="hm-atalho" href={a.href}><Icon id={a.icone} />
      <span class="hm-atalho-t"><b>{a.nome}</b><span class="tiny sub">{a.status}</span></span></a></li>)}</ul></section>;
}
