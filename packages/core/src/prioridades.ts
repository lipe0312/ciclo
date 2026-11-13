// Prioridades por GRUPO (quiz) e por subdivisão (Perfil, modo avançado). O usuário escolhe "Ombro"; o core converte
// nas subdivisões do preset (ex.: lateral primeiro). Limites: 5 grupos e 10 subdivisões. TS puro, sem dependências.

import { SUB_MUSCLES, SUB_MUSCLE_IDS } from "./catalog.ts";
import type { SubMuscleId } from "./catalog.ts";

/** Quantos grupos de músculos podem ser prioridade (no máximo). */
export const MAX_PRIORITIES = 5;
/** Quantas subdivisões, no máximo (o preset de um grupo tem até 2). */
export const MAX_PRIORITY_SUBS = 10;

export const PRIORITY_GROUP_IDS = ["ombro", "biceps", "triceps", "peito", "costas", "pernas", "gluteo", "abdomen"] as const;
export type PriorityGroupId = (typeof PRIORITY_GROUP_IDS)[number];

/** `subs` = o preset: o que o grupo vira quando o usuário toca nele (o principal vem primeiro). */
export const priorityGroups: Record<PriorityGroupId, { nm: string; subs: SubMuscleId[] }> = {
  ombro:   { nm: "Ombro",   subs: ["ombro_lat", "ombro_post"] },
  biceps:  { nm: "Bíceps",  subs: ["biceps"] },
  triceps: { nm: "Tríceps", subs: ["triceps_longa", "triceps_lateral"] },
  peito:   { nm: "Peito",   subs: ["peito_medio", "peito_sup"] },
  costas:  { nm: "Costas",  subs: ["dorsal", "costas_meio"] },
  pernas:  { nm: "Pernas",  subs: ["quad", "isquio"] },
  gluteo:  { nm: "Glúteo",  subs: ["gluteo"] },
  abdomen: { nm: "Abdômen", subs: ["abdomen"] },
};

/** A que grupo uma subdivisão pertence (todas pertencem a um). */
export function groupOfSub(s: SubMuscleId): PriorityGroupId {
  const m = SUB_MUSCLES[s];
  if (m.muscle === "gluteo") return "gluteo";
  switch (m.region) {
    case "ombro": return "ombro";
    case "costas": return "costas";
    case "peito": return "peito";
    case "core": return "abdomen";
    case "pernas": return "pernas";
    default: return m.muscle === "triceps" ? "triceps" : "biceps";
  }
}

/** Grupos das subdivisões, na ordem em que aparecem pela 1ª vez, sem repetir. */
export function groupsOfSubs(subs: readonly SubMuscleId[]): PriorityGroupId[] {
  const out: PriorityGroupId[] = [];
  for (const s of subs) { if (!SUB_MUSCLES[s]) continue; const g = groupOfSub(s); if (!out.includes(g)) out.push(g); }
  return out;
}

export interface ToggleResult { subs: SubMuscleId[]; changed: boolean; reason?: "max" }

/** Toque num grupo: escolhe (preset, no fim da fila), retira se já estava, ou recusa com `max` quando já são 5. */
export function toggleGroup(subs: readonly SubMuscleId[], g: PriorityGroupId): ToggleResult {
  const atual = [...subs];
  if (atual.some((s) => groupOfSub(s) === g)) return { subs: atual.filter((s) => groupOfSub(s) !== g), changed: true };
  const novas = priorityGroups[g].subs;
  if (groupsOfSubs(atual).length >= MAX_PRIORITIES || atual.length + novas.length > MAX_PRIORITY_SUBS) return { subs: atual, changed: false, reason: "max" };
  return { subs: [...atual, ...novas], changed: true };
}

/** Toque numa subdivisão (modo avançado): mesma ideia, uma subparte de cada vez. */
export function toggleSub(subs: readonly SubMuscleId[], s: SubMuscleId): ToggleResult {
  const atual = [...subs];
  if (atual.includes(s)) return { subs: atual.filter((x) => x !== s), changed: true };
  const novoGrupo = !atual.some((x) => groupOfSub(x) === groupOfSub(s));
  if ((novoGrupo && groupsOfSubs(atual).length >= MAX_PRIORITIES) || atual.length >= MAX_PRIORITY_SUBS) return { subs: atual, changed: false, reason: "max" };
  return { subs: [...atual, s], changed: true };
}

/** Sobe (−1) ou desce (+1) um grupo na ordem de importância, levando as subdivisões dele juntas. */
export function moveGroup(subs: readonly SubMuscleId[], g: PriorityGroupId, delta: number): SubMuscleId[] {
  const ordem = groupsOfSubs(subs), i = ordem.indexOf(g), j = i + delta;
  if (i < 0 || j < 0 || j >= ordem.length) return [...subs];
  [ordem[i], ordem[j]] = [ordem[j], ordem[i]];
  return ordem.flatMap((x) => subs.filter((s) => SUB_MUSCLES[s] && groupOfSub(s) === x));
}

/** Corta o excesso (perfil antigo ou vindo de fora): só os 5 primeiros grupos e as 10 primeiras subdivisões, na ordem. */
export function limitSubs(subs: readonly SubMuscleId[]): SubMuscleId[] {
  const grupos = groupsOfSubs(subs).slice(0, MAX_PRIORITIES);
  return subs.filter((s) => SUB_MUSCLES[s] && grupos.includes(groupOfSub(s))).slice(0, MAX_PRIORITY_SUBS);
}

export const isSubMuscleId = (s: unknown): s is SubMuscleId => typeof s === "string" && SUB_MUSCLE_IDS.includes(s as SubMuscleId);
