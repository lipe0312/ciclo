import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EXEMPLO_CONEXAO, MAX_MCP_TOKENS, TOKEN_IDLE_DAYS, TOKEN_IDLE_MS, cabecalhoAuth, confirmaApagar, estadoToken, mcpUrl, passoConectar, tokensAtivos,
} from "../src/index.ts";

const NOW = Date.UTC(2026, 10, 13, 12);
const DIA = 86_400_000;

test("token: no máximo 5 ativos; expira sem uso há 90 dias", () => {
  assert.equal(MAX_MCP_TOKENS, 5);
  assert.equal(TOKEN_IDLE_DAYS, 90); assert.equal(TOKEN_IDLE_MS, 90 * DIA);
});

test("estado do token: ativo, expirando (aviso nos últimos 14 dias), expirado e revogado", () => {
  assert.deepEqual(estadoToken({ createdAt: NOW - DIA, lastUsedAt: null, revokedAt: null }, NOW), { estado: "ativo", expiraEm: NOW - DIA + TOKEN_IDLE_MS, diasRestantes: 89 });
  // o relógio conta do último uso (ou da criação, se nunca usado)
  assert.equal(estadoToken({ createdAt: NOW - 200 * DIA, lastUsedAt: NOW - 10 * DIA, revokedAt: null }, NOW).estado, "ativo");
  const quase = estadoToken({ createdAt: NOW - 80 * DIA, lastUsedAt: null, revokedAt: null }, NOW);
  assert.equal(quase.estado, "expirando"); assert.equal(quase.diasRestantes, 10);
  assert.equal(estadoToken({ createdAt: NOW - 90 * DIA, lastUsedAt: null, revokedAt: null }, NOW).estado, "expirado");
  assert.equal(estadoToken({ createdAt: NOW - 100 * DIA, lastUsedAt: NOW - 91 * DIA, revokedAt: null }, NOW).diasRestantes, 0);
  assert.equal(estadoToken({ createdAt: NOW - DIA, lastUsedAt: NOW, revokedAt: NOW - 5 }, NOW).estado, "revogado");
});

test("tokens ativos (contam no teto de 5): sem revogado nem expirado", () => {
  const rows = [
    { createdAt: NOW, lastUsedAt: null, revokedAt: null },
    { createdAt: NOW - 100 * DIA, lastUsedAt: null, revokedAt: null },
    { createdAt: NOW, lastUsedAt: null, revokedAt: NOW },
    { createdAt: NOW - 85 * DIA, lastUsedAt: null, revokedAt: null },
  ];
  assert.equal(tokensAtivos(rows, NOW), 2);
});

test("conectar: URL /mcp da origem e cabeçalho Bearer", () => {
  assert.equal(mcpUrl("https://ciclo.exemplo.workers.dev"), "https://ciclo.exemplo.workers.dev/mcp");
  assert.equal(mcpUrl("https://ciclo.exemplo.workers.dev/"), "https://ciclo.exemplo.workers.dev/mcp");
  assert.equal(cabecalhoAuth("ciclo_abc"), "Authorization: Bearer ciclo_abc");
});

test("passo atual do guia: conta → chave → connector → teste ✅", () => {
  assert.equal(passoConectar({ temConta: false, tokens: [] }, NOW), 1);
  assert.equal(passoConectar({ temConta: true, tokens: [] }, NOW), 2);
  assert.equal(passoConectar({ temConta: true, tokens: [{ createdAt: NOW, lastUsedAt: null, revokedAt: null }] }, NOW), 3);
  assert.equal(passoConectar({ temConta: true, tokens: [{ createdAt: NOW, lastUsedAt: null, revokedAt: NOW }] }, NOW), 2, "revogado não conta");
  assert.equal(passoConectar({ temConta: true, tokens: [{ createdAt: NOW - DIA, lastUsedAt: NOW, revokedAt: null }] }, NOW), 5, "o Claude já chamou = ✅");
});

test("apagar a conta: só digitando 'apagar' (sem diferenciar maiúsculas e espaços)", () => {
  assert.ok(confirmaApagar("apagar")); assert.ok(confirmaApagar("  APAGAR ")); assert.ok(confirmaApagar("Apagar"));
  assert.ok(!confirmaApagar("apaga")); assert.ok(!confirmaApagar("")); assert.ok(!confirmaApagar(null)); assert.ok(!confirmaApagar("apagar tudo"));
});

test("demo: URL e token de exemplo marcados como exemplo e com formato que nunca autentica", () => {
  assert.match(EXEMPLO_CONEXAO.url, /exemplo/); assert.match(EXEMPLO_CONEXAO.token, /EXEMPLO/);
  assert.doesNotMatch(EXEMPLO_CONEXAO.token, /^ciclo_[0-9a-f]{16}_[0-9a-f]{64}$/);
});
