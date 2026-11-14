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

## Ambientes de teste: local → (túnel) → staging opcional → produção (#58)
Teste sempre na ordem mais barata. Tudo com dados fictícios; produção só no fim.

| Ambiente | Comando | Para quê | Dados |
|---|---|---|---|
| **Local** (padrão) | `npm run dev` → http://localhost:8791 | tudo, inclusive Face ID/Touch ID (o WebAuthn aceita `localhost`) | D1/R2 locais, fictícios |
| **Túnel** | `npm run dev:tunnel` | celular e connector do claude.ai, sem deploy | os mesmos locais, atrás de uma URL https temporária |
| **Staging** (opcional) | `npm run staging` | ensaio com Cloudflare de verdade | D1 `ciclo-db-staging` e R2 `ciclo-media-staging`, só de teste |
| **Produção** | `npm run deploy` | o app de verdade | seus dados |

**Túnel.** Precisa do `cloudflared` (`brew install cloudflared`; sem ele o comando mostra como instalar). Usa o quick tunnel: sem conta e sem deploy, a URL `https://….trycloudflare.com` muda a cada execução. O túnel força `DEV_NO_AUTH=0` e sem `MCP_TOKEN`, e passa o código por arquivo temporário (nunca na linha de comando). O comando imprime a URL, o connector (`<URL>/mcp`) e um **código de 1º acesso** novo (conta nova nessa URL). O rpId e a origem do passkey vêm do host do túnel (em produção a origem vem de `vars.PUBLIC_ORIGIN` no `wrangler.jsonc`, que o predeploy exige; local, túnel e staging usam o host). A faixa **AMBIENTE DE TESTES** aparece no topo.

**Staging.** Um comando, idempotente (pode repetir): cria o D1 e o R2 `-staging` se faltarem (e grava o `database_id` só na seção `env.staging` do `wrangler.jsonc`), aplica as migrations, roda o predeploy (`scripts/predeploy.mjs --staging`) e faz o deploy em `env.staging` (Worker `ciclo-staging`). Pré: `npx wrangler login`. `node scripts/staging.mjs --dry` mostra o plano sem executar nada. **Obrigatório depois do deploy:** `npx wrangler secret put AUTH_PEPPER --env staging --config apps/worker/wrangler.jsonc` e o mesmo com `OWNER_SETUP_CODE` (≥ 16 caracteres); sem eles o `/auth/*` do staging responde 503. O cron do staging roda a cada 15 min. A faixa **AMBIENTE DE TESTES** aparece no app.
- Nunca toca a produção: bindings e variáveis do staging são redeclarados (o wrangler não herda), e `apps/worker/test/ambiente.test.ts` falha se o staging apontar para o D1, o R2 ou o Worker de produção, ou levar variável de dev.
- Staging fica numa URL `*.workers.dev` separada, fora do Access; use só dados fictícios.

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
npm run deploy      # confere a config (scripts/predeploy.mjs) → build → migrations 0001…0011 remotas, em ordem → deploy
curl https://ciclo.<sua-conta>.workers.dev/api/health          # {"ok":true,…}
curl -i "https://ciclo.<sua-conta>.workers.dev/api/state?date=2026-01-01"   # 401: sem sessão ninguém entra
```
- O `migrations apply --remote` pergunta "Ok to proceed?": responda **y**. Ele só aplica o que falta; rodar de novo é seguro.
- **Não** crie `MCP_TOKEN` nem `DEV_NO_AUTH` em produção: o token do Claude de produção nasce no app (passo 5).

**3. Conta própria com Face ID (#54/#62)** — não há Cloudflare Access: a tela inicial do app é o login (passkey) e o cadastro é só por convite.
```bash
openssl rand -base64 24 | tr -d '/+=' | cut -c1-24               # gere o código de 1º acesso (≥ 16 caracteres)
npx wrangler secret put OWNER_SETUP_CODE --cwd apps/worker       # só vale enquanto não existe dono nem passkey
npx wrangler secret put OWNER_EMAIL --cwd apps/worker            # SEU e-mail de dono (nunca no repositório): o dono só nasce com o código E este e-mail
openssl rand -hex 32 | npx wrangler secret put AUTH_PEPPER --cwd apps/worker   # HMAC do IP no limite de /auth/*
npm run deploy                                                   # aplica as migrations que faltam (0013: cadastro, consent)
```
1. **Legado do Access (só se existir):** a conta antiga criada pelo login do Access (role=user, sem passkey, com dados herdados) sai antes do 1º acesso. Exporte e apague com `node scripts/limpar-legado.mjs --remote` (só exporta, para `~/ciclo-legado-<data>.json`, fora do git) e, conferido o arquivo, `node scripts/limpar-legado.mjs --remote --apagar` (pede confirmação; usa a mesma rotina do "Apagar minha conta").
2. No iPhone → app → **Primeiro acesso (dono do app)** → código de configuração e o e-mail do `OWNER_EMAIL` (sempre antes do Face ID) → nome, sobrenome, sexo, nascimento (opcional), aceite dos termos e da privacidade → Face ID → guarde os 8 códigos de recuperação. O dono nasce **vazio** (sem academia, semana ou prioridades).
3. `npx wrangler secret delete OWNER_SETUP_CODE --cwd apps/worker` logo depois.
4. Gente nova: Conta → **Pessoas e Convidar** → e-mail e nome → **Compartilhar** o link `/#convite/<código>` (uso único, 7 dias, só para aquele e-mail; teto de 10 contas no servidor). Convidar pede Face ID.
5. Se o Access ainda estiver ligado no painel: Zero Trust → Access → Applications → apague as aplicações do `ciclo.<sua-conta>.workers.dev`. Os secrets `ACCESS_*`/`ALLOWED_EMAILS` não são mais lidos pelo Worker (pode apagá-los).

