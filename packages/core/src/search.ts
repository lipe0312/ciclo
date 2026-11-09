// Busca da biblioteca de exercícios (força + cardio). Pura, sem índice pesado: ~120 itens cabem em < 1 ms.
import { CATALOG, EQUIPMENT_BY_ID, MUSCLES, SUB_MUSCLES } from "./catalog.ts";
import type { CatalogItem, Kind, MuscleId } from "./catalog.ts";

export const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export interface CatalogFilter { q?: string; muscle?: MuscleId | null; equipment?: string | null; type?: "forca" | "cardio" | Kind | null }

const HAY = new Map<string, string>();
function hay(it: CatalogItem): string {
  let h = HAY.get(it.id);
  if (h == null) {
    const parts = [it.nm, ...(it.aliases ?? []), ...it.eq.map((e) => EQUIPMENT_BY_ID[e]?.nm ?? e),
      ...(it.subMuscles ?? []).map((s) => SUB_MUSCLES[s].nm)];
    if (it.type === "forca") parts.push(MUSCLES[it.m].nm, it.kind);
    else parts.push("cardio");
    h = norm(parts.join(" "));
    HAY.set(it.id, h);
  }
  return h;
}

/** Todas as palavras da busca precisam aparecer (ordem livre). Nome que começa com a busca vem primeiro. */
export function searchCatalog(f: CatalogFilter, items: CatalogItem[] = CATALOG): CatalogItem[] {
  const words = norm(f.q ?? "").split(/\s+/).filter(Boolean);
  const qn = norm(f.q ?? "");
  const out: { it: CatalogItem; s: number }[] = [];
  for (const it of items) {
    if (f.muscle && (it.type !== "forca" || it.m !== f.muscle)) continue;
    if (f.equipment && !it.eq.includes(f.equipment)) continue;
    if (f.type && (f.type === "forca" || f.type === "cardio" ? it.type !== f.type : it.type !== "forca" || it.kind !== f.type)) continue;
    const h = hay(it);
    if (!words.every((w) => h.includes(w))) continue;
    const nm = norm(it.nm);
    out.push({ it, s: !qn ? 0 : nm.startsWith(qn) ? 0 : nm.includes(qn) ? 1 : 2 });
  }
  return out.sort((a, b) => a.s - b.s).map((x) => x.it);
}
