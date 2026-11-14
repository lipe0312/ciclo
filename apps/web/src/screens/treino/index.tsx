// Espaço Treino. Abas: Hoje · Semana (tela própria) · Exercícios · Histórico · Cardio; e o modo treino em tela cheia.
// Rotas: #treino · #treino/ativo[/<i>] · #treino/exercicios?q=&m=&eq=&t= · #treino/exercicio/<id> · #treino/historico · #treino/cardio
import { useEffect, useState } from "preact/hooks";
import { C, S, commit, today } from "../../lib/store/index.ts";
import { EXB, activePlan, gymById, mName, suggestFor } from "../../lib/store/regras.ts";
import { Card, Icon } from "../../lib/ui/index.tsx";
import { PUSH_TEXT, enablePush, pushState } from "../../lib/notificacao/index.ts";
import type { PushState } from "../../lib/notificacao/index.ts";
import { registerMiniBar } from "../../lib/mini-barra/index.tsx";
import { href, parse } from "../../lib/roteador/index.ts";
import type { Route } from "../../lib/roteador/index.ts";
import { fmt } from "../../lib/util.ts";
import { OUTCOME_TXT, REASON_TXT, curIdx, running, startSession } from "./sessao.ts";
import { openEdit, openSwap } from "./folhas.tsx";
import { Biblioteca, ExImgs } from "./biblioteca.tsx";
import { Detalhe } from "./detalhe.tsx";
import { Historico } from "./historico.tsx";
import { Cardio, cardioName } from "./cardio.tsx";
import { abrirGerarOutro, anterior, desfazerGeracao } from "./gerar.tsx";
import { diaDe, garantirSemana } from "../semana/estado.ts";
import { Relogio, Timeline, useTick } from "./timeline.tsx";

export { MediaBox } from "./midia.tsx";

// mini-barra global: treino em andamento visto de qualquer tela (menos do próprio modo treino)
registerMiniBar("treino", () => {
  if (!running()) return null;
  const r = parse(); if (r.screen === "treino" && r.parts[0] === "ativo") return null;
  return <a class="minibar-in" href={href("treino", ["ativo", String(curIdx())])} aria-label="Treino em andamento: voltar ao exercício atual"><Icon id="dumb" /><span class="minibar-t"><b>Treino em andamento</b><MiniTempo /></span><span class="btn sm pri">Voltar</span></a>;
});
function MiniTempo() {
  useTick();
  const s = S.session, left = s?.rest ? Math.ceil((s.rest.until - Date.now()) / 1000) : 0;
  return <span class="num tiny">{C.fmtClock(Date.now() - s.startedAt)}{left > 0 ? ` · descanso ${C.fmtClock(left * 1000)}` : ""}</span>;
}

function AvisoPush() {
  const [st, setSt] = useState<PushState | null>(null);
  useEffect(() => { pushState().then(setSt).catch(() => setSt("indisponivel")); }, []);
  if (!st || st === "ativo") return null;
  return <div class="note" style="margin-top:12px"><Icon id="info" /><span style="flex:1">{PUSH_TEXT[st]}
    {st === "pedir" && <> <button type="button" class="btn sm" onClick={() => enablePush().then(setSt)}>Ligar aviso</button></>}</span></div>;
}

/** " (+2,0 kg, −1,5 reps)": só o que mudou; sem mudança nenhuma = sem parênteses. */
const sgn = (n: number) => (n > 0 ? "+" : "") + fmt(n, 1);
const deltaTxt = (kg: number, reps: number) => { const p = [kg ? `${sgn(kg)} kg` : "", reps ? `${sgn(reps)} reps` : ""].filter(Boolean); return p.length ? ` (${p.join(", ")})` : " (igual)"; };

