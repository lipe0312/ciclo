// #80 Camada 0 (regra, grátis): porções faladas em pt-BR. Medidas caseiras por tipo de alimento, quantificadores vagos
// ("um pouco", "muito", "um pratão"), pratos comuns com porção média e faixa, porção pessoal (a correção da pessoa vence)
// e teto de sanidade. Sem número = 1 porção média, com a suposição escrita; o número só vale para o alimento que acompanha.
// Saída no formato da prévia da #81 (`interpretarComida`), com confiança 0..1, origem e suposições por item.
// Fontes das medidas: docs/comida-medidas-caseiras.md. Puro, sem dependências; o texto do usuário é dado, nunca instrução.
import { guessMeal } from "./comida.ts";
import { ALIMENTO_BY_KEY, baseAlimentos, escRe } from "./alimentos.ts";
import type { Alimento } from "./alimentos.ts";
import { HORA_REFEICAO, MAX_DUVIDAS, normTexto, resolverData, separarRefeicoes } from "./comida-conversa.ts";
import type { Confianca, InterpretacaoComida, InterpretarEntrada, ItemPrevia, RefeicaoPrevia } from "./comida-conversa.ts";

export const MEDIDAS_FONTE = [
  "Pinheiro ABV et al. Tabela para Avaliação de Consumo Alimentar em Medidas Caseiras. 5ª ed. São Paulo: Atheneu, 2005.",
  "IBGE. Pesquisa de Orçamentos Familiares 2008-2009: Tabela de Medidas Referidas para os Alimentos Consumidos no Brasil. Rio de Janeiro: IBGE, 2011.",
  "NEPA/UNICAMP. Tabela Brasileira de Composição de Alimentos (TACO), 4ª ed. Campinas, 2011.",
] as const;

// ---------- tipos de alimento e medidas caseiras ----------
export type Categoria = "grao" | "caldo" | "po" | "liquido" | "massa" | "proteina" | "unidade" | "pasta" | "fruta" | "folha" | "prato";
const CATEGORIA: Record<string, Categoria> = {
  ovo: "unidade", pao: "unidade", "pao-forma": "unidade", "pao-queijo": "unidade", whey: "po", arroz: "grao", "arroz-integral": "grao",
  feijao: "caldo", frango: "proteina", carne: "proteina", "carne-moida": "proteina", tilapia: "proteina", atum: "proteina", leite: "liquido",
  iogurte: "liquido", queijo: "unidade", "queijo-minas": "unidade", requeijao: "pasta", banana: "fruta", maca: "fruta", mamao: "fruta",
  aveia: "po", macarrao: "massa", batata: "grao", "batata-doce": "grao", mandioca: "grao", cuscuz: "grao", tapioca: "unidade",
  amendoim: "pasta", salada: "folha", suco: "liquido", refri: "liquido",
};
export const categoriaDe = (key: string): Categoria => CATEGORIA[key] ?? (PRATO_BY_KEY[key] ? "prato" : "unidade");

