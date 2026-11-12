# Requisitos v3: o que muda depois do protótipo

> 09/11/2026. Este documento reúne os pedidos da revisão do protótipo, já lapidados e ligados ao objetivo. O status de cada item mostra onde ele está no código.
> Legenda: ✅ no código · 🧪 só demonstração · 📋 issue aberta

## 0. O objetivo manda em tudo
**"Braços e ombros maiores mantendo a cintura"**, com prazo e números: em 12 semanas, braço +1,5 cm, cintura igual (±1 cm), peso +1,5 kg e 2× por músculo em ≥ 80% das semanas.

Regras que saem disso:
- **Um objetivo principal só**, com no máximo **3 músculos prioritários** em ordem. Tudo o que o app decide (corte por falta de tempo, compensatório, trocas, alerta de revisão) protege as prioridades primeiro. ✅ `plan-day.ts`
- O objetivo aparece **no topo do Hoje**, com progresso de braço, cintura e frequência. ✅
- A medida que importa é a **fita métrica** (braço contraído e cintura no umbigo, a cada 15 dias), não o peso do dia. ✅ tela Corpo
- Cada tela responde a uma pergunta só. Se uma função não ajuda o objetivo, vai para "Vida" (módulos futuros).

## 1. Perfil ("Ponto de partida", antigo "Cadastro")
O cadastro virou **Perfil · Ponto de partida**: uma lista limpa de 9 seções, cada uma com um resumo de uma linha. Toca, edita e volta. Não existe "terminar o cadastro"; ele começa preenchido com padrões sensatos.

| Seção | O que mudou |
|---|---|
| **Você** | "Como você se vê" passou de 3 para **8 opções com descrição**: muito magro, magro, magro com barriga (falso magro), normal, atlético, forte com gordura, acima do peso, bem acima. Entrou também **onde acumula gordura**. Isso calibra o ritmo de ganho e o alerta de cintura. ✅ |
| **Objetivo** | **6 objetivos em cartões**, um de cada vez. Escolher um sugere as prioridades (editáveis, até 3 em ordem), o horizonte (8/12/16 semanas) e as metas (braço, cintura, peso). A frase do objetivo é gerada e fica fixa no topo. ✅ |
| **Experiência e cargas** | Cargas lembradas: opcional e leve. São até 4 "âncoras" (supino, puxada, rosca, desenvolvimento, leg press, agachamento, remada, elevação lateral) com kg × reps e o nível de certeza ("certeza" ou "aprox."). O app estima o resto **pela família do movimento** (razões em `catalog.ts`) com margem de segurança de 10–18%. Sem âncora, a 1ª série é de **calibração**, deixando 3 repetições sobrando. Depois do 1º treino, quem manda é a **dupla progressão**. ✅ `loads.ts` |
| **Rotina** | Dias habituais, meta por semana, duração, **semana flexível ou fixa**, início da semana (seg/dom) e horário. ✅ |
| **Academias** | Várias academias ("Academia 1", "Academia 2", "Casa", + nova), cada uma com **grade de aparelhos com imagem**, horários em que lota e **academia padrão por dia da semana**. O dia pode trocar de academia no Hoje. ✅ |
| **Preferências** | **Por músculo**: livre, máquina, cabo ou tanto faz. "Faço melhor este" (fixa o exercício), lista de "evitar", formato padrão (normal, superséries, circuito) e estratégia para academia cheia. ✅ |
| **Corpo e dores** | Atalho para o mapa de dor e mobilidade (agachar fundo, braço acima da cabeça). ✅ |
| **Comida** | Dia típico **falado ou escrito**, modo de registro, restrições e suplementos. ✅ |
| **Claude** | Autonomia, **modelo por tipo de pedido**, tom e horário da revisão. ✅ |

## 2. Hoje: semana flexível, treino do dia e check-in
### 2.1 Check-in diário: o dado mais importante
- **5 toques + peso opcional**, menos de 10 segundos: sono (≤5–9h+), energia, dor muscular, estresse e comida de ontem (menos/normal/mais). ✅
- Fica **em destaque (borda verde-limão) enquanto o de hoje não for feito**. Uma faixa com os 7 dias mostra os buracos (âmbar), e tocar num dia passado permite preencher depois. Ao salvar, o app pula para o próximo dia pendente. ✅
- Mostra a **prontidão** (pronto / ok / segurar) com uma recomendação (ex.: "segurar" → expresso ou −1 série). ✅ `checkin.ts`
- A **revisão de domingo** usa a cobertura do check-in (ex.: "6/7 dias"). Com menos de 4 dias, a revisão avisa que está "no escuro".