/** Resumo do treino encerrado: duração, séries, volume (vs média), PRs e médias vs última vez. */
function Resumo({ s }: { s: any }) {
  const sm: C.SessionSummary | undefined = s.summary;
  const plan = activePlan();
  const out = plan.items.map((it) => ({ it, o: C.exerciseOutcome(it.sets, (s.logs[it.exerciseId] ?? []).filter((l: any) => l.done).length, !!s.skipped[it.exerciseId]) }));
  const kind: Record<string, string> = { e1rm: "e1RM", carga: "carga", reps: "reps" };
  return <>
    <div class="grid g3" style="margin-top:14px"><Card><p class="kicker">Duração</p><p class="big num">{C.fmtClock(s.finishedAt - s.startedAt)}</p></Card>
      <Card><p class="kicker">Séries feitas</p><p class="big num">{sm?.sets ?? Object.values(s.logs).flat().filter((l: any) => l.done).length}<span class="small sub">/{plan.setsTotal}</span></p></Card>
      <Card><p class="kicker">Volume</p><p class="big num">{fmt(sm?.volume ?? 0)}<span class="small sub"> kg</span></p>
        {sm?.vs.pct != null && <p class="small num" style={`margin-top:4px;color:var(--${sm.vs.pct >= 0 ? "ok" : "warn"})`}>{sm.vs.pct >= 0 ? "+" : ""}{sm.vs.pct}% vs média das últimas 4</p>}</Card></div>
    {sm && sm.prs.length > 0 && <Card style="margin-top:12px"><h2>Recordes</h2><div class="row wrapx" style="gap:6px;margin-top:8px">{sm.prs.map((p, i) => <span class="badge ok num" key={i}>PR {kind[p.kind]} · {EXB[p.exerciseId]?.nm ?? p.exerciseId} {fmt(p.value, p.value % 1 ? 1 : 0)}{p.kind === "reps" ? " reps" : " kg"} (antes {fmt(p.prev, p.prev % 1 ? 1 : 0)})</span>)}</div></Card>}
    {sm && sm.perExercise.length > 0 && <Card style="margin-top:12px"><h2>Médias vs última vez</h2>{sm.perExercise.map((e) => <div class="row between wrapx" key={e.exerciseId} style="padding:8px 0;border-top:1px solid var(--borda)">
      <span style="min-width:0">{EXB[e.exerciseId]?.nm ?? e.exerciseId}</span>
      <span class="num small">{fmt(e.avgKg, 1)} kg × {fmt(e.avgReps, 1)}{e.deltaReps != null ? <span class="sub"> · antes {fmt(e.lastAvgKg!, 1)} × {fmt(e.lastAvgReps!, 1)}{deltaTxt(e.deltaKg!, e.deltaReps)}</span> : <span class="sub"> · 1ª vez</span>}</span></div>)}</Card>}
    <Card style="margin-top:12px">{out.map(({ it, o }, i) => <div class="row between" key={i} style="padding:6px 0"><span>{it.nm}</span><span class={`badge ${o === "feito" ? "ok" : o === "parcial" ? "warn" : o === "nao_fiz" ? "bad" : ""}`}>{OUTCOME_TXT[o] ?? o}</span></div>)}</Card></>;
}

/** Cardio previsto para hoje pela dose do objetivo (some se um esporte já abateu). */
function CardioHoje() {
  const c = diaDe(today)?.cardio;
  if (!c) return null;
  const m = C.MODALIDADES.find((x) => x.id === c.type);
  return <Card><p class="kicker">Cardio previsto hoje</p>
    <div class="cd-plan" style="margin-top:8px">{m && <Icon id={m.icon} />}<div><b>{cardioName(c.type)} · {c.minutes} min · {C.INTENSITIES[c.intensity].nm.toLowerCase()}</b><p class="tiny sub">{c.why}</p></div></div>
    <a class="btn full" style="margin-top:10px" href="#treino/cardio"><Icon id="plus" />Registrar cardio</a></Card>;
}

function Hoje() {
  useEffect(() => { void garantirSemana(); }, []);
  const s = S.session, run = running();
  const plan = activePlan();
  if (s?.finishedAt && s.date === today) {
    return <><p class="kicker">Treino de hoje · encerrado {s.closedBy === "auto" ? "automaticamente (2 h)" : ""}</p><h1>{plan.name}</h1>
      <p class="small sub" style="margin-top:6px">{s.feedback ? "Feedback salvo. O Chat usa na revisão de domingo." : "Sem feedback (fechado sozinho)."}</p>
      <Resumo s={s} />
      <button type="button" class="btn" style="margin-top:12px" onClick={() => { S.session = null; commit(); }}>Treinar de novo hoje</button></>;
  }
  const pend = S.edits.filter((e) => e.review === "pendente");
  return <>
    <div class="row between wrapx start" style="margin-bottom:12px"><div><p class="kicker">Treino de hoje · {gymById(s?.gymId ?? S.ui.gymId)?.name}</p><h1>{plan.name}</h1>
      <p class="small sub num" style="margin-top:4px">{plan.setsTotal} séries · ~{plan.estMinutes} min · dupla progressão, sobrar 1–2 reps</p></div>
      {run ? <a class="btn pri lg" href={href("treino", ["ativo", String(curIdx())])}><Icon id="play" />Continuar<span class="num"> · <Relogio /></span></a>
        : <button type="button" class="btn pri lg" onClick={startSession} disabled={!plan.items.length}><Icon id="play" />Começar</button>}</div>
    <div class="row wrapx" style="gap:8px;margin-bottom:12px"><button type="button" class="btn" onClick={() => abrirGerarOutro()}><Icon id="cycle" />Gerar outro treino</button>
      {anterior?.date === today && <button type="button" class="btn ghost" onClick={desfazerGeracao}><Icon id="back" />Desfazer</button>}</div>
    {plan.leve && <p class="small" style="margin-bottom:12px"><span class="badge warn">mais leve hoje</span> <span class="sub">sobrando 3 repetições em cada série.</span></p>}
    {!run && <div class="note" style="margin-bottom:12px"><Icon id="info" /><span>Ao começar, o dia conta como <b>fui</b> e o treino abre em tela cheia: dá para sair, ver a comida ou falar com o Chat e voltar ao mesmo ponto. Esqueceu de terminar? Fecha sozinho em <b>2 h</b> com o que foi registrado.</span></div>}
    <div class="grid dash"><div class="stack">
      {plan.prehab.length > 0 && <Card><p class="kicker">Aquecimento · fortalecimento pela dor marcada</p>{plan.prehab.map((p) => <div class="row" key={p.exerciseId} style="margin-top:8px"><img class="thumb" style="width:48px;height:48px" src={`/img/ex/${encodeURIComponent(p.exerciseId)}.webp`} alt="" loading="lazy" /><div><b>{p.nm}</b><p class="small sub">2 × {p.reps[0]}–{p.reps[1]}, leve</p></div></div>)}</Card>}
      {plan.items.length ? plan.items.map((it, i) => <CardDia key={it.exerciseId + i} it={it} idx={i} run={run} />) : <Card><p class="sub">Nada para hoje com esses aparelhos.</p></Card>}</div>
      <div class="stack"><CardioHoje /><Card><h2>Como foi montado</h2><ul class="small" style="padding-left:18px;margin:10px 0 0;display:grid;gap:6px">{plan.why.map((w, i) => <li key={i}>{w}</li>)}
        <li>Só aparelhos de {gymById(S.ui.gymId)?.name}; trocas já vêm calculadas (sem gastar o Chat).</li></ul></Card>
        <Card><h2>Mídia da sua academia</h2><p class="small sub" style="margin-top:4px">Grave 10–15 s mostrando a regulagem (pino, banco, pegada). Fica ligada ao exercício e ao aparelho; aparece nas próximas vezes e nas trocas.</p></Card>
        <Card><h2>Descanso com a tela bloqueada</h2><AvisoPush /></Card>
        {pend.length > 0 && <Card><h2>Edições em revisão</h2>{pend.map((e) => <div key={e.id}><p class="small" style="margin-top:6px">{e.label}</p>{e.issues.map((x: any, i: number) => <p key={i} class="tiny" style={`color:var(--${x.severity === "erro" ? "bad" : "warn"})`}>{x.msg}</p>)}</div>)}</Card>}
      </div></div></>;
}

