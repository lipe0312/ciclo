// #81 Comida por conversa (MCP): texto livre → prévia por refeição (itens, gramas com faixa, kcal/proteína, suposições,
// dúvidas) → aprovação → gravação. Três jeitos: uma refeição, várias etapas no dia (sem duplicar) e o dia inteiro de uma vez.
// `interpretarComida` é a interface que a #80 (camadas regra → parser → IA de porção) vai trocar por trás; hoje usa a base
// de alimentos (#43, TACO) e a estimativa local. Puro, sem dependências. Texto do usuário é dado: nada aqui o executa.
import { MEALS, MEAL_NM, guessMeal } from "./comida.ts";
import type { Meal } from "./comida.ts";
import { reconhecerAlimentos, ALIMENTO_BY_KEY } from "./alimentos.ts";
import type { Alimento } from "./alimentos.ts";

export const COMIDA_APROVACAO = ["sempre", "so_duvidas", "nunca"] as const;
export type ComidaAprovacao = (typeof COMIDA_APROVACAO)[number];
export const COMIDA_APROVACAO_NM: Record<ComidaAprovacao, string> = { sempre: "Sempre", so_duvidas: "Só nas dúvidas", nunca: "Nunca" };
/** Prévia: token de uso único, preso à conta, vale 15 min. */
export const PREVIA_MS = 15 * 60_000;
export const PREVIA_TIPOS = ["comida_registrar", "comida_corrigir", "comida_desfazer", "semana_gerar"] as const;
export type PreviaTipo = (typeof PREVIA_TIPOS)[number];
/** No máximo 2 perguntas por vez (o resto vira suposição declarada). */
export const MAX_DUVIDAS = 2;
export const HORA_REFEICAO: Record<Meal, string> = { cafe: "08:00", almoco: "12:30", lanche: "16:00", jantar: "20:00", ceia: "22:30" };

export type Confianca = "alta" | "media" | "baixa";
export interface ItemPrevia { nome: string; texto: string; key: string | null; g: number | null; faixa: [number, number] | null; kcal: number; prot: number; confianca: Confianca }
export interface RefeicaoPrevia { refeicao: Meal; hora: string; texto: string; itens: ItemPrevia[]; kcal: number; prot: number; confianca: Confianca }
export interface InterpretacaoComida {
  data: string; /** "ontem", "anteontem" ou null (a data explícita sempre vem em `data`) */ dataRelativa: string | null;
  refeicoes: RefeicaoPrevia[]; total: { kcal: number; prot: number }; suposicoes: string[]; duvidas: string[]; confianca: Confianca;
}
export interface InterpretarEntrada { texto: string; hoje: string; hora: number; refeicao?: Meal | null; data?: string | null; base?: readonly Alimento[] }
/** A troca da #80 acontece aqui: qualquer interpretador que devolva a mesma forma serve. */
export type Interpretador = (e: InterpretarEntrada) => InterpretacaoComida;