### 2.2 Semana flexível
- A semana é um **orçamento de séries por músculo**. Os controles do dia são:
  - **dias que ainda dá** (1–4);
  - **tempo** (30–90);
  - **academia de hoje**;
  - **foco de hoje** (automático, ombros, braços, peito, costas, pernas);
  - **academia cheia**;
  - **formato** (normal, superséries, circuito). ✅
- **"Quero malhar ombro hoje"** = escolher o foco. O dia vira "Foco: ombro lateral", o ombro abre a sessão com ≥ 4 séries e **o resto da semana se reorganiza sozinho** pelo orçamento. ✅
- **Compensatório só a pedido.** Quando sobra 1 dia e o outro grupo ainda não fez 2×, aparece um cartão "Só sobrou hoje?" com **Gerar compensatório** ou **Expresso**. Nada muda sem o toque. ✅
- Treino editado por você ou montado pelo Claude fica **travado**: mexer nos controles não apaga o treino sem você pedir ("refaz o treino"). ✅

### 2.3 Treino: cronômetro e proteção contra esquecimento
- **Começar = "fui".** A presença é gravada no início, não no fim. ✅
- **Fecha sozinho em 2 h** se você esquecer: o cron do servidor a cada 30 min, mais a checagem ao abrir o app. Fica o que foi registrado, e exercício sem série vira "não registrado", não "não fiz". ✅ `session.ts`
- **Cronômetro** do treino no topo (fixo), mais o **descanso automático** ao concluir cada série. O descanso tem o tempo do exercício, 15 s entre os dois de uma supersérie, 30 s no circuito, mais "+15" e "ok". No fim do descanso o app **vibra, apita e notifica** (se a tela apagou e a notificação foi permitida). A **tela fica acesa** durante o treino (Wake Lock). ✅
- Cada série tem **kg e reps já preenchidos** pela dupla progressão ou pela estimativa inicial, o anterior ao lado e ✓. Dá para pôr "+ série". ✅
- **"Não fiz"** por exercício, com motivo (ocupado, dor, sem tempo, não quis, outro). "Dor" leva ao mapa de dor e "ocupado" sugere trocar. ✅
- **Trocar**: as alternativas já vêm calculadas (mesmo músculo, aparelho disponível, sua preferência, dor e academia cheia), **sem gastar Claude**. Opções: "só hoje" ou "sempre". ✅
- **Editar manualmente** ("eu conheço e faço melhor"): troca por qualquer exercício do músculo **ou por um seu, fora do catálogo**, e muda séries e reps. O validador mostra erros e avisos **antes** de aplicar. Aplicou, vale na hora e entra em **revisão do Claude**, que respeita a escolha e só aponta riscos. ✅ `validate.ts` + `plan_edit`
- **Fim do treino (15 s)**: pump **por músculo**, esforço geral, dor articular (sim leva ao mapa) e a lista do que ficou "sem registro", que dá para marcar como "não fiz". ✅

### 2.4 Pedir ao Claude (caixa de pedidos)
- **Biblioteca de pedidos prontos** por categoria (Hoje, Treino, Corpo, Comida, Plano), 16 no começo. Cada um tem o **modelo** indicado: ✅ `prompts.ts`

  | Modelo | Para quê | Exemplos |
  |---|---|---|
  | **Haiku** (barato, rápido) | registro e trocas simples | "só tenho 40 min", "academia cheia", "aparelho ocupado", "o que comi", "quanto falta de proteína" |
  | **Sonnet** | reorganizar o dia ou a semana | "hoje quero ombro", "gerar compensatório", "não gostei da dinâmica", "faço melhor outro exercício" |
  | **Opus** | decisões que importam | "senti dor na escápula", "revisar a semana", "novo bloco" |

- Texto livre é **classificado sozinho** (ação + modelo) e dá para trocar o modelo antes de enviar. ✅ `classify()`
- A resposta volta **ilustrada**: texto curto, um **diff** (− o que sai / + o que entra / séries e minutos antes → depois) e os botões **Aplicar** / **Descartar**. Aplicar muda o treino de hoje na hora. ✅ (🧪 respostas simuladas na demonstração)
- **Microfone** no campo de pedido. ✅

