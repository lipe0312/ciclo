// #106 Registro por tempo renderizado de verdade (Preact + DOM mínimo): supino sem seletor, prancha só com o tempo (mm:ss)
// e polichinelo com o seletor Tempo | Reps começando em Tempo. Dados fictícios.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { No, instalarNavegador, texto } from "./mini-dom.ts";

const WEB = join(import.meta.dirname, "..");
instalarNavegador("#treino/ativo/0");
// o relógio do modo treino (setInterval em sessao.ts) não pode segurar o processo do teste
const si = globalThis.setInterval;
(globalThis as any).setInterval = (f: () => void, ms: number) => { const t = si(f, ms); (t as any).unref?.(); return t; };
const enviados: { path: string; body: any }[] = [];
(globalThis as any).fetch = async (path: string, init: RequestInit = {}) => {
  enviados.push({ path, body: init.body ? JSON.parse(String(init.body)) : null });
  return Response.json({ ok: true, saved: true });
};

let M: any;
before(async () => {
  const dir = mkdtempSync(join(tmpdir(), "ciclo-106-"));
  const out = join(dir, "m.mjs");
  await build({
    stdin: {
      contents: `export { SetRows } from "./src/screens/treino/timeline.tsx";
        export { toggleSet, doneSets } from "./src/screens/treino/sessao.ts";
        export { S, C } from "./src/lib/store/index.ts";
        export { h, render } from "preact";`,
      resolveDir: WEB, loader: "ts",
    },
    bundle: true, format: "esm", platform: "neutral", mainFields: ["module", "main"], outfile: out, write: true, logLevel: "silent",
    jsx: "automatic", jsxImportSource: "preact", loader: { ".css": "empty" }, external: ["leaflet"],
  });
  M = await import(pathToFileURL(out).href);
  rmSync(dir, { recursive: true, force: true });
});

const tick = () => new Promise((r) => setTimeout(r, 5));
const SUPINO = "Barbell_Bench_Press_-_Medium_Grip";
const item = (id: string) => { const e = M.C.EXERCISE_BY_ID[id]; return { exerciseId: id, nm: e.nm, muscle: e.m, kind: e.kind, sets: 2, reps: e.r, rest: 60, alts: [] }; };
function sessao() {
  M.S.past = {}; M.S.history = {};
  M.S.session = { id: "a0f1c2d3-1111-4222-8333-944455566677", date: "2026-11-16", startedAt: Date.now(), finishedAt: null,
    plan: { name: "Teste", groups: ["inf"], items: [item(SUPINO), item("Plank"), item("Star_Jump")] }, logs: {}, skipped: {}, rest: null, cur: 0 };
}
function montar(idx: number) {
  const r = document.createElement("div") as unknown as No;
  M.render(M.h(M.SetRows, { idx, it: M.S.session.plan.items[idx] }), r);
  return r;
}
const seletor = (n: No) => n.todos().find((e) => e.getAttribute("role") === "group" && e.getAttribute("aria-label") === "Registrar por");
const rotulos = (n: No) => n.todos().filter((e) => e.localName === "input").map((e) => e.getAttribute("aria-label"));

test("supino (comum): sem seletor Tempo | Reps; campos kg e reps", () => {
  sessao();
  const n = montar(0);
  assert.equal(seletor(n), undefined);
  assert.deepEqual(rotulos(n), ["kg série 1", "reps série 1", "kg série 2", "reps série 2"]);
  assert.ok(!texto(n).includes("Tempo"));
});

test("prancha (só tempo): sem seletor, um campo mm:ss por série; concluir grava segundos", async () => {
  sessao();
  const n = montar(1);
  assert.equal(seletor(n), undefined);
  assert.deepEqual(rotulos(n), ["tempo série 1 (mm:ss)", "tempo série 2 (mm:ss)"]);
  assert.match(texto(n), /tempo \(mm:ss\)/);
  M.S.session.logs.Plank[0].seg = "0:45";
  M.toggleSet(1, 0); await tick();
  const post = enviados.filter((x) => x.path.endsWith("/sets")).at(-1)!;
  assert.deepEqual({ ex: post.body.exerciseId, seg: post.body.segundos, reps: post.body.reps }, { ex: "Plank", seg: 45, reps: undefined });
  assert.deepEqual(M.doneSets("Plank"), [{ kg: 0, reps: 0, segundos: 45 }]);
});

test("polichinelo (ambos): seletor começa em Tempo; trocar para Reps mostra kg e reps e grava reps", async () => {
  sessao();
  let n = montar(2);
  const g = seletor(n)!;
  assert.ok(g, "tem o seletor");
  const [bt, br] = g.todos().filter((e) => e.localName === "button");
  assert.equal(texto(bt), "Tempo"); assert.equal(bt.getAttribute("aria-pressed"), "true");
  assert.equal(texto(br), "Reps"); assert.equal(br.getAttribute("aria-pressed"), "false");
  assert.deepEqual(rotulos(n), ["tempo série 1 (mm:ss)", "tempo série 2 (mm:ss)"]);
  M.S.session.logs.Star_Jump[0].seg = "1:00";
  M.toggleSet(2, 0); await tick();
  assert.equal(enviados.filter((x) => x.path.endsWith("/sets")).at(-1)!.body.segundos, 60);
  br.click(); await tick();
  M.S.past = { Star_Jump: [[{ kg: 0, reps: 0, segundos: 50 }, { kg: 0, reps: 0, segundos: 45 }]] };
  n = montar(2);
  const outra = n.porClasse("outra");
  assert.equal(outra.length, 1, "só a linha em reps com a última em tempo fica esmaecida");
  assert.equal(texto(outra[0]), "tempo 0:45");
  assert.match(texto(n), /mm:ss ou só os segundos/);
  assert.deepEqual(rotulos(n), ["tempo série 1 (mm:ss)", "kg série 2", "reps série 2"], "a série feita fica em tempo; a pendente vira reps");
  M.S.session.logs.Star_Jump[1].reps = "30";
  M.toggleSet(2, 1); await tick();
  const b = enviados.filter((x) => x.path.endsWith("/sets")).at(-1)!.body;
  assert.equal(b.reps, 30); assert.equal(b.segundos, undefined);
  assert.deepEqual(M.doneSets("Star_Jump"), [{ kg: 0, reps: 0, segundos: 60 }, { kg: 0, reps: 30 }]);
});
