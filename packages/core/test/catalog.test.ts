import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { CATALOG, CARDIO, EQUIPMENT, MUSCLES, SUB_MUSCLES, imageSrc, cardioKcal, searchCatalog, INTENSITIES } from "../src/index.ts";

const IMG = new URL("../../../apps/web/public/img/ex/", import.meta.url);
const imgPath = (src: string, n: number) => new URL(`${src}${n ? `-${n}` : ""}.webp`, IMG);

test("catálogo: IDs e nomes pt-BR únicos", () => {
  assert.equal(new Set(CATALOG.map((e) => e.id)).size, CATALOG.length);
  const nms = CATALOG.map((e) => e.nm.toLowerCase());
  assert.equal(new Set(nms).size, nms.length, "nome repetido");
  for (const e of CATALOG) assert.ok(e.nm.trim().length > 2, e.id);
});

test("catálogo: toda imagem declarada existe; aparelho aponta para imagem existente", () => {
  for (const e of CATALOG) for (const n of e.images) assert.ok(existsSync(imgPath(imageSrc(e), n)), `${e.id} imagem ${n}`);
  for (const q of EQUIPMENT) assert.ok(existsSync(imgPath(q.img, 0)), `aparelho ${q.id}`);
  for (const e of CATALOG) if (e.type === "forca") assert.ok(e.images.includes(0), `${e.id} sem imagem 0`);
});

test("catálogo: músculo e subdivisões válidos (a 1ª subdivisão conta no músculo principal)", () => {
  for (const e of CATALOG) {
    if (e.type === "forca") assert.ok(MUSCLES[e.m], e.id);
    for (const s of [...(e.subMuscles ?? []), ...(e.secondary ?? [])]) assert.ok(SUB_MUSCLES[s], `${e.id} → ${s}`);
    if (e.type === "forca" && e.subMuscles?.length) assert.equal(SUB_MUSCLES[e.subMuscles[0]].muscle, e.m, e.id);
    for (const k of ["howTo", "tips", "mistakes"] as const) for (const t of e[k] ?? []) assert.ok(t.trim(), `${e.id} ${k} vazio`);
  }
});

test("cardio: unidade principal aceita, MET por intensidade e kcal estimada", () => {
  for (const c of CARDIO) {
    assert.ok(c.units.includes(c.metUnit), c.id);
    for (const i of Object.keys(INTENSITIES) as (keyof typeof INTENSITIES)[]) assert.ok(c.met[i] > 0, `${c.id} ${i}`);
  }
  const est = CARDIO.find((c) => c.id === "Running_Treadmill")!;
  assert.equal(cardioKcal(est, "zona2", 72, 30), 288);
});

test("busca: acha rosca, puxada, elevação lateral e esteira em < 50 ms (sem acento também)", () => {
  const t0 = performance.now();
  for (const q of ["rosca", "puxada", "elevação lateral", "elevacao lateral", "esteira"]) assert.ok(searchCatalog({ q }).length > 0, q);
  assert.ok(performance.now() - t0 < 50);
  assert.ok(searchCatalog({ q: "rosca", muscle: "biceps" }).every((e) => e.type === "forca" && e.m === "biceps"));
  assert.ok(searchCatalog({ type: "cardio" }).every((e) => e.type === "cardio"));
});
