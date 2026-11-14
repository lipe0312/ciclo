# ADR-0013 · OAuth 2.1 do MCP e a interface Cerebro
**Status:** aceito (issue #66, atualizações do dono de 2026-11-14)

## Contexto
Conectar o Claude pedia para gerar uma chave na Conta, copiar e colar (#55). Responder sozinho dependia do vigia no Mac.

O dono quer:
- conectar colando só a URL e entrando com o Face ID;
- pedidos respondidos sem Mac;
- uma reserva opcional por API paga, sem virar o padrão.

## Decisão
1. **OAuth 2.1 conforme a especificação de autorização do MCP (2026-07-28)**, implementado no Worker sem dependência (`apps/worker/src/oauth.ts`; regras em `packages/core/src/oauth.ts`):
   - **Descoberta:**
     - o 401 do `/mcp` traz `WWW-Authenticate: Bearer resource_metadata=…, scope="ciclo"`;
     - Protected Resource Metadata (RFC 9728) responde na raiz e em `/mcp`;
     - Authorization Server Metadata (RFC 8414) anuncia `S256` e `authorization_response_iss_parameter_supported`.
   - **Registro dinâmico** (RFC 7591), mantido pela compatibilidade com o claude.ai (na spec atual ele é opcional e está "deprecated" em favor de Client ID Metadata Documents):
     - **allowlist de `redirect_uri`** (contra phishing de consentimento): só o callback publicado pela Anthropic, `https://claude.ai/api/mcp/auth_callback` (e o mesmo caminho em `claude.com`, por precaução). A var `OAUTH_REDIRECT_HOSTS` troca a lista (URLs https separadas por vírgula; com `/` no fim vira prefixo de caminho). `http` no loopback (localhost, 127.0.0.1) é aceito para dev e CLI, e a tela mostra "app não verificado";
     - o `client_name` nunca é identidade: a tela mostra o host de destino;
     - cliente público, ou `client_secret_*` se o cliente pedir;
     - teto de 200 clientes no próprio INSERT (atômico); cliente que nunca obteve token some em 1 h, e o cron limpa os ociosos.
   - **Autorização:**
     - PKCE **S256 obrigatório**; `plain` recusado;
     - `resource` (RFC 8707) tem de ser este servidor;
     - redirect desconhecido **nunca redireciona** (sem open redirect);
     - `iss` na resposta (RFC 9207).
   - **Consentimento** em `/autorizar`: página própria (`autorizar.html`), fora da casca do app.
     - Permitir **pede o Face ID na hora**, mesmo com sessão ativa: o Worker só aceita uma sessão nascida de passkey há no máximo 2 min.
     - `/oauth/decidir` falha fechado: exige `Origin` igual à origem ou `Sec-Fetch-Site: same-origin`.
     - O redirect de erro leva `Cache-Control: no-store` e `Referrer-Policy: no-referrer`.
   - **Token:**
     - código de uso único (5 min); o access dura 1 h;
     - o refresh gira a cada uso, e o reuso do refresh antigo revoga a conexão; conta apagada (ou com `deleted_at`) invalida access e refresh;
     - tudo guardado só como SHA-256;
     - a conexão é uma linha de `mcp_token` (`kind = 'oauth'`): aparece e é revogada na mesma lista da Conta;
     - máximo de 3 conexões por pessoa; a chave manual tem o seu próprio teto de 5;
     - `/oauth/revoke` segue a RFC 7009.
   - **Limites:** 30 requisições a cada 10 min por origem (HMAC do IP) em register, authorize, token e revoke.
2. **Interface `Cerebro`** (`apps/worker/src/cerebro.ts`), com três provedores:
   - `regra`: padrão e grátis; responde na hora quando não precisa de IA;
   - `claude-assinatura`: o conector e a rotina na nuvem; o pedido fica na fila;
   - `openai-api`: opcional, só para gerar e ajustar treino:
     - liga só com `OPENAI_API_KEY` e `OPENAI_MAX_USD` (0 < teto ≤ 100);
     - o teto mensal fica no D1 (`cerebro_gasto`): antes de cada chamada, o pior caso é **reservado** num `UPDATE … WHERE usd + est <= teto` (atômico) e depois acertado pelo `usage`; sem `usage` ou com timeout, fica cobrada a estimativa;
     - no máximo 10 chamadas por conta por dia;
     - **com a OpenAI ligada, dados de treino e saúde da conta (a fatia do contexto do pedido) vão para a OpenAI.** Quem liga é o dono do app, e a aba Chat avisa todas as contas enquanto estiver ligada;
     - o contexto livre (dores, memória, notas) vai limpo, truncado e marcado como dado, igual ao pedido;
     - a chamada é `fetch` direto, **sem SDK e sem dependência nova**;
     - toda saída passa pelo validador do core; fora das regras, é descartada.
3. O **vigia no Mac** sai do caminho principal. A rotina na nuvem (`/schedule` do Claude Code) é a forma de responder sem computador.

## Consequências
- Conectar não tem mais chave para copiar. A chave manual continua como plano B.
- `/mcp`, `/oauth/*` e `/.well-known/*` precisam ficar fora do Cloudflare Access e em `run_worker_first`. O predeploy confere.
- A API paga é pior e mais cara que a assinatura e serve só de reserva (`docs/10-chat.md`).
- Client ID Metadata Documents (o "SHOULD" da spec atual) ficam para depois, se o claude.ai passar a preferir isso.
