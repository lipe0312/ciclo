# 09 · Base científica do gerador

De onde vêm as notas e as constantes que escolhem os exercícios. Começou na #74 (eficiência por subparte, popularidade, "Meu treino atual" e Trocar na mesma parte); a #65 (gerador determinístico, validador e IA revisora, seção "Gerador determinístico e validador") usa o mesmo ranqueamento.

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

## Gerador determinístico e validador (#65)

O treino tem que sair **válido sem IA e sem gasto**. Em `packages/core/src/gerador.ts` há três peças separadas, todas puras e determinísticas:
1. `faixasSemana(perfil)`: a régua. Define os dias, a divisão, o alvo e a faixa de séries de cada músculo só a partir das entradas (perfil, sexo, prioridades, aparelhos ou academia, dias, minutos e dores).
2. `gerarSemana(perfil)`: monta a semana dentro da régua. Nunca devolve uma semana inválida: o teste de propriedade roda 600 perfis aleatórios com seed fixa e todos passam no validador.
3. `validarSemana(semana, perfil)`: confere qualquer semana, seja do gerador, da IA ou editada, e lista as violações com código (`frequencia`, `volume_min`, `volume_max`, `tempo`, `ordem`, `padrao`, `dor`, `aparelho`, `catalogo`, `fora`, `reps`, `descanso`, `series`, `dia`, `repetido`, `evitar`).

Cada constante do código tem um comentário que aponta para a seção abaixo, e um teste confere se a seção existe. **Os números são ponto de partida, não uma prescrição:** os check-ins semanais ajustam o volume (`adjustVolume`).

### Volume semanal