/** Card grande do exercício do dia: imagem, séries × reps, carga sugerida; antes de começar dá para trocar/editar. */
function CardDia({ it, idx, run }: { it: C.PlanItem; idx: number; run: boolean }) {
  const cat = C.CATALOG_BY_ID[it.exerciseId], sg = suggestFor(it), skipped = S.session?.skipped?.[it.exerciseId];
  const logs = S.session?.logs?.[it.exerciseId] ?? [], d = logs.filter((l: { done: boolean }) => l.done).length;
  return <Card cls={skipped ? "skipped" : ""}>
    {cat && <a href={href("treino", ["exercicio", it.exerciseId])} aria-label={`Como fazer: ${it.nm}`}><ExImgs it={cat} /></a>}
    <div class="row between start" style="margin-top:10px"><h3 style="font-size:17px">{it.nm}</h3>{it.manual && <span class="badge warn">seu · em revisão</span>}</div>
    <p class="meta num small" style="margin-top:2px"><b style="color:var(--txt)">{it.sets} × {it.reps[0]}–{it.reps[1]}</b> · {mName(it.muscle)}{sg.kg ? <> · sugestão <b style="color:var(--txt)">{fmt(sg.kg, 1)} kg × {sg.reps}</b></> : null}</p>
    {sg.note && <p class="tiny sub" style="margin-top:2px">{sg.note}</p>}
    {run && <p class="small num" style="margin-top:6px">{skipped ? `Não feito · ${REASON_TXT[String(skipped)] ?? skipped}` : `${d}/${Math.max(it.sets, logs.length)} séries`}</p>}
    {!run && <div class="acts" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">{it.alts.length > 0 && <button type="button" class="btn" onClick={() => openSwap(idx)}><Icon id="swap" />Trocar</button>}<button type="button" class="btn" onClick={() => openEdit(idx)}><Icon id="edit" />Editar</button></div>}
  </Card>;
}

export default function Treino({ route }: { route: Route }) {
  const sub = route.parts[0];
  const tab = sub === "exercicios" || sub === "exercicio" ? "ex" : sub === "historico" ? "hist" : sub === "cardio" ? "cardio" : "hoje";
  if (sub === "ativo") return <Timeline idx={route.parts[1] != null && /^\d+$/.test(route.parts[1]) ? Number(route.parts[1]) : null} />;
  return <>
    {sub !== "exercicio" && <nav class="tabs subnav" aria-label="Treino">
      <a class="chip" href="#treino" aria-current={tab === "hoje" ? "page" : undefined}>Hoje</a>
      <a class="chip" href="#semana">Semana</a>
      <a class="chip" href="#treino/exercicios" aria-current={tab === "ex" ? "page" : undefined}>Exercícios</a>
      <a class="chip" href="#treino/historico" aria-current={tab === "hist" ? "page" : undefined}>Histórico</a>
      <a class="chip" href="#treino/cardio" aria-current={tab === "cardio" ? "page" : undefined}>Cardio</a></nav>}
    {sub === "exercicio" ? <Detalhe id={route.parts[1] ?? ""} /> : tab === "ex" ? <Biblioteca query={route.query} /> : tab === "hist" ? <Historico /> : tab === "cardio" ? <Cardio /> : <Hoje />}
  </>;
}
