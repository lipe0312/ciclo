// #81 MCP formal: o JSON Schema de entrada de cada ferramenta é a ÚNICA fonte de validação no servidor (este validador
// cobre o subconjunto que os schemas usam), paginação e o orçamento de tamanho das respostas. Puro, sem dependências.

/** Versão do contrato (docs/12-mcp.md). Muda quando uma ferramenta muda de forma incompatível ou entra/sai. */
export const MCP_CONTRATO = "1.2.0";
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
