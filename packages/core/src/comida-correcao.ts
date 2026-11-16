// #87 Comida pelo Chat: corrigir e lançar em qualquer dia. (1) Item informado pela IA (rótulo ou estimativa dela) vira item
// próprio do registro, nunca só o total: total = soma dos itens. (2) Editar um registro inteiro (descrição + itens + kcal +
// proteína) com antes → depois por item. (3) Registros vagos ("Não lembro", confiança baixa, sem itens) para corrigir em lote.
// (4) Vários dias numa frase ("sábado A, domingo B", "fim de semana", "ontem", "dia 12"). Puro, sem dependências.
// Consome `interpretarComida` (a #80 troca a implementação por trás); texto do usuário e da IA é dado, nunca instrução.
import { MEALS } from "./comida.ts";
import type { Meal } from "./comida.ts";
import { ALIMENTO_BY_KEY } from "./alimentos.ts";
import { HORA_REFEICAO, normTexto } from "./comida-conversa.ts";
import type { Confianca, InterpretacaoComida, ItemPrevia, RefeicaoPrevia } from "./comida-conversa.ts";

/** De onde veio o valor do item: o parser do app, a estimativa do Chat ou o rótulo da embalagem. */
export const FONTES_ITEM = ["estimativa", "rotulo"] as const;
export type FonteItem = (typeof FONTES_ITEM)[number];
export const FONTE_ITEM_NM: Record<FonteItem | "parser", string> = { estimativa: "estimativa do Chat", rotulo: "rótulo", parser: "base do app" };
/** Tetos de forma (não é o teto de sanidade da #80): o que passa disso é erro de digitação ou ataque. */
export const LIMITE_ITEM = { nome: 80, quantidade: 40, kcal: 5000, prot: 400, g: 5000, itens: 30 } as const;
/** Lançar ou corrigir comida: de até 30 dias atrás até hoje (#81). */
export const DIAS_PARA_TRAS = 30;

/** Item que a IA manda (nome, quantidade, kcal, proteína e fonte). `refeicao`/`data` só no registrar. */
export interface ItemInformado { nome: string; quantidade?: string | null; g?: number | null; kcal: number; proteina: number; fonte: FonteItem; refeicao?: Meal | null; data?: string | null }
/** Item como fica em `food_log.items` (o par texto original → itens finais que a #80 lê para aprender). */
export interface ItemGravado { nome: string; qtd: string | null; g: number | null; kcal: number; prot: number; fonte: FonteItem | "parser"; key?: string | null }
/** Item da prévia com a origem do valor (o parser não preenche: é "parser"). */
export type ItemPreviaInformado = ItemPrevia & { fonte?: FonteItem; quantidade?: string | null };

