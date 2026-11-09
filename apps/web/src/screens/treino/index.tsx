// Treino: sessão do dia (cronômetro, descanso, séries, trocas, mídia) e a biblioteca de exercícios.
// Rotas: #treino · #treino/exercicios?q=&m=&eq=&t= · #treino/exercicio/<id>
import { useEffect, useState } from "preact/hooks";
import { C, S, commit, today } from "../../lib/store/index.ts";
import { EXB, activePlan, gymById, mName, suggestFor } from "../../lib/store/regras.ts";
import { SERVER, api, send } from "../../lib/api/index.ts";
import { Card, Icon, toast } from "../../lib/ui/index.tsx";
import { registerMiniBar } from "../../lib/mini-barra/index.tsx";
import type { Route } from "../../lib/roteador/index.ts";
import { href } from "../../lib/roteador/index.ts";
import { fmt, img } from "../../lib/util.ts";
import { ensureLogs, onTick, restFor, running, startSession, unlockAudio } from "./sessao.ts";
import { openEdit, openFinish, openSkip, openSwap } from "./folhas.tsx";
import { Biblioteca } from "./biblioteca.tsx";
import { Detalhe } from "./detalhe.tsx";

function useTick() { const [, set] = useState(0); useEffect(() => onTick(() => set((x) => x + 1)), []); }

function Descanso() {
  useTick();
  const s = S.session, now = Date.now();
  if (!s?.rest) return <p class="tiny sub">descanso começa ao concluir a série</p>;
  const left = Math.ceil((s.rest.until - now) / 1000);
  return <div class={`rest ${left <= 0 ? "done" : ""}`} role="timer" aria-live="off"><Icon id="clock" /><span class="num">{left > 0 ? C.fmtClock(left * 1000) : "Vai!"}</span>
    <button type="button" class="btn sm" onClick={() => { s.rest.until = Math.max(Date.now(), s.rest.until) + 15000; s.rest.fired = false; commit(); }}>+15</button>
    <button type="button" class="btn sm" onClick={() => { s.rest = null; commit(); }}>ok</button></div>;
}
function Relogio() { useTick(); return <p class="clock num">{C.fmtClock(Date.now() - S.session.startedAt)}</p>; }
function AutoFecha() { useTick(); return <p class="tiny sub">fecha sozinho em {C.fmtClock(C.resolveSession(S.session, Date.now()).remainingMs ?? 0)}</p>; }

// mini-barra global: treino em andamento visto de outra tela
registerMiniBar("treino", (screen) => {
  if (!running() || screen === "treino") return null;
  return <a class="minibar-in" href="#treino"><Icon id="dumb" /><span style="flex:1"><b>Treino em andamento</b> · <MiniTempo /></span><span class="btn sm pri">Continuar</span></a>;
});
function MiniTempo() { useTick(); const s = S.session; const left = s?.rest ? Math.ceil((s.rest.until - Date.now()) / 1000) : 0; return <span class="num">{C.fmtClock(Date.now() - s.startedAt)}{left > 0 ? ` · descanso ${C.fmtClock(left * 1000)}` : ""}</span>; }

async function onMedia(e: Event, exId: string) {
  const t = e.currentTarget as HTMLInputElement, f = t.files?.[0]; if (!f) return; t.value = "";
  if (f.size > 20 * 1024 * 1024) return toast("Até 20 MB — grave 10–15 s em 720p");
  const kind = f.type.startsWith("video") ? "video" : "foto";
  S.media[exId] = { kind, note: "regulagem a anotar", url: URL.createObjectURL(f) }; commit();
  if (SERVER) {
    const ex = EXB[exId];
    try { const r = await api<{ id: string }>("POST", `/api/media?exerciseId=${encodeURIComponent(exId)}&equipmentId=${encodeURIComponent(ex?.eq[0] ?? "")}&gymId=${encodeURIComponent(S.ui.gymId ?? "")}`, null, f); S.media[exId].url = `/api/media/${r.id}`; toast("Mídia salva no seu R2"); }
    catch (err: any) { toast(err?.message || "Falhou o envio; tente no Wi-Fi"); }
  } else toast("Demo: mídia só neste navegador");
}
export function MediaBox({ exId }: { exId: string }) {
  const md = S.media[exId];
  if (md) return <div class="media has">{md.url ? (md.kind === "video" ? <video src={md.url} muted playsInline preload="metadata" controls /> : <img class="prev" src={md.url} alt="" />) : <span class="mbox"><Icon id={md.kind === "video" ? "play" : "cam"} /></span>}<span><b>Sua academia</b> · {md.note || "sem anotação"}</span></div>;
  return <div class="media"><span class="mbox"><Icon id="cam" /></span><span style="flex:1">Sem foto/vídeo do seu aparelho</span><label class="btn sm">Gravar<input type="file" accept="video/*,image/*" capture="environment" class="sr" onChange={(e) => onMedia(e, exId)} /></label></div>;
}

