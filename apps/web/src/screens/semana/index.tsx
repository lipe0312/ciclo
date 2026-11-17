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
import { acaoDia, diaDe, garantirSemana, gerarTreino, getSemana, getVazio, planoDoDia } from "./estado.ts";
import type { Dia, Semana } from "./estado.ts";
import { AvisoFalta } from "./aviso.tsx";
import { abrirMover, abrirRegenerar, abrirTrocar, abrirVersoes, aberto, diaCurto } from "./folhas.tsx";
import { abrirGerarOutro } from "../treino/gerar.tsx";
import "./semana.css";
import { Estado } from "../../lib/estado/index.tsx";
import { AbasTreino } from "../../lib/abas-treino/index.tsx";

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

/** #108 Selo de quem montou o dia: revisão da IA (treino gerado pelo app), Chat ou você. */
export function SeloOrigem({ d, p }: { d: Dia; p: C.DayPlan }) {
  const txt = p.revisao === "pendente" ? "revisão da IA pendente" : p.revisao === "revisada" ? "revisado pela IA" : p.revisao === "mantida" ? "gerado pelo app · revisado"
    : d.source === "claude" ? "montado pelo Chat" : d.source === "voce" ? "escolha sua" : null;
  return txt ? <span class={`badge${p.revisao === "pendente" ? " warn" : ""}`}>{txt}</span> : null;
}

/** #108 Dia sem treino: o botão é Gerar treino (nada é gerado ao abrir a tela). */
export const semTreino = (d: Dia) => d.status === "livre" || (d.status === "folga" && d.date >= today && !planoDoDia(d));

function DiaCard({ d }: { d: Dia }) {
  const p = planoDoDia(d);
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
        {(d.source !== "auto" || p.revisao) && <p class="tiny" style="margin-top:4px"><SeloOrigem d={d} p={p} /></p>}
        {d.warn.map((w, i) => <p key={i} class="tiny" style="margin-top:4px;color:var(--warn)">{w}</p>)}
      </> : d.status === "livre" ? <p class="small sub" style="margin-top:2px">Sem treino hoje. Se quiser treinar, gere um: só o que falta, sem passar do orçamento.</p> : null}
      {d.cardio && <p class="tiny" style="margin-top:4px"><Icon id={C.MODALIDADES.find((m) => m.id === d.cardio!.type)?.icon ?? "bolt"} />{" "}Cardio {d.cardio.minutes} min · {C.INTENSITIES[d.cardio.intensity].nm.toLowerCase()}</p>}
      <div class="sem-acts uma">
        {p && <a class="btn" href={href("semana", ["dia", d.date])}>Ver</a>}
        {pode && d.kind !== "folga" && <button type="button" class="btn" onClick={() => abrirTrocar(d)}>Trocar</button>}
        {pode && <button type="button" class="btn" onClick={() => abrirMover(d)}>{d.kind !== "folga" ? "Mover" : "Planejar"}</button>}
        {semTreino(d) && <button type="button" class={`btn${d.status === "livre" ? " pri" : ""}`} onClick={() => void gerarTreino(d.date)}><Icon id="bolt" />Gerar treino</button>}
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
  if (!s || !d) return <Estado tipo="vazio" titulo="Dia fora desta semana" acao={{ label: "Ver a semana", href: "#semana" }} />;
  const p = planoDoDia(d); // #108 o treino salvo do dia, nunca um extra calculado na hora
  const pode = aberto(d);
  return <>
    <p style="margin-bottom:10px"><span class={`sem-st st-${d.status}`}>{STATUS[d.status]}</span></p>
    <p class="kicker">{longDate(date)}{d.gymId ? ` · ${gymById(d.gymId)?.name ?? ""}` : ""}</p>
    <h1 style="margin:2px 0 6px">{p?.name ?? (d.status === "livre" ? "Sem treino" : "Folga")}</h1>
    {p && (d.source !== "auto" || p.revisao) && <p class="tiny" style="margin-bottom:6px"><SeloOrigem d={d} p={p} /></p>}
    {p && <p class="small sub num">{p.items.length} exercícios · {p.setsTotal} séries · ~{p.estMinutes} min{d.opts.format && d.opts.format !== "tradicional" ? ` · ${d.opts.format === "superserie" ? "superséries" : "circuito"}` : ""}</p>}
    <div class="grid dash" style="margin-top:14px"><div class="stack">
      {p && p.items.length > 0 ? <Card><h2>Exercícios</h2><div class="sem-exs">{[...p.prehab, ...p.items].map((it, i) => <Exercicio key={i} it={it} />)}</div></Card>
        : <Card><p class="small">{p?.why[0] ?? (semTreino(d) ? "Nenhum treino neste dia. Gere um só se for treinar: sai na hora e a IA revisa depois." : "Dia de descanso. Recuperar também conta.")}</p>
          {semTreino(d) && <button type="button" class="btn pri full" style="margin-top:10px" onClick={() => void gerarTreino(d.date)}><Icon id="bolt" />Gerar treino</button>}</Card>}
    </div><div class="stack">
      {d.cardio && <Card><h2>Cardio previsto</h2><p class="small" style="margin-top:6px"><b>{C.CARDIO_BY_ID[d.cardio.type]?.nm} · {d.cardio.minutes} min · {C.INTENSITIES[d.cardio.intensity].nm.toLowerCase()}</b></p><p class="tiny sub">{d.cardio.why}</p></Card>}
      {p && <Card><h2>Por quê</h2><ul class="sem-motivos">{p.why.map((w, i) => <li key={i}>{w}</li>)}{d.warn.map((w, i) => <li key={`w${i}`} class="menos">{w}</li>)}</ul></Card>}
      {pode && <Card><h2>Mudar este dia</h2><div class="sem-acts uma">
        {d.kind !== "folga" && <button type="button" class="btn pri" onClick={() => abrirGerarOutro(d.date)}><Icon id="cycle" />Gerar outro treino</button>}
        {d.kind !== "folga" && <button type="button" class="btn" onClick={() => abrirTrocar(d)}><Icon id="swap" />Trocar geração</button>}
        <button type="button" class="btn" onClick={() => abrirMover(d)}>{d.kind !== "folga" ? "Mover" : "Planejar treino"}</button>
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
  // #77 a mesma barra de abas do Treino, com Semana marcada (o detalhe do dia é um nível abaixo, sem abas)
  const abas = <AbasTreino atual="semana" />;
  if (!s) return <>{abas}<p class="kicker">Semana</p><h1 style="margin-bottom:14px">Semana</h1>
    <Card><p class="small">{getVazio() ?? "Carregando a semana…"}</p>{getVazio() && <a class="btn pri" style="margin-top:10px" href="#primeiros-passos">Perfil de treino</a>}</Card></>;
  if (route.parts[0] === "dia" && route.parts[1]) return <Detalhe date={route.parts[1]} />;
  return <>{abas}<Lista s={s} /></>;
}
