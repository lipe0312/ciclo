// #133 Cofre: openrouter e deepseek (host fixo, formato, validação, modelos, esforço, preço) e o aviso da chave grátis.
// Chaves fictícias montadas aqui (nada com cara de chave real no repositório).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  avisoChaveGratis, classificarModelo, filtrarModelos, lerListaModelos, modeloPadrao, parametrosModelo, pedidosValidar, precoModelo,
  validarChaveFormato, PRECO_IA_DESCONHECIDO, hostPermitido,
} from "../src/chaves.ts";

const OR = "sk-" + "or-v1-" + "a".repeat(64);
const DS = "sk-" + "b".repeat(32);
const OAI = "sk-" + "proj-" + "c".repeat(40);
const ANT = "sk-" + "ant-api03-" + "x".repeat(40);

test("formato: OpenRouter só sk-or-; DeepSeek sk- sem ser de outro provedor; OpenAI não aceita sk-or-; erro nunca ecoa", () => {
  assert.equal(validarChaveFormato("openrouter", OR).ok, true);
  assert.equal(validarChaveFormato("deepseek", DS).ok, true);
  const OAI_LEGADO = "sk-" + "A1b2".repeat(12); // formato antigo da OpenAI (48 alfanuméricos)
  assert.equal(validarChaveFormato("openai", OAI).ok, true);
  assert.equal(validarChaveFormato("openai", OAI_LEGADO).ok, true);
  // os dois sentidos: chave de um nunca passa como do outro (iria ao host errado)
  for (const [p, k] of [["openai", DS], ["deepseek", OAI], ["deepseek", OAI_LEGADO], ["deepseek", "sk-" + "B".repeat(32)], ["deepseek", DS + "0"],
    ["openrouter", DS], ["deepseek", OR], ["deepseek", ANT], ["openai", OR], ["openrouter", "sk-or-curta"]] as const) {
    const r = validarChaveFormato(p, k);
    assert.equal(r.ok, false, `${p}`);
    if (!r.ok) assert.ok(!r.erro.includes("sk-"), "erro não ecoa");
  }
});

test("validar: OpenRouter autentica no endpoint da chave antes da lista pública; DeepSeek lista os modelos; chave só em cabeçalho e host da allowlist", () => {
  const or = pedidosValidar("openrouter", OR);
  assert.deepEqual(or.map((p) => p.url), ["https://openrouter.ai/api/v1/key", "https://openrouter.ai/api/v1/models"]);
  const ds = pedidosValidar("deepseek", DS);
  assert.deepEqual(ds.map((p) => p.url), ["https://api.deepseek.com/models"]);
  for (const p of [...or, ...ds]) {
    assert.ok(hostPermitido(p.url)); assert.ok(!p.url.includes(OR) && !p.url.includes(DS), "chave nunca na URL");
    assert.match(p.headers.Authorization, /^Bearer sk-/);
  }
  assert.equal(pedidosValidar("openai", OAI).length, 1);
});

test("modelos: DeepSeek chat/reasoner; OpenRouter só fornecedor conhecido, sem imagem/embedding; grátis primeiro e padrão grátis", () => {
  assert.deepEqual(lerListaModelos("deepseek", { data: [{ id: "deepseek-chat" }, { id: "deepseek-reasoner" }] }), ["deepseek-chat", "deepseek-reasoner"]);
  assert.equal(classificarModelo("deepseek", "deepseek-chat")?.raciocinio, "compat");
  assert.equal(classificarModelo("deepseek", "deepseek-reasoner")?.raciocinio, "compat-pensa");
  assert.equal(classificarModelo("deepseek", "gpt-4o"), null);
  const ids = ["openai/gpt-4o", "deepseek/deepseek-chat-v3:free", "openrouter/auto", "google/gemini-2.5-flash-image", "x/evil", "openai/text-embedding-3", "meta-llama/llama-3.3-70b-instruct:free", "../../etc"];
  const ms = filtrarModelos("openrouter", ids).map((m) => m.id);
  assert.deepEqual(ms, ["deepseek/deepseek-chat-v3:free", "meta-llama/llama-3.3-70b-instruct:free", "openai/gpt-4o"]);
  assert.equal(modeloPadrao("openrouter", ids), "deepseek/deepseek-chat-v3:free", "ninguém paga sem escolher");
  assert.equal(modeloPadrao("deepseek", ["deepseek-reasoner", "deepseek-chat"]), "deepseek-chat");
});

test("esforço e preço: compatível com a OpenAI; reasoner sem temperatura; grátis = 0; pago/desconhecido = lado seguro", () => {
  assert.deepEqual(parametrosModelo("deepseek", "deepseek-chat", "alto", 800), { model: "deepseek-chat", max_tokens: 800, temperature: 0.3 });
  assert.deepEqual(parametrosModelo("deepseek", "deepseek-reasoner", "baixo", 800), { model: "deepseek-reasoner", max_tokens: 800 + 1024 });
  assert.deepEqual(parametrosModelo("openrouter", "openai/gpt-4o", "medio", 500), { model: "openai/gpt-4o", max_tokens: 500, temperature: 0.3 });
  assert.throws(() => parametrosModelo("openrouter", "openrouter/auto", "medio", 500));
  assert.deepEqual(precoModelo("openrouter", "meta-llama/llama-3.3-70b-instruct:free"), { in: 0, out: 0 });
  assert.deepEqual(precoModelo("openrouter", "openai/gpt-4o"), PRECO_IA_DESCONHECIDO);
  assert.deepEqual(precoModelo("deepseek", "deepseek-chat"), PRECO_IA_DESCONHECIDO);
});

test("aviso da chave grátis: Gemini e OpenRouter falam de dado de saúde em 1 frase; os pagos não", () => {
  for (const p of ["gemini", "openrouter"] as const) assert.match(avisoChaveGratis(p)!, /saúde/);
  for (const p of ["anthropic", "openai", "deepseek"] as const) assert.equal(avisoChaveGratis(p), null);
});
