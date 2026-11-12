# Método por objetivo

O **objetivo e as prioridades do perfil mandam**. Métodos (shape em V, corpo atlético, método da Cariane…) são **referências consultadas** para calibrar faixas, nunca o que define o treino. Nada no app pode puxar para um método só: tudo é parametrizado pelo objetivo do perfil.

- O doc explica e cita; **o core decide**: cada número vive em `METODOS` (`packages/core/src/contexto-metodo.ts`), um bloco por objetivo, com teste (`packages/core/test/contexto-metodo.test.ts`). Trocar o objetivo do perfil troca os parâmetros.
- O Claude não recebe este doc: recebe o **resumo de 5–10 linhas** do objetivo do usuário (`resumoMetodo`) no topo de cada fatia de `ciclo_contexto`.

| Objetivo (`goal.id`) | Doc |
|---|---|
| `bracos_ombros` (atual do dono) | [bracos_ombros.md](bracos_ombros.md) |
| `massa_geral`, `definir`, `recompor`, `forca`, `constancia` | [outros-objetivos.md](outros-objetivos.md) |

## Fontes (chave usada em `METODOS.*.fontes`)
| Chave | Referência | O que dela vira regra |
|---|---|---|
| `schoenfeld2016` | Schoenfeld BJ, Ogborn D, Krieger JW. Effects of resistance training frequency on measures of muscle hypertrophy: a systematic review and meta-analysis. *Sports Med.* 2016;46(11):1689–97. | 2× por músculo por semana |
| `schoenfeld2017` | Schoenfeld BJ, Ogborn D, Krieger JW. Dose-response relationship between weekly resistance training volume and increases in muscle mass. *J Sports Sci.* 2017;35(11):1073–82. | ≥ 10 séries/semana para os prioritários; mais volume, mais ganho |
| `schoenfeld2017carga` | Schoenfeld BJ, Grgic J, Ogborn D, Krieger JW. Strength and hypertrophy adaptations between low- vs. high-load resistance training. *J Strength Cond Res.* 2017;31(12):3508–23. | Hipertrofia em faixa ampla de reps; força pede carga alta (3–6) |
| `pelland2024` | Pelland JC et al. The resistance training dose-response: meta-regressions exploring the effects of weekly volume and frequency on muscle hypertrophy and strength gains. *SportRxiv* (preprint), 2024. | Retorno decrescente do volume: teto de ~20 séries/semana por músculo |
| `refalo2023` | Refalo MC et al. Influence of resistance training proximity-to-failure on skeletal muscle hypertrophy. *Sports Med.* 2023;53(3):649–65. | RIR 1–3 (perto da falha sem ir sempre a ela) |
| `maeo2023` | Maeo S et al. Triceps brachii hypertrophy is substantially greater after elbow extension training performed in the overhead versus neutral arm position. *Eur J Sport Sci.* 2023;23(7):1240–50. | Prioridade "tríceps · cabeça longa" (exercício acima da cabeça) |
| `bickel2011` | Bickel CS, Cross JM, Bamman MM. Exercise dosing to retain resistance training adaptations in young and older adults. *Med Sci Sports Exerc.* 2011;43(7):1177–87. | Músculo não prioritário: ~1/3 do volume mantém (`volume.manter`) |
| `morton2018` | Morton RW et al. A systematic review, meta-analysis and meta-regression of the effect of protein supplementation on resistance training-induced gains in muscle mass and strength. *Br J Sports Med.* 2018;52(6):376–84. | Proteína 1,6 g/kg (platô), até ~2,2 |
| `iraki2019` | Iraki J et al. Nutrition recommendations for bodybuilders in the off-season: a narrative review. *Sports.* 2019;7(7):154. | Superávit pequeno; ganho de ~0,25–0,5% do peso/semana |
| `helms2014` | Helms ER, Aragon AA, Fitschen PJ. Evidence-based recommendations for natural bodybuilding contest preparation: nutrition and supplementation. *J Int Soc Sports Nutr.* 2014;11:20. | Déficit: proteína alta (~2,2 g/kg), perder ~0,5–1% do peso/semana |
| `wilson2012` | Wilson JM et al. Concurrent training: a meta-analysis examining interference of aerobic and resistance exercises. *J Strength Cond Res.* 2012;26(8):2293–307. | Interferência vem de volume/duração e de corrida: cardio moderado, de baixo impacto |
| `robineau2016` | Robineau J et al. Specific training effects of concurrent aerobic and strength exercises depend on recovery duration. *J Strength Cond Res.* 2016;30(3):672–83. | ≥ 6 h entre cardio e treino de perna |
| `who2020` | WHO guidelines on physical activity and sedentary behaviour. Genebra: OMS; 2020. | 150–300 min/semana de atividade moderada (esportes contam) |
| `parr2014` | Parr EB et al. Alcohol ingestion impairs maximal post-exercise rates of myofibrillar protein synthesis following a single bout of concurrent training. *PLoS One.* 2014;9(2):e88384. | Limite de doses/semana; evitar álcool no pós-treino |
| `shapeV` | Referência estética "shape em V" / corpo atlético (proporção ombro:cintura). Não é estudo. | **Nenhum número.** Só confirma a escolha do dono: ombro lateral primeiro, cintura sem subir |

## Método da Cariane
⛔ **Sem fonte no repositório.** Nada dele vira regra até o dono indicar o material (link, PDF ou anotações). Quando vier: registrar aqui a fonte, o que dela vira número em `METODOS` (com teste) e para quais objetivos vale.
