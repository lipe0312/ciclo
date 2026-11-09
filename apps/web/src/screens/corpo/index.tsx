// Corpo: mapa de dor (frente/costas) que ajusta o treino, medidas e peso.
import { C, S, commit, today } from "../../lib/store/index.ts";
import { EXB, activePlan, addPain } from "../../lib/store/regras.ts";
import { send } from "../../lib/api/index.ts";
import { SheetHead, closeSheet, openSheet } from "../../lib/folha/index.tsx";
import { Card, Chip, Icon, Seg, toast } from "../../lib/ui/index.tsx";
import { Linha } from "../../lib/grafico/index.tsx";
import { DOW_NM, dowIdx, fmt } from "../../lib/util.ts";

const HOT: Record<string, Record<string, [number, number]>> = { // frente: esquerda da pessoa aparece à direita
  frente: { ombro_d: [34, 50], ombro_e: [86, 50], cotovelo_d: [24, 98], cotovelo_e: [96, 98], punho_d: [19, 138], punho_e: [101, 138], quadril_d: [48, 128], quadril_e: [72, 128], joelho_d: [49, 186], joelho_e: [71, 186], tornozelo_d: [49, 238], tornozelo_e: [71, 238] },
  costas: { cervical: [60, 36], escapula_e: [45, 66], escapula_d: [75, 66], lombar: [60, 112] },
};
function BodySvg({ v }: { v: string }) {
  const pains = Object.fromEntries(S.pains.map((p) => [p.region, p.intensity]));
  return <svg viewBox="0 0 120 256" role="group" aria-label={`Corpo ${v}`}>
    <circle class="sil" cx="60" cy="18" r="12" /><path class="sil" d="M40 38 Q60 32 80 38 L87 50 L82 118 Q60 126 38 118 L33 50 Z" />
    <path class="sil" d="M33 48 L23 98 L16 140 L23 143 L31 101 L40 60 Z" /><path class="sil" d="M87 48 L97 98 L104 140 L97 143 L89 101 L80 60 Z" />
    <path class="sil" d="M39 118 L43 196 L44 246 L54 246 L56 196 L60 128 Z" /><path class="sil" d="M81 118 L77 196 L76 246 L66 246 L64 196 L60 128 Z" />
    {Object.entries(HOT[v]).map(([id, [x, y]]) => <circle key={id} class={`hot ${pains[id] ? "p" + pains[id] : ""}`} cx={x} cy={y} r={id === "lombar" ? 11 : 8} tabIndex={0} role="button" aria-label={C.REGION_BY_ID[id].nm}
      onClick={() => painSheet(id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); painSheet(id); } }} />)}
    {v === "frente" ? <><text x="14" y="30">D</text><text x="106" y="30">E</text></> : <><text x="14" y="30">E</text><text x="106" y="30">D</text></>}
  </svg>;
}
function painEffects(p: any) {
  const blocked = C.EXERCISES.filter((e) => C.painBlocks(e, [p])).map((e) => e.nm);
  const pre = (C.PREHAB[C.REGION_BY_ID[p.region]?.joint as C.Joint] ?? []).map((id) => EXB[id]?.nm).filter(Boolean);
  return { blocked, pre };
}

function painSheet(region: string) {
  const cur = S.pains.find((p) => p.region === region);
  const d = { intensity: cur?.intensity ?? 2, kind: cur?.kind ?? "muscular", when: "durante exercício", ex: "", note: "" };
  openSheet(() => <PainForm region={region} d={d} />);
}
function PainForm({ region, d }: { region: string; d: any }) {
  const plan = activePlan();
  const pick = (k: string, v: any) => { d[k] = v; commit(); };
  const save = () => { addPain({ region, intensity: Number(d.intensity), kind: d.kind, context: [d.when, d.ex, d.note.trim()].filter(Boolean).join(" · ").slice(0, 300) }); closeSheet(); commit(); toast("Dor registrada · treino ajustado"); };
  return <><SheetHead kicker="Mapa de dor" title={C.REGION_BY_ID[region].nm} />
    <div class="stack" style="margin-top:12px">
      <div><span class="f">Intensidade</span><Seg opts={[[1, "leve"], [2, "média"], [3, "forte"]]} value={d.intensity} onPick={(v) => pick("intensity", v)} label="Intensidade" /></div>
      <div><span class="f">Tipo</span><div class="chips">{["articular", "muscular", "pontada", "formigamento", "cansaço"].map((k) => <Chip key={k} on={d.kind === k} onClick={() => pick("kind", k)}>{k}</Chip>)}</div></div>
      <div><span class="f">Quando</span><div class="chips">{["sempre", "durante exercício", "depois do treino", "ao acordar"].map((k) => <Chip key={k} on={d.when === k} onClick={() => pick("when", k)}>{k}</Chip>)}</div></div>
      <div><label class="f" for="painEx">Em qual exercício? (opcional)</label><select class="input" id="painEx" value={d.ex} onChange={(e) => { d.ex = e.currentTarget.value; }}><option value="">—</option>{plan.items.map((i) => <option key={i.exerciseId}>{i.nm}</option>)}</select></div>
      <div><label class="f" for="painNote">Nota</label><input class="input" id="painNote" maxLength={200} placeholder="ex.: pontada ao puxar no remo" onInput={(e) => { d.note = e.currentTarget.value; }} /></div>
      <button type="button" class="btn pri full" onClick={save}>Salvar e ajustar treino</button></div></>;
}

