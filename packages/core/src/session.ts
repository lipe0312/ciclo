// Sessão à prova de esquecimento:
// - iniciou = foi (presença marcada no "Começar");
// - sem "terminar" → fecha sozinha 2 h depois do início, com o que foi registrado;
// - exercício sem nenhuma série registrada no fechamento = "não registrado" (não "não fiz").

export const MAX_SESSION_MS = 2 * 60 * 60 * 1000;

export type SessionStatus = "nao_iniciado" | "em_andamento" | "concluido" | "fechado_auto";
export interface SessionTimes { startedAt?: number | null; finishedAt?: number | null }
export interface Resolved { status: SessionStatus; attended: boolean; endedAt?: number; remainingMs?: number }

export function resolveSession(s: SessionTimes, now: number, maxMs = MAX_SESSION_MS): Resolved {
  if (!s.startedAt) return { status: "nao_iniciado", attended: false };
  if (s.finishedAt) return { status: "concluido", attended: true, endedAt: Math.min(s.finishedAt, s.startedAt + maxMs) };
  const elapsed = now - s.startedAt;
  if (elapsed >= maxMs) return { status: "fechado_auto", attended: true, endedAt: s.startedAt + maxMs };
  return { status: "em_andamento", attended: true, remainingMs: maxMs - elapsed };
}

export type ExerciseOutcome = "feito" | "parcial" | "nao_fiz" | "nao_registrado";
export function exerciseOutcome(planned: number, logged: number, skipped: boolean): ExerciseOutcome {
  if (skipped) return "nao_fiz";
  if (logged === 0) return "nao_registrado";
  return logged >= planned ? "feito" : "parcial";
}

/** mm:ss ou h:mm:ss para o cronômetro. */
export function fmtClock(ms: number): string {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  const p = (x: number) => String(x).padStart(2, "0");
  return h ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}

// ---------- modo treino: progresso, posição e descanso (puro; o app guarda o estado) ----------
export interface PlanLite { exerciseId: string; sets: number }
type LogLite = { done: boolean };
const doneCount = (l?: LogLite[]) => (l ?? []).filter((x) => x.done).length;
const planned = (it: PlanLite, l?: LogLite[]) => Math.max(it.sets, l?.length ?? 0);

/** "3 de 8 exercícios · 11/24 séries". Pulado ("não fiz") conta como resolvido e sai do total de séries. */
export function sessionProgress(items: PlanLite[], logs: Record<string, LogLite[] | undefined>, skipped: Record<string, unknown>) {
  let exDone = 0, setsDone = 0, setsTotal = 0;
  for (const it of items) {
    const l = logs[it.exerciseId], d = doneCount(l), n = planned(it, l);
    if (skipped[it.exerciseId]) { exDone++; continue; }
    setsDone += d; setsTotal += n;
    if (d >= n && n > 0) exDone++;
  }
  return { exDone, exTotal: items.length, setsDone, setsTotal };
}

/** Próximo exercício com série a fazer, a partir de `from` (com volta ao começo). -1 = tudo resolvido. `after` começa no seguinte. */
export function nextPending(items: PlanLite[], logs: Record<string, LogLite[] | undefined>, skipped: Record<string, unknown>, from: number, after = false): number {
  const n = items.length;
  for (let k = after ? 1 : 0; k < n; k++) {
    const i = (((from + k) % n) + n) % n, it = items[i];
    if (!it || skipped[it.exerciseId]) continue;
    if (doneCount(logs[it.exerciseId]) < planned(it, logs[it.exerciseId])) return i;
  }
  return -1;
}
/** Índice da 1ª série não concluída (-1 = todas feitas; lista inexistente = 0). */
export const nextSetIndex = (l?: LogLite[]) => (l ? l.findIndex((x) => !x.done) : 0);

export interface Rest { until: number; fired: boolean }
export const restLeftMs = (r: Rest | null | undefined, now: number) => (r ? Math.max(0, r.until - now) : 0);
/** +15/−15 s. Zerou = null (descanso acabou). Vencido + positivo recomeça de agora. */
export function adjustRest(r: Rest, deltaMs: number, now: number): Rest | null {
  const until = Math.max(now, r.until) + deltaMs;
  return until <= now ? null : { until, fired: false };
}

export interface ServerSet { exerciseId: string; setNo: number; kg: number | null; reps: number | null }
type EditableLog = { kg: string | number; reps: string | number; done: boolean };
/** Junta as séries gravadas no servidor ao estado local (recarregar/trocar de aparelho). O local ainda não concluído vence. */
export function mergeSessionSets(local: Record<string, EditableLog[]>, server: ServerSet[]): Record<string, EditableLog[]> {
  const out: Record<string, EditableLog[]> = Object.fromEntries(Object.entries(local).map(([k, v]) => [k, v.map((l) => ({ ...l }))]));
  for (const s of server) {
    const arr = (out[s.exerciseId] ??= []);
    while (arr.length < s.setNo) arr.push({ kg: s.kg ?? "", reps: s.reps ?? "", done: false });
    const cur = arr[s.setNo - 1];
    if (!cur.done && local[s.exerciseId]?.[s.setNo - 1] === undefined) arr[s.setNo - 1] = { kg: s.kg ?? "", reps: s.reps ?? "", done: true };
  }
  return out;
}
