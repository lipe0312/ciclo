# ADR-0001 · Hospedagem grátis na Cloudflare
**Status:** aceito · 09/11/2026

**Contexto:** o app precisa abrir na academia com o Mac em casa, ter login simples, guardar vídeos e expor uma URL pública para o connector do Claude, a custo R$ 0.

**Decisão:** Workers (app + API + MCP) + D1 + R2 + Access, sob `*.workers.dev`.

**Alternativas:**
- Vercel + Turso: Blob de 1 GB e login a programar.
- Supabase: pausa após 7 dias.
- Mac + Tailscale: precisa do Mac ligado.

**Consequências:**
- Ficamos presos à API do D1/R2. Mitigação: SQL padrão SQLite e acesso ao R2 isolado em `api.ts`.
- Limite de CPU por requisição. Mitigação: o core é leve e testado.