/** Gramas (ou ml) de UMA medida cheia por tipo de alimento (valores médios arredondados das fontes acima). */
const MEDIDA_G: Record<string, Partial<Record<Categoria, number>> & { padrao: number }> = {
  "colher de sopa": { grao: 25, caldo: 20, po: 12, liquido: 15, massa: 25, proteina: 30, pasta: 20, fruta: 20, padrao: 20 },
  "colher de cha": { po: 4, liquido: 5, pasta: 7, padrao: 5 },
  concha: { caldo: 100, prato: 150, padrao: 100 },
  escumadeira: { grao: 90, massa: 100, padrao: 90 },
  "copo americano": { liquido: 190, padrao: 190 },
  "copo de requeijao": { liquido: 250, padrao: 250 },
  copo: { liquido: 200, padrao: 200 },
  xicara: { liquido: 240, grao: 160, po: 90, padrao: 160 },
  prato: { grao: 180, massa: 220, folha: 80, caldo: 250, padrao: 220 },
  "prato raso": { grao: 180, massa: 220, folha: 80, caldo: 250, padrao: 220 },
  "prato fundo": { grao: 300, massa: 350, caldo: 300, padrao: 350 },
  pratao: { grao: 400, massa: 450, caldo: 400, padrao: 450 },
  punhado: { folha: 20, padrao: 30 },
  pegador: { massa: 80, padrao: 80 },
  tigela: { padrao: 300 },
  // medidas "de unidade": valem a unidade do próprio alimento quando ele tem uma com esse nome
  fatia: { padrao: 30 }, unidade: { padrao: 50 }, pedaco: { padrao: 50 }, file: { padrao: 120 }, bife: { padrao: 100 },
  lata: { liquido: 350, padrao: 120 }, pote: { padrao: 170 }, scoop: { padrao: 30 },
};
/** Medidas que a pessoa pode usar numa porção pessoal ("porcao" = sem medida dita). */
export const MEDIDAS_IDS: readonly string[] = ["porcao", ...Object.keys(MEDIDA_G)];
/** Fator sobre a porção do prato quando a medida é de volume (um prato fundo de lasanha ≈ 1,3 porção). */
const PRATO_FATOR: Record<string, number> = { "prato fundo": 1.3, pratao: 1.6 };
/** null = medida desconhecida. */
export function gramasDaMedida(medida: string, cat: Categoria): number | null {
  const m = MEDIDA_G[medida];
  return m ? m[cat] ?? m.padrao : null;
}
const MEDIDA_NM: Record<string, [string, string]> = {
  "colher de sopa": ["colher de sopa", "colheres de sopa"], "colher de cha": ["colher de chá", "colheres de chá"], concha: ["concha", "conchas"],
  escumadeira: ["escumadeira", "escumadeiras"], "copo americano": ["copo americano", "copos americanos"], "copo de requeijao": ["copo de requeijão", "copos de requeijão"],
  copo: ["copo", "copos"], xicara: ["xícara", "xícaras"], prato: ["prato", "pratos"], "prato raso": ["prato raso", "pratos rasos"], "prato fundo": ["prato fundo", "pratos fundos"],
  pratao: ["pratão (prato fundo cheio)", "pratões"], punhado: ["punhado", "punhados"], pegador: ["pegador", "pegadores"], tigela: ["tigela", "tigelas"],
  fatia: ["fatia", "fatias"], unidade: ["unidade", "unidades"], pedaco: ["pedaço", "pedaços"], file: ["filé", "filés"], bife: ["bife", "bifes"],
  lata: ["lata", "latas"], pote: ["pote", "potes"], scoop: ["scoop", "scoops"], porcao: ["porção", "porções"], g: ["g", "g"],
};
/** Termos (sem acento) → medida; o mais longo vence. */
const MEDIDA_TERMOS: [RegExp, string][] = ([
  ["colheres? de sopa", "colher de sopa"], ["colheres? de cha|colherzinhas?", "colher de cha"], ["colheres?|colheradas?", "colher de sopa"],
  ["conchas?", "concha"], ["escumadeiras?", "escumadeira"], ["copos? americanos?", "copo americano"], ["copos? de requeijao", "copo de requeijao"],
  ["copos?", "copo"], ["xicaras?", "xicara"], ["pratos? rasos?", "prato raso"], ["pratos? fundos?", "prato fundo"],
  ["pratao|prato cheio|prato daqueles|pratada|pratos? bem servidos?", "pratao"], ["pratos?", "prato"], ["punhados?", "punhado"],
  ["pegador(?:es)?", "pegador"], ["tigelas?|cumbucas?|bowl", "tigela"], ["fatias?", "fatia"], ["unidades?", "unidade"], ["pedac(?:o|inho)s?", "pedaco"],
  ["files?", "file"], ["bifes?", "bife"], ["latas?|latinhas?", "lata"], ["potes?|potinhos?", "pote"], ["scoops?|dosador(?:es)?|medidas? de whey", "scoop"],
] as [string, string][]).map(([t, m]) => [new RegExp(`(?:^|[^a-z])(?:${t})(?=[^a-z]|$)`), m]);

// ---------- quantificadores vagos ----------
interface Quant { re: RegExp; fator: number; faixa: [number, number]; nm: string }
const QUANT: Quant[] = [
  { re: /\b(um pouquinho|pouquinho|um pouco|pouco|pouca)\b/, fator: 0.5, faixa: [0.3, 0.7], nm: "um pouco" },
  { re: /\b(bastante|muito|muita|um monte|monte)\b/, fator: 1.75, faixa: [1.5, 2], nm: "bastante" },
];

