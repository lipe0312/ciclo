# ADR-0002 · Core puro compartilhado (aparelho e servidor)
**Status:** aceito

**Decisão:** as regras ficam em `packages/core`, em TypeScript sem dependências. O esbuild gera `core.js` (IIFE `CicloCore`) para o app. O Worker importa o core direto. Os testes rodam com `node --test`.

**Por quê:**
- O mesmo cálculo roda offline no celular e no MCP.
- O Claude nunca refaz conta.
- Os testes são a especificação.
