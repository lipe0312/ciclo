// Comida 3.0 (#43): base de alimentos (30 comuns com unidade caseira, TACO como semente), base pessoal que vence a comum,
// reconhecimento "3 ovos e 2 pães", o que falta hoje com 2 sugestões e o resumo da semana. Funções puras, sem dependências.
import { foodParts } from "./comida.ts";
import type { FoodEntry } from "./comida.ts";

export interface Unidade { nome: string; g: number; /** plural, quando não é nome + "s" */ pl?: string }
/** Macros por 100 g (ou 100 ml). `unidades[0]` é a porção padrão (quando o texto não diz a unidade). */
export interface Alimento {
  key: string; nome: string; /** como aparece numa frase ("de whey") */ curto: string;
  /** palavras (sem acento, minúsculas) que reconhecem o alimento; o termo mais longo vence */ termos: string[];
  kcal: number; prot: number; carb: number; gord: number;
  unidades: Unidade[];
  /** taco: TACO 4ª ed.; rotulo: média de rótulos (não está na TACO); usuario: ajustado pela pessoa */ fonte: "taco" | "rotulo" | "usuario";
}

const A = (key: string, nome: string, curto: string, termos: string[], kcal: number, prot: number, carb: number, gord: number, unidades: Unidade[], fonte: "taco" | "rotulo" = "taco"): Alimento =>
  ({ key, nome, curto, termos, kcal, prot, carb, gord, unidades, fonte });

