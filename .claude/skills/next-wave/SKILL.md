---
name: next-wave
description: Roda a próxima onda do backlog do Ciclo num comando — até 3 issues da onda 1 (zonas diferentes) em paralelo, um implementer por issue em worktree próprio, PR verde de cada, pergunta o merge de cada no fim, faz o squash e deixa a main local limpa. Use para "/next-wave", "roda a próxima onda", "roda em paralelo".
---
Orquestra até 3 frentes. Cada frente segue os passos 3–8 da `next-task-full` com estas diferenças. O orquestrador não lê código.

## Entrada
`/next-wave [--frentes N] [#a #b #c]`. Sem ids: a onda 1 da `next-issue`.

## Paradas (só estas)
1. **Decisões** das issues `decisao` da onda: uma AskUserQuestion, uma pergunta por issue (a recomendada primeiro, mais `Tirar da onda`). Registre na issue.
2. **Bloqueio** de uma frente: pergunte só dela; as outras seguem.
3. **Portão final:** uma AskUserQuestion com uma pergunta de merge por frente.
4. **Próxima onda?**

## Disparo
- `SUJO_INICIAL` = `git status --porcelain` da pasta principal (nunca apague o que já estava lá).
- Para cada frente: rótulo `in-progress`, `git worktree add .claude/worktrees/feat-N -b <tipo>/N-<slug> origin/main`, `npm ci` + `npm run setup` dentro dele.
- O brief de cada frente acrescenta:
  ```text
  Paralelo: outras frentes rodam agora. Seu worktree é <abs>. Todo Bash começa com `cd <abs> && …`; Read/Edit/Write só dentro dele.
  Não toque: zonas <das outras> e as pastas delas; arquivos comuns só no trecho do seu item.
  ```
- Chame todos os `Agent` (implementer, `name: impl-N`) **numa única mensagem**, em background, com `model` e `effort` de cada frente conforme `.claude/skills/_shared/modelo-e-esforco.md` (teto opus-high; frente mista vira agentes em sequência por nível).
- No chat: uma linha por frente (`▶ #24 semana · opus high · feat-24 · migration`).

## Cada frente que volta (sem esperar as outras)
1. Pasta principal ainda igual a `SUJO_INICIAL`? Se não → ⛔ (um agente escreveu fora).
2. Commits, gate, revisores e PR como na `next-task-full` (passos 5 e 6), sempre com `git -C <wt>` / `cd <wt> &&`.
3. Uma linha: `✅ #24 · PR #40 · gate verde`.

## Portão e merge
- Um bloco ≤ 8 linhas por frente (o que passa a ver, como conferir, riscos, gate, escolhas), depois a AskUserQuestion.
- Merge um por vez, a de menor número primeiro.
- Conflito → `cd <wt> && git merge --no-edit origin/main`, gate, push (sem `--force`), merge de novo. Se não resolver sozinho → `SendMessage impl-N` com os arquivos.
- Limpeza de cada frente (passo 8 da `next-task-full`). No fim: `git switch main && git pull --ff-only`, nenhum worktree ou branch seu sobrando.

## Saída (≤ 10 linhas)
- Na main: os ids e hashes de cada frente.
- Manuais pendentes.
- Próxima onda.

Se nada estiver livre, diga o que destrava, nesta ordem: issue manual, PR aberto, decisão pendente.
