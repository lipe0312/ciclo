// #134 Chat: os 4 estados com IAs diferentes (nada fixo), rotina de uma IA + chave de outra, mini prompt (nada longo ou
// sensível na URL), faixa dos pedidos, composer (Enter, anexo) e "Fale com a IA". Dados fictícios.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CHAT, MINI_PROMPT, SUGESTOES_CHAT, caminhoChat, destinoEnvio, enterEnvia, mensagemSemIa, miniPrompt, pedidoFale,
  hrefFale, pedidosDaFaixa, podeAplicar, resumoFaixa, rotuloTopo, statusPedido, textoFixo, tituloConversa, validarAnexo, validarMensagem,
} from "../src/chat.ts";
import { estadoIA } from "../src/index.ts";
import type { AcessoIa, ChaveResumo, EstadoConector, IaId, PerfilIa } from "../src/index.ts";

const perfil = (...usa: [IaId, ...AcessoIa[]][]): PerfilIa => ({ usa: usa.map(([provedor, ...acesso]) => ({ provedor, acesso })), principal: usa[0]?.[0] ?? null });
const chave = (provedor: ChaveResumo["provedor"], ativo = true): ChaveResumo => ({ provedor, ativo });
const cenario = (ia: PerfilIa | null, conector: EstadoConector, chaves: ChaveResumo[]) => caminhoChat(ia, estadoIA(ia, conector, chaves), chaves);

test("estado nenhum: fica como rascunho e a mensagem fixa leva a Perfil → Sua IA na IA escolhida (2 IAs)", () => {
  for (const [ia, nome] of [["claude", "Claude"], ["gemini", "Gemini"]] as const) {
    const c = cenario(perfil([ia, "gratis"]), "nenhum", []);
    assert.equal(c.modo, "nenhum"); assert.equal(c.conector, null); assert.equal(c.chave, null);
    assert.equal(destinoEnvio(c.modo), "rascunho"); assert.equal(destinoEnvio(c.modo, true), "rascunho");
    const m = mensagemSemIa(perfil([ia, "gratis"]));
    assert.match(m.texto, /ainda não conectou nenhuma IA/); assert.equal(m.href, "#perfil/ia"); assert.equal(m.botao, `Configurar o ${nome}`);
  }
  assert.equal(mensagemSemIa(null).botao, "Escolha sua IA");
  assert.equal(mensagemSemIa({ usa: [] }).botao, "Escolha sua IA");
});

test("estado só conector: vira pedido da rotina na IA do conector (Claude e ChatGPT)", () => {
  for (const [ia, acesso, nome] of [["claude", "assinatura", "Claude"], ["chatgpt", "assinatura", "ChatGPT"]] as const) {
    const c = cenario(perfil([ia, acesso]), "ativo", []);
    assert.equal(c.modo, "conector"); assert.deepEqual(c.conector, { id: ia, nome }); assert.equal(c.chave, null);
    assert.equal(destinoEnvio(c.modo), "pedido"); assert.equal(rotuloTopo(c), null);
  }
  // conectado sem ter marcado a IA: nome genérico, sem link
  assert.deepEqual(cenario(perfil(["gemini", "gratis"]), "ativo", []).conector, { id: null, nome: "sua IA" });
});

test("estado só chave: responde na hora pela IA da chave (Gemini e DeepSeek); o topo mostra a IA", () => {
  const g = cenario(perfil(["gemini", "gratis"]), "nenhum", [chave("gemini")]);
  assert.equal(g.modo, "chave"); assert.deepEqual(g.chave, { id: "gemini", nome: "Gemini", provedor: "gemini" });
  assert.equal(destinoEnvio(g.modo), "chave"); assert.equal(rotuloTopo(g), "Gemini · modelo padrão");
  const d = cenario(perfil(["deepseek", "chave"]), "nenhum", [chave("deepseek")]);
  assert.equal(d.chave?.nome, "DeepSeek");
  // chave de um provedor que não está no perfil: o nome do provedor
  assert.equal(cenario(perfil(["gemini", "gratis"]), "nenhum", [chave("openai")]).chave?.nome, "OpenAI");
});