/** Os 30 alimentos mais comuns no prato brasileiro, por 100 g (TACO 4ª ed., arredondado; whey: média de rótulos). */
export const ALIMENTOS_COMUNS: readonly Alimento[] = [
  A("ovo", "Ovo de galinha, cozido", "ovo", ["ovo", "ovos"], 146, 13.3, 0.6, 9.5, [{ nome: "ovo", g: 50 }]),
  A("pao", "Pão francês", "pão", ["pao", "paes", "pao frances", "paozinho", "paezinhos"], 300, 8, 58.6, 3.1, [{ nome: "pão", g: 50, pl: "pães" }]),
  A("pao-forma", "Pão de forma integral", "pão de forma", ["pao de forma", "paes de forma", "pao integral"], 253, 9.4, 49.9, 3.7, [{ nome: "fatia", g: 25 }]),
  A("pao-queijo", "Pão de queijo, assado", "pão de queijo", ["pao de queijo", "paes de queijo"], 363, 5.1, 34.2, 24.6, [{ nome: "pão de queijo", g: 20, pl: "pães de queijo" }]),
  A("whey", "Whey protein (pó)", "whey", ["whey"], 400, 80, 8, 6, [{ nome: "scoop", g: 30 }], "rotulo"),
  A("arroz", "Arroz branco, cozido", "arroz", ["arroz"], 128, 2.5, 28.1, 0.2, [{ nome: "porção", g: 150, pl: "porções" }, { nome: "colher", g: 25, pl: "colheres" }]),
  A("arroz-integral", "Arroz integral, cozido", "arroz integral", ["arroz integral"], 124, 2.6, 25.8, 1, [{ nome: "porção", g: 150, pl: "porções" }, { nome: "colher", g: 25, pl: "colheres" }]),
  A("feijao", "Feijão carioca, cozido", "feijão", ["feijao", "feijoes"], 76, 4.8, 13.6, 0.5, [{ nome: "concha", g: 100 }, { nome: "colher", g: 20, pl: "colheres" }]),
  A("frango", "Peito de frango, grelhado", "frango", ["frango", "peito de frango"], 159, 32, 0, 2.5, [{ nome: "porção", g: 150, pl: "porções" }, { nome: "filé", g: 120, pl: "filés" }]),
  A("carne", "Carne bovina (patinho), grelhada", "carne", ["carne", "bife", "patinho"], 219, 35.9, 0, 7.3, [{ nome: "porção", g: 150, pl: "porções" }, { nome: "bife", g: 100 }]),
  A("carne-moida", "Carne moída, cozida", "carne moída", ["carne moida"], 212, 26.7, 0, 10.9, [{ nome: "porção", g: 120, pl: "porções" }, { nome: "colher", g: 30, pl: "colheres" }]),
  A("tilapia", "Tilápia, filé grelhado", "peixe", ["tilapia", "peixe"], 128, 26, 0, 2.7, [{ nome: "filé", g: 120, pl: "filés" }]),
  A("atum", "Atum em conserva", "atum", ["atum"], 166, 26.2, 0, 6, [{ nome: "lata", g: 120 }]),
  A("leite", "Leite integral", "leite", ["leite"], 61, 3.2, 4.7, 3.3, [{ nome: "copo", g: 200 }]),
  A("iogurte", "Iogurte natural", "iogurte", ["iogurte"], 51, 4.1, 1.9, 3, [{ nome: "pote", g: 170 }]),
  A("queijo", "Queijo muçarela", "queijo", ["queijo", "mussarela", "mucarela"], 330, 22.6, 3, 25.2, [{ nome: "fatia", g: 20 }]),
  A("queijo-minas", "Queijo minas frescal", "queijo minas", ["queijo minas", "queijo branco"], 264, 17.4, 3.2, 20.2, [{ nome: "fatia", g: 30 }]),
  A("requeijao", "Requeijão cremoso", "requeijão", ["requeijao"], 257, 9.6, 2.4, 23.4, [{ nome: "colher", g: 30, pl: "colheres" }]),
  A("banana", "Banana prata", "banana", ["banana"], 98, 1.3, 26, 0.1, [{ nome: "banana", g: 80 }]),
  A("maca", "Maçã", "maçã", ["maca"], 56, 0.3, 15.2, 0, [{ nome: "maçã", g: 130, pl: "maçãs" }]),
  A("mamao", "Mamão papaia", "mamão", ["mamao", "papaia"], 40, 0.5, 10.4, 0.1, [{ nome: "metade", g: 150 }]),
  A("aveia", "Aveia em flocos", "aveia", ["aveia"], 394, 13.9, 66.6, 8.5, [{ nome: "porção", g: 30, pl: "porções" }, { nome: "colher", g: 15, pl: "colheres" }]),
  A("macarrao", "Macarrão, cozido", "macarrão", ["macarrao", "espaguete"], 102, 3.4, 19.9, 1.2, [{ nome: "prato", g: 200 }]),
  A("batata", "Batata inglesa, cozida", "batata", ["batata", "batatas"], 52, 1.2, 11.9, 0, [{ nome: "porção", g: 150, pl: "porções" }]),
  A("batata-doce", "Batata-doce, cozida", "batata-doce", ["batata doce"], 77, 0.6, 18.4, 0.1, [{ nome: "porção", g: 150, pl: "porções" }]),
  A("mandioca", "Mandioca, cozida", "mandioca", ["mandioca", "aipim", "macaxeira"], 125, 0.6, 30.1, 0.3, [{ nome: "porção", g: 150, pl: "porções" }]),
  A("cuscuz", "Cuscuz de milho, cozido", "cuscuz", ["cuscuz"], 113, 2.2, 25.3, 0.7, [{ nome: "porção", g: 150, pl: "porções" }]),
  A("tapioca", "Tapioca (goma hidratada)", "tapioca", ["tapioca"], 240, 0, 59, 0, [{ nome: "tapioca", g: 60 }]),
  A("amendoim", "Amendoim / pasta de amendoim", "amendoim", ["amendoim", "pasta de amendoim"], 606, 27.2, 20.3, 43.9, [{ nome: "colher", g: 15, pl: "colheres" }]),
  A("salada", "Salada (alface e tomate)", "salada", ["salada", "alface", "tomate"], 15, 1.1, 3.1, 0.2, [{ nome: "prato", g: 80 }]),
];
export const ALIMENTO_BY_KEY: Readonly<Record<string, Alimento>> = Object.fromEntries(ALIMENTOS_COMUNS.map((a) => [a.key, a]));
export const MAX_ITENS_PESSOAIS = 200;

