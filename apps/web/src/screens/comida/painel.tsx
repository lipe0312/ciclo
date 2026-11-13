// Painel da semana: média de 7 dias de kcal e proteína contra a meta, aderência à proteína, distribuição por refeição e top proteínas.
import { MEAL_NM } from "@ciclo/core";
import { Card } from "../../lib/ui/index.tsx";
import { BarraSimples } from "../../lib/grafico/index.tsx";
import { foodPanel } from "../../lib/store/regras.ts";
import { DOW_NM, dowIdx, fmt } from "../../lib/util.ts";

/** Sete colunas (uma por dia) com a marca da meta. O valor sempre vem escrito embaixo; a cor nunca é o único sinal. */
function Colunas({ dias, meta, unit, bate }: { dias: { date: string; v: number; logged: boolean }[]; meta: number; unit: string; bate: (v: number) => boolean }) {
  const max = Math.max(meta * 1.15, ...dias.map((d) => d.v)) || 1;
  return <div class="dias" role="group" aria-label={`Últimos 7 dias em ${unit}, meta ${fmt(meta)}`}>
    {dias.map((d) => <div key={d.date} class="dia-col" role="img" aria-label={`${DOW_NM[dowIdx(d.date)]}: ${d.logged ? `${fmt(d.v)} ${unit}${bate(d.v) ? ", bateu a meta" : ""}` : "sem registro"}`}>
      <div class="dia-bar">
        <i class={bate(d.v) ? "hit" : ""} style={{ height: `${Math.min(100, (d.v / max) * 100)}%` }} />
        <span class="mk" style={{ bottom: `${(meta / max) * 100}%` }} />
      </div>
      <span class="num">{d.logged ? fmt(d.v) : "–"}</span>
      <span class="lbl">{DOW_NM[dowIdx(d.date)]}</span>
    </div>)}
  </div>;
}

const sign = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "") + fmt(Math.abs(n));

export function Painel() {
  const { cur, prev, top, targets, semana } = foodPanel();
  const semDados = cur.daysLogged === 0;
  const dk = cur.avgKcal != null && prev.avgKcal != null ? cur.avgKcal - prev.avgKcal : null;
  const dp = cur.avgProt != null && prev.avgProt != null ? cur.avgProt - prev.avgProt : null;
  return <Card>
    <p class="kicker">Painel · últimos 7 dias</p>
    {semDados ? <p class="small sub" style="margin-top:8px">Nenhum registro nos últimos 7 dias. Registre o que comeu e a média aparece aqui. Faltar um dia não derruba a conta: só os dias registrados entram.</p> : <>
      <div class="grid g2" style="margin-top:10px;gap:14px">
        <div><p class="small sub">Calorias (média)</p><p class="big num" style="margin-top:4px">{fmt(cur.avgKcal!)}</p>
          <p class="small sub num">meta {fmt(targets.kcal)} · {cur.kcalPct}%{dk != null && <> · {sign(dk)} vs. semana anterior</>}</p></div>
        <div><p class="small sub">Proteína (média)</p><p class="big num" style="margin-top:4px">{fmt(cur.avgProt!)} g</p>
          <p class="small sub num">meta {fmt(targets.protein)} g · {cur.protPct}%{dp != null && <> · {sign(dp)} vs. semana anterior</>}</p></div>
      </div>
      <div class="row between" style="margin-top:14px;gap:10px;flex-wrap:wrap">
        <p class="small"><b class="num">{cur.adherence.hit} de {cur.adherence.of}</b> dias bateu a proteína <span class="sub">({cur.adherence.rate}%)</span></p>
        <p class="small sub num">{cur.daysLogged} de 7 dias registrados</p>
      </div>
      <p class="small num" style="margin-top:6px">Abaixo da meta: <b>{semana.abaixoProt} {semana.abaixoProt === 1 ? "dia" : "dias"}</b> na proteína · <b>{semana.abaixoKcal} {semana.abaixoKcal === 1 ? "dia" : "dias"}</b> nas calorias <span class="sub">(dos registrados)</span></p>
      <p class="small num" style="margin-top:4px">Bebida: {semana.bebida.kcal ? <><b>{fmt(semana.bebida.kcal)} kcal</b> em {semana.bebida.dias} {semana.bebida.dias === 1 ? "dia" : "dias"} <span class="sub">(do Diário; já somada nas calorias)</span></> : <span class="sub">nada registrado na semana</span>}</p>
      <h3 class="small" style="margin:14px 0 6px">Calorias por dia</h3>
      <Colunas dias={cur.days.map((d) => ({ date: d.date, v: d.kcal, logged: d.logged }))} meta={targets.kcal} unit="kcal" bate={(v) => v >= targets.kcal * 0.9 && v <= targets.kcal * 1.1} />
      <h3 class="small" style="margin:14px 0 6px">Proteína por dia (g)</h3>
      <Colunas dias={cur.days.map((d) => ({ date: d.date, v: d.prot, logged: d.logged }))} meta={targets.protein} unit="g de proteína" bate={(v) => v >= targets.protein * 0.95} />
      <p class="tiny sub" style="margin-top:6px">A linha é a meta. Barra verde: bateu (calorias dentro de ±10%; proteína a partir de 95%).</p>
      <hr />
      <h3 class="small" style="margin-bottom:8px">Por refeição</h3>
      {cur.byMeal.map((m) => <div key={m.meal} class="vol num"><span>{MEAL_NM[m.meal]}</span><BarraSimples pct={m.share} /><span>{m.share}%</span></div>)}
      {top.length > 0 && <><hr /><h3 class="small" style="margin-bottom:8px">O que mais te dá proteína</h3>
        {top.map((t) => <div key={t.label} class="row between small" style="padding:3px 0"><span>{t.label}</span><span class="sub num">{fmt(t.prot)} g · {t.times}×</span></div>)}</>}
    </>}
  </Card>;
}
