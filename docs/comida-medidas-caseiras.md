# Comida: medidas caseiras, pratos e porções faladas (#80)

O que a pessoa fala ("um pouco de arroz", "um pratão de macarrão", "3 fatias de pizza") vira gramas em três camadas. Tudo é **estimativa média**, mostrada com faixa e suposições; ajustar ensina a próxima.

## Camadas
1. **Regra (grátis, `packages/core/src/porcoes.ts`).** Medidas caseiras por tipo de alimento, quantificadores, pratos comuns e a **porção pessoal** (a correção da pessoa vence tudo). Sem número = **1 porção média**, com a suposição escrita ("assumi 1 filé médio de frango (~120 g)"). O número só vale para o alimento que ele acompanha.
2. **IA leve (`packages/core/src/porcao-ia.ts` + `apps/worker/src/porcao-ia.ts`).** Workers AI → Haiku (só com `ANTHROPIC_API_KEY` + `ANTHROPIC_MAX_USD`) → OpenAI (só com `OPENAI_API_KEY` + `OPENAI_MAX_USD`). Texto entre « » como dado; saída só JSON validado (alimento da lista de candidatos, gramas plausíveis, kcal coerente). Cache por texto normalizado (30 dias, só o hash), 40 chamadas por conta por dia, trava global da #56, teto mensal reservado antes de cada chamada paga. Falhou: fica a regra.
3. **Memória pessoal (`porcao_pessoal`).** Vem do "Ajustar" no app e dos pares texto → itens finais do `food_log` (2 confirmações coerentes, nunca por cima da correção).

**Parser em modo sombra (`packages/core/src/porcao-parser.ts`).** Roda junto com a IA e grava só a comparação (etiquetas e ids; palavra fora do léxico vira `?`). Pular a IA numa categoria exige a flag do dono (desligada) e ≥ 95% de concordância em ≥ 200 casos.

**Teto de sanidade.** Item com > 80 g de proteína ou > 1.500 kcal, ou refeição com > 2.000 kcal ou > 150 g de proteína: "⚠ conferir" na prévia, e o MCP nunca grava sem confirmação (qualquer que seja a preferência).

## Medidas caseiras (g ou ml de uma medida cheia)
| Medida | Valores usados |
|---|---|
| Colher de sopa | arroz/grão 25 · feijão 20 · pó (whey, aveia) 12 · líquido 15 · carne moída 30 · pasta 20 |
| Colher de chá | pó 4 · líquido 5 · pasta 7 |
| Concha | feijão 100 · prato com caldo 150 |
| Escumadeira | arroz 90 · massa 100 |
| Copo americano / de requeijão / copo | 190 / 250 / 200 ml |
| Xícara | líquido 240 · grão 160 · pó 90 |
| Prato raso | arroz 180 · massa 220 · salada 80 |
| Prato fundo / "pratão" (fundo cheio) | massa 350 / 450 · arroz 300 / 400 |
| Punhado · pegador · tigela | 30 · 80 (massa) · 300 |

Quantificadores: "um pouco" ≈ 0,5 porção (0,3–0,7); "bastante/muito" ≈ 1,75 (1,5–2); "meio/meia" = 0,5; "normal" = 1.

## Pratos comuns (por 100 g; porção média e faixa de uma porção)
| Prato | kcal / prot | Porção (faixa) | Fonte |
|---|---|---|---|
| Pizza (muçarela/calabresa) | 270 / 11,5 | fatia 110 g (80–150) | média de receitas e rótulos |
| Lasanha à bolonhesa | 155 / 8,5 | 300 g (200–400) | média de receitas |
| Strogonoff (frango ou carne) | 160 / 14 | 200 g (150–280) | média de receitas |
| Escondidinho | 145 / 8 | 300 g (200–400) | média de receitas |
| Feijoada | 117 / 8,7 | 250 g (180–350) | TACO |
| À parmegiana | 210 / 17 | bife 200 g (150–280) | média de receitas |
| Yakisoba | 120 / 7 | 350 g (250–450) | média de receitas |
| Hambúrguer (sanduíche) | 255 / 13 | 200 g (150–300) | média de rótulos |
| Açaí na tigela (com xarope) | 110 / 0,7 | 300 g (200–500) | TACO |
| Tapioca simples | 240 / 0 | 70 g (50–100) | TACO |
| Cuscuz de milho | 113 / 2,2 | 150 g (100–250) | TACO |
| Suco de laranja · refrigerante | 33 / 0,7 · 42 / 0 | copo 200 ml · lata 350 ml | TACO · rótulo |

## Fontes
- Pinheiro ABV, Lacerda EMA, Benzecry EH, Gomes MCS, Costa VM. *Tabela para Avaliação de Consumo Alimentar em Medidas Caseiras*. 5ª ed. São Paulo: Atheneu, 2005.
- IBGE. *Pesquisa de Orçamentos Familiares 2008-2009: Tabela de Medidas Referidas para os Alimentos Consumidos no Brasil*. Rio de Janeiro: IBGE, 2011.
- NEPA/UNICAMP. *Tabela Brasileira de Composição de Alimentos (TACO)*, 4ª ed. Campinas, 2011.
- Open Food Facts (industrializados, ADR-0014).

Os valores são médias arredondadas, compatíveis com essas tabelas; não foram conferidos página a página. Servem para estimativa média, nunca para uso clínico. Corrigir um valor: `PRATOS` / `MEDIDA_G` em `porcoes.ts` e esta tabela juntos.
