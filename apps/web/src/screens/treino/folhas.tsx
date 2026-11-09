// Folhas do Treino: trocar, editar (manual, o Claude revisa), "não fiz" e terminar (feedback).
import { C, S, commit, today } from "../../lib/store/index.ts";
import { EXB, activePlan, dayInput, gymById, mName, profileChanged } from "../../lib/store/regras.ts";
import { SERVER, send } from "../../lib/api/index.ts";
import { SheetHead, closeSheet, openSheet } from "../../lib/folha/index.tsx";
import { Chip, Icon, Seg, toast } from "../../lib/ui/index.tsx";
import { go } from "../../lib/roteador/index.ts";
import { img, uid } from "../../lib/util.ts";

export const openSwap = (idx: number) => openSheet(() => <Swap idx={idx} />);
function pickSwap(idx: number, to: string, scope: "hoje" | "sempre") {
  const plan = activePlan(), it = plan.items[idx];
  if (scope === "sempre") { S.profile.pinned[it.muscle] = to; profileChanged(); }
  if (S.session && !S.session.finishedAt) { const ex = EXB[to]; plan.items[idx] = { ...it, exerciseId: to, nm: ex.nm, kind: ex.kind, reps: ex.r, rest: ex.rest, alts: it.alts.filter((x) => x !== to).concat(it.exerciseId) }; }
  else { S.ui.swapsToday[it.muscle] = to; S.ui.locked = false; }
  closeSheet(); commit(); toast(scope === "sempre" ? "Trocado no plano (sempre)" : "Trocado só hoje");
}
function Swap({ idx }: { idx: number }) {
  const plan = activePlan(), it = plan.items[idx];
  if (!it) return null;
  const all = C.candidates(it.muscle, dayInput());
  const gym = gymById(S.session?.gymId ?? S.ui.gymId);
  const unavailable = C.EXERCISES.filter((e) => e.m === it.muscle && e.id !== it.exerciseId && !e.eq.every((q) => gym.equipment.includes(q)));
  return <><SheetHead kicker={`Trocar · ${mName(it.muscle)}`} title={it.nm} />
    <p class="small sub" style="margin:8px 0 6px">Já calculado pelo app (sem gastar Claude): mesmo músculo, aparelho disponível, sua preferência, dor e academia cheia.</p>
    {all.filter((c) => c.ex.id !== it.exerciseId).map((c) => <div class="alt" key={c.ex.id} style={c.blockedByPain ? "opacity:.5" : ""}>
      <img src={img(c.ex.id)} alt="" loading="lazy" width={56} height={56} />
      <div><h3>{c.ex.nm}</h3><p class="tiny sub">{c.ex.r.join("–")} reps · {c.ex.kind}{c.ex.stretch ? " · alongado" : ""}{S.media[c.ex.id] ? " · você tem vídeo" : ""}{c.blockedByPain ? " · força região com dor" : ""}</p></div>
      {c.blockedByPain ? <span class="badge bad">dor</span> : <div class="row" style="gap:6px"><button type="button" class="btn sm" onClick={() => pickSwap(idx, c.ex.id, "hoje")}>Hoje</button><button type="button" class="btn sm pri" onClick={() => pickSwap(idx, c.ex.id, "sempre")}>Sempre</button></div>}
    </div>)}
    {unavailable.length > 0 && <p class="tiny sub" style="margin-top:10px">Sem aparelho em {gym.name}: {unavailable.map((e) => e.nm).join(", ")}</p>}</>;
}

