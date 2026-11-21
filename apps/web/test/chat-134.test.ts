// #134 Tela Chat renderizada de verdade (Preact + DOM mínimo, empacotada com o esbuild do repo) no demo, com cada estado de
// IA simulado (?demo&ia=...) e pelo menos 2 IAs por estado: composer (+, microfone, enviar), rascunho sem IA, pedido da
// rotina com mini prompt, chave, ambos com o toggle, rotina de uma IA + chave de outra, faixa (cancelar e aplicar),
// "Fale com a IA" preenchido, anexo de tipo errado e XSS em mensagem e pedido. Dados fictícios.
import { test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { No, instalarNavegador, texto } from "./mini-dom.ts";

const WEB = join(import.meta.dirname, "..");
const nav = instalarNavegador("#chat");
nav.loc.search = "?demo";
(globalThis as any).window = globalThis; // o microfone lê window.isSecureContext

let M: any;
before(async () => {
  const dir = mkdtempSync(join(tmpdir(), "ciclo-chat-"));
  const out = join(dir, "chat.mjs");
  await build({
    stdin: {
      contents: `export { default as Chat } from "./src/screens/claude/index.tsx";
        export { chat, novaConversa } from "./src/screens/claude/conversa.ts";
        export { S } from "./src/lib/store/index.ts";
        export * as C from "@ciclo/core/chat";
        export { h, render } from "preact";`,
      resolveDir: WEB, loader: "ts",
    },
    bundle: true, format: "esm", platform: "neutral", mainFields: ["module", "main"], outfile: out, write: true, logLevel: "silent",
    jsx: "automatic", jsxImportSource: "preact", loader: { ".css": "empty" },
  });
  M = await import(pathToFileURL(out).href);
  rmSync(dir, { recursive: true, force: true });
});

after(() => { if (raiz) M.render(null, raiz); });
const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));
let raiz: No;
async function abrir(search: string, query: Record<string, string> = {}, inbox: any[] = []) {
  if (raiz) M.render(null, raiz);
  nav.loc.search = search; nav.loc.hash = "#chat";
  M.novaConversa(); M.S.inbox = inbox; M.S.ui.inboxDraft = "";
  raiz = document.createElement("div") as unknown as No;
  M.render(M.h(M.Chat, { route: { screen: "chat", parts: [], query } }), raiz);
  await tick(150); // os efeitos do Preact (assinaturas do estado) rodam depois do "quadro" (~100 ms sem requestAnimationFrame)
  return raiz;
}
// nenhum pedido fica "pendente" no fim (a resposta ilustrativa do demo chega em 900 ms)
afterEach(() => { for (const m of M?.S.inbox ?? []) if (m.status === "pendente") m.status = "descartado"; });
const els = (tag?: string) => raiz.todos().filter((e) => !tag || e.localName === tag);
function botao(rotulo: string, n: No = raiz) {
  const bs = n.todos().filter((e) => e.localName === "button" || e.localName === "a");
  const el = bs.find((e) => e.getAttribute("aria-label") === rotulo) ?? bs.find((e) => texto(e) === rotulo) ?? bs.find((e) => texto(e).startsWith(rotulo));
  assert.ok(el, `botão "${rotulo}" não existe em: ${texto(n).slice(0, 200)}`);
  return el;
}
const clicar = async (rotulo: string, n?: No) => { botao(rotulo, n).click(); await tick(); };
async function escrever(t: string) {
  const ta = els("textarea")[0]; assert.ok(ta, "sem o campo do composer");
  ta.value = t; ta.dispatch("input"); await tick();
}
async function enviar(t: string) {
  await escrever(t);
  // o DOM mínimo não tem `onsubmit`: o Preact registra o ouvinte como "Submit"
  const f = els("form")[0]; f.dispatch(f.ouvintes.submit ? "submit" : "Submit"); await tick(20);
}
const tela = () => texto(raiz);

test("composer: +, microfone e enviar com rótulo; chips de sugestão na conversa vazia preenchem sem enviar", async () => {
  await abrir("?demo&ia=chave&chave=gemini");
  for (const r of ["Anexar foto ou PDF", "Falar a mensagem", "Enviar"]) assert.ok(botao(r), r);
  assert.ok(els("textarea")[0].getAttribute("aria-label"));
  assert.ok(raiz.porClasse("ch-composer")[0], "composer fixo");
  await clicar("O que treino hoje?");
  assert.equal(M.S.ui.inboxDraft, "O que treino hoje?");
  assert.equal(raiz.porClasse("ch-msg").length, 0, "o chip não envia");
});

