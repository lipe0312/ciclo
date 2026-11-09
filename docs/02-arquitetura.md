# Arquitetura

```
 celular (PWA)              claude.ai · Desktop · app do Claude           Claude Code (Mac)
 Hoje · Treino · Comida     connector personalizado (sua assinatura)      apps/mcp-local (stdio)
 Corpo · Perfil                       │ POST /mcp  (Bearer)                │ proxy → /mcp
      │ HTTPS (Access)                │                                    │ + /mcp/media (arquivo do Mac)
      ▼                               ▼                                    ▼
 ┌──────────────────────────── Cloudflare Worker "ciclo" ───────────────────────────────┐
 │ estáticos (apps/web/public)  ·  /api/* (JSON, Access)  ·  /mcp (JSON-RPC)  ·  cron 30 min │
 │                 └──────── packages/core (regras puras, testadas) ────────┘                │
 └──────────┬─────────────────────────────┬───────────────────────────┬──────────────────────┘
            ▼                             ▼                           ▼
      D1 (SQLite)                    R2 (mídia privada)          Workers AI (Whisper, opcional)
```

## Pastas
| Pasta | O que é | Dependências |
|---|---|---|
| `packages/core` | Regras puras em TS: catálogo, semana flexível (`planDay`), sessão (2 h), cargas, validador/hidratação, check-in, pedidos/modelos | **nenhuma** |
| `apps/worker` | Worker: API, MCP remoto, auth/contas, cron, migrations D1; testes em `test/` (D1 em memória via `node:sqlite`) | só `@ciclo/core` |
| `apps/web/public` | PWA sem framework: `index.html`, `app.css`, `app.js`, `core.js` (gerado), `sw.js`, `_headers`, imagens WebP | nenhuma em runtime |
| `apps/mcp-local` | Ponte stdio ⇄ HTTP para o Claude Code + upload de arquivo local | nenhuma (Node 22) |
| `.claude/skills` | Skills do Claude Code, com o `model` indicado por skill | — |

## Decisões (ADRs em `docs/adr/`)
1. **Cloudflare grátis** (Workers + D1 + R2 + Access): abre na academia com o Mac desligado, ADR-0001.
2. **Core puro compartilhado**: o mesmo `planDay` roda no celular (offline) e no servidor (MCP). O app compila o core com esbuild (IIFE `CicloCore`), ADR-0002.
3. **Sem framework no front (por enquanto)**: ~70 KB de JS no total, abre instantâneo no 4G da academia. Migrar para React/Vite só quando a complexidade pedir, ADR-0003.
4. **MCP mínimo próprio** (JSON-RPC sem estado, respostas JSON) em vez de SDK + Durable Objects: zero dependências e grátis, ADR-0004.
5. **O Claude decide, o código monta**: saída compacta + validação + hidratação, ADR-0005.
6. **Modelo por pedido** (Haiku, Sonnet, Opus) na caixa de pedidos e nas skills, ADR-0006.
7. **Contas e isolamento**: Access (e-mail) → `user`; todo dado com `user_id`; token do Claude por usuário; export/apagar conta; limite por usuário no D1, ADR-0007.

## Fluxos principais
**Abrir o app na academia**
1. `GET /api/state?date=` traz tudo numa chamada só: conta (`account`, `onboarding`), perfil (vazio em conta nova), academias, semana, dores, caixa, histórico de cargas, mídia e medidas.
2. O `core.js` calcula o treino do dia **no aparelho**.

**Começar o treino**
1. `POST /api/sessions` grava a presença como "fui". O id da sessão é gerado no aparelho, então as séries podem ir para a **fila offline** antes de a sessão chegar ao servidor.
2. Cada série vai em `POST /sessions/:id/sets`.
3. O fim vai em `/finish`, ou o cron fecha sozinho em 2 h.

**Pedido ao Claude**
1. `POST /api/inbox` grava o texto com a ação e o modelo.
2. O pedido é processado por uma rotina na nuvem, pelo `claude -p --model <tier>` ou por você no chat com o connector.
3. `ciclo_responder_pedido` grava a resposta e, se houver itens, salva o treino do dia **validado**.
4. O app mostra a resposta com o diff e o botão **Aplicar**.

**Edição manual**
1. O validador roda no aparelho.
2. `PUT /api/day-plan`.
3. `POST /api/plan-edits` (o servidor reaplica e valida).
4. A edição fica pendente até o Claude chamar `ciclo_revisar_edicoes` e depois `ciclo_concluir_revisao`.

**Mídia**
1. O arquivo vai por `POST /api/media` (app) ou `/mcp/media` (Claude Code) direto para o R2. O tipo e o tamanho são validados, até 20 MB.
2. O app lê de volta por `GET /api/media/:id`, autenticado e privado.

## Modelo de dados (D1)
`user` · `mcp_token` (hash) · `rate_limit` · `profile` (JSON validado) · `profile_history` · `gym` · `day_plan` · `session` · `set_log` · `exercise_skip` · `attendance` · `checkin` · `pain` · `inbox` · `plan_edit` · `food_log` · `measurement` · `media`. Toda tabela de dado tem `user_id` (chaves e índices começam por ele). Schema em `apps/worker/migrations/` (`0003_21_contas.sql` é o atual). Sem seed: o banco nasce vazio.

**Conta**: `GET/PATCH /api/account`, `GET /api/account/export`, `DELETE /api/account`, `GET/POST /api/account/tokens`, `DELETE /api/account/tokens/:id` (formatos no ADR-0007).

## Crescer para "Vida"
Cada módulo novo (sono, hábitos, finanças…) entra com:
- migration própria;
- funções puras em `packages/core/src/<modulo>.ts` com testes;
- rotas em `apps/worker/src/api.ts`, ou num arquivo por módulo quando passar de ~300 linhas;
- ferramentas MCP com o prefixo `ciclo_<modulo>_`;
- um card no Hoje.

É um connector só para tudo.
