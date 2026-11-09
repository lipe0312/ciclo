// Validador: o Claude (ou você, na edição manual) propõe; o código confere e "hidrata".
// Barato de propósito: o Claude devolve só IDs e números; nome, imagem, mídia e alternativas vêm daqui.

import { EXERCISE_BY_ID, MUSCLES } from "./catalog.ts";
import type { MuscleId } from "./catalog.ts";
import { candidates, item, painBlocks } from "./plan-day.ts";
import type { DayInput, DayPlan, PlanItem } from "./plan-day.ts";

export type Severity = "erro" | "aviso" | "info";
export interface Issue { severity: Severity; code: string; msg: string; index?: number }

/** Formato compacto que o Claude devolve (economiza tokens). */
export interface CompactItem { id: string; sets: number; reps?: [number, number]; nm?: string; muscle?: MuscleId }

export function hydrate(compact: CompactItem[], inp: DayInput): { items: PlanItem[]; issues: Issue[] } {
  const issues: Issue[] = [];
  const items: PlanItem[] = [];
  compact.forEach((c, index) => {
    const ex = EXERCISE_BY_ID[c.id];
    if (!ex) {
      if (c.nm && c.muscle && MUSCLES[c.muscle]) {
        items.push({ exerciseId: c.id, nm: c.nm, muscle: c.muscle, kind: "livre", sets: c.sets, reps: c.reps ?? [8, 12], rest: 90, alts: [], manual: true });
        issues.push({ severity: "info", code: "proprio", msg: `"${c.nm}" é um exercício seu (fora do catálogo): sem imagem, entra na revisão.`, index });
      } else issues.push({ severity: "erro", code: "id_desconhecido", msg: `Exercício "${c.id}" não existe no catálogo.`, index });
      return;
    }
    const alts = candidates(ex.m, inp).filter((x) => x.ex.id !== ex.id && !x.blockedByPain).slice(0, 3).map((x) => x.ex.id);
    items.push(item(ex, c.sets, alts, c.reps ? { reps: c.reps } : {}));
  });
  return { items, issues };
}

export function validateItems(items: PlanItem[], inp: DayInput): Issue[] {
  const issues: Issue[] = [];
  const eq = new Set(inp.equipment);
  const seen = new Set<string>();
  let total = 0;
  const perMuscle: Partial<Record<MuscleId, number>> = {};
  items.forEach((it, index) => {
    if (it.prehab) return;
    total += it.sets;
    perMuscle[it.muscle] = (perMuscle[it.muscle] ?? 0) + it.sets;
    if (!Number.isInteger(it.sets) || it.sets < 1 || it.sets > 8) issues.push({ severity: "erro", code: "series", msg: `${it.nm}: séries devem ficar entre 1 e 8.`, index });
    if (seen.has(it.exerciseId)) issues.push({ severity: "info", code: "duplicado", msg: `${it.nm} aparece duas vezes.`, index });
    seen.add(it.exerciseId);
    const ex = EXERCISE_BY_ID[it.exerciseId];
    if (!ex) return;
    const lack = ex.eq.filter((q) => !eq.has(q));
    if (lack.length) issues.push({ severity: "erro", code: "aparelho", msg: `${it.nm}: a academia ativa não tem ${lack.join(", ")}.`, index });
    if (painBlocks(ex, inp.pains ?? [])) issues.push({ severity: "aviso", code: "dor", msg: `${it.nm} força uma região que você marcou com dor.`, index });
  });
  const cap = Math.floor(inp.minutes / 3);
  if (total > cap + 2) issues.push({ severity: "aviso", code: "tempo", msg: `${total} séries não cabem em ${inp.minutes} min (≈ ${cap}).` });
  for (const m of inp.priorities) {
    const target = inp.targets[m] ?? 0, done = inp.done[m] ?? 0, today = perMuscle[m] ?? 0;
    if ((inp.freq[m] ?? 0) < 2 && done < target && today === 0 && items.some((i) => MUSCLES[i.muscle].group === MUSCLES[m].group))
      issues.push({ severity: "aviso", code: "prioridade", msg: `${MUSCLES[m].nm} é prioridade e ficou sem séries hoje.` });
  }
  for (const [m, s] of Object.entries(perMuscle)) if ((s ?? 0) > 10) issues.push({ severity: "aviso", code: "volume_sessao", msg: `${MUSCLES[m as MuscleId].nm}: ${s} séries numa sessão passam do útil (~10).` });
  return issues;
}

export interface ManualEdit { index: number; exerciseId?: string; nm?: string; sets?: number; reps?: [number, number]; remove?: boolean }
/** Edição manual ("eu sei fazer melhor esse"): aplica na hora, devolve avisos e marca para revisão do Claude. */
export function applyManualEdit(plan: DayPlan, edit: ManualEdit, inp: DayInput): { plan: DayPlan; issues: Issue[]; needsReview: boolean } {
  const items = plan.items.map((i) => ({ ...i }));
  const cur = items[edit.index];
  if (!cur) return { plan, issues: [{ severity: "erro", code: "indice", msg: "Item não encontrado." }], needsReview: false };
  if (edit.remove) items.splice(edit.index, 1);
  else {
    if (edit.exerciseId && edit.exerciseId !== cur.exerciseId) {
      const ex = EXERCISE_BY_ID[edit.exerciseId];
      if (ex) Object.assign(cur, item(ex, cur.sets, cur.alts), { manual: true });
      else Object.assign(cur, { exerciseId: edit.exerciseId, nm: edit.nm ?? edit.exerciseId, manual: true, alts: [] });
    }
    if (edit.sets != null) { cur.sets = edit.sets; cur.manual = true; }
    if (edit.reps) { cur.reps = edit.reps; cur.manual = true; }
  }
  const issues = validateItems(items, inp);
  const setsTotal = items.reduce((s, i) => s + i.sets, 0);
  return { plan: { ...plan, items, setsTotal, estMinutes: setsTotal * 3 }, issues, needsReview: true };
}
