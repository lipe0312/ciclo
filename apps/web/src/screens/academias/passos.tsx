// Cadastro de um lugar em passos curtos (estilo quiz): nome e tipo → mapa → aparelhos → horários que lota → dias da semana.
// Componente reutilizável: a tela Academias usa para criar e editar; os Primeiros passos podem montar o mesmo (`PassoAPasso`).
import { useState } from "preact/hooks";
import { C } from "../../lib/store/index.ts";
import type { Gym } from "../../lib/store/index.ts";
import { Chip, Icon, Seg, toast } from "../../lib/ui/index.tsx";
import { EQ_CATS, GradeAparelhos } from "../../lib/grade-aparelhos/index.tsx";
import { DOW, DOW_NM } from "../../lib/util.ts";
import { S } from "../../lib/store/index.ts";
import { kindNm, lugarDoDia, rascunhoDe, salvarLugar } from "../../lib/lugares/index.ts";
import type { LugarRascunho } from "../../lib/lugares/index.ts";
import { SeletorDeLocal } from "./mapa.tsx";
import "./academias.css";

const PRESET: Record<C.PlaceKind, string[]> = { academia: [], casa: ["halteres", "elastico", "barrafixa"], hotel: [] };
const nomePadrao = (k: C.PlaceKind) => (k === "academia" ? `Academia ${S.gyms.filter((g) => (g.kind ?? "academia") === "academia").length + 1}` : kindNm(k));

export interface PassoProps {
  /** Lugar a editar; ausente = lugar novo. */
  inicial?: Gym | null;
  onDone: (g: Gym) => void;
  onCancel?: () => void;
}

