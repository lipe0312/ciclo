// Volta depois de dias sem abrir: formulário único dos dias faltantes (foi treinar? álcool? dormiu bem? algo diferente?)
// ou "contar ao Claude por voz" (vira pedido na caixa; o Claude grava com ciclo_registrar_resumo_dias e o app mostra "confira").
import { useState } from "preact/hooks";
import { today } from "../../lib/store/index.ts";
import { send } from "../../lib/api/index.ts";
import { Card, Icon, Seg, Stepper, toast } from "../../lib/ui/index.tsx";
import { Mic } from "../../lib/voz/index.tsx";
import { addDays, longDate } from "../../lib/util.ts";
import { go } from "../../lib/roteador/index.ts";
import { D, dismissAbsence, saveResumo } from "../../lib/diario/estado.ts";
import type { DiaResumo } from "../../lib/diario/estado.ts";

const SIMNAO: [boolean, string][] = [[true, "sim"], [false, "não"]];
function diasDe(a: { from: string; to: string }) { const out: string[] = []; for (let d = a.from; d <= a.to && out.length < 14; d = addDays(d, 1)) out.push(d); return out; }

export function Resumo() {
  const a = D.reminder.absence;
  const [dias, setDias] = useState<DiaResumo[]>(() => (a ? diasDe(a) : []).map((date) => ({ date, trained: D.checkouts[date]?.trained ?? null, alcohol: D.checkouts[date]?.alcohol ?? null, sleptWell: null, note: "" })));
  const [voz, setVoz] = useState(false), [relato, setRelato] = useState(""), [busy, setBusy] = useState(false);
  if (!a || !dias.length) return <Card><h2>Nada para resumir</h2><p class="small sub" style="margin-top:6px">Você não ficou dias sem abrir o app. Para preencher um dia antigo, toque nele no calendário.</p>
    <a class="btn full" style="margin-top:12px" href="#diario"><Icon id="back" />Voltar ao Diário</a></Card>;
  const up = (i: number, p: Partial<DiaResumo>) => setDias(dias.map((d, k) => (k === i ? { ...d, ...p } : d)));
  const n = Math.round((Date.parse(today) - Date.parse(a.from)) / 864e5) + 1;
  async function salvar() {
    setBusy(true);
    try { await saveResumo(dias); toast("Resumo salvo · aparece no calendário"); go("#diario"); } catch { /* erro já avisado */ } finally { setBusy(false); }
  }
  async function contar() {
    const t = relato.trim(); if (!t) return toast("Conte como foram os dias");
    setBusy(true);
    try { await send("POST", "/api/inbox", { text: `[resumo dos dias ${a!.from} a ${a!.to}] ${t}`.slice(0, 2000), tier: "haiku" }); dismissAbsence(); toast("Enviado ao Claude · ele registra e você confere"); go("#diario"); }
    catch { /* erro já avisado */ } finally { setBusy(false); }
  }
  return <div class="stack">
    <Card cls="hl"><p class="kicker">Faz {n} dias</p><h2 style="margin-top:2px">Quer resumir os dias sem abrir?</h2>
      <p class="small sub" style="margin-top:4px">Um formulário só, de {longDate(a.from)} a {longDate(a.to)}. Pule o que não lembrar.</p>
      <div class="row wrapx" style="gap:8px;margin-top:12px">
        <button type="button" class="btn" aria-pressed={voz} onClick={() => setVoz(!voz)}><Icon id="mic" />Contar ao Claude por voz</button>
        <button type="button" class="btn ghost" onClick={() => { dismissAbsence(); go("#diario"); }}>Agora não</button></div></Card>
    {voz ? <Card><label class="f" for="rsRelato">Como foram esses dias?</label>
      <div class="row start" style="gap:8px"><textarea class="input" id="rsRelato" maxLength={1900} placeholder="Ex.: terça treinei, quarta tomei 3 cervejas, dormi mal na quinta…" value={relato} onInput={(e) => setRelato(e.currentTarget.value)} />
        <Mic value={relato} onChange={(v) => setRelato(v.slice(0, 1900))} label="Ditar o relato" /></div>
      <p class="tiny sub" style="margin-top:6px">O Claude transforma o relato em registros; eles aparecem no calendário com “confira”.</p>
      <button type="button" class="btn pri full" style="margin-top:12px" disabled={busy} onClick={contar}><Icon id="send" />Enviar ao Claude</button></Card>
    : <Card>{dias.map((d, i) => <div class="rs-dia" key={d.date}><h3>{longDate(d.date)}</h3>
        <div class="ckrow"><span class="small">Foi treinar?</span><Seg opts={SIMNAO} value={d.trained} label={`Treinou em ${longDate(d.date)}?`} onPick={(v) => up(i, { trained: v })} /></div>
        <div class="ckrow"><span class="small">Álcool</span><span class="row" style="gap:8px"><Stepper value={d.alcohol ?? 0} step={1} onStep={(s) => up(i, { alcohol: Math.min(30, Math.max(0, (d.alcohol ?? 0) + s)) })} /><span class="tiny sub">doses</span></span></div>
        <div class="ckrow"><span class="small">Dormiu bem?</span><Seg opts={SIMNAO} value={d.sleptWell} label={`Dormiu bem em ${longDate(d.date)}?`} onPick={(v) => up(i, { sleptWell: v })} /></div>
        <div class="ckrow"><label class="small" for={`rs-${d.date}`}>Algo diferente?</label><input class="input" id={`rs-${d.date}`} maxLength={500} placeholder="opcional" value={d.note} onInput={(e) => up(i, { note: e.currentTarget.value })} /></div>
      </div>)}
      <button type="button" class="btn pri full" style="margin-top:14px" disabled={busy} onClick={salvar}><Icon id="check" />Salvar resumo</button></Card>}
  </div>;
}
