// Comida: registro por voz/texto, meta adaptativa e proteína. (O motor de voz é outra issue: lib/voz.)
import { useState } from "preact/hooks";
import { S, commit, today } from "../../lib/store/index.ts";
import { addFood, foodTotals } from "../../lib/store/regras.ts";
import { Card, Icon, toast } from "../../lib/ui/index.tsx";
import { BarraSimples } from "../../lib/grafico/index.tsx";
import { Mic } from "../../lib/voz/index.tsx";
import { fmt } from "../../lib/util.ts";

export default function Comida() {
  const d = S.profile.diet, t = foodTotals(today);
  const days = new Set(S.food.map((f) => f.date)).size;
  const [status, setStatus] = useState("");
  const draft = S.ui.foodDraft ?? "";
  const send = () => { const v = S.ui.foodDraft.trim(); if (!v) return toast("Fale ou escreva o que comeu"); addFood(v); S.ui.foodDraft = ""; commit(); toast("Registrado · o Claude confere"); };
  return <><p class="kicker">Dieta flexível · modo {d.mode}</p><h1 style="margin-bottom:14px">Comida</h1>
    <div class="grid g3"><Card><p class="kicker">Meta adaptativa</p><p class="big num" style="margin-top:6px">{fmt(d.kcal)}</p><p class="small sub">kcal/dia · ajusta até ±150/sem pelo peso</p></Card>
      <Card><p class="kicker">Proteína (fixa)</p><p class="big num" style="margin-top:6px">{d.protein} g</p><p class="small sub">a única meta “rígida”</p></Card>
      <Card><p class="kicker">Dias com registro</p><p class="big num" style="margin-top:6px">{days}</p><p class="small sub">tudo bem faltar; média semanal é o que conta</p></Card></div>
    <div class="grid g2" style="margin-top:12px"><Card><h2>O que você comeu?</h2>
      <p class="small sub" style="margin:4px 0 12px">Fale como falaria. {S.features.ai ? "Transcrição com Whisper (servidor)." : "Transcrição pelo navegador; com o servidor ligado, usa Whisper."}</p>
      <div class="row start" style="gap:10px"><Mic value={draft} onChange={(v) => { S.ui.foodDraft = v; commit(); }} label="Gravar o que comeu" onStatus={setStatus} />
        <textarea class="input" rows={3} aria-label="O que você comeu" placeholder="café: 3 ovos e 2 pães · almoço: arroz, feijão e frango" value={draft} onInput={(e) => { S.ui.foodDraft = e.currentTarget.value; }} onBlur={() => commit()} /></div>
      <p class="tiny sub" role="status" style="margin-top:6px">{status}</p>
      <div class="row wrapx" style="margin-top:10px;gap:8px"><button type="button" class="btn pri sm" onClick={send}><Icon id="send" />Registrar</button>
        <button type="button" class="btn sm" onClick={() => { addFood(S.profile.diet.typical || "dia típico"); commit(); toast("Dia normal registrado"); }}>Dia normal (igual ao típico)</button></div>
      <hr />{S.food.filter((f) => f.date === today).map((f) => <div key={f.id} class="row between small" style="padding:4px 0"><span>{f.text}</span><span class="sub num">~{fmt(f.kcal)} kcal · {fmt(f.prot)} g</span></div>)}
      {!S.food.some((f) => f.date === today) && <p class="small sub">Nada registrado hoje.</p>}</Card>
      <Card><h2>Hoje até agora</h2>
        <div class="vol num" style="margin-top:12px"><span>Calorias</span><BarraSimples pct={(t.kcal / d.kcal) * 100} /><span>{fmt(t.kcal)}</span></div>
        <div class="vol num"><span>Proteína</span><BarraSimples pct={(t.prot / d.protein) * 100} color="var(--acc)" /><span>{fmt(t.prot)} g</span></div><hr />
        <p class="small">{t.prot >= d.protein ? <b>Proteína batida. O resto é livre.</b> : <><b>Faltam ~{fmt(d.protein - t.prot)} g de proteína.</b> Ex.: 150 g de frango (~45 g) + 1 whey (~24 g).</>}</p>
        <p class="tiny sub" style="margin-top:8px">Estimativa rápida no aparelho; o Claude (Haiku) confere com a TACO quando processa.</p></Card></div></>;
}
