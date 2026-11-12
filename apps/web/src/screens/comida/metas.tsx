// Metas: proteína fixa (g/kg), calorias adaptativas (faixa + por que mudou), ritmo de ganho e água.
import { PACES, PACE_KG_WEEK, PACE_NM } from "@ciclo/core";
import type { Pace } from "@ciclo/core";
import { S, commit } from "../../lib/store/index.ts";
import { DIET } from "../../lib/store/regras.ts";
import { profileChanged } from "../../lib/store/regras.ts";
import { Card, Icon, Seg, Stepper } from "../../lib/ui/index.tsx";
import { fmt, longDate } from "../../lib/util.ts";

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const PACE_TXT: Record<Pace, string> = { lento: "lento · ~0,15 kg/sem", moderado: "moderado · ~0,25 kg/sem", rapido: "rápido · ~0,4 kg/sem" };

export function Metas() {
  const d = S.profile.diet, kg = S.profile.weightKg || 70;
  const gkg = Math.round((d.protein / kg) * 10) / 10;
  const h = DIET.history[0];
  const change = (f: () => void) => { f(); profileChanged(); commit(); };
  return <Card>
    <p class="kicker">Metas</p>
    <div class="row between" style="margin-top:10px;align-items:flex-start;gap:12px">
      <div><p class="small sub">Proteína (meta fixa)</p><p class="big num" style="margin-top:4px">{d.protein} g</p><p class="small sub num">{fmt(gkg, 1)} g por kg · peso {fmt(kg, 1)} kg</p></div>
      <Stepper value={gkg} step={0.1} unit=" g/kg" onStep={(x) => change(() => { d.protein = clamp(Math.round(kg * clamp(Math.round((gkg + x) * 10) / 10, 1, 3)), 20, 500); })} />
    </div>
    <hr />
    <div class="row between" style="align-items:flex-start;gap:12px">
      <div><p class="small sub">Calorias (faixa adaptativa)</p><p class="big num" style="margin-top:4px">{fmt(d.kcal)}</p><p class="small sub num">faixa {fmt(d.kcal - 100)} a {fmt(d.kcal + 100)} kcal/dia</p></div>
      <Stepper value={d.kcal} step={50} onStep={(x) => change(() => { d.kcal = clamp(d.kcal + x, 1200, 6000); })} />
    </div>
    <div class="note" style="margin-top:10px" role="note"><Icon id="info" />
      <div class="small"><b>Por que {h ? (h.adjust === 0 ? "não mudou" : "mudou") : "ainda não mudou"}?</b>{" "}
        {h ? <>{h.reason} <span class="sub">({longDate(h.date)})</span></> : (DIET.note || "A meta se ajusta sozinha pela tendência do peso, no máximo ±150 kcal por semana. Pese 2 a 3 vezes por semana no check-in e registre a comida: com 3 semanas de dados ela começa a se mexer.")}</div></div>
    {h?.code === "cintura" && <div class="note warn" style="margin-top:8px" role="note"><Icon id="warn" /><div class="small">Alerta de cintura: ela subiu mais de 1 cm em 4 semanas com o peso subindo rápido. Antes de mexer no treino, a meta desceu 150 kcal.</div></div>}
    <hr />
    <p class="small sub" style="margin-bottom:6px">Ritmo de ganho (ligado ao objetivo “{S.profile.goal?.statement ?? "braços e ombros maiores"}”)</p>
    <Seg label="Ritmo de ganho" opts={PACES.map((p): [Pace, string] => [p, PACE_NM[p]])} value={d.pace} onPick={(p) => change(() => { d.pace = p; })} />
    <p class="tiny sub" style="margin-top:6px">{PACE_TXT[d.pace]}. Quanto mais rápido, maior o risco de ganhar cintura junto: o app avisa se isso acontecer. ({fmt(PACE_KG_WEEK[d.pace] * 1000)} g por semana)</p>
    <hr />
    <div class="row between"><div><p class="small sub">Água</p><p class="num" style="font-weight:800;font-size:20px">{fmt(d.waterMl / 1000, 2)} L/dia</p></div>
      <Stepper value={d.waterMl} step={250} unit=" ml" onStep={(x) => change(() => { d.waterMl = clamp(d.waterMl + x, 500, 8000); })} /></div>
  </Card>;
}
