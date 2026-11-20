// #125 Detalhe e folha Trocar renderizam a MESMA lista, na MESMA ordem (C.alternativas, academia do dia), e a folha
// "Fazer junto" só oferece quem pode parear. Renderização real (Preact + DOM mínimo). Dados fictícios.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { No, instalarNavegador, texto } from "./mini-dom.ts";

const WEB = join(import.meta.dirname, "..");
instalarNavegador("#treino");
(globalThis as any).fetch = async () => Response.json({ ok: true });

let M: any;
before(async () => {
  const dir = mkdtempSync(join(tmpdir(), "ciclo-125-"));
  const out = join(dir, "m.mjs");
  await build({
    stdin: {
      contents: `export { AlternativasDetalhe } from "./src/screens/treino/alternativas.tsx";
        export { Swap } from "./src/screens/treino/troca.tsx";
        export { Pares } from "./src/screens/treino/pares.tsx";
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

function montar(comp: unknown, props: Record<string, unknown> = {}) {
  const r = document.createElement("div") as unknown as No;
  M.render(M.h(comp, props), r);
  return r;
}
const nomes = (r: No) => r.todos().filter((e) => e.localName === "h3" && e.parentNode?.parentNode?.attrs.class?.split(" ").includes("alt")).map(texto);
const item = (id: string) => { const e = M.C.EXERCISE_BY_ID[id]; return { exerciseId: id, nm: e.nm, muscle: e.m, kind: e.kind, sets: 3, reps: e.r, rest: e.rest, alts: ["x"] }; };

function cenario(equipment: string[], ids: string[]) {
  M.S.gyms = [{ id: "g1", name: "Academia fictícia", equipment }];
  M.S.ui.gymId = "g1"; M.S.pains = []; M.S.session = null;
  M.S.plan = M.C.resumirDia({ ...M.C.planDay({ targets: {}, done: {}, freq: {}, priorities: [], daysLeft: 1, minutes: 60, lastGroup: null, mode: "normal", equipment }), items: ids.map(item) });
  M.S.ui.locked = true;
}

test("Detalhe e Trocar: mesma lista e mesma ordem para o mesmo exercício e a mesma academia", () => {
  for (const [id, eq] of [["Side_Lateral_Raise", ["halteres", "banco"]], ["Incline_Dumbbell_Curl", ["halteres", "banco", "polia", "ez"]]] as const) {
    cenario([...eq], [id]);
    const esperado = M.C.idsAlternativas(id, { equipment: [...eq] }).map((x: string) => M.C.EXERCISE_BY_ID[x].nm);
    const det = nomes(montar(M.AlternativasDetalhe, { id }));
    const tro = nomes(montar(M.Swap, { idx: 0 }));
    assert.deepEqual(det, esperado, id);
    assert.deepEqual(tro, esperado, id);
  }
  // o que falta aparelho fica em "Precisa de aparelho" (nunca na lista)
  cenario(["halteres", "banco"], ["Side_Lateral_Raise"]);
  const r = montar(M.AlternativasDetalhe, { id: "Side_Lateral_Raise" });
  assert.ok(texto(r).includes("Precisa de aparelho"));
  assert.ok(!nomes(r).includes(M.C.EXERCISE_BY_ID.Cable_Seated_Lateral_Raise.nm));
});

test("Fazer junto: só oferece quem pode parear e grava A1/A2 no plano do dia", () => {
  cenario(["halteres", "polia"], ["Dumbbell_Bicep_Curl", "Hammer_Curls", "Triceps_Pushdown"]);
  const r = montar(M.Pares, { idx: 0 });
  const ofertas = r.todos().filter((e) => e.localName === "h3").map(texto);
  assert.deepEqual(ofertas, ["Tríceps pulley com barra"], "rosca martelo disputa o bíceps: fica de fora");
  r.todos().find((e) => e.localName === "button" && texto(e) === "Fazer junto")!.click();
  assert.deepEqual(M.S.plan.items.map((i: any) => [i.exerciseId, i.par ?? null]), [["Dumbbell_Bicep_Curl", "A1"], ["Triceps_Pushdown", "A2"], ["Hammer_Curls", null]]);
  assert.equal(M.S.ui.planSource, "manual", "edição manual: a geração não desfaz");
});
