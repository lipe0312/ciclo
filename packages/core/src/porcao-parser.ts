// #80 Parser próprio de porções (NLP sem IA), em MODO SOMBRA: roda junto com a IA, que continua decidindo.
// Normaliza (sem acento, por extenso → número, meio/meia → 0,5), separa itens (vírgula, e, com, mais) e etiqueta cada
// token com um léxico versionado: quantidade, medida caseira, quantificador vago, alimento (base + pratos + apelidos) e preparo.
// A comparação com a IA guarda só etiquetas e ids (palavra fora do léxico vira "?"): nunca o texto cru.
// Aprende porções com N confirmações coerentes. Pular a IA numa categoria só com a flag do dono (desligada por padrão).
// Puro, sem dependências.
import { ALIMENTOS_COMUNS, ALIMENTO_BY_KEY } from "./alimentos.ts";
import { PRATOS, PRATO_BY_KEY, categoriaDe, gramasDaMedida } from "./porcoes.ts";

export const LEXICO_VERSAO = 1;
/** Apelidos regionais e jeitos de falar → alimento. */
export const APELIDOS: Readonly<Record<string, string>> = {
  "pao de sal": "pao", cacetinho: "pao", carioquinha: "pao", "pao frances": "pao", "pao careca": "pao", "pao jaco": "pao",
  aipim: "mandioca", macaxeira: "mandioca", miojo: "macarrao", espaguete: "macarrao", "peito de frango": "frango", sobrecoxa: "frango",
  coxa: "frango", "file de frango": "frango", patinho: "carne", alcatra: "carne", "contra file": "carne", "carne de panela": "carne",
  omelete: "ovo", peixe: "tilapia", "x salada": "hamburguer", "x burguer": "hamburguer",
};
const r1 = (n: number) => Math.round(n * 10) / 10;
const sem = (s: string) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const NUM: Record<string, string> = { um: "1", uma: "1", dois: "2", duas: "2", tres: "3", quatro: "4", cinco: "5", seis: "6", sete: "7", oito: "8", nove: "9", dez: "10", onze: "11", doze: "12", meio: "0.5", meia: "0.5" };
/** Minúsculas, sem acento, hífen vira espaço, "200g" vira "200 g", números por extenso viram dígitos ("um pouco" fica). */
export function normalizarParser(texto: string): string {
  const t = sem(texto).slice(0, 2000).replace(/(\d),(\d)/g, "$1.$2").replace(/[-_/]/g, " ").replace(/(\d)([a-z])/g, "$1 $2").replace(/[^a-z0-9., ;\n+]/g, " ");
  return t.replace(/\b(um|uma)\s+(pouquinho|pouco|monte)\b/g, "$1_$2").replace(/\b[a-z]+\b/g, (w) => NUM[w] ?? w).replace(/_/g, " ").replace(/\s+/g, " ").trim();
}
const SPLIT = /[,;\n+]|\be\b|\bcom\b|\bmais\b/;
export const separarItens = (texto: string) => normalizarParser(texto).split(SPLIT).map((s) => s.trim()).filter(Boolean);

