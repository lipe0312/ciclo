# Brief do implementer (≤ 40 linhas, sem placeholder sobrando)

```text
Issue #<N> "<título>" · lipe0312/ciclo · fase <F> · zona <zona>
Worktree: <caminho absoluto> · branch <tipo>/<N>-<slug> (já criada; NÃO faça git commit/push/checkout/stash/reset)
Leia: CLAUDE.md, docs/01-requisitos-v3.md (seções citadas na issue), docs/DESIGN.md (se tela), docs/03-seguranca.md (se auth/dados).

Critérios de aceite (copiados da issue, só eles):
1. …
Fora do escopo: …
Não toque: <zonas e pastas das outras frentes abertas>.
Pré-aprovado: pastas <…> · migration: <nenhuma | apps/worker/migrations/<NNNN>_<N>_<slug>.sql, arquivo novo> · dependência: <nenhuma | <pacote> (decisão registrada na issue)> · env nova: <nenhuma | NOME em .dev.vars.example sem valor real>.
Fora disso → STATUS: BLOQUEIO com opções e recomendação.

Regras que mais quebram: regra de negócio no packages/core com teste ANTES; SQL só com bind e sempre filtrado por user_id; todo dado externo escapado com esc(); nada de script inline (CSP); dados fictícios em seed e teste; pt-BR na interface; toque ≥ 44 px e 390 px sem estourar.
Testes obrigatórios: <regra → teste antes · isolamento entre contas → teste que falha sem o filtro · ataque (SQL em campo, XSS em nome, upload de tipo errado) → teste>.
Gate: `npm run check`. Tela: rode `npm run dev` e confira 390 e 1280.
Decisão do dono: <texto da issue/comentário>.

Devolva EXATAMENTE (≤ 25 linhas):
STATUS: PRONTO | BLOQUEIO
O dono passa a ver: <1 frase>
Como conferir: <rota local ou comando>
Arquivos: <lista curta>
Commits sugeridos: "<imperativo>" + corpo → <arquivos> (1–3)
Testes: <novos e o que provam>
Critérios: <n/n com nota do que ficou parcial>
Escolhas que fiz sem perguntar: <≤ 3>
Fora do escopo / sugestões: <≤ 3>
Manual do dono: <nenhum | …>
```