const editOf = (d: any) => ({ index: d.index, sets: d.sets, reps: d.reps, ...(d.exerciseId === "__proprio" ? { exerciseId: "proprio_" + (d.nm || "x").toLowerCase().replace(/\W+/g, "_"), nm: d.nm || "Exercício meu" } : { exerciseId: d.exerciseId }) });
export function openEdit(idx: number) {
  const it = activePlan().items[idx];
  S.ui.editDraft = { index: idx, exerciseId: it.exerciseId, sets: it.sets, reps: it.reps, nm: "" };
  openSheet(() => <Edit />);
}
async function saveEdit(remove: boolean) {
  const d = S.ui.editDraft, plan = activePlan(), it = plan.items[d.index];
  const edit = remove ? { index: d.index, remove: true } : editOf(d);
  const res = C.applyManualEdit(plan, edit as C.ManualEdit, dayInput());
  if (S.session && !S.session.finishedAt) S.session.plan = res.plan; else { S.plan = res.plan; S.ui.locked = true; S.ui.planSource = "manual"; }
  S.edits.push({ id: uid(), date: today, label: remove ? `Tirou ${it.nm}` : `${it.nm} → ${res.plan.items[d.index]?.nm} ${d.sets}×${d.reps.join("–")}`, issues: res.issues, review: "pendente" });
  closeSheet(); commit(); toast("Aplicado · o Claude revisa na próxima leitura");
  if (SERVER) { await send("PUT", `/api/day-plan/${today}`, { plan, gymId: S.ui.gymId, source: "core" }).catch(() => {}); await send("POST", "/api/plan-edits", { date: today, edit, daysLeft: S.ui.daysLeft }).catch(() => {}); }
}
function Edit() {
  const d = S.ui.editDraft, plan = activePlan(), it = plan.items[d?.index];
  if (!d || !it) return null;
  const res = C.applyManualEdit(plan, editOf(d) as C.ManualEdit, dayInput());
  const set = (k: string, v: any) => { S.ui.editDraft = { ...d, [k]: v }; commit(); };
  return <><SheetHead kicker={`Editar · ${mName(it.muscle)}`} title={it.nm} />
    <p class="small sub" style="margin:8px 0">Você conhece seu corpo: a mudança vale na hora e o Claude revisa depois (só aponta riscos).</p>
    <label class="f" for="edEx">Exercício</label>
    <select class="input" id="edEx" value={d.exerciseId} onChange={(e) => set("exerciseId", e.currentTarget.value)}>
      {C.EXERCISES.filter((e) => e.m === it.muscle).map((e) => <option key={e.id} value={e.id}>{e.nm}</option>)}<option value="__proprio">Outro (meu exercício)…</option></select>
    {d.exerciseId === "__proprio" && <input class="input" style="margin-top:8px" aria-label="Nome do exercício" maxLength={60} placeholder="nome do exercício" value={d.nm} onInput={(e) => { d.nm = e.currentTarget.value; }} onBlur={() => commit()} />}
    <div class="row wrapx" style="gap:16px;margin-top:12px"><div><span class="f">Séries</span><span class="stepper"><button type="button" aria-label="menos" onClick={() => set("sets", Math.max(1, d.sets - 1))}>−</button><span class="num">{d.sets}</span><button type="button" aria-label="mais" onClick={() => set("sets", Math.min(8, d.sets + 1))}>+</button></span></div>
      <div><span class="f">Repetições</span><Seg opts={[[6, 10], [8, 12], [10, 15], [12, 20]].map((r) => [r.join("-"), r.join("–")] as [string, string])} value={d.reps.join("-")} onPick={(v) => set("reps", v.split("-").map(Number))} label="Repetições" /></div></div>
    <div style="margin-top:12px">{res.issues.length ? res.issues.map((x, i) => <div class="list-issue" key={i}><b style={`color:var(--${x.severity === "erro" ? "bad" : x.severity === "aviso" ? "warn" : "info"})`}>{x.severity}</b><span>{x.msg}</span></div>) : <p class="small" style="color:var(--ok)">Sem problemas encontrados.</p>}</div>
    <div class="row" style="gap:8px;margin-top:12px"><button type="button" class="btn danger sm" onClick={() => saveEdit(true)}>Tirar do treino</button><button type="button" class="btn pri" style="flex:1" onClick={() => saveEdit(false)} disabled={res.issues.some((x) => x.severity === "erro")}>Aplicar</button></div></>;
}

