// #74 Trocar: só a mesma subparte. #125 a lista vem do banco fixo (alternativas-banco.ts), na ordem dele; esgotado o banco
// na academia do dia, cai na regra da #74 (eficiência na subparte). Fonte única: Detalhe, folha Trocar e ciclo_treino_trocar.
// Módulo à parte: a folha Trocar e as alternativas do Detalhe baixam só quando abrem (fora do JS inicial).
import { EXERCISES, EXERCISE_BY_ID, EQUIPMENT_BY_ID } from "./catalog.ts";
import type { Exercise, SubMuscleId } from "./catalog.ts";
import { painBlocks } from "./plan-day.ts";
import type { DayInput } from "./plan-day.ts";
import type { MuscleId } from "./catalog.ts";
import { grupoDoExercicio, grupoDoMusculo, parteCurta, partePrincipal } from "./treino-atual.ts";
import { BANCO_ALTERNATIVAS } from "./alternativas-banco.ts";

/** `motivo`: do banco (por que é a mesma porção) ou, na regra da #74, a subparte que ele trabalha. */
export interface Alternativa { ex: Exercise; nota: number; familiar: boolean; blockedByPain: boolean; motivo: string }
export interface Alternativas {
  /** subparte principal do exercício original (a que a troca preserva) */
  parte: SubMuscleId | null;
  /** mesma subparte: o que a pessoa já faz → banco na ordem → regra da #74; o que força região com dor vai no fim, marcado */
  mesmaParte: Alternativa[];
  /** o resto do grupo grande (ex.: ombro anterior e lateral para um posterior): a semana repõe a parte que sair */
  outraParte: Alternativa[];
  /** "precisa de aparelho": sem aparelho na academia de hoje (banco primeiro, na ordem) */
  semAparelho: Exercise[];
}
type AltCtx = Pick<DayInput, "equipment" | "crowded" | "pains" | "avoid" | "familiar">;

export function alternativas(exId: string, ctx: AltCtx): Alternativas {
  const orig = EXERCISE_BY_ID[exId];
  if (!orig) return { parte: null, mesmaParte: [], outraParte: [], semAparelho: [] };
  const parte = partePrincipal(orig);
  const regra = montar(parte, grupoDoExercicio(orig), (e) => e.id !== exId, (e) => !!parte && partePrincipal(e) === parte, (e, mesma) => mesma ? parte : partePrincipal(e), ctx);
  const banco = Object.hasOwn(BANCO_ALTERNATIVAS, exId) ? BANCO_ALTERNATIVAS[exId] : [];
  const eq = new Set(ctx.equipment), noBanco = new Set(banco.map(([id]) => id));
  const doBanco: Alternativa[] = [], semAparelho: Exercise[] = [];
  for (const [id, motivo] of banco) {
    const e = EXERCISE_BY_ID[id];
    if (!e || ctx.avoid?.includes(id)) continue;
    if (!e.eq.every((q) => eq.has(q))) { semAparelho.push(e); continue; }
    doBanco.push({ ex: e, nota: (parte && e.eficiencia?.[parte]) ?? 0, familiar: !!ctx.familiar?.includes(id), blockedByPain: painBlocks(e, ctx.pains ?? []), motivo });
  }
  const todas = [...doBanco, ...regra.mesmaParte.filter((a) => !noBanco.has(a.ex.id))];
  // ordem estável: sem dor antes; dentro disso, o que a pessoa já faz sobe; o resto fica na ordem do banco
  const peso = (a: Alternativa) => (a.blockedByPain ? 2 : 0) + (a.familiar ? 0 : 1);
  const mesmaParte = todas.map((a, i) => ({ a, i })).sort((x, y) => peso(x.a) - peso(y.a) || x.i - y.i).map((x) => x.a);
  return { parte, mesmaParte, outraParte: regra.outraParte, semAparelho: [...semAparelho, ...regra.semAparelho.filter((e) => !noBanco.has(e.id))] };
}

/** IDs da lista "mesma parte", na ordem: o que o Detalhe e a folha Trocar mostram. */
export const idsAlternativas = (exId: string, ctx: AltCtx) => alternativas(exId, ctx).mesmaParte.map((a) => a.ex.id);

/** As `n` primeiras sem dor: mesma parte primeiro; se acabar, a regra da #74 completa com outra parte do grupo. */
export function topAlternativas(alt: Alternativas, n: number): Alternativa[] {
  return [...alt.mesmaParte, ...alt.outraParte].filter((a) => !a.blockedByPain).slice(0, n);
}

/** #112 Trocar um exercício personalizado (cus_): sem subparte, a "mesma parte" é o músculo cadastrado nele; o resto do grupo vai em outraParte. */
export function alternativasDoMusculo(m: MuscleId, ctx: AltCtx): Alternativas {
  return montar(null, grupoDoMusculo(m), () => true, (e) => e.m === m, (e) => partePrincipal(e), ctx, "mesmo músculo");
}

function montar(parte: SubMuscleId | null, g: ReturnType<typeof grupoDoMusculo>, entra: (e: Exercise) => boolean, ehMesma: (e: Exercise) => boolean,
  parteNota: (e: Exercise, mesma: boolean) => SubMuscleId | null, ctx: AltCtx, motivoMesma?: string): Alternativas {
  const eq = new Set(ctx.equipment);
  const busy = (e: Exercise) => e.eq.reduce((s, q) => s + (EQUIPMENT_BY_ID[q]?.busy ?? 0), 0);
  const mesma: (Alternativa & { i: number })[] = [], outra: (Alternativa & { i: number })[] = [], semAparelho: Exercise[] = [];
  EXERCISES.forEach((e, i) => {
    if (!entra(e) || e.planOff || e.id === "Scapular_Pull-Up" || grupoDoExercicio(e) !== g || ctx.avoid?.includes(e.id)) return;
    if (!e.eq.every((q) => eq.has(q))) { semAparelho.push(e); return; }
    const mesmaP = ehMesma(e), pn = parteNota(e, mesmaP), pe = partePrincipal(e);
    const motivo = mesmaP ? motivoMesma ?? `mesma parte (${pe ? parteCurta(pe) : "músculo"})` : `outra parte (${pe ? parteCurta(pe) : "músculo"}): a semana repõe`;
    const a = { ex: e, nota: (pn && e.eficiencia?.[pn]) ?? 0, familiar: !!ctx.familiar?.includes(e.id), blockedByPain: painBlocks(e, ctx.pains ?? []), motivo, i };
    (mesmaP ? mesma : outra).push(a);
  });
  const ordem = (a: Alternativa & { i: number }, b: Alternativa & { i: number }) =>
    Number(b.familiar) - Number(a.familiar) || b.nota - a.nota || (ctx.crowded ? busy(a.ex) - busy(b.ex) : 0) || a.i - b.i;
  const limpa = (xs: (Alternativa & { i: number })[]) => xs.sort(ordem).map(({ i: _i, ...a }) => a);
  return { parte, mesmaParte: limpa(mesma), outraParte: limpa(outra), semAparelho };
}