// ---------- pratos comuns e extras ----------
export interface Prato {
  key: string; nome: string; curto: string; termos: string[];
  /** por 100 g */ kcal: number; prot: number; carb: number; gord: number;
  /** porção média e a faixa plausível de UMA porção (g) */ porcao: { nome: string; pl: string; g: number }; faixa: [number, number];
  /** taco: TACO 4ª ed.; receita: média de receitas/rótulos brasileiros (doc) */ fonte: "taco" | "receita";
}
const P = (key: string, nome: string, curto: string, termos: string[], m: [number, number, number, number], porcao: [string, string, number], faixa: [number, number], fonte: Prato["fonte"] = "receita"): Prato =>
  ({ key, nome, curto, termos, kcal: m[0], prot: m[1], carb: m[2], gord: m[3], porcao: { nome: porcao[0], pl: porcao[1], g: porcao[2] }, faixa, fonte });
/** Pratos que a pessoa fala pelo nome (o prato vence o ingrediente: "pizza de frango" é pizza). Valores em docs/comida-medidas-caseiras.md. */
export const PRATOS: readonly Prato[] = [
  P("pizza", "Pizza (muçarela/calabresa)", "pizza", ["pizza"], [270, 11.5, 30, 11], ["fatia", "fatias", 110], [80, 150]),
  P("lasanha", "Lasanha à bolonhesa", "lasanha", ["lasanha", "lasagna"], [155, 8.5, 14, 7], ["porção", "porções", 300], [200, 400]),
  P("strogonoff", "Strogonoff (frango ou carne)", "strogonoff", ["strogonoff", "strogonofe", "estrogonofe", "estrogonoff", "stroganoff", "estrogonofi"], [160, 14, 4, 9.5], ["porção", "porções", 200], [150, 280]),
  P("escondidinho", "Escondidinho (carne seca/mandioca)", "escondidinho", ["escondidinho"], [145, 8, 15, 6], ["porção", "porções", 300], [200, 400]),
  P("feijoada", "Feijoada", "feijoada", ["feijoada"], [117, 8.7, 11.6, 6.5], ["porção", "porções", 250], [180, 350], "taco"),
  P("parmegiana", "Bife/frango à parmegiana", "parmegiana", ["parmegiana", "parmigiana"], [210, 17, 9, 12], ["bife", "bifes", 200], [150, 280]),
  P("yakisoba", "Yakisoba", "yakisoba", ["yakisoba", "yakissoba", "yakesoba"], [120, 7, 15, 3.5], ["porção", "porções", 350], [250, 450]),
  P("hamburguer", "Hambúrguer (sanduíche)", "hambúrguer", ["hamburguer", "hamburger", "x burguer", "xburguer", "x salada", "xsalada", "x bacon", "cheeseburger"], [255, 13, 24, 12], ["sanduíche", "sanduíches", 200], [150, 300]),
  P("acai", "Açaí na tigela (com xarope)", "açaí", ["acai"], [110, 0.7, 21.5, 3.7], ["tigela", "tigelas", 300], [200, 500], "taco"),
  P("tapioca", "Tapioca simples", "tapioca", ["tapioca"], [240, 0, 59, 0], ["tapioca", "tapiocas", 70], [50, 100], "taco"),
  P("cuscuz", "Cuscuz de milho", "cuscuz", ["cuscuz", "cuzcuz"], [113, 2.2, 25.3, 0.7], ["porção", "porções", 150], [100, 250], "taco"),
  // bebidas comuns que a base de 30 não tem
  P("suco", "Suco de laranja natural", "suco", ["suco", "suco de laranja"], [33, 0.7, 7.6, 0.1], ["copo", "copos", 200], [150, 300], "taco"),
  P("refri", "Refrigerante (com açúcar)", "refri", ["refri", "refrigerante", "coca", "guarana"], [42, 0, 10.6, 0], ["lata", "latas", 350], [250, 600]),
];
export const PRATO_BY_KEY: Readonly<Record<string, Prato>> = Object.fromEntries(PRATOS.map((p) => [p.key, p]));
/** Porção padrão diferente da 1ª unidade da base (a issue: "assumi 1 filé médio, ~120 g"). */
const UNIDADE_PADRAO: Record<string, string> = { frango: "filé" };

