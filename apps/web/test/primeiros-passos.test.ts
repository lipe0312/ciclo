// #71 Primeiros passos de uma conta nova, renderizados de verdade (Preact + DOM mínimo, empacotado com o esbuild do repo):
// nada marcado em nenhum passo, sugestão nunca marcada, resposta salva no aparelho e no PATCH do passo, recarregar não perde,
// Pular etapa, Pular por agora, Gerar semana com o que falta em lista legível, erro com texto humano e o menu ⋯. Dados fictícios.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { No, instalarNavegador, texto } from "./mini-dom.ts";

const WEB = join(import.meta.dirname, "..");
const HOJE_FICTICIO = "2026-11-14";
const CONTA = { email: "ana.teste@exemplo.test", name: "Ana", sexo: "feminino", nascimento: "1996-11-15", alturaCm: 165, pesoKg: null, createdAt: 1 };

const nav = instalarNavegador("#primeiros-passos/0");
type Chamada = { method: string; path: string; body: any };
const chamadas: Chamada[] = [];
let estado: Record<string, unknown> = {};
(globalThis as any).fetch = async (path: string, init: RequestInit = {}) => {
  const method = init.method ?? "GET", body = init.body ? JSON.parse(String(init.body)) : undefined;
  chamadas.push({ method, path, body });
  if (path.startsWith("/api/state")) return Response.json(estado);
  // a semana só existe depois que os Primeiros passos concluem (antes o servidor responde "sem_perfil")
  if (path.startsWith("/api/week")) return Response.json(chamadas.some((c) => c.method === "PATCH" && c.path === "/api/account")
    ? { week: { weekStart: "2026-11-09", days: [], version: 1, versions: [] } } : { week: null, empty: "sem_perfil" });
  return Response.json({ ok: true });
};

let M: any;
before(async () => {
  const dir = mkdtempSync(join(tmpdir(), "ciclo-pp-"));
  const out = join(dir, "pp.mjs");
  await build({
    stdin: {
      contents: `export { default as PrimeirosPassos, PASSOS, mensagemErro } from "./src/screens/primeiros-passos/index.tsx";
        export { default as Mais } from "./src/screens/mais/index.tsx";
        export { S, C, rascunhoPP, loadServer } from "./src/lib/store/index.ts";
        export { HttpError, queue } from "./src/lib/api/index.ts";
        export { garantirSemana, getVazio } from "./src/screens/semana/estado.ts";
        export { h, render } from "preact";`,
      resolveDir: WEB, loader: "ts",
    },
    bundle: true, format: "esm", platform: "neutral", mainFields: ["module", "main"], outfile: out, write: true, logLevel: "silent",
    jsx: "automatic", jsxImportSource: "preact", loader: { ".css": "empty" },
  });
  M = await import(pathToFileURL(out).href);
  rmSync(dir, { recursive: true, force: true });
});

const tick = () => new Promise((r) => setTimeout(r, 5));
/** Espera a navegação assíncrona (salvar e depois ir). */
async function esperarRota(h: string) { for (let i = 0; i < 100 && nav.loc.hash !== h; i++) await tick(); return nav.loc.hash; }
/** Conta nova, sem nada respondido. */
function contaNova() {
  M.S.profile = M.C.perfilVazio(); M.S.pains = []; M.S.gyms = []; M.S.account = { ...CONTA }; M.S.onboarding = "pendente";
  localStorage.clear(); chamadas.length = 0; M.queue.length = 0;
}
let raiz: No;
function abrir(passo: number) {
  if (raiz) M.render(null, raiz); // desmonta a tela anterior (efeitos pendentes não mexem na rota nova)
  nav.loc.hash = `#primeiros-passos/${passo}`;
  raiz = document.createElement("div") as unknown as No;
  M.render(M.h(M.PrimeirosPassos, { route: { screen: "primeiros-passos", parts: [String(passo)], query: {} } }), raiz);
  return raiz;
}
const redesenhar = () => { if (!nav.loc.hash.startsWith("#primeiros-passos/")) return; const p = Number(nav.loc.hash.split("/")[1]); M.render(M.h(M.PrimeirosPassos, { route: { screen: "primeiros-passos", parts: [String(p)], query: {} } }), raiz); };
const corpo = () => raiz.porClasse("pp-body")[0];
/** Rótulo (o <b>) de cada opção marcada. */
const marcados = (n: No = corpo()) => n.todos().filter((e) => e.getAttribute("aria-pressed") === "true").map((e) => texto(e.todos().find((x) => x.localName === "b") ?? e));
function botao(rotulo: string, n: No = raiz) {
  const els = n.todos().filter((e) => e.localName === "button" || e.localName === "a");
  const el = els.find((e) => e.getAttribute("aria-label") === rotulo) ?? els.find((e) => texto(e) === rotulo) ?? els.find((e) => texto(e).startsWith(rotulo));
  assert.ok(el, `botão "${rotulo}" não existe`);
  return el;
}
const clicar = async (rotulo: string, n?: No) => { botao(rotulo, n).click(); await tick(); redesenhar(); };
const patches = () => chamadas.filter((c) => c.method === "PATCH" && c.path === "/api/profile").map((c) => c.body.data);