const addDays = (iso: string, n: number) => new Date(Date.parse(iso + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const r1 = (n: number) => Math.round(n * 10) / 10;
/** Sem acento e minúsculo, um caractere por caractere (os índices batem com o texto original). */
const cps = (s: string) => [...s];
const normCp = (c: string) => (c.length > 1 ? " " : c.normalize("NFD")[0].toLowerCase());
export const normTexto = (s: string) => cps(String(s ?? "")).map(normCp).join("").replace(/\s+/g, " ").trim();

// palavra-chave de refeição → refeição (o texto já sem acento)
const MEAL_RES: [Meal, RegExp][] = [
  ["cafe", /(?:^|[^a-z])(cafe da manha|tomei (?:o |um )?cafe|no cafe|de manha|pela manha|desjejum|cafe\s*:)/g],
  ["almoco", /(?:^|[^a-z])(almocei|almoco|almocar)(?![a-z])/g],
  ["lanche", /(?:^|[^a-z])(lanchei|lanche|a tarde|de tarde|pela tarde)(?![a-z])/g],
  ["jantar", /(?:^|[^a-z])(jantei|janta|jantar|a noite|de noite|pela noite)(?![a-z])/g],
  ["ceia", /(?:^|[^a-z])(ceia|de madrugada)(?![a-z])/g],
];
const STOP = /\b(hoje|ontem|anteontem|eu|comi|tomei|bebi|almocei|jantei|lanchei|no|na|o|a|os|as|um|uma|de|do|da|manha|tarde|noite|madrugada|pela|cafe da manha|almoco|almocar|jantar|janta|lanche|ceia|desjejum|depois|mais|tambem|so|só)\b/g;
const SPLIT = /[,;\n+·]|\be\b|\bcom\b/;
const ZERO = /\b(cafe preto|cafezinho|cafe|agua|cha)\b/;
const POUCO = /\b(um pouco|pouco|pouquinho|meia porcao)\b/, MUITO = /\b(muito|bastante|prato cheio|cheio|dois pratos)\b/;
const PREPARO = /grelhad|assad|cozid|frit|empanad|milanesa|refogad|ensopad/;
const COM_PREPARO = new Set(["frango", "carne", "tilapia"]);

/** Datas relativas viram explícitas: "ontem à noite" → a data de ontem. A data informada vence. */
export function resolverData(texto: string, hoje: string, data?: string | null): { data: string; relativa: string | null } {
  if (data) return { data, relativa: null };
  const t = normTexto(texto);
  if (/\banteontem\b/.test(t)) return { data: addDays(hoje, -2), relativa: "anteontem" };
  if (/\bontem\b/.test(t)) return { data: addDays(hoje, -1), relativa: "ontem" };
  return { data: hoje, relativa: null };
}

/** Separa o texto do dia inteiro por refeição, na ordem em que aparecem. Sem palavra-chave: uma refeição só. */
export function separarRefeicoes(texto: string, padrao: Meal): { refeicao: Meal; texto: string }[] {
  const orig = cps(String(texto ?? "").slice(0, 4000));
  const n = orig.map(normCp).join("");
  const marcas: { pos: number; meal: Meal }[] = [];
  for (const [meal, re] of MEAL_RES) for (const m of n.matchAll(re)) marcas.push({ pos: m.index! + m[0].length - m[1].length, meal });
  marcas.sort((a, b) => a.pos - b.pos);
  const pedacos: { meal: Meal | null; ini: number; fim: number }[] = [];
  // orações separadas por pontuação; dentro de uma oração com 2+ refeições, corta no início de cada palavra-chave seguinte
  let ini = 0;
  const fimOracoes = [...n.matchAll(/[,;.\n]/g)].map((m) => m.index!).concat(n.length);
  for (const fim of fimOracoes) {
    const dentro = marcas.filter((k) => k.pos >= ini && k.pos < fim);
    if (!dentro.length) pedacos.push({ meal: null, ini, fim });
    else dentro.forEach((k, i) => pedacos.push({ meal: k.meal, ini: i === 0 ? ini : k.pos, fim: dentro[i + 1]?.pos ?? fim }));
    ini = fim + 1;
  }
  // oração sem palavra-chave fica com a refeição anterior (ou com a primeira que aparecer depois)
  let atual: Meal | null = null;
  const pendentes: typeof pedacos = [];
  const juntos = new Map<Meal, string[]>();
  const add = (meal: Meal, p: { ini: number; fim: number }) => {
    const t = orig.slice(p.ini, p.fim).join("").replace(/^[\s,;.:e]+|[\s,;.]+$/g, "").replace(/\s+e$/i, "").trim();
    if (t) juntos.set(meal, [...(juntos.get(meal) ?? []), t]);
  };
  for (const p of pedacos) {
    if (p.meal) { atual = p.meal; for (const q of pendentes.splice(0)) add(atual, q); add(atual, p); }
    else if (atual) add(atual, p);
    else pendentes.push(p);
  }
  for (const q of pendentes) add(atual ?? padrao, q);
  const out = [...juntos].map(([refeicao, ts]) => ({ refeicao, texto: ts.join(", ") }));
  return out.length ? out.sort((a, b) => MEALS.indexOf(a.refeicao) - MEALS.indexOf(b.refeicao)) : [{ refeicao: padrao, texto: String(texto ?? "").trim() }];
}

const pior = (a: Confianca, b: Confianca): Confianca => (a === "baixa" || b === "baixa" ? "baixa" : a === "media" || b === "media" ? "media" : "alta");
const fmtG = (g: number) => `${Math.round(g)} g`;

/** Interpretação de hoje: base de alimentos da pessoa (pessoal vence a comum) + estimativa local. A #80 troca por trás. */
export const interpretarComida: Interpretador = (e) => {
  const { data, relativa } = resolverData(e.texto, e.hoje, e.data);
  const padrao = e.refeicao ?? guessMeal(e.texto, e.hora);
  const suposicoes: string[] = [], candidatas: { texto: string; peso: number; senao: string }[] = [];
  if (relativa) suposicoes.push(`"${relativa}" = ${data}`);
  let zeroDito = false;
  const refeicoes = separarRefeicoes(e.texto, padrao).map(({ refeicao, texto }): RefeicaoPrevia => {
    const itens: ItemPrevia[] = [];
    let conf: Confianca = "alta";
    for (const bruto of normTexto(texto).split(SPLIT)) {
      const parte = bruto.trim(), limpa = parte.replace(STOP, " ").replace(/[^a-z0-9 ,.]/g, " ").replace(/\s+/g, " ").trim();
      if (!/[a-z]/.test(limpa)) continue;
      const rec = reconhecerAlimentos(limpa, e.base ?? []);
      if (!rec.length) {
        if (ZERO.test(limpa)) {
          const nome = /agua/.test(limpa) ? "Água" : /cha/.test(limpa) ? "Chá" : "Café";
          itens.push({ nome, texto: nome.toLowerCase(), key: null, g: null, faixa: null, kcal: 0, prot: 0, confianca: "media" });
          if (!zeroDito) { suposicoes.push("café, chá e água sem açúcar ≈ 0 kcal"); zeroDito = true; }
          continue;
        }
        conf = "baixa";
        candidatas.push({ texto: `Não reconheci "${limpa}": o que era e quanto?`, peso: 300, senao: `ignorei "${limpa}" (não reconheci)` });
        continue;
      }
      for (const p of rec) {
        const explicitoG = /\d\s*(g|gr|grs|gramas?|ml)\b/.test(parte), temQtd = explicitoG || /\d|\b(um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|meio|meia)\b/.test(parte);
        const curto = (p.key && ALIMENTO_BY_KEY[p.key]?.curto) || p.nome.toLowerCase();
        let fator = 1, c: Confianca = temQtd ? "alta" : "media";
        if (POUCO.test(parte)) { fator = 0.5; c = "media"; suposicoes.push(`"um pouco de ${curto}" ≈ metade de uma porção`); }
        else if (MUITO.test(parte)) { fator = 1.5; c = "baixa"; suposicoes.push(`"bastante ${curto}" ≈ 1,5 porção`); }
        const g = p.g ? p.g * fator : null;
        const larg = explicitoG ? 0.1 : temQtd ? 0.2 : 0.4;
        if (!temQtd && g) suposicoes.push(`considerei ${p.texto} ≈ ${fmtG(g)}`);
        if (p.key && COM_PREPARO.has(p.key) && !PREPARO.test(parte) && p.kcal * fator > 150) {
          candidatas.push({ texto: `O ${curto} era grelhado ou frito?`, peso: p.kcal * fator * 0.5, senao: `considerei o ${curto} grelhado` });
        }
        itens.push({ nome: p.nome, texto: p.texto, key: p.key, g: g && Math.round(g), faixa: g ? [Math.round(g * (1 - larg)), Math.round(g * (1 + larg * 1.5))] : null, kcal: Math.round(p.kcal * fator), prot: r1(p.prot * fator), confianca: c });
        conf = pior(conf, c);
      }
    }
    if (!itens.length) conf = "baixa";
    return { refeicao, hora: HORA_REFEICAO[refeicao], texto, itens, kcal: Math.round(itens.reduce((s, i) => s + i.kcal, 0)), prot: r1(itens.reduce((s, i) => s + i.prot, 0)), confianca: conf };
  });
  candidatas.sort((a, b) => b.peso - a.peso);
  const duvidas = candidatas.slice(0, MAX_DUVIDAS).map((d) => d.texto);
  suposicoes.push(...candidatas.slice(MAX_DUVIDAS).map((d) => d.senao));
  const confianca = refeicoes.reduce((c, r) => pior(c, r.confianca), "alta" as Confianca);
  return {
    data, dataRelativa: relativa, refeicoes,
    total: { kcal: refeicoes.reduce((s, r) => s + r.kcal, 0), prot: r1(refeicoes.reduce((s, r) => s + r.prot, 0)) },
    suposicoes: [...new Set(suposicoes)].slice(0, 8), duvidas, confianca: duvidas.length ? pior(confianca, "media") : confianca,
  };
};

/** Uma linha por refeição, para a IA mostrar o resumo curto antes de perguntar "posso subir?". */
export function resumoRefeicao(r: RefeicaoPrevia): string {
  const itens = r.itens.map((i) => (i.g && i.faixa ? `${i.texto} ≈ ${i.g} g (${i.faixa[0]}–${i.faixa[1]})` : i.texto)).join(", ") || "nada reconhecido";
  return `${MEAL_NM[r.refeicao]} (~${r.hora}): ${itens} · ${r.kcal} kcal · ${String(r.prot).replace(".", ",")} g de proteína`;
}

// ---------- gravação: várias etapas no dia sem duplicar ----------
export interface Existente { id: string; date: string; meal: Meal | null; text: string; manual: boolean }
export const MODOS_REGISTRO = ["auto", "complementar", "substituir"] as const;
export type ModoRegistro = (typeof MODOS_REGISTRO)[number];
export interface PlanoRefeicao {
  refeicao: Meal;
  /** novo: não havia; complementar: soma ao que já existe; substituir: troca o que a IA/app estimou; escolher: perguntar;
   *  duplicado: o mesmo texto já está registrado nesta refeição (não grava de novo) */
  acao: "novo" | "complementar" | "substituir" | "escolher" | "duplicado";
  substitui: string[]; /** editados à mão pela pessoa: nunca saem nem mudam */ mantidosManuais: string[];
}

/** Decide, refeição a refeição, o que gravar. Edição manual nunca é sobrescrita (fica mesmo no "substituir"). */
export function planejarRegistro(i: Pick<InterpretacaoComida, "data" | "refeicoes">, existentes: readonly Existente[], modo: ModoRegistro): { refeicoes: PlanoRefeicao[]; precisaEscolha: boolean } {
  const refeicoes = i.refeicoes.map((r): PlanoRefeicao => {
    const ex = existentes.filter((x) => x.date === i.data && x.meal === r.refeicao);
    const manuais = ex.filter((x) => x.manual).map((x) => x.id);
    if (ex.some((x) => normTexto(x.text) === normTexto(r.texto))) return { refeicao: r.refeicao, acao: "duplicado", substitui: [], mantidosManuais: manuais };
    if (!ex.length) return { refeicao: r.refeicao, acao: "novo", substitui: [], mantidosManuais: [] };
    if (modo === "auto") return { refeicao: r.refeicao, acao: "escolher", substitui: [], mantidosManuais: manuais };
    return { refeicao: r.refeicao, acao: modo, substitui: modo === "substituir" ? ex.filter((x) => !x.manual).map((x) => x.id) : [], mantidosManuais: manuais };
  });
  return { refeicoes, precisaEscolha: refeicoes.some((r) => r.acao === "escolher") };
}

/** Pela preferência da pessoa: precisa mostrar a prévia e esperar o "sim"? Refeição já existente sempre pergunta. */
export function precisaAprovacao(pref: ComidaAprovacao, i: Pick<InterpretacaoComida, "duvidas" | "confianca">, precisaEscolha = false): boolean {
  if (precisaEscolha || pref === "sempre") return true;
  if (pref === "nunca") return false;
  return i.duvidas.length > 0 || i.confianca === "baixa";
}

/** Estado de uma prévia buscada já filtrada pela conta (de outra conta = inexistente: não revela que existe). */
export function estadoPrevia(p: { expiresAt: number; usedAt: number | null } | null, agora: number): "ok" | "inexistente" | "expirada" | "usada" {
  if (!p) return "inexistente";
  if (p.usedAt != null) return "usada";
  return p.expiresAt <= agora ? "expirada" : "ok";
}

// ---------- correção ----------
export interface Mudanca { fator?: number; kcal?: number; proteina?: number }
/** Correção numérica de um registro ("foi metade daquilo" = fator 0,5). Editado à mão: recusa, salvo pedido explícito (forcar). */
export function corrigirValores(reg: { kcal: number | null; prot: number | null; manual: boolean }, m: Mudanca, forcar = false):
  { ok: true; kcal: number; prot: number } | { ok: false; motivo: "manual" | "sem_mudanca" } {
  if (reg.manual && !forcar) return { ok: false, motivo: "manual" };
  const k0 = reg.kcal ?? 0, p0 = reg.prot ?? 0;
  if (m.fator != null) return { ok: true, kcal: Math.round(k0 * m.fator), prot: r1(p0 * m.fator) };
  if (m.kcal == null && m.proteina == null) return { ok: false, motivo: "sem_mudanca" };
  return { ok: true, kcal: Math.round(m.kcal ?? k0), prot: r1(m.proteina ?? p0) };
}