function saveMeasure() {
  const n = (id: string) => parseFloat(((document.getElementById(id) as HTMLInputElement).value || "").replace(",", "."));
  const braco = n("mBraco"), cintura = n("mCintura"); if (!Number.isFinite(braco) || !Number.isFinite(cintura)) return toast("Preencha braço e cintura");
  S.measures = S.measures.filter((m) => m.date !== today).concat({ date: today, braco, cintura }); commit(); toast("Medidas salvas");
  send("PUT", `/api/measurements/${today}`, { armCm: braco, waistCm: cintura }).catch(() => {});
}

export default function Corpo() {
  const ms = S.measures, last = ms[ms.length - 1];
  const ws = Object.entries(S.week.checkins).filter(([, c]: any) => c.weightKg).map(([d, c]: any) => [d, c.weightKg] as [string, number]);
  return <><p class="kicker">Corpo</p><h1 style="margin-bottom:14px">Mapa de dor e medidas</h1>
    <div class="grid dash"><div class="stack"><Card><div class="row between wrapx"><h2>Onde dói?</h2>
      <Seg opts={[["frente", "Frente"], ["costas", "Costas"]]} value={S.ui.bodyView} onPick={(v) => { S.ui.bodyView = v; commit(); }} label="Vista" /></div>
      <p class="small sub" style="margin:4px 0 12px">Toque na região. Ex.: escápula esquerda, ombro direito, lombar. A dor muda o treino na hora: tira o que força a região e coloca fortalecimento no aquecimento.</p>
      <div class="bodymap"><BodySvg v={S.ui.bodyView} /></div>
      <div class="legend" style="justify-content:center;margin-top:10px"><span><i class="sw" style="background:rgba(251,191,36,.6)" />leve</span><span><i class="sw" style="background:rgba(249,115,22,.7)" />média</span><span><i class="sw" style="background:rgba(239,68,68,.8)" />forte</span></div></Card>
      <div class="note warn"><Icon id="warn" /><span>O app adapta o treino, não diagnostica. Dor forte, que piora, com formigamento ou por mais de 1–2 semanas: procure um médico ou fisioterapeuta.</span></div></div>
    <div class="stack"><Card><h2>Dores ativas</h2>{S.pains.length ? S.pains.map((p) => { const ef = painEffects(p);
        return <div key={p.id} style="padding:10px 0;border-top:1px solid var(--borda)"><div class="row between"><b>{C.REGION_BY_ID[p.region]?.nm}</b><span class={`badge ${p.intensity === 3 ? "bad" : "warn"}`}>{["", "leve", "média", "forte"][p.intensity]}</span></div>
          <p class="tiny sub">{[p.kind, p.context].filter(Boolean).join(" · ")}</p>
          <p class="small" style="margin-top:6px"><b>Fortalecimento:</b> {ef.pre.slice(0, 2).join(", ") || "—"}</p>
          <p class="small sub"><b>Evitando:</b> {ef.blocked.slice(0, 5).join(", ") || "nada"}{ef.blocked.length > 5 ? ` +${ef.blocked.length - 5}` : ""}</p>
          <div class="row" style="gap:6px;margin-top:8px">{p.intensity > 1 && <button type="button" class="btn sm" onClick={() => { p.intensity -= 1; S.ui.locked = false; commit(); send("POST", "/api/pains", { region: p.region, intensity: p.intensity, kind: p.kind, context: "melhorou" }).catch(() => {}); }}>Melhorou</button>}
            <button type="button" class="btn sm" onClick={() => { S.pains = S.pains.filter((x) => x.id !== p.id); S.ui.locked = false; commit(); send("POST", `/api/pains/${p.id}/resolve`).catch(() => {}); }}><Icon id="check" />Passou</button></div></div>; })
        : <p class="small sub" style="margin-top:6px">Nenhuma. Bom sinal.</p>}</Card>
      <Card><h2>Medidas (a cada 15 dias)</h2><p class="small sub" style="margin-top:4px">O gráfico que importa para o objetivo: braço sobe, cintura parada.</p>
        <div class="grid" style="grid-template-columns:repeat(2,minmax(0,1fr));margin-top:10px"><div><label class="f" for="mBraco">Braço contraído (cm)</label><input class="input num" id="mBraco" inputMode="decimal" placeholder={last ? fmt(last.braco, 1) : "ex.: 33,5"} /></div>
          <div><label class="f" for="mCintura">Cintura no umbigo (cm)</label><input class="input num" id="mCintura" inputMode="decimal" placeholder={last ? fmt(last.cintura, 1) : "ex.: 79"} /></div></div>
        <button type="button" class="btn sm" style="margin-top:10px" onClick={saveMeasure}>Salvar medidas</button>
        {ms.length > 0 && <><hr /><div class="grid g2"><div><p class="tiny sub">Braço (cm)</p><Linha values={ms.map((m) => m.braco)} label="Braço" unit=" cm" /></div><div><p class="tiny sub">Cintura (cm)</p><Linha values={ms.map((m) => m.cintura)} label="Cintura" unit=" cm" /></div></div>
          {ms.slice(-4).map((m) => <div key={m.date} class="row between small num" style="padding:3px 0"><span class="sub">{m.date.split("-").reverse().slice(0, 2).join("/")}</span><span>braço {fmt(m.braco, 1)} · cintura {fmt(m.cintura, 1)}</span></div>)}</>}</Card>
      <Card><h2>Peso da semana</h2>{ws.length ? <p class="small num" style="margin-top:6px">{ws.map(([d, w]) => `${DOW_NM[dowIdx(d)]} ${fmt(w, 1)}`).join(" · ")}</p> : <p class="small sub" style="margin-top:6px">Pese no check-in (opcional).</p>}</Card></div></div></>;
}