test("conta nova: nenhuma opção marcada em nenhum passo (nem o objetivo, os músculos, a comida ou o sexo do cadastro)", () => {
  for (let i = 0; i < M.PASSOS.length - 1; i++) {
    contaNova(); abrir(i);
    assert.deepEqual(marcados(), [], `passo ${i} (${M.PASSOS[i].id}) com opção marcada`);
  }
  // com objetivo escolhido, o preset dos músculos aparece só como sugestão
  contaNova(); Object.assign(M.S.profile.goal, M.C.goalDefaults("bracos_ombros")); abrir(1);
  assert.deepEqual(marcados(), [], "músculos marcados sozinhos");
  assert.ok(raiz.porClasse("sug").length >= 3, "sem os chips de sugestão");
  assert.ok(botao("Usar sugestão"));
  assert.ok(raiz.porClasse("sug").every((e) => e.getAttribute("aria-pressed") === null), "sugestão não é botão marcado");
});

test("Usar sugestão e Usar do cadastro só marcam quando a pessoa toca", async () => {
  contaNova(); Object.assign(M.S.profile.goal, M.C.goalDefaults("bracos_ombros")); abrir(1);
  await clicar("Usar sugestão");
  assert.deepEqual(M.S.profile.subPriorities, M.C.goalPreset("bracos_ombros"));
  assert.ok(marcados().length >= 3);
  contaNova(); abrir(6);
  assert.match(texto(corpo()), /Do seu cadastro: feminino · \d+ anos · 165 cm/);
  await clicar("Usar do cadastro");
  assert.equal(M.S.profile.sex, "f"); assert.equal(M.S.profile.heightCm, 165); assert.equal(M.S.profile.weightKg, null, "peso não informado continua vazio");
  assert.deepEqual(marcados(), ["feminino"]);
});

test("Comida e Seus dados básicos: o que a pessoa responde fica no aparelho e vai no PATCH do passo ao Continuar", async () => {
  contaNova(); abrir(8);
  await clicar("Leve", corpo());
  assert.equal(M.S.profile.diet.mode, "leve"); assert.deepEqual(marcados(), ["Leve"]);
  assert.deepEqual(M.rascunhoPP.ler(), { diet: { mode: "leve" } }, "gravado no aparelho na hora");
  await clicar("Continuar"); await tick();
  assert.deepEqual(patches().at(-1), { diet: { mode: "leve" } }, "PATCH só com o campo do passo");
  assert.equal(nav.loc.hash, "#primeiros-passos/9");

  contaNova(); abrir(6);
  await clicar("masculino", corpo());
  const peso = corpo().todos().find((e) => e.attrs.id === "pp-weightKg")!;
  peso.value = "61,5"; peso.dispatch("input"); await tick(); redesenhar();
  const idade = corpo().todos().find((e) => e.attrs.id === "pp-age")!;
  idade.value = "7"; idade.dispatch("input"); await tick(); redesenhar();
  assert.equal(M.S.profile.weightKg, 61.5); assert.equal(M.S.profile.age, null, "fora do limite não grava");
  assert.match(texto(corpo()), /Use de 12 a 90 anos/);
  await clicar("Continuar"); await tick();
  assert.deepEqual(patches().at(-1), { sex: "m", weightKg: 61.5 });
});

test("recarregar no meio do passo: o rascunho do aparelho volta por cima do que o servidor tem", async () => {
  contaNova(); abrir(0);
  await clicar("Braços e ombros maiores", corpo());
  const foco = corpo().todos().find((e) => e.localName === "textarea")!;
  foco.value = "Ombros largos para o verão (teste)"; foco.dispatch("input"); await tick();
  estado = { account: CONTA, onboarding: "pendente", profile: { level: 1 }, gyms: [], week: {} };
  M.S.profile = M.C.perfilVazio(); // o que sobra depois de recarregar a página
  await M.loadServer();
  assert.equal(M.S.profile.goal.id, "bracos_ombros"); assert.equal(M.S.profile.goal.statement, "Ombros largos para o verão (teste)"); assert.equal(M.S.profile.level, 1);
  abrir(0);
  assert.equal(corpo().todos().find((e) => e.localName === "textarea")!.value, "Ombros largos para o verão (teste)");
  // outra conta no mesmo aparelho não herda o rascunho
  M.S.profile = M.C.perfilVazio();
  estado = { account: { ...CONTA, email: "bia.teste@exemplo.test" }, onboarding: "pendente", profile: {}, gyms: [], week: {} };
  await M.loadServer();
  assert.equal(M.S.profile.goal.id, "");
});

test("Pular etapa avança sem responder; Voltar mantém o que foi respondido", async () => {
  contaNova(); abrir(0);
  assert.ok(botao("Continuar").hasAttribute("disabled"));
  await clicar("Pular etapa");
  assert.equal(nav.loc.hash, "#primeiros-passos/1");
  abrir(2); await clicar("Menos de 1 ano", corpo());
  assert.throws(() => botao("Pular etapa"), "respondido: só Continuar");
  await clicar("Continuar"); abrir(3); await clicar("Voltar uma pergunta");
  assert.equal(nav.loc.hash, "#primeiros-passos/2"); abrir(2);
  assert.deepEqual(marcados(), ["Menos de 1 ano"]);
});

