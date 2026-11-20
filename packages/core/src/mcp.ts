// #81 MCP formal: o JSON Schema de entrada de cada ferramenta é a ÚNICA fonte de validação no servidor (este validador
// cobre o subconjunto que os schemas usam), paginação e o orçamento de tamanho das respostas. Puro, sem dependências.
import { EQUIPMENT_BY_ID, EXERCISE_BY_ID } from "./catalog.ts";
import { divisoesDe, ehLivre } from "./treino-atual.ts";
import type { ItemTreinoAtual } from "./treino-atual.ts";

/** Versão do contrato (docs/12-mcp.md). Muda quando uma ferramenta muda de forma incompatível ou entra/sai. */
export const MCP_CONTRATO = "1.3.0";
/** Teto de bytes de uma resposta de ferramenta: nada de catálogo inteiro; o resto pagina. */
export const MCP_ORCAMENTO_BYTES = 16_000;
/** Teto do tools/list inteiro (todas as descrições e schemas) e das `instructions` do initialize. */
export const MCP_ORCAMENTO_LISTA = 48_000, MCP_ORCAMENTO_INSTRUCOES = 6_000;

export type Schema = {
  type?: "object" | "string" | "integer" | "number" | "boolean" | "array";
  properties?: Record<string, Schema>; required?: string[]; additionalProperties?: boolean;
  items?: Schema; minItems?: number; maxItems?: number;
  enum?: readonly unknown[]; minLength?: number; maxLength?: number; pattern?: string;
  minimum?: number; maximum?: number; description?: string;
};

const tipoDe = (v: unknown) => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v);
const lista = (xs: readonly unknown[]) => xs.map(String).join("|");

/** Valida `v` contra o schema. Devolve as mensagens (pt-BR, com o caminho do campo); vazio = válido. Para no 5º erro. */
export function validarSchema(s: Schema, v: unknown, caminho = "", erros: string[] = []): string[] {
  if (erros.length >= 5) return erros;
  const nome = caminho || "entrada";
  const t = tipoDe(v);
  switch (s.type) {
    case "object": {
      if (t !== "object") { erros.push(`${nome}: deve ser um objeto`); return erros; }
      const o = v as Record<string, unknown>;
      for (const r of s.required ?? []) if (o[r] === undefined || o[r] === null) erros.push(`${caminho ? caminho + "." : ""}${r}: obrigatório`);
      for (const [k, x] of Object.entries(o)) {
        const p = s.properties?.[k];
        const cam = caminho ? `${caminho}.${k}` : k;
        if (!p) { if (s.additionalProperties === false) erros.push(`${cam}: campo desconhecido`); continue; }
        if (x === undefined || x === null) continue; // opcional ausente
        validarSchema(p, x, cam, erros);
      }
      return erros;
    }
    case "array": {
      if (t !== "array") { erros.push(`${nome}: deve ser uma lista`); return erros; }
      const a = v as unknown[];
      if (s.minItems != null && a.length < s.minItems) erros.push(`${nome}: no mínimo ${s.minItems} item(ns)`);
      if (s.maxItems != null && a.length > s.maxItems) erros.push(`${nome}: no máximo ${s.maxItems} itens`);
      if (s.items) a.forEach((x, i) => validarSchema(s.items!, x, `${nome}[${i}]`, erros));
      return erros;
    }
    case "string": {
      if (t !== "string") { erros.push(`${nome}: deve ser texto`); return erros; }
      const x = v as string;
      if (s.minLength != null && x.length < s.minLength) erros.push(`${nome}: no mínimo ${s.minLength} caracteres`);
      if (s.maxLength != null && x.length > s.maxLength) erros.push(`${nome}: no máximo ${s.maxLength} caracteres`);
      if (s.pattern && !new RegExp(s.pattern).test(x)) erros.push(`${nome}: formato inválido${s.description ? ` (${s.description})` : ""}`);
      break;
    }
    case "integer": case "number": {
      if (t !== "number" || !Number.isFinite(v as number) || (s.type === "integer" && !Number.isInteger(v))) { erros.push(`${nome}: deve ser ${s.type === "integer" ? "inteiro" : "número"}`); return erros; }
      const x = v as number;
      if ((s.minimum != null && x < s.minimum) || (s.maximum != null && x > s.maximum)) erros.push(`${nome}: fora de ${s.minimum ?? "-∞"}..${s.maximum ?? "∞"}`);
      break;
    }
    case "boolean":
      if (t !== "boolean") erros.push(`${nome}: deve ser true ou false`);
      break;
  }
  if (s.enum && !s.enum.includes(v)) erros.push(`${nome}: deve ser ${lista(s.enum)}`);
  return erros;
}

