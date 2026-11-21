// #122 O treino em andamento segue o treino do dia (fonte única da #121), sem perder o que foi feito.
// - Começar copia o treino do dia; a sessão guarda a assinatura dele (`plan.doDia`).
// - O treino do dia mudou (IA, regerar, outro aparelho) com a sessão aberta → aplica na MESMA sessão: item novo entra,
//   trocado sem séries sai, trocado com séries fica com as séries feitas (marcado "trocado") e não se repete.
// - Recarregar, outro aparelho ou mudança da IA nunca abre sessão nova: retomam a aberta. Nova sessão só de propósito.
// - Terminada não volta a contar (cronômetro parado, sem descanso).
// Fora do index de propósito (subpath `@ciclo/core/sessao-dia`): o app baixa só quando há sessão no dia (orçamento de JS, #64).
import type { DayPlan, PlanItem } from "./plan-day.ts";
import { assinaturaTreino } from "./treino-do-dia.ts";
import { MAX_SESSION_MS } from "./session.ts";


/** Item da sessão: `trocado` = saiu do treino do dia depois de ter séries feitas (fica só com elas). */
export type ItemSessao = PlanItem & { trocado?: boolean };
/** Plano da sessão: o do dia + a assinatura do treino do dia de onde veio (`doDia`). */
export type PlanoSessao = Omit<DayPlan, "items"> & { items: ItemSessao[]; doDia?: string };
type LogSessao = { done: boolean } & Record<string, unknown>;
export interface SessaoViva {
  plan: PlanoSessao; logs: Record<string, LogSessao[]>; skipped: Record<string, unknown>; cur?: number;
}
export interface Ajuste<S extends SessaoViva = SessaoViva> {
  sessao: S; entrou: string[]; saiu: string[]; trocados: string[]; aviso: string;
}

const feitas = (l?: LogSessao[]) => (l ?? []).filter((x) => x.done).length;

/** Aplica o treino do dia novo na sessão aberta. `null` = nada a fazer: sem treino do dia, ou ele é o mesmo de onde a sessão
 *  veio (`plan.doDia`) ou o último que o aparelho já adotou (`visto`, #121). Idempotente: aplicar de novo não duplica nada. */
export function seguirTreinoDoDia<S extends SessaoViva>(s: S, doDia: DayPlan | null | undefined, o: { nome?: (id: string) => string; visto?: string | null } = {}): Ajuste<S> | null {
  if (!doDia?.items.length) return null;
  const ass = assinaturaTreino(doDia), nome = o.nome ?? ((id: string) => id);
  if (s.plan.doDia === ass || o.visto === ass) return null;
  const novos = new Map<string, PlanItem>();
  for (const it of doDia.items) if (!novos.has(it.exerciseId)) novos.set(it.exerciseId, it);
  const antes = new Map(s.plan.items.map((it) => [it.exerciseId, it]));
  const logs: Record<string, LogSessao[]> = {}, skipped: Record<string, unknown> = {};
  const entrou: string[] = [], saiu: string[] = [], trocados: string[] = [];
  const items: ItemSessao[] = [];
  for (const it of novos.values()) {
    const velho = antes.get(it.exerciseId), l = s.logs[it.exerciseId], f = feitas(l);
    if (!velho || velho.trocado) entrou.push(it.exerciseId);
    const sets = Math.max(it.sets, f);
    items.push({ ...it, sets });
    if (l) logs[it.exerciseId] = l.length > sets ? l.slice(0, Math.max(sets, lastDone(l) + 1)) : l.map((x) => ({ ...x }));
    if (s.skipped[it.exerciseId] != null) skipped[it.exerciseId] = s.skipped[it.exerciseId];
  }
  // o que saiu: com séries feitas fica (só com elas, marcado "trocado", na posição em que estava); sem séries sai
  s.plan.items.forEach((it, i) => {
    if (novos.has(it.exerciseId)) return;
    const l = s.logs[it.exerciseId], f = feitas(l);
    if (!f) { if (!it.trocado) saiu.push(it.exerciseId); return; }
    if (!it.trocado) trocados.push(it.exerciseId);
    items.splice(Math.min(i, items.length), 0, { ...it, sets: f, trocado: true });
    logs[it.exerciseId] = l!.filter((x) => x.done).map((x) => ({ ...x }));
  });
  const plan: PlanoSessao = { ...s.plan, ...doDia, items, doDia: ass };
  plan.setsTotal = items.reduce((a, x) => a + x.sets, 0);
  const curId = s.plan.items[s.cur ?? 0]?.exerciseId;
  const cur = Math.max(0, items.findIndex((x) => x.exerciseId === curId));
  const sessao = { ...s, plan, logs, skipped, cur } as S;
  return { sessao, entrou, saiu, trocados, aviso: avisoAjuste({ entrou, saiu, trocados }, nome) };
}
const lastDone = (l: LogSessao[]) => { for (let k = l.length - 1; k >= 0; k--) if (l[k].done) return k; return -1; };