// ---------- porção pessoal e itens ----------
/** Correção da pessoa: "meu prato de arroz é uns 200 g" → { alimento: "arroz", medida: "prato", gramas: 200 }. medida "porcao" = sem medida dita. */
export interface PorcaoPessoal { alimento: string; medida: string; gramas: number }
export type Origem = "regra" | "pessoal" | "ia";
export interface ItemPorcao {
  key: string | null; nome: string; /** "3 fatias de pizza" */ texto: string; qtd: number; medida: string;
  g: number | null; faixa: [number, number] | null; kcal: number; prot: number;
  /** 0..1 */ conf: number; confianca: Confianca; origem: Origem; suposicoes: string[]; /** fora do plausível: pede confirmação */ conferir: boolean;
}
/** Teto de sanidade (a issue: > 80 g de proteína num item comum, > 2.000 kcal numa refeição). */
export const TETO = { protItem: 80, kcalItem: 1500, kcalRefeicao: 2000, protRefeicao: 150 } as const;
export const MAX_QTD = 12, MAX_G = 2000;

const r1 = (n: number) => Math.round(n * 10) / 10;
export const rotuloConfianca = (c: number): Confianca => (c >= 0.7 ? "alta" : c >= 0.5 ? "media" : "baixa");
const NUM_W: Record<string, number> = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, meio: 0.5, meia: 0.5 };
const termRe = (t: string) => new RegExp(`(?:^|[^a-z])${escRe(t)}(?:s|es)?(?=[^a-z]|$)`);
const RE_CACHE = new Map<string, RegExp>();
const casa = (t: string, s: string) => { let r = RE_CACHE.get(t); if (!r) { if (RE_CACHE.size > 400) RE_CACHE.clear(); r = termRe(t); RE_CACHE.set(t, r); } return r.test(s); };
const fmtN = (n: number) => String(r1(n)).replace(".", ",");
const nmMedida = (m: string, n: number) => (MEDIDA_NM[m] ?? [m, m])[n > 1 ? 1 : 0];

type Achado = { tipo: "prato"; p: Prato } | { tipo: "base"; a: Alimento };
/** O alimento do trecho: o prato vence o ingrediente; entre os da base, o termo mais longo vence. */
function achar(s: string, base: readonly Alimento[]): Achado | null {
  let bp: Prato | null = null, lp = 0;
  for (const p of PRATOS) for (const t of p.termos) if (t.length > lp && casa(t, s)) { bp = p; lp = t.length; }
  // bebidas "extras" (suco, refri) só vencem quando nenhum alimento da base aparece ("suco de laranja" não é laranja; "leite" vence "coca")
  let ba: Alimento | null = null, la = 0;
  for (const a of base) for (const t of ALIMENTO_BY_KEY[a.key]?.termos ?? [a.curto]) if (t.length > la && casa(t, s)) { ba = a; la = t.length; }
  if (bp && (bp.key !== "suco" && bp.key !== "refri" || !ba)) return { tipo: "prato", p: bp };
  return ba ? { tipo: "base", a: ba } : null;
}
const acharMedida = (s: string): string | null => { for (const [re, m] of MEDIDA_TERMOS) if (re.test(s)) return m; return null; };

