# Fluxo de desenvolvimento (issues → ondas → PR)

## O backlog é o GitHub
Cada item é **uma issue grande e completa**, com rótulos que o orquestrador lê:

| Rótulo | Significado |
|---|---|
| `fase-1` … `fase-7` | ordem macro |
| `zona:<nome>` | pasta ou área que a issue domina; duas issues da mesma zona nunca rodam juntas |
| `schema` | cria migration |
| `decisao` | tem uma pergunta para o dono antes de começar (está no corpo, com recomendação) |
| `manual` | quem faz é o dono (credencial, painel da Cloudflare); nunca é implementada por agente |
| `in-progress` | alguém está fazendo (PR aberto ou worktree `feat-N`) |

Dependências ficam numa linha do corpo: `Depende de: #21, #22`. Uma dependência só conta como pronta quando a issue foi fechada como concluída.

## Regras de paralelismo (onda)
- No máximo **3 frentes** por onda.
- **Zonas diferentes** em cada frente.
- Dependências fechadas.
- Nenhuma frente `decisao` sem resposta.
- Migration: cada worktree tem o próprio D1 local (`.wrangler/`), então não há banco compartilhado. Arquivos de migration se chamam `NNNN_<issue>_<slug>.sql` com `NNNN` = número da issue com 4 dígitos (ex.: `0021_21_contas.sql`): não colidem e a ordem segue as dependências. Migration aplicada nunca é editada.
- Arquivos comuns (`package.json`, `wrangler.jsonc`, `packages/core/src/index.ts`, `apps/worker/src/index.ts`): cada frente mexe só no trecho do seu item. Conflito se resolve no merge da segunda frente.

## Comandos
- `/next-issue`: mapa das ondas (só leitura).
- `/next-task-full [#N] [--rec]`: um item, do worktree ao merge.
- `/next-wave`: a onda inteira em paralelo, com subagentes.

## Gate (o mesmo para todo PR)
`npm run check` (typecheck + testes + build do core) + CI verde + revisor `guarda-seguranca` sem bloqueante + `ui-reviewer` quando a issue toca tela.