const norm = (s: string) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/-/g, " ");
const r1 = (n: number) => Math.round(n * 10) / 10;
const termRe = new Map<string, RegExp>();
const MAX_CACHE = 300;
/** Escapa tudo que é especial em RegExp: nome de unidade pode vir da pessoa (base pessoal). */
export const escRe = (t: string) => t.replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&");
const re = (t: string) => {
  const hit = termRe.get(t);
  if (hit) return hit;
  if (termRe.size >= MAX_CACHE) termRe.clear(); // teto: termos pessoais não crescem o cache sem fim
  const r = new RegExp(`(?:^|[^a-z])${escRe(t)}(?:s|es)?(?=[^a-z]|$)`);
  termRe.set(t, r);
  return r;
};
/** Nome de unidade caseira aceito da pessoa: letras (com acento), espaço e hífen, 1 a 30. */
export const UNIDADE_NOME_RE = /^[\p{L}][\p{L} -]{0,29}$/u;

/** Base em vigor: a pessoal primeiro (o ajuste da pessoa vence), depois as comuns que ela ainda não tem. */
export function baseAlimentos(pessoal: readonly Alimento[]): Alimento[] {
  const tem = new Set(pessoal.map((a) => a.key));
  return [...pessoal, ...ALIMENTOS_COMUNS.filter((a) => !tem.has(a.key))];
}

export interface ParteReconhecida {
  key: string | null; nome: string; qtd: number; unidade: string; g: number; /** "3 ovos", "2 colheres de arroz", "200 g de frango" */ texto: string;
  kcal: number; prot: number; carb: number; gord: number; fonte: "pessoal" | "comum" | "estimativa";
}
const NUM_WORDS: Record<string, number> = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, meio: 0.5, meia: 0.5 };
const MAX_UN = 12, MAX_G = 2000;
const SPLIT = /[,;\n+·]|\be\b|\bcom\b/;

/** Termos de um item: os da base comum (pela chave) mais o nome curto. A pessoa edita valores, não os termos. */
const termosDe = (a: Alimento) => ALIMENTO_BY_KEY[a.key]?.termos ?? [norm(a.curto)];

/** Cada trecho do texto vira no máximo um alimento: base pessoal, depois a comum, depois a estimativa antiga (sem chave). */
export function reconhecerAlimentos(text: string, pessoal: readonly Alimento[]): ParteReconhecida[] {
  const base = baseAlimentos(pessoal), mine = new Set(pessoal.map((a) => a.key));
  const out: ParteReconhecida[] = [];
  for (const raw of norm(text).slice(0, 2000).split(SPLIT)) {
    const part = raw.trim();
    if (!part) continue;
    let best: Alimento | null = null, bestLen = 0;
    for (const a of base) for (const t of termosDe(a)) if (t.length > bestLen && re(t).test(part)) { best = a; bestLen = t.length; }
    if (!best) {
      for (const p of foodParts(part)) out.push({ key: null, nome: p.label, qtd: 1, unidade: "porção", g: 0, texto: p.label.toLowerCase(), kcal: p.kcal, prot: p.prot, carb: 0, gord: 0, fonte: "estimativa" });
      continue;
    }
    const gm = part.match(/(\d+(?:[.,]\d+)?)\s*(?:g|gr|grs|gramas?|ml)\b/);
    let qtd: number, unidade: string, g: number, texto: string;
    if (gm) { g = Math.min(MAX_G, Number(gm[1].replace(",", "."))); qtd = g; unidade = "g"; texto = `${String(g).replace(".", ",")} g de ${best.curto}`; }
    else {
      const d = part.match(/(\d+(?:[.,]\d+)?)/), w = part.match(/\b(um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|meio|meia)\b/);
      qtd = d ? Number(d[1].replace(",", ".")) : w ? NUM_WORDS[w[1]] : 1;
      qtd = Math.max(0, Math.min(MAX_UN, qtd));
      const u = best.unidades.find((x) => re(norm(x.nome)).test(part) || (x.pl && re(norm(x.pl)).test(part))) ?? best.unidades[0];
      unidade = u.nome; g = qtd * u.g; texto = rotulo(best, u, qtd);
    }
    const f = g / 100;
    out.push({ key: best.key, nome: best.nome, qtd, unidade, g, texto, kcal: best.kcal * f, prot: best.prot * f, carb: best.carb * f, gord: best.gord * f, fonte: mine.has(best.key) ? "pessoal" : "comum" });
  }
  return out;
}