test("estado ambos: o padrão é a chave; o toggle manda para a rotina", () => {
  const c = cenario(perfil(["claude", "assinatura", "chave"]), "ativo", [chave("anthropic")]);
  assert.equal(c.modo, "ambos"); assert.equal(destinoEnvio(c.modo), "chave"); assert.equal(destinoEnvio(c.modo, true), "pedido");
  assert.equal(c.conector?.nome, "Claude"); assert.equal(c.chave?.nome, "Claude");
});

test("rotina de uma IA + chave de outra convivem (e trocar a chave no topo vale só para a conversa)", () => {
  const ia: PerfilIa = { usa: [{ provedor: "claude", acesso: ["assinatura"] }, { provedor: "gemini", acesso: ["gratis"] }], principal: "claude" };
  const ks = [chave("gemini"), chave("openai")];
  const c = cenario(ia, "ativo", ks);
  assert.equal(c.modo, "ambos");
  assert.deepEqual(c.conector, { id: "claude", nome: "Claude" });
  assert.equal(c.chave?.nome, "Gemini"); assert.deepEqual(c.chaves, ["gemini", "openai"]);
  // pedido pendente não bloqueia a conversa: o envio padrão continua sendo a chave
  assert.equal(destinoEnvio(c.modo), "chave");
  const escolhida = caminhoChat(ia, { estado: "ambos" }, ks, "openai");
  assert.equal(escolhida.chave?.provedor, "openai"); assert.equal(escolhida.conector?.nome, "Claude");
  // escolha de uma chave inativa não vale
  assert.equal(caminhoChat(ia, { estado: "ambos" }, [chave("gemini"), chave("openai", false)], "openai").chave?.provedor, "gemini");
});

test("mini prompt: link com o prompt fixo quando a IA aceita; senão bloco com Copiar", () => {
  const cl = miniPrompt({ id: "claude", nome: "Claude" }, "O que treino hoje?");
  assert.ok(cl.url?.startsWith("https://claude.ai/new?q=")); assert.equal(cl.copiar, false);
  assert.equal(decodeURIComponent(cl.url!.split("?q=")[1]), `${MINI_PROMPT} Pedido: "O que treino hoje?"`);
  const gpt = miniPrompt({ id: "chatgpt", nome: "ChatGPT" }, "quero treinar ombro hoje");
  assert.equal(gpt.url, null); assert.equal(gpt.copiar, true); assert.equal(gpt.prompt, MINI_PROMPT);
  assert.equal(miniPrompt({ id: null, nome: "sua IA" }).url, null);
  assert.equal(miniPrompt(null).copiar, true);
});

test("mini prompt (allowlist): texto livre da pessoa nunca vai na URL nem no bloco, com ou sem acento e termo de saúde", () => {
  const ia = { id: "claude" as const, nome: "Claude" };
  const livres = ["quero treinar ombro", "tomo medicação para pressão", "MEDICAÇÃO", "joelho direito dói", "menstruação atrasada",
    "meu peso é 82 kg", "estou grávida", "lesão no ombro", "exame de sangue", "ana@exemplo.test", "CPF 123.456.789-00", "treino ".repeat(40),
    "O que treino hoje? e tomo remédio", "o que treino hoje"];
  for (const t of livres) {
    const m = miniPrompt(ia, t);
    assert.equal(m.prompt, MINI_PROMPT, t);
    assert.equal(decodeURIComponent(m.url!.split("?q=")[1]), MINI_PROMPT, `texto livre na URL: ${t}`);
    assert.ok(!textoFixo(t), t);
  }
  for (const t of ["O que treino hoje?", "Registrar o almoço", "Como foi minha semana?", "  Registrar   o almoço "]) assert.ok(textoFixo(t), t);
});

