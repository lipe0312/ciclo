// Semana: todos os dias já planejados (gerados na segunda), cada um com detalhe, trocar geração, mover/trocar,
// folga, regenerar com diff e desfazer. Faltas perguntam inline; o compensatório só aparece quando a regra diz.
// Rotas: #semana · #semana/dia/<YYYY-MM-DD>
import { useEffect } from "preact/hooks";
import * as C from "@ciclo/core";
import { S, today } from "../../lib/store/index.ts";
import { gymById, mName } from "../../lib/store/regras.ts";
import type { Route } from "../../lib/roteador/index.ts";
import { href } from "../../lib/roteador/index.ts";
import { Card, Icon } from "../../lib/ui/index.tsx";
import { DOW_NM, img, longDate } from "../../lib/util.ts";
import { acaoDia, diaDe, garantirSemana, getSemana, getVazio } from "./estado.ts";
import type { Dia, Semana } from "./estado.ts";
import { AvisoFalta } from "./aviso.tsx";
import { abrirMover, abrirRegenerar, abrirTrocar, abrirVersoes, aberto, diaCurto } from "./folhas.tsx";
import { abrirGerarOutro } from "../treino/gerar.tsx";
import "./semana.css";

export const STATUS: Record<C.DayStatus, string> = {
  feito: "feito", extra: "extra", faltou: "faltou", folga: "folga", pendente: "sem resposta", hoje: "hoje", livre: "livre", planejado: "planejado",
};
const SEM_PLANO: Record<C.DayStatus, string> = {
  feito: "Treino feito", extra: "Treino extra", faltou: "Não treinou", folga: "Folga", pendente: "Treino planejado", hoje: "Treino", livre: "Livre", planejado: "Treino",
};
const LEGENDA: [C.DayStatus, string][] = [["feito", "feito"], ["hoje", "hoje"], ["planejado", "planejado"], ["folga", "folga"], ["faltou", "faltou"]];
const curto = (d: string) => `${Number(d.slice(8, 10))}/${Number(d.slice(5, 7))}`;

function Legenda() {
  return <div class="legend sem-legenda" aria-label="Legenda">{LEGENDA.map(([s, l]) => <span key={s}><i class={`sem-sw st-${s}`} />{l}</span>)}</div>;
}

function DiaCard({ d }: { d: Dia }) {
  const p = d.kind !== "folga" || d.status === "extra" ? d.plan : null;
  const pode = aberto(d);
  const gym = gymById(d.gymId)?.name;
  return <div class={`sem-dia st-${d.status}`}>
    <div class="sem-data"><b>{DOW_NM[C.DOWS.indexOf(d.dow)]}</b><span class="num">{Number(d.date.slice(8, 10))}</span></div>
    <div style="min-width:0">
      <div class="row between start" style="gap:8px">
        <h3 style="min-width:0">{p ? p.name : SEM_PLANO[d.status]}</h3>
        <span class={`sem-st st-${d.status}`}>{STATUS[d.status]}</span></div>
      {p ? <>
        <p class="small sub num" style="margin-top:2px">{p.items.length} exercícios · {p.setsTotal} séries · ~{p.estMinutes} min{gym ? ` · ${gym}` : ""}</p>
        <p class="tiny sub" style="margin-top:4px">{Object.entries(p.perMuscle).map(([m, n]) => `${mName(m)} ${n}`).join(" · ")}</p>
        {d.source !== "auto" && <p class="tiny" style="margin-top:4px"><span class="badge">{d.source === "claude" ? "montado pelo Claude" : "escolha sua"}</span></p>}
        {d.warn.map((w, i) => <p key={i} class="tiny" style="margin-top:4px;color:var(--warn)">{w}</p>)}
      </> : d.status === "livre" ? <p class="small sub" style="margin-top:2px">Não planejado. Treinar hoje vira <b>extra</b>: só o que falta, sem passar do orçamento.</p> : null}
      {d.cardio && <p class="tiny" style="margin-top:4px"><Icon id={C.MODALIDADES.find((m) => m.id === d.cardio!.type)?.icon ?? "bolt"} />{" "}Cardio {d.cardio.minutes} min · {C.INTENSITIES[d.cardio.intensity].nm.toLowerCase()}</p>}
      <div class="sem-acts uma">
        {p && <a class="btn" href={href("semana", ["dia", d.date])}>Ver</a>}
        {pode && d.kind !== "folga" && <button type="button" class="btn" onClick={() => abrirTrocar(d)}>Trocar</button>}
        {pode && <button type="button" class="btn" onClick={() => abrirMover(d)}>{d.kind !== "folga" ? "Mover" : "Planejar"}</button>}
        {d.status === "livre" && getSemana()?.extraToday?.items.length ? <a class="btn pri" href={href("semana", ["dia", d.date])}>Ver extra</a> : null}
      </div>
    </div></div>;
}

