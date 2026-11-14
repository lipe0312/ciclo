import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { defineConfig } from "vite";
import type { Plugin } from "vite";
import preact from "@preact/preset-vite";

// Build vai para apps/web/dist (o Worker serve como assets). public/ = _headers, sw.js, manifest, imagens.
// #62: o sw.js leva a versão do build (hash dos arquivos gerados) no nome do cache; assim o PWA com bundle antigo se atualiza sozinho.
const versaoSw = (): Plugin => ({
  name: "ciclo-versao-sw",
  apply: "build",
  writeBundle(opts, bundle) {
    const arq = join(opts.dir ?? "dist", "sw.js");
    const h = createHash("sha256").update(Object.keys(bundle).sort().join("|")).digest("hex").slice(0, 12);
    writeFileSync(arq, readFileSync(arq, "utf8").replace(`"ciclo-__BUILD__"`, `"ciclo-${h}"`));
  },
});
export default defineConfig({
  plugins: [preact(), versaoSw()],
  build: { outDir: "dist", emptyOutDir: true, target: "es2020", modulePreload: { polyfill: false }, assetsInlineLimit: 0 },
  server: { port: 5173, proxy: { "/api": "http://localhost:8791", "/mcp": "http://localhost:8791" } },
});
