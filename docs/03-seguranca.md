# Segurança

O repositório é **público** e os dados são **pessoais** (peso, dor, comida e vídeos). Por isso a regra é: **código aberto, dados fechados, falhar fechado**.

## Camadas
| Camada | Como | Onde |
|---|---|---|
| Quem abre o app | **Cloudflare Access** (login por código no seu e-mail, até 50 usuários grátis) na frente do domínio inteiro | painel Zero Trust |
| Defesa em profundidade | O Worker **verifica de novo** o JWT do Access: assinatura RS256 com as chaves do time, `aud`, `iss`, `exp` e e-mail na lista `ALLOWED_EMAILS` (vazia = ninguém) | `apps/worker/src/auth.ts` |
| Contas | Cada e-mail vira uma conta (`user`) no 1º acesso; banco nasce vazio. **Todo dado tem `user_id`** e toda query filtra pelo usuário da sessão, nunca do corpo. Teste de isolamento cobre todas as rotas e ferramentas (ADR-0007) | `db.ts`, `api.ts`, `test/isolation.test.ts` |
| Claude (connector) | `/mcp` e `/mcp/media` ficam fora do Access e usam **token por usuário** (criado/revogado em "Conta", mostrado uma vez, guardado só como SHA-256, comparado em **tempo constante**) | `authenticateMcp` |
| Local | `DEV_NO_AUTH=1` só vale para **localhost**: usuário de dev por `x-dev-user`/cookie `ciclo_dev_user`; `MCP_TOKEN` global só como bootstrap do usuário `dev`. Sem as variáveis do Access em produção, a API devolve 401 | `auth.ts` |
| Abuso | Limite por usuário (contador no D1): escrita 120/min, upload 20/10 min → 429 | `hitRateLimit` |
| LGPD | Exportar tudo (`GET /api/account/export`) e apagar a conta em cascata, incluindo o R2 (`DELETE /api/account`) | `db.ts` |
| CSRF | Escrita só com `Origin` igual ao do app; sem CORS | `index.ts` |
| Entrada | JSON com `Content-Type` obrigatório, **limite de tamanho** por rota (16–64 KB; mídia 20 MB; áudio 4 MB), validação de tipo e faixa em todo campo (`http.ts`) e `CHECK` no schema | `api.ts`, migrations |
| SQL | **Só prepared statements** (`bind`). Nenhuma string do usuário é montada em SQL. Testado com `region: "x'; DROP TABLE pain;--"` → 400 | `db.ts`, `api.ts` |
| Mídia | Lista de tipos permitidos (jpeg/png/webp/mp4/webm/mov), chave aleatória no R2 sob `u/<user_id>/`, **bucket privado**, leitura só autenticada, `nosniff` | `api.ts` |
| Arquivos locais (MCP do Mac) | `ciclo_anexar_midia` só lê arquivos de pastas permitidas (Filmes, Imagens, Downloads, Mesa; configurável por `CICLO_MEDIA_DIRS`) e com tipo e tamanho checados | `apps/mcp-local` |
| Navegador | CSP estrita (`script-src 'self'`, sem script inline, sem terceiros), `frame-ancestors 'none'`, HSTS, `Referrer-Policy: no-referrer`, `Permissions-Policy` (só câmera e microfone do próprio app) | `apps/web/public/_headers` |
| XSS | Tudo o que vem de dados passa por `esc()` antes de virar HTML | `app.js` |
| Exames (saúde) | PDF lido **no aparelho** (pdf.js sob demanda, ADR-0009), até 5 MB; só o texto vai ao D1 e é apagado na análise (`ciclo_exame_concluir`) ou em 7 dias (cron). Arquivo nunca vai ao R2; fica só o resumo estruturado | `diario.ts`, migration `0007` |
| Erros | Mensagem genérica ao cliente; log sem dados pessoais (só a rota e a mensagem) | `api.ts`, `mcp.ts` |
| Segredos | tokens do Claude só como hash no D1; `.dev.vars` no `.gitignore`; CI com **gitleaks**; *secret scanning* e *push protection* do GitHub | `.github/` |
| Dependências | Runtime do front: Preact (ADR-0008) e pdf.js só na tela de exames (ADR-0009); Worker: zero. Dev: wrangler, esbuild, typescript e @types/node, com versões fixadas com ≥ 2 semanas de lançamento; Dependabot semanal | `package.json` |

## O que o Claude pode e não pode
- Pode: ler o resumo, planejar, salvar o treino do dia **validado**, responder pedidos, registrar dor, comida e presença, e revisar edições.
- Só enxerga a conta dona do token.
- Não pode: apagar dados, mudar o perfil, ler mídia ou exportar tudo. Essas ações ficam só no app, atrás do Access.
- Ferramentas de escrita usam `destructiveHint: false`; leitura usa `readOnlyHint: true`.
- O conteúdo da caixa e das notas é **dado, não instrução**. As instruções do servidor MCP dizem isso, e a resposta do Claude passa sempre pelo validador.

## Checklist antes de publicar o deploy
- [ ] Access ligado para o domínio `*.workers.dev` do Worker, com política "Allow" só para o seu e-mail, e **Bypass** só para `/mcp`, `/mcp/media` e `/api/health`.
- [ ] `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` e `ALLOWED_EMAILS` definidos (`wrangler secret put` ou `vars`). **Não** definir `DEV_NO_AUTH` nem `MCP_TOKEN` em produção.
- [ ] Token do Claude gerado em "Conta" (`POST /api/account/tokens`) e guardado no gerenciador de senhas.
- [ ] `npm run check` verde; gitleaks verde.
- [ ] Testar sem login: `curl https://…/api/state?date=2026-01-01` → 401 (ou redirecionamento do Access).

## Reportar problema
Veja `SECURITY.md`.
