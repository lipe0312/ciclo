// #107 Exercício personalizado na tela, renderizado de verdade (Preact + DOM mínimo): nome e descrição com <script> viram
// texto (nenhum elemento script), selo "personalizado", vídeo só como link externo do YouTube (noopener noreferrer, sem
// iframe) e link que não é do YouTube não aparece. Dados fictícios.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { No, instalarNavegador, texto } from "./mini-dom.ts";

const WEB = join(import.meta.dirname, "..");
instalarNavegador("#treino");
(globalThis as any).fetch = async () => Response.json({ ok: true });

let M: any;
before(async () => {
  const dir = mkdtempSync(join(tmpdir(), "ciclo-107-"));
  const out = join(dir, "m.mjs");
  await build({
    stdin: {
      contents: `export { InfoPersonalizado, DetalhePersonalizado, SeloPersonalizado } from "./src/screens/treino/personalizado.tsx";
        export { S } from "./src/lib/store/index.ts";
        export { h, render } from "preact";`,
      resolveDir: WEB, loader: "ts",
    },
    bundle: true, format: "esm", platform: "neutral", mainFields: ["module", "main"], outfile: out, write: true, logLevel: "silent",
    jsx: "automatic", jsxImportSource: "preact", loader: { ".css": "empty" }, external: ["leaflet"],
  });
  M = await import(pathToFileURL(out).href);
  rmSync(dir, { recursive: true, force: true });
});

const XSS = "<script>alert(1)</script><img src=x onerror=alert(2)>";
const ID = "cus_teste000000x";
function montar(comp: unknown, props: Record<string, unknown> = {}) {
  const r = document.createElement("div") as unknown as No;
  M.render(M.h(comp, props), r);
  return r;
}
const semTagPerigosa = (r: No) => assert.ok(!r.todos().some((e) => ["script", "iframe", "img"].includes(e.localName)), "nenhum elemento vindo do texto");

test("nome e descrição com <script> aparecem como texto, escapados (card do treino e página do exercício)", () => {
  M.S.personalizados = { [ID]: { id: ID, nome: `Remada ${XSS}`, musculo: "costas", aparelho: null, descricao: `Puxa ${XSS}`, videoUrl: null, criadoPor: "ia" } };
  const card = montar(M.InfoPersonalizado, { id: ID });
  semTagPerigosa(card);
  assert.ok(texto(card).includes(`Puxa ${XSS}`), texto(card));
  const pag = montar(M.DetalhePersonalizado, { id: ID });
  semTagPerigosa(pag);
  assert.ok(texto(pag).includes(`Remada ${XSS}`));
  assert.ok(texto(pag).includes("personalizado"), "selo");
  assert.ok(pag.todos().some((e) => e.localName === "button" && texto(e) === "Apagar exercício"));
});

test("vídeo: só link externo do YouTube com noopener noreferrer; outro domínio não vira link", () => {
  M.S.personalizados = { [ID]: { id: ID, nome: "Elevação fictícia", musculo: "ombro", aparelho: "halteres", descricao: "Sobe devagar.", videoUrl: "https://youtu.be/dQw4w9WgXcQ", criadoPor: "ia" } };
  const r = montar(M.InfoPersonalizado, { id: ID });
  const a = r.todos().find((e) => e.localName === "a" && texto(e) === "Ver demonstração")!;
  assert.ok(a, texto(r));
  assert.equal(a.getAttribute("href"), "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  assert.equal(a.getAttribute("target"), "_blank");
  assert.equal(a.getAttribute("rel"), "noopener noreferrer");
  assert.ok(!r.todos().some((e) => e.localName === "iframe"));
  for (const ruim of ["javascript:alert(1)", "https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ"]) {
    M.S.personalizados[ID].videoUrl = ruim;
    const x = montar(M.InfoPersonalizado, { id: ID });
    assert.ok(!x.todos().some((e) => e.localName === "a" && texto(e) === "Ver demonstração"), ruim);
  }
});

test("apagar fica separado do Salvar e pede um 2º toque dentro do app (sem confirm do navegador)", async () => {
  let nativo = 0;
  (globalThis as any).confirm = () => { nativo++; return true; };
  const chamadas: string[] = [];
  (globalThis as any).fetch = async (path: string, init: RequestInit = {}) => { chamadas.push(`${init.method ?? "GET"} ${path}`); return Response.json({ ok: true }); };
  M.S.personalizados = { [ID]: { id: ID, nome: "Elevação fictícia", musculo: "ombro", aparelho: null, descricao: "Sobe devagar.", videoUrl: null, criadoPor: "ia" } };
  const r = montar(M.DetalhePersonalizado, { id: ID });
  const tick = () => new Promise((ok) => setTimeout(ok, 5));
  const botao = (t: string) => r.todos().find((e) => e.localName === "button" && texto(e) === t);
  const apagar = botao("Apagar exercício")!;
  assert.ok(apagar && apagar.className.split(" ").includes("danger"));
  assert.ok(!r.porClasse("pers-perigo")[0].todos().some((e) => texto(e) === "Salvar"), "Salvar fora da área de perigo");
  apagar.click(); await tick();
  assert.equal(chamadas.length, 0, "1º toque não apaga"); assert.ok(M.S.personalizados[ID]);
  assert.ok(botao("Confirmar apagar") && botao("Cancelar"));
  botao("Cancelar")!.click(); await tick();
  assert.ok(botao("Apagar exercício") && !botao("Confirmar apagar"));
  botao("Apagar exercício")!.click(); await tick();
  botao("Confirmar apagar")!.click(); await tick();
  assert.equal(nativo, 0, "nunca confirm() do navegador");
  assert.ok(!M.S.personalizados[ID], "apagado no 2º toque");
});
