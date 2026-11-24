// #79/#139 Equipamento sem academia: o que a pessoa marcou no perfil (`equipamentos`) ou, sem nada, só o peso corporal.
// Fica fora de sem-academia.ts (que lê o perfil) para a semana poder usar sem ciclo de import. Só depende do catálogo.
import { EQUIPMENT_BY_ID } from "./catalog.ts";

/** Peso corporal não pede aparelho: os exercícios dele têm `eq: []` e entram com qualquer equipamento. */
export const PESO_CORPORAL: readonly string[] = Object.freeze([]);
/** Limite da lista no perfil. */
export const MAX_EQUIPAMENTOS = 40;

/**
 * Equipamento quando não há academia: 1) o que a pessoa marcou em `equipamentos` (só IDs do catálogo, sem repetir);
 * 2) sem nada marcado, só peso corporal (elástico e halteres entram apenas se marcados).
 */
export function equipamentoSemAcademia(perfil: { equipamentos?: unknown } | null | undefined): string[] {
  const marcados = perfil && Array.isArray(perfil.equipamentos) ? perfil.equipamentos : [];
  const ok = marcados.filter((q): q is string => typeof q === "string" && Object.hasOwn(EQUIPMENT_BY_ID, q));
  return ok.length ? [...new Set(ok)] : [...PESO_CORPORAL];
}

/** Aparelhos de um dia: os da academia do dia; com 0 academias, os do perfil (equipamentoSemAcademia). */
export function equipamentoDoDia(p: { gyms: readonly { id: string; equipment: readonly string[] }[]; equipamentos?: unknown }, gymId: string | null | undefined): string[] {
  return p.gyms.length ? [...(p.gyms.find((x) => x.id === gymId)?.equipment ?? [])] : equipamentoSemAcademia(p);
}
