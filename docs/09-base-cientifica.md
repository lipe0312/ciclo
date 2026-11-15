# 09 · Base científica do gerador

De onde vêm as notas e as constantes que escolhem os exercícios. Começou na #74 (eficiência por subparte, popularidade, "Meu treino atual" e Trocar na mesma parte); a #65 (gerador por metodologia) usa o mesmo ranqueamento.

> **Ressalva obrigatória: EMG ≠ hipertrofia.** Quase toda comparação "qual exercício pega mais a parte X" mede a **ativação elétrica** (EMG de superfície), e a amplitude do EMG medida numa sessão **não é um preditor validado de crescimento muscular** ([Vigotsky et al. 2018, Front Physiol](https://pmc.ncbi.nlm.nih.gov/articles/PMC5758546/); [Vigotsky et al. 2022, Sports Med, PubMed 35006527](https://pubmed.ncbi.nlm.nih.gov/35006527/)). Um exemplo: no [Plotkin 2023 (PubMed 37877099)](https://pubmed.ncbi.nlm.nih.gov/37877099/), o hip thrust teve EMG de glúteo maior que o agachamento, mas o glúteo cresceu igual nos dois. Por isso a nota é um **ranking prático** para ordenar opções, não uma verdade. Onde há estudo de hipertrofia (espessura ou volume muscular), ele vale mais que o EMG.

## Eficiência por subparte

Campo `eficiencia` de cada exercício em `packages/core/src/catalog-eficiencia.ts`:

| Nota | Leitura |
|---|---|
| 3 | principal: é o exercício que mais trabalha aquela subparte |
| 2 | pega bem (série indireta que conta) |
| 1 | pega pouco |
| ausente | praticamente não trabalha |

Regras (há teste em `packages/core/test/treino-atual.test.ts`):
- A subparte principal (`subMuscles[0]`, que vem da anatomia do movimento) tem a maior nota do exercício.
- Todo exercício fora do `planOff` tem `subMuscles` e `eficiencia`.

Por região, o que sustenta as notas:

| Região | Nota no catálogo | Fonte |
|---|---|---|
| **Ombro posterior** | crucifixo inverso (máquina, halteres, cabo e apoiado no banco) = 3; face pull e remada na corda = 2; remadas = 1; desenvolvimento = ausente | O crucifixo inverso ativou mais o deltoide posterior que a remada sentada e a puxada ([Franke et al. 2015, J Sports Med Phys Fitness, PubMed 24947920](https://pubmed.ncbi.nlm.nih.gov/24947920/)). A elevação posterior sentada ficou no topo junto com a remada inclinada a 45° ([estudo ACE / UW-La Crosse 2014](https://acewebcontent.azureedge.net/certifiednews/images/article/pdfs/ACEShoulderStudy.pdf)). Na revisão sistemática, barra fixa e remada invertida também ativam bem o posterior ([Rabello et al. 2024, PubMed 39593452](https://pubmed.ncbi.nlm.nih.gov/39593452/)), daí a remada invertida = 2 e a barra = 1. |
| **Ombro lateral** | elevações laterais (halter, polia, sentado, inclinada, elástico) = 3; desenvolvimentos = 2 no lateral e 3 no anterior | Abduções e abduções horizontais lideram para o deltoide médio, e a elevação lateral com leve rotação interna foi a maior ([Rabello et al. 2024, PubMed 39593452](https://pubmed.ncbi.nlm.nih.gov/39593452/)). A elevação lateral neutra teve o maior pico do médio ([Coratella et al. 2020, IJERPH, PMC7503819](https://pmc.ncbi.nlm.nih.gov/articles/PMC7503819/)). |
| **O desenvolvimento quase não pega o posterior** | desenvolvimento sem nota no posterior; elevação lateral = 1 no posterior | Posterior: elevação lateral 24% vs. desenvolvimento 11,4% da contração máxima. Médio: 30,3% vs. 27,9% ([Campos et al. 2020, PubMed 33312291](https://pubmed.ncbi.nlm.nih.gov/33312291/)). É exatamente o caso do dono: quem só faz desenvolvimento fica sem posterior. |
| **Peito superior × médio** | inclinados (supino, crucifixo, crossover de baixo para cima) = 3 no superior e 2 no médio; reto, voador e crossover alto = 3 no médio e 2 (ou 1) no superior | A porção clavicular atinge o pico com o banco por volta de 44°; o reto ativa mais a esternal (Trebs et al. 2010, J Strength Cond Res 24(7):1925-30). Com 30–45°, o superior só ganha em parte da fase concêntrica ([Lauver et al. 2016, PubMed 25799093](https://pubmed.ncbi.nlm.nih.gov/25799093/)). Em iniciantes, reto, inclinado e misto deram adaptação parecida ([Chaves et al. 2020, PubMed 32922646](https://pubmed.ncbi.nlm.nih.gov/32922646/)). Por isso o reto mantém 2 no superior. |
| **Tríceps: cabeça longa × lateral** | acima da cabeça (francês na polia, com halter, com barra W) e testa = 3 na longa; pulley, corda, coice, máquina e paralela = 3 na lateral; a outra cabeça = 2 | A extensão acima da cabeça cresceu ~1,5× mais a cabeça longa que o pulley e ~1,4× as cabeças lateral e medial ([Maeo et al. 2023, PubMed 35819335](https://pubmed.ncbi.nlm.nih.gov/35819335/)). Coice e paralela tiveram EMG alto no tríceps (estudo ACE / UW-La Crosse 2011, sem revisão por pares). A nota da lateral no francês fica em 2 por cautela: o Maeo sugere que ela pode ser 3. Fica para revisar na #65. |
| **Bíceps × braquial / braquiorradial** | rosca com pegada supinada (direta, Scott, inclinada, concentrada, polia) = 3 no bíceps; martelo e rosca inversa = 3 no braquial | A pegada supinada teve o maior EMG de bíceps ([Coratella et al. 2023, PMC10054060](https://pmc.ncbi.nlm.nih.gov/articles/PMC10054060/)). O braquial foi mais ativado na rosca inversa ([AIP Conf. Proc. 2023, doi:10.1063/5.0148594](https://doi.org/10.1063/5.0148594)). Scott e barra W ficam com 2 no braquial pela pegada semipronada (critério de movimento, sem estudo direto). |
| **Dorsal × meio das costas** | puxadas e barra fixa = 3 no dorsal; remadas = 3 no meio das costas; a outra = 2 | A remada sentada teve o maior EMG de romboide e trapézio médio ([Lehman et al. 2004, PMC449729](https://pmc.ncbi.nlm.nih.gov/articles/PMC449729/)). A puxada aberta pela frente teve o maior EMG do dorsal ([Signorile et al. 2002, PubMed 12423182](https://pubmed.ncbi.nlm.nih.gov/12423182/)). A largura da pegada (1–2× a dos ombros) não mudou o dorsal ([Andersen et al. 2014, PubMed 24662157](https://pubmed.ncbi.nlm.nih.gov/24662157/)). O pullover fica com 2 no dorsal e 2 no peito (sem estudo direto). |
| **Quadríceps** | agachamentos, leg press, hack, afundos e extensora = 3; agachamento livre completo = 3 também no glúteo e 2 nos adutores | O agachamento cresceu os vastos e quase nada o reto femoral. O agachamento completo cresceu mais o glúteo (6,7% vs. 2,2%) e os adutores (6,2% vs. 2,7%) que o meio agachamento ([Kubo et al. 2019, PubMed 31230110](https://pubmed.ncbi.nlm.nih.gov/31230110/)). A extensora cresceu o reto femoral ([Zabaleta-Korta et al. 2021, PubMed 34743671](https://pubmed.ncbi.nlm.nih.gov/34743671/); [Kassiano et al. 2026, PubMed 41379528](https://pubmed.ncbi.nlm.nih.gov/41379528/)). |
| **Glúteo** | elevação pélvica, ponte com barra, coice na polia, pull through e afundo reverso = 3; abdutora = 2 (pega mais o glúteo médio); ponte no chão = 2 | O hip thrust teve mais EMG de glúteo que o agachamento ([Contreras et al. 2015, PubMed 26214739](https://pubmed.ncbi.nlm.nih.gov/26214739/)), mas a hipertrofia de glúteo foi parecida ([Plotkin et al. 2023, PubMed 37877099](https://pubmed.ncbi.nlm.nih.gov/37877099/)). O Barbalho 2020 não é usado por ter os dados questionados. |
| **Posterior de coxa** | flexora sentada = 3; flexora deitada = 2; stiff e terra romeno = 3 | A flexora sentada cresceu ~14% contra ~9% da deitada ([Maeo et al. 2021, PubMed 33009197](https://pubmed.ncbi.nlm.nih.gov/33009197/)). O nórdico prioriza o semitendinoso; a extensão de quadril, a cabeça longa do bíceps femoral ([Bourne et al. 2017, PubMed 27467123](https://pubmed.ncbi.nlm.nih.gov/27467123/)). |
| **Panturrilha** | em pé (máquina, halter, leg press, burrinho) = 3; sentado = 2 | Em pé, o gastrocnêmio cresceu 9–12% contra ~1% sentado; o sóleo cresceu igual ([Kinoshita et al. 2023, PubMed 38156065](https://pubmed.ncbi.nlm.nih.gov/38156065/)). |
| **Abdômen** | roda, elevação de pernas, abdominal infra, abdominal na polia e na máquina = 3; crunch, prancha e dead bug = 2 | Roda abdominal, elevação de joelhos suspensa e abdominal reverso tiveram mais EMG que o crunch ([Escamilla et al. 2006, PubMed 16649890](https://pubmed.ncbi.nlm.nih.gov/16649890/)). Polia e máquina ficam com 3 pela carga progressiva (sem estudo direto). |

Notas sem estudo direto seguem o critério do movimento (articulação, ângulo e pegada) e estão marcadas acima como tal.

## Volume por subparte

Quando a pessoa registra um exercício **diferente do planejado**, seja por troca forçada ou por troca no registro, o volume vai para as **subpartes reais do exercício feito**, não para as do planejado:
- `creditoSubpartes` e `volumeSubpartes` (`semana-volume.ts`): nota 3 = 1 série, nota 2 = 0,5 série, nota 1 = 0 (`CREDITO_NOTA`). O orçamento por músculo continua pelo músculo do exercício feito (`set_log.muscle`).
- Base: na meta-regressão de dose-resposta, contar a série indireta como 0,5 foi o que melhor previu hipertrofia e força ([Pelland et al., Sports Med, PubMed 41343037](https://pubmed.ncbi.nlm.nih.gov/41343037/)).
- `trocasDoDia` acha a troca: um item planejado não feito e um exercício feito fora do plano, no mesmo grupo grande, sem a mesma subparte principal.
- `planWeek` repõe a subparte no 1º dia aberto seguinte que já treina aquele grupo (`DayInput.repor`). As séries vão só até o que falta na semana: nunca compensa em dobro (regra 4 do CLAUDE.md).
- O porquê vai no topo do treino daquele dia (Semana e Treino), por `motivoReposicao`: "Ombro posterior entrou na quinta: na terça você trocou crucifixo inverso com halteres por desenvolvimento com halteres." O Hoje pode usar a mesma função depois.

## Exercícios mais comuns

Campo `popularidade` (1 a 5). Ele **não** entra na eficiência: só ordena a lista do "Meu treino atual" e desempata a escolha para iniciante (`POPULAR_PESO`).

Base: parcela das séries registradas no [StrengthLog](https://www.strengthlog.com/most-popular-exercises/) (26/11/2025, mais de 700 mil usuários). A página publica só o top 25:

| # | Exercício | Parcela | | # | Exercício | Parcela |
|---|---|---|---|---|---|---|
| 1 | supino com barra | 9,7% | | 14 | barra fixa | 1,7% |
| 2 | agachamento | 7,0% | | 15 | remada sentada | 1,6% |
| 3 | levantamento terra | 5,0% | | 16 | tríceps corda | 1,5% |
| 4 | puxada | 3,8% | | 17 | mesa flexora | 1,3% |
| 5 | desenvolvimento | 3,4% | | 18 | remada com halter | 1,3% |
| 6 | remada curvada | 3,2% | | 19 | desenvolvimento com halteres | 1,3% |
| 7 | elevação lateral | 2,7% | | 20 | terra romeno | 1,3% |
| 8 | cadeira extensora | 2,5% | | 21 | cadeira flexora | 1,2% |
| 9 | leg press | 2,2% | | 22 | rosca martelo | 1,1% |
| 10 | rosca com barra | 2,1% | | 23 | crossover | 1,1% |
| 11 | tríceps pulley com barra | 2,0% | | 24 | supino com halteres | 1,0% |
| 12 | supino inclinado com halteres | 1,9% | | 25 | face pull | 1,0% |
| 13 | rosca com halteres | 1,7% | | | | |

- **Diferenças por sexo** (StrengthLog): homens fazem 30% mais supino e 71% mais rosca com barra. Mulheres fazem 42% mais leg press e ~8× mais hip thrust (2,0%, 10º lugar entre elas). Só no top delas entram búlgaro (1,4%), stiff e abdutora (1,0%). Resumo por sexo também em [The Barbell](https://thebarbell.com/most-performed-exercises/) (15/11/2024, com os dados do StrengthLog).
- **Por idade** ([BurnFit](https://burnfit.io/en/blog-en/top-10-gym-workouts-by-age-group-burnfit-data-analysis/), sem data, provavelmente 2026): o supino é o 1º até os 20 e poucos anos. A partir dos 30, a puxada passa o supino (14,6% vs. 13,2%). Nos 50+, o supino cai para 3º, atrás da esteira.
- **Escala:** 5 = 2,5% ou mais; 4 = 1,5% a 2,4% (inclui o hip thrust, pelo público feminino); 3 = 1,0% a 1,4%; 2 = comum, mas fora do top 25 (variações em máquina, cabo e halter); 1 = acessório ou fortalecimento.
- **Viés:** são logs de apps de força. Barra e academia aparecem mais; abdominal, panturrilha e aparelhos simples aparecem menos do que se faz de fato.
- **Catálogo:** todos os exercícios do top 25 e os do top das mulheres já estavam no catálogo, com ID do free-exercise-db e imagem. O búlgaro é o `Split_Squat_with_Dumbbells`. Nenhum exercício novo foi preciso.

## Como o gerador usa as notas

Termos somados ao score de `candidates()` (`plan-day.ts`). Nada disso fura aparelho, dor ou `avoid`, que são filtros e vêm antes.

| Constante | Valor | O que faz |
|---|---|---|
| `FAMILIAR` | +4 | o exercício está no "Meu treino atual" (forte; fica abaixo só do "sempre esse" fixado à mão, +5) |
| `FAMILIAR_FRACO` | +1,5 | o texto livre da pessoa casa com o nome ou apelido do exercício |
| `EFICIENCIA_PESO` | +1 × nota | nota de eficiência na subparte alvo (`ALVO_PADRAO`: o orçamento "ombro" mira o lateral; sem alvo, a melhor subparte do músculo) |
| `POPULAR_PESO` | +0,05 × popularidade | só para iniciante (nunca treinou ou "estou começando"), só como desempate |
| `REPOSICAO` | +4,5 | exercício principal (nota 3) da subparte que uma troca forçada deixou sem estímulo |
| `CREDITO_NOTA` | 1 · 0,5 · 0 | crédito por série das notas 3, 2 e 1 (seção "Volume por subparte") |

- **Por que priorizar o que a pessoa já faz:** exercícios escolhidos pela própria pessoa foram percebidos como mais agradáveis, com o mesmo esforço, e ela tende a escolher bem ([PubMed 40505704](https://pubmed.ncbi.nlm.nih.gov/40505704/)). Teste: com o treino atual cadastrado e a academia permitindo, ≥ 70% dos exercícios da semana vêm dele.
- **Trocar** (`alternativas`): só lista a **mesma subparte principal**, nesta ordem: o que a pessoa já faz, eficiência naquela parte, aparelho livre (academia cheia) e ordem do catálogo. "Trocar por outra parte do músculo" mostra o resto do grupo grande com o aviso de que a semana repõe a parte que sair.
- **Sem cadastro, nada muda:** o "Meu treino atual" é opcional e não entra em `faltaParaGerar` nem em `validarParaGerar`.
