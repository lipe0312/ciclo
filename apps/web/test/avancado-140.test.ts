// #140 Perfil → Sua IA → Avançado renderizado de verdade (Preact + DOM mínimo, demo): um bloco por tipo de pedido, o esforço
// grava no perfil por tipo (e "Padrão" apaga), e nada de nome de marca ou de modelo na tela. Dados fictícios.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { No, instalarNavegador, texto } from "./mini-dom.ts";

const WEB = join(import.meta.dirname, "..");
const nav = instalarNavegador("#perfil/ia");
nav.loc.search = "?demo";
(globalThis as any).window = globalThis;

let M: any;
before(async () => {
  const dir = mkdtempSync(join(tmpdir(), "ciclo-av-"));
  const out = join(dir, "av.mjs");
  await build({
    stdin: {
      contents: `export { default as Avancado } from "./src/screens/perfil/avancado.tsx";
        export { S } from "./src/lib/store/index.ts";
        export { h, render } from "preact";`,
      resolveDir: WEB, loader: "ts",
    },
    bundle: true, format: "esm", platform: "neutral", mainFields: ["module", "main"], outfile: out, write: true, logLevel: "silent",
    jsx: "automatic", jsxImportSource: "preact", loader: { ".css": "empty" },
  });
  M = await import(pathToFileURL(out).href);
  rmSync(dir, { recursive: true, force: true });
});
let raiz: No;
after(() => { if (raiz) M.render(null, raiz); });
const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));

test("Avançado: 4 tipos de pedido; o esforço grava por tipo no perfil e Padrão apaga; sem marca nem nome de modelo", async () => {
  delete M.S.profile.iaPedidos;
  raiz = document.createElement("div") as unknown as No;
  M.render(M.h(M.Avancado, {}), raiz);
  await tick();
  const t = texto(raiz);
  for (const nm of ["Gerar a semana", "Revisar o treino", "Comida", "Pedidos da rotina"]) assert.match(t, new RegExp(nm), nm);
  assert.ok(!/\b(Claude|ChatGPT|Gemini|Haiku|Sonnet|Opus)\b/.test(t), "marca ou modelo solto: " + t.slice(0, 200));
  const grupo = (rot: string) => raiz.todos().find((e) => e.getAttribute("aria-label") === rot)!;
  const botao = (rot: string, nome: string) => grupo(rot).todos().find((e) => e.localName === "button" && texto(e) === nome)!;
  assert.ok(grupo("Esforço de Comida"), "grupo de esforço sem rótulo");
  botao("Esforço de Comida", "Alto").click(); await tick();
  assert.deepEqual(M.S.profile.iaPedidos, { comida: { esforco: "alto" } });
  botao("Esforço de Gerar a semana", "Baixo").click(); await tick();
  assert.deepEqual(Object.keys(M.S.profile.iaPedidos).sort(), ["comida", "gerar_semana"]);
  assert.equal(botao("Esforço de Comida", "Alto").getAttribute("aria-pressed"), "true");
  botao("Esforço de Comida", "Padrão").click(); await tick();
  assert.deepEqual(M.S.profile.iaPedidos, { gerar_semana: { esforco: "baixo" } });
  botao("Esforço de Gerar a semana", "Padrão").click(); await tick();
  assert.equal(M.S.profile.iaPedidos, undefined, "sem preferência não fica lixo no perfil");
});
