// Calendário de 7/30 dias: manhã (check-in) e noite (checkout) por dia; buracos marcados; tocar abre o dia para preencher depois.
import { useState } from "preact/hooks";
import { C, commit, today } from "../../lib/store/index.ts";
import { Card, Seg } from "../../lib/ui/index.tsx";
import { DOW_NM, dowIdx } from "../../lib/util.ts";
import { D, checkinOf } from "../../lib/diario/estado.ts";

export function Calendario() {
  const [n, setN] = useState(7);
  const days = C.lastDays(today, n);
  const cov = C.diaryCoverage(days, days.filter((d) => checkinOf(d)), Object.keys(D.checkouts), today);
  const pick = (d: string) => { D.sel = d; commit(); document.getElementById("checkin")?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }); };
  return <Card>
    <div class="row between wrapx"><h2>Calendário</h2><Seg opts={[[7, "7 dias"], [30, "30 dias"]]} value={n} onPick={setN} label="Período do calendário" /></div>
    <p class="small sub num" style="margin-top:6px">{cov.checkins}/{cov.due} check-ins · {cov.checkouts}/{cov.due} checkouts{cov.empty.length ? ` · ${cov.empty.length} dia(s) em branco` : ""}</p>
    <div class="cal-grid" style="margin-top:10px">
      {DOW_NM.map((w) => <span key={w} class="cal-dow tiny sub" aria-hidden="true">{w}</span>)}
      {Array.from({ length: dowIdx(days[0]) }, (_, i) => <span key={`v${i}`} />)}
      {cov.days.map((x) => {
        const claude = D.checkouts[x.date]?.source === "claude";
        return <button type="button" key={x.date} class={`cal-dia st-${x.state}${x.date === D.sel ? " sel" : ""}${x.date === today ? " hoje" : ""}`} onClick={() => pick(x.date)}
          aria-label={`${x.date.slice(8)}/${x.date.slice(5, 7)}: check-in ${x.checkin ? "feito" : "pendente"}, checkout ${x.checkout ? "feito" : "pendente"}${claude ? ", preenchido pelo Claude" : ""}`} aria-pressed={x.date === D.sel}>
          <span class="num">{Number(x.date.slice(8))}</span>
          <span class="cal-marcas" aria-hidden="true"><i class={x.checkin ? "on" : ""} /><i class={x.checkout ? "on" : ""} /></span>
          {claude && <span class="cal-claude" aria-hidden="true">C</span>}
        </button>;
      })}
    </div>
    <p class="tiny sub" style="margin-top:10px">Cada dia: 1ª marca = check-in, 2ª = checkout. Borda tracejada = dia em branco; “C” = preenchido pelo Claude, confira. Toque para preencher depois.</p>
  </Card>;
}
