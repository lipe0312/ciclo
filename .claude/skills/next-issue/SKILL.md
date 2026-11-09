---
name: next-issue
description: Mapa das próximas ondas do backlog do Ciclo (issues do GitHub) — o que entra agora, o que roda em paralelo sem conflito de zona, o que espera o quê e os manuais do dono. Só lê. Use para "/next-issue", "quais as próximas", "o que roda em paralelo".
model: haiku
---
Só leitura: não põe rótulo, não cria branch. Regras em `docs/08-fluxo-de-desenvolvimento.md`.

```bash
gh issue list --state open --limit 100 --json number,title,labels,body --jq '.[] | {n:.number,t:.title,l:[.labels[].name],dep:((.body|capture("Depende de: (?<d>[^\n]*)")?.d) // "")}'
gh issue list --state closed --limit 200 --json number,stateReason --jq '[.[]|select(.stateReason=="COMPLETED")|.number]'
gh pr list --json number,headRefName,title
git worktree list
```
Monte as ondas:
1. Em andamento = rótulo `in-progress`, PR aberto (`feat/<N>-…`) ou worktree `feat-<N>`. Ocupa frente e zona da onda 1.
2. Livre = todas as `Depende de` fechadas como concluídas, sem `manual`.
3. Ordem: menor `fase-*`, depois menor número. Onda = até 3 livres de **zonas diferentes**. Item que espera outro da onda vai para a seguinte.
4. `decisao` entra na onda, mas com ⛔ (a pergunta é feita no início da `next-task-full`/`next-wave`).

Resposta (≤ 12 linhas):
```
Agora (paralelo): #21 F1.1 worker-db ⛔decisão · #22 F1.2 web-base ⛔decisão
Depois: #23 (←21,22) · #24 (←21,22) · #25 (←22)
Depois: …
Manuais do dono agora: #1 · #3 (←#1)
Rodar: /next-wave   ou   claude -n "F1.2" "/next-task-full 22 --rec"
```
Não dê `--rec` para item com ⛔decisão.
