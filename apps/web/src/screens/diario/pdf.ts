// Leitura do PDF do exame NO APARELHO (ADR-0009): pdf.js só é baixado quando a pessoa escolhe um PDF na tela de exames
// (import dinâmico → chunk próprio). Nada vai para terceiros; o arquivo não sai do aparelho, só o texto extraído.
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = workerUrl; // mesma origem (CSP worker-src 'self')

const MAX_PAGES = 40;

/** Texto do PDF (até 40 páginas e `maxChars`). Sem fontes, sem WebAssembly e sem rede: só a camada de texto. */
export async function pdfText(file: File, maxChars: number): Promise<{ text: string; pages: number; truncated: boolean }> {
  const data = new Uint8Array(await file.arrayBuffer());
  const task = getDocument({ data, disableFontFace: true, useSystemFonts: false, useWasm: false, enableXfa: false, isOffscreenCanvasSupported: false, stopAtErrors: false });
  const doc = await task.promise;
  try {
    const out: string[] = [];
    let len = 0, truncated = doc.numPages > MAX_PAGES;
    for (let n = 1; n <= Math.min(doc.numPages, MAX_PAGES); n++) {
      const page = await doc.getPage(n);
      const tc = await page.getTextContent();
      const line = tc.items.map((it) => ("str" in it ? it.str + (it.hasEOL ? "\n" : " ") : "")).join("").replace(/[ \t]+/g, " ").trim();
      if (len + line.length > maxChars) { out.push(line.slice(0, maxChars - len)); truncated = true; break; }
      out.push(line); len += line.length + 2;
    }
    return { text: out.join("\n\n").trim(), pages: doc.numPages, truncated };
  } finally { await task.destroy(); } // encerra o worker do pdf.js
}