test("faixa: só pendente/respondido/erro, mais novos primeiro; resumo; aplicar só com proposta", () => {
  const inbox = [
    { id: "a", text: "x", status: "pendente", created_at: 1 },
    { id: "b", text: "y", status: "respondido", created_at: 3, response: "ok", change: { minutes: 30 } },
    { id: "c", text: "z", status: "aplicado", created_at: 4 },
    { id: "d", text: "w", status: "descartado", created_at: 5 },
    { id: "e", text: "v", status: "falhou", created_at: 2 },
  ];
  assert.deepEqual(pedidosDaFaixa(inbox).map((p) => p.id), ["b", "e", "a"]);
  assert.deepEqual(inbox.map((p) => statusPedido(p)), ["aguardando", "respondido", null, null, "erro"]);
  assert.equal(resumoFaixa(1), "1 pedido na rotina"); assert.equal(resumoFaixa(2), "2 pedidos na rotina");
  assert.ok(podeAplicar(inbox[1])); assert.ok(!podeAplicar(inbox[0])); assert.ok(!podeAplicar({ id: "f", text: "", status: "respondido", response: "só texto" }));
  assert.deepEqual(pedidosDaFaixa([]), []);
});

test("composer: Enter envia, Shift+Enter quebra, IME não envia; sugestões fixas", () => {
  assert.ok(enterEnvia({ key: "Enter" }));
  assert.ok(!enterEnvia({ key: "Enter", shiftKey: true }));
  assert.ok(!enterEnvia({ key: "Enter", isComposing: true }));
  assert.ok(!enterEnvia({ key: "a" }));
  assert.deepEqual([...SUGESTOES_CHAT], ["O que treino hoje?", "Registrar o almoço", "Como foi minha semana?"]);
});

test("mensagem e título: limpa controle, recusa vazio/longo; HTML é só texto (não é escapado nem removido aqui)", () => {
  assert.deepEqual(validarMensagem("  oi\u0000 \n"), { ok: true, texto: "oi" });
  assert.equal(validarMensagem("   ").ok, false);
  assert.equal(validarMensagem(42).ok, false);
  assert.equal(validarMensagem("a".repeat(CHAT.textoMax + 1)).ok, false);
  const xss = '<img src=x onerror="alert(1)">';
  assert.deepEqual(validarMensagem(xss), { ok: true, texto: xss });
  assert.equal(tituloConversa("o que   treino\nhoje?"), "o que treino hoje?");
  assert.equal(tituloConversa("a".repeat(200)).length, CHAT.tituloMax);
  assert.equal(tituloConversa(""), "Conversa");
});

test("anexo: só foto ou PDF até 10 MB (tipo errado recusado)", () => {
  assert.deepEqual(validarAnexo({ tipo: "image/jpeg", bytes: 1000 }), { ok: true, anexo: "foto" });
  assert.deepEqual(validarAnexo({ tipo: "application/pdf", bytes: 1000 }), { ok: true, anexo: "pdf" });
  for (const tipo of ["text/html", "image/svg+xml", "application/javascript", "video/mp4", ""]) assert.equal(validarAnexo({ tipo, bytes: 10 }).ok, false, tipo);
  assert.equal(validarAnexo({ tipo: "image/png", bytes: 0 }).ok, false);
  assert.equal(validarAnexo({ tipo: "image/png", bytes: CHAT.anexoMaxBytes + 1 }).ok, false);
});

test("Fale com a IA: o pedido já escrito para cada origem", () => {
  assert.equal(pedidoFale("trocar_exercicio", "Elevação lateral"), "Troque o exercício Elevação lateral de hoje");
  assert.equal(pedidoFale("trocar_exercicio"), "Troque um exercício de hoje");
  for (const o of ["hoje", "treino", "semana", "comida", "diario"] as const) assert.ok(pedidoFale(o).length > 5, o);
});

test("Fale com a IA: link interno para o Chat com o texto (nunca uma IA externa)", () => {
  const h = hrefFale("trocar_exercicio", "Rosca & <b>martelo</b>");
  assert.ok(h.startsWith("#chat?texto="));
  assert.equal(new URLSearchParams(h.split("?")[1]).get("texto"), "Troque o exercício Rosca & <b>martelo</b> de hoje");
  for (const o of ["hoje", "treino", "semana", "comida", "diario"] as const) assert.match(hrefFale(o), /^#chat\?texto=/);
});