for (const [rotina, nome] of [["claude", "Claude"], ["gemini", "Gemini"]] as const) {
  test(`estado nenhum (${nome}): pensando, mensagem fixa com o passo a passo; rascunho fica; nada vai para a rotina`, async () => {
    await abrir(`?demo&ia=nenhum&rotina=${rotina}`);
    await enviar("o que treino hoje?");
    assert.ok(raiz.porClasse("ch-pensando").length, "sem o pensando…");
    await tick(1100);
    assert.match(tela(), /ainda não conectou nenhuma IA/);
    const a = botao(`Configurar o ${nome}`);
    assert.equal(a.getAttribute("href"), "#perfil/ia");
    assert.equal(M.S.ui.inboxDraft, "o que treino hoje?", "o rascunho se perdeu");
    assert.equal(M.S.inbox.length, 0, "foi para a rotina");
    assert.ok(!els("a").some((x) => /^https?:/.test(x.getAttribute("href") ?? "")), "link externo no estado nenhum");
  });
}

test("estado só conector com IA que aceita texto na URL: vira pedido, faixa '1 pedido' e Abrir no <IA> com o mini prompt", async () => {
  await abrir("?demo&ia=conector&rotina=claude");
  await enviar("quero treinar ombro hoje");
  assert.equal(M.S.inbox.length, 1); assert.equal(M.S.inbox[0].text, "quero treinar ombro hoje");
  assert.equal(M.S.ui.inboxDraft, "");
  assert.match(tela(), /1 pedido na rotina/);
  assert.match(tela(), /Virou um pedido na rotina do Claude/);
  const a = botao("Abrir no Claude");
  const url = a.getAttribute("href")!;
  assert.ok(url.startsWith("https://claude.ai/new?q="), url);
  assert.ok(decodeURIComponent(url).includes(M.C.MINI_PROMPT));
  assert.equal(a.getAttribute("rel"), "noopener noreferrer");
});

test("estado só conector com IA sem texto na URL: bloco com o prompt + Copiar, sem link externo", async () => {
  await abrir("?demo&ia=conector&rotina=chatgpt");
  await enviar("quero treinar ombro hoje");
  assert.equal(M.S.inbox.length, 1);
  assert.ok(botao("Copiar"));
  assert.match(tela(), /Abra o ChatGPT e cole/);
  assert.ok(texto(raiz.porClasse("ch-prompt")[0]).startsWith(M.C.MINI_PROMPT));
  assert.ok(!els("a").some((x) => /^https?:/.test(x.getAttribute("href") ?? "")), "link externo para IA sem prompt na URL");
});

test("mini prompt: texto sensível não vai na URL nem no bloco", async () => {
  await abrir("?demo&ia=conector&rotina=claude");
  await enviar("meu exame de sangue saiu, ajusta a dieta");
  assert.ok(!els("a").some((x) => /^https?:/.test(x.getAttribute("href") ?? "")), "texto sensível foi para a URL");
  assert.equal(texto(raiz.porClasse("ch-prompt")[0]), M.C.MINI_PROMPT);
});

for (const [ia, nome] of [["gemini", "Gemini"], ["deepseek", "DeepSeek"]] as const) {
  test(`estado só chave (${nome}): topo com a IA, mensagem guardada, nada na rotina`, async () => {
    await abrir(`?demo&ia=chave&chave=${ia}`);
    assert.match(tela(), new RegExp(`${nome} · modelo padrão`));
    await enviar("como foi minha semana?");
    assert.equal(M.S.inbox.length, 0);
    assert.match(tela(), new RegExp(`chave do ${nome}`));
    assert.equal(M.chat.conversaId != null, true, "não entrou no histórico");
    assert.ok(!raiz.porClasse("ch-faixa").length, "faixa sem pedidos");
  });
}

test("estado ambos: o padrão é a chave; o toggle manda para a rotina da outra IA", async () => {
  await abrir("?demo&ia=ambos&rotina=claude&chave=gemini");
  assert.match(tela(), /Gemini · modelo padrão/);
  await enviar("primeira");
  assert.equal(M.S.inbox.length, 0, "o padrão foi para a rotina");
  const cb = els("input").find((e) => e.getAttribute("type") === "checkbox")!;
  assert.match(texto(cb.parentNode!), /Mandar para a rotina do Claude/);
  cb.value = ""; (cb as any).checked = true; cb.dispatch("change"); await tick();
  await enviar("segunda");
  assert.equal(M.S.inbox.length, 1); assert.equal(M.S.inbox[0].text, "segunda");
});

