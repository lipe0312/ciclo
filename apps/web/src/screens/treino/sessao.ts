// Sessão de treino: começar, séries (concluir, editar, desfazer), descanso (vibra/apita/notifica e agenda o push),
// posição na timeline, médias, wake lock e fechamento automático (2 h). O estado vive em S.session e é salvo a cada commit().
import { C, S, commit, today } from "../../lib/store/index.ts";
import { computePlan, suggestFor } from "../../lib/store/regras.ts";
import { SERVER, api, send } from "../../lib/api/index.ts";
import { syncPush } from "../../lib/notificacao/index.ts";
import { toast } from "../../lib/ui/index.tsx";
import { href, replace } from "../../lib/roteador/index.ts";
import { clone, uid } from "../../lib/util.ts";

let wakeLock: any = null;
export async function keepAwake() {
  try { if ("wakeLock" in navigator && !wakeLock) { wakeLock = await (navigator as any).wakeLock.request("screen"); wakeLock.addEventListener("release", () => (wakeLock = null)); } } catch { /* sem permissão */ }
}
document.addEventListener("visibilitychange", () => { if (!document.hidden && S.session && !S.session.finishedAt) keepAwake(); });

let audioCtx: AudioContext | null = null;
export function unlockAudio() { try { audioCtx = audioCtx || new (window.AudioContext || (window as any).webkitAudioContext)(); audioCtx!.resume?.(); } catch { /* ok */ } }
function beep() {
  try {
    unlockAudio(); const a = audioCtx!, t0 = a.currentTime;
    [0, 0.25, 0.5].forEach((d) => { const o = a.createOscillator(), g = a.createGain(); o.frequency.value = 880; o.connect(g); g.connect(a.destination); g.gain.setValueAtTime(0.25, t0 + d); g.gain.exponentialRampToValueAtTime(0.001, t0 + d + 0.2); o.start(t0 + d); o.stop(t0 + d + 0.21); });
  } catch { /* ok */ }
}
/** Fim do descanso no aparelho: vibra e apita; com a tela escondida e sem push, notifica pelo service worker (mesma tag do push, não duplica). */
export function fireRest() {
  navigator.vibrate?.([300, 150, 300, 150, 300]); beep();
  if (!document.hidden) cancelRestPush(); // já avisamos aqui; o servidor não precisa mandar o push
  try { if (document.hidden && Notification.permission === "granted") navigator.serviceWorker?.ready.then((r) => r.showNotification("Descanso acabou", { body: "Próxima série!", tag: "rest" })); } catch { /* ok */ }
}

/** Rótulos em pt-BR (com acento) dos resultados do exercício e dos motivos de "não fiz". */
export const OUTCOME_TXT: Record<string, string> = { feito: "feito", parcial: "parcial", nao_fiz: "não fiz", nao_registrado: "não registrado" };
export const REASON_TXT: Record<string, string> = { ocupado: "aparelho ocupado", dor: "dor", sem_tempo: "sem tempo", nao_quis: "não quis", outro: "outro" };
export const running = () => !!(S.session && !S.session.finishedAt);
type Log = { kg: string | number; reps: string | number; done: boolean };

// ---------- começar ----------
export async function startSession() {
  if (S.session && !S.session.finishedAt) return;
  const plan = clone(computePlan());
  S.session = { id: uid(), date: today, startedAt: Date.now(), finishedAt: null, plan, logs: {}, skipped: {}, rest: null, gymId: S.ui.gymId, format: S.ui.format, cur: 0 };
  S.week.attendance[today] = "fui";
  if (!S.week.sessions.some((s: any) => s.date === today)) S.week.sessions.push({ date: today, name: plan.name, groups: plan.groups });
  unlockAudio(); keepAwake();
  void syncPush(); // se o aviso já foi permitido, garante a assinatura; o pedido de permissão é um botão na própria tela (gesto do usuário)
  toast("Começou · o dia já conta como “fui”");
  replace(href("treino", ["ativo", "0"])); commit();
  void loadRefs();
  await send("POST", "/api/sessions", { id: S.session.id, date: today, gymId: S.ui.gymId, plan, startedAt: S.session.startedAt }).catch(() => {});
}

