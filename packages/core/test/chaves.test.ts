// #88 Chaves de API próprias (BYOK): formato, apelido, envelope AES-256-GCM (DEK por chave, KEK versionada, AAD),
// allowlist de modelos e o mapeamento de esforço por provedor, teto de gasto e a prioridade da chave da pessoa.
// Tudo fictício: as chaves de teste são montadas aqui (o repositório não guarda nada com cara de chave real).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CHAVE_TETO_MAX_USD, aadChave, cabeNoTetoIa, cifrarChave, classificarModelo, custoIaUsd, decifrarChave, fonteOpenai, hostPermitido,
  impressaoChave, importarKek, kekAtual, lerKeks, lerListaModelos, mensagemErroProvedor, modeloPadrao, parametrosModelo, pedidoListarModelos,
  filtrarModelos, ultimos4, validarApelido, validarChaveFormato, validarTetos,
} from "../src/chaves.ts";

const KEK_B64 = Buffer.alloc(32, 7).toString("base64");
const KEK2_B64 = Buffer.alloc(32, 9).toString("base64");
export const CANARIO = "sk-" + "test-CANARIO-" + "0123456789abcdefABCDEF";
const GEMINI = "AI" + "za" + "C".repeat(35);
const ANT = "sk-" + "ant-api03-" + "x".repeat(40);

test("formato: aceita os três provedores, apara espaço colado, recusa o resto sem ecoar a chave", () => {
  assert.deepEqual(validarChaveFormato("openai", `  ${CANARIO}\n`), { ok: true, chave: CANARIO });
  assert.equal(validarChaveFormato("anthropic", ANT).ok, true);
  assert.equal(validarChaveFormato("gemini", GEMINI).ok, true);
  for (const [p, k] of [["anthropic", CANARIO], ["openai", ANT], ["gemini", CANARIO], ["openai", "sk-curta"], ["openai", CANARIO + " x"], ["openai", CANARIO + "<"], ["openai", 42], ["xai", CANARIO]] as const) {
    const r = validarChaveFormato(p as never, k);
    assert.equal(r.ok, false, `${p} ${String(k).slice(0, 12)}`);
    if (!r.ok) assert.ok(!r.erro.includes("CANARIO") && !r.erro.includes("sk-"), "erro nunca ecoa a chave");
  }
  assert.equal(ultimos4(CANARIO), "CDEF");
});

test("impressão: HMAC-SHA256 curta (12 hex) com chave derivada da KEK, por conta; não é o SHA-256 público da chave", async () => {
  const a = await impressaoChave(KEK_B64, "u1", CANARIO);
  assert.match(a, /^[0-9a-f]{12}$/); assert.equal(a, await impressaoChave(KEK_B64, "u1", CANARIO), "estável");
  assert.notEqual(a, await impressaoChave(KEK_B64, "u1", ANT), "outra chave");
  assert.notEqual(a, await impressaoChave(KEK_B64, "u2", CANARIO), "mesma chave em outra conta não correlaciona");
  assert.notEqual(a, await impressaoChave(KEK2_B64, "u1", CANARIO), "depende da KEK");
  const sha = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(CANARIO))).toString("hex").slice(0, 12);
  assert.notEqual(a, sha, "sem a KEK ninguém confere uma chave conhecida contra a impressão");
});

test("apelido: 1 a 40, sem controle, espaço normalizado; < e > recusados (XSS); aspas e ponto e vírgula passam (vai por bind)", () => {
  assert.deepEqual(validarApelido("  Minha   chave\u0007 "), { ok: true, valor: "Minha chave" });
  assert.deepEqual(validarApelido("x'); DROP TABLE chave_ia;--"), { ok: true, valor: "x'); DROP TABLE chave_ia;--" });
  for (const v of ["", "   ", "a".repeat(41), "<img src=x onerror=alert(1)>", "oi>", 7, null]) assert.equal(validarApelido(v).ok, false, String(v));
});

test("KEK: só KEK_V1..KEK_V9 com 32 bytes; a atual é a maior versão; nada → cofre desligado", async () => {
  assert.equal(kekAtual(lerKeks({})), null);
  const ks = lerKeks({ KEK_V1: KEK_B64, KEK_V2: KEK2_B64, KEK_V10: KEK_B64, KEK_X: KEK_B64, OUTRA: "x" });
  assert.deepEqual([...ks.keys()].sort(), [1, 2]);
  assert.equal(kekAtual(ks)?.versao, 2);
  assert.equal(kekAtual(lerKeks({ KEK_V1: "curta" })), null, "KEK inválida é ignorada (falha fechada)");
  await assert.rejects(importarKek(Buffer.alloc(16).toString("base64")));
});