/** Um trecho ("3 fatias de pizza de frango") → um item. null = não achei alimento. */
function estimarParte(parte: string, limpa: string, base: readonly Alimento[], pessoais: readonly PorcaoPessoal[]): ItemPorcao | null {
  const ach = achar(limpa, base);
  if (!ach) return null;
  const key = ach.tipo === "prato" ? ach.p.key : ach.a.key;
  const cat = categoriaDe(key);
  const per100 = ach.tipo === "prato" ? ach.p : ach.a;
  const curto = ach.tipo === "prato" ? ach.p.curto : ach.a.curto;
  const nome = ach.tipo === "prato" ? ach.p.nome : ach.a.nome;
  const sup: string[] = [];
  // quantificador vago sai antes de ler o número ("um pouco" não é "1")
  const q = QUANT.find((x) => x.re.test(parte));
  const semVago = q ? parte.replace(q.re, " ") : parte;
  const gm = semVago.match(/(\d+(?:[.,]\d+)?)\s*(?:g|gr|grs|gramas?|ml)\b/);
  let medida = acharMedida(semVago);
  const d = semVago.match(/(\d+(?:[.,]\d+)?)/), w = semVago.match(/\b(um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|meio|meia)\b/);
  const temNum = !gm && (!!d || !!w);
  let qtd = gm ? 1 : d ? Number(d[1].replace(",", ".")) : w ? NUM_W[w[1]] : 1;
  qtd = Math.max(0, Math.min(MAX_QTD, qtd));
  // gramas de UMA unidade/medida
  let un: number, unNome: string, conf: number, larg: [number, number], origem: Origem = "regra";
  const pess = pessoais.find((x) => x.alimento === key && x.medida === (medida ?? "porcao"));
  if (gm) {
    const g = Math.min(MAX_G, Number(gm[1].replace(",", ".")));
    un = g; unNome = "g"; conf = 0.95; larg = [0.9, 1.1]; medida = "g";
  } else if (pess) {
    un = pess.gramas; unNome = medida ? nmMedida(medida, qtd) : "porção"; conf = 0.9; larg = [0.9, 1.1]; origem = "pessoal";
    sup.push(`sua porção de ${curto}${medida ? ` (${nmMedida(medida, 1)})` : ""}: ~${Math.round(pess.gramas)} g`);
  } else {
    const propria = (nm: string) => {
      if (ach.tipo === "prato") return normTexto(ach.p.porcao.nome) === nm ? ach.p.porcao.g : null;
      return ach.a.unidades.find((u) => normTexto(u.nome) === nm)?.g ?? null;
    };
    if (medida) {
      const pr = ach.tipo === "prato" ? (PRATO_FATOR[medida] ? ach.p.porcao.g * PRATO_FATOR[medida] : propria(medida) ?? (["prato", "prato raso", "pedaco", "porcao", "unidade", "tigela", "concha"].includes(medida) ? ach.p.porcao.g : null)) : null;
      un = pr ?? propria(medida) ?? gramasDaMedida(medida, cat) ?? 50; unNome = nmMedida(medida, qtd);
      conf = medida === "pratao" ? 0.5 : 0.85; larg = medida === "pratao" ? [0.78, 1.22] : [0.8, 1.2];
      if (medida === "pratao") sup.push(`"pratão" = prato fundo cheio ≈ ${Math.round(un)} g`);
    } else if (ach.tipo === "prato") {
      un = ach.p.porcao.g; unNome = qtd > 1 ? ach.p.porcao.pl : ach.p.porcao.nome; medida = "porcao";
      conf = temNum ? 0.7 : 0.5; larg = [ach.p.faixa[0] / un, ach.p.faixa[1] / un];
    } else {
      const u = ach.a.unidades.find((x) => x.nome === UNIDADE_PADRAO[key]) ?? ach.a.unidades[0];
      un = u.g; unNome = qtd > 1 ? u.pl ?? `${u.nome}s` : u.nome; medida = "porcao";
      conf = temNum ? 0.75 : 0.55; larg = temNum ? [0.75, 1.25] : [0.65, 1.4];
    }
    if (!temNum && !q) sup.push(`assumi 1 ${unNome} de ${curto} (porção média, ~${Math.round(un)} g)`);
  }
  let g = gm ? un : un * qtd;
  let faixa: [number, number] = [g * larg[0], g * larg[1]];
  if (q) {
    faixa = [g * q.faixa[0], g * q.faixa[1]]; g *= q.fator; conf = Math.min(conf, 0.5);
    sup.push(`"${q.nm} de ${curto}" ≈ ${fmtN(q.fator)} porção (~${Math.round(g)} g)`);
  }
  g = Math.min(MAX_G, g);
  const f = g / 100;
  const kcal = Math.round(per100.kcal * f), prot = r1(per100.prot * f);
  const sing = medida && medida !== "porcao" && MEDIDA_NM[medida] ? MEDIDA_NM[medida][0] : ach.tipo === "prato" ? ach.p.porcao.nome : (ach.a.unidades.find((u) => u.nome === unNome || u.pl === unNome || `${u.nome}s` === unNome)?.nome ?? unNome);
  const mesmo = normTexto(sing) === normTexto(curto);
  const texto = medida === "g" ? `${fmtN(g)} g de ${curto}` : `${fmtN(q ? q.fator * qtd : qtd)} ${unNome}${mesmo ? "" : ` de ${curto}`}`;
  const conferir = prot > TETO.protItem || kcal > TETO.kcalItem;
  return {
    key, nome, texto, qtd, medida: medida ?? "porcao", g: Math.round(g), faixa: [Math.round(Math.min(faixa[0], g)), Math.round(Math.max(faixa[1], g))],
    kcal, prot, conf, confianca: rotuloConfianca(conf), origem, suposicoes: sup, conferir,
  };
}

