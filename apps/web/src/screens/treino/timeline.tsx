// Modo treino: timeline em tela cheia. O exercício atual em destaque (imagem grande, séries, carga, médias), os próximos em
// miniatura, descanso e "Concluir série" no rodapé (alcance do polegar). Sair (X) não encerra: a mini-barra leva de volta.
import { useEffect, useRef, useState } from "preact/hooks";
import { C, S, commit } from "../../lib/store/index.ts";
import { EXB, mName, suggestFor } from "../../lib/store/regras.ts";
import { Icon } from "../../lib/ui/index.tsx";
import { fmt, img } from "../../lib/util.ts";
import { ExImgs } from "./biblioteca.tsx";
import { openEdit, openComoFazer, openFinish, openSkip, openSwap } from "./folhas.tsx";
import { MediaBox } from "./midia.tsx";
import { addSet, adjustRest, currentSets, curIdx, doneSets, dropSet, editedSet, ensureLogs, goEx, nextSetOf, onTick, pastAll, pastOf, progress, refsOf, restFor, running, setCur, skipRest, toggleSet } from "./sessao.ts";

export function useTick() { const [, set] = useState(0); useEffect(() => onTick(() => set((x) => x + 1)), []); }
const kgReps = (kg: number, reps: number) => `${fmt(kg, kg % 1 ? 1 : 0)} kg × ${fmt(reps, reps % 1 ? 1 : 0)}`;

export function Relogio() { useTick(); return <span class="clock num" role="timer" aria-label="Tempo de treino">{C.fmtClock(Date.now() - S.session.startedAt)}</span>; }

/** Contagem do descanso: grande, +15/−15 e pular. */
function Descanso() {
  useTick();
  const r = S.session.rest, left = r ? Math.ceil((r.until - Date.now()) / 1000) : 0;
  if (!r) return null;
  return <div class={`tl-rest ${left <= 0 ? "done" : ""}`} role="group" aria-label="Descanso">
    <span class="tl-rest-t num" role="timer" aria-live="off">{left > 0 ? C.fmtClock(left * 1000) : "Vai!"}</span>
    <button type="button" class="btn" onClick={() => adjustRest(-15000)} aria-label="Menos 15 segundos">−15</button>
    <button type="button" class="btn" onClick={() => adjustRest(15000)} aria-label="Mais 15 segundos">+15</button>
    <button type="button" class="btn" onClick={skipRest}>Pular</button></div>;
}

/** Médias e referências do exercício: última vez, média das últimas 4, melhor marca e e1RM de hoje. */
function Refs({ exId }: { exId: string }) {
  const r = refsOf(exId), today = C.setStats(doneSets(exId));
  if (!r.last) return <p class="tiny sub" style="margin-top:8px">Primeira vez neste exercício: sem referência ainda. O app aprende daqui.</p>;
  return <dl class="refs num" aria-label="Médias e referências">
    <div><dt>Última vez</dt><dd>{kgReps(r.last.avgKg, r.last.avgReps)}</dd><dd class="tiny sub">média das {r.last.n} séries</dd></div>
    <div><dt>Últimas {r.avg4!.sessions}</dt><dd>{kgReps(r.avg4!.avgKg, r.avg4!.avgReps)}</dd><dd class="tiny sub">média por série</dd></div>
    <div><dt>Melhor marca</dt><dd>{kgReps(r.best!.kg, r.best!.reps)}</dd><dd class="tiny sub">e1RM {fmt(r.best!.e1rm, 1)} kg</dd></div>
    <div><dt>e1RM hoje</dt><dd>{today ? `${fmt(today.bestE1rm, 1)} kg` : "—"}</dd><dd class="tiny sub">{today && today.bestE1rm > r.best!.e1rm + 1e-9 ? "recorde!" : "melhor série feita"}</dd></div></dl>;
}