test("Pular por agora: salva o respondido, marca 'pulado', conclui e vai para o Hoje (sem PUT do perfil inteiro)", async () => {
  contaNova(); abrir(2);
  await clicar("Mais de 3 anos", corpo());
  await clicar("Pular por agora");
  assert.equal(await esperarRota("#hoje"), "#hoje");
  assert.deepEqual(patches(), [{ level: 3 }, { meta: { checkup: "pulado" } }]);
  assert.ok(chamadas.some((c) => c.method === "PATCH" && c.path === "/api/account" && c.body.onboarding === "concluido"));
  assert.ok(!chamadas.some((c) => c.method === "PUT" && c.path === "/api/profile"), "nunca o perfil inteiro");
  assert.equal(M.S.onboarding, "concluido");
});

test("Gerar semana: sem o mínimo, mostra a lista do que falta; com ele, gera sem corpo nem comida", async () => {
  contaNova(); abrir(9);
  await clicar("Gerar minha semana e abrir o Hoje"); await tick(); redesenhar();
  const falta = raiz.porClasse("pp-falta")[0];
  assert.ok(falta, "sem a lista do que falta");
  assert.match(texto(falta), /Objetivo.*Há quanto tempo você treina.*Dias em que você treina.*Duração do treino.*Academia, casa ou os dois/);
  assert.ok(!/deve ser|goal\.id/.test(texto(raiz)));
  assert.equal(chamadas.length, 0, "nada vai ao servidor");

  // o app abriu antes de existir semana (a casca carrega a semana no boot): o Hoje guardou "sem semana"
  await M.garantirSemana(true); assert.ok(M.getVazio(), "sem semana antes de concluir"); chamadas.length = 0;
  Object.assign(M.S.profile.goal, M.C.goalDefaults("bracos_ombros"), { statement: "Ombros largos para o verão (teste)" });
  Object.assign(M.S.profile, { level: 1, daysUsual: ["seg", "qua", "sex"], daysTarget: 3, minutes: 60, places: ["academia"] });
  abrir(9);
  assert.match(texto(raiz), /Ombros largos para o verão \(teste\)\. 3 dias por semana, cerca de 60 min por treino/);
  assert.match(texto(raiz), /Objetivo: Braços e ombros maiores/);
  await clicar("Gerar minha semana e abrir o Hoje");
  assert.equal(await esperarRota("#hoje"), "#hoje");
  const ordem = chamadas.map((c) => `${c.method} ${c.path.replace(/\d{4}-\d{2}-\d{2}/, "D")}`);
  assert.deepEqual(ordem, ["PATCH /api/profile", "PUT /api/gyms/acad1", "PUT /api/day-plan/D", "PATCH /api/account", "GET /api/week?date=D"]);
  assert.equal(M.getVazio(), null, "o Hoje não pode abrir vazio depois de gerar a semana (ficava com o 'sem semana' do boot)");
  const p = chamadas[0].body.data;
  assert.equal(p.goal.statement, "Ombros largos para o verão (teste)"); assert.equal(p.meta.checkup, "feito"); assert.equal(p.sex, undefined); assert.equal(p.diet, undefined);
  assert.ok(chamadas[2].body.plan.items.length > 0, "treino de hoje com exercícios");
});

test("erro na tela: só texto humano (nunca o texto técnico do validador)", () => {
  const tecnico = new M.HttpError("goal.id deve ser bracos_ombros|massa_geral", 400, { error: "goal.id deve ser …" });
  assert.equal(M.mensagemErro(tecnico), "Não deu para salvar agora. Tente de novo.");
  const humano = new M.HttpError("Não deu para salvar: confira objetivo.", 400, { error: "x", code: "perfil_invalido" });
  assert.equal(M.mensagemErro(humano), "Não deu para salvar: confira objetivo.");
  assert.equal(M.mensagemErro(new TypeError("Failed to fetch")), "Não deu para salvar agora. Tente de novo.");
});

test("menu ⋯ com o checkup pendente: abre o Mais e mostra só o que abre (voltar aos Primeiros passos e Conta)", async () => {
  contaNova();
  assert.equal(M.C.telaComCheckupPendente("mais", true), "mais");
  const r = document.createElement("div") as unknown as No;
  M.render(M.h(M.Mais, {}), r);
  const links = r.todos().filter((e) => e.localName === "a").map((a) => a.getAttribute("href"));
  assert.deepEqual(links, ["#primeiros-passos", "#conta"]);
  links.forEach((h) => assert.equal(M.C.telaComCheckupPendente(h!.slice(1), true), h === "#conta" ? "conta" : "primeiros-passos"));
  M.S.onboarding = "concluido"; M.render(M.h(M.Mais, {}), r);
  assert.equal(r.todos().filter((e) => e.localName === "a").length, 5);
  void HOJE_FICTICIO;
});
