# ADR-0007 · Contas e isolamento entre usuários
**Status:** aceito (issue #21)

**Decisão:**
- **Login = Cloudflare Access** (código por e-mail). O Worker reverifica o JWT (RS256, `aud`, `iss`, `exp`) e exige o e-mail em `ALLOWED_EMAILS` a cada requisição (lista vazia = ninguém: falha fechada). A conta (`user`) nasce no primeiro acesso, com o banco **vazio** (sem seed; catálogo é código).
- **Todo dado pessoal tem `user_id NOT NULL`** com chaves/índices começando por `user_id` (migration `0003_21_contas.sql`, pré-deploy: recria as tabelas). O `uid` vem só da autenticação (`AuthUser`), nunca do corpo. Sessões têm chave `(user_id, id)` porque o id vem do aparelho.
- **Token do Claude por usuário** (`mcp_token`): `ciclo_<id>_<segredo>`, guardado só como SHA-256; busca pelo id público e comparação do hash em tempo constante (com hash fictício quando o id não existe). Revogado → 401. `MCP_TOKEN` global vale só em localhost com `DEV_NO_AUTH=1`, para o usuário de dev `dev`.
- **Local:** `DEV_NO_AUTH=1` + `x-dev-user`/cookie `ciclo_dev_user` (slug `[a-z0-9_-]{1,32}` → `<slug>@dev.localhost`), só quando o host é `localhost`/`127.0.0.1`. `/api/dev/user?u=ana` grava o cookie.
- **Limite por usuário com contador no D1** (janela fixa: escrita 120/min, upload 20/10 min, ferramentas MCP de escrita no balde de escrita) → 429 + `Retry-After`. Por que não o binding Rate Limiting: ele é por local da borda e eventualmente consistente, não roda igual no teste em Node e não tem dado auditável. O custo (1 escrita D1 por escrita) cabe no grátis para ≤ 50 usuários.
- `last_seen_at` (usuário) e `last_used_at` (token) gravados no máx. a cada 5 min / 1 min.
- **LGPD:** `GET /api/account/export` (JSON de tudo, mídia só metadados, tokens sem hash); `DELETE /api/account` com `{"confirm":"APAGAR"}` apaga os objetos R2 (prefixo `u/<user_id>/` + chaves registradas) e depois todas as linhas numa transação (mais `ON DELETE CASCADE`).

**Prova:** `apps/worker/test/isolation.test.ts` roda o Worker real sobre um D1 em memória (`node:sqlite`) e faz a conta A atacar a B em **todas** as rotas e ferramentas (o teste confere a lista com `routeSignatures()` e `toolNames`); falha se uma query perder o filtro.

## Contrato para o front
`GET /api/state?date=` ganha:
```json
{ "account": { "email": "...", "createdAt": 0, "onboardingDoneAt": null },
  "onboarding": "pendente" | "concluido",
  "profile": {} /* vazio até os Primeiros passos */, "gyms": [], ... }
```
`POST /api/plan-day` sem perfil/academia → `{ "plan": null, "empty": "sem_perfil" | "sem_academia", "message": "..." }` (MCP: `{ vazio, motivo }`).

| Rota | Corpo / resposta |
|---|---|
| `GET /api/account` | `{ account, onboarding }` |
| `PATCH /api/account` | `{ "onboarding": "concluido" \| "pendente" }` → `{ ok, account, onboarding }` |
| `GET /api/account/export` | JSON `ciclo-export-1` (download) |
| `DELETE /api/account` | `{ "confirm": "APAGAR" }` → `{ ok }` |
| `GET /api/account/tokens` | `{ tokens: [{ id, label, createdAt, lastUsedAt, revokedAt }] }` |
| `POST /api/account/tokens` | `{ label? }` → 201 `{ id, label, createdAt, token }` (token só aqui; máx. 10 ativos) |
| `DELETE /api/account/tokens/:id` | revoga → `{ ok }` ou 404 |

Escritas podem responder **429** (`Retry-After`). `POST /api/sessions/:id/sets|skip` agora devolvem `saved: boolean`.
