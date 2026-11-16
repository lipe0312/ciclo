import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { TEXTO } from "../src/catalog-texto.ts";
import { CATALOG, CARDIO, CARDIO_BY_ID, EQUIPMENT, EQUIPMENT_BY_ID, MUSCLES, SUB_MUSCLES, imageSrc, cardioKcal, searchCatalog, INTENSITIES } from "../src/index.ts";

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
  for (const q of EQUIPMENT) if (q.img) assert.ok(existsSync(imgPath(q.img, 0)), `aparelho ${q.id}`);
  for (const e of CATALOG) if (e.type === "forca") assert.ok(e.images.includes(0), `${e.id} sem imagem 0`);
});

test("catálogo: músculo e subdivisões válidos (a 1ª subdivisão conta no músculo principal)", () => {
  for (const e of CATALOG) {
    if (e.type === "forca") assert.ok(MUSCLES[e.m], e.id);
    for (const s of [...(e.subMuscles ?? []), ...(e.secondary ?? [])]) assert.ok(SUB_MUSCLES[s], `${e.id} → ${s}`);
    if (e.type === "forca" && e.subMuscles?.length) assert.equal(SUB_MUSCLES[e.subMuscles[0]].muscle, e.m, e.id);
    for (const k of ["howTo", "tips", "mistakes"] as const) for (const t of TEXTO[e.id]?.[k] ?? []) assert.ok(t.trim(), `${e.id} ${k} vazio`);
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
    for (const k of ["howTo", "tips", "mistakes"] as const) assert.ok(TEXTO[e.id]?.[k]?.length, `${e.id} sem ${k}`);
    assert.ok((TEXTO[e.id]?.howTo.length ?? 0) >= 2, `${e.id} howTo curto demais`);
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

// ---- #96: banco de imagens de aparelhos
const AP = new URL("../../../apps/web/public/img/ap/", import.meta.url);
const OLD_IDS = ["halteres", "barra", "ez", "banco", "rack", "scott", "kettle", "elastico", "polia", "puxador", "remada", "legpress", "hack", "smith", "extensora",
  "flexora", "flexora_sent", "peck", "supmaq", "desenv", "remmaq", "roscamaq", "tricmaq", "pant", "pantsent", "adutora", "abdutora", "cavalinho", "hiper", "abdmaq",
  "roda", "barrafixa", "paralela"];

test("aparelhos: IDs antigos continuam válidos e os novos são únicos", () => {
  for (const id of OLD_IDS) assert.ok(EQUIPMENT_BY_ID[id], `id antigo sumiu: ${id}`);
  assert.equal(new Set(EQUIPMENT.map((e) => e.id)).size, EQUIPMENT.length);
  assert.ok(EQUIPMENT.length >= 70);
});

test("aparelhos: foto existe em disco (ou cai no ícone da categoria) e nunca é foto de exercício", () => {
  for (const q of EQUIPMENT) {
    if (!q.foto) continue; // sem foto: a tela usa o ícone da categoria
    assert.ok(!q.foto.includes("/img/ex/"), `${q.id} usa foto de exercício`);
    assert.ok(q.foto.startsWith("/img/ap/") && q.foto.endsWith(".svg"), `${q.id} caminho`);
    assert.ok(existsSync(new URL(q.foto.slice("/img/ap/".length), AP)), `${q.id} sem arquivo ${q.foto}`);
  }
  for (const k of ["academia", "casa", "hotel"]) assert.ok(existsSync(new URL(`lugar-${k}.svg`, AP)), k);
});

test("aparelhos: SVGs usam currentColor, sem cor fixa nem texto, e a pasta tem manifesto e cabe em 1 MB", () => {
  const arq = readdirSync(AP).filter((f) => f.endsWith(".svg"));
  let total = 0;
  for (const f of arq) {
    const t = readFileSync(new URL(f, AP), "utf8"); total += t.length;
    assert.ok(t.includes('viewBox="0 0 160 120"') && t.includes("currentColor"), f);
    assert.ok(!/#[0-9a-fA-F]{3,8}\b|rgb\(|hsl\(|<text|<image|<script/i.test(t), `${f}: cor fixa/texto/imagem`);
    assert.ok(!/(fill|stroke)="(?!none|currentColor)/.test(t), `${f}: cor fixa`);
  }
  const man = JSON.parse(readFileSync(new URL("LICENCAS.json", AP), "utf8")) as { id: string; arquivo: string; origem: string; data: string }[];
  assert.equal(man.length, arq.length, "manifesto: uma linha por imagem");
  for (const m of man) { assert.equal(m.origem, "svg-projeto"); assert.ok(arq.includes(m.arquivo), m.arquivo); }
  for (const q of EQUIPMENT) assert.ok(man.some((m) => m.id === q.id), `manifesto sem ${q.id}`);
  assert.ok(total < 1_000_000, `pasta com ${total} bytes`);
});

test("aparelhos: grupo cardio ligado ao cardio.ts", () => {
  const cardio = EQUIPMENT.filter((e) => e.cat === "cardio");
  assert.ok(cardio.length >= 10);
  for (const e of cardio) assert.ok(e.cardio && CARDIO_BY_ID[e.cardio], `${e.id} sem modalidade`);
  for (const e of EQUIPMENT.filter((x) => x.cat !== "cardio")) assert.equal(e.cardio, undefined, e.id);
});
