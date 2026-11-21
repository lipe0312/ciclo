// #133 Sua IA: a tabela de caminhos (uma asserção por célula), estadoIA e os 13 casos de uso da issue.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AVISO_DISPENSA_MS, IA_IDS, PROVEDORES_IA_APP, assinaturaIa, caminhos, estadoConector, estadoIA, linkAbrirIa, mostrarAvisoIa,
  principalIa, resumoCaminho, validarPerfilIa, PROVEDORES_IA, HOST_PROVEDOR, hostPermitido,
} from "../src/index.ts";
import { GUIAS_IA, sugerirOutras } from "../src/ia-guias.ts";
import type { AcessoIa, ChaveResumo, IaId, PerfilIa } from "../src/index.ts";

const um = (provedor: IaId, ...acesso: AcessoIa[]): PerfilIa => ({ usa: [{ provedor, acesso }], principal: provedor });
const so = (ia: PerfilIa) => caminhos(ia).map((p) => [p.ia, p.caminho, p.provedorChave ?? null, !!p.gratis]);
const NOW = Date.UTC(2026, 10, 21);
const tok = (o: Partial<{ createdAt: number; lastUsedAt: number | null; revokedAt: number | null }> = {}) => ({ createdAt: NOW - 86_400_000, lastUsedAt: null, revokedAt: null, ...o });
const chave = (provedor: ChaveResumo["provedor"], ativo = true): ChaveResumo => ({ provedor, ativo });

// ---------- a tabela, célula por célula ----------
const TABELA: [IaId, AcessoIa, [string, string, string | null, boolean][]][] = [
  ["claude", "assinatura", [["claude", "conector", null, false]]],
  ["claude", "gratis", [["claude", "conector", null, false]]],
  ["claude", "chave", [["claude", "chave", "anthropic", false]]],
  ["chatgpt", "assinatura", [["chatgpt", "conector", null, false]]],
  ["chatgpt", "gratis", [["chatgpt", "sugerir_alternativa", null, false], ["alternativa", "conector", null, false]]],
  ["chatgpt", "chave", [["chatgpt", "chave", "openai", false]]],
  ["gemini", "assinatura", [["gemini", "chave", "gemini", true]]],
  ["gemini", "gratis", [["gemini", "chave", "gemini", true]]],
  ["gemini", "chave", [["gemini", "chave", "gemini", false]]],
  ["deepseek", "assinatura", [["deepseek", "chave", "deepseek", false]]],
  ["deepseek", "gratis", [["deepseek", "chave", "openrouter", true]]],
  ["deepseek", "chave", [["deepseek", "chave", "deepseek", false]]],
  ["outra", "assinatura", [["outra", "sugerir_alternativa", null, false], ["alternativa", "conector", null, false]]],
  ["outra", "gratis", [["outra", "sugerir_alternativa", null, false], ["alternativa", "conector", null, false]]],
  ["outra", "chave", [["outra", "chave", "openrouter", false]]],
];
for (const [ia, acesso, esperado] of TABELA) {
  test(`tabela: ${ia} · ${acesso}`, () => assert.deepEqual(so(um(ia, acesso)), esperado));
}

test("tabela: assinatura do Claude traz a rotina; grátis não; o conector do ChatGPT é beta", () => {
  assert.equal(caminhos(um("claude", "assinatura"))[0].rotina, true);
  assert.equal(caminhos(um("claude", "gratis"))[0].rotina, undefined);
  assert.equal(caminhos(um("chatgpt", "assinatura"))[0].beta, true);
});

test("tabela: \"Não sei\" escolhe o caminho mais simples de cada IA", () => {
  assert.deepEqual(so(um("claude", "nao_sei")), [["claude", "conector", null, false]]);
  assert.deepEqual(so(um("gemini", "nao_sei")), [["gemini", "chave", "gemini", true]]);
  assert.deepEqual(so(um("deepseek", "nao_sei")), [["deepseek", "chave", "openrouter", true]]);
  assert.deepEqual(so(um("chatgpt", "nao_sei")).at(-1), ["alternativa", "conector", null, false]);
  assert.deepEqual(so(um("claude")), so(um("claude", "nao_sei")), "sem acesso marcado = não sei");
});