function setDone(i: number, k: number) {
  const plan = S.session.plan as C.DayPlan, it = plan.items[i], l = ensureLogs(it)[k];
  l.done = !l.done;
  if (l.done) {
    const kg = parseFloat(String(l.kg).replace(",", ".")), reps = parseInt(String(l.reps), 10);
    if (!Number.isFinite(reps)) { l.done = false; return toast("Preencha as repetições"); }
    S.session.rest = { until: Date.now() + restFor(plan, i) * 1000, fired: false };
    unlockAudio();
    send("POST", `/api/sessions/${S.session.id}/sets`, { exerciseId: it.exerciseId, muscle: it.muscle, setNo: k + 1, kg: Number.isFinite(kg) ? kg : null, reps, rir: null }).catch(() => {});
  }
  commit();
}

function ExCard({ it, idx, plan, run }: { it: C.PlanItem; idx: number; plan: C.DayPlan; run: boolean }) {
  const ex = EXB[it.exerciseId], sg = suggestFor(it), s = S.session;
  const skipped: string | undefined = s?.skipped?.[it.exerciseId];
  const logs = run ? ensureLogs(it) : [];
  const last = S.history[it.exerciseId];
  const pair = (s?.format ?? S.ui.format) === "superserie" ? <span class="badge">{String.fromCharCode(65 + Math.floor(idx / 2))}{(idx % 2) + 1}</span> : null;
  return <div class={`ex ${skipped ? "skipped" : ""}`} id={`ex-${idx}`}>
    {ex ? <a href={href("treino", ["exercicio", it.exerciseId])} aria-label={`Como fazer: ${it.nm}`}><img class="thumb" src={img(it.exerciseId)} alt="" loading="lazy" width={72} height={72} /></a> : <div class="thumb" style="display:grid;place-items:center"><Icon id="edit" /></div>}
    <div><div class="row between start"><h3>{pair} {it.nm}</h3><div class="row" style="gap:4px">{ex?.stretch && <span class="badge">alongado</span>}{it.manual && <span class="badge warn">seu · em revisão</span>}</div></div>
      <div class="meta num"><b style="color:var(--txt)">{it.sets} × {it.reps[0]}–{it.reps[1]}</b><span>{mName(it.muscle)}</span><span>descanso {restFor(plan, idx)}s</span>{sg.kg ? <span>sugestão {fmt(sg.kg, 1)} kg</span> : null}</div>
      {!run && sg.note && <p class="tiny sub" style="margin-top:2px">{sg.note}</p>}
      {skipped && <p class="small" style="margin-top:6px;color:var(--warn)">Não feito · {skipped.replace("_", " ")} <button type="button" class="btn sm ghost" onClick={() => { delete s.skipped[it.exerciseId]; commit(); }}>desfazer</button></p>}
      {run && !skipped && <div class="sets">{logs.map((l, k) => <div key={k} class={`setrow num ${l.done ? "done" : ""}`}><span class="sub">{k + 1}</span><span class="prev">{last?.[k] ? `${fmt(last[k].kg, 1)}×${last[k].reps}` : "—"}</span>
        <input class="input" inputMode="decimal" aria-label={`kg série ${k + 1}`} value={l.kg} onInput={(e) => { l.kg = e.currentTarget.value; }} onBlur={() => commit()} />
        <input class="input" inputMode="numeric" aria-label={`reps série ${k + 1}`} value={l.reps} onInput={(e) => { l.reps = e.currentTarget.value; }} onBlur={() => commit()} />
        <button type="button" class="ck" aria-pressed={l.done} onClick={() => setDone(idx, k)} aria-label={`Concluir série ${k + 1}`}><Icon id="check" /></button></div>)}
        <button type="button" class="btn sm ghost" style="justify-self:start" onClick={() => { const lst = logs[logs.length - 1]; logs.push({ kg: lst?.kg ?? "", reps: lst?.reps ?? it.reps[0], done: false }); it.sets = logs.length; commit(); }}><Icon id="plus" />série</button></div>}
      <MediaBox exId={it.exerciseId} />
      <div class="acts">{it.alts.length > 0 && <button type="button" class="btn sm" onClick={() => openSwap(idx)}><Icon id="swap" />Trocar</button>}<button type="button" class="btn sm" onClick={() => openEdit(idx)}><Icon id="edit" />Editar</button>
        {!skipped && <button type="button" class="btn sm" onClick={() => openSkip(idx)}><Icon id="skip" />Não fiz</button>}</div>
    </div></div>;
}