const SPLIT = /[,;\n+·]|\be\b|\bcom\b|\bmais\b/;
const STOP = /\b(hoje|ontem|anteontem|eu|comi|tomei|bebi|almocei|jantei|lanchei|no|na|o|a|os|as|um|uma|de|do|da|manha|tarde|noite|madrugada|pela|cafe da manha|almoco|almocar|jantar|janta|lanche|ceia|desjejum|depois|tambem|so)\b/g;
const ZERO = /\b(cafe preto|cafezinho|cafe|agua|cha)\b/;
const PREPARO = /grelhad|assad|cozid|frit|empanad|milanesa|refogad|ensopad/;
const COM_PREPARO = new Set(["frango", "carne", "tilapia"]);
const limpar = (parte: string) => parte.replace(STOP, " ").replace(/[^a-z0-9 ,.]/g, " ").replace(/\s+/g, " ").trim();

/** Estimativa de um texto (sem separar refeições): o que a tela mostra enquanto a pessoa fala. */
export function estimarItens(texto: string, pessoal: readonly Alimento[], pessoais: readonly PorcaoPessoal[]): { itens: ItemPorcao[]; kcal: number; prot: number; naoReconhecidos: string[] } {
  const base = baseAlimentos(pessoal), itens: ItemPorcao[] = [], nao: string[] = [];
  for (const bruto of normTexto(String(texto ?? "").slice(0, 2000)).split(SPLIT)) {
    const parte = bruto.trim(), limpa = limpar(parte);
    if (!/[a-z]/.test(limpa)) continue;
    const it = estimarParte(parte, limpa, base, pessoais);
    if (it) itens.push(it);
    else if (!ZERO.test(limpa)) nao.push(limpa.slice(0, 60));
  }
  return { itens, kcal: itens.reduce((s, i) => s + i.kcal, 0), prot: r1(itens.reduce((s, i) => s + i.prot, 0)), naoReconhecidos: nao };
}

// ---------- prévia por refeição (mesma forma da #81) ----------
export type ItemPorcaoPrevia = ItemPrevia & Pick<ItemPorcao, "conf" | "origem" | "suposicoes" | "conferir" | "qtd" | "medida">;
export type RefeicaoPorcao = Omit<RefeicaoPrevia, "itens"> & { itens: ItemPorcaoPrevia[]; conferir: boolean };
export type InterpretacaoPorcoes = Omit<InterpretacaoComida, "refeicoes"> & { refeicoes: RefeicaoPorcao[] };
export type EntradaPorcoes = InterpretarEntrada & { pessoais?: readonly PorcaoPessoal[] };

const pior = (a: Confianca, b: Confianca): Confianca => (a === "baixa" || b === "baixa" ? "baixa" : a === "media" || b === "media" ? "media" : "alta");
export const paraPrevia = (i: ItemPorcao): ItemPorcaoPrevia => ({
  nome: i.nome, texto: i.texto, key: i.key, g: i.g, faixa: i.faixa, kcal: i.kcal, prot: i.prot, confianca: i.conferir ? "baixa" : i.confianca,
  conf: i.conf, origem: i.origem, suposicoes: i.suposicoes, conferir: i.conferir, qtd: i.qtd, medida: i.medida,
});
/** Fecha uma refeição: totais, teto de sanidade da refeição e confiança. */
export function fecharRefeicao(r: { refeicao: RefeicaoPrevia["refeicao"]; texto: string; itens: ItemPorcaoPrevia[] }): RefeicaoPorcao {
  const kcal = Math.round(r.itens.reduce((s, i) => s + i.kcal, 0)), prot = r1(r.itens.reduce((s, i) => s + i.prot, 0));
  const conferir = kcal > TETO.kcalRefeicao || prot > TETO.protRefeicao || r.itens.some((i) => i.conferir);
  let conf: Confianca = r.itens.length ? "alta" : "baixa";
  for (const i of r.itens) conf = pior(conf, i.confianca);
  return { refeicao: r.refeicao, hora: HORA_REFEICAO[r.refeicao], texto: r.texto, itens: r.itens, kcal, prot, confianca: conferir ? "baixa" : conf, conferir };
}
export const temConferir = (i: { refeicoes: readonly { conferir?: boolean; itens: readonly { conferir?: boolean }[] }[] }) =>
  i.refeicoes.some((r) => r.conferir || r.itens.some((x) => x.conferir));
