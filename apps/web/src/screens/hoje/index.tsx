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
import { href } from "../../lib/roteador/index.ts";
import { FaixaCheckup, estadoDoCheckup } from "../../lib/faixa-checkup/index.tsx";
import { AvisoFalta } from "../semana/aviso.tsx";
import { garantirSemana, getSemana, getVazio } from "../semana/estado.ts";
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

/** #63 Conta sem treino: o Hoje fica vazio (nada é montado sozinho). "Montar" abre o 1º passo que falta do Perfil de treino
 *  (o mínimo para gerar a semana); "Completar" leva ao Perfil de treino inteiro. */
function ComecoVazio({ falta }: { falta: C.Falta[] }) {
  return <Card cls="hm-vazia hm-comeco"><p class="kicker">Comece por aqui</p><h2 style="margin-top:4px">Seu Hoje está vazio</h2>
    <p class="small sub" style="margin-top:6px">Nenhum treino é montado sem você. Responda o básico e o app monta a sua semana; o resto do Perfil de treino aprofunda depois.</p>
    {falta.length > 0 && <ul class="hm-passos" aria-label="O que falta para o primeiro treino">{falta.map((f) => <li key={f.rotulo}><Icon id="target" /><span class="small">{f.rotulo}</span></li>)}</ul>}
    <a class="btn pri full" href={href("primeiros-passos", [String(C.passoParaMontarTreino(falta))])}>Montar meu primeiro treino<Icon id="arrow" /></a>
    <a class="btn ghost full" style="margin-top:6px" href="#perfil">Completar Perfil de treino</a></Card>;
}

/** #71 Pulou o Perfil de treino: o que falta para o app montar a semana e o caminho de volta. #73: aparece enquanto faltar
 *  algo; "Lembrar depois" esconde por 7 dias (no servidor). */
function CompletePerfil({ falta }: { falta: C.Falta[] }) {
  const primeiro = falta[0]?.passo ? C.PASSOS_PP.indexOf(falta[0].passo) : 0;
  return <Card cls="hm-vazia"><p class="kicker">Perfil de treino</p><h2 style="margin-top:4px">Complete o Perfil de treino</h2>
    <p class="small sub" style="margin-top:6px">Você pulou algumas perguntas. O que já respondeu está salvo; falta pouco para o app montar a sua semana.</p>
    {falta.length > 0 && <ul class="hm-passos">{falta.map((f) => <li key={f.rotulo}><Icon id="target" /><span class="small">{f.rotulo}</span></li>)}</ul>}
    <a class="btn pri full" href={`#primeiros-passos/${Math.max(0, primeiro)}`}>Continuar de onde parei<Icon id="arrow" /></a>
    <button type="button" class="btn ghost full" style="margin-top:6px" onClick={adiarPerfil}>Lembrar depois</button></Card>;
}

/** #63 O Hoje está no começo guiado (sem treino)? A casca esconde a faixa do Diário para não disputar com o CTA. */
export const hojeVazio = () => getVazio() != null || (!!H.view?.vazio && (SERVER ? estadoDoCheckup() : "nunca") === "nunca");
/** Telas em que a casca não mostra a faixa do Diário (check-in/checkout): Perfil de treino e o Hoje vazio. */
export const esconderLembrete = (screen: string) => screen === "primeiros-passos" || (screen === "hoje" && hojeVazio());

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
  // #63 sem treino (o servidor não gerou a semana; demonstração `?demo&vazio`): só o começo guiado, sem treino aleatório
  if (hojeVazio()) return <>{cab}<AvisoFalta /><ComecoVazio falta={C.faltaParaGerar(S.profile)} /></>;
  if (!v) return <>{cab}{topo}{H.erro
    ? <Card><h2>Não deu para carregar</h2><p class="small sub" style="margin-top:4px">Sem conexão ou o servidor não respondeu. Seus registros estão salvos.</p><button type="button" class="btn pri" style="margin-top:10px" onClick={() => void carregarHome(true)}>Tentar de novo</button></Card>
    : <Esqueleto />}</>;
  const sem = <><Descanso /><SemanaCarrossel /></>, obj = <Objetivo view={v} />, lac = <Lacunas gaps={v.gaps} />, com = <ComidaPainel c={v.comida} />, cla = <ClaudeCard />;
  const boas = checkup === "feito" && boasVindasVisivel(v) ? <BoasVindas /> : perfil ? <CompletePerfil falta={falta} /> : null;
  const cam = v.marcos?.length ? <Caminho marcos={v.marcos} /> : null, med = v.medias?.length ? <Medias medias={v.medias} /> : null, ata = <Atalhos view={v} />;
  const paineis = v.vazio ? [] : [<Volume view={v} />, <ForcaPainel view={v} />, <PesoPainel view={v} />, <BracoCintura view={v} />, <PresencaPainel view={v} />, <CardioPainel view={v} />];
  const comp = <Compensa />;
  const col = (xs: ComponentChildren[]) => <div class="stack hm-col">{xs.map((x, i) => <div key={i}>{x}</div>)}</div>;
  const A = [comp, sem, boas, cam, ...(v.vazio ? [] : [obj]), ...paineis.slice(0, 2)], B = [med, ata, lac, com, ...paineis.slice(2), cla];
  return <>{cab}{topo}
    {larga ? <div class="grid dash">{col(A)}{col(B)}</div>
      : col([comp, sem, boas, cam, med, ata, ...(v.vazio ? [] : [obj]), lac, com, ...paineis, cla])}</>;
}