export function estimarComBase(text: string, pessoal: readonly Alimento[]): { kcal: number; prot: number; partes: ParteReconhecida[] } {
  const partes = reconhecerAlimentos(text, pessoal);
  return { kcal: Math.round(partes.reduce((s, p) => s + p.kcal, 0)), prot: r1(partes.reduce((s, p) => s + p.prot, 0)), partes };
}

export interface Macros { kcal: number; prot: number; carb: number; gord: number }
/** Valores de UMA unidade caseira (o que a tela mostra para editar). */
export function porUnidade(a: Alimento, u: Unidade): Macros {
  const f = u.g / 100;
  return { kcal: Math.round(a.kcal * f), prot: r1(a.prot * f), carb: r1(a.carb * f), gord: r1(a.gord * f) };
}
/** Volta de "por unidade de X g" para "por 100 g" (o que se grava). */
export function dePorUnidade(g: number, m: Macros): Macros {
  const f = 100 / g;
  return { kcal: r1(m.kcal * f), prot: r1(m.prot * f), carb: r1(m.carb * f), gord: r1(m.gord * f) };
}

// ---------- o que falta hoje ----------
export interface Sugestao { itens: { key: string; qtd: number; unidade: string }[]; texto: string; prot: number; kcal: number }
export interface FaltaHoje { prot: number; kcal: number; sugestoes: Sugestao[] }
const GENERICAS = new Set(["porcao", "colher", "fatia", "concha", "copo", "pote", "scoop", "lata", "file", "prato", "metade", "bife"]);
const MIN_PROT_UN = 5, MAX_CAND = 6;

const rotulo = (a: Alimento, u: Unidade, n: number) => {
  const nome = n > 1 ? u.pl ?? `${u.nome}s` : u.nome, q = String(n).replace(".", ",");
  return GENERICAS.has(norm(u.nome)) ? `${q} ${nome} de ${a.curto}` : `${q} ${nome}`;
};

/**
 * Faltas do dia (proteína e kcal) e até 2 sugestões concretas tiradas da base da pessoa (os que ela já come, na ordem dada);
 * com menos de 2 alimentos proteicos nela, completa com os comuns. Proteína ≥ 95% da meta conta como batida: sem sugestão.
 */