export const SKIP_REASONS: [string, string][] = [["ocupado", "Aparelho ocupado"], ["dor", "Dor"], ["sem_tempo", "Sem tempo"], ["nao_quis", "Não quis"], ["outro", "Outro"]];
export function doSkip(idx: number, reason: string, fromFinish = false) {
  const it = activePlan().items[idx];
  if (!S.session) return toast("Comece o treino para registrar");
  S.session.skipped[it.exerciseId] = reason;
  send("POST", `/api/sessions/${S.session.id}/skip`, { exerciseId: it.exerciseId, reason }).catch(() => {});
  if (fromFinish) { commit(); return; }
  closeSheet(); commit(); if (reason === "dor") { go("#corpo"); toast("Marque onde doeu"); }
}
export const openSkip = (idx: number) => openSheet(() => <Skip idx={idx} />);
function Skip({ idx }: { idx: number }) {
  const it = activePlan().items[idx];
  if (!it) return null;
  return <><SheetHead kicker="Não fiz" title={it.nm} />
    <p class="small sub" style="margin:8px 0 12px">Por quê? Ajuda o Claude a ajustar (ocupado sempre → trocar; dor → mapa de dor).</p>
    <div class="chips">{SKIP_REASONS.map(([v, l]) => <Chip key={v} onClick={() => doSkip(idx, v)}>{l}</Chip>)}</div>
    {it.alts.length > 0 && <button type="button" class="btn full" style="margin-top:14px" onClick={() => openSwap(idx)}><Icon id="swap" />Prefiro trocar por outro</button>}</>;
}

export function openFinish() { S.ui.fb = S.ui.fb ?? { pump: {}, effort: 2, joint: false }; openSheet(() => <Finish />); }
async function doFinish() {
  const s = S.session; s.finishedAt = Date.now(); s.closedBy = "usuario"; s.feedback = S.ui.fb; s.rest = null;
  for (const it of s.plan.items) { const done = (s.logs[it.exerciseId] ?? []).filter((l: any) => l.done); if (done.length) S.history[it.exerciseId] = done.map((l: any) => ({ kg: Number(String(l.kg).replace(",", ".")) || 0, reps: Number(l.reps) })); }
  const joint = S.ui.fb.joint; S.ui.fb = null; closeSheet();
  await send("POST", `/api/sessions/${s.id}/finish`, { feedback: s.feedback }).catch(() => {});
  if (joint) go("#corpo"); commit(); toast("Treino salvo");
}
function Finish() {
  const s = S.session; if (!s || !S.ui.fb) return null;
  const plan: C.DayPlan = s.plan, f = S.ui.fb;
  const ms = [...new Set(plan.items.map((i) => i.muscle))];
  const out = plan.items.map((it) => ({ it, o: C.exerciseOutcome(it.sets, (s.logs[it.exerciseId] ?? []).filter((l: any) => l.done).length, !!s.skipped[it.exerciseId]) }));
  return <><SheetHead kicker={`Terminar · ${C.fmtClock(Date.now() - s.startedAt)}`} title="Como foi?" />
    <p class="small sub" style="margin:6px 0 12px">15 s. É o que decide séries e cargas da próxima semana.</p>
    <span class="f">Pump por músculo</span>{ms.map((m) => <div class="prefrow" key={m}><span class="small">{mName(m)}</span><Seg opts={[[0, "baixo"], [1, "bom"], [2, "forte"]]} value={f.pump[m]} onPick={(v) => { f.pump[m] = v; commit(); }} label={`Pump ${mName(m)}`} /></div>)}
    <div class="row wrapx" style="gap:16px;margin-top:12px"><div><span class="f">Esforço geral</span><Seg opts={[[1, "fácil"], [2, "certo"], [3, "pesado"]]} value={f.effort} onPick={(v) => { f.effort = v; commit(); }} label="Esforço" /></div>
      <div><span class="f">Dor articular?</span><Seg opts={[[false, "não"], [true, "sim → mapa"]]} value={f.joint} onPick={(v) => { f.joint = v; commit(); if (v) toast("Depois de salvar, marque no mapa de dor"); }} label="Dor articular" /></div></div>
    <div style="margin-top:12px"><span class="f">Exercícios</span>{out.map(({ it, o }, i) => <div class="row between small" key={i} style="padding:4px 0"><span>{it.nm}</span>
      {o === "nao_registrado" ? <span class="row" style="gap:4px"><span class="badge">sem registro</span><button type="button" class="btn sm" onClick={() => doSkip(i, "outro", true)}>não fiz</button></span>
        : <span class={`badge ${o === "feito" ? "ok" : o === "parcial" ? "warn" : "bad"}`}>{o.replace("_", " ")}</span>}</div>)}</div>
    <button type="button" class="btn pri full" style="margin-top:14px" onClick={doFinish}><Icon id="check" />Salvar e encerrar</button></>;
}
