// #81 MCP formal: o schema de entrada é a fonte da validação (erro claro), paginação e orçamento de tamanho.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MCP_ORCAMENTO_BYTES, paginar, tamanhoJson, validarSchema } from "../src/index.ts";
import type { Schema } from "../src/index.ts";

const S: Schema = {
  type: "object", additionalProperties: false, required: ["texto"],
  properties: {
    texto: { type: "string", maxLength: 10 }, data: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "YYYY-MM-DD" },
    n: { type: "integer", minimum: 1, maximum: 3 }, modo: { type: "string", enum: ["a", "b"] }, ok: { type: "boolean" },
    itens: { type: "array", maxItems: 2, items: { type: "object", required: ["id"], properties: { id: { type: "string" } } } },
  },
};

test("validarSchema: entrada válida passa; opcionais nulos são ausentes", () => {
  assert.deepEqual(validarSchema(S, { texto: "oi", data: "2026-11-16", n: 2, modo: "a", ok: true, itens: [{ id: "x" }] }), []);
  assert.deepEqual(validarSchema(S, { texto: "oi", data: null }), []);
});

test("validarSchema: cada erro diz o campo e o porquê", () => {
  assert.deepEqual(validarSchema(S, {}), ["texto: obrigatório"]);
  assert.deepEqual(validarSchema(S, { texto: 5 }), ["texto: deve ser texto"]);
  assert.deepEqual(validarSchema(S, { texto: "x".repeat(11) }), ["texto: no máximo 10 caracteres"]);
  assert.deepEqual(validarSchema(S, { texto: "a", data: "16/11/2026" }), ["data: formato inválido (YYYY-MM-DD)"]);
  assert.deepEqual(validarSchema(S, { texto: "a", n: 1.5 }), ["n: deve ser inteiro"]);
  assert.deepEqual(validarSchema(S, { texto: "a", n: 9 }), ["n: fora de 1..3"]);
  assert.deepEqual(validarSchema(S, { texto: "a", modo: "c" }), ["modo: deve ser a|b"]);
  assert.deepEqual(validarSchema(S, { texto: "a", ok: "sim" }), ["ok: deve ser true ou false"]);
  assert.deepEqual(validarSchema(S, { texto: "a", extra: 1 }), ["extra: campo desconhecido"]);
  assert.deepEqual(validarSchema(S, { texto: "a", itens: [{}, {}, {}] }), ["itens: no máximo 2 itens", "itens[0].id: obrigatório", "itens[1].id: obrigatório", "itens[2].id: obrigatório"]);
  assert.deepEqual(validarSchema(S, []), ["entrada: deve ser um objeto"]);
  assert.ok(validarSchema(S, { texto: 1, data: 1, n: "x", modo: 1, ok: 1, itens: 1 }).length <= 6, "para cedo");
});

test("paginar: cursor é o deslocamento; última página sem próximo", () => {
  const xs = Array.from({ length: 7 }, (_, i) => i);
  assert.deepEqual(paginar(xs, undefined, 3), { itens: [0, 1, 2], total: 7, proximo: "3" });
  assert.deepEqual(paginar(xs, "6", 3), { itens: [6], total: 7, proximo: null });
  assert.deepEqual(paginar(xs, "lixo", 3).itens, [0, 1, 2]);
});

test("orçamento: conta bytes UTF-8 do JSON", () => {
  assert.equal(tamanhoJson({ a: "é" }), 10);
  assert.ok(MCP_ORCAMENTO_BYTES >= 8000 && MCP_ORCAMENTO_BYTES <= 32000);
});
