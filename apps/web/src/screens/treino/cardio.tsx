// Cardio por modalidade (#44): lista com ícone (esporte → qual?), duração, intensidade leve/moderado/forte e distância opcional.
// A kcal vem da estimativa por MET (Compendium) e entra no gasto do dia; conta no resumo da semana, no Histórico e na Home.
import { useState } from "preact/hooks";
import { C, S, commit, dates, today } from "../../lib/store/index.ts";
import { send } from "../../lib/api/index.ts";
import { Card, Chip, Icon, Seg, Stepper, toast } from "../../lib/ui/index.tsx";
import { fmt, longDate, uid } from "../../lib/util.ts";
import "../semana/semana.css";

export const cardioName = (id: string) => C.CARDIO_BY_ID[id]?.nm ?? id;
/** "30 min · 4,2 km · Zona 2" */
export const cardioLine = (e: C.CardioEntry) => `${e.minutes} min${e.distanceKm ? ` · ${fmt(e.distanceKm, 1)} km` : ""} · ${C.INTENSITIES[e.intensity]?.nm ?? e.intensity}`;

/** Esporte (futsal, tênis…) abre a pergunta "qual?"; o resto é a própria modalidade. */
const modOf = (type: string) => C.isEsporte(type) ? C.MODALIDADES.find((m) => m.esporte)!.id : C.MODALIDADES.some((m) => m.id === type) ? type : C.MODALIDADES[0].id;
export function Cardio() {
  const [type, setType] = useState(C.MODALIDADES[0].id), [minutes, setMinutes] = useState(30), [intensity, setIntensity] = useState<C.Intensity>("zona2"), [km, setKm] = useState("");
  const c = C.CARDIO_BY_ID[type], hasKm = c.units.includes("km"), mod = modOf(type), esporte = !!C.MODALIDADES.find((m) => m.id === mod)?.esporte;
  const pick = (id: string) => { setType(id); if (!C.CARDIO_BY_ID[id].units.includes("km")) setKm(""); if (C.isEsporte(id) && intensity === "zona2") setIntensity("moderado"); };
  const kmNum = parseFloat(km.replace(",", "."));
  const draft = { type, minutes, intensity, distanceKm: hasKm && km.trim() && Number.isFinite(kmNum) ? kmNum : null };
  const err = C.checkCardio(draft) ?? (km.trim() && hasKm && !Number.isFinite(kmNum) ? "distância inválida" : null);
  const w = C.cardioWeekSummary(S.week.cardio, dates[0], dates[6], S.profile.weightKg);
  const save = () => {
    if (err) return toast(err);
    const e: C.CardioEntry = { id: uid(), date: today, ...draft };
    S.week.cardio = [...S.week.cardio, e]; commit();
    send<{ id: string }>("POST", "/api/cardio", { date: e.date, type: e.type, minutes: e.minutes, intensity: e.intensity, distanceKm: e.distanceKm }).then((r) => { if (r?.id) { e.id = r.id; commit(); } }).catch(() => {});
    setKm(""); toast("Cardio registrado · conta na semana");
  };
  const del = (e: C.CardioEntry) => { S.week.cardio = S.week.cardio.filter((x) => x.id !== e.id); commit(); send("DELETE", `/api/cardio/${encodeURIComponent(e.id)}`).catch(() => {}); };
  return <>
    <h1 style="margin:4px 0 12px">Cardio</h1>
    <div class="grid dash"><div class="stack">
      <Card cls="cardio-form"><h2>Registrar sessão</h2>
        <span class="f" id="cTipo" style="margin-top:12px;display:block">Modalidade</span>
        <div class="cd-mods" role="group" aria-labelledby="cTipo">{C.MODALIDADES.map((x) => <button type="button" key={x.id} class="cd-mod" aria-pressed={mod === x.id} onClick={() => pick(x.id)}><Icon id={x.icon} />{x.nm}</button>)}</div>
        {esporte && <><span class="f" id="cEsp" style="margin-top:12px;display:block">Qual esporte?</span>
          <div class="chips" role="group" aria-labelledby="cEsp">{C.CARDIO_ESPORTES.map((x) => <Chip key={x.id} on={type === x.id} onClick={() => pick(x.id)}>{x.nm}</Chip>)}</div></>}
        <div class="row wrapx" style="gap:16px;margin-top:12px;align-items:flex-end"><div><span class="f">Minutos</span><Stepper value={minutes} step={5} onStep={(d) => setMinutes(Math.min(C.CARDIO_MAX_MINUTES, Math.max(5, minutes + d)))} /></div>
          {hasKm && <div style="flex:1;min-width:120px"><label class="f" for="cKm">Distância (km, opcional)</label><input class="input" id="cKm" inputMode="decimal" placeholder="ex.: 4,2" value={km} onInput={(e) => setKm(e.currentTarget.value)} /></div>}</div>
        <span class="f" style="margin-top:12px;display:block">Intensidade</span>
        <Seg opts={(Object.keys(C.INTENSITIES) as C.Intensity[]).map((k) => [k, C.INTENSITIES[k].nm] as [C.Intensity, string])} value={intensity} onPick={setIntensity} label="Intensidade" />
        <p class="tiny sub" style="margin-top:6px">{C.INTENSITIES[intensity].desc}</p>
        <p class="small num" style="margin-top:10px">≈ {fmt(C.cardioKcalOf({ type, intensity, minutes }, S.profile.weightKg))} kcal <span class="sub">(estimativa: MET × peso × tempo, Compendium of Physical Activities)</span></p>
        {err && <p class="small" role="alert" style="color:var(--bad);margin-top:6px">{err}</p>}
        <button type="button" class="btn pri lg full" style="margin-top:12px" onClick={save} disabled={!!err}><Icon id="check" />Registrar</button></Card></div>
      <div class="stack"><Card><p class="kicker">Cardio da semana</p>
        <p class="big num" style="margin-top:6px">{w.minutes}<span class="small sub"> min</span></p>
        <p class="small sub num" style="margin-top:4px">{w.sessions} sessão(ões){w.km ? ` · ${fmt(w.km, 1)} km` : ""} · ≈ {fmt(w.kcal)} kcal</p>
        <p class="small num" style="margin-top:8px"><b>Gasto do cardio hoje: ≈ {fmt(C.cardioDayKcal(S.week.cardio, today, S.profile.weightKg))} kcal</b> <span class="sub">(soma no gasto do dia)</span></p></Card>
        <Card><h2>Registros da semana</h2>{S.week.cardio.length ? [...S.week.cardio].sort((a, b) => (a.date < b.date ? 1 : -1)).map((e) => <div class="row between" key={e.id} style="padding:8px 0;border-top:1px solid var(--borda)">
          <div><b>{cardioName(e.type)}</b><p class="small sub num">{longDate(e.date)} · {cardioLine(e)} · ≈ {fmt(C.cardioKcalOf(e, S.profile.weightKg))} kcal</p></div>
          <button type="button" class="iconbtn" onClick={() => del(e)} aria-label={`Apagar ${cardioName(e.type)} de ${longDate(e.date)}`}><Icon id="x" /></button></div>) : <p class="small sub" style="margin-top:6px">Nenhum cardio registrado nesta semana.</p>}</Card></div></div></>;
}
