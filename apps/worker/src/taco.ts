// TACO (NEPA/UNICAMP) como dado estático: o Claude confere a estimativa do app com estes valores por 100 g.
// Subconjunto compacto em ../data/taco.min.json (fonte citada em THIRD_PARTY.md). Sem rede, sem banco.
import taco from "../data/taco.min.json" with { type: "json" };

export interface TacoItem { nome: string; kcal: number; prot: number }
const ITEMS: TacoItem[] = (taco.itens as unknown as [string, number, number][]).map(([nome, kcal, prot]) => ({ nome, kcal, prot }));
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const STOP = new Set(["de", "do", "da", "dos", "das", "com", "sem", "uma", "um", "dois", "duas", "tres", "meio", "meia", "gramas", "grama", "copo", "fatia", "fatias", "colher", "prato", "porcao", "xicara"]);
const NORMED = ITEMS.map((i) => norm(i.nome));

const has = (name: string, t: string) => name.includes(t) || (t.endsWith("s") && name.includes(t.slice(0, -1)));

export const TACO_FONTE: string = taco.fonte;

/** Alimentos da TACO que casam com o texto (por palavras), melhores primeiro. */
export function searchTaco(q: string, limit = 3): TacoItem[] {
  const tokens = [...new Set(norm(q).split(/[^a-z]+/).filter((t) => t.length >= 3 && !STOP.has(t) && !/^(g|gr|ml|kg)$/.test(t)))].slice(0, 8);
  if (!tokens.length) return [];
  return ITEMS.map((it, i) => ({ it, score: tokens.reduce((s, t, k) => s + (has(NORMED[i], t) ? (k === 0 ? 3 : 2) : 0), 0) }))
    .filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, limit).map((x) => x.it);
}

/** Dicas compactas para o Claude: uma linha por trecho do registro (máx. 8). */
export function tacoHints(text: string): string[] {
  const out: string[] = [];
  for (const frag of text.split(/[,;\n+·]| e /).slice(0, 8)) {
    const hit = searchTaco(frag, 1)[0];
    if (hit && !out.some((o) => o.startsWith(hit.nome))) out.push(`${hit.nome}: ${hit.kcal} kcal · ${String(hit.prot).replace(".", ",")} g proteína /100 g`);
  }
  return out;
}
