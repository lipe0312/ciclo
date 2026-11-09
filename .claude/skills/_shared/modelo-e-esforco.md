# Modelo e esforço por tarefa (regra das skills next-*)

O modelo e o esforço acompanham o **risco e o impacto** da tarefa, não o tamanho. **Teto: Opus high** (nunca xhigh/max).

| Tarefa | Modelo · esforço |
|---|---|
| Docs, textos, labels, rename, ajuste de CSS pontual, dados de catálogo (nomes, dicas), imagens por script | **haiku · low** |
| Ajuste numa tela existente, bug localizado, testes extras, componente simples | **sonnet · medium** |
| Tela nova, regra nova no `packages/core` com teste, componente compartilhado | **sonnet · high** |
| Integração entre zonas sem schema, refactor médio | **opus · medium** |
| **Migration/schema, auth, multiusuário, dados de saúde, MCP/Claude, troca de base (stack do front), qualquer coisa difícil de desfazer** | **opus · high** (teto) |

Regras:
1. Use o campo `Modelo sugerido` da issue quando existir; senão, a linha mais alta que a issue toca.
2. **Issue mista → divida.** A parte de risco (ex.: base do front, migration) vai num agente opus-high; as partes simples (catálogo, textos, imagens) vão em agentes menores depois, na mesma branch, em sequência (não em paralelo no mesmo arquivo).
3. Revisores: `guarda-seguranca` sobe para **opus · high** quando o diff tem migration, auth ou dados de saúde; senão sonnet · medium. `ui-reviewer`: sonnet · medium (haiku · low se for só screenshot de conferência).
4. Ao disparar: passe `model` e `effort` explícitos no `Agent` e escreva no chat `▶ #N · <modelo> <esforço> · motivo em 3 palavras`.
5. Agente que parou (limite, erro): **retome com SendMessage** em vez de criar outro; o trabalho fica no worktree.