Sessão: cookie `__Host-ciclo`, deslizante de 30 dias (cada uso renova), teto de 180 dias desde o login; app fechado há mais de 7 dias pede Face ID de novo sem deslogar. Ações sensíveis (chave do Chat, convidar, apagar conta, códigos de recuperação, sair de todos) pedem Face ID dos últimos 5 min.
Confira em aba anônima: o app abre na tela **Entrar**; `curl -i …/api/state?date=2026-01-01` → 401 `{"code":"entrar"}`; `curl …/api/health` → ok.

**4. Opcionais (podem vir depois)**
- Aviso do descanso com a tela bloqueada: `node scripts/gen-vapid.mjs` e `npx wrangler secret put VAPID_PUBLIC_KEY|VAPID_PRIVATE_KEY|VAPID_SUBJECT --cwd apps/worker` (detalhes abaixo).
- Voz pelo Whisper: descomente `"ai"` no `wrangler.jsonc` e `npm run deploy`.

**5. Token do Claude e connector (#6)** — a tela Conta ainda é provisória, então crie o token pelo console do navegador **no Mac**, com o app aberto e logado (Chrome → Ver → Desenvolvedor → Console):
```js
await (await fetch("/api/account/tokens", { method: "POST", headers: { "Content-Type": "application/json" }, body: '{"label":"claude.ai"}' })).json()
```
O campo `token` (`ciclo_…`) aparece **uma vez**: guarde no gerenciador de senhas. (Listar: `GET /api/account/tokens`; revogar: `DELETE /api/account/tokens/<id>`; exportar tudo: abra `/api/account/export`.) Depois, claude.ai → **Configurações → Connectors → Adicionar connector personalizado**: URL `https://ciclo.<sua-conta>.workers.dev/mcp`, autenticação **No sign in**, **Request headers** → `Authorization: Bearer <token>`. Teste no app do Claude no celular: "use ciclo_estado e me diga o treino de hoje".

**6. Celular / PWA (#4)** — abra a URL → Entrar com Face ID → **Adicionar à Tela de Início** (iPhone: Safari → Compartilhar) → abra pelo ícone → permita notificação e microfone → treino de teste com modo avião no meio (as séries sobem ao voltar).

**7. Claude respondendo sozinho (#30)**
- **Rotina na nuvem** (Claude Code): `/schedule` → "a cada 3 h, das 7h às 23h: `/processar-caixa origem=rotina`" e "domingo 20h: `/revisao`", com o connector `ciclo`.
- **Vigia no Mac** ("online agora"): `CICLO_URL=https://ciclo.<sua-conta>.workers.dev CICLO_TOKEN=<token> .claude/skills/processar-caixa/vigia.sh` (para deixar ligado: `launchd` com `KeepAlive`).
- O app mostra na tela Claude o que está ligado (connector, rotina, vigia).

**8. Depois de ligado**
- Lighthouse mobile (Chrome → DevTools → Lighthouse → Mobile) em Hoje, Treino, Diário, Comida e Claude: meta ≥ 90 em performance e acessibilidade.
- `npx wrangler tail --cwd apps/worker` por alguns minutos de uso: sem erro, CPU baixa.
- Backup: o D1 tem **Time Travel** (restaurar a um minuto dos últimos dias: `npx wrangler d1 time-travel info ciclo-db`). O `d1 export` não funciona com a tabela de busca (FTS5); use o **Exportar** da tela Conta para um JSON seu.

**8b. Proteção de custo e robôs (#56, manual do dono)**
- Painel → **Billing → Notifications**: crie alertas de uso do **R2** e do **Workers**. Confirme que a conta está no plano **Workers Free** (sem o Paid, excesso dá erro e não cobrança).
- Turnstile (opcional): painel → **Turnstile → Add widget** (domínio `ciclo.<sua-conta>.workers.dev`, modo *Managed*) e grave as duas chaves: `npx wrangler secret put TURNSTILE_SITE_KEY --cwd apps/worker` e `npx wrangler secret put TURNSTILE_SECRET --cwd apps/worker`. Sem as duas, ele fica desligado.
- **Obrigatório:** `npx wrangler secret put AUTH_PEPPER --cwd apps/worker` (valor aleatório, ex.: `openssl rand -hex 32`). Sem ele o login falha fechado em produção; o `predeploy` acusa.

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