// ---------- léxico ----------
type Tag = string;
const LEX = new Map<string, Tag>();
const MEDIDA_LEX: Record<string, string> = {
  "colher de sopa": "colher de sopa", "colheres de sopa": "colher de sopa", "colher de cha": "colher de cha", "colheres de cha": "colher de cha", colherzinha: "colher de cha",
  colher: "colher de sopa", colheres: "colher de sopa", colherada: "colher de sopa", colheradas: "colher de sopa", concha: "concha", conchas: "concha",
  escumadeira: "escumadeira", escumadeiras: "escumadeira", "copo americano": "copo americano", "copos americanos": "copo americano", "copo de requeijao": "copo de requeijao",
  copo: "copo", copos: "copo", xicara: "xicara", xicaras: "xicara", "prato raso": "prato raso", "prato fundo": "prato fundo", pratao: "pratao", "prato cheio": "pratao",
  "prato daqueles": "pratao", pratada: "pratao", prato: "prato", pratos: "prato", punhado: "punhado", punhados: "punhado", pegador: "pegador", pegadores: "pegador",
  tigela: "tigela", tigelas: "tigela", cumbuca: "tigela", fatia: "fatia", fatias: "fatia", unidade: "unidade", unidades: "unidade", pedaco: "pedaco", pedacos: "pedaco",
  pedacinho: "pedaco", file: "file", files: "file", lata: "lata", latas: "lata", latinha: "lata", pote: "pote", potes: "pote", potinho: "pote", scoop: "scoop", scoops: "scoop",
  dosador: "scoop", g: "g", gr: "g", grs: "g", grama: "g", gramas: "g", ml: "g",
};
for (const [t, m] of Object.entries(MEDIDA_LEX)) LEX.set(t, `medida:${m}`);
for (const t of ["um pouquinho", "pouquinho", "um pouco", "pouco", "pouca"]) LEX.set(t, "vago:pouco");
for (const t of ["muito", "muita", "bastante", "um monte", "monte"]) LEX.set(t, "vago:muito");
const norma = (t: string) => sem(t).replace(/-/g, " ");
for (const a of ALIMENTOS_COMUNS) for (const t of a.termos) if (!LEX.has(norma(t))) LEX.set(norma(t), `alimento:${a.key}`);
for (const p of PRATOS) for (const t of p.termos) LEX.set(norma(t), `alimento:${p.key}`);
for (const [t, k] of Object.entries(APELIDOS)) LEX.set(t, `alimento:${k}`);
LEX.set("bife", "alimento:carne");
const PREPARO: [RegExp, string][] = [[/^grelhad/, "grelhado"], [/^frit/, "frito"], [/^assad/, "assado"], [/^cozid/, "cozido"], [/^empanad/, "empanado"], [/^(milanesa|a milanesa)$/, "empanado"], [/^refogad/, "refogado"], [/^ensopad/, "ensopado"]];
const STOP = new Set(["de", "do", "da", "dos", "das", "o", "a", "os", "as", "no", "na", "nos", "nas", "em", "eu", "comi", "tomei", "bebi", "almocei", "jantei", "lanchei", "hoje", "ontem", "so", "tambem", "depois", "completa", "completo", "inteiro", "inteira", "tipo"]);
const MAX_FRASE = 4;

function lookup(fr: string): Tag | null {
  return LEX.get(fr) ?? (fr.endsWith("es") ? LEX.get(fr.slice(0, -2)) : undefined) ?? (fr.endsWith("s") ? LEX.get(fr.slice(0, -1)) : undefined) ?? null;
}
/** Etiquetas de um trecho já normalizado: "qtd:2", "medida:fatia", "alimento:pizza", "vago:pouco", "prep:frito" ou "?" (fora do léxico). */
export function etiquetar(trecho: string): Tag[] {
  const w = trecho.split(" ").filter(Boolean), out: Tag[] = [];
  for (let i = 0; i < w.length;) {
    if (/^\d+(\.\d+)?$/.test(w[i])) { out.push(`qtd:${Number(w[i])}`); i++; continue; }
    let hit: Tag | null = null, n = 0;
    for (let k = Math.min(MAX_FRASE, w.length - i); k >= 1 && !hit; k--) {
      const fr = w.slice(i, i + k).join(" ");
      const t = lookup(fr);
      if (t) { hit = t; n = k; }
    }
    if (hit) { out.push(hit); i += n; continue; }
    const prep = PREPARO.find(([re]) => re.test(w[i]));
    if (prep) out.push(`prep:${prep[1]}`);
    else if (!STOP.has(w[i])) out.push("?");
    i++;
  }
  return out;
}

export interface ItemParser { alimento: string | null; qtd: number | null; medida: string | null; vago: "pouco" | "muito" | null; preparo: string | null; tags: Tag[] }
const val = (tags: Tag[], p: string) => tags.find((t) => t.startsWith(p))?.slice(p.length) ?? null;
/** Texto → itens etiquetados (um por trecho). O prato vence o ingrediente ("pizza de frango" é pizza). */
export function parsePorcao(texto: string): ItemParser[] {
  return separarItens(texto).flatMap((tr) => {
    const tags = etiquetar(tr);
    if (!tags.length) return [];
    const alims = tags.filter((t) => t.startsWith("alimento:")).map((t) => t.slice(9));
    const alimento = alims.find((k) => PRATO_BY_KEY[k] && k !== "suco" && k !== "refri") ?? alims[0] ?? null;
    const q = val(tags, "qtd:");
    return [{ alimento, qtd: q == null ? null : Number(q), medida: val(tags, "medida:"), vago: val(tags, "vago:") as ItemParser["vago"], preparo: val(tags, "prep:"), tags }];
  });
}

const FATOR_VAGO = { pouco: 0.5, muito: 1.75 } as const;
/** Gramas que o parser estima para um item (para medir o erro contra a IA). */
export function gramasParser(i: ItemParser): number | null {
  if (!i.alimento) return null;
  const q = i.qtd ?? 1;
  if (i.medida === "g") return q;
  const pr = PRATO_BY_KEY[i.alimento], a = ALIMENTO_BY_KEY[i.alimento];
  const padrao = pr?.porcao.g ?? a?.unidades[0].g ?? 100;
  const un = i.medida ? gramasDaMedida(i.medida, categoriaDe(i.alimento)) ?? padrao : padrao;
  return Math.round(un * q * (i.vago ? FATOR_VAGO[i.vago] : 1));
}