function Oferta({ s }: { s: Semana }) {
  const o = s.offer; if (!o) return null;
  const d = diaDe(o.date)!;
  const gerar = (mode: C.Mode, ok: string) => acaoDia(o.date, { action: "gerar", opts: { ...d.opts, mode, keep: false } }, ok);
  return <Card cls="hl"><p class="kicker">Compensatório · {diaCurto(o.date)}</p>
    <h2 style="margin-top:4px">Só sobrou {o.date === today ? "hoje" : "1 treino"}</h2>
    <p class="small" style="margin-top:6px">{o.muscles.map(mName).join(", ")} {o.muscles.length > 1 ? "ficam" : "fica"} com menos de 2 estímulos e nenhum dia cobre.</p>
    <div class="sem-num small num"><span>Sem compensatório: <b>{o.outWithout}</b> séries de fora</span><span>Completo: <b>{o.outWith}</b></span><span>Só prioridades: <b>{o.outExpress}</b></span></div>
    <div class="sem-acts">
      <button type="button" class="btn pri" onClick={() => gerar("compensatorio", "Compensatório gerado")}>Compensatório completo</button>
      <button type="button" class="btn" onClick={() => gerar("expresso", "Expresso gerado")}>Só prioridades (expresso)</button>
      <button type="button" class="btn" onClick={() => acaoDia(o.date, { action: "manter" }, "A semana fecha assim. A próxima não dobra.")}>Deixar a semana fechar assim</button>
    </div>
    <details class="sem-pq"><summary>Por que estou vendo isso?</summary><p class="small sub">{o.why} Regra: o compensatório só aparece quando sobra 1 treino e algum músculo fica com menos de 2 estímulos sem outro dia que cubra. Nada muda sem o seu toque.</p></details>
  </Card>;
}

function Motivos({ s }: { s: Semana }) {
  const { changes, deload } = s.progression;
  if (!changes.length && !deload.on) return null;
  return <Card><p class="kicker">Ajustes desta semana</p>
    {deload.on && <p class="small" style="margin-top:6px"><b>Deload:</b> {deload.reason} Volume ×0,6, cargas mantidas.</p>}
    <ul class="sem-motivos">{changes.map((c) => <li key={c.muscle} class={c.delta > 0 ? "mais" : "menos"}>{c.text}</li>)}</ul>
    <p class="tiny sub">Pelo pump, dor residual e desempenho da semana passada. Limites: 4–20 séries por músculo.</p></Card>;
}

function Lista({ s }: { s: Semana }) {
  const treinos = s.days.filter((d) => d.kind !== "folga").length;
  return <>
    <div class="row between wrapx" style="margin-bottom:14px;gap:8px"><div><p class="kicker">Semana · {curto(s.weekStart)} a {curto(s.days[6].date)}</p><h1>Semana</h1>
      <p class="small sub num" style="margin-top:4px">{treinos} treinos planejados · fecha em {s.closePct}% do orçamento</p></div></div>
    <div class="grid dash"><div class="stack">
      <AvisoFalta />
      <Oferta s={s} />
      <Card><div class="row between wrapx" style="gap:8px"><h2>Dias</h2><Legenda /></div>
        <div class="sem-lista">{s.days.map((d) => <DiaCard key={d.date} d={d} />)}</div></Card>
    </div><div class="stack">
      <Motivos s={s} />
      <Card><h2>Volume projetado</h2><p class="small sub" style="margin:4px 0 10px">Feito + planejado até domingo · “2×” = estímulos.</p>
        {C.MUSCLE_IDS.map((m) => { const t = s.targets[m] ?? 0, v = s.projected.done[m] ?? 0, f = s.projected.freq[m] ?? 0;
          return <div key={m} class="sem-vol"><span class="small">{mName(m)}{S.profile.priorities.includes(m) ? " ●" : ""}</span>
            <span class="small num"><b>{v}</b>/{t} · <span class={f >= 2 ? "" : "sem-warn"}>{f}×</span></span></div>; })}</Card>
      <Card><h2>Gerações</h2><p class="small sub" style="margin:4px 0 12px">Versão {s.version}. Toda mudança guarda a anterior.</p>
        <div class="sem-acts uma"><button type="button" class="btn" onClick={abrirRegenerar}><Icon id="cycle" />Regenerar</button>
          {s.versions.length > 1 && <button type="button" class="btn" onClick={abrirVersoes}><Icon id="back" />Desfazer</button>}</div></Card>
    </div></div></>;
}

