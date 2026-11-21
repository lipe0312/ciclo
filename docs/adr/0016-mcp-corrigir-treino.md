# ADR-0016 · Ferramenta MCP que apaga séries e sessões (`ciclo_treino_corrigir`)

**Status:** aceito · **Data:** 2026-11-21 · **Issue:** #123

## Contexto
Até a v1.3.0 do contrato, nenhuma ferramenta MCP apagava registro de treino ("isso é só no app"). No caso real de 20/11 o Claude
não conseguiu corrigir séries erradas nem uma sessão duplicada (sobra de antes da #122), porque o dia estava feito e não havia
ferramenta. O dono pediu na #123 que a IA consiga apagar/corrigir séries, remover um exercício e descartar/mesclar a sessão
duplicada, inclusive em dia já feito, com prévia → confirmar.

## Decisão
Abrir a exceção com uma ferramenta só, `ciclo_treino_corrigir` (contrato 1.4.0), marcada `destructiveHint`. Ela apaga linhas de
`set_log` e `session` **sem desfazer** (não guardamos snapshot: a prévia mostra exatamente o que sai e o volume antes → depois).

## Mitigações
- **Prévia obrigatória:** sem `confirmar:<token>` nada é gravado. Token `prv_…` de uso único, 15 min, preso à conta (SHA-256).
- **Janela curta:** só de hoje até 7 dias atrás (8 dias).
- **Assinatura do dia:** a prévia guarda o SHA-256 das sessões e séries do dia; se algo mudou entre a prévia e o sim → 409 e simula de novo.
- **Isolamento:** todo SQL com `bind` e `user_id`; sessão/token de outra conta = não encontrado (teste A×B em `isolation.test.ts` e `feito-123.test.ts`).
- **Presença:** sem sessão no dia, só a presença automática (Terminar) some; "Treinei" da pessoa fica.

## Consequências
Correção errada confirmada não volta pelo MCP: a pessoa registra de novo (app ou `ciclo_treino_registrar`). Se virar problema,
um snapshot de desfazer (como em `ciclo_comida_desfazer`) entra numa issue própria.