/** Dúvidas do teto ("⚠ conferir") primeiro; depois as da regra; no máximo 2 (o resto vira suposição). */
export function duvidasDoTeto(refeicoes: readonly RefeicaoPorcao[]): string[] {
  const out: string[] = [];
  for (const r of refeicoes) {
    for (const i of r.itens) if (i.conferir && i.key) out.push(`⚠ conferir: ${i.texto} ≈ ${i.kcal} kcal e ${fmtN(i.prot)} g de proteína — confirme a quantidade`);
    if (r.kcal > TETO.kcalRefeicao || r.prot > TETO.protRefeicao) out.push(`⚠ conferir: refeição com ~${r.kcal} kcal e ${fmtN(r.prot)} g de proteína — confirme antes de subir`);
  }
  return out;
}

/** O interpretador da #80 (camada 0): troca o `interpretarComida` da #81 por trás, com a mesma forma de saída. */
export function interpretarPorcoes(e: EntradaPorcoes): InterpretacaoPorcoes {
  const { data, relativa } = resolverData(e.texto, e.hoje, e.data);
  const padrao = e.refeicao ?? guessMeal(e.texto, e.hora);
  const base = baseAlimentos(e.base ?? []), pessoais = e.pessoais ?? [];
  const suposicoes: string[] = [], candidatas: { texto: string; peso: number; senao: string }[] = [];
  if (relativa) suposicoes.push(`"${relativa}" = ${data}`);
  let zeroDito = false;
  const refeicoes = separarRefeicoes(e.texto, padrao).map(({ refeicao, texto }) => {
    const itens: ItemPorcaoPrevia[] = [];
    for (const bruto of normTexto(texto).split(SPLIT)) {
      const parte = bruto.trim(), limpa = limpar(parte);
      if (!/[a-z]/.test(limpa)) continue;
      const it = estimarParte(parte, limpa, base, pessoais);
      if (!it) {
        if (ZERO.test(limpa)) {
          const nome = /agua/.test(limpa) ? "Água" : /cha/.test(limpa) ? "Chá" : "Café";
          itens.push({ nome, texto: nome.toLowerCase(), key: null, g: null, faixa: null, kcal: 0, prot: 0, confianca: "media", conf: 0.6, origem: "regra", suposicoes: [], conferir: false, qtd: 1, medida: "porcao" });
          if (!zeroDito) { suposicoes.push("café, chá e água sem açúcar ≈ 0 kcal"); zeroDito = true; }
          continue;
        }
        // nunca some: vira item marcado (0 kcal até alguém dizer o que era) e dúvida
        const nm = limpa.slice(0, 60);
        itens.push({ nome: nm, texto: nm, key: null, g: null, faixa: null, kcal: 0, prot: 0, confianca: "baixa", conf: 0, origem: "regra", suposicoes: [], conferir: true, qtd: 1, medida: "porcao" });
        candidatas.push({ texto: `Não reconheci "${nm}": o que era e quanto?`, peso: 300, senao: `"${nm}" ficou com 0 kcal (não reconheci)` });
        continue;
      }
      suposicoes.push(...it.suposicoes);
      const curto = it.key ? (ALIMENTO_BY_KEY[it.key]?.curto ?? it.key) : it.nome;
      if (it.key && COM_PREPARO.has(it.key) && !PREPARO.test(parte) && it.kcal > 150) {
        candidatas.push({ texto: `O ${curto} era grelhado ou frito?`, peso: it.kcal * 0.5, senao: `considerei o ${curto} grelhado` });
      }
      itens.push(paraPrevia(it));
    }
    return fecharRefeicao({ refeicao, texto, itens });
  });
  const teto = duvidasDoTeto(refeicoes).map((t) => ({ texto: t, peso: 1e6, senao: t }));
  const todas = [...teto, ...candidatas.sort((a, b) => b.peso - a.peso)];
  const duvidas = todas.slice(0, MAX_DUVIDAS).map((d) => d.texto);
  suposicoes.push(...todas.slice(MAX_DUVIDAS).map((d) => d.senao));
  let confianca = refeicoes.reduce((c, r) => pior(c, r.confianca), "alta" as Confianca);
  if (duvidas.length) confianca = pior(confianca, "media");
  if (temConferir({ refeicoes })) confianca = "baixa";
  return {
    data, dataRelativa: relativa, refeicoes,
    total: { kcal: refeicoes.reduce((s, r) => s + r.kcal, 0), prot: r1(refeicoes.reduce((s, r) => s + r.prot, 0)) },
    suposicoes: [...new Set(suposicoes)].slice(0, 10), duvidas, confianca,
  };
}