test("rotina de uma IA + chave de outra: 2 pedidos esperando não bloqueiam a conversa; cancelar um", async () => {
  const ag = Date.now();
  await abrir("?demo&ia=ambos&rotina=chatgpt&chave=gemini", {}, [
    { id: "p1", text: "pedido um", status: "pendente", created_at: ag - 2000, tier: "haiku" },
    { id: "p2", text: "pedido dois", status: "pendente", created_at: ag - 1000, tier: "haiku" },
  ]);
  assert.match(tela(), /2 pedidos na rotina/);
  assert.ok(!raiz.porClasse("ch-pedido").length, "a faixa começa recolhida");
  await enviar("conversa com a chave");
  assert.match(tela(), /chave do Gemini/);
  assert.equal(M.S.inbox.length, 2, "a conversa virou pedido");
  await clicar("2 pedidos na rotina");
  assert.equal(raiz.porClasse("ch-pedido").length, 2);
  assert.match(texto(raiz.porClasse("ch-pedido")[0]), /para ChatGPT/);
  await clicar("Cancelar", raiz.porClasse("ch-pedido")[0]);
  assert.equal(M.S.inbox.find((m: any) => m.id === "p2").status, "descartado");
  assert.match(tela(), /1 pedido na rotina/);
});

test("faixa: Aplicar aplica a proposta e o pedido sai da faixa; sem pedidos a faixa some", async () => {
  await abrir("?demo&ia=conector&rotina=claude", {}, [
    { id: "r1", text: "corta para 30 min", status: "respondido", created_at: Date.now(), tier: "haiku", response: "Cortei para caber em 30 min.", change: { minutes: 30 } },
  ]);
  await clicar("1 pedido na rotina");
  assert.match(tela(), /Cortei para caber em 30 min/);
  await clicar("Aplicar");
  assert.equal(M.S.inbox[0].status, "aplicado");
  assert.equal(M.S.ui.minutes, 30);
  await tick();
  assert.ok(!raiz.porClasse("ch-faixa").length, "a faixa continuou sem pedidos");
});

test("Fale com a IA: o Chat abre com o pedido escrito no composer (não enviado) e o texto sai da URL", async () => {
  nav.loc.hash = "#chat?texto=x";
  await abrir("?demo&ia=conector&rotina=claude", { texto: M.C.pedidoFale("trocar_exercicio", "Elevação lateral") });
  await tick();
  assert.equal(M.S.ui.inboxDraft, "Troque o exercício Elevação lateral de hoje");
  assert.equal(M.S.inbox.length, 0, "foi enviado sozinho");
  assert.equal(nav.loc.hash, "#chat");
});

test("ataque: XSS em mensagem e em pedido vira texto (nenhum elemento criado)", async () => {
  const xss = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
  await abrir("?demo&ia=chave&chave=gemini", {}, [{ id: "x1", text: xss, status: "pendente", created_at: Date.now(), tier: "haiku" }]);
  await enviar(xss);
  await clicar("1 pedido na rotina");
  assert.ok(!els("img").length && !els("script").length, "o texto virou HTML");
  assert.ok(tela().includes(xss));
});

test("ataque: anexo de tipo errado é recusado; foto entra", async () => {
  await abrir("?demo&ia=chave&chave=gemini");
  const inp = els("input").find((e) => e.getAttribute("type") === "file")!;
  assert.ok(inp.getAttribute("accept")!.includes("application/pdf"));
  (inp as any).files = [{ name: "pagina.html", type: "text/html", size: 20 }]; inp.dispatch("change"); await tick();
  assert.equal(M.chat.anexo, null);
  (inp as any).files = [{ name: "prato.svg", type: "image/svg+xml", size: 20 }]; inp.dispatch("change"); await tick();
  assert.equal(M.chat.anexo, null);
  (inp as any).files = [{ name: "prato.jpg", type: "image/jpeg", size: 2000 }]; inp.dispatch("change"); await tick();
  assert.deepEqual(M.chat.anexo, { nome: "prato.jpg", tipo: "foto" });
  assert.ok(botao("Tirar o anexo"));
});
