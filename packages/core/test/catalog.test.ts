import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
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

test("catálogo: ≥ 120 exercícios de força + cardio completo, com as 2 imagens e o texto didático preenchido", () => {
  const forca = CATALOG.filter((e) => e.type === "forca");
  assert.ok(forca.length >= 120, `força ${forca.length}`);
  assert.ok(CARDIO.length >= 10);
  for (const e of CATALOG) {
    assert.deepEqual(e.images, [0, 1], `${e.id} images`);
    assert.ok(e.subMuscles?.length, `${e.id} sem subMuscles`);
    assert.ok(e.secondary, `${e.id} sem secondary`);
    for (const k of ["howTo", "tips", "mistakes"] as const) assert.ok(e[k]?.length, `${e.id} sem ${k}`);
    assert.ok((e.howTo?.length ?? 0) >= 2, `${e.id} howTo curto demais`);
    assert.ok(e.nm.trim().length > 2 && !e.nm.includes("_"), `${e.id} nome com cara de ID`);
  }
  for (const e of forca) assert.ok(e.eq.every((q) => EQUIPMENT.some((x) => x.id === q)), `${e.id} aparelho`);
});

test("catálogo: imagens somam < 2,5 MB", () => {
  const dir = fileURLToPath(IMG);
  const total = readdirSync(dir).filter((f) => f.endsWith(".webp")).reduce((s, f) => s + statSync(dir + f).size, 0);
  assert.ok(total < 2.5 * 1024 * 1024, `${total} bytes`);
});

test("busca: nomes pt-BR da academia, sem acento e por apelido", () => {
  const nm = (q: string) => searchCatalog({ q }).map((e) => e.nm);
  assert.ok(nm("rosca scott").some((n) => n.includes("Scott")));
  assert.ok(nm("puxada frontal aberta").includes("Puxada frontal aberta"));
  assert.ok(nm("triceps frances").some((n) => n.includes("francês")));
  assert.ok(nm("esteira").length >= 2);
  assert.ok(nm("elevacao lateral").length >= 5);
  assert.ok(nm("cavalinho").length >= 1 && nm("serrote").length >= 1 && nm("panturrilha").length >= 4);
});
