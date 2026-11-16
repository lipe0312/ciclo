// #63 Começo vazio e guiado, renderizado de verdade (Preact + DOM mínimo): Hoje vazio sem treino aleatório e com os 2 CTAs,
// nenhum chip marcado de fábrica (Perfil de treino, Perfil, lugar novo) e o pulso que para no 1º toque. Dados fictícios.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { No, instalarNavegador, texto } from "./mini-dom.ts";

const WEB = join(import.meta.dirname, "..");
const CONTA = { email: "caio.teste@exemplo.test", name: "Caio", createdAt: 1 };
const nav = instalarNavegador("#hoje");
const chamadas: string[] = [];
(globalThis as any).fetch = async (path: string, init: RequestInit = {}) => {
  chamadas.push(`${init.method ?? "GET"} ${path}`);
  if (path.startsWith("/api/week")) return Response.json({ week: null, empty: "sem_perfil", message: "texto do servidor" });
  if (path.startsWith("/api/home")) return Response.json({ home: { vazio: true, gaps: [], marcos: [], medias: [] } });
  return Response.json({ ok: true });
};

let M: any;
before(async () => {
  const dir = mkdtempSync(join(tmpdir(), "ciclo-63-"));
  const out = join(dir, "m.mjs");
  await build({
    stdin: {
      contents: `export { default as Hoje, hojeVazio, esconderLembrete } from "./src/screens/hoje/index.tsx";
        export { LembreteDiario } from "./src/lib/lembrete-diario/index.tsx";
        export { default as PrimeirosPassos, PASSOS } from "./src/screens/primeiros-passos/index.tsx";
        export { default as Perfil } from "./src/screens/perfil/index.tsx";
        export { PassoAPasso } from "./src/screens/academias/passos.tsx";
        export { H } from "./src/screens/hoje/estado.ts";
        export { garantirSemana } from "./src/screens/semana/estado.ts";
        export { _reiniciarPulso } from "./src/lib/pulso/index.ts";
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
function contaNova() {
  M.S.profile = M.C.perfilVazio(); M.S.pains = []; M.S.gyms = []; M.S.account = { ...CONTA }; M.S.onboarding = "concluido";
  M.S.profile.meta = { ...M.S.profile.meta, checkup: "pulado" };
  localStorage.clear(); M._reiniciarPulso();
}
function montar(comp: unknown, props: Record<string, unknown> = {}) {
  const r = document.createElement("div") as unknown as No;
  M.render(M.h(comp, props), r);
  return r;
}
const marcados = (n: No, sel = (_e: No) => true) => n.todos().filter((e) => e.getAttribute("aria-pressed") === "true" && sel(e)).map(texto);
/** Chips e opções (o que a pessoa escolhe); segmentos técnicos como o horizonte ficam fora. */
const ehChip = (e: No) => /(^| )(chip|opt|eq|mc-zona)( |$)/.test(e.className);
const link = (n: No, rotulo: string) => n.todos().find((e) => (e.localName === "a" || e.localName === "button") && texto(e).startsWith(rotulo));

test("conta nova que pulou: Hoje vazio, sem treino aleatório, com Montar (principal) e Completar Perfil de treino (secundário)", async () => {
  contaNova();
  await M.garantirSemana(true); M.H.view = { vazio: true, gaps: [], marcos: [], medias: [] };
  const r = montar(M.Hoje);
  const t = texto(r);
  assert.match(t, /Seu Hoje está vazio/);
  const montarBtn = link(r, "Montar meu primeiro treino"), completar = link(r, "Completar Perfil de treino");
  assert.ok(montarBtn && completar, t);
  assert.ok(montarBtn.className.split(" ").includes("pri"), "Montar é a ação principal");
  assert.ok(!completar.className.split(" ").includes("pri"), "Completar é secundária");
  assert.equal(montarBtn.getAttribute("href"), "#primeiros-passos/0");
  assert.equal(completar.getAttribute("href"), "#perfil");
  assert.equal(r.porClasse("hm-dia").length, 0, "nenhum dia de treino");
  assert.ok(!/Começar|exercícios ·|séries/.test(t), "nenhum treino na tela");
  assert.ok(!/Primeiros passos|checkup|texto do servidor/.test(t));
  assert.equal(r.todos().filter((e) => e.className.split(" ").includes("pri")).length, 1, "uma ação principal só");
  // com o objetivo respondido, Montar abre no próximo que falta
  M.S.profile.goal.id = "bracos_ombros";
  assert.equal(link(montar(M.Hoje), "Montar meu primeiro treino")!.getAttribute("href"), `#primeiros-passos/${M.C.PASSOS_PP.indexOf("experiencia")}`);
  void nav;
});

test("Hoje vazio: a faixa do checkout/check-in não aparece acima do começo guiado", async () => {
  contaNova(); M.S.profile.goal.id = "";
  await M.garantirSemana(true); M.H.view = { vazio: true, gaps: [], marcos: [], medias: [] };
  assert.equal(M.hojeVazio(), true);
  assert.equal(M.esconderLembrete("hoje"), true);
  assert.equal(montar(M.LembreteDiario, { hidden: M.esconderLembrete("hoje") }).porClasse("lembrete-diario").length, 0, "faixa do Diário no Hoje vazio");
  assert.equal(M.esconderLembrete("primeiros-passos"), true);
  assert.equal(M.esconderLembrete("diario"), false, "fora do Hoje vazio continua");
});

test("nenhum chip vem marcado de fábrica: Perfil de treino, blocos do Perfil e lugar novo", async () => {
  contaNova();
  for (let i = 0; i < M.PASSOS.length - 1; i++) {
    const r = montar(M.PrimeirosPassos, { route: { screen: "primeiros-passos", parts: [String(i)], query: {} } });
    assert.deepEqual(marcados(r.porClasse("pp-body")[0]), [], `passo ${M.PASSOS[i].id}`);
  }
  for (const b of ["objetivo", "prioridades", "voce", "experiencia", "rotina"]) {
    const r = montar(M.Perfil, { route: { screen: "perfil", parts: [b], query: {} } });
    assert.deepEqual(marcados(r, ehChip), [], `Perfil › ${b}`);
  }
  // lugar novo: nenhum aparelho e nenhum dia marcado, em qualquer tipo
  for (const tipo of ["Academia", "Casa", "Hotel"]) {
    const r = montar(M.PassoAPasso, { onDone() {} });
    link(r, tipo)!.click(); await tick();
    for (let k = 0; k < 4 && !r.porClasse("eqgrid").length; k++) { link(r, "Continuar")?.click() ?? link(r, "Pular")?.click(); await tick(); }
    assert.ok(r.porClasse("eqgrid").length, `${tipo}: não chegou nos aparelhos (${texto(r).slice(0, 80)})`);
    assert.deepEqual(marcados(r, (e) => e.className.split(" ").includes("eq")), [], `${tipo}: aparelho marcado`);
  }
});

test("pulso: chips desmarcados pulsam nas primeiras visitas e param no 1º toque", async () => {
  contaNova();
  const abrir = () => montar(M.PrimeirosPassos, { route: { screen: "primeiros-passos", parts: ["2"], query: {} } });
  let r = abrir();
  assert.ok(r.porClasse("pp-body")[0].className.split(" ").includes("pulsa"), "1ª visita pulsa");
  link(r.porClasse("pp-body")[0], "Menos de 1 ano")!.click(); await tick();
  r = abrir();
  assert.ok(!r.porClasse("pp-body")[0].className.split(" ").includes("pulsa"), "depois do toque, para");
  M._reiniciarPulso(); // reabrir o app: continua parado
  assert.ok(!abrir().porClasse("pp-body")[0].className.split(" ").includes("pulsa"));
  // sem tocar, só nas primeiras visitas
  localStorage.clear();
  const visitas: boolean[] = [];
  for (let i = 0; i < M.C.PULSO_VISITAS + 1; i++) { M._reiniciarPulso(); visitas.push(abrir().porClasse("pp-body")[0].className.split(" ").includes("pulsa")); }
  assert.deepEqual(visitas, [...Array(M.C.PULSO_VISITAS).fill(true), false]);
});

test("o pulso é leve (1.00→1.03, 2.4 s) e não roda com prefers-reduced-motion", () => {
  const css = readFileSync(join(WEB, "src/app.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const bloco = css.match(/@media \(prefers-reduced-motion:no-preference\)\{([^@]*?\})\s*\}/)?.[1] ?? "";
  assert.match(bloco, /\.pulsa [^{]*\.chip\[aria-pressed="false"\][^{]*\{animation:pulso 2\.4s/);
  assert.equal((css.match(/animation:pulso/g) ?? []).length, 1, "a animação só existe dentro do no-preference");
  assert.match(css, /@keyframes pulso\{0%,100%\{transform:scale\(1\)\}50%\{transform:scale\(1\.03\)\}\}/);
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)\{\*\{transition:none!important;animation:none!important\}\}/);
});