function SetRows({ idx, it }: { idx: number; it: C.PlanItem }) {
  const logs = ensureLogs(it), lastSets = pastOf(it.exerciseId)[0]; // a mesma série da sessão anterior, ao lado de cada linha
  const prev = (k: number) => { const x = lastSets?.[k]; return x ? kgReps(x.kg, x.reps) : "—"; };
  return <div class="tl-sets">
    <div class="tl-set head tiny sub" aria-hidden="true"><span>#</span><span>última</span><span>kg</span><span>reps</span><span /></div>
    {logs.map((l, k) => <div key={k} class={`tl-set num ${l.done ? "done" : ""}`}>
      <span class="sub">{k + 1}</span><span class="prev tiny sub">{prev(k)}</span>
      <input class="input" inputMode="decimal" aria-label={`kg série ${k + 1}`} value={l.kg} onInput={(e) => { l.kg = e.currentTarget.value; }} onBlur={() => editedSet(idx, k)} />
      <input class="input" inputMode="numeric" aria-label={`reps série ${k + 1}`} value={l.reps} onInput={(e) => { l.reps = e.currentTarget.value; }} onBlur={() => editedSet(idx, k)} />
      <button type="button" class="ck" aria-pressed={l.done} onClick={() => toggleSet(idx, k)} aria-label={l.done ? `Desfazer série ${k + 1}` : `Concluir série ${k + 1}`}><Icon id="check" /></button></div>)}
    <div class="row wrapx" style="gap:8px"><button type="button" class="btn" onClick={() => addSet(idx)}><Icon id="plus" />série</button>
      {logs.length > 1 && !logs[logs.length - 1].done && <button type="button" class="btn ghost" onClick={() => dropSet(idx)}>− série</button>}</div></div>;
}

function Atual({ it, idx }: { it: C.PlanItem; idx: number }) {
  const cat = C.CATALOG_BY_ID[it.exerciseId], sg = suggestFor(it), skipped: string | undefined = S.session.skipped[it.exerciseId], ex = EXB[it.exerciseId];
  const ref = useRef<HTMLElement>(null);
  useEffect(() => { ref.current?.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); }, [idx]);
  return <article class={`tl-cur ${skipped ? "skipped" : ""}`} ref={ref} aria-current="step" aria-label={`Exercício atual: ${it.nm}`}>
    {cat ? <ExImgs it={cat} size="big" /> : <div class="exim big vazio"><Icon id="edit" /></div>}
    <div class="row between start" style="margin-top:10px"><h2 style="font-size:20px">{it.nm}</h2>
      <div class="row" style="gap:4px">{ex?.stretch && <span class="badge">alongado</span>}{it.manual && <span class="badge warn">seu · em revisão</span>}</div></div>
    <p class="meta num"><b style="color:var(--txt)">{it.sets} × {it.reps[0]}–{it.reps[1]}</b> · {mName(it.muscle)} · descanso {restFor(S.session.plan, idx)}s{sg.kg ? <> · sugestão <b style="color:var(--txt)">{fmt(sg.kg, 1)} kg × {sg.reps}</b></> : null}</p>
    {sg.note && <p class="tiny sub" style="margin-top:2px">{sg.note}</p>}
    {skipped ? <p class="small" style="margin-top:8px;color:var(--warn)">Não feito · {skipped.replace("_", " ")} <button type="button" class="btn sm ghost" onClick={() => { delete S.session.skipped[it.exerciseId]; commit(); }}>desfazer</button></p>
      : <><Refs exId={it.exerciseId} /><SetRows idx={idx} it={it} /></>}
    <div class="acts"><button type="button" class="btn" onClick={() => openComoFazer(it.exerciseId)}><Icon id="info" />Ver como fazer</button>
      {it.alts.length > 0 && <button type="button" class="btn" onClick={() => openSwap(idx)}><Icon id="swap" />Trocar</button>}
      <button type="button" class="btn" onClick={() => openEdit(idx)}><Icon id="edit" />Editar</button>
      {!skipped && <button type="button" class="btn" onClick={() => openSkip(idx)}><Icon id="skip" />Não fiz</button>}</div>
    <MediaBox exId={it.exerciseId} />
  </article>;
}

