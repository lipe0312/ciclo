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
**Transcrição (opcional):** descomente `"ai": { "binding": "AI" }` no `wrangler.jsonc` e rode `npm run deploy`. O app informa na tela Comida qual motor de voz está em uso (Whisper, navegador ou nenhum). Em dev local o binding é remoto: exige `wrangler login`; sem ele, deixe comentado e o app usa o reconhecimento do navegador (só em https ou localhost; não existe no Firefox nem em alguns navegadores de privacidade).

**Aviso do descanso com a tela bloqueada (Web Push, #25):** gere o par de chaves VAPID uma vez e guarde como secrets (a privada nunca vai para o git):
```bash
node scripts/gen-vapid.mjs                                    # imprime VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY
cd apps/worker
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_KEY
npx wrangler secret put VAPID_SUBJECT                         # opcional: mailto:você@exemplo.com (alguns serviços de push, como o da Apple, pedem)
```
Local: as mesmas linhas em `apps/worker/.dev.vars`. Sem as chaves o app funciona igual, só sem o aviso com a tela bloqueada (continua vibrando e apitando com a tela ligada).
- **Como agenda:** ao concluir a série o app avisa o servidor "o descanso acaba em N s"; o **cron de 1 minuto** (grátis, `* * * * *`) manda um push vazio quando vence, e o service worker mostra "Descanso acabou". Escolhi o cron em vez de Durable Object Alarm porque não pede classe nem migração de DO; o custo é um atraso de até ~1 min no aviso. O fechamento de treinos esquecidos continua a cada 30 min, dentro do mesmo cron.
- **Android (Chrome):** funciona no navegador e instalado; toque em "Ligar aviso" na aba Hoje (precisa de um toque para o navegador deixar pedir a permissão).
- **iPhone (iOS 16.4 ou mais novo):** o Safari só entrega push para o app **instalado na Tela de Início** (Compartilhar → Adicionar à Tela de Início, abrir pelo ícone). **Fora do PWA, no Safari comum, não existe aviso com a tela bloqueada**: o descanso vibra (quando o aparelho deixa) e apita só com a tela ligada. O app mostra esse aviso na aba Hoje.
- Segurança: o servidor só envia push para endpoints de serviços conhecidos (FCM, Mozilla, Apple, Windows), o push não leva dados pessoais e cada conta só dispara os próprios aparelhos.

## No celular (academia)
1. Abra a URL no Chrome (Android) ou no Safari (iPhone) → código no e-mail → **Adicionar à tela inicial**.
2. Permita **notificações** (fim do descanso; veja o Web Push acima, no iPhone só com o app instalado) e o **microfone** (comida e pedidos).
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
