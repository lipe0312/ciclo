// #66 Texto do PDF do exame (ADR-0009). Causa do bug em produção: o getTextContent() do pdf.js 6 faz
// `for await (… of readableStream)`, e o Safari (iOS e macOS) não implementa ReadableStream[Symbol.asyncIterator]
// (a build "legacy" do pdf.js não traz polyfill disso). Aqui lemos o stream pelo getReader(), que todo navegador tem.

export interface LeitorStream<T> { read(): Promise<{ done: boolean; value?: T }>; releaseLock?(): void }

/** Lê o stream inteiro (até `max` pedaços) e sempre solta o leitor. */
export async function lerTudo<T>(r: LeitorStream<T>, max = 10_000): Promise<T[]> {
  const out: T[] = [];
  try {
    while (out.length < max) {
      const { done, value } = await r.read();
      if (done) break;
      out.push(value as T);
    }
    return out;
  } finally {
    try { r.releaseLock?.(); } catch { /* já solto */ }
  }
}

/** Itens de texto do pdf.js → uma string: quebra de linha no hasEOL, espaços colapsados; marcações sem `str` ignoradas. */
export function textoDosItens(items: unknown[]): string {
  return items.map((it) => {
    const x = it as { str?: unknown; hasEOL?: unknown };
    return typeof x?.str === "string" ? x.str + (x.hasEOL ? "\n" : " ") : "";
  }).join("").replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").trim();
}
