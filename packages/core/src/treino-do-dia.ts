// #121 Um só treino por dia. A fonte única é a semana (a versão atual), que já traz o treino salvo pela IA, o gerado pelo
// app e o editado à mão (day_plan → `fixed`). Hoje, Semana, Começar e o MCP leem daqui. Regerar (IA ou algoritmo)
// substitui o atual: o salvo do dia sai e a semana gera de novo; geração antiga não fica como alternativa ativa.
import type { DayPlan } from "./plan-day.ts";
import { isClosed } from "./semana.ts";
import type { WeekCtx } from "./semana.ts";

/** O mínimo de um dia da semana para achar o treino dele (WeekDay da semana guardada ou da vista com status). */
export interface DiaComTreino { date: string; kind: string; plan: DayPlan | null; status?: string }

/** O treino de um dia, lido da semana: dia de treino (ou treino extra feito) → o plano dele; folga ou dia livre → null.
 *  Nada é calculado aqui: quem mostra (Hoje, Semana), quem começa (Treino) e quem lê pelo MCP usam o mesmo plano. */
export function treinoDoDia(semana: { days: readonly DiaComTreino[] } | null | undefined, date: string): DayPlan | null {
  const d = semana?.days.find((x) => x.date === date);
  if (!d?.plan) return null;
  return d.kind !== "folga" || d.status === "extra" ? d.plan : null;
}

/** Assinatura do que se treina (nome, exercícios, séries e reps): igual = o mesmo treino. Vazio = sem treino. */
export function assinaturaTreino(p: Pick<DayPlan, "name" | "items"> | null | undefined): string {
  return p ? JSON.stringify([p.name, p.items.map((i) => [i.exerciseId, i.sets, i.reps])]) : "";
}

/** Uma regeração pelo algoritmo: um dia ("Gerar"/"Gerar outro") ou a semana toda ("Regenerar"). */
export type Regeracao = { tipo: "dia"; date: string } | { tipo: "semana" };

/** Regerar substitui: os dias cujo treino salvo sai para o algoritmo gerar de novo. Dia fechado (passou, treinou, presença)
 *  nunca muda. O salvo à mão só sai quando a pessoa pede (`manual`: o toque dela no dia ou "descartar trocas");
 *  a IA não apaga edição manual. */
export function salvosSubstituidos(r: Regeracao, salvos: Readonly<Record<string, { source: string }>>, ctx: WeekCtx, o: { manual: boolean }): string[] {
  return Object.entries(salvos)
    .filter(([d, s]) => !isClosed(d, ctx) && (r.tipo === "semana" || d === r.date) && (s.source !== "manual" || o.manual))
    .map(([d]) => d).sort();
}

/** O app troca o treino de hoje que tem no aparelho pelo da semana? Sim sempre que o da semana mudou desde o último que
 *  ele aplicou (`visto`): a IA salvou, o app regerou, outro aparelho mudou. Nunca no meio do treino; sem treino na semana,
 *  não mexe. Mesma assinatura = nada novo na fonte: fica o que a pessoa ajustou no aparelho. */
export function trocarTreinoLocal(e: { sessaoAberta: boolean; doDia: DayPlan | null; visto?: string | null }): boolean {
  return !e.sessaoAberta && !!e.doDia?.items.length && assinaturaTreino(e.doDia) !== (e.visto ?? "");
}