function SessaoHoje() {
  const s = S.session, run = running();
  const plan = activePlan();
  if (s?.finishedAt && s.date === today) {
    const out = plan.items.map((it) => ({ it, o: C.exerciseOutcome(it.sets, (s.logs[it.exerciseId] ?? []).filter((l: any) => l.done).length, !!s.skipped[it.exerciseId]) }));
    return <><p class="kicker">Treino de hoje · encerrado {s.closedBy === "auto" ? "automaticamente (2 h)" : ""}</p><h1>{plan.name}</h1>
      <div class="grid g3" style="margin-top:14px"><Card><p class="kicker">Duração</p><p class="big num">{C.fmtClock(s.finishedAt - s.startedAt)}</p></Card>
        <Card><p class="kicker">Séries feitas</p><p class="big num">{Object.values(s.logs).flat().filter((l: any) => l.done).length}<span class="small sub">/{plan.setsTotal}</span></p></Card>
        <Card><p class="kicker">Revisão</p><p class="small" style="margin-top:6px">{s.feedback ? "Feedback salvo. O Claude usa na revisão de domingo." : "Sem feedback (fechado sozinho)."}</p></Card></div>
      <Card style="margin-top:12px">{out.map(({ it, o }, i) => <div class="row between" key={i} style="padding:6px 0"><span>{it.nm}</span><span class={`badge ${o === "feito" ? "ok" : o === "parcial" ? "warn" : o === "nao_fiz" ? "bad" : ""}`}>{o.replace("_", " ")}</span></div>)}</Card>
      <button type="button" class="btn" style="margin-top:12px" onClick={() => { S.session = null; commit(); }}>Treinar de novo hoje</button></>;
  }
  const pend = S.edits.filter((e) => e.review === "pendente");
  return <>
    {run && <div class="timerbar"><div><p class="tiny sub">tempo</p><Relogio /></div><div style="flex:1;min-width:0"><Descanso /></div>
      <button type="button" class="btn pri" onClick={openFinish}><Icon id="check" />Terminar</button></div>}
    <div class="row between wrapx start" style="margin-bottom:12px"><div><p class="kicker">Treino de hoje · {gymById(s?.gymId ?? S.ui.gymId)?.name}</p><h1>{plan.name}</h1>
      <p class="small sub num" style="margin-top:4px">{plan.setsTotal} séries · ~{plan.estMinutes} min · dupla progressão, sobrar 1–2 reps</p></div>
      {run ? <AutoFecha /> : <button type="button" class="btn pri lg" onClick={startSession}><Icon id="play" />Começar</button>}</div>
    {!run && <div class="note" style="margin-bottom:12px"><Icon id="info" /><span>Ao começar, o dia conta como <b>fui</b>. Esqueceu de terminar? Fecha sozinho em <b>2 h</b> com o que foi registrado. O cronômetro de descanso vibra e apita.</span></div>}
    <div class="grid dash"><div class="stack">
      {plan.prehab.length > 0 && <Card><p class="kicker">Aquecimento · fortalecimento pela dor marcada</p>{plan.prehab.map((p) => <div class="row" key={p.exerciseId} style="margin-top:8px"><img class="thumb" style="width:48px;height:48px" src={img(p.exerciseId)} alt="" loading="lazy" /><div><b>{p.nm}</b><p class="small sub">2 × {p.reps[0]}–{p.reps[1]}, leve</p></div></div>)}</Card>}
      <Card>{plan.items.length ? plan.items.map((it, i) => <ExCard key={it.exerciseId + i} it={it} idx={i} plan={plan} run={run} />) : <p class="sub">Nada para hoje com esses aparelhos.</p>}</Card></div>
      <div class="stack"><Card><h2>Como foi montado</h2><ul class="small" style="padding-left:18px;margin:10px 0 0;display:grid;gap:6px">{plan.why.map((w, i) => <li key={i}>{w}</li>)}
        <li>Só aparelhos de {gymById(S.ui.gymId)?.name}; trocas já vêm calculadas (sem gastar Claude).</li></ul></Card>
        <Card><h2>Mídia da sua academia</h2><p class="small sub" style="margin-top:4px">Grave 10–15 s mostrando a regulagem (pino, banco, pegada). Fica ligada ao exercício e ao aparelho; aparece nas próximas vezes e nas trocas.</p></Card>
        {pend.length > 0 && <Card><h2>Edições em revisão</h2>{pend.map((e) => <div key={e.id}><p class="small" style="margin-top:6px">{e.label}</p>{e.issues.map((x: any, i: number) => <p key={i} class="tiny" style={`color:var(--${x.severity === "erro" ? "bad" : "warn"})`}>{x.msg}</p>)}</div>)}</Card>}
      </div></div></>;
}

export default function Treino({ route }: { route: Route }) {
  const sub = route.parts[0];
  const tab = sub === "exercicios" || sub === "exercicio" ? "ex" : "hoje";
  return <>
    {sub !== "exercicio" && <nav class="tabs subnav" aria-label="Treino">
      <a class="chip" href="#treino" aria-current={tab === "hoje" ? "page" : undefined}>Treino de hoje</a>
      <a class="chip" href="#treino/exercicios" aria-current={tab === "ex" ? "page" : undefined}><Icon id="search" />Exercícios</a></nav>}
    {sub === "exercicio" ? <Detalhe id={route.parts[1] ?? ""} /> : tab === "ex" ? <Biblioteca query={route.query} /> : <SessaoHoje />}
  </>;
}
