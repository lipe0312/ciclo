// Sessão de treino: começar, séries, descanso (vibra/apita/notifica), wake lock e fechamento automático (2 h).
import { C, S, commit, today } from "../../lib/store/index.ts";
import { computePlan, suggestFor } from "../../lib/store/regras.ts";
import { send } from "../../lib/api/index.ts";
import { toast } from "../../lib/ui/index.tsx";
import { go } from "../../lib/roteador/index.ts";
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
export function fireRest() {
  navigator.vibrate?.([300, 150, 300, 150, 300]); beep();
  try { if (document.hidden && Notification.permission === "granted") navigator.serviceWorker?.ready.then((r) => r.showNotification("Descanso acabou", { body: "Próxima série!", tag: "rest" })); } catch { /* ok */ }
}

export async function startSession() {
  if (S.session && !S.session.finishedAt) return;
  const plan = clone(computePlan());
  S.session = { id: uid(), date: today, startedAt: Date.now(), finishedAt: null, plan, logs: {}, skipped: {}, rest: null, gymId: S.ui.gymId, format: S.ui.format };
  S.week.attendance[today] = "fui";
  if (!S.week.sessions.some((s: any) => s.date === today)) S.week.sessions.push({ date: today, name: plan.name, groups: plan.groups });
  try { if ("Notification" in window && Notification.permission === "default") Notification.requestPermission(); } catch { /* ok */ }
  unlockAudio(); keepAwake();
  toast("Começou · o dia já conta como “fui”");
  go("#treino"); commit();
  await send("POST", "/api/sessions", { id: S.session.id, date: today, gymId: S.ui.gymId, plan, startedAt: S.session.startedAt }).catch(() => {});
}

export function ensureLogs(it: C.PlanItem): { kg: string | number; reps: string | number; done: boolean }[] {
  const s = S.session; if (!s) return [];
  if (!s.logs[it.exerciseId]) { const sg = suggestFor(it); s.logs[it.exerciseId] = Array.from({ length: it.sets }, () => ({ kg: sg.kg ?? "", reps: sg.reps, done: false })); }
  return s.logs[it.exerciseId];
}
export function restFor(plan: C.DayPlan, idx: number) {
  const it = plan.items[idx], f = S.session?.format ?? S.ui.format;
  if (f === "circuito") return idx === plan.items.length - 1 ? 120 : 30;
  if (f === "superserie" && idx % 2 === 0 && idx + 1 < plan.items.length) return 15;
  return it.rest;
}
export function autoClose() {
  const s = S.session; if (!s || s.finishedAt) return;
  s.finishedAt = s.startedAt + C.MAX_SESSION_MS; s.closedBy = "auto"; s.rest = null;
  toast("Treino fechado sozinho (2 h). Presença mantida."); commit();
}
export const running = () => !!(S.session && !S.session.finishedAt);

// relógio global: dispara o fim do descanso e o fechamento automático mesmo fora da tela de Treino
const tickers = new Set<() => void>();
export const onTick = (f: () => void) => { tickers.add(f); return () => { tickers.delete(f); }; };
setInterval(() => {
  const s = S.session; if (!s || s.finishedAt) return;
  if (C.resolveSession(s, Date.now()).status === "fechado_auto") { autoClose(); return; }
  if (s.rest && !s.rest.fired && s.rest.until <= Date.now()) { s.rest.fired = true; fireRest(); commit(); }
  tickers.forEach((f) => f());
}, 1000);
