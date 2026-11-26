// #115 Médias com refeições não registradas, do lado do app: regras da pessoa (Configurações de métricas), "não comi" e o
// painel da semana com as refeições completadas pela média. A conta é do core; fica fora do JS inicial (só a tela Comida usa).
import * as C from "@ciclo/core";
import * as M from "@ciclo/core/comida-medias";
import { calc, commit, today } from "../../lib/store/index.ts";
import { DIET, NAOCOMI, entries, foodRows, hourNow } from "../../lib/store/regras.ts";
import { SERVER, send } from "../../lib/api/index.ts";
import { addDays } from "../../lib/util.ts";

/** As regras em vigor (o servidor manda o JSON; o core normaliza e cai no padrão). */
export const regras = (): M.RegrasMedias => M.regrasMediasDe(DIET.medias);
/** O que o core precisa para completar as refeições: regras, "não comi" e a média de cada refeição. */
export const ctxMedias = (): M.ContextoMedias => ({ regras: regras(), naoComi: NAOCOMI.list, medias: M.mediasPorRefeicao(entries(), today), agora: { date: today, hora: hourNow() } });
/** O dia com as regras: registrado + refeições completadas pela média, e o que ainda falta. */
export const diaMedias = (d: string) => M.diaComMedias(entries(), d, ctxMedias());
export const faltandoDoDia = (d: string) => M.refeicoesACompletar(entries(), d, ctxMedias());

/** Painel: média dos últimos 7 dias contra a meta, e a semana anterior para a tendência. */
export function foodPanel() {
  const d = calc().diet, targets = { kcal: d.kcal, protein: d.protein }, ctx = ctxMedias();
  const cur = M.mediasSemana(entries(), today, targets, 7, ctx), prev = M.mediasSemana(entries(), addDays(today, -7), targets, 7, ctx);
  const week = foodRows().filter((f) => f.date >= cur.from && f.date <= today);
  // "abaixo da meta" conta os mesmos dias da média (com as refeições completadas)
  const dias = cur.days.filter((x) => x.conta), base = C.semanaComida(entries(), today, targets);
  const semana = { ...base, abaixoProt: dias.filter((x) => x.prot < targets.protein * 0.95).length, abaixoKcal: dias.filter((x) => x.kcal < targets.kcal * 0.9).length };
  return { cur, prev, top: C.topProteinFoods(week as unknown as C.FoodEntry[]), targets, semana };
}

/** Marca/desmarca "não comi" (otimista; volta se o servidor recusar). */
export function naoComi(date: string, meal: C.Meal, on: boolean) {
  const antes = NAOCOMI.list;
  const outros = antes.filter((n) => !(n.date === date && n.meal === meal));
  NAOCOMI.list = on ? [...outros, { date, meal }] : outros;
  commit();
  if (!SERVER) return;
  const req = on ? send("PUT", "/api/food-nao-comi", { date, meal }) : send("DELETE", `/api/food-nao-comi/${date}/${meal}`);
  req.catch(() => { NAOCOMI.list = antes; commit(); });
}

/** Muda uma regra das médias (otimista; volta se o servidor recusar). */
export function salvarMedias(patch: { completar?: Partial<Record<C.Meal, boolean>>; diaVazio?: M.DiaVazio }): Promise<boolean> {
  const antes = DIET.medias, cur = regras();
  DIET.medias = { completar: { ...cur.completar, ...patch.completar }, diaVazio: patch.diaVazio ?? cur.diaVazio };
  commit();
  if (!SERVER) return Promise.resolve(true);
  return send<{ regras: M.RegrasMedias }>("PUT", "/api/food-metricas", patch).then((r) => { if (r?.regras) DIET.medias = r.regras; commit(); return true; })
    .catch(() => { DIET.medias = antes; commit(); return false; });
}

/** "O que entra na conta": as regras em vigor, em uma frase. */
export function oQueEntra() {
  const r = regras(), comp = C.MEALS.filter((m) => r.completar[m]).map((m) => C.MEAL_NM[m].toLowerCase());
  const lista = comp.length > 1 ? `${comp.slice(0, -1).join(", ")} e ${comp[comp.length - 1]}` : comp[0];
  return `${r.diaVazio === "fora" ? "Dia sem nenhum registro fica fora da média." : "Dia sem nenhum registro conta como 0."} ${comp.length ? `Num dia com registro, ${lista} que faltaram entram com a média da refeição (≈).` : "Refeição que faltou não é completada: só o registrado entra."} “Não comi” conta 0.`;
}
