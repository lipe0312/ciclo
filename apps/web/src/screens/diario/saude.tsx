// Saúde da semana: sono, álcool, fumo, cafeína, água e cardio (médias do core) + a regra de manutenção por saúde.
import { C, S, dates } from "../../lib/store/index.ts";
import { Card, Icon } from "../../lib/ui/index.tsx";
import { fmt } from "../../lib/util.ts";
import { href } from "../../lib/roteador/index.ts";
import { D, checkinOf } from "../../lib/diario/estado.ts";
import type { Checkout } from "../../lib/diario/estado.ts";

const lite = (c: Checkout): C.CheckoutLite => ({ date: c.date, alcohol: c.alcohol, smoke: c.smoke, smokeQty: c.smokeQty, caffeineLate: c.caffeineLate, waterMl: c.waterMl, cardioMin: c.cardio?.minutes ?? null, steps: c.cardio?.steps ?? null, mood: c.mood });

export function semanaSaude() {
  const ci = dates.map((d) => ({ date: d, ck: checkinOf(d) })).filter((x) => x.ck).map((x) => ({ date: x.date, sleepH: x.ck!.sleepH }));
  const cardio = C.cardioWeekSummary(S.week.cardio, dates[0], dates[6], S.profile.weightKg).minutes;
  const h = C.healthWeek(dates, ci, Object.values(D.checkouts).map(lite), cardio);
  return { h, m: C.healthMaintenance(h) };
}

export function Saude() {
  const { h, m } = semanaSaude();
  const n = (v: number | null, d = 1) => (v == null ? "—" : fmt(v, d));
  const stats: [string, string, string][] = [
    ["Sono médio", `${n(h.sleepAvg)} h`, `${h.sleepNights} noites`],
    ["Álcool", `${h.alcoholNights} noites`, `${h.alcoholUnits} doses`],
    ["Fumo / vape", `${h.smokeDays} dias`, h.smokeQty ? `${h.smokeQty} no total` : "na semana"],
    ["Cardio", `${h.cardioMin} min`, "treino + checkout"],
    ["Água", h.waterAvgMl == null ? "—" : `${fmt(h.waterAvgMl / 1000, 1)} L`, "por dia"],
    ["Cafeína após 16h", `${h.caffeineLateDays} dias`, "na semana"],
  ];
  return <Card>
    <div class="row between wrapx"><h2>Saúde da semana</h2><span class="badge num">{h.checkouts} checkouts</span></div>
    <div class="dia-stats">{stats.map(([k, v, s]) => <div key={k}><p class="tiny sub">{k}</p><p class="num dia-stat">{v}</p><p class="tiny sub">{s}</p></div>)}</div>
    {m.suggest && <p class="small dia-alerta" role="status"><Icon id="warn" />Semana de manutenção sugerida: {m.reasons.join(", ")}. O Claude considera isso na revisão.</p>}
    <p class="tiny sub" style="margin-top:10px">Essas médias entram no resumo que o Claude lê (ciclo_estado) e na revisão de domingo.</p>
    <a class="btn full" style="margin-top:12px" href={href("diario", ["exames"])}><Icon id="info" />Exames</a>
  </Card>;
}
