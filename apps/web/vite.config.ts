import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import { fileURLToPath } from "node:url";

// Build vai para apps/web/dist (o Worker serve como assets). public/ = _headers, sw.js, manifest, imagens.
export default defineConfig({
  plugins: [preact()],
  // #66: autorizar.html = tela de consentimento OAuth (/autorizar), página própria fora da casca do app.
  build: { outDir: "dist", emptyOutDir: true, target: "es2020", modulePreload: { polyfill: false }, assetsInlineLimit: 0,
    rollupOptions: { input: { main: fileURLToPath(new URL("index.html", import.meta.url)), autorizar: fileURLToPath(new URL("autorizar.html", import.meta.url)) } } },
  server: { port: 5173, proxy: { "/api": "http://localhost:8791", "/auth": "http://localhost:8791", "/mcp": "http://localhost:8791", "/oauth": "http://localhost:8791", "/.well-known": "http://localhost:8791" } },
});
