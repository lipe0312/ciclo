# Deploy grátis (Cloudflare) e uso no celular

## Por que Cloudflare
| | Cloudflare (escolhido) | Vercel + Turso | Supabase |
|---|---|---|---|
| App abre com o Mac desligado | ✅ | ✅ | ✅ |
| Banco | D1 (SQLite): 5 GB, 5 mi leituras e 100 mil escritas por dia | Turso: 5 GB | Postgres 500 MB, **pausa após 7 dias sem uso** |
| Vídeos | **R2: 10 GB, saída grátis** | Blob: 1 GB | 1 GB |
| Login sem código | **Access** (até 50 usuários) | — | Auth pronto |
| Transcrição de voz | **Workers AI Whisper** (~200 min/dia grátis) | — | — |

Sem domínio próprio: o app fica em `https://ciclo.<sua-conta>.workers.dev`.

## Passo a passo (uma vez, ~20 min)
```bash
npm install
npx wrangler login                       # abre o navegador
npm run cf:setup                         # cria D1 "ciclo-db" e R2 "ciclo-media" e grava o database_id no wrangler.jsonc
openssl rand -hex 32 | npx wrangler secret put MCP_TOKEN --cwd apps/worker   # guarde esse token
npm run deploy                           # build do core + migrations remotas + deploy
```
**Cloudflare Access** (painel → Zero Trust → Access → Applications → *Add* → Self-hosted):
1. Domínio: `ciclo.<sua-conta>.workers.dev`.
2. Política **Allow**: *Emails* = o seu. Login: *One-time PIN* (código por e-mail).
3. Segunda aplicação (ou regra) com política **Bypass** para os caminhos `/mcp`, `/mcp/media` e `/api/health`.
4. Copie o **Application Audience (AUD) tag** e o domínio do time (`<time>.cloudflareaccess.com`) e configure:
```bash
cd apps/worker
npx wrangler secret put ACCESS_AUD
npx wrangler secret put ACCESS_TEAM_DOMAIN      # ex.: meutime.cloudflareaccess.com
npx wrangler secret put ALLOWED_EMAILS          # seu e-mail
```
**Transcrição (opcional):** descomente `"ai": { "binding": "AI" }` no `wrangler.jsonc` e rode `npm run deploy`.

## No celular (academia)
1. Abra a URL no Chrome (Android) ou no Safari (iPhone) → código no e-mail → **Adicionar à tela inicial**.
2. Permita **notificações** (fim do descanso) e o **microfone** (comida e pedidos).
3. Sem sinal? O app abre do cache, e as séries entram na fila e sobem quando a conexão voltar ("Offline · N na fila" no topo).

## Claude: connector (celular e Desktop)
claude.ai → **Personalizar → Connectors → Adicionar connector personalizado**:
- Nome: `Ciclo` · URL: `https://ciclo.<sua-conta>.workers.dev/mcp`
- Cabeçalho de requisição: `Authorization: Bearer <MCP_TOKEN>`

Depois disso, ele funciona no app do Claude no celular, no Desktop e no Claude Code (os connectors do claude.ai aparecem lá).

## Claude Code no Mac (ponte local, com upload de arquivos)
```bash
cp .mcp.json.example .mcp.json   # edite CICLO_URL e CICLO_TOKEN (o .mcp.json está no .gitignore)
claude                           # /mcp → "ciclo" conectado
```

## Limites que importam
- D1: 100 mil escritas por dia, muito acima do uso pessoal (um treino tem ~25 escritas).
- R2: 10 GB ≈ 2.000+ vídeos de 10 s em 720p.
- Workers: 100 mil requisições por dia.
- Se algum dia passar dos limites: Workers Paid custa US$ 5 por mês.
