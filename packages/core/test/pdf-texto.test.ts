// #66 Bug do PDF em produção: o Safari (iOS e macOS) não tem `for await` em ReadableStream, e o getTextContent()
// do pdf.js 6 usa isso. A leitura passa a usar o leitor do stream (getReader), que todo navegador tem. Tudo fictício.
import { test } from "node:test";
import assert from "node:assert/strict";
import { lerTudo, textoDosItens } from "../src/index.ts";

/** Leitor no formato do ReadableStreamDefaultReader, SEM Symbol.asyncIterator (como no Safari). */
function leitorSafari<T>(partes: T[]) {
  let i = 0, solto = false;
  return {
    read: async () => (i < partes.length ? { done: false, value: partes[i++] } : { done: true, value: undefined }),
    releaseLock: () => { solto = true; },
    get solto() { return solto; },
  };
}

test("lerTudo junta os pedaços do stream sem depender de async iterator", async () => {
  const r = leitorSafari([{ items: [{ str: "LAUDO", hasEOL: true }] }, { items: [{ str: "Vitamina D: 32", hasEOL: false }] }]);
  assert.equal((r as Record<PropertyKey, unknown>)[Symbol.asyncIterator], undefined);
  const partes = await lerTudo(r);
  assert.equal(partes.length, 2);
  assert.equal(r.solto, true, "solta o leitor no fim");
});

test("lerTudo solta o leitor mesmo quando a leitura falha", async () => {
  let solto = false;
  const r = { read: async () => { throw new Error("worker encerrado"); }, releaseLock: () => { solto = true; } };
  await assert.rejects(lerTudo(r), /worker encerrado/);
  assert.equal(solto, true);
});

test("lerTudo para no teto de pedaços (PDF malformado não trava a tela)", async () => {
  let n = 0;
  const infinito = { read: async () => ({ done: false, value: n++ }) };
  const partes = await lerTudo(infinito, 50);
  assert.equal(partes.length, 50);
});

test("textoDosItens: quebra de linha no hasEOL, espaços colapsados, marcações sem texto ignoradas", () => {
  const t = textoDosItens([{ str: "LAUDO  FICTÍCIO", hasEOL: true }, { str: "Ferritina:", hasEOL: false }, { str: "85 ng/mL", hasEOL: false }, { type: "beginMarkedContent" }]);
  assert.equal(t, "LAUDO FICTÍCIO\nFerritina: 85 ng/mL");
  assert.equal(textoDosItens([]), "");
});
