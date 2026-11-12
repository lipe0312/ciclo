// Checkout da noite, em TODOS os dias (com ou sem academia): treinou, cardio/passos, água, álcool, fumo, cafeína tarde, humor e nota.
import { useState } from "preact/hooks";
import { C, S, today } from "../../lib/store/index.ts";
import { Card, Icon, Seg, Stepper, toast } from "../../lib/ui/index.tsx";
import { Mic } from "../../lib/voz/index.tsx";
import { fmt, longDate } from "../../lib/util.ts";
import { D, emptyCheckout, saveCheckout } from "../../lib/diario/estado.ts";
import type { Checkout } from "../../lib/diario/estado.ts";

const SIMNAO: [boolean, string][] = [[false, "não"], [true, "sim"]];
const HUMOR: [number, string][] = [[1, "ruim"], [2, "baixo"], [3, "ok"], [4, "bom"], [5, "ótimo"]];
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export function CheckoutCard() {
  const d = D.sel;
  const saved = D.checkouts[d];
  const [draft, setDraft] = useState<Checkout | null>(null); // null = sem edição: mostra o salvo
  const c = draft?.date === d ? draft : saved ?? emptyCheckout(d); // trocou o dia no calendário → descarta o rascunho
  const set = (p: Partial<Checkout>) => setDraft({ ...c, ...p });
  const setCardio = (p: Partial<NonNullable<Checkout["cardio"]>>) => { const n = { ...(c.cardio ?? {}), ...p }; set({ cardio: n.type || n.steps != null ? n : null }); };
  const ses = S.week.sessions.find((s: any) => s.date === d);
  const trained = ses ? true : c.trained;
  function save() {
    if (c.cardio?.type && !c.cardio.minutes) return toast("Diga os minutos do cardio");
    saveCheckout({ ...c, trained, cardio: c.cardio?.type ? { ...c.cardio, minutes: c.cardio.minutes ?? 20 } : c.cardio });
    setDraft(null);
    toast(c.cardio?.type ? "Checkout salvo · cardio somado na semana" : "Checkout salvo");
  }
  const water = (c.waterMl ?? 0) / 1000;
  return <Card id="checkout">
    <div class="row between wrapx"><div><p class="kicker">Checkout da noite · {d === today ? "hoje" : longDate(d)}</p><h2 style="margin-top:2px">Como foi o dia?</h2></div>
      {saved && <span class="badge ok"><Icon id="check" />feito</span>}</div>
    {saved?.source === "claude" && <p class="small dia-confira" style="margin-top:8px"><Icon id="info" />Preenchido pelo Claude a partir do seu relato · confira</p>}
    <div class="dia-campos">
      <div class="ckrow"><span class="small">Treinou?</span>{ses ? <span class="small"><b>{ses.name ?? "treino"}</b> <span class="sub">· sessão do dia</span></span>
        : <Seg opts={SIMNAO} value={c.trained} label="Treinou?" onPick={(v) => set({ trained: v })} />}</div>
      <div><span class="f">Cardio ou atividade</span>
        <div class="row wrapx" style="gap:8px">
          <select class="input dia-sel" aria-label="Tipo de cardio" value={c.cardio?.type ?? ""} onChange={(e) => setCardio({ type: e.currentTarget.value || undefined })}>
            <option value="">nenhum</option>{C.CARDIO.map((x) => <option key={x.id} value={x.id}>{x.nm}</option>)}</select>
          {c.cardio?.type && <Stepper value={c.cardio.minutes ?? 20} step={5} unit=" min" onStep={(s) => setCardio({ minutes: clamp((c.cardio?.minutes ?? 20) + s, 5, 300) })} />}</div>
        <label class="f" for="coSteps" style="margin-top:8px">Passos (opcional)</label>
        <input class="input num" id="coSteps" key={`st-${d}`} inputMode="numeric" placeholder="ex.: 8000" style="max-width:160px" defaultValue={c.cardio?.steps ?? ""}
          onChange={(e) => { const n = parseInt(e.currentTarget.value.replace(/\D/g, ""), 10); setCardio({ steps: Number.isFinite(n) ? clamp(n, 0, 100000) : undefined }); }} /></div>
      <div class="ckrow"><span class="small">Água</span><span class="row" style="gap:8px"><Stepper value={water} step={0.25} unit=" L" onStep={(s) => set({ waterMl: Math.round(clamp(water + s, 0, 10) * 1000) })} />
        <span class="tiny sub num">{fmt(Math.round(water / 0.25))} copos</span></span></div>
      <div class="ckrow"><span class="small">Álcool</span><span class="row" style="gap:8px"><Stepper value={c.alcohol ?? 0} step={1} onStep={(s) => set({ alcohol: clamp((c.alcohol ?? 0) + s, 0, 30) })} /><span class="tiny sub">doses</span></span></div>
      <div class="ckrow"><span class="small">Fumo / vape</span><Seg opts={SIMNAO} value={c.smoke} label="Fumo ou vape" onPick={(v) => set({ smoke: v, smokeQty: v ? c.smokeQty ?? 1 : null })} /></div>
      {c.smoke && <div class="ckrow"><span class="small">Quantos?</span><Stepper value={c.smokeQty ?? 1} step={1} onStep={(s) => set({ smokeQty: clamp((c.smokeQty ?? 1) + s, 1, 100) })} /></div>}
      <div class="ckrow"><span class="small">Cafeína após 16h</span><Seg opts={SIMNAO} value={c.caffeineLate} label="Cafeína depois das 16h" onPick={(v) => set({ caffeineLate: v })} /></div>
      <div><span class="f" id="coHumor">Humor</span><Seg cls="dia-humor" opts={HUMOR} value={c.mood} label="Humor" onPick={(v) => set({ mood: v })} /></div>
      <div><label class="f" for="coNote">Nota livre</label>
        <div class="row start" style="gap:8px"><textarea class="input" id="coNote" maxLength={1000} placeholder="Algo diferente hoje? (texto ou voz)" value={c.note ?? ""} onInput={(e) => set({ note: e.currentTarget.value || null })} />
          <Mic value={c.note ?? ""} onChange={(v) => set({ note: v.slice(0, 1000) || null })} label="Ditar nota" /></div></div>
    </div>
    <button type="button" class="btn pri full" style="margin-top:14px" onClick={save}><Icon id="check" />{saved ? "Atualizar checkout" : "Salvar checkout"}</button>
  </Card>;
}