export function PassoAPasso({ inicial, onDone, onCancel }: PassoProps) {
  const editar = !!inicial;
  const [i, setI] = useState(0), [busy, setBusy] = useState(false), [cat, setCat] = useState("todos");
  const [d, setD] = useState<LugarRascunho>(() => { const r = rascunhoDe(inicial ?? undefined); return editar ? r : { ...r, name: nomePadrao(r.kind) }; });
  const [auto, setAuto] = useState(!editar); // nome ainda é o sugerido (muda junto com o tipo)
  const set = (p: Partial<LugarRascunho>) => setD((x) => ({ ...x, ...p }));
  const id = inicial?.id ?? null;

  const PASSOS = [
    { id: "nome", title: "Como se chama o lugar?", sub: "Pode ser a academia, a sua casa ou um hotel de viagem.", ok: d.name.trim().length > 0 && d.name.trim().length <= C.PLACE_NAME_MAX, Tela: () => <>
      <span class="f">Tipo</span>
      <Seg opts={C.PLACE_KINDS.map((k) => [k, kindNm(k)] as [C.PlaceKind, string])} value={d.kind} label="Tipo do lugar" onPick={(k) => {
        set({ kind: k, ...(auto ? { name: nomePadrao(k) } : {}), ...(editar ? {} : { equipment: [...PRESET[k]] }) });
      }} />
      <div style="margin-top:18px"><label class="f" for="lug-nome">Nome</label>
        <input id="lug-nome" class="input" value={d.name} maxLength={C.PLACE_NAME_MAX} autocomplete="off" onInput={(e) => { setAuto(false); set({ name: e.currentTarget.value }); }} />
        <p class="tiny sub" style="margin-top:4px">{d.name.length} de {C.PLACE_NAME_MAX} letras</p></div></> },
    { id: "mapa", title: "Onde fica?", sub: "Busque o endereço, use onde você está agora ou toque no mapa. Dá para pular.", ok: true, Tela: () =>
      <SeletorDeLocal ponto={d.lat != null && d.lng != null ? { lat: d.lat, lng: d.lng } : null} endereco={d.address ?? ""}
        onChange={(p, end) => set({ lat: p?.lat ?? null, lng: p?.lng ?? null, address: end || null })} /> },
    { id: "aparelhos", title: "O que tem aí?", sub: d.kind === "hotel" ? "Hotel começa vazio: marque só o que você viu." : "Toque nos aparelhos que existem. “Academia completa” marca tudo.", ok: true, Tela: () => <>
      <div class="row wrapx" style="gap:10px"><span class="badge num">{d.equipment.length} de {C.EQUIPMENT.length}</span>
        <button type="button" class="btn sm" onClick={() => set({ equipment: C.EQUIPMENT.map((e) => e.id) })}>Academia completa</button>
        <button type="button" class="btn sm" onClick={() => set({ equipment: [] })}>Limpar</button></div>
      <div class="chips" style="margin:12px 0">{EQ_CATS.filter(([k]) => k === "todos" || C.EQUIPMENT.some((e) => e.cat === k)).map(([k, n]) => <Chip key={k} on={cat === k} onClick={() => setCat(k)}>{n}</Chip>)}</div>
      <GradeAparelhos selected={d.equipment} cat={cat} onToggle={(e) => set({ equipment: d.equipment.includes(e) ? d.equipment.filter((x) => x !== e) : [...d.equipment, e] })} /></> },
    { id: "lota", soAcademia: true, title: "Quando costuma lotar?", sub: "O app evita aparelhos disputados nesses horários. Se não sabe, pule.", ok: true, Tela: () => <>
      <div class="chips">{C.BUSY_SLOTS.map((h) => <Chip key={h} on={d.busyHours.includes(h)} onClick={() => set({ busyHours: d.busyHours.includes(h) ? d.busyHours.filter((x) => x !== h) : [...d.busyHours, h] })}>{h.replace("-", "–")}h</Chip>)}</div>
      <p class="small sub" style="margin-top:10px">{d.busyHours.length ? "Marcado: " + d.busyHours.map((h) => h.replace("-", "–") + "h").join(", ") : "Nenhum horário marcado."}</p></> },
    { id: "dias", title: "Em quais dias você vai lá?", sub: "É o lugar padrão desses dias. Cada dia tem um lugar só; dá para trocar no dia.", ok: true, Tela: () => {
      const outros = DOW.map((x, k) => ({ x, k, de: d.weekdays.includes(x as C.Dow) ? lugarDoDia(x, id ?? undefined) : null })).filter((o) => o.de);
      return <>
        <div class="chips">{DOW.map((x, k) => <button type="button" key={x} class="chip tall" aria-pressed={d.weekdays.includes(x as C.Dow)} onClick={() => set({ weekdays: C.DOWS.filter((w) => (w === x ? !d.weekdays.includes(w) : d.weekdays.includes(w))) })}>{DOW_NM[k]}</button>)}</div>
        {outros.length > 0 && <div class="note" style="margin-top:12px"><Icon id="info" /><span>{outros.map((o) => `${DOW_NM[o.k]} era de ${o.de!.name}`).join("; ")}. Ao salvar, passa a ser deste lugar.</span></div>}
        {!d.weekdays.length && <p class="small sub" style="margin-top:10px">Nenhum dia marcado: o lugar fica disponível para escolher no dia.</p>}</>;
    } },
  ].filter((p) => !(p as { soAcademia?: boolean }).soAcademia || d.kind === "academia");

  const step = Math.min(i, PASSOS.length - 1), P = PASSOS[step], Tela = P.Tela, ultimo = step === PASSOS.length - 1;
  const pct = Math.round(((step + 1) / PASSOS.length) * 100);
  const salvar = async () => {
    setBusy(true);
    try { const g = await salvarLugar(id, d); toast(editar ? "Lugar atualizado" : "Lugar criado"); onDone(g); }
    catch (e: any) { toast(e?.message || "Não consegui salvar"); }
    finally { setBusy(false); }
  };
  return <div class="pp lug-pp">
    <div class="pp-top"><button type="button" class="btn" onClick={() => (step === 0 ? onCancel?.() : setI(step - 1))}><Icon id="back" />{step === 0 ? "Cancelar" : "Voltar"}</button>
      <span class="small sub num" aria-hidden="true">{step + 1} de {PASSOS.length}</span>
      {editar ? <button type="button" class="btn ghost" disabled={busy || !PASSOS[0].ok} onClick={salvar}>Salvar agora</button> : <span />}</div>
    <div class="pp-bar" role="progressbar" aria-label="Progresso do cadastro" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><i style={`width:${pct}%`} /></div>
    <h1 class="pp-q">{P.title}</h1><p class="sub pp-sub">{P.sub}</p>
    <div class="pp-body"><Tela /></div>
    <div class="pp-cta">{ultimo
      ? <button type="button" class="btn pri lg full" disabled={busy || !P.ok} onClick={salvar}><Icon id="check" />{busy ? "Salvando…" : editar ? "Salvar alterações" : "Salvar lugar"}</button>
      : <button type="button" class="btn pri lg full" disabled={!P.ok} onClick={() => setI(step + 1)}>{P.id === "mapa" && d.lat == null ? "Pular" : "Continuar"}<Icon id="arrow" /></button>}
      {!P.ok && <p class="tiny sub" style="text-align:center;margin-top:6px">Dê um nome ao lugar (até {C.PLACE_NAME_MAX} letras).</p>}</div>
  </div>;
}