test("envelope: cifra e decifra ida e volta; IV e DEK únicos; o ciphertext não contém a chave", async () => {
  const kek = await importarKek(KEK_B64), aad = aadChave("u1", "openai", "k1");
  const e1 = await cifrarChave(kek, 1, aad, CANARIO), e2 = await cifrarChave(kek, 1, aad, CANARIO);
  assert.equal(await decifrarChave(kek, e1, aad), CANARIO);
  assert.equal(await decifrarChave(kek, e2, aad), CANARIO);
  assert.notEqual(e1.iv, e2.iv, "IV único por cifra");
  assert.notEqual(e1.ciphertext, e2.ciphertext); assert.notEqual(e1.dekCifrada, e2.dekCifrada, "DEK aleatória por chave");
  assert.equal(Buffer.from(e1.iv, "base64").length, 12);
  const ivs = new Set<string>();
  for (let i = 0; i < 50; i++) ivs.add((await cifrarChave(kek, 1, aad, "sk-" + "y".repeat(30))).iv);
  assert.equal(ivs.size, 50);
  const blob = JSON.stringify(e1);
  assert.ok(!blob.includes("CANARIO") && !blob.includes(Buffer.from(CANARIO).toString("base64")));
  assert.equal(e1.kekVersao, 1);
});

test("AAD: blob copiado para outra conta, outro provedor ou outra linha não decifra; KEK errada também não", async () => {
  const kek = await importarKek(KEK_B64), e = await cifrarChave(kek, 1, aadChave("u1", "openai", "k1"), CANARIO);
  for (const aad of [aadChave("u2", "openai", "k1"), aadChave("u1", "anthropic", "k1"), aadChave("u1", "openai", "k2")]) {
    await assert.rejects(decifrarChave(kek, e, aad), aad);
  }
  await assert.rejects(decifrarChave(await importarKek(KEK2_B64), e, aadChave("u1", "openai", "k1")));
  // trocar a DEK de duas linhas (mesma conta) também não decifra
  const f = await cifrarChave(kek, 1, aadChave("u1", "openai", "k2"), CANARIO);
  await assert.rejects(decifrarChave(kek, { ...e, dekCifrada: f.dekCifrada }, aadChave("u1", "openai", "k1")));
  // adulterar 1 byte do ciphertext → falha (GCM autentica)
  const ct = Buffer.from(e.ciphertext, "base64"); ct[0] ^= 1;
  await assert.rejects(decifrarChave(kek, { ...e, ciphertext: ct.toString("base64") }, aadChave("u1", "openai", "k1")));
});

test("hosts de saída: só os três provedores, só https", () => {
  for (const u of ["https://api.anthropic.com/v1/models", "https://api.openai.com/v1/chat/completions", "https://generativelanguage.googleapis.com/v1beta/models"]) assert.ok(hostPermitido(u), u);
  for (const u of ["http://api.openai.com/v1/models", "https://api.openai.com.evil.com/", "https://evil.com/?h=api.openai.com", "https://gateway.ai.cloudflare.com/", "nada"]) assert.ok(!hostPermitido(u), u);
});

test("listar modelos: a chave vai só em cabeçalho (nunca na URL) e cada provedor tem o seu", () => {
  for (const p of ["anthropic", "openai", "gemini"] as const) {
    const r = pedidoListarModelos(p, CANARIO);
    assert.ok(hostPermitido(r.url)); assert.ok(!r.url.includes("CANARIO"), "chave fora da URL");
    assert.ok(Object.values(r.headers).some((v) => v.includes(CANARIO)));
  }
  assert.equal(pedidoListarModelos("anthropic", "k").headers["anthropic-version"], "2023-06-01");
  assert.equal(pedidoListarModelos("gemini", "k").headers["x-goog-api-key"], "k");
  assert.deepEqual(lerListaModelos("openai", { data: [{ id: "gpt-4.1-mini" }, { id: 3 }, null] }), ["gpt-4.1-mini"]);
  assert.deepEqual(lerListaModelos("gemini", { models: [{ name: "models/gemini-2.5-flash" }] }), ["gemini-2.5-flash"]);
  assert.deepEqual(lerListaModelos("anthropic", "lixo"), []);
});