/** "O treino do dia mudou: entrou A; saiu B; C ficou com as séries feitas (trocado)." */
export function avisoAjuste(a: { entrou: string[]; saiu: string[]; trocados: string[] }, nome: (id: string) => string = (id) => id): string {
  const l = (ids: string[]) => ids.map(nome).join(", ");
  const p: string[] = [];
  if (a.entrou.length) p.push(`entrou ${l(a.entrou)}`);
  if (a.saiu.length) p.push(`saiu ${l(a.saiu)}`);
  if (a.trocados.length) p.push(`${l(a.trocados)} ficou com as séries feitas (trocado)`);
  return p.length ? `O treino do dia mudou: ${p.join("; ")}.` : "O treino do dia mudou: séries e repetições atualizadas.";
}


/** Sessão do dia, como o servidor lista (semana). */
export interface SessaoDoDia { id: string; date: string; started_at?: number; finished_at?: number | null }

/** A sessão aberta de um dia (não terminada e dentro das 2 h), a mais recente. Recarregar/outro aparelho retomam esta. */
export function sessaoAberta(sessoes: readonly SessaoDoDia[], date: string, now: number): SessaoDoDia | null {
  let r: SessaoDoDia | null = null;
  for (const s of sessoes) if (s.date === date && !s.finished_at && now - (s.started_at ?? 0) < MAX_SESSION_MS && (s.started_at ?? 0) >= (r?.started_at ?? 0)) r = s;
  return r;
}

/** O que o "Começar"/"Treinar de novo" faz: retoma a aberta (local ou de outro aparelho) ou abre uma nova.
 *  Nova só quando não há aberta: um 2º treino no dia é sempre de propósito (depois de terminar o 1º). */
export function acaoComecar(e: { local?: { id: string; finishedAt?: number | null } | null; sessoes: readonly SessaoDoDia[]; date: string; now: number }):
  { tipo: "retomar"; id: string } | { tipo: "nova" } {
  if (e.local && !e.local.finishedAt) return { tipo: "retomar", id: e.local.id };
  const ab = sessaoAberta(e.sessoes, e.date, e.now);
  return ab && ab.id !== e.local?.id ? { tipo: "retomar", id: ab.id } : { tipo: "nova" };
}

/** Local × servidor ao recarregar. Terminada (em qualquer lado) fica terminada: cronômetro parado e sem descanso.
 *  `reenviarFim` = o aparelho terminou e o servidor ainda não sabe (fim ficou na fila): manda de novo. */
export function terminadaVence<L extends { finishedAt?: number | null; closedBy?: string | null; rest?: unknown }>(
  local: L | null, srv: { finishedAt?: number | null; closedBy?: string | null },
): { sessao: L | null; terminada: boolean; reenviarFim: boolean } {
  if (local?.finishedAt) return { sessao: { ...local, rest: null }, terminada: true, reenviarFim: !srv.finishedAt };
  if (srv.finishedAt) return { sessao: local ? { ...local, finishedAt: srv.finishedAt, closedBy: srv.closedBy ?? "auto", rest: null } : null, terminada: true, reenviarFim: false };
  return { sessao: local, terminada: false, reenviarFim: false };
}