export function faltaHoje(meta: { kcal: number; protein: number }, totais: { kcal: number; prot: number }, base: readonly Alimento[]): FaltaHoje {
  const prot = Math.max(0, Math.round(meta.protein - totais.prot));
  const kcal = Math.max(0, Math.round((meta.kcal - totais.kcal) / 10) * 10);
  if (totais.prot >= meta.protein * 0.95 || prot <= 0) return { prot, kcal, sugestoes: [] };
  const proteico = (a: Alimento) => a.prot * a.unidades[0].g / 100 >= MIN_PROT_UN && a.prot >= 8;
  let cand = base.filter(proteico);
  if (cand.length < 2) {
    const tem = new Set(cand.map((a) => a.key));
    const extra = ALIMENTOS_COMUNS.filter((a) => proteico(a) && !tem.has(a.key)).sort((a, b) => b.prot * b.unidades[0].g - a.prot * a.unidades[0].g);
    cand = [...cand, ...extra];
  }
  cand = cand.slice(0, MAX_CAND);
  type Op = { parts: [Alimento, number][]; p: number; k: number; score: number };
  const ops: Op[] = [];
  const add = (parts: [Alimento, number][]) => {
    const p = parts.reduce((s, [a, n]) => s + a.prot * a.unidades[0].g / 100 * n, 0), k = parts.reduce((s, [a, n]) => s + a.kcal * a.unidades[0].g / 100 * n, 0);
    const un = parts.reduce((s, [, n]) => s + n, 0);
    const score = Math.max(0, prot - p) * 2 + Math.max(0, p - prot) * 0.5 + Math.max(0, k - kcal) / 20 + un;
    ops.push({ parts, p, k, score });
  };
  for (let i = 0; i < cand.length; i++) {
    for (let n = 1; n <= 4; n++) add([[cand[i], n]]);
    for (let j = i + 1; j < cand.length; j++) for (let n = 1; n <= 3; n++) for (let m = 1; m <= 3; m++) add([[cand[i], n], [cand[j], m]]);
  }
  ops.sort((a, b) => a.score - b.score); // sort estável: empate fica na ordem da base
  const keyset = (o: Op) => o.parts.map(([a]) => a.key).sort().join("|");
  const picked: Op[] = [];
  for (const o of ops) { if (picked.length >= 2) break; if (!picked.some((x) => keyset(x) === keyset(o))) picked.push(o); }
  return {
    prot, kcal,
    sugestoes: picked.map((o) => ({
      itens: o.parts.map(([a, n]) => ({ key: a.key, qtd: n, unidade: a.unidades[0].nome })),
      texto: `${o.parts.map(([a, n]) => rotulo(a, a.unidades[0], n)).join(" + ")} = ${Math.round(o.p)} g`,
      prot: Math.round(o.p), kcal: Math.round(o.k),
    })),
  };
}

/** A sugestão escrita só com chave, quantidade e os nomes da base comum (nada digitado pela pessoa): para o MCP. */
export function textoSugestaoBase(s: Sugestao): string {
  const partes = s.itens.flatMap((i) => { const a = ALIMENTO_BY_KEY[i.key]; return a ? [rotulo(a, a.unidades[0], i.qtd)] : []; });
  return `${partes.join(" + ")} = ${s.prot} g`;
}

// ---------- semana ----------
const addDays = (iso: string, n: number) => new Date(Date.parse(iso + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
export const ehBebida = (e: FoodEntry) => typeof e.id === "string" && e.id.startsWith("bebida-");

/** Últimos 7 dias até `end`: dias registrados, dias abaixo da meta (proteína < 95%, kcal < 90%) e a bebida (registros "bebida-…" do Diário) à parte. */
export function semanaComida(entries: readonly FoodEntry[], end: string, targets: { kcal: number; protein: number }) {
  const from = addDays(end, -6);
  const by = new Map<string, { kcal: number; prot: number }>();
  const bebida = { kcal: 0, dias: new Set<string>() };
  for (const e of entries) {
    if (e.date < from || e.date > end) continue;
    const d = by.get(e.date) ?? { kcal: 0, prot: 0 };
    d.kcal += e.kcal ?? 0; d.prot += e.prot ?? 0; by.set(e.date, d);
    if (ehBebida(e) && (e.kcal ?? 0) > 0) { bebida.kcal += e.kcal ?? 0; bebida.dias.add(e.date); }
  }
  const dias = [...by.values()];
  return {
    dias: dias.length,
    abaixoProt: dias.filter((d) => d.prot < targets.protein * 0.95).length,
    abaixoKcal: dias.filter((d) => d.kcal < targets.kcal * 0.9).length,
    bebida: { kcal: Math.round(bebida.kcal), dias: bebida.dias.size },
  };
}