test("allowlist de modelos: Haiku/Sonnet/Opus ≥ 4.5, GPT e o-series de texto, Gemini 2.5/3; o resto fica de fora", () => {
  const ant = filtrarModelos("anthropic", ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-4-5-20251001", "claude-3-5-sonnet-20241022", "claude-sonnet-4-20250514", "claude-opus-5-5", "x"]);
  assert.deepEqual(ant.map((m) => m.id), ["claude-haiku-4-5-20251001", "claude-sonnet-5-5", "claude-opus-5-5"], "ordem Haiku → Sonnet → Opus, sem repetir");
  assert.deepEqual(ant.map((m) => m.familia), ["Haiku", "Sonnet", "Opus"]);
  const oa = filtrarModelos("openai", ["gpt-4.1-mini", "gpt-5", "o4-mini", "gpt-4o-audio-preview", "dall-e-3", "text-embedding-3-small", "gpt-5-mini-2025-08-07", "gpt-4o-realtime-preview"]);
  assert.deepEqual(oa.map((m) => m.id).sort(), ["gpt-4.1-mini", "gpt-5", "gpt-5-mini-2025-08-07", "o4-mini"]);
  const ge = filtrarModelos("gemini", ["gemini-2.5-flash", "gemini-3-pro-preview", "gemini-1.5-pro", "embedding-001", "gemini-2.5-flash-lite"]);
  assert.deepEqual(ge.map((m) => m.id).sort(), ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-3-pro-preview"]);
  assert.equal(classificarModelo("openai", "gpt-5;rm"), null);
  assert.equal(modeloPadrao("anthropic", ant.map((m) => m.id)), "claude-sonnet-5-5", "padrão: o do meio (Sonnet)");
  assert.equal(modeloPadrao("openai", []), null);
});

test("esforço → raciocínio por provedor (Claude adaptive/effort/budget, OpenAI reasoning_effort, Gemini budget/level)", () => {
  // Claude 4.6+ e 5.x: thinking adaptive + output_config.effort; sem temperatura
  assert.deepEqual(parametrosModelo("anthropic", "claude-opus-5-5", "baixo", 800), { model: "claude-opus-5-5", max_tokens: 800, thinking: { type: "adaptive" }, output_config: { effort: "low" } });
  assert.deepEqual(parametrosModelo("anthropic", "claude-sonnet-5-5", "alto", 800).output_config, { effort: "high" });
  assert.deepEqual(parametrosModelo("anthropic", "claude-sonnet-4-6", "medio", 800).output_config, { effort: "medium" });
  // Opus 4.5: effort sem adaptive; Haiku 4.5: budget_tokens < max_tokens
  assert.deepEqual(parametrosModelo("anthropic", "claude-opus-4-5", "medio", 800), { model: "claude-opus-4-5", max_tokens: 800, output_config: { effort: "medium" } });
  const h = parametrosModelo("anthropic", "claude-haiku-4-5", "alto", 800) as { max_tokens: number; thinking: { budget_tokens: number } };
  assert.equal(h.thinking.budget_tokens, 16000); assert.ok(h.max_tokens > h.thinking.budget_tokens);
  assert.equal((parametrosModelo("anthropic", "claude-haiku-4-5", "baixo", 800) as { thinking: { budget_tokens: number } }).thinking.budget_tokens, 1024);
  // OpenAI: o-series/gpt-5 com reasoning_effort (tokens de raciocínio contam na saída); gpt-4.x sem esforço e com temperatura
  assert.deepEqual(parametrosModelo("openai", "gpt-5-mini", "baixo", 800), { model: "gpt-5-mini", max_completion_tokens: 1824, reasoning_effort: "low" });
  assert.equal((parametrosModelo("openai", "o4-mini", "alto", 800) as { reasoning_effort: string }).reasoning_effort, "high");
  assert.deepEqual(parametrosModelo("openai", "gpt-4.1-mini", "alto", 800), { model: "gpt-4.1-mini", max_completion_tokens: 800, temperature: 0.3 });
  // Gemini 2.5: thinkingBudget; Gemini 3: thinkingLevel (Pro só low/high)
  assert.deepEqual(parametrosModelo("gemini", "gemini-2.5-flash", "medio", 800), { generationConfig: { maxOutputTokens: 4896, thinkingConfig: { thinkingBudget: 4096 } } });
  assert.deepEqual((parametrosModelo("gemini", "gemini-3-flash-preview", "medio", 800) as any).generationConfig.thinkingConfig, { thinkingLevel: "medium" });
  assert.deepEqual((parametrosModelo("gemini", "gemini-3-pro-preview", "medio", 800) as any).generationConfig.thinkingConfig, { thinkingLevel: "high" });
  assert.deepEqual((parametrosModelo("gemini", "gemini-3-pro-preview", "baixo", 800) as any).generationConfig.thinkingConfig, { thinkingLevel: "low" });
  assert.throws(() => parametrosModelo("openai", "dall-e-3", "baixo", 800), /fora da lista/);
});

test("preço: tabela por família; modelo desconhecido cai no preço alto (erra para o lado seguro)", () => {
  assert.equal(custoIaUsd("anthropic", "claude-haiku-4-5-20251001", 1_000_000, 0), 1);
  assert.equal(custoIaUsd("anthropic", "claude-opus-5-5", 0, 1_000_000), 20);
  assert.equal(custoIaUsd("openai", "gpt-4.1-mini", 1_000_000, 1_000_000), 2);
  assert.equal(custoIaUsd("gemini", "gemini-2.5-flash", 1_000_000, 0), 0.3);
  assert.ok(custoIaUsd("openai", "gpt-9-ultra", 1_000_000, 0) >= 15);
  assert.equal(custoIaUsd("openai", "gpt-4.1-mini", -5, Number.NaN), 0);
});

test("tetos: US$ por dia e por mês (centavos), 0,01 ≤ dia ≤ mês ≤ 100", () => {
  assert.deepEqual(validarTetos(0.5, 10), { ok: true, dia: 50, mes: 1000 });
  for (const [d, m] of [[0, 1], [2, 1], [1, CHAVE_TETO_MAX_USD + 1], ["1", 2], [1.234, 2], [Number.NaN, 2]] as const) assert.equal(validarTetos(d, m).ok, false, `${d}/${m}`);
});

test("teto de gasto: só chama se o pior caso cabe no dia E no mês", () => {
  const t = { tetoDiaCent: 100, tetoMesCent: 500 }; // US$ 1/dia, US$ 5/mês
  assert.equal(cabeNoTetoIa({ ...t, gastoDiaMicro: 0, gastoMesMicro: 0, estMicro: 900_000 }), true);
  assert.equal(cabeNoTetoIa({ ...t, gastoDiaMicro: 200_000, gastoMesMicro: 200_000, estMicro: 900_000 }), false, "estoura o dia");
  assert.equal(cabeNoTetoIa({ ...t, gastoDiaMicro: 0, gastoMesMicro: 4_500_000, estMicro: 600_000 }), false, "estoura o mês");
  assert.equal(cabeNoTetoIa({ ...t, gastoDiaMicro: 0, gastoMesMicro: 0, estMicro: -1 }), false, "estimativa inválida não passa");
});

test("erro do provedor: mensagem fixa por código, nunca o corpo", () => {
  assert.deepEqual(mensagemErroProvedor(401), { code: "chave_recusada", msg: "O provedor recusou a chave. Confira se ela está ativa." });
  assert.equal(mensagemErroProvedor(403).code, "chave_recusada");
  assert.equal(mensagemErroProvedor(429).code, "provedor_limite");
  assert.equal(mensagemErroProvedor(500).code, "provedor_fora");
  assert.equal(mensagemErroProvedor(0).code, "provedor_fora");
});

test("prioridade: a chave da pessoa vence o padrão do servidor; sem nenhuma, desligado", () => {
  assert.equal(fonteOpenai({ chaveUsuario: true, servidor: { ligado: true } }), "usuario");
  assert.equal(fonteOpenai({ chaveUsuario: true, servidor: { ligado: false } }), "usuario");
  assert.equal(fonteOpenai({ chaveUsuario: false, servidor: { ligado: true } }), "servidor");
  assert.equal(fonteOpenai({ chaveUsuario: false, servidor: { ligado: false } }), null);
});