function Mini({ it, idx, cur }: { it: C.PlanItem; idx: number; cur: number }) {
  const logs = S.session.logs[it.exerciseId] ?? [], d = logs.filter((l: { done: boolean }) => l.done).length, n = Math.max(it.sets, logs.length), skipped = S.session.skipped[it.exerciseId];
  const state = skipped ? "não fiz" : d >= n && n > 0 ? "feito" : d > 0 ? `${d}/${n}` : `${n} × ${it.reps[0]}–${it.reps[1]}`;
  return <button type="button" class={`tl-mini ${skipped ? "skipped" : ""} ${d >= n && n > 0 ? "feito" : ""}`} onClick={() => goEx(idx)} aria-label={`${it.nm}, ${state}. Abrir`}>
    <img class="thumb" src={img(it.exerciseId)} alt="" loading="lazy" width={56} height={56} />
    <span class="tl-mini-t"><b>{it.nm}</b><span class="tiny sub num">{mName(it.muscle)} · {state}</span></span>
    {d >= n && n > 0 ? <Icon id="check" cls="ok" /> : <span class="tiny sub num">{idx < cur ? "voltar" : idx - cur === 1 ? "próximo" : ""}</span>}</button>;
}

/** Rodapé: descanso + ação principal ao alcance do polegar. */
function Rodape({ cur }: { cur: number }) {
  const s = S.session, items: C.PlanItem[] = s.plan.items, p = progress();
  const k = s.skipped[items[cur]?.exerciseId] ? -1 : nextSetOf(cur);
  const logs = items[cur] ? ensureLogs(items[cur]) : [];
  const pend = C.nextPending(items.map((x) => ({ exerciseId: x.exerciseId, sets: ensureLogs(x).length })), s.logs, s.skipped, cur);
  let main;
  if (k >= 0) { const l = logs[k]; main = <button type="button" class="btn pri lg full" onClick={() => toggleSet(cur, k)}><Icon id="check" />Concluir série {k + 1}{String(l.kg) ? ` · ${l.kg} kg × ${l.reps}` : ` · ${l.reps} reps`}</button>; }
  else if (pend >= 0) main = <button type="button" class="btn pri lg full" onClick={() => goEx(pend)}>Próximo exercício <Icon id="arrow" /></button>;
  else main = <button type="button" class="btn pri lg full" onClick={openFinish}><Icon id="check" />Terminar treino ({p.setsDone} séries)</button>;
  return <footer class="modo-foot"><Descanso />{main}</footer>;
}

export function Timeline({ idx }: { idx: number | null }) {
  useTick();
  useEffect(() => { document.documentElement.classList.add("modo-on"); return () => document.documentElement.classList.remove("modo-on"); }, []);
  const cur = idx != null && S.session ? Math.min(Math.max(idx, 0), S.session.plan.items.length - 1) : curIdx();
  useEffect(() => { if (running()) setCur(cur); }, [cur]);
  if (!running()) return <div class="card" style="margin-top:12px"><h1>Treino encerrado</h1><p class="small sub" style="margin:6px 0 12px">Não há treino em andamento.</p><a class="btn pri" href="#treino">Ver o treino de hoje</a></div>;
  const s = S.session, items: C.PlanItem[] = s.plan.items, p = progress();
  const vs = C.sessionVolumeVsAvg(currentSets(), pastAll());
  const vol = Object.values(currentSets()).flat().reduce((a, x) => a + x.kg * x.reps, 0);
  const pct = p.setsTotal ? Math.round((p.setsDone / p.setsTotal) * 100) : 0;
  return <div class="modo" role="region" aria-label="Modo treino">
    <header class="modo-top">
      <a class="iconbtn" href="#treino" aria-label="Sair do modo treino (o treino continua)"><Icon id="x" /></a>
      <div class="modo-prog"><b class="num">{p.exDone} de {p.exTotal} exercícios · {p.setsDone}/{p.setsTotal} séries</b>
        <span class="tiny sub num"><Relogio />{vol > 0 && <> · volume {fmt(vol)} kg</>}{vs.pct != null && <> ({vs.pct >= 0 ? "+" : ""}{vs.pct}% vs média das últimas 4)</>}</span></div>
      <button type="button" class="btn" onClick={openFinish}>Terminar</button></header>
    <div class="modo-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Séries concluídas"><i style={`width:${pct}%`} /></div>
    <div class="modo-list">{items.map((it, i) => i === cur ? <Atual key={it.exerciseId + i} it={it} idx={i} /> : <Mini key={it.exerciseId + i} it={it} idx={i} cur={cur} />)}</div>
    <Rodape cur={cur} />
  </div>;
}
