// #108 Renderizado de verdade (Preact + DOM mínimo): o dia com treino salvo pelo Chat/MCP abre exatamente esse treino;
// o dia sem treino mostra "Gerar treino" (sem "Ver extra") e abrir a Semana/Hoje não gera nada: só GET. Dados fictícios.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { No, instalarNavegador, texto } from "./mini-dom.ts";

const WEB = join(import.meta.dirname, "..");
instalarNavegador("#semana");
// a barra de abas do Treino mede e rola o <nav> (o DOM mínimo não tem layout): stubs só para não quebrar
const P = No.prototype as any;
Object.defineProperty(P, "classList", { configurable: true, get: () => ({ toggle() {}, add() {}, remove() {}, contains: () => false }) });
P.querySelector ??= () => null;
// o Carrossel mede os filhos do trilho num timer de scroll (onScroll do Hoje): sem layout, lista vazia basta
if (!("children" in P)) Object.defineProperty(P, "children", { configurable: true, get: () => [] });
P.addEventListener ??= () => {}; P.removeEventListener ??= () => {};
const chamadas: string[] = [];
let semana: unknown = null;
(globalThis as any).fetch = async (path: string, init: RequestInit = {}) => {
  chamadas.push(`${init.method ?? "GET"} ${path}`);
  if (init.method === "POST") return new Promise<Response>(() => {}); // o toque só precisa sair daqui (sem toast no DOM mínimo)
  if (path.startsWith("/api/week")) return Response.json({ week: semana });
  return Response.json({ ok: true });
};

let M: any;
before(async () => {
  const dir = mkdtempSync(join(tmpdir(), "ciclo-108-"));
  const out = join(dir, "m.mjs");
  await build({
    stdin: {
      contents: `export { default as Semana } from "./src/screens/semana/index.tsx";
        export { SemanaCarrossel } from "./src/screens/hoje/carrossel-semana.tsx";
        export { garantirSemana } from "./src/screens/semana/estado.ts";
        export { S, C, today, monday } from "./src/lib/store/index.ts";
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
function montar(comp: unknown, props: Record<string, unknown> = {}) {
  const r = document.createElement("div") as unknown as No;
  M.render(M.h(comp, props), r);
  return r;
}
const botoes = (n: No) => n.todos().filter((e) => e.tagName === "BUTTON" || e.tagName === "A").map(texto);

/** Semana fictícia: hoje é dia livre e outro dia sem treino recebeu um treino salvo pelo Chat (via MCP). */
function montarSemana() {
  const C = M.C, dows = C.DOWS as string[], dates = C.weekDates(M.monday) as string[];
  const hoje = dates.indexOf(M.today);
  const outro = (hoje + 3) % 7;
  const treino = dows.filter((_, i) => i !== hoje && i !== outro).slice(0, 3);
  const ALL = C.EQUIPMENT.map((e: any) => e.id);
  const profile = { daysUsual: treino, daysTarget: 3, minutes: 60, priorities: ["ombro"], dayGym: {}, gyms: [{ id: "a1", equipment: ALL }] };
  const base = { weekStart: M.monday, today: M.today, sets: {}, attendance: {}, profile, targets: C.weeklyTargets(1, ["ombro"]) };
  const ref = C.planWeek(base).days.find((d: any) => d.plan)!.plan;
  const salvo = C.resumirDia({ ...ref, name: "Braços do Chat (fictício)", items: ref.items.slice(0, 2), why: ["motivo fictício"] });
  const inp = { ...base, fixed: { [dates[outro]]: { plan: salvo, source: "claude" } } };
  const v = C.weekView(inp, C.planWeek(inp));
  return { week: { ...v, version: 1, versions: [], progression: { changes: [], deload: { on: false, reason: null } } }, hoje: dates[hoje], outro: dates[outro], salvo };
}

test("dia sem treino mostra Gerar treino (nunca Ver extra) e abrir a Semana e o Hoje não gera nada", async () => {
  const s = montarSemana();
  semana = s.week; chamadas.length = 0;
  await M.garantirSemana(true); await tick();
  const lista = montar(M.Semana, { route: { screen: "semana", parts: [], query: {} } }); await tick();
  const carrossel = montar(M.SemanaCarrossel); await tick();
  for (const r of [lista, carrossel]) {
    assert.ok(botoes(r).some((b) => /Gerar treino/.test(b)), "botão Gerar treino no dia livre");
    assert.ok(!botoes(r).some((b) => /Ver extra/.test(b)), "sem Ver extra");
  }
  // folga futura sem treino também oferece Gerar treino (secundário); dia com treino, não
  const semTreino = s.week.days.filter((d: any) => d.status === "livre" || (d.status === "folga" && d.date >= M.today && !d.plan)).length;
  assert.equal(botoes(lista).filter((b) => /Gerar treino/.test(b)).length, semTreino);
  const det = montar(M.Semana, { route: { screen: "semana", parts: ["dia", s.hoje], query: {} } }); await tick();
  assert.match(texto(det), /Sem treino/);
  assert.ok(botoes(det).some((b) => /Gerar treino/.test(b)));
  assert.ok(chamadas.every((c) => c.startsWith("GET ")), `só leitura ao abrir: ${chamadas.join(", ")}`);
  assert.equal(M.S.ui.planSource === "semana" && M.S.plan?.name?.startsWith("Extra"), false, "o Hoje não recebe um extra calculado");

  // o toque é que gera: POST na rota do dia
  lista.todos().find((e) => e.tagName === "BUTTON" && /Gerar treino/.test(texto(e)))!.click(); await tick();
  assert.ok(chamadas.includes(`POST /api/week/day/${s.hoje}/gerar-treino`), chamadas.join(", "));
});

test("regressão: o dia com treino salvo pelo Chat abre exatamente esse treino (Ver → detalhe com os mesmos exercícios)", async () => {
  const s = montarSemana();
  semana = s.week;
  await M.garantirSemana(true); await tick();
  const lista = montar(M.Semana, { route: { screen: "semana", parts: [], query: {} } }); await tick();
  const ver = lista.todos().find((e) => e.tagName === "A" && texto(e) === "Ver" && (e.getAttribute("href") ?? "").includes(s.outro));
  assert.ok(ver, "o dia salvo tem Ver para ele mesmo");
  assert.match(texto(lista), /montado pelo Chat/);
  const det = montar(M.Semana, { route: { screen: "semana", parts: ["dia", s.outro], query: {} } }); await tick();
  assert.match(texto(det), /Braços do Chat \(fictício\)/);
  for (const it of s.salvo.items) assert.ok(texto(det).includes(it.nm), `${it.nm} no detalhe`);
  assert.equal(det.porClasse("sem-ex").length, s.salvo.items.length + s.salvo.prehab.length, "só os exercícios salvos");
});
