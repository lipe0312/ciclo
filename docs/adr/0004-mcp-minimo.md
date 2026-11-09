# ADR-0004 · Servidor MCP mínimo próprio
**Status:** aceito

**Decisão:** JSON-RPC sobre `POST /mcp`, sem estado, com respostas `application/json` (Streamable HTTP sem SSE). Implementa `initialize`, `tools/list`, `tools/call`, `ping` e notificações. A autenticação é um Bearer token.

**Por quê:**
- Zero dependências.
- Cabe no Worker grátis sem Durable Objects.
- Os clientes atuais aceitam respostas JSON.

**Risco:** um cliente futuro exigir SSE ou OAuth. Plano: trocar por `McpAgent` (SDK oficial) e `workers-oauth-provider`, mantendo as mesmas ferramentas.
