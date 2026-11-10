#!/usr/bin/env node
// Imagens do catálogo: baixa 0.jpg (início) e 1.jpg (fim) do free-exercise-db (Unlicense) para cada item do
// catálogo e do aparelho, converte para WebP de 360 px de largura e grava em apps/web/public/img/ex/.
//
//   node scripts/catalogo-imagens.mjs            só gera o que falta (idempotente)
//   node scripts/catalogo-imagens.mjs --force    refaz tudo
//   node scripts/catalogo-imagens.mjs --check    não baixa nada: só confere existência e tamanho total
//
// Sem dependência nova: usa `fetch` do Node e o `cwebp` (brew install webp / apt install webp) já presente no
// ambiente de desenvolvimento. O `sips` do macOS não escreve WebP, por isso não serve.
// Orçamento: total < 2,5 MB (o script falha acima disso). Qualidade 60 e `-m 6` mantêm ~8 KB por imagem.

import { execFile } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { CATALOG, EQUIPMENT, imageSrc } from "../packages/core/src/catalog.ts";

const run = promisify(execFile);
const OUT = fileURLToPath(new URL("../apps/web/public/img/ex/", import.meta.url));
const BASE = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises";
const WIDTH = 360, QUALITY = 60, BUDGET = 2.5 * 1024 * 1024, PARALLEL = 6;
const args = new Set(process.argv.slice(2));
const FORCE = args.has("--force"), CHECK = args.has("--check");

const file = (src, n) => join(OUT, `${src}${n ? `-${n}` : ""}.webp`);
const kb = (b) => `${(b / 1024).toFixed(0)} KB`;

// O que precisa existir: cada item do catálogo declara as suas imagens; o aparelho usa a imagem 0 do item `img`.
const wanted = new Map();
for (const it of CATALOG) for (const n of it.images) wanted.set(file(imageSrc(it), n), { src: imageSrc(it), n });
for (const q of EQUIPMENT) wanted.set(file(q.img, 0), { src: q.img, n: 0 });

const dirSize = () => readdirSync(OUT).filter((f) => f.endsWith(".webp")).reduce((s, f) => s + statSync(join(OUT, f)).size, 0);

async function convert(tmp, { src, n }) {
  const res = await fetch(`${BASE}/${encodeURIComponent(src)}/${n}.jpg`);
  if (!res.ok) throw new Error(`${src}/${n}.jpg → HTTP ${res.status}`);
  const jpg = join(tmp, `${src}-${n}.jpg`);
  await writeFile(jpg, Buffer.from(await res.arrayBuffer()));
  await run("cwebp", ["-quiet", "-q", String(QUALITY), "-m", "6", "-resize", String(WIDTH), "0", jpg, "-o", file(src, n)]);
}

await mkdir(OUT, { recursive: true });
const todo = [...wanted.entries()].filter(([path]) => FORCE || !existsSync(path)).map(([, w]) => w);
const failures = [];

if (!CHECK && todo.length) {
  try { await run("cwebp", ["-version"]); } catch { console.error("cwebp não encontrado (brew install webp)."); process.exit(2); }
  const tmp = await mkdtemp(join(tmpdir(), "ciclo-img-"));
  try {
    let next = 0;
    await Promise.all(Array.from({ length: PARALLEL }, async () => {
      while (next < todo.length) {
        const w = todo[next++];
        try { await convert(tmp, w); } catch (e) { failures.push(`${w.src}/${w.n}: ${e.message}`); }
      }
    }));
  } finally { await rm(tmp, { recursive: true, force: true }); }
}

const missing = [...wanted.keys()].filter((p) => !existsSync(p));
const total = dirSize();
console.log(`${wanted.size} imagens esperadas · ${todo.length - failures.length} geradas agora · ${missing.length} faltando · total ${kb(total)} (orçamento ${kb(BUDGET)})`);
for (const f of failures) console.error("falhou:", f);
for (const m of missing) console.error("falta:", m.replace(OUT, ""));
if (missing.length || failures.length) process.exit(1);
if (total >= BUDGET) { console.error("estourou o orçamento de tamanho; reduza QUALITY ou rode com --force depois de ajustar."); process.exit(1); }
