import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

// Build vai para apps/web/dist (o Worker serve como assets). public/ = _headers, sw.js, manifest, imagens.
export default defineConfig({
  plugins: [preact()],
  build: { outDir: "dist", emptyOutDir: true, target: "es2020", modulePreload: { polyfill: false }, assetsInlineLimit: 0 },
  server: { port: 5173, proxy: { "/api": "http://localhost:8791", "/mcp": "http://localhost:8791" } },
});