### 2.5 Mapa de dor (feedback crítico)
- Corpo **frente e costas** com regiões tocáveis: cervical, ombros, **escápulas E/D**, cotovelos, punhos, lombar, quadris, joelhos e tornozelos. Cada uma tem intensidade (leve/média/forte), tipo (articular, muscular, pontada, formigamento, cansaço), quando aparece, em qual exercício e uma nota. ✅
- **Efeito imediato no treino**:
  - sai todo exercício que força a articulação acima do limite (forte bloqueia qualquer estresse, leve só o alto);
  - entra **fortalecimento no aquecimento**: escápula → face pull, abertura com elástico, retração na barra, scaption; lombar → dead bug, ponte; ombro → rotação externa. ✅ `PREHAB`
- Na lista de dores: "Evitando: …", "Fortalecimento: …", e os botões **Melhorou** (−1) e **Passou**. ✅
- Aviso fixo: o app **adapta o treino, não diagnostica**. Dor forte, que piora, com formigamento ou que dura mais de 1–2 semanas pede profissional. Nos pedidos de dor, o Claude usa Opus.

## 3. Comida
- **Microfone com transcrição de qualidade**:
  - na nuvem: **Whisper large-v3-turbo do Workers AI**, grátis até ~200 min de áudio por dia (10 mil "neurons"). ✅ `/api/transcribe`
  - sem o binding: reconhecimento de voz do navegador (pt-BR). ✅
- Estimativa rápida no aparelho (tabela caseira) para dar retorno na hora. O registro vai para a caixa com Haiku, que confere com a TACO. ✅
- Só a proteína é meta rígida. As calorias são adaptativas pela tendência de peso (EMA α 0,1, ±150 kcal/semana, com o motivo na tela). ✅ `adaptiveTarget`

## 4. Mídia da sua academia
- Fica no **R2** (privado, 10 GB grátis, sem custo de saída), e não no banco. O banco guarda só os metadados (exercício, aparelho, academia, nota de regulagem). ✅
- Entra **na montagem do treino** de três jeitos:
  - botão **Gravar** no card do exercício;
  - pelo Claude Code: `ciclo_anexar_midia` com um arquivo do Mac (só das pastas Filmes, Imagens, Downloads e Mesa);
  - pelo chat, onde o Claude anota a regulagem. ✅
- As imagens de referência (free-exercise-db, domínio público) vão **dentro do app** em WebP (~10 KB cada, 704 KB no total), sem depender do GitHub. ✅

## 5. Custo do Claude: o Claude decide, o código monta
- O Claude responde com **JSON compacto**: só IDs do catálogo e números (`{id, sets}`). O servidor **valida** (aparelho, dor, tempo, prioridades) e **monta** o treino completo (nome, imagem, mídia, alternativas, descanso). Erro → recusa com a lista de problemas, e o Claude corrige. ✅ `hydrate` + `validateItems`
- Trocas, cortes por tempo, compensatório e cargas são **contas locais**, sem gastar mensagem.
- As ferramentas MCP devolvem resumos ("6 séries · 1×"), nunca tabelas cruas.

## 6. Ideias que entram depois (lapidadas)
1. **Dia de pump de braço (bônus de 20 min)**: quando a semana fecha em ≥ 90% e sobra um dia, sugerir uma sessão curta só de braços e ombro lateral. Isso não "compensa", é volume extra controlado (máx. +4 séries por músculo). 📋
2. **Indicador de cintura**: se a cintura subir mais de 1 cm em 4 semanas com peso subindo rápido, o Claude propõe −150 kcal antes de mexer no treino. 📋
3. **Calendário inteligente**: com o connector do Google Calendar, o Claude encaixa o treino nos buracos da semana e cria o evento. 📋
4. **Técnica por vídeo**: vídeo seu de uma série → comentário de amplitude e postura (Opus, sob demanda). 📋
5. **Modo fora de casa**: academia de hotel, que nasce vazia e é marcada em 30 s pela grade; mídia pedida aos poucos. 📋
6. **Semana de manutenção automática**: 3+ check-ins "segurar" seguidos → a semana vira manutenção (volume ×0,6) sem contar como falha. 📋