// ---------- médias e referências ----------
/** Últimas sessões de cada exercício do plano (servidor) ou o que a demonstração tem. */
export async function loadRefs() {
  const s = S.session; if (!s || !SERVER) return;
  const ids = [...new Set<string>(s.plan.items.map((i: C.PlanItem) => i.exerciseId))].filter((x) => /^[A-Za-z0-9_.-]{1,80}$/.test(x)).slice(0, 20);
  if (!ids.length) return;
  try {
    const r = await api<{ history: Record<string, C.SetLog[][]> }>("GET", `/api/history/last?ids=${ids.join(",")}&n=5&before=${s.startedAt}`);
    Object.assign(S.past, r.history); commit();
  } catch { /* offline: usa o que está salvo no aparelho */ }
}
export const pastOf = (exId: string): C.SetLog[][] => S.past[exId] ?? (S.history[exId]?.length ? [S.history[exId]] : []);
export const refsOf = (exId: string) => C.exerciseRefs(pastOf(exId));

const num = (v: string | number) => parseFloat(String(v).replace(",", "."));
export const doneSets = (exId: string): C.SetLog[] =>
  (S.session?.logs[exId] ?? []).filter((l: Log) => l.done).map((l: Log) => ({ kg: Number.isFinite(num(l.kg)) ? num(l.kg) : 0, reps: parseInt(String(l.reps), 10) || 0 }));
export const currentSets = (): Record<string, C.SetLog[]> => {
  const out: Record<string, C.SetLog[]> = {};
  for (const it of S.session?.plan.items ?? []) { const d = doneSets(it.exerciseId); if (d.length) out[it.exerciseId] = d; }
  return out;
};
export const pastAll = (): Record<string, C.SetLog[][]> => Object.fromEntries((S.session?.plan.items ?? []).map((i: C.PlanItem) => [i.exerciseId, pastOf(i.exerciseId)]));
/** Resumo de fim de treino (duração, séries, volume, PRs, médias vs última vez), calculado pelo core. */
export const buildSummary = (endMs: number) => C.sessionSummary(endMs - S.session.startedAt, currentSets(), pastAll());

// ---------- séries ----------
export function ensureLogs(it: C.PlanItem): Log[] {
  const s = S.session; if (!s) return [];
  if (!s.logs[it.exerciseId]) { const sg = suggestFor(it); s.logs[it.exerciseId] = Array.from({ length: it.sets }, () => ({ kg: sg.kg ?? "", reps: sg.reps, done: false })); }
  return s.logs[it.exerciseId];
}
export const progress = () => C.sessionProgress(S.session.plan.items.map((it: C.PlanItem) => ({ exerciseId: it.exerciseId, sets: ensureLogs(it).length })), S.session.logs, S.session.skipped);
export const curIdx = () => { const n = S.session?.plan.items.length ?? 0; return Math.min(Math.max(S.session?.cur ?? 0, 0), Math.max(0, n - 1)); };
export function setCur(i: number) { if (S.session && S.session.cur !== i) { S.session.cur = i; commit(); } }
export const goEx = (i: number) => { setCur(i); replace(href("treino", ["ativo", String(i)])); };

const payload = (it: C.PlanItem, k: number, l: Log) => ({ exerciseId: it.exerciseId, muscle: it.muscle, setNo: k + 1, kg: Number.isFinite(num(l.kg)) ? num(l.kg) : null, reps: parseInt(String(l.reps), 10), rir: null });
const syncSet = (it: C.PlanItem, k: number, l: Log) => send("POST", `/api/sessions/${S.session.id}/sets`, payload(it, k, l)).catch(() => {});