- **Alvo:** `weeklyTargets` (base do músculo + nível + 4 séries nas prioridades). Fica entre 4 e 20 séries por semana, com teto `VOLUME_TETO` de 20 para homem e 22 para mulher.
- **Base:** há uma relação dose-resposta entre séries semanais e hipertrofia: 10 ou mais séries por músculo por semana renderam mais que menos de 5 ([Schoenfeld, Ogborn & Krieger 2017, J Sports Sci, PubMed 27433992](https://pubmed.ncbi.nlm.nih.gov/27433992/)). A meta-regressão mais recente confirma o ganho com mais volume, mas com retorno decrescente ([Pelland et al., Sports Med, PubMed 41343037](https://pubmed.ncbi.nlm.nih.gov/41343037/)). O teto de cerca de 20 é prudência: acima disso, a evidência é fraca e a recuperação pesa.
- **Músculo fora da semana:** só sai por falta de aparelho, por dor, por falta de variedade (há um único exercício e só dias seguidos) ou por tempo. Prioridade nunca sai por tempo. Para manter o que já foi ganho basta bem menos volume: cerca de 1/3 manteve a hipertrofia em jovens ([Bickel et al. 2011, Med Sci Sports Exerc, PubMed 21131862](https://pubmed.ncbi.nlm.nih.gov/21131862/)). Por isso, com pouco tempo, quem perde volume são os músculos que não são prioridade.
- **Faixa aceita pelo validador:** de `min` a `max`, em que `max` é o alvo e `min` é o volume da determinística menos `FOLGA_IA`, nunca abaixo de 2.

### Frequência

- **`FREQ_MIN` = 2** sessões por músculo por semana. Treinar 2× por semana deu mais hipertrofia que 1× ([Schoenfeld, Ogborn & Krieger 2016, Sports Med, PubMed 27102172](https://pubmed.ncbi.nlm.nih.gov/27102172/)). Com o volume igualado, a frequência importa pouco ([Schoenfeld, Grgic & Krieger 2019, J Sports Sci, PubMed 30558493](https://pubmed.ncbi.nlm.nih.gov/30558493/)), mas 2× é o jeito prático de distribuir 10 ou mais séries sem sessões longas demais.
- **`DIAS_MIN` = 2:** com 1 dia não dá 2×, então a semana é montada com 2 dias e o app avisa.
- **Divisão por número de dias:** é a mesma do app. Com 1 ou 2 dias, corpo inteiro. Com 3, superior, inferior e corpo inteiro. Com 4 ou mais, alterna superior e inferior, começando pelo grupo da 1ª prioridade. Variar entre dias do mesmo tipo fica para a #90.

### Volume por sessão

- **`SESSAO_MAX`:** até 6 séries de uma prioridade e até 4 dos demais músculos por sessão. **`SERIES_ITEM_MAX` = 6** séries do mesmo exercício.
- **Critério do app**, com os mesmos tetos do `planDay`. O retorno decrescente do volume ([Pelland et al., PubMed 41343037](https://pubmed.ncbi.nlm.nih.gov/41343037/)) e a frequência de 2× (seção "Frequência") favorecem repartir as séries da semana em vez de acumular tudo numa sessão.

### Repetições

- **`REPS_FAIXA` = 5–30**, perto da falha. Cargas baixas e altas deram hipertrofia parecida quando as séries chegam perto da falha ([Schoenfeld et al. 2017, J Strength Cond Res, PubMed 28834797](https://pubmed.ncbi.nlm.nih.gov/28834797/)). A revisão do contínuo de repetições recomenda de 6 a 30 ou mais repetições para hipertrofia ([Schoenfeld et al. 2021, Sports, PubMed 33671664](https://pubmed.ncbi.nlm.nih.gov/33671664/)). O app aceita a partir de 5 para os compostos pesados.
- **`ISOMETRICOS`** (prancha): contam segundos, não repetições. Ficam fora do gerador e da checagem de repetições.

### RIR

- **`RIR_PADRAO` = 1–2** repetições em reserva no treino normal. O "mais leve hoje" usa 3 (`LEVE_RIR`).
- **Base:** a escala de RPE por repetições em reserva é válida para autorregular a carga ([Zourdos et al. 2016, J Strength Cond Res, PubMed 26049792](https://pubmed.ncbi.nlm.nih.gov/26049792/)). Ir até a falha não trouxe ganho claro de hipertrofia em relação a parar perto dela ([Refalo et al. 2023, Sports Med, PubMed 36334240](https://pubmed.ncbi.nlm.nih.gov/36334240/)). Parar com 1–2 em reserva dá quase todo o estímulo com menos fadiga.

### Progressão

- **Regra do app** (dupla progressão em `loads.ts` e `weekProgression`): primeiro sobem as repetições dentro da faixa; quando a pessoa chega ao topo, sobe a carga.
- **Base:** progredir pela carga ou pelas repetições deu hipertrofia parecida ([Plotkin et al. 2022, PeerJ, PubMed 36199287](https://pubmed.ncbi.nlm.nih.gov/36199287/)).

### Deload

- **Regra do app** (`deloadCheck`, `BLOCK_LOAD_WEEKS` = 4 e `DELOAD_FACTOR` = 0,6 em `semana-volume.ts`): depois de um bloco de 4 semanas, ou se as cargas estagnarem, uma semana com cerca de 60% do volume.
- **Base:** no consenso Delphi, o deload é uma redução planejada de volume ou intensidade a cada 4–8 semanas, por cerca de uma semana ([Bell et al. 2023, Sports Med Open, PubMed 37730925](https://pubmed.ncbi.nlm.nih.gov/37730925/)). Uma semana de pausa no meio de 9 semanas não mudou a hipertrofia, mas tirou um pouco de força ([Coleman et al. 2024, PeerJ, PubMed 38274324](https://pubmed.ncbi.nlm.nih.gov/38274324/)). Por isso o deload do app reduz o volume, mas não para o treino.

### Descanso

- **`DESCANSO_FAIXA` = 45–180 s.** O descanso de cada exercício vem do catálogo: 120–180 s nos compostos pesados e 45–75 s nos isolados.
- **Base:** descansar 3 min deu mais hipertrofia que 1 min em homens treinados ([Schoenfeld et al. 2016, J Strength Cond Res, PubMed 26605807](https://pubmed.ncbi.nlm.nih.gov/26605807/)). Na revisão sistemática, intervalos curtos funcionaram bem em isolados e em quem tolera fadiga ([Grgic et al. 2017, Eur J Sport Sci, PubMed 28641044](https://pubmed.ncbi.nlm.nih.gov/28641044/)).

### Tempo por série

- **`MIN_POR_SERIE` = 3 min por série, já com o descanso**, o mesmo valor do `planDay`. O dia cabe nos minutos do perfil: séries × 3 ≤ minutos. **`MINUTOS_MIN` = 20**, o mesmo piso do perfil.
- É critério do app, não vem de estudo: 40–60 s de execução + 1–2,5 min de descanso, arredondados para cima.

### Ordem

- **Compostos antes dos isolados no dia.** Composto é o exercício com padrão multiarticular (`PADROES_COMPOSTOS`: press_h, press_v, row, pull_v, squat, hinge), com fadiga 2 ou mais no catálogo, ou da lista `COMPOSTOS_EXTRA` (flexão e remada invertida). Depois disso, a ordem segue as prioridades.
- **Base:** o exercício feito primeiro rende mais repetições e força ([Simão et al. 2012, Sports Med, PubMed 22292516](https://pubmed.ncbi.nlm.nih.gov/22292516/)). Para hipertrofia, a ordem pesou pouco ([Nunes et al. 2021, Eur J Sport Sci, PubMed 32077380](https://pubmed.ncbi.nlm.nih.gov/32077380/)). Por isso o composto, que pede mais carga, vai antes, e a prioridade vem logo depois.

### Padrão em dias seguidos

- **Sem repetir o mesmo padrão** (`padraoDe`: a família do catálogo ou, sem família, o próprio exercício) **em dias seguidos do calendário.** O gerador só põe 2 exercícios do mesmo músculo no dia se ele não treina no dia seguinte. Assim sempre sobra um padrão para amanhã. Família de outro músculo (como o supino fechado, que é press_h do peito) fica fora do gerador. Músculo com um único exercício possível treina em dias não seguidos ou sai da semana com o motivo "variedade".
- **Base:** variar os exercícios dá hipertrofia igual ou maior e distribui o estresse nas articulações ([Kassiano et al. 2022, J Strength Cond Res, PubMed 35438660](https://pubmed.ncbi.nlm.nih.gov/35438660/)). A regra de dias seguidos é critério do app: evita repetir a mesma carga articular com menos de 48 h de intervalo.

### Diferenças por sexo

Decisão A do dono (#65): as faixas por sexo são **ponto de partida**, e os check-ins ajustam.
- **Mulher:** `FATOR_VOLUME_F` = +15% de volume (dentro dos +10–20%), `MAIS_REPS_F` = +2 repetições nas duas pontas da faixa e `DESCANSO_ISOLADO_F` = 60–90 s nos isolados.
- **Homem:** ponto de partida padrão. Sexo não informado usa o padrão.
- **Hipertrofia relativa semelhante:** homens e mulheres ganharam massa muscular relativa parecida; os homens ganharam mais em valor absoluto e as mulheres mais força relativa nos membros superiores ([Roberts, Nuckols & Krieger 2020, J Strength Cond Res, PubMed 32218059](https://pubmed.ncbi.nlm.nih.gov/32218059/)).
- **Mais resistência à fadiga e recuperação mais rápida entre séries:** em tarefas de intensidade submáxima, as mulheres costumam ser menos fatigáveis que os homens ([Hunter 2014, Acta Physiol, PubMed 24433272](https://pubmed.ncbi.nlm.nih.gov/24433272/)). Daí mais volume, mais repetições e descanso menor nos isolados. Nos compostos pesados o descanso continua o do catálogo.
- **Ciclo menstrual:** a evidência para mudar o treino pela fase é fraca. O desempenho cai pouco e de forma inconsistente no começo da fase folicular ([McNulty et al. 2020, Sports Med, PubMed 32661839](https://pubmed.ncbi.nlm.nih.gov/32661839/)). O app ajusta **pelos sintomas** ("mais leve hoje"), não pela fase.
- O +15% não tem estudo direto: é a tradução da decisão A em número, e os check-ins confirmam ou corrigem.

### Saúde e encaminhamento

Nada de diagnóstico. Os avisos só levam a um profissional (`saude` no perfil do gerador):
- **Gestação e pós-parto:** a atividade física é recomendada, mas com orientação individual ([Mottola et al. 2018, Br J Sports Med, PubMed 30337460](https://pubmed.ncbi.nlm.nih.gov/30337460/)). O aviso cita o **assoalho pélvico**, que pede atenção com cargas altas e impacto ([Bø & Nygaard 2020, Sports Med, PubMed 31820378](https://pubmed.ncbi.nlm.nih.gov/31820378/)).
- **RED-S (baixa energia):** cansaço persistente, menstruação que some e pouca comida para o volume de treino são sinais de alerta ([Mountjoy et al. 2023, Br J Sports Med, PubMed 37752011](https://pubmed.ncbi.nlm.nih.gov/37752011/)).
- **Ferro:** a deficiência é comum em mulheres que treinam ([Pedlar et al. 2018, Eur J Sport Sci, PubMed 29280410](https://pubmed.ncbi.nlm.nih.gov/29280410/)). O app não dá suplemento: fadiga fora do comum vai para um profissional e exame.

### IA revisora

- **Opcional e barata.** Com o Chat conectado, um modelo pequeno (`TIER_REVISAO` = haiku) recebe `pedidoRevisaoIA` (as regras, as faixas e a semana compacta `{id, sets}`) e só pode **revisar**.
- **Toda resposta passa pelo validador** em `aplicarRevisaoIA`. O código hidrata os IDs pelo catálogo e define repetições, descanso e ordem; se houver qualquer violação, fica a semana determinística. Sem IA (resposta nula), tudo funciona igual.
- **`IA_LIMITES`:** resposta com mais de 50 KB, mais de 7 dias ou mais de 30 itens num dia é recusada antes de qualquer leitura, e só valem IDs próprios do catálogo. É critério de segurança do app.
- **`FOLGA_IA` = 20%:** a IA pode tirar até 20% das séries de um músculo em relação à determinística (por exemplo, para trocar por um exercício melhor), mas nunca passar do alvo, deixar de fazer 2× nem tirar músculo sem motivo. É critério do app.

## Exercícios por tempo
#106. A série guarda `segundos` (1–3600) ou `reps`, conforme a `medida` do exercício no catálogo (`packages/core/src/medida.ts`). A série por tempo conta como série no volume semanal e fica fora do volume kg × reps e do e1RM. O recorde dela é o maior tempo. Critério (ACSM, NSCA e uso comum): o isométrico é medido em tempo; o exercício cíclico de condicionamento pode ser medido em tempo ou em reps.

| Exercício (ID) | Medida | Começa em |
|---|---|---|
| Prancha (`Plank`) | só tempo | tempo |
| Prancha lateral (`Side_Bridge`, novo) | só tempo | tempo |
| Polichinelo (`Star_Jump`, novo; imagem do *star jump* do free-exercise-db) | tempo ou reps | tempo |

Os outros itens da lista da issue não estão no catálogo de força: hollow hold, cadeirinha na parede, dead hang, L-sit, superman isométrico, ponte de glúteo isométrica, mountain climber, skipping, farmer walk, burpee, abdominal bicicleta e agachamento sem carga. Pular corda é cardio (registrado em minutos). A ponte de glúteo do catálogo é dinâmica e continua em reps. Para incluir um deles: o item no catálogo com `medida`, as 2 imagens, o texto e uma linha nesta tabela. Os novos ficam fora da montagem automática (`planOff`).

Imagens dos novos (`apps/web/public/img/ex/Side_Bridge.webp`, `Side_Bridge-1.webp`, `Star_Jump.webp`, `Star_Jump-1.webp`): free-exercise-db (github.com/yuhonas/free-exercise-db), licença Unlicense (domínio público), mesma origem das outras do catálogo. Foram geradas por `scripts/catalogo-imagens.mjs`.
