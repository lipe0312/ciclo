// Home "Hoje" de evolução (#29): responde em 5 s "estou indo bem no objetivo? o que não registro? o que faço hoje?".
// #73 Ordem: avisos → treino de hoje (carrossel, sempre no topo) → boas-vindas → caminho de evolução → médias de 7 dias → atalhos →
// objetivo → o que falta registrar → comida → painéis (só com dado) → Chat. Nada de formulário aberto aqui:
// cada card tem um CTA para alterar e outro para ver o detalhe. O lembrete do Diário (check-in/checkout) é a faixa fina do shell.
import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import { C, S, today } from "../../lib/store/index.ts";
import { mName } from "../../lib/store/regras.ts";
import { SERVER } from "../../lib/api/index.ts";
import { Card, Icon } from "../../lib/ui/index.tsx";
import { longDate } from "../../lib/util.ts";
import { FaixaCheckup, estadoDoCheckup } from "../../lib/faixa-checkup/index.tsx";
import { AvisoFalta } from "../semana/aviso.tsx";
import { garantirSemana, getSemana } from "../semana/estado.ts";
import { SemanaCarrossel } from "./carrossel-semana.tsx";
import { ClaudeCard, ComidaPainel } from "./comida-claude.tsx";
import { H, adiarPerfil, boasVindasVisivel, carregarHome, perfilAdiadoEm } from "./estado.ts";
import { Atalhos, BoasVindas, Caminho, Descanso, Medias } from "./inicio.tsx";
import { Lacunas } from "./lacunas.tsx";
import { BracoCintura, CardioPainel, ForcaPainel, Objetivo, PesoPainel, PresencaPainel, Volume } from "./paineis.tsx";
import { AvatarMenu } from "../conta/avatar.tsx";
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

/** #71 Pulou os Primeiros passos: o que falta para o app montar a semana e o caminho de volta. #73: aparece enquanto faltar
 *  algo; "Lembrar depois" esconde por 7 dias (no servidor). */
function CompletePerfil({ falta }: { falta: C.Falta[] }) {
  const primeiro = falta[0]?.passo ? C.PASSOS_PP.indexOf(falta[0].passo) : 0;
  return <Card cls="hm-vazia"><p class="kicker">Primeiros passos</p><h2 style="margin-top:4px">Complete o Perfil de treino</h2>
    <p class="small sub" style="margin-top:6px">Você pulou o checkup. O que já respondeu está salvo; falta pouco para o app montar a sua semana.</p>
    {falta.length > 0 && <ul class="hm-passos">{falta.map((f) => <li key={f.rotulo}><Icon id="target" /><span class="small">{f.rotulo}</span></li>)}</ul>}
    <a class="btn pri full" href={`#primeiros-passos/${Math.max(0, primeiro)}`}>Continuar de onde parei<Icon id="arrow" /></a>
    <button type="button" class="btn ghost full" style="margin-top:6px" onClick={adiarPerfil}>Lembrar depois</button></Card>;
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
  const cab = <div class="row between" style="margin-bottom:14px"><div><p class="kicker">{longDate(today)}{SERVER ? "" : " · demonstração"}</p><h1>Hoje</h1></div><AvatarMenu /></div>;
  const checkup = SERVER ? estadoDoCheckup() : "nunca";
  // quem pulou o checkup vê o "Complete o perfil" (adiável) no lugar da faixa, enquanto faltar algo
  const falta = checkup === "pulado" ? C.faltaParaGerar(S.profile) : [];
  const perfil = v && C.cartaoCompletePerfil({ falta: falta.length, adiadoEm: perfilAdiadoEm(v), hoje: today }) === "mostrar";
  const topo = <>{!falta.length && <FaixaCheckup />}<AvisoFalta /></>;
  if (!v) return <>{cab}{topo}{H.erro
    ? <Card><h2>Não deu para carregar</h2><p class="small sub" style="margin-top:4px">Sem conexão ou o servidor não respondeu. Seus registros estão salvos.</p><button type="button" class="btn pri" style="margin-top:10px" onClick={() => void carregarHome(true)}>Tentar de novo</button></Card>
    : <Esqueleto />}</>;
  // conta sem nada e sem checkup (demonstração `?demo&vazio`): só o "Comece"
  if (v.vazio && checkup === "nunca") return <>{cab}{topo}<Vazia /></>;
  const sem = <><Descanso /><SemanaCarrossel /></>, obj = <Objetivo view={v} />, lac = <Lacunas gaps={v.gaps} />, com = <ComidaPainel c={v.comida} />, cla = <ClaudeCard />;
  const boas = checkup === "feito" && boasVindasVisivel(v) ? <BoasVindas /> : perfil ? <CompletePerfil falta={falta} /> : null;
  const cam = v.marcos?.length ? <Caminho marcos={v.marcos} /> : null, med = v.medias?.length ? <Medias medias={v.medias} /> : null, ata = <Atalhos view={v} />;
  const paineis = v.vazio ? [] : [<Volume view={v} />, <ForcaPainel view={v} />, <PesoPainel view={v} />, <BracoCintura view={v} />, <PresencaPainel view={v} />, <CardioPainel view={v} />];
  const comp = <Compensa />;
  const col = (xs: ComponentChildren[]) => <div class="stack hm-col">{xs.map((x, i) => <div key={i}>{x}</div>)}</div>;
  // #77 médias na coluna larga: na estreita os 3 cartões ficavam apertados, com o texto em 5 linhas
  const A = [comp, sem, boas, cam, med, ...(v.vazio ? [] : [obj]), ...paineis.slice(0, 2)], B = [ata, lac, com, ...paineis.slice(2), cla];
  return <>{cab}{topo}
    {larga ? <div class="grid dash">{col(A)}{col(B)}</div>
      : col([comp, sem, boas, cam, med, ata, ...(v.vazio ? [] : [obj]), lac, com, ...paineis, cla])}</>;
}