// ---------- modo sombra ----------
export interface ComparacaoSombra { v: number; categoria: string; tags: Tag[][]; idsParser: (string | null)[]; idsIA: string[]; concordou: boolean; erroG: number | null }
/** Só etiquetas e ids: o texto cru nunca entra (palavra fora do léxico já virou "?"). */
export function compararSombra(parser: readonly ItemParser[], ia: readonly { key: string | null; g: number | null }[]): ComparacaoSombra {
  const idsIA = ia.flatMap((x) => (x.key ? [x.key] : []));
  const idsParser = parser.map((p) => p.alimento);
  const a = idsParser.filter((x): x is string => !!x).sort().join("|"), b = [...idsIA].sort().join("|");
  const erros: number[] = [];
  const usados = new Set<number>();
  for (const p of parser) {
    const j = ia.findIndex((x, k) => !usados.has(k) && x.key === p.alimento && x.g != null);
    const gp = gramasParser(p);
    if (j >= 0 && gp != null) { usados.add(j); erros.push(Math.abs(gp - (ia[j].g as number))); }
  }
  const k0 = idsIA[0] ?? idsParser.find((x) => x) ?? null;
  return {
    v: LEXICO_VERSAO, categoria: k0 ? categoriaDe(k0) : "desconhecido", tags: parser.map((p) => p.tags.slice(0, 12)), idsParser, idsIA,
    concordou: a === b && a !== "", erroG: erros.length ? Math.round(erros.reduce((s, x) => s + x, 0) / erros.length) : null,
  };
}

// ---------- aprendizado ----------
export interface PorcaoAprendida { alimento: string; medida: string; gramas: number; n: number }
/** Pares texto → itens finais (corrigidos pela pessoa ou pelo Claude) viram porção pessoal só depois de N confirmações coerentes
 *  (maior/menor ≤ 1,3). Gramas por medida = mediana. */
export function aprenderPorcoes(pares: readonly { texto: string; itens: readonly { key: string | null; g: number | null }[] }[], n = 2): PorcaoAprendida[] {
  const acc = new Map<string, number[]>();
  for (const par of pares.slice(0, 500)) {
    const ps = parsePorcao(par.texto);
    for (const p of ps) {
      if (!p.alimento || p.medida === "g" || p.vago) continue;
      const fim = par.itens.find((x) => x.key === p.alimento && x.g != null && x.g > 0);
      if (!fim) continue;
      const q = p.qtd ?? 1;
      if (!(q > 0)) continue;
      const k = `${p.alimento}\u0000${p.medida ?? "porcao"}`;
      acc.set(k, [...(acc.get(k) ?? []), (fim.g as number) / q]);
    }
  }
  const out: PorcaoAprendida[] = [];
  for (const [k, gs] of acc) {
    if (gs.length < n) continue;
    const s = [...gs].sort((a, b) => a - b);
    if (s[s.length - 1] / s[0] > 1.3) continue;
    const med = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
    const [alimento, medida] = k.split("\u0000");
    out.push({ alimento, medida, gramas: Math.round(med), n: gs.length });
  }
  return out;
}

// ---------- métrica e flag ----------
export interface MetricaCategoria { n: number; taxa: number; erroMedioG: number | null }
export function metricasSombra(rows: readonly { categoria: string; concordou: boolean; erroG: number | null }[]): Record<string, MetricaCategoria> {
  const by: Record<string, { n: number; ok: number; e: number[] }> = {};
  for (const r of rows) {
    const c = (by[r.categoria] ??= { n: 0, ok: 0, e: [] });
    c.n++; if (r.concordou) c.ok++; if (r.erroG != null) c.e.push(r.erroG);
  }
  return Object.fromEntries(Object.entries(by).map(([k, c]) => [k, { n: c.n, taxa: r1(c.ok / c.n * 100) / 100, erroMedioG: c.e.length ? Math.round(c.e.reduce((s, x) => s + x, 0) / c.e.length) : null }]));
}
/** Pular a IA numa categoria: nada muda sozinho. Só com a flag do dono E ≥ 95% de concordância em ≥ 200 casos. */
export const PULAR_IA_PADRAO = false;
export const PULAR_IA_MIN = { casos: 200, taxa: 0.95 } as const;
export function podePularIA(m: Record<string, MetricaCategoria>, categoria: string, flagDono = PULAR_IA_PADRAO): boolean {
  const c = m[categoria];
  return !!flagDono && !!c && c.n >= PULAR_IA_MIN.casos && c.taxa >= PULAR_IA_MIN.taxa;
}
