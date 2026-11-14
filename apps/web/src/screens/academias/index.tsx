// Academias (Mais → Academias): lugares onde você treina (academia, casa, hotel), cada um com tipo, endereço e ponto no mapa;
// criar/editar pelo passo a passo, apagar com confirmação (reatribuindo os dias) e a página de cada aparelho com a sua mídia.
// Rotas: #academias · #academias/novo · #academias/<id> · #academias/<id>/editar · #academias/<id>/aparelho/<aparelho>
import { C, S, commit } from "../../lib/store/index.ts";
import type { Gym } from "../../lib/store/index.ts";
import { Icon, toast } from "../../lib/ui/index.tsx";
import { go, href } from "../../lib/roteador/index.ts";
import type { Route } from "../../lib/roteador/index.ts";
import { closeSheet, openSheet, SheetHead } from "../../lib/folha/index.tsx";
import { DOW_NM, img } from "../../lib/util.ts";
import { FotoAparelho } from "../../lib/grade-aparelhos/index.tsx";
import { apagarLugar, diasDoLugar, kindNm, midiaDoAparelho } from "../../lib/lugares/index.ts";
import { PassoAPasso } from "./passos.tsx";
import { AssistenteAcademias } from "./assistente.tsx";
import { assistenteVisto } from "../../lib/mini-assistente/index.tsx";
import { Mapa, linkMapa } from "./mapa.tsx";
import { PaginaAparelho } from "./aparelho.tsx";
import "./academias.css";
import { Estado } from "../../lib/estado/index.tsx";

export { PassoAPasso } from "./passos.tsx";

const dias = (id: string) => diasDoLugar(id).map((d) => DOW_NM[C.DOWS.indexOf(d)]).join(", ");

// ---------- apagar (com confirmação e reatribuição de dias) ----------
let destino: string | null = null, apagando = false;
function Apagar({ g }: { g: Gym }) {
  const dd = diasDoLugar(g.id), outros = S.gyms.filter((x) => x.id !== g.id), n = S.gymMedia.filter((m) => m.gymId === g.id).length;
  const falta = dd.length > 0 && outros.length > 0 && !destino;
  return <>
    <SheetHead kicker="Apagar lugar" title={`Apagar ${g.name}?`} />
    <p class="small" style="margin:10px 0">{n ? `As ${n} mídia(s) deste lugar vão para a lixeira e somem de vez em 30 dias.` : "Este lugar não tem mídia guardada."} Os treinos já feitos continuam no histórico.</p>
    {dd.length > 0 && (outros.length
      ? <fieldset class="lug-dest"><legend class="f">Você vai nestes dias: {dias(g.id)}. Para qual lugar mudar?</legend>
        {outros.map((o) => <label key={o.id} class="lug-radio"><input type="radio" name="destino" checked={destino === o.id} onChange={() => { destino = o.id; commit(); }} /><span>{o.name}<span class="tiny sub"> · {kindNm(o.kind)}</span></span></label>)}</fieldset>
      : <div class="note warn"><Icon id="warn" /><span>Não há outro lugar: os dias ({dias(g.id)}) ficam sem lugar padrão.</span></div>)}
    <div class="row wrapx" style="gap:8px;margin-top:16px">
      <button type="button" class="btn danger" disabled={falta || apagando} onClick={async () => {
        apagando = true; commit();
        try { await apagarLugar(g.id, dd.length ? destino : null); closeSheet(); toast("Lugar apagado"); go(href("academias")); }
        catch (e: any) { toast(e?.message || "Não consegui apagar"); }
        finally { apagando = false; commit(); }
      }}><Icon id="x" />{apagando ? "Apagando…" : "Apagar"}</button>
      <button type="button" class="btn" onClick={closeSheet}>Cancelar</button></div>
    {falta && <p class="tiny sub" style="margin-top:8px">Escolha para qual lugar os dias vão.</p>}
  </>;
}
const abrirApagar = (g: Gym) => { destino = null; apagando = false; openSheet(() => <Apagar g={g} />); };

