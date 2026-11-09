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
