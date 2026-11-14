// #64 Orçamento de JS (iPhone no 4G): roda depois do `vite build` e falha se passar do teto.
// Inicial = o que o index.html carrega (Hoje e Treino). Rota = cada tela que baixa ao abrir. pdf.js e Leaflet
// só carregam numa ação específica (ler PDF, abrir mapa) e têm teto próprio.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const DIST = join(import.meta.dirname, "..", "apps", "web", "dist");
const KB = 1024;
const TETO = { inicial: 130 * KB, rota: 40 * KB, vendor: 180 * KB };
const VENDOR = /^(pdf|leaflet|pdf\.worker)/;

const html = readFileSync(join(DIST, "index.html"), "utf8");
const iniciais = new Set([...html.matchAll(/(?:src|href)="\/assets\/([^"]+\.js)"/g)].map((m) => m[1]));
const gz = (f) => gzipSync(readFileSync(join(DIST, "assets", f))).length;
const erros = [];
let inicial = 0;
for (const f of readdirSync(join(DIST, "assets")).filter((n) => n.endsWith(".js") || n.endsWith(".mjs"))) {
  const t = gz(f);
  if (iniciais.has(f)) { inicial += t; continue; }
  const [nome, teto] = VENDOR.test(f) ? ["vendor", TETO.vendor] : ["rota", TETO.rota];
  if (f.startsWith("pdf.worker")) continue; // worker do pdf.js roda fora da thread principal
  if (t > teto) erros.push(`${f}: ${(t / KB).toFixed(1)} KB gzip > ${teto / KB} KB (${nome})`);
}
if (inicial > TETO.inicial) erros.push(`JS inicial: ${(inicial / KB).toFixed(1)} KB gzip > ${TETO.inicial / KB} KB`);
if (erros.length) { console.error("Orçamento de JS estourado:\n" + erros.join("\n")); process.exit(1); }
console.log(`Orçamento de JS ok · inicial ${(inicial / KB).toFixed(1)} KB gzip (teto ${TETO.inicial / KB} KB)`);