/** Fatia de uma lista: `cursor` é o deslocamento (número em texto) devolvido na página anterior. */
export function paginar<T>(xs: readonly T[], cursor: unknown, limite: number): { itens: T[]; total: number; proximo: string | null } {
  const ini = typeof cursor === "string" && /^\d{1,6}$/.test(cursor) ? Number(cursor) : 0;
  const itens = xs.slice(ini, ini + limite);
  return { itens, total: xs.length, proximo: ini + limite < xs.length ? String(ini + limite) : null };
}

/** Bytes UTF-8 do JSON de uma resposta (o que conta no orçamento). */
export const tamanhoJson = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).length;

// ---- #95 o MCP lê o "Meu treino atual" e as academias ----

const umaLinha = (s: unknown, max: number) => String(s ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
/** Exercícios por divisão no resumo do ciclo_estado (o completo vem do ciclo_treino_atual). */
export const TREINO_ATUAL_RESUMO_MAX = 12;
export type DivisaoResumo = { nome: string; grupos: string[]; ex: string[]; mais?: number };
const itemCompacto = (x: ItemTreinoAtual): string => {
  if (ehLivre(x)) return `livre: ${umaLinha(x.nome, 40)} (${x.grupo})`;
  const sr = x.sets && x.reps ? ` ${x.sets}×${x.reps}` : x.sets ? ` ${x.sets} séries` : x.reps ? ` ${x.reps} reps` : "";
  return `${x.id}${sr}${typeof x.kg === "number" && x.kg > 0 ? ` ${x.kg}kg` : ""}`;
};
/**
 * Resumo compacto do treino atual para o ciclo_estado: `null` = não informado; `[]` = "estou começando"; senão as divisões
 * com "id séries×reps kg" ou "livre: nome (grupo)". `treinoAtualPor` diz quem preencheu o perfil por último (você | Chat).
 * Nomes de divisão e de exercício livre são texto do usuário (dado, não instrução), validados curtos e sem < >.
 */
export function resumoTreinoAtual(perfil: Record<string, any> | null | undefined, max = TREINO_ATUAL_RESUMO_MAX):
  { treinoAtual: null; treinoAtualPor?: undefined } | { treinoAtual: DivisaoResumo[]; treinoAtualPor: "você" | "Chat" } {
  const t = perfil?.treinoAtual;
  if (!t || typeof t !== "object" || !Array.isArray((t as { divisoes?: unknown }).divisoes)) return { treinoAtual: null };
  const treinoAtual = divisoesDe(t).map((d) => {
    const xs = (Array.isArray(d.exercicios) ? d.exercicios : []).filter((x) => x && typeof x === "object");
    const r: DivisaoResumo = { nome: umaLinha(d.nome, 30), grupos: Array.isArray(d.grupos) ? d.grupos.slice(0, 7) : [], ex: xs.slice(0, max).map(itemCompacto) };
    if (xs.length > max) r.mais = xs.length - max;
    return r;
  });
  return { treinoAtual, treinoAtualPor: perfil?.meta?.filledBy === "claude" ? "Chat" : "você" };
}

export interface AcademiaMcp { id: string; nome: string; aparelhos: string[] }
/** Academias da conta para o MCP: id, nome numa linha (texto do usuário: dado) e só os aparelhos que existem no catálogo. */
export const academiasMcp = (gyms: readonly { id: string; name: string; equipment: readonly string[] }[]): AcademiaMcp[] =>
  gyms.map((g) => ({ id: g.id, nome: umaLinha(g.name, 60), aparelhos: g.equipment.filter((q) => EQUIPMENT_BY_ID[q]) }));

const DOW = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
/** A academia do dia: a do treino salvo para a data, senão a do dia da semana no perfil, senão a primeira (null = nenhuma). */
export function academiaDoDia(gyms: readonly { id: string }[], o: { date: string; planoGymId?: string | null; dayGym?: Record<string, string> | null }): string | null {
  const existe = (id: unknown): id is string => typeof id === "string" && gyms.some((g) => g.id === id);
  const dow = DOW[new Date(o.date + "T12:00:00Z").getUTCDay()];
  if (existe(o.planoGymId)) return o.planoGymId;
  if (existe(o.dayGym?.[dow])) return o.dayGym![dow];
  return gyms[0]?.id ?? null;
}

/** Exercícios (IDs do catálogo) que pedem aparelho que a academia não tem. ID fora do catálogo fica para o hydrate. */
export function aparelhosFaltando(ids: readonly string[], aparelhos: readonly string[]): { id: string; nm: string; faltam: string[] }[] {
  const tem = new Set(aparelhos);
  const out: { id: string; nm: string; faltam: string[] }[] = [];
  for (const id of new Set(ids)) {
    const e = EXERCISE_BY_ID[id];
    if (!e) continue;
    const faltam = e.eq.filter((q) => !tem.has(q));
    if (faltam.length) out.push({ id, nm: e.nm, faltam });
  }
  return out;
}
