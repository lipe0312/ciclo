// #74 Trocar: só a mesma subparte, ordenado por eficiência. Módulo à parte: a folha Trocar baixa só quando abre.
import { EXERCISES, EXERCISE_BY_ID, EQUIPMENT_BY_ID } from "./catalog.ts";
import type { Exercise, SubMuscleId } from "./catalog.ts";
import { painBlocks } from "./plan-day.ts";
import type { DayInput } from "./plan-day.ts";
import type { MuscleId } from "./catalog.ts";
import { grupoDoExercicio, grupoDoMusculo, partePrincipal } from "./treino-atual.ts";

export interface Alternativa { ex: Exercise; nota: number; familiar: boolean; blockedByPain: boolean }
export interface Alternativas {
  /** subparte principal do exercício original (a que a troca preserva) */
  parte: SubMuscleId | null;
  /** mesma subparte principal: o que a pessoa já faz → eficiência nessa parte → aparelho livre → catálogo */
  mesmaParte: Alternativa[];
  /** o resto do grupo grande (ex.: ombro anterior e lateral para um posterior): a semana repõe a parte que sair */
  outraParte: Alternativa[];
  /** do grupo, mas sem aparelho na academia de hoje */
  semAparelho: Exercise[];
}
type AltCtx = Pick<DayInput, "equipment" | "crowded" | "pains" | "avoid" | "familiar">;

export function alternativas(exId: string, ctx: AltCtx): Alternativas {
  const orig = EXERCISE_BY_ID[exId];
  if (!orig) return { parte: null, mesmaParte: [], outraParte: [], semAparelho: [] };
  const parte = partePrincipal(orig);
  return montar(parte, grupoDoExercicio(orig), (e) => e.id !== exId, (e) => !!parte && partePrincipal(e) === parte, (e, mesma) => mesma ? parte : partePrincipal(e), ctx);
}

/** #112 Trocar um exercício personalizado (cus_): sem subparte, a "mesma parte" é o músculo cadastrado nele; o resto do grupo vai em outraParte. */
export function alternativasDoMusculo(m: MuscleId, ctx: AltCtx): Alternativas {
  return montar(null, grupoDoMusculo(m), () => true, (e) => e.m === m, (e) => partePrincipal(e), ctx);
}

function montar(parte: SubMuscleId | null, g: ReturnType<typeof grupoDoMusculo>, entra: (e: Exercise) => boolean, ehMesma: (e: Exercise) => boolean,
  parteNota: (e: Exercise, mesma: boolean) => SubMuscleId | null, ctx: AltCtx): Alternativas {
  const eq = new Set(ctx.equipment);
  const busy = (e: Exercise) => e.eq.reduce((s, q) => s + (EQUIPMENT_BY_ID[q]?.busy ?? 0), 0);
  const mesma: (Alternativa & { i: number })[] = [], outra: (Alternativa & { i: number })[] = [], semAparelho: Exercise[] = [];
  EXERCISES.forEach((e, i) => {
    if (!entra(e) || e.planOff || e.id === "Scapular_Pull-Up" || grupoDoExercicio(e) !== g || ctx.avoid?.includes(e.id)) return;
    if (!e.eq.every((q) => eq.has(q))) { semAparelho.push(e); return; }
    const mesmaP = ehMesma(e), pn = parteNota(e, mesmaP);
    const a = { ex: e, nota: (pn && e.eficiencia?.[pn]) ?? 0, familiar: !!ctx.familiar?.includes(e.id), blockedByPain: painBlocks(e, ctx.pains ?? []), i };
    (mesmaP ? mesma : outra).push(a);
  });
  const ordem = (a: Alternativa & { i: number }, b: Alternativa & { i: number }) =>
    Number(b.familiar) - Number(a.familiar) || b.nota - a.nota || (ctx.crowded ? busy(a.ex) - busy(b.ex) : 0) || a.i - b.i;
  const limpa = (xs: (Alternativa & { i: number })[]) => xs.sort(ordem).map(({ i: _i, ...a }) => a);
  return { parte, mesmaParte: limpa(mesma), outraParte: limpa(outra), semAparelho };
}
