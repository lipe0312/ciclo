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

## Checklist final do deploy (copie e siga em ordem, ~30 min)
Tudo local já foi conferido por `npm run check`, `npm run deploy:dry` e `npm run e2e:local` (docs/09-teste-local.md).

**1. Conta e recursos (#1)**
```bash
npm ci
npm run check                            # verde antes de tudo
npx wrangler login                       # abre o navegador
npm run cf:setup                         # cria D1 "ciclo-db" + R2 "ciclo-media" e grava o database_id no wrangler.jsonc
```
- Se o R2 falhar: painel → **R2 Object Storage → Ativar** (plano grátis, 10 GB) e rode `npm run cf:setup` de novo.
- O `database_id` não é segredo (sem o seu login ninguém usa); pode versionar ou deixar só local.

**2. Primeiro deploy**
```bash
npm run deploy      # confere a config (scripts/predeploy.mjs) → build → migrations 0001…0010 remotas, em ordem → deploy
curl https://ciclo.<sua-conta>.workers.dev/api/health          # {"ok":true,…}
curl -i "https://ciclo.<sua-conta>.workers.dev/api/state?date=2026-01-01"   # 401: sem Access configurado ninguém entra
```
- O `migrations apply --remote` pergunta "Ok to proceed?": responda **y**. Ele só aplica o que falta; rodar de novo é seguro.
- **Não** crie `MCP_TOKEN` nem `DEV_NO_AUTH` em produção: o token do Claude de produção nasce no app (passo 5).

**3. Cloudflare Access (#3)** — painel → **Workers & Pages → ciclo → Settings → Domains & Routes → workers.dev → Enable Cloudflare Access** (cria a aplicação). Depois, em **Zero Trust → Access → Applications**:
1. Na aplicação criada: política **Allow** → *Emails* = o seu; login **One-time PIN**; **Session duration: 1 month** (para não pedir código na academia).
2. **Add an application → Self-hosted**: domínio `ciclo.<sua-conta>.workers.dev`, caminho `mcp` (cobre `/mcp` e `/mcp/media`), política **Bypass** → *Everyone*. Repita com o caminho `api/health`.
3. Copie o **Application Audience (AUD) Tag** da aplicação principal e o domínio do time (Zero Trust → Settings → Custom Pages: `<time>.cloudflareaccess.com`).
```bash
npx wrangler secret put ACCESS_TEAM_DOMAIN --cwd apps/worker   # ex.: meutime.cloudflareaccess.com (sem https://)
npx wrangler secret put ACCESS_AUD --cwd apps/worker
npx wrangler secret put ALLOWED_EMAILS --cwd apps/worker       # seu e-mail (vários: separados por vírgula)
npx wrangler secret list --cwd apps/worker                     # os três aparecem
```
Confira: aba anônima → URL do app → pede o código → abre. `curl -i …/api/state?date=2026-01-01` → 302/401. `curl …/api/health` → ok.

**4. Opcionais (podem vir depois)**
- Aviso do descanso com a tela bloqueada: `node scripts/gen-vapid.mjs` e `npx wrangler secret put VAPID_PUBLIC_KEY|VAPID_PRIVATE_KEY|VAPID_SUBJECT --cwd apps/worker` (detalhes abaixo).
- Voz pelo Whisper: descomente `"ai"` no `wrangler.jsonc` e `npm run deploy`.

**5. Token do Claude e connector (#6)** — a tela Conta ainda é provisória, então crie o token pelo console do navegador **no Mac**, com o app aberto e logado (Chrome → Ver → Desenvolvedor → Console):
```js
await (await fetch("/api/account/tokens", { method: "POST", headers: { "Content-Type": "application/json" }, body: '{"label":"claude.ai"}' })).json()
```
O campo `token` (`ciclo_…`) aparece **uma vez**: guarde no gerenciador de senhas. (Listar: `GET /api/account/tokens`; revogar: `DELETE /api/account/tokens/<id>`; exportar tudo: abra `/api/account/export`.) Depois, claude.ai → **Configurações → Connectors → Adicionar connector personalizado**: URL `https://ciclo.<sua-conta>.workers.dev/mcp`, autenticação **No sign in**, **Request headers** → `Authorization: Bearer <token>`. Teste no app do Claude no celular: "use ciclo_estado e me diga o treino de hoje".

**6. Celular / PWA (#4)** — abra a URL → código do e-mail → **Adicionar à Tela de Início** (iPhone: Safari → Compartilhar) → abra pelo ícone → permita notificação e microfone → treino de teste com modo avião no meio (as séries sobem ao voltar).

**7. Claude respondendo sozinho (#30)**
- **Rotina na nuvem** (Claude Code): `/schedule` → "a cada 3 h, das 7h às 23h: `/processar-caixa origem=rotina`" e "domingo 20h: `/revisao`", com o connector `ciclo`.
- **Vigia no Mac** ("online agora"): `CICLO_URL=https://ciclo.<sua-conta>.workers.dev CICLO_TOKEN=<token> .claude/skills/processar-caixa/vigia.sh` (para deixar ligado: `launchd` com `KeepAlive`).
- O app mostra na tela Claude o que está ligado (connector, rotina, vigia).

**8. Depois de ligado**
- Lighthouse mobile (Chrome → DevTools → Lighthouse → Mobile) em Hoje, Treino, Diário, Comida e Claude: meta ≥ 90 em performance e acessibilidade.
- `npx wrangler tail --cwd apps/worker` por alguns minutos de uso: sem erro, CPU baixa.
- Backup: o D1 tem **Time Travel** (restaurar a um minuto dos últimos dias: `npx wrangler d1 time-travel info ciclo-db`). O `d1 export` não funciona com a tabela de busca (FTS5); use o **Exportar** da tela Conta para um JSON seu.

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
claude.ai → **Connectors → Adicionar connector personalizado**:
- Nome: `Ciclo` · URL: `https://ciclo.<sua-conta>.workers.dev/mcp` · autenticação: **No sign in**
- Request headers: `Authorization: Bearer <token ciclo_… do passo 5>`

Depois disso, ele funciona no app do Claude no celular, no Desktop e no Claude Code (os connectors do claude.ai aparecem lá).

## Claude Code no Mac (ponte local, com upload de arquivos)
```bash
cp .mcp.json.example .mcp.json   # edite CICLO_URL e CICLO_TOKEN (token ciclo_… do passo 5; o .mcp.json está no .gitignore)
claude                           # /mcp → "ciclo" conectado
```

## Limites que importam
- D1: 100 mil escritas por dia, muito acima do uso pessoal (um treino tem ~25 escritas).
- R2: 10 GB ≈ 2.000+ vídeos de 10 s em 720p.
- Workers: 100 mil requisições por dia e **10 ms de CPU por requisição** no plano grátis (o cron de 1 min usa ~1.440 execuções/dia).
- Se algum dia passar dos limites: Workers Paid custa US$ 5 por mês.
