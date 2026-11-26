// #140 Sua IA → Avançado: modelo e esforço por tipo de pedido (gerar semana, revisar treino, comida, pedidos da rotina).
// Validado no core (a mesma regra do app, do PUT /api/profile e do Chat). Valor fora da lista é rejeitado. Dados fictícios.
import { test } from "node:test";
import assert from "node:assert/strict";
import { TIPOS_PEDIDO_IA, ROTULO_PEDIDO_IA, validarPrefPedidoIa, validarPrefsPedidosIa } from "../src/ia-pedidos.ts";
import { applyProfilePatch, normalizeProfile, validateProfilePatch, DEFAULT_PROFILE } from "../src/perfil.ts";
import { miniPrompt } from "../src/chat.ts";
import { PROVEDORES_IA_APP } from "../src/ia.ts";

test("os 4 tipos de pedido têm rótulo e descrição em pt-BR", () => {
  assert.deepEqual([...TIPOS_PEDIDO_IA], ["gerar_semana", "revisar_treino", "comida", "pedidos_rotina"]);
  for (const t of TIPOS_PEDIDO_IA) assert.ok(ROTULO_PEDIDO_IA[t].nm.length > 2 && ROTULO_PEDIDO_IA[t].desc.length > 5, t);
});

test("preferência válida: modelo da lista do provedor + esforço; só esforço; só provedor com esforço", () => {
  assert.deepEqual(validarPrefPedidoIa({ provedor: "gemini", modelo: "gemini-2.5-flash", esforco: "alto" }), { ok: true, valor: { provedor: "gemini", modelo: "gemini-2.5-flash", esforco: "alto" } });
  assert.deepEqual(validarPrefPedidoIa({ esforco: "baixo" }), { ok: true, valor: { esforco: "baixo" } });
  assert.deepEqual(validarPrefPedidoIa({ provedor: "anthropic", modelo: "claude-sonnet-4-6" }), { ok: true, valor: { provedor: "anthropic", modelo: "claude-sonnet-4-6" } });
});

test("rejeita: modelo fora da lista permitida, esforço inválido, modelo sem provedor, vazio, campo extra, tipos errados", () => {
  const ruins: unknown[] = [
    { provedor: "gemini", modelo: "gpt-5" },                 // modelo de outro provedor
    { provedor: "openai", modelo: "text-embedding-3-large" }, // fora da allowlist
    { provedor: "gemini", modelo: "x".repeat(200) },
    { provedor: "gemini", modelo: "gemini-2.5-flash", esforco: "maximo" },
    { esforco: "ALTO" }, { esforco: 3 }, { esforco: null },
    { modelo: "gemini-2.5-flash" },                            // sem provedor
    { provedor: "groq", modelo: "gemini-2.5-flash" },          // provedor fora do cofre
    {}, { provedor: "gemini" },                                // nada para guardar
    { esforco: "alto", url: "https://exemplo.test" },          // campo desconhecido
    null, "gemini", [], 7,
  ];
  for (const r of ruins) assert.equal(validarPrefPedidoIa(r).ok, false, JSON.stringify(r));
});

test("com a lista da chave (#88): só vale modelo que a chave acessa", () => {
  const lista = { gemini: ["gemini-2.5-flash", "gemini-2.5-pro"] };
  assert.equal(validarPrefPedidoIa({ provedor: "gemini", modelo: "gemini-2.5-pro" }, lista).ok, true);
  assert.equal(validarPrefPedidoIa({ provedor: "gemini", modelo: "gemini-3-flash-preview" }, lista).ok, false, "permitido pelo app, mas a chave não acessa");
  assert.equal(validarPrefPedidoIa({ provedor: "openai", modelo: "gpt-5-mini" }, lista).ok, false, "sem chave desse provedor");
});

test("mapa por tipo: tipo desconhecido e valor ruim recusam tudo; erro nunca devolve o texto cru inteiro", () => {
  const ok = validarPrefsPedidosIa({ gerar_semana: { provedor: "gemini", modelo: "gemini-2.5-pro", esforco: "alto" }, comida: { esforco: "baixo" } });
  assert.equal(ok.ok, true);
  assert.equal(validarPrefsPedidosIa({ voo: { esforco: "baixo" } }).ok, false);
  const ruim = validarPrefsPedidosIa({ comida: { provedor: "gemini", modelo: "<script>alert(1)</script>".repeat(10) } });
  assert.equal(ruim.ok, false);
  if (!ruim.ok) assert.ok(ruim.erros.every((e) => e.length < 120 && !e.includes("<script>")), ruim.erros.join("|"));
});

test("perfil: iaPedidos entra pelo mesmo caminho do app e do Chat; null apaga um tipo; sobrescreve só o tipo enviado", () => {
  const a = applyProfilePatch(DEFAULT_PROFILE, { iaPedidos: { gerar_semana: { provedor: "anthropic", modelo: "claude-opus-4-6", esforco: "alto" } } });
  assert.equal(a.ok, true);
  if (!a.ok) return;
  const b = applyProfilePatch(a.profile, { iaPedidos: { comida: { esforco: "baixo" } } });
  assert.equal(b.ok, true);
  if (!b.ok) return;
  assert.deepEqual(Object.keys((b.profile as any).iaPedidos).sort(), ["comida", "gerar_semana"]);
  const c = applyProfilePatch(b.profile, { iaPedidos: { gerar_semana: null } });
  assert.equal(c.ok, true);
  if (c.ok) assert.deepEqual(Object.keys((c.profile as any).iaPedidos), ["comida"]);
});

test("perfil: valor fora da lista é rejeitado e o campo aparece na mensagem humana", () => {
  for (const iaPedidos of [{ gerar_semana: { provedor: "gemini", modelo: "gpt-5" } }, { comida: { esforco: "turbo" } }, { desconhecido: { esforco: "baixo" } }, "x", []]) {
    const r = validateProfilePatch({ iaPedidos });
    assert.equal(r.ok, false, JSON.stringify(iaPedidos));
    if (!r.ok) assert.deepEqual(r.campos, ["iaPedidos"]);
  }
});

test("normalizeProfile: perfil guardado com valor inválido em iaPedidos descarta só esse tipo", () => {
  const n = normalizeProfile({ iaPedidos: { gerar_semana: { esforco: "baixo" }, comida: { esforco: "turbo" } } });
  assert.deepEqual(n.iaPedidos, { gerar_semana: { esforco: "baixo" } });
});

test("#140 'Abrir no app': IA que não aceita o pedido na URL abre o app (sem o pedido); a que aceita segue com o link do pedido", () => {
  const gpt = miniPrompt({ id: "chatgpt", nome: "ChatGPT" }, "quero treinar ombro hoje");
  assert.equal(gpt.url, null); assert.equal(gpt.copiar, true);
  assert.equal(gpt.app, PROVEDORES_IA_APP.chatgpt.abrir!.url);
  assert.ok(gpt.app!.startsWith("https://") && !gpt.app!.includes("?"), "o app abre limpo: nada do usuário na URL");
  const claude = miniPrompt({ id: "claude", nome: "Claude" });
  assert.ok(claude.url); assert.equal(claude.app, null);
  const generico = miniPrompt(null);
  assert.equal(generico.url, null); assert.equal(generico.app, null, "sem saber a IA, não inventa link");
});