const r1 = (n: number) => Math.round(n * 10) / 10;
const limpa = (s: unknown, max: number) => String(s ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const addDays = (iso: string, n: number) => new Date(Date.parse(iso + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const pior = (a: Confianca, b: Confianca): Confianca => (a === "baixa" || b === "baixa" ? "baixa" : a === "media" || b === "media" ? "media" : "alta");

/** Soma dos itens: o total de um registro é sempre isto (kcal inteira, proteína com 1 casa). */
export const somarItens = (itens: readonly { kcal: number; prot: number }[]) => ({ kcal: Math.round(itens.reduce((s, i) => s + i.kcal, 0)), prot: r1(itens.reduce((s, i) => s + i.prot, 0)) });

/** Valida e limpa um item vindo da IA. Recusa kcal/proteína negativa, absurda ou não numérica e fonte desconhecida. */
export function validarItem(x: ItemInformado): { ok: true; item: ItemInformado } | { ok: false; erro: string } {
  const nome = limpa(x?.nome, LIMITE_ITEM.nome);
  if (!nome) return { ok: false, erro: "nome do item vazio" };
  const n = (v: unknown, max: number) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max;
  if (!n(x.kcal, LIMITE_ITEM.kcal)) return { ok: false, erro: `kcal de "${nome}": de 0 a ${LIMITE_ITEM.kcal}` };
  if (!n(x.proteina, LIMITE_ITEM.prot)) return { ok: false, erro: `proteína de "${nome}": de 0 a ${LIMITE_ITEM.prot} g` };
  if (x.g != null && !n(x.g, LIMITE_ITEM.g)) return { ok: false, erro: `g de "${nome}": de 0 a ${LIMITE_ITEM.g}` };
  if (!(FONTES_ITEM as readonly string[]).includes(x.fonte)) return { ok: false, erro: `fonte de "${nome}": ${FONTES_ITEM.join(" ou ")}` };
  const quantidade = limpa(x.quantidade, LIMITE_ITEM.quantidade) || null;
  return { ok: true, item: { ...x, nome, quantidade, g: x.g == null ? null : Math.round(x.g), kcal: Math.round(x.kcal), proteina: r1(x.proteina) } };
}

/** Rótulo curto de um item: "Pão francês (2 un)". */
export const rotuloItem = (i: Pick<ItemGravado, "nome" | "qtd">) => (i.qtd ? `${i.nome} (${i.qtd})` : i.nome);

export const itemGravadoDeInformado = (x: ItemInformado): ItemGravado => ({ nome: x.nome, qtd: x.quantidade ?? (x.g ? `${x.g} g` : null), g: x.g ?? null, kcal: x.kcal, prot: x.proteina, fonte: x.fonte });
export const itemGravadoDePrevia = (x: ItemPreviaInformado): ItemGravado => ({
  nome: x.nome, qtd: x.quantidade ?? (x.g ? `${x.g} g` : null), g: x.g, kcal: x.kcal, prot: x.prot, fonte: x.fonte ?? "parser", key: x.key,
});

/** Lê `food_log.items` (formato novo ou o antigo `{key,g,kcal,prot}` do #81). JSON inválido ou fora de forma → null. */
export function lerItensGravados(json: string | null | undefined): ItemGravado[] | null {
  if (!json) return null;
  let v: unknown;
  try { v = JSON.parse(json); } catch { return null; }
  if (!Array.isArray(v)) return null;
  return v.slice(0, LIMITE_ITEM.itens).flatMap((o): ItemGravado[] => {
    if (!o || typeof o !== "object") return [];
    const x = o as Record<string, unknown>;
    const key = typeof x.key === "string" ? x.key : null;
    const g = typeof x.g === "number" && Number.isFinite(x.g) ? x.g : null;
    const nome = limpa(x.nome, LIMITE_ITEM.nome) || (key && ALIMENTO_BY_KEY[key]?.nome) || key || "item";
    const fonte = (FONTES_ITEM as readonly string[]).includes(x.fonte as string) ? (x.fonte as FonteItem) : "parser";
    return [{ nome, qtd: limpa(x.qtd, LIMITE_ITEM.quantidade) || (g ? `${Math.round(g)} g` : null), g, kcal: Number(x.kcal) || 0, prot: Number(x.prot) || 0, fonte, key }];
  });
}

const palavras = (s: string) => normTexto(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 4);
/** A dúvida/suposição fala do mesmo alimento? (uma palavra de 4+ letras em comum entre o trecho entre aspas e o nome) */
const falaDe = (frase: string, nome: string) => {
  const q = /"([^"]+)"/.exec(frase)?.[1];
  if (!q) return false;
  const ws = new Set(palavras(nome));
  return palavras(q).some((w) => ws.has(w));
};

/** Junta os itens informados pela IA à prévia: mesmo nome substitui o item do parser (override); senão vira item novo.
 *  Refeição e total são recalculados como soma dos itens; a dúvida "não reconheci X" sobre o mesmo alimento some. */
export function aplicarItensInformados(i: InterpretacaoComida, extras: readonly ItemInformado[]): InterpretacaoComida {
  if (!extras.length) return i;
  const refeicoes: RefeicaoPrevia[] = i.refeicoes.map((r) => ({ ...r, itens: [...r.itens] }));
  const suposicoes = [...i.suposicoes];
  let duvidas = [...i.duvidas];
  for (const x of extras) {
    const alvo = x.refeicao ?? refeicoes[0]?.refeicao ?? "almoco";
    let r = refeicoes.find((y) => y.refeicao === alvo);
    if (!r) { r = { refeicao: alvo, hora: HORA_REFEICAO[alvo], texto: x.nome, itens: [], kcal: 0, prot: 0, confianca: "media" }; refeicoes.push(r); }
    const novo: ItemPreviaInformado = {
      nome: x.nome, texto: x.quantidade ? `${x.nome} (${x.quantidade})` : x.nome, key: null, g: x.g ?? null, faixa: null,
      kcal: x.kcal, prot: x.proteina, confianca: "media", fonte: x.fonte, quantidade: x.quantidade ?? null,
    };
    const k = r.itens.findIndex((y) => normTexto(y.nome) === normTexto(x.nome) || normTexto(y.texto) === normTexto(x.nome));
    if (k >= 0) r.itens[k] = { ...novo, key: r.itens[k].key }; else r.itens.push(novo);
    duvidas = duvidas.filter((d) => !falaDe(d, x.nome));
    for (let j = suposicoes.length - 1; j >= 0; j--) if (falaDe(suposicoes[j], x.nome) && /não reconheci/.test(suposicoes[j])) suposicoes.splice(j, 1);
    suposicoes.push(`"${x.nome}": valores do ${FONTE_ITEM_NM[x.fonte]}`);
  }
  for (const r of refeicoes) {
    const t = somarItens(r.itens);
    r.kcal = t.kcal; r.prot = t.prot;
    r.confianca = r.itens.length ? r.itens.reduce((c, y) => pior(c, y.confianca), "alta" as Confianca) : "baixa";
  }
  refeicoes.sort((a, b) => MEALS.indexOf(a.refeicao) - MEALS.indexOf(b.refeicao));
  const conf = refeicoes.reduce((c, r) => pior(c, r.confianca), "alta" as Confianca);
  return {
    ...i, refeicoes, total: somarItens(refeicoes.map((r) => ({ kcal: r.kcal, prot: r.prot }))),
    suposicoes: [...new Set(suposicoes)].slice(0, 10), duvidas, confianca: duvidas.length ? pior(conf, "media") : conf,
  };
}

// ---------- editar um registro inteiro ----------
const VAGO = /\b(nao lembro|nao lembra|nao sei|sei la|qualquer coisa|alguma coisa|nao me lembro|esqueci)\b|^\(?estimativa\)?$/;
/** Descrição que não diz o que foi ("Não lembro (estimativa)", "sei lá"). */
export const ehTextoVago = (t: string) => { const n = normTexto(t); return n.length < 2 || VAGO.test(n); };

/** Por que um registro é vago (para corrigir em lote), ou null. Registro do app sem itens gravados NÃO é vago. */
export function ehRegistroVago(r: { texto: string; itens: readonly unknown[] | null; confianca: string | null; kcal: number | null }): string | null {
  if (ehTextoVago(r.texto)) return "não lembra o que comeu";
  if (r.confianca === "baixa" || r.confianca === "estimativa") return "confiança baixa";
  if ((r.itens && r.itens.length === 0) || r.kcal == null) return "sem itens reconhecidos";
  return null;
}

export interface DiffItem { tipo: "igual" | "mudou" | "novo" | "saiu"; antes?: string; depois?: string; mudou?: ("nome" | "quantidade" | "kcal" | "proteina")[] }
/** Antes → depois por item. Mesmo nome casa primeiro; os que sobram casam na ordem (é um renomear: "néctar" → "integral"). */
export function diffItens(antes: readonly ItemGravado[], depois: readonly ItemGravado[]): DiffItem[] {
  const livres = antes.map((_, k) => k);
  const par = depois.map((d) => { const k = livres.findIndex((j) => normTexto(antes[j].nome) === normTexto(d.nome)); return k >= 0 ? livres.splice(k, 1)[0] : -1; });
  // renomear: o que sobra casa primeiro com quem divide uma palavra ("néctar de uva" → "suco de uva"), depois na ordem
  const ws = (s: string) => new Set(normTexto(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !["com", "sem", "para"].includes(w)));
  depois.forEach((d, n) => {
    if (par[n] >= 0) return;
    const wd = ws(d.nome), k = livres.findIndex((j) => [...ws(antes[j].nome)].some((w) => wd.has(w)));
    if (k >= 0) par[n] = livres.splice(k, 1)[0];
  });
  depois.forEach((_, n) => { if (par[n] < 0 && livres.length) par[n] = livres.shift()!; });
  const out: DiffItem[] = depois.map((d, n) => {
    if (par[n] < 0) return { tipo: "novo", depois: rotuloItem(d) };
    const a = antes[par[n]];
    const mudou: NonNullable<DiffItem["mudou"]> = [];
    if (normTexto(a.nome) !== normTexto(d.nome)) mudou.push("nome");
    if ((a.qtd ?? "") !== (d.qtd ?? "") || (a.g ?? null) !== (d.g ?? null)) mudou.push("quantidade");
    if (Math.round(a.kcal) !== Math.round(d.kcal)) mudou.push("kcal");
    if (r1(a.prot) !== r1(d.prot)) mudou.push("proteina");
    return mudou.length ? { tipo: "mudou", antes: rotuloItem(a), depois: rotuloItem(d), mudou } : { tipo: "igual", antes: rotuloItem(a), depois: rotuloItem(d) };
  });
  return out.concat(livres.map((k) => ({ tipo: "saiu" as const, antes: rotuloItem(antes[k]) })));
}

export interface RegistroAtual { id: string; texto: string; itens: ItemGravado[] | null; kcal: number | null; prot: number | null; manual: boolean }
export interface EdicaoPedida { descricao?: string | null; itens: readonly ItemInformado[] }
export interface LadoEdicao { descricao: string; itens: ItemGravado[]; kcal: number | null; prot: number | null }
/** Planeja a edição inteira de um registro (data e refeição ficam). Total = soma dos itens; descrição vaga é recusada;
 *  editado à mão pela pessoa só com `forcar` (pedido explícito dela). Sem descrição, ela sai dos itens. */
export function planejarEdicao(reg: RegistroAtual, e: EdicaoPedida, forcar = false):
  { ok: true; antes: LadoEdicao; depois: LadoEdicao & { kcal: number; prot: number }; itens: DiffItem[] } | { ok: false; motivo: "manual" | "vago" | "sem_itens" | "item_invalido"; erro?: string } {
  if (reg.manual && !forcar) return { ok: false, motivo: "manual" };
  if (!e.itens.length) return { ok: false, motivo: "sem_itens" };
  const itens: ItemGravado[] = [];
  for (const x of e.itens.slice(0, LIMITE_ITEM.itens)) {
    const v = validarItem(x);
    if (!v.ok) return { ok: false, motivo: "item_invalido", erro: v.erro };
    itens.push(itemGravadoDeInformado(v.item));
  }
  const descricao = limpa(e.descricao, 2000) || itens.map(rotuloItem).join(", ").slice(0, 2000);
  if (ehTextoVago(descricao)) return { ok: false, motivo: "vago" };
  const t = somarItens(itens);
  const antesItens = reg.itens ?? [];
  return {
    ok: true,
    antes: { descricao: reg.texto, itens: antesItens, kcal: reg.kcal, prot: reg.prot },
    depois: { descricao, itens, kcal: t.kcal, prot: t.prot },
    itens: diffItens(antesItens, itens),
  };
}

// ---------- vários dias numa frase ----------
export const dentroDoLimite = (data: string, hoje: string, dias = DIAS_PARA_TRAS) => data <= hoje && data >= addDays(hoje, -dias);

// montado na 1ª chamada (nada roda ao importar: o core entra no bundle inicial do app e precisa sumir no tree-shaking)
const dowRes = (): [number, string, RegExp][] => [
  [6, "sábado", /(?<![a-z])sabado(?![a-z])/g], [0, "domingo", /(?<![a-z])domingo(?![a-z])/g],
  // segunda…sexta só com "-feira" ou depois de "na"/início/pontuação ("a segunda vez" não é dia)
  ...([[1, "segunda", "segunda"], [2, "terça", "terca"], [3, "quarta", "quarta"], [4, "quinta", "quinta"], [5, "sexta", "sexta"]] as const).map(([n, nm, t]): [number, string, RegExp] =>
    [n, `${nm}-feira`, new RegExp(`(?:(?<=(?:^|[,;.:\\n]\\s*|\\bna\\s))${t}(?![a-z])(?:[ -]feira)?|(?<![a-z])${t}[ -]feira)`, "g")]),
];
const dowDe = (iso: string) => new Date(iso + "T12:00:00Z").getUTCDay();
/** O último dia da semana `dow` até hoje (hoje conta). */
const ultimo = (dow: number, hoje: string) => addDays(hoje, -((dowDe(hoje) - dow + 7) % 7));
const valida = (iso: string) => { const d = new Date(iso + "T12:00:00Z"); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso; };

export interface DiaTexto { data: string; rotulo: string; texto: string }
/** Separa o texto por dia. `marcado` = achou alguma palavra de dia; sem nenhuma, um dia só (hoje) com o texto inteiro. */
export function separarDias(texto: string, hoje: string): { dias: DiaTexto[]; marcado: boolean; suposicoes: string[]; duvidas: string[] } {
  const orig = [...String(texto ?? "").slice(0, 4000)];
  const n = orig.map((c) => (c.length > 1 ? " " : c.normalize("NFD")[0].toLowerCase())).join("");
  const marcas: { ini: number; fim: number; data: string; rotulo: string; fds?: boolean }[] = [];
  const add = (m: RegExpMatchArray, data: string | null, rotulo: string, fds = false) => { if (data) marcas.push({ ini: m.index!, fim: m.index! + m[0].length, data, rotulo, fds }); };
  for (const m of n.matchAll(/(?<![a-z])anteontem(?![a-z])/g)) add(m, addDays(hoje, -2), "anteontem");
  for (const m of n.matchAll(/(?<![a-z])ontem(?![a-z])/g)) add(m, addDays(hoje, -1), "ontem");
  for (const m of n.matchAll(/(?<![a-z])hoje(?![a-z])/g)) add(m, hoje, "hoje");
  for (const [dow, nm, re] of dowRes()) for (const m of n.matchAll(re)) add(m, ultimo(dow, hoje), nm);
  for (const m of n.matchAll(/(?<![a-z])(?:fim|final) de semana(?![a-z])|(?<![a-z])fds(?![a-z])/g)) add(m, dowDe(hoje) === 0 ? addDays(hoje, -1) : ultimo(6, hoje), "fim de semana", true);
  for (const m of n.matchAll(/(?<![a-z])dia (\d{1,2})(?![0-9])/g)) {
    const dd = Number(m[1]), [y, mo] = hoje.split("-").map(Number);
    let iso = `${y}-${String(mo).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
    if (dd > Number(hoje.slice(8))) { const p = new Date(Date.UTC(y, mo - 2, 1)); iso = `${p.getUTCFullYear()}-${String(p.getUTCMonth() + 1).padStart(2, "0")}-${String(dd).padStart(2, "0")}`; }
    add(m, dd >= 1 && valida(iso) ? iso : null, `dia ${dd}`);
  }
  // "anteontem" contém "ontem": tira as marcas dentro de outra
  marcas.sort((a, b) => a.ini - b.ini || b.fim - a.fim);
  const ms = marcas.filter((m, k) => !marcas.some((o, j) => j !== k && o.ini <= m.ini && o.fim >= m.fim && (o.fim - o.ini) > (m.fim - m.ini)));
  if (!ms.length) return { dias: [{ data: hoje, rotulo: "hoje", texto: String(texto ?? "").trim() }], marcado: false, suposicoes: [], duvidas: [] };
  const corta = (a: number, b: number) => orig.slice(a, b).join("").replace(/^[\s,;.:\-–]+/, "").replace(/(?:[\s,;.:]+|\s+(?:e|no|na|em|de))+$/i, "").trim();
  const porData = new Map<string, DiaTexto & { fds: boolean }>();
  ms.forEach((m, k) => {
    const t = corta(m.fim, ms[k + 1]?.ini ?? orig.length);
    const antes = k === 0 ? corta(0, m.ini).replace(/^(?:no|na|em)$/i, "") : "";
    const txt = [antes, t].filter(Boolean).join(", ");
    if (!txt || !/[a-z]/i.test(normTexto(txt))) return;
    const cur = porData.get(m.data);
    if (cur) { cur.texto = `${cur.texto}, ${txt}`; cur.fds &&= !!m.fds; } else porData.set(m.data, { data: m.data, rotulo: m.rotulo, texto: txt, fds: !!m.fds });
  });
  const dias = [...porData.values()].sort((a, b) => (a.data < b.data ? -1 : 1));
  const suposicoes: string[] = [], duvidas: string[] = [];
  for (const d of dias) {
    if (d.fds) { duvidas.push(`"fim de semana": foi no sábado ou no domingo? Considerei sábado (${d.data}).`); }
    else if (d.rotulo !== "hoje") suposicoes.push(`"${d.rotulo}" = ${d.data}`);
  }
  return { dias: dias.map(({ data, rotulo, texto: t }) => ({ data, rotulo, texto: t })), marcado: true, suposicoes, duvidas };
}