/** ✓: conclui a série (agenda o descanso); numa série já concluída, desfaz. */
export function toggleSet(i: number, k: number) {
  const s = S.session, it: C.PlanItem = s.plan.items[i], l = ensureLogs(it)[k];
  if (l.done) {
    l.done = false;
    send("DELETE", `/api/sessions/${s.id}/sets/${encodeURIComponent(it.exerciseId)}/${k + 1}`).catch(() => {});
    toast(`Série ${k + 1} desfeita`);
    return commit();
  }
  if (!Number.isFinite(parseInt(String(l.reps), 10))) return toast("Preencha as repetições");
  l.done = true;
  startRest(restFor(s.plan, i));
  unlockAudio();
  void syncSet(it, k, l);
  const next = C.nextPending(s.plan.items.map((x: C.PlanItem) => ({ exerciseId: x.exerciseId, sets: ensureLogs(x).length })), s.logs, s.skipped, i);
  if (next !== i && next >= 0) goEx(next); // o exercício acabou: a timeline anda sozinha
  commit();
}
/** Alterou kg/reps: se a série já está concluída, o servidor recebe a correção. */
export function editedSet(i: number, k: number) {
  const it: C.PlanItem = S.session.plan.items[i], l = ensureLogs(it)[k];
  if (l.done) void syncSet(it, k, l);
  commit();
}
export function addSet(i: number) {
  const it: C.PlanItem = S.session.plan.items[i], logs = ensureLogs(it), lst = logs[logs.length - 1];
  if (logs.length >= 12) return toast("Até 12 séries");
  logs.push({ kg: lst?.kg ?? "", reps: lst?.reps ?? it.reps[0], done: false }); it.sets = logs.length; commit();
}
export function dropSet(i: number) {
  const it: C.PlanItem = S.session.plan.items[i], logs = ensureLogs(it);
  if (logs.length > 1 && !logs[logs.length - 1].done) { logs.pop(); it.sets = logs.length; commit(); }
}
export const nextSetOf = (i: number) => C.nextSetIndex(S.session.logs[S.session.plan.items[i].exerciseId] ?? undefined);

export function restFor(plan: C.DayPlan, idx: number) {
  const it = plan.items[idx], f = S.session?.format ?? S.ui.format;
  if (f === "circuito") return idx === plan.items.length - 1 ? 120 : 30;
  if (f === "superserie" && idx % 2 === 0 && idx + 1 < plan.items.length) return 15;
  return it.rest;
}

// ---------- descanso ----------
// O servidor guarda "acaba em N s" e o cron de 1 min manda o push se a tela estiver bloqueada; sem rede, o aviso fica só no aparelho.
function scheduleRestPush(sec: number) { if (SERVER && S.session) api("PUT", `/api/sessions/${S.session.id}/rest`, { seconds: Math.min(900, Math.max(1, sec)) }).catch(() => {}); }
export function cancelRestPush() { if (SERVER && S.session) api("DELETE", `/api/sessions/${S.session.id}/rest`).catch(() => {}); }
export function startRest(sec: number) { S.session.rest = { until: Date.now() + sec * 1000, fired: false }; scheduleRestPush(sec); }
export function adjustRest(deltaMs: number) {
  const s = S.session; if (!s?.rest) return;
  const r = C.adjustRest(s.rest, deltaMs, Date.now());
  s.rest = r; commit();
  if (r) scheduleRestPush(Math.ceil((r.until - Date.now()) / 1000)); else cancelRestPush();
}
export function skipRest() { if (!S.session?.rest) return; S.session.rest = null; commit(); cancelRestPush(); }

// ---------- fechar ----------
export function autoClose() {
  const s = S.session; if (!s || s.finishedAt) return;
  s.finishedAt = s.startedAt + C.MAX_SESSION_MS; s.closedBy = "auto"; s.rest = null;
  s.summary = buildSummary(s.finishedAt);
  toast("Treino fechado sozinho (2 h). Presença mantida."); commit();
}

// relógio global: dispara o fim do descanso e o fechamento automático mesmo fora da tela de Treino
const tickers = new Set<() => void>();
export const onTick = (f: () => void) => { tickers.add(f); return () => { tickers.delete(f); }; };
setInterval(() => {
  const s = S.session; if (!s || s.finishedAt) return;
  if (C.resolveSession(s, Date.now()).status === "fechado_auto") { autoClose(); return; }
  if (s.rest && !s.rest.fired && s.rest.until <= Date.now()) { s.rest.fired = true; fireRest(); commit(); }
  tickers.forEach((f) => f());
}, 1000);
