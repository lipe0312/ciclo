# Teste local de ponta a ponta

Antes de cada deploy. Tudo com dados fictícios, numa conta de dev nova (`e2e-xxxx`) que o próprio roteiro apaga no fim.

## 1. Automático (API + connector), ~5 s
```bash
npm run setup          # só na 1ª vez
npm run dev            # outro terminal: http://localhost:8791
npm run e2e:local      # outra porta: CICLO_URL=http://localhost:8792 npm run e2e:local
```
Saída esperada: `✔ 11 etapas ok`. O script (`scripts/e2e-local.mjs`) só aceita localhost e cobre, em ordem:

| # | Etapa | O que prova |
|---|---|---|
| 1 | conta nova | perfil vazio, Primeiros passos pendente |
| 2 | Primeiros passos | objetivo, prioridades, academia → concluído; token do Claude criado |
| 3 | semana gerada | semana + treino do dia com exercícios |
| 4 | treino completo | começar, séries, descanso, **editar série** (desfaz e refaz), pular, restaurar a sessão (X/voltar), terminar com resumo |
| 5 | checkout | dia fechado |
| 6 | comida | registro por texto (a voz vira este mesmo texto) |
| 7 | dor no mapa | dor aparece no estado |
| 8 | pedido no chat | o **vigia** (`ciclo_chat_pendentes origem=vigia tier=haiku`) vê o pedido do tier certo, responde, e a tela Claude fica "online agora" |
| 9 | exame | colado → `ciclo_exame_concluir` → **texto bruto apagado** (`hasText: false`) |
| 10 | tempo | mediana de `/api/state` e `/api/home` < 150 ms |
| 11 | LGPD | exportar e apagar a conta de teste |

## 2. Na tela (o que o script não vê), ~10 min
Abra http://localhost:8791 (conta de dev limpa: http://localhost:8791/api/dev/user?u=teste1) em 390 px (DevTools → modo dispositivo) e em 1280 px:
1. **Primeiros passos** até o fim → Hoje mostra o objetivo e a semana.
2. **Treino**: Começar → marque 2 séries → o descanso conta, vibra/apita → toque no **X** e volte por outra aba → o treino continua de onde parou → edite uma série → Terminar com feedback.
3. **Checkout** do dia no Diário.
4. **Comida por voz**: microfone na Comida (navegador com reconhecimento de voz; sem o binding AI o app diz qual motor usa).
5. **Dor no mapa**: toque no ombro → o treino do dia troca o exercício e sugere fortalecimento.
6. **Pedido no chat**: escreva "hoje só tenho 30 min" na tela Claude; com o vigia ligado (`CICLO_URL=http://localhost:8791 CICLO_TOKEN=<token> .claude/skills/processar-caixa/vigia.sh`) a resposta chega pelo modelo Haiku.
7. **Exame**: cole um texto fictício no Diário → peça a análise → o texto some e fica só o resumo.

## 3. Gate
```bash
npm run check          # typecheck + testes (inclui isolamento A×B em toda rota e ferramenta, gerado do roteador) + build
npm run deploy:dry     # build + conferência da config de produção + wrangler deploy --dry-run (nada sobe)
npm audit              # 0 vulnerabilidades
```