test("dado: toda IA tem as 3 células, guia existente, link https oficial e nenhum link marcado como conferido sem data", () => {
  for (const id of IA_IDS) {
    const info = PROVEDORES_IA_APP[id];
    for (const a of ["assinatura", "gratis", "chave"] as const) {
      const c = info.celulas[a];
      assert.ok(GUIAS_IA[c.guia], `${id}.${a}: guia ${c.guia}`);
      if (c.caminho === "chave") assert.ok(c.provedorChave && PROVEDORES_IA.includes(c.provedorChave), `${id}.${a}: provedor do cofre`);
    }
  }
  for (const [id, g] of Object.entries(GUIAS_IA)) {
    assert.ok(g.passos.length >= 2 && g.passos.length <= 4, `${id}: passos curtos`);
    assert.ok(g.links.length >= 1, `${id}: link oficial no dado`);
    for (const l of g.links) { assert.match(l.url, /^https:\/\//); assert.ok(l.conferidoEm === null || /^\d{4}-\d{2}-\d{2}$/.test(l.conferidoEm)); }
    if (g.cofre) assert.ok(PROVEDORES_IA.includes(g.cofre));
  }
});

// ---------- validação ----------
test("validarPerfilIa: aceita o formato da issue, preenche a principal única e recusa o resto", () => {
  const ok = validarPerfilIa({ usa: [{ provedor: "claude", acesso: ["gratis"] }, { provedor: "gemini", acesso: ["chave"] }], principal: "gemini" });
  assert.deepEqual(ok, { ok: true, valor: { usa: [{ provedor: "claude", acesso: ["gratis"] }, { provedor: "gemini", acesso: ["chave"] }], principal: "gemini" } });
  assert.deepEqual(validarPerfilIa({ usa: [{ provedor: "claude", acesso: [] }] }), { ok: true, valor: { usa: [{ provedor: "claude", acesso: [] }], principal: "claude" } });
  assert.deepEqual(validarPerfilIa({ usa: [], testarGratis: true }), { ok: true, valor: { usa: [], principal: null, testarGratis: true } });
  assert.deepEqual(validarPerfilIa({ usa: [{ provedor: "outra", acesso: ["gratis"], nome: "  Kimi  " }] }).ok && true, true);
  for (const v of [null, [], { usa: "x" }, { usa: [{ provedor: "xai", acesso: [] }] }, { usa: [{ provedor: "claude", acesso: ["pix"] }] },
    { usa: [{ provedor: "claude", acesso: [] }, { provedor: "claude", acesso: [] }] }, { usa: [{ provedor: "claude", acesso: [] }], principal: "gemini" },
    { usa: [{ provedor: "claude", acesso: [] }], testarGratis: true }, { usa: [{ provedor: "outra", acesso: [], nome: "<script>" }] },
    { usa: [{ provedor: "claude", acesso: [], nome: "x" }] }, { usa: [], extra: 1 }]) {
    assert.equal(validarPerfilIa(v).ok, false, JSON.stringify(v));
  }
});

test("autocomplete de Outras: começa com primeiro, sem acento, aceita vazio", () => {
  assert.equal(sugerirOutras("k")[0], "Kimi");
  assert.ok(sugerirOutras("chat").includes("Mistral Le Chat"));
  assert.ok(sugerirOutras("").length > 3);
  assert.deepEqual(sugerirOutras("zzz"), []);
});

test("estadoConector: ativo (usado), pendente (sem uso), expirado (só vencidas), nenhum; revogada não conta", () => {
  assert.equal(estadoConector([], NOW), "nenhum");
  assert.equal(estadoConector([tok({ lastUsedAt: NOW - 1000 })], NOW), "ativo");
  assert.equal(estadoConector([tok()], NOW), "pendente");
  assert.equal(estadoConector([tok({ createdAt: NOW - 200 * 86_400_000, lastUsedAt: NOW - 100 * 86_400_000 })], NOW), "expirado");
  assert.equal(estadoConector([tok({ revokedAt: NOW - 1 })], NOW), "nenhum");
});

test("cofre: os hosts novos entram na allowlist, só https e sem URL do usuário", () => {
  assert.equal(HOST_PROVEDOR.openrouter, "openrouter.ai");
  assert.equal(HOST_PROVEDOR.deepseek, "api.deepseek.com");
  assert.ok(hostPermitido("https://openrouter.ai/api/v1/key"));
  assert.ok(hostPermitido("https://api.deepseek.com/models"));
  for (const u of ["http://openrouter.ai/x", "https://evil.openrouter.ai/x", "https://api.deepseek.com.evil.io/", "https://u:p@api.deepseek.com/"]) assert.equal(hostPermitido(u), false, u);
});

// ---------- os 13 casos de uso ----------
test("caso 1: não usa IA, quer testar → Claude grátis (conector) → teste → \"Abrir no Claude\" com o pedido pronto", () => {
  const ia: PerfilIa = { usa: [], testarGratis: true };
  const [p] = caminhos(ia);
  assert.equal(p.ia, "alternativa"); assert.equal(p.caminho, "conector"); assert.equal(GUIAS_IA[p.guia].teste, true);
  assert.match(estadoIA(ia, "nenhum", []).aviso!.texto, /Claude/);
  assert.equal(estadoIA(ia, "ativo", []).aviso, null, "conectado: sem aviso");
  assert.match(linkAbrirIa(p.ia, "qual o treino de hoje?")!, /^https:\/\/claude\.ai\/new\?q=qual%20o/);
});

test("caso 2: não usa IA e segue sem → algoritmo, sem caminho e sem aviso", () => {
  const ia: PerfilIa = { usa: [], testarGratis: false };
  assert.deepEqual(caminhos(ia), []);
  assert.equal(estadoIA(ia, "nenhum", []).estado, "nenhum");
  assert.equal(estadoIA(ia, "nenhum", []).aviso, null);
  assert.match(resumoCaminho(ia), /sem IA/);
});

test("caso 3: Claude grátis ou assinatura → guia detalhado do conector; assinatura mostra a rotina", () => {
  for (const a of ["gratis", "assinatura"] as const) {
    const [p] = caminhos(um("claude", a));
    assert.equal(p.guia, "claude_conector"); assert.equal(PROVEDORES_IA_APP.claude.guia, "detalhado");
    assert.equal(!!p.rotina, a === "assinatura");
    assert.equal(estadoIA(um("claude", a), "nenhum", []).aviso!.texto, "Conecte o Ciclo ao seu Claude (1 min)");
  }
  assert.equal(caminhos({ usa: [{ provedor: "claude", acesso: ["gratis", "assinatura"] }] }).length, 1, "grátis + assinatura: um conector só");
  assert.equal(caminhos({ usa: [{ provedor: "claude", acesso: ["gratis", "assinatura"] }] })[0].rotina, true);
});

test("caso 4: ChatGPT pago → modo desenvolvedor (beta), com a alternativa do Claude grátis no guia de \"não apareceu\"", () => {
  const [p] = caminhos(um("chatgpt", "assinatura"));
  assert.equal(p.guia, "chatgpt_conector"); assert.equal(p.beta, true);
  assert.match(GUIAS_IA.alternativa.passos[0], /mesmo e-mail/);
});

test("caso 5: ChatGPT grátis → diz que não aceita conector e recomenda UMA alternativa (Claude grátis), nunca um guia que não funciona", () => {
  const cs = caminhos(um("chatgpt", "gratis"));
  assert.ok(!cs.some((p) => p.guia === "chatgpt_conector"));
  assert.match(cs[0].resumo, /não aceita conector/);
  assert.equal(cs.filter((p) => p.ia === "alternativa").length, 1);
  assert.match(estadoIA(um("chatgpt", "gratis"), "nenhum", []).aviso!.texto, /Teste grátis/);
});

test("caso 6: Gemini (qualquer plano) → chave grátis do AI Studio; com a chave ativa, sem pendência", () => {
  for (const a of ["assinatura", "gratis", "nao_sei"] as const) {
    const ia = um("gemini", a);
    assert.equal(caminhos(ia)[0].guia, "gemini_chave_gratis");
    assert.equal(estadoIA(ia, "nenhum", []).aviso!.texto, "Pegue sua chave grátis do Gemini (2 min)");
    const e = estadoIA(ia, "nenhum", [chave("gemini")]);
    assert.equal(e.estado, "chave"); assert.deepEqual(e.pendencias, []); assert.equal(e.aviso, null);
  }
  assert.match(GUIAS_IA.gemini_chave_gratis.links[0].url, /^https:\/\/aistudio\.google\.com\//);
  assert.equal(resumoCaminho(um("gemini", "gratis")), "Seu caminho: chave grátis do Gemini no Chat do Ciclo · 2 min");
});

test("caso 7: DeepSeek → chave DeepSeek, ou OpenRouter com modelo grátis", () => {
  assert.equal(caminhos(um("deepseek", "chave"))[0].provedorChave, "deepseek");
  const g = caminhos(um("deepseek", "gratis"))[0];
  assert.equal(g.provedorChave, "openrouter"); assert.equal(g.guia, "openrouter_gratis");
  assert.equal(estadoIA(um("deepseek", "gratis"), "nenhum", []).aviso!.texto, "Pegue sua chave grátis do OpenRouter (3 min)");
  assert.equal(estadoIA(um("deepseek", "gratis"), "nenhum", [chave("openrouter")]).aviso, null);
});

test("caso 8: Outras (Kimi) → guia genérico das 3 perguntas → OpenRouter ou alternativa grátis", () => {
  const ia: PerfilIa = { usa: [{ provedor: "outra", acesso: ["gratis"], nome: "Kimi" }], principal: "outra" };
  const cs = caminhos(ia);
  assert.equal(cs[0].guia, "generico"); assert.equal(cs[0].nomeIa, "Kimi");
  assert.equal(GUIAS_IA.generico.passos.length, 3);
  assert.match(GUIAS_IA.generico.passos[1], /OpenRouter/);
  assert.equal(cs.at(-1)!.ia, "alternativa");
  assert.match(estadoIA(ia, "nenhum", []).aviso!.texto, /Kimi/);
});

test("caso 9: Claude assinatura + Gemini chave, principal Gemini → Gemini primeiro, Claude segue; um não bloqueia o outro", () => {
  const ia: PerfilIa = { usa: [{ provedor: "claude", acesso: ["assinatura"] }, { provedor: "gemini", acesso: ["chave"] }], principal: "gemini" };
  const cs = caminhos(ia);
  assert.deepEqual(cs.map((p) => [p.ia, p.principal]), [["gemini", true], ["claude", false]]);
  assert.equal(cs[1].rotina, true, "a rotina da caixa segue no Claude");
  const so1 = estadoIA(ia, "nenhum", [chave("gemini")]);
  assert.equal(so1.estado, "chave"); assert.deepEqual(so1.pendencias.map((p) => p.ia), ["claude"]);
  const ambos = estadoIA(ia, "ativo", [chave("gemini")]);
  assert.equal(ambos.estado, "ambos"); assert.equal(ambos.aviso, null);
  assert.equal(ambos.conectorNaoPrincipal, true, "o conector é do Claude, a principal é o Gemini");
});

test("caso 10: trocou Claude → Gemini → guia e aviso mudam; a conexão do Claude continua, marcada como não principal", () => {
  const antes = estadoIA(um("claude", "assinatura"), "ativo", []);
  assert.equal(antes.aviso, null); assert.equal(antes.conectorNaoPrincipal, false);
  const depois = estadoIA(um("gemini", "gratis"), "ativo", []);
  assert.equal(depois.estado, "conector", "nada apagado");
  assert.equal(depois.conectorNaoPrincipal, true);
  assert.match(depois.aviso!.texto, /Gemini/);
  assert.notEqual(assinaturaIa(um("claude", "assinatura")), assinaturaIa(um("gemini", "gratis")));
});

test("caso 11: conector expirou → aviso \"reconectar\"", () => {
  const e = estadoIA(um("claude", "assinatura"), "expirado", []);
  assert.equal(e.aviso!.id, "expirou"); assert.equal(e.aviso!.texto, "Sua conexão expirou: reconectar");
  assert.notEqual(estadoIA(um("gemini", "gratis"), "expirado", []).aviso!.id, "expirou", "quem usa chave não recebe o aviso do conector");
});

test("caso 12: pulou as 2 telas → \"Escolha sua IA\" levando a Perfil → Sua IA", () => {
  const e = estadoIA(undefined, "nenhum", []);
  assert.deepEqual([e.aviso!.texto, e.aviso!.href], ["Escolha sua IA", "#perfil/ia"]);
  assert.equal(principalIa(undefined), null);
});

test("caso 13 (parcial): chave com a pessoa → nenhuma pendência; revelar para copiar fica para a emenda do ADR-0015", () => {
  assert.deepEqual(estadoIA(um("claude", "chave"), "nenhum", [chave("anthropic")]).pendencias, []);
  assert.equal(estadoIA(um("claude", "chave"), "nenhum", [chave("anthropic", false)]).pendencias.length, 1, "chave desativada não conta");
});

test("aviso: dispensa vale 7 dias para o mesmo aviso e o mesmo perfil; volta na hora quando o perfil muda", () => {
  const a = estadoIA(um("claude", "gratis"), "nenhum", []).aviso!;
  const d = { id: a.id, chave: a.chave, em: NOW };
  assert.equal(mostrarAvisoIa(a, null, NOW), true);
  assert.equal(mostrarAvisoIa(a, d, NOW + 1000), false);
  assert.equal(mostrarAvisoIa(a, d, NOW + AVISO_DISPENSA_MS + 1), true, "7 dias depois volta");
  const b = estadoIA(um("claude", "assinatura"), "nenhum", []).aviso!;
  assert.equal(b.id, a.id); assert.equal(mostrarAvisoIa(b, d, NOW + 1000), true, "perfil mudou: volta");
  assert.equal(mostrarAvisoIa(null, null, NOW), false);
});