function Detalhe({ date }: { date: string }) {
  const s = getSemana(), d = diaDe(date);
  const back = <a class="btn" href="#semana"><Icon id="back" />Semana</a>;
  if (!s || !d) return <>{back}<p class="sub" style="margin-top:12px">Dia fora desta semana.</p></>;
  const p = d.status === "livre" ? s.extraToday : d.plan;
  const pode = aberto(d);
  return <>
    <div class="row between" style="margin-bottom:10px">{back}<span class={`sem-st st-${d.status}`}>{STATUS[d.status]}</span></div>
    <p class="kicker">{longDate(date)}{d.gymId ? ` · ${gymById(d.gymId)?.name ?? ""}` : ""}</p>
    <h1 style="margin:2px 0 6px">{p?.name ?? "Folga"}</h1>
    {p && <p class="small sub num">{p.items.length} exercícios · {p.setsTotal} séries · ~{p.estMinutes} min{d.opts.format && d.opts.format !== "tradicional" ? ` · ${d.opts.format === "superserie" ? "superséries" : "circuito"}` : ""}</p>}
    <div class="grid dash" style="margin-top:14px"><div class="stack">
      {p && p.items.length > 0 ? <Card><h2>Exercícios</h2><div class="sem-exs">{[...p.prehab, ...p.items].map((it, i) => <Exercicio key={i} it={it} />)}</div></Card>
        : <Card><p class="small">{p?.why[0] ?? "Dia de descanso. Recuperar também conta."}</p></Card>}
    </div><div class="stack">
      {d.cardio && <Card><h2>Cardio previsto</h2><p class="small" style="margin-top:6px"><b>{C.CARDIO_BY_ID[d.cardio.type]?.nm} · {d.cardio.minutes} min · {C.INTENSITIES[d.cardio.intensity].nm.toLowerCase()}</b></p><p class="tiny sub">{d.cardio.why}</p></Card>}
      {p && <Card><h2>Por quê</h2><ul class="sem-motivos">{p.why.map((w, i) => <li key={i}>{w}</li>)}{d.warn.map((w, i) => <li key={`w${i}`} class="menos">{w}</li>)}</ul></Card>}
      {pode && <Card><h2>Mudar este dia</h2><div class="sem-acts uma">
        {d.kind !== "folga" && <button type="button" class="btn pri" onClick={() => abrirGerarOutro(d.date)}><Icon id="cycle" />Gerar outro treino</button>}
        {d.kind !== "folga" && <button type="button" class="btn" onClick={() => abrirTrocar(d)}><Icon id="swap" />Trocar geração</button>}
        <button type="button" class="btn" onClick={() => abrirMover(d)}>{d.kind !== "folga" ? "Mover" : "Planejar treino"}</button>
        {d.status === "livre" && p?.items.length ? <button type="button" class="btn pri" onClick={() => acaoDia(date, { action: "extra" }, "Treino extra na semana")}>Treinar hoje (extra)</button> : null}
      </div>{d.date === today && <a class="btn ghost full" style="margin-top:8px" href="#hoje">Ver no Hoje<Icon id="arrow" /></a>}</Card>}
    </div></div></>;
}

function Exercicio({ it }: { it: C.PlanItem }) {
  const cat = C.CATALOG_BY_ID[it.exerciseId];
  const foto = cat && cat.images.length ? img(C.imageSrc(cat)) : null;
  const corpo = <>{foto ? <img src={foto} alt="" loading="lazy" width={72} height={48} /> : <span class="sem-semfoto"><Icon id="dumb" /></span>}
    <div style="min-width:0"><h3>{it.nm}</h3><p class="tiny sub num">{it.prehab ? "fortalecimento · " : ""}{mName(it.muscle)} · {it.sets} × {it.reps[0]}–{it.reps[1]} · descanso {it.rest}s</p></div></>;
  return cat ? <a class="sem-ex" href={href("treino", ["exercicio", it.exerciseId])}>{corpo}<Icon id="arrow" /></a> : <div class="sem-ex">{corpo}<span /></div>;
}

export default function Tela({ route }: { route: Route }) {
  useEffect(() => { garantirSemana(true); }, []);
  const s = getSemana();
  if (!s) return <><p class="kicker">Semana</p><h1 style="margin-bottom:14px">Semana</h1>
    <Card><p class="small">{getVazio() ?? "Carregando a semana…"}</p>{getVazio() && <a class="btn pri" style="margin-top:10px" href="#primeiros-passos">Primeiros passos</a>}</Card></>;
  if (route.parts[0] === "dia" && route.parts[1]) return <Detalhe date={route.parts[1]} />;
  return <Lista s={s} />;
}