// ---------- lista ----------
function Lista() {
  return <>
    <div class="row between start"><div><p class="kicker">Onde você treina</p><h1 style="margin-bottom:14px">Academias</h1></div>
      <a class="btn pri" href={href("academias", ["novo"])}><Icon id="plus" />Novo lugar</a></div>
    {S.gyms.length === 0 && <div class="note"><Icon id="gym" /><span>Nenhum lugar ainda. Cadastre onde você treina para o app montar o treino com os aparelhos certos.</span></div>}
    <ul class="lug-lista" aria-label="Seus lugares">{S.gyms.map((g) => {
      const ponto = g.lat != null && g.lng != null ? { lat: g.lat, lng: g.lng } : null, d = dias(g.id);
      return <li key={g.id} class="lug-card">
        <a class="lug-card-main" href={href("academias", [g.id])}>
          <span class="n"><Icon id="gym" /></span>
          <span class="lug-card-t"><b>{g.name}</b><span class="tiny sub">{kindNm(g.kind)} · {g.equipment.length} aparelho(s){d ? ` · ${d}` : ""}</span>
            <span class="tiny sub">{g.address || (ponto ? "Ponto marcado no mapa" : "Sem endereço")}</span></span>
          <Icon id="arrow" /></a>
        {ponto && <a class="btn sm ghost" href={linkMapa(ponto)} target="_blank" rel="noopener noreferrer" aria-label={`Abrir ${g.name} no mapa (nova aba)`}><Icon id="target" />Mapa</a>}
      </li>;
    })}</ul>
  </>;
}

// ---------- página do lugar ----------
function Lugar({ g }: { g: Gym }) {
  const ponto = g.lat != null && g.lng != null ? { lat: g.lat, lng: g.lng } : null, d = dias(g.id);
  const eqs = C.EQUIPMENT.filter((e) => g.equipment.includes(e.id));
  return <>
    <div class="row" style="margin-bottom:10px;justify-content:flex-end">
      <div class="row" style="gap:8px"><a class="btn sm" href={href("academias", [g.id, "editar"])}><Icon id="edit" />Editar</a>
        <button type="button" class="btn sm danger" onClick={() => abrirApagar(g)}><Icon id="x" />Apagar</button></div></div>
    <p class="kicker">{kindNm(g.kind)}</p><h1 style="margin:2px 0 4px">{g.name}</h1>
    <p class="sub">{g.address || "Sem endereço"}</p>
    <div class="grid dash" style="margin-top:14px"><div class="stack">
      <div class="card"><h2>No mapa</h2>
        {ponto ? <><div style="margin-top:10px"><Mapa ponto={ponto} rotulo={`Mapa com a localização de ${g.name}`} /></div>
          <a class="btn sm" style="margin-top:10px" href={linkMapa(ponto)} target="_blank" rel="noopener noreferrer"><Icon id="target" />Abrir no OpenStreetMap</a></>
          : <p class="small sub" style="margin-top:6px">Sem ponto marcado. <a class="link44" href={href("academias", [g.id, "editar"])}>Marcar no mapa</a></p>}</div>
      <div class="card"><h2>Rotina</h2>
        <dl class="refs"><div><dt>Dias</dt><dd>{d || "—"}</dd></div><div><dt>Lota</dt><dd>{g.busyHours.length ? g.busyHours.map((h) => h.replace("-", "–") + "h").join(", ") : "—"}</dd></div></dl></div>
    </div><div class="stack">
      <div class="card"><h2>Aparelhos <span class="badge num">{eqs.length}</span></h2>
        <p class="small sub" style="margin:4px 0 10px">Toque em um aparelho para ver os exercícios e guardar a mídia da sua regulagem.</p>
        {eqs.length ? <ul class="lug-aps">{eqs.map((e) => { const n = midiaDoAparelho(g.id, e.id).length; return <li key={e.id}>
          <a class="lug-ap" href={href("academias", [g.id, "aparelho", e.id])}><FotoAparelho src={img(e.img)} w={64} h={48} />
            <span><b>{e.nm}</b>{n > 0 && <span class="tiny sub"> · {n} mídia(s)</span>}</span><Icon id="arrow" /></a></li>; })}</ul>
          : <p class="small sub">Nenhum aparelho marcado. <a class="link44" href={href("academias", [g.id, "editar"])}>Marcar aparelhos</a></p>}</div>
    </div></div></>;
}

export default function Academias({ route }: { route?: Route }) {
  const [a, b, c] = route?.parts ?? [];
  if (a === "novo") return <PassoAPasso key="novo" onDone={(g) => go(href("academias", [g.id]))} onCancel={() => go(href("academias"))} />;
  if (a) {
    const g = S.gyms.find((x) => x.id === a);
    if (!g) return <Estado tipo="vazio" titulo="Lugar não encontrado" acao={{ label: "Ver lugares", href: href("academias") }} />;
    if (b === "editar") return <PassoAPasso key={g.id} inicial={g} onDone={() => go(href("academias", [g.id]))} onCancel={() => go(href("academias", [g.id]))} />;
    if (b === "aparelho" && c) return <PaginaAparelho gym={g} eqId={c} />;
    return <Lugar g={g} />;
  }
  // 1ª vez: mini-assistente (#41); "Fazer manual" marca como visto e mostra a lista de sempre
  if (!assistenteVisto("academias")) return <AssistenteAcademias onManual={commit} />;
  return <Lista />;
}
