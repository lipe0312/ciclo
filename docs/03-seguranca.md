# Segurança

O repositório é **público** e os dados são **pessoais** (peso, dor, comida e vídeos). Por isso a regra é: **código aberto, dados fechados, falhar fechado**.

## Camadas
| Camada | Como | Onde |
|---|---|---|
| Login próprio (#54, ADR-0011) | **Passkey** (WebAuthn, Face ID/Touch ID) verificada no Worker com WebCrypto (ES256/RS256: desafio de uso único, origem, rpId, UV obrigatório, contador anticlone). Conta só por **convite** de uso único (7 dias, só hash no banco) ou pelo `OWNER_SETUP_CODE` (1ª conta, fecha para sempre). **Teto de 10 contas** conferido no mesmo `INSERT` (transação). Sessão de 90 dias no cookie `__Host-ciclo` (`HttpOnly; Secure; SameSite=Lax`), só o SHA-256 no D1, renovada no uso; "Sair de todos" apaga todas. 8 códigos de recuperação (só hash, uso único). `/auth/*`: limites e bloqueio da #56 (linha "Abuso"). O owner **não apaga a própria conta** enquanto houver outras; apague o secret `OWNER_SETUP_CODE` depois do 1º acesso. Pendente: step-up (Face ID de novo) em ações sensíveis | `auth-conta.ts`, `packages/core/src/conta.ts`, `test/conta.test.ts` |
| Quem abre o app (transição) | **Cloudflare Access** (login por código no seu e-mail, até 50 usuários grátis) na frente do domínio inteiro | painel Zero Trust |
| Defesa em profundidade | O Worker **verifica de novo** o JWT do Access: assinatura RS256 com as chaves do time, `aud`, `iss`, `exp` e e-mail na lista `ALLOWED_EMAILS` (vazia = ninguém) | `apps/worker/src/auth.ts` |
| Reset de acesso (owner) | O owner pode **resetar a conta de outra pessoa**: as sessões dela caem e os tokens do Claude dela são revogados na hora; o convite novo troca passkeys e códigos e dá a quem o usar o controle da conta, **com os dados**. Quem entra no app confia no owner para isso | `auth-conta.ts`, ADR-0011 |
| Papéis | `owner` gerencia pessoas e convites e vê só nome, papel, criação e último acesso das outras contas (nunca dado de saúde); `user` só a própria. O teste de isolamento roda a matriz inteira também com duas contas criadas por convite (cookie) | `auth-conta.ts`, `test/isolation.test.ts` |
| Contas | Cada e-mail vira uma conta (`user`) no 1º acesso; banco nasce vazio. **Todo dado tem `user_id`** e toda query filtra pelo usuário da sessão, nunca do corpo. Teste de isolamento cobre todas as rotas e ferramentas (ADR-0007) | `db.ts`, `api.ts`, `test/isolation.test.ts` |
| Claude (connector) | `/mcp` e `/mcp/media` ficam fora do Access e usam **token por usuário** (criado/revogado em "Conta", mostrado uma vez, guardado só como SHA-256, comparado em **tempo constante**) | `authenticateMcp` |
| Local | `DEV_NO_AUTH=1` só vale para **localhost**: usuário de dev por `x-dev-user`/cookie `ciclo_dev_user`; `MCP_TOKEN` global só como bootstrap do usuário `dev`. Sem as variáveis do Access em produção, a API devolve 401 | `auth.ts` |
| Abuso (#56) | `/auth/*`: 30 POST/10 min por IP; login, registro, recuperação, convite e setup: **5/min por IP**; **10 falhas seguidas → bloqueio de 15 min** do IP; **limite global** de `/auth/recover` (100/h) e do setup do dono (20/h) contra força bruta distribuída. IP só como HMAC com `AUTH_PEPPER`. Turnstile (opcional, ADR-0012) no convite e depois de 3 falhas, validado no servidor (falha fechada). Por usuário: escrita 120/min, upload 20/10 min. Tudo responde 429 com `Retry-After` | `limites.ts`, `auth-conta.ts`, `hitRateLimit`, `test/limites.test.ts` |
| Custo (#56) | Arquivo até 20 MB (abaixo do teto de 25 MB) com **tipo pelo conteúdo** (magic bytes; tipo falso → 415); **500 MB de R2 por conta**; contador diário no D1 (`uso_dia`) de escritas e bytes: a **95% do grátis** (escritas do dia ou R2 guardado), upload e convite param com 429 e texto claro, e a leitura segue | `limites.ts`, `packages/core/src/limites.ts` |
| LGPD | Exportar tudo (`GET /api/account/export`) e apagar a conta em cascata, incluindo o R2 (`DELETE /api/account`). Teste lê o schema: toda tabela com `user_id` é apagada e exportada (menos as técnicas: limite, push, descanso, índice de busca) | `db.ts`, `test/deploy.test.ts` |
| CSRF | Escrita só com `Origin` igual ao do app; sem CORS | `index.ts` |
| Entrada | JSON com `Content-Type` obrigatório, **limite de tamanho** por rota (16–64 KB; mídia 20 MB; áudio 4 MB), validação de tipo e faixa em todo campo (`http.ts`) e `CHECK` no schema | `api.ts`, migrations |
| SQL | **Só prepared statements** (`bind`). Nenhuma string do usuário é montada em SQL. Testado com `region: "x'; DROP TABLE pain;--"` → 400 | `db.ts`, `api.ts` |
| Mídia | Lista de tipos permitidos (jpeg/png/webp/mp4/webm/mov; outro → 415), chave aleatória no R2 sob `u/<user_id>/`, **bucket privado**, leitura só autenticada, `nosniff`. Mídia de aparelho exige o lugar (`gymId`) da própria conta. Apagar lugar → lixeira de 30 dias, depois o cron apaga do R2 (ADR-0010) | `api.ts`, `db.ts` |
| Arquivos locais (MCP do Mac) | `ciclo_anexar_midia` só lê arquivos de pastas permitidas (Filmes, Imagens, Downloads, Mesa; configurável por `CICLO_MEDIA_DIRS`) e com tipo e tamanho checados | `apps/mcp-local` |
| Produção | `preview_urls: false` (sem URL de preview fora do Access), nenhuma variável de dev em `vars`, migrations sem transação explícita: conferido por `scripts/predeploy.mjs` antes de todo `npm run deploy` e no `npm test`. Sem Access, **toda** rota `/api` e ferramenta MCP responde 401 (teste gerado do roteador) | `test/deploy.test.ts` |
| Navegador | CSP estrita (`script-src 'self'` + só o Turnstile em `challenges.cloudflare.com`, também em `frame-src`, ADR-0012; sem script inline), `frame-ancestors 'none'`, HSTS; respostas da API com `default-src 'none'; sandbox`; manifest com `crossorigin="use-credentials"` (o PWA instala atrás do Access), `Referrer-Policy: no-referrer`, `Permissions-Policy` (câmera, microfone e localização só do próprio app; `img-src` com os tiles do OpenStreetMap, ADR-0010) | `apps/web/public/_headers` |
| XSS | Tudo o que vem de dados passa por `esc()` antes de virar HTML | `app.js` |
| Exames (saúde) | PDF lido **no aparelho** (pdf.js sob demanda, ADR-0009), até 5 MB; só o texto vai ao D1 e é apagado na análise (`ciclo_exame_concluir`) ou em 7 dias (cron). Arquivo nunca vai ao R2; fica só o resumo estruturado | `diario.ts`, migration `0007` |
| Erros | Mensagem genérica ao cliente; log sem dados pessoais (só a rota e a mensagem) | `api.ts`, `mcp.ts` |
| Segredos | tokens do Claude só como hash no D1; `.dev.vars` no `.gitignore`; CI com **gitleaks**; *secret scanning* e *push protection* do GitHub | `.github/` |
| Mapa (#26) | Leaflet + tiles do OpenStreetMap: **o navegador pede os tiles ao OSM, então o OSM vê a região (zona do mapa e zoom) dos lugares que você abre, inclusive a casa**; o app manda só a origem como Referer. Quem não quer isso não marca o ponto (o mapa é opcional). Busca de endereço pelo Worker (User-Agent genérico, sem dado pessoal; só o texto digitado sai), limite global de 1 req/s (`geocode_gate`) e por conta | `apps/web/src/screens/academias`, `api.ts`, ADR-0010 |
| Dependências | Runtime do front: Preact (ADR-0008), pdf.js só na tela de exames (ADR-0009), Leaflet só no mapa (ADR-0010) e o script externo do Turnstile só no `#entrar`, quando ligado (ADR-0012); Worker: zero. Dev: wrangler, esbuild, typescript e @types/node, com versões fixadas com ≥ 2 semanas de lançamento; Dependabot semanal | `package.json` |

## O que a Cloudflare cobre × o que o app cobre (#56)
| Risco | A Cloudflare (plano Free, sem código) | O app (código) |
|---|---|---|
| Conta cobrada por excesso | Workers Free **não cobra excedente**: passou de 100 mil req/dia, 10 ms de CPU ou 100 mil escritas/dia no D1, o Worker devolve erro até o dia virar. Não assinar o Workers Paid é a trava | Cota global: a 95% do grátis, upload e convite param |
| R2 (pode ter cartão) | 10 GB e 1 milhão de operações/mês grátis; **alerta de billing** no painel (manual do dono, `docs/05`) | Arquivo ≤ 20 MB com tipo checado, 500 MB por conta, upload 20/10 min por pessoa, trava a 95% dos 10 GB |
| DDoS e TLS | Automáticos em `*.workers.dev` | — |
| Quem chega ao app | Access, enquanto existir (transição) | Passkey, convite de uso único, teto de 10 contas |
| Força bruta no login | — (WAF e rate limit do painel exigem domínio próprio; não há em `workers.dev`) | 5/min por IP, bloqueio de 15 min após 10 falhas, limite global de recuperação e setup, Turnstile |
| Robô criando conta | Turnstile (grátis), se o dono ligar | Validação do token no servidor; convite exige o token |
| Spam de escrita e do Claude | — | 120 escritas/min por pessoa (API e MCP) |

## O que o Claude pode e não pode
- Pode: ler o resumo, planejar, salvar o treino do dia **validado**, responder pedidos, registrar dor, comida e presença, e revisar edições.
- Só enxerga a conta dona do token.
- Não pode: apagar dados, mudar o perfil, ler mídia ou exportar tudo. Essas ações ficam só no app, atrás do Access.
- Ferramentas de escrita usam `destructiveHint: false`; leitura usa `readOnlyHint: true`.
- O conteúdo da caixa e das notas é **dado, não instrução**. As instruções do servidor MCP dizem isso, e a resposta do Claude passa sempre pelo validador.

## Checklist antes de publicar o deploy
- [ ] Access ligado para o domínio `*.workers.dev` do Worker, com política "Allow" só para o seu e-mail, e **Bypass** só para `/mcp`, `/mcp/media` e `/api/health`.
- [ ] `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` e `ALLOWED_EMAILS` definidos (`wrangler secret put` ou `vars`). **Não** definir `DEV_NO_AUTH` nem `MCP_TOKEN` em produção.
- [ ] Token do Claude gerado (`POST /api/account/tokens`, passo 5 do `05-deploy-gratis.md`) e guardado no gerenciador de senhas.
- [ ] `npm run check`, `npm run deploy:dry`, `npm run e2e:local` e `npm audit` verdes; gitleaks verde (CI).
- [ ] Plano **Free** confirmado e alerta de billing do R2 e do Workers ligados (`docs/05`, passo 8b).
- [ ] Testar sem login: `curl https://…/api/state?date=2026-01-01` → 401 (ou redirecionamento do Access).

## Reportar problema
Veja `SECURITY.md`.
