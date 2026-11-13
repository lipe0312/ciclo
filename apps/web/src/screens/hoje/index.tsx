// Home "Hoje" de evolução (#29): responde em 5 s "estou indo bem no objetivo? o que não registro? o que faço hoje?".
// Ordem: avisos → semana (carrossel) → objetivo → o que falta registrar → comida → painéis → Claude. Nada de formulário aberto aqui:
// cada card tem um CTA para alterar e outro para ver o detalhe. O lembrete do Diário (check-in/checkout) é a faixa fina do shell.
import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import { today } from "../../lib/store/index.ts";
import { mName } from "../../lib/store/regras.ts";
import { SERVER } from "../../lib/api/index.ts";
import { Card, Icon } from "../../lib/ui/index.tsx";
import { longDate } from "../../lib/util.ts";
import { FaixaCheckup } from "../../lib/faixa-checkup/index.tsx";
import { AvisoFalta } from "../semana/aviso.tsx";
import { garantirSemana, getSemana } from "../semana/estado.ts";
import { SemanaCarrossel } from "./carrossel-semana.tsx";
import { ClaudeCard, ComidaPainel } from "./comida-claude.tsx";
import { H, carregarHome } from "./estado.ts";
import { Lacunas } from "./lacunas.tsx";
import { BracoCintura, CardioPainel, ForcaPainel, Objetivo, PesoPainel, PresencaPainel, Volume } from "./paineis.tsx";
import "./hoje.css";

/** Sobrou só hoje? Quem decide é a regra da semana (core). A oferta é um aviso com CTA, não um formulário. */
function Compensa() {
  const sw = getSemana();
  if (sw) {
    const o = sw.offer; if (!o || o.date !== today) return null;
    return <Card cls="hl"><div class="row start"><Icon id="info" style="color:var(--acc);margin-top:2px" /><div style="flex:1">
      <h3>Só sobrou hoje?</h3><p class="small sub" style="margin-top:4px">{o.muscles.map(mName).slice(0, 4).join(", ")} ficam sem o 2º estímulo. Sem compensatório, {o.outWithout} séries ficam de fora; com ele, {o.outWith}.</p>
      <a class="btn pri" style="margin-top:10px" href="#semana">Ver as opções</a></div></div></Card>;
  }
  return null;
}

/** Conta sem dados: didática, leva aos Primeiros passos. */
function Vazia() {
  const passos: [string, string][] = [["target", "Diga seu objetivo e seus dias: o plano da semana nasce daí."], ["dumb", "Faça o 1º treino: cada série vira gráfico aqui."], ["body", "Meça braço e cintura a cada 15 dias."], ["food", "Registre o que come: proteína e calorias entram na média."]];
  return <Card cls="hm-vazia"><p class="kicker">Bem-vindo</p><h2 style="margin-top:4px">Sua Home ainda está vazia</h2>
    <p class="small sub" style="margin-top:6px">Ela mostra a sua evolução e o que falta registrar. Em poucos minutos você já vê o primeiro gráfico.</p>
    <ul class="hm-passos">{passos.map(([i, t]) => <li key={t}><Icon id={i} /><span class="small">{t}</span></li>)}</ul>
    <a class="btn pri full" href="#primeiros-passos">Começar pelos Primeiros passos<Icon id="arrow" /></a></Card>;
}

const Esqueleto = () => <div class="stack" aria-busy="true" aria-label="Carregando a Home"><div class="hm-esq" style="height:210px" /><div class="hm-esq" style="height:150px" /><div class="hm-esq" style="height:130px" /></div>;

/** Em tela larga, duas colunas independentes (sem buracos de linha); no celular, uma só, na ordem de importância. */
function useLarga() {
  const [w, set] = useState(() => matchMedia("(min-width:1100px)").matches);
  useEffect(() => { const m = matchMedia("(min-width:1100px)"), f = () => set(m.matches); m.addEventListener("change", f); return () => m.removeEventListener("change", f); }, []);
  return w;
}

export default function Hoje() {
  useEffect(() => { void garantirSemana(); void carregarHome(true); }, []);
  const larga = useLarga();
  const v = H.view;
  const cab = <div class="row between wrapx" style="margin-bottom:14px"><div><p class="kicker">{longDate(today)}{SERVER ? "" : " · demonstração"}</p><h1>Hoje</h1></div></div>;
  const topo = <><FaixaCheckup /><AvisoFalta /></>;
  if (!v) return <>{cab}{topo}{H.erro
    ? <Card><h2>Não deu para carregar</h2><p class="small sub" style="margin-top:4px">Sem conexão ou o servidor não respondeu. Seus registros estão salvos.</p><button type="button" class="btn pri" style="margin-top:10px" onClick={() => void carregarHome(true)}>Tentar de novo</button></Card>
    : <Esqueleto />}</>;
  const sem = <SemanaCarrossel />, obj = <Objetivo view={v} />, lac = <Lacunas gaps={v.gaps} />, com = <ComidaPainel c={v.comida} />, cla = <ClaudeCard />;
  const paineis = v.vazio ? [] : [<Volume view={v} />, <ForcaPainel view={v} />, <PesoPainel view={v} />, <BracoCintura view={v} />, <PresencaPainel view={v} />, <CardioPainel view={v} />];
  const comp = <Compensa />;
  const col = (xs: ComponentChildren[]) => <div class="stack hm-col">{xs.map((x, i) => <div key={i}>{x}</div>)}</div>;
  const A = [comp, sem, ...(v.vazio ? [] : [obj]), ...paineis.slice(0, 2)], B = [lac, com, ...paineis.slice(2), cla];
  return <>{cab}{topo}{v.vazio && <div style="margin-bottom:12px"><Vazia /></div>}
    {larga ? <div class="grid dash">{col(A)}{col(B)}</div>
      : col([comp, sem, ...(v.vazio ? [] : [obj]), lac, com, ...paineis, cla])}</>;
}
