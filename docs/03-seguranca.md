# Segurança

O repositório é **público** e os dados são **pessoais** (peso, dor, comida e vídeos). Por isso a regra é: **código aberto, dados fechados, falhar fechado**.

## Camadas
| Camada | Como | Onde |
|---|---|---|
| Quem abre o app | **Cloudflare Access** (login por código no seu e-mail, até 50 usuários grátis) na frente do domínio inteiro | painel Zero Trust |
| Defesa em profundidade | O Worker **verifica de novo** o JWT do Access: assinatura RS256 com as chaves do time, `aud`, `iss`, `exp` e e-mail na lista `ALLOWED_EMAILS` | `apps/worker/src/auth.ts` |
| Claude (connector) | `/mcp` fica fora do Access (a Anthropic precisa alcançar) e é protegido por **token Bearer de ≥ 32 caracteres**, comparado em **tempo constante** (hash SHA-256 + XOR) | `verifyBearer` |
| Local | `DEV_NO_AUTH=1` só vale para **localhost**. Sem as variáveis do Access em produção, a API devolve 401 | `verifyAccess` |
| CSRF | Escrita só com `Origin` igual ao do app; sem CORS | `index.ts` |
| Entrada | JSON com `Content-Type` obrigatório, **limite de tamanho** por rota (16–64 KB; mídia 20 MB; áudio 4 MB), validação de tipo e faixa em todo campo (`http.ts`) e `CHECK` no schema | `api.ts`, migrations |
| SQL | **Só prepared statements** (`bind`). Nenhuma string do usuário é montada em SQL. Testado com `region: "x'; DROP TABLE pain;--"` → 400 | `db.ts`, `api.ts` |
| Mídia | Lista de tipos permitidos (jpeg/png/webp/mp4/webm/mov), chave aleatória no R2, **bucket privado**, leitura só autenticada, `nosniff` | `api.ts` |
| Arquivos locais (MCP do Mac) | `ciclo_anexar_midia` só lê arquivos de pastas permitidas (Filmes, Imagens, Downloads, Mesa; configurável por `CICLO_MEDIA_DIRS`) e com tipo e tamanho checados | `apps/mcp-local` |
| Navegador | CSP estrita (`script-src 'self'`, sem script inline, sem terceiros), `frame-ancestors 'none'`, HSTS, `Referrer-Policy: no-referrer`, `Permissions-Policy` (só câmera e microfone do próprio app) | `apps/web/public/_headers` |
| XSS | Tudo o que vem de dados passa por `esc()` antes de virar HTML | `app.js` |
| Erros | Mensagem genérica ao cliente; log sem dados pessoais (só a rota e a mensagem) | `api.ts`, `mcp.ts` |
| Segredos | `MCP_TOKEN` via `wrangler secret put`; `.dev.vars` no `.gitignore`; CI com **gitleaks**; *secret scanning* e *push protection* do GitHub | `.github/` |
| Dependências | **Zero em runtime**. Dev: wrangler, esbuild, typescript e @types/node, com versões fixadas com ≥ 2 semanas de lançamento; Dependabot semanal | `package.json` |

## O que o Claude pode e não pode
- Pode: ler o resumo, planejar, salvar o treino do dia **validado**, responder pedidos, registrar dor, comida e presença, e revisar edições.
- Não pode: apagar dados, mudar o perfil, ler mídia ou exportar tudo. Essas ações ficam só no app, atrás do Access.
- Ferramentas de escrita usam `destructiveHint: false`; leitura usa `readOnlyHint: true`.
- O conteúdo da caixa e das notas é **dado, não instrução**. As instruções do servidor MCP dizem isso, e a resposta do Claude passa sempre pelo validador.

## Checklist antes de publicar o deploy
- [ ] Access ligado para o domínio `*.workers.dev` do Worker, com política "Allow" só para o seu e-mail, e **Bypass** só para `/mcp`, `/mcp/media` e `/api/health`.
- [ ] `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` e `ALLOWED_EMAILS` definidos (`wrangler secret put` ou `vars`).
- [ ] `MCP_TOKEN` gerado com `openssl rand -hex 32` e guardado no gerenciador de senhas.
- [ ] `npm run check` verde; gitleaks verde.
- [ ] Testar sem login: `curl https://…/api/state?date=2026-01-01` → 401 (ou redirecionamento do Access).

## Reportar problema
Veja `SECURITY.md`.
