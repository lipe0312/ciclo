> **Histórico (v2).** Documento de concepção que originou o projeto. O que vale hoje: [`01-requisitos-v3.md`](01-requisitos-v3.md) e o código. Algumas escolhas mudaram (ex.: front sem Next.js, MCP próprio no Worker).

# Sistema Pessoal de Treino + Dieta Flexível, administrado pelo Claude

> Continuação de `quiz-analise-e-criador-de-treinos.md`. Uso pessoal agora, com o código organizado para um deploy no futuro.
> Data: 09/11/2026 · **v2 (09/11/2026, tarde)**.
>
> **O que mudou na v2**
> 1. **Abre na academia mesmo com o Mac desligado.** O app e o banco ficam na nuvem gratuita da Cloudflare: Workers + D1 + R2, com login por Cloudflare Access. Detalhes em §0 e §2.
> 2. **O MCP agora tem dois transportes com as mesmas ferramentas:**
>    - **remoto**, como connector personalizado do claude.ai. Funciona no app do Claude no celular.
>    - **stdio local**, no Claude Code. Serve para subir arquivos do Mac, como fotos e vídeos da academia.
> 3. **Semana flexível.** A semana deixa de ser um calendário fixo e vira um orçamento de séries por músculo. Se você foi 2 dias e só consegue ir mais hoje, o treino de hoje é remontado com o que falta (§4.7).
> 4. **Academia com imagens no cadastro.** Fotos e vídeos do **seu** aparelho entram na montagem do treino, pelo MCP (§7.5).
> 5. Protótipo em `prototipo/index.html`, rituais novos (§14), módulos de vida (§15) e checklist do repositório público (§16).

---

## 0. A ideia em uma frase

É um **app web (PWA)** com seus treinos, a marcação de "fui / não fui", a dieta e os gráficos. Ele roda **na nuvem gratuita da Cloudflare**, então abre na academia mesmo com o Mac desligado. Um **servidor MCP** liga esse banco ao Claude:

- como **connector personalizado** no claude.ai, no Desktop e no celular;
- como **stdio** no Claude Code.

O Claude **monta, ajusta e acompanha** os treinos usando **a sua assinatura**, sem chave de API. O app **não chama a IA**: ele só mostra e coleta dados. O Claude é o "treinador" que lê e escreve no banco pelas ferramentas.

```
   celular (PWA)            claude.ai · Desktop · app do Claude         Claude Code (Mac)
  Hoje · Treino ·           (sua assinatura) — connector remoto        (sua assinatura)
  Dieta · Cadastro                       │                              │ MCP stdio (proxy fino
        │ HTTPS                          │ HTTPS /mcp + token           │ + upload de arquivos locais)
        ▼                                ▼                              ▼
 ┌─────────────── Cloudflare Worker "ciclo" (grátis) ──────────────────────────────┐
 │  /           → app (React + Vite, arquivos estáticos)                           │
 │  /api/*      → API (Hono)        ┐                                              │
 │  /mcp        → servidor MCP      ┼─► packages/core (regras determinísticas)     │
 │  cron        → fechar dia, lembretes (sem IA)                                   │
 └─────┬───────────────────────────┬───────────────────────────────────────────────┘
       ▼                           ▼
   D1 (SQLite)                 R2 (fotos e vídeos dos aparelhos, fotos de progresso)
   treinos, dieta, inbox       10 GB grátis, sem custo de saída
 Login: Cloudflare Access (código por e-mail, só o seu) · /mcp: token próprio ou OAuth
```

**Regra de ouro (veio da análise do quiz):** *o Claude sugere, o código valida*. Contas de volume, progressão, calorias e trocas de exercício são feitas em código (dá sempre o mesmo resultado). O Claude escolhe, explica, interpreta o que você escreveu ("comi 2 pães com ovo") e conversa com você.

---

## 1. Referências para copiar (pesquisadas)

| Camada | O que usar | Por quê |
|---|---|---|
| Base de exercícios | [yuhonas/free-exercise-db](https://github.com/yuhonas/free-exercise-db) | 800+ exercícios, JSON por exercício, imagens, campo `equipment`, **domínio público**. Imagens servidas do GitHub raw. |
| Base maior (com vídeo) | [Snouzy/workout-cool](https://news.ycombinator.com/item?id=44309320) | MIT, 1200+ exercícios com vídeo e tradução. Bom para copiar o modelo de dados e a UI. |
| Alimentos (Brasil) | [brolesi/taco](https://github.com/brolesi/taco) | TACO 4ª ed. normalizada **+ medidas caseiras POF/IBGE** ("1 colher de sopa", "1 unidade") — essencial para registro aproximado. JSON estático, sem chave. |
| Alimentos (alternativa) | [marcelosanto/tabela_taco](https://github.com/marcelosanto/tabela_taco) | Um único JSON simples com macros. |
| MCP de alimentos pronto | [matheusbuniotto/taco-mcp](https://github.com/matheusbuniotto/taco-mcp) · [ianhudsonai/taco-br-mcp](https://github.com/ianhudsonai/taco-br-mcp) | Dá para usar direto ou copiar as ferramentas de busca/cálculo. |
| MCP de fitness local (SQLite) | [MayankKapgate/fitness-tracker-mcp](https://glama.ai/mcp/servers/MayankKapgate/fitness-tracker-mcp) | Exatamente o padrão "offline + SQLite + stdio". Base para o seu MCP. |
| MCP de treino (ferramentas) | [chrisdoc/hevy-mcp](https://github.com/chrisdoc/hevy-mcp) · [arekminajj/mcp-hevy](https://github.com/arekminajj/mcp-hevy) | Copiar **nomes e formato das ferramentas** (rotinas, treinos, PRs, volume por músculo, equilíbrio). |
| MCP de nutrição | [edp8489/nutrition-tracker-mcp](https://github.com/edp8489/nutrition-tracker-mcp) · [neonwatty/food-tracker-mcp](https://glama.ai/mcp/servers/@neonwatty/food-tracker-mcp/tree/27c5e83534964cb2ea3c62f2362a9377a1c48311) | Receitas, refeições, busca com FTS no SQLite. |
| Lógica de ajuste de volume | **MyFit** (PWA inspirado no RP Hypertrophy App, AGPL) — listado em [awesome-health-fitness-oss](https://github.com/Dieterbe/awesome-health-fitness-oss) | Ajuste de séries por músculo a partir de **pump / dor muscular / desempenho**. |
| UX de registro de séries | Hevy, Strong, [LiftLog](https://liftlog.online/), [pawan67/lift](https://github.com/pawan67/lift) (local-first, estilo Hevy) | Tela de treino ativo: linhas de série com o alvo pré-preenchido, timer de descanso, ✓ por série. |
| Progressão programável | **Liftosaur** ("Liftoscript") | Ideia: cada exercício tem uma **regra de progressão declarada** (texto/JSON) em vez de lógica escondida. |
| Mais apps | [Dieterbe/awesome-health-fitness-oss](https://github.com/Dieterbe/awesome-health-fitness-oss) · [wger](https://github.com/wger-project/wger) (Django, treino + nutrição, self-hosted) | Modelos de dados de referência. |
| Dieta adaptativa | Conceito do MacroFactor | Gasto calórico **estimado de trás para frente** a partir da tendência do peso e do que você comeu (aproximado). Funciona mesmo com registro imperfeito. |

---

## 2. Stack recomendada (v2: nuvem gratuita)

### 2.1 Onde hospedar de graça: comparação
Requisitos:
- abrir na academia com o Mac desligado;
- login simples;
- guardar fotos e vídeos;
- connector do Claude com URL pública;
- custo R$ 0.

| Opção | App | Banco | Arquivos (fotos/vídeos) | Login | Pontos fracos |
|---|---|---|---|---|---|
| **A. Cloudflare (recomendada)** | Workers + Static Assets (100 mil req/dia) | **D1** (SQLite: 5 GB, 5 mi leituras e 100 mil escritas por dia) | **R2**: 10 GB, **saída grátis** | **Cloudflare Access**: até 50 usuários grátis, código de uso único por e-mail, sem escrever código de login | Limite de CPU por requisição: as regras precisam ser leves (são). Next.js exige o adaptador OpenNext, por isso a recomendação é Vite + Hono |
| B. Vercel + Turso | Next.js (Hobby: grátis, só uso não comercial) | Turso (5 GB, 500 mi leituras por mês) | Vercel Blob: só 1 GB | Auth.js / Better Auth (você escreve) | Pouco espaço para vídeo; login fica por sua conta; o Hobby proíbe uso comercial |
| C. Supabase + Vercel | Next.js | Postgres 500 MB | 1 GB | Supabase Auth pronto | **O projeto pausa após 7 dias sem uso** (ruim para quem viaja ou fica uma semana sem treinar) |
| D. Mac + Tailscale/Cloudflare Tunnel | local | SQLite local | disco | Tailscale | **Precisa do Mac ligado**. Era o plano v1; não atende mais |

**Escolha: A (Cloudflare).** É tudo em uma conta só, os vídeos cabem (um clipe de 10 s em 720p tem ~3–5 MB, então 10 GB dão mais de 2.000 clipes) e o login sai sem código. O MCP remoto roda no mesmo Worker. A própria Cloudflare tem modelos prontos de MCP remoto (`remote-mcp-authless` e `remote-mcp-github-oauth`).

**Dados:** o repositório é público, mas os **dados nunca entram no git**. Peso, medidas, fotos e o que você comeu ficam só no D1/R2, atrás do login. O repositório leva só código e dados de exemplo fictícios (§16).

### 2.2 Peças
| Peça | Escolha | Motivo |
|---|---|---|
| Monorepo | **pnpm workspaces** | `apps/web`, `apps/worker`, `apps/mcp-local`, `packages/core`, `packages/db` |
| Web | **React + Vite + Tailwind + shadcn/ui** (PWA) | Leve, arquivos estáticos servidos pelo Worker, sem servidor de render |
| API | **Hono** no Worker | Pequeno, tipado, roda em Workers/Node/Bun (dá para sair da Cloudflare se precisar) |
| Gráficos | **SVG próprio** (barras, sparkline) + Recharts só onde precisar | O protótipo já usa só SVG/CSS |
| Banco | **D1 + Drizzle ORM** (`drizzle-orm/d1`) | SQLite: as mesmas migrations rodam no local (`wrangler dev`) e em produção. Sair para Turso/libsql é trocar o driver |
| Arquivos | **R2** com upload por URL assinada | O celular sobe direto do navegador; o MCP local sobe arquivos do Mac |
| MCP remoto | **@modelcontextprotocol/sdk** + `agents/mcp` (McpAgent) no mesmo Worker, rota `/mcp` | Connector personalizado no claude.ai também funciona no app do celular |
| MCP local | `apps/mcp-local` (stdio): repassa as ferramentas para a API e acrescenta ferramentas de arquivo (`attach_media` com caminho local) | Claude Code no Mac, sem API |
| Validação | **zod** (os mesmos schemas no web, na API, no MCP e no core) | O Claude manda JSON e o zod rejeita o que estiver fora do formato |
| Login | **Cloudflare Access** na frente do app (código de uso único para o seu e-mail); `/mcp` fora do Access, com token Bearer (cabeçalho do connector) → depois OAuth (`workers-oauth-provider`) | Zero código de login no v1 |
| Tarefas agendadas | **Cron Triggers** do Worker (sem IA) + **rotinas do Claude Code na nuvem** (`/schedule`) para o que precisa de IA | O Mac pode ficar desligado (§8) |

Estrutura:
```
ciclo/
├─ apps/
│  ├─ web/                 # React + Vite (PWA) — telas
│  ├─ worker/              # Cloudflare Worker: serve o web, /api (Hono), /mcp, cron
│  └─ mcp-local/           # MCP stdio para o Claude Code (proxy + arquivos locais)
├─ packages/
│  ├─ core/                # regras puras (TS): volume, semana flexível, progressão, trocas, TDEE
│  └─ db/                  # schema Drizzle + migrations + seeds
├─ seeds/                  # free-exercise-db (subconjunto), equipment.json, TACO, dados fictícios
├─ prototipo/index.html    # protótipo visual (este)
├─ docs/                   # este documento, ADRs, DESIGN.md
├─ .claude/skills/         # /montar-plano, /treino-hoje, /comi, /revisao, /academia, /midia ...
├─ CLAUDE.md · LICENSE · README.md · wrangler.jsonc
```

---

## 3. O questionário completo (onboarding em 9 blocos)

Uma pergunta por tela (como o quiz do Fernando), barra de progresso, tela de "por que pergunto isso" após respostas-chave. Tudo salvo em `profile` + `profile_history` (você pode refazer a qualquer momento e o Claude vê o que mudou).

### Bloco 1 — Corpo e base
- Sexo, **data de nascimento** (idade exata, não faixa), altura, peso.
- Físico atual (fotos: magro / falso magro / sobrepeso / obeso) **e** % de gordura estimada por comparação visual (grade de fotos 10–25%).
- Medidas opcionais: braço relaxado e contraído, antebraço, ombro (circunferência), peito, cintura no umbigo, quadril, coxa.
- Fotos iniciais (frente/lado/costas) — ficam só locais.

### Bloco 2 — Histórico
- Há quanto tempo treina (meses), com que frequência real nos últimos 3 meses.
- Divisão que fazia (ABC, ABCDE, full body, nenhuma).
- **Cargas atuais** (ou "não sei") em 6 exercícios-base: supino, puxada, remada, desenvolvimento, rosca, agachamento/leg press. → gera o ponto de partida e a estimativa de 1RM (e1RM).
- Já ficou parado? Por quanto tempo? (memória muscular → progride mais rápido).

### Bloco 3 — Objetivo e prioridades (com ordem)
- Objetivo principal: ganhar massa · recomposição · secar · força · manter.
- **Ordenar** grupos por prioridade (arrastar): ex. 1. Braços 2. Ombros 3. Costas … → define volume (prioridade = mais séries, primeiro no treino, 3x/semana).
- Corpo-alvo (fotos) e "o que mais te incomoda no espelho".
- Ritmo aceito de ganho de peso: lento (+0,25 kg/mês, quase sem gordura) · moderado (+0,5) · rápido (+1).

### Bloco 4 — Agenda (semana flexível)
- **Dias em que normalmente dá para ir** (seg–dom, vários) e a **meta de dias por semana** (2–5). Os dias são uma referência, não uma obrigação.
- Duração típica (40 / 60 / 75 min), que pode ser trocada no dia ("hoje só 40").
- Horário habitual (manhã/tarde/noite), que define a hora do lembrete.
- **Modo da semana:** "fila + reorganizar" (padrão) ou "calendário fixo". No modo flexível, a semana é um **orçamento de séries por músculo**. Sempre que você abre o app, ele pergunta "quantos dias ainda dá esta semana?" e remonta o treino de hoje (§4.7).
- Dia da semana em que o ciclo vira (padrão: segunda) e se o domingo conta.

### Bloco 5 — Academia(s) e aparelhos (visual, **com imagens**) ⭐
Tela em **grade de cartões com foto** de cada aparelho, agrupados por categoria (pesos livres, cabos, máquinas, peso corporal), com filtro por categoria e contador "14 de 21". Toque marca tem / não tem; toque longo abre detalhes (ex.: halteres até quantos kg, incremento da polia, número de colunas do crossover). O botão "Academia completa" marca tudo de uma vez.
- **Imagens do cadastro:** referência genérica. No protótipo vêm da free-exercise-db (domínio público), uma foto de exercício que mostra o aparelho. No app real ficam copiadas para o R2 (não dependem do GitHub) e podem ser trocadas por ilustração de linha própria.
- **Fotos e vídeos da _sua_ academia** não entram no cadastro: entram **na montagem do treino** (§7.5). O cadastro fica rápido (2 min), e a mídia aparece só para os aparelhos que você usa de fato.

```
┌─ Academia: "SmartFit Centro" ─────────────── [+ outra academia] ─┐
│ PESOS LIVRES                                                     │
│ [🏋 Barra reta ✓] [〰 Barra W ✓] [● Halteres 2–40kg ✓] [▭ Banco reg. ✓]│
│ POLIAS                                                           │
│ [⇅ Crossover ✓] [⇣ Puxada ✓] [⇠ Remada baixa ✓] [◎ Polia única ✗]   │
│ MÁQUINAS — SUPERIORES                                            │
│ [Peck deck ✓] [Supino máq. ✓] [Elev. lateral máq. ✗] [Scott ✓]     │
│ MÁQUINAS — INFERIORES                                            │
│ [Leg press 45 ✓] [Hack ✗] [Extensora ✓] [Flexora deitada ✓] ...    │
│ OUTROS                                                           │
│ [Barra fixa ✓] [Paralelas ✓] [Smith ✓] [Elásticos ✗]              │
│                                                                  │
│ 📷 "Tirar fotos da academia" → o Claude identifica os aparelhos   │
└──────────────────────────────────────────────────────────────────┘
```
- **Atalho com fotos (opcional):** você manda 5–10 fotos gerais da academia para o Claude (Desktop, celular ou Code) e pede `/academia`. Ele identifica os aparelhos e chama `set_gym_equipment`, e você revisa na grade. Essas fotos gerais não são guardadas, só a lista resultante.
- Vários perfis: academia principal, casa, viagem/hotel. Cada treino pode ser montado "para a academia X".
- Catálogo inicial (~45 itens) em `data/seeds/equipment.json`: `{ id, nome, categoria, icone, variações }`. Ícones: SVG simples de linha (desenho próprio ou da biblioteca de exercícios).

### Bloco 6 — Restrições e preferências
- Lesões/dores (mapa do corpo clicável: ombro, cotovelo, punho, lombar, joelho) + intensidade 1–5 → exclui ou adapta exercícios (ex.: dor no ombro → sem desenvolvimento atrás da nuca, supino com halter em vez de barra).
- Exercícios que **ama** / **odeia** (busca com imagens).
- Estilo: mais máquinas · mais livres · misto. Gosta de técnicas (drop set, rest-pause)? sim/não.
- Mobilidade: consegue agachar fundo? braço acima da cabeça sem dor?

### Bloco 7 — Recuperação e vida
- Sono médio, estresse (1–5), trabalho (sentado / em pé / braçal), passos/dia ou atividade extra (futebol, corrida).
→ ajusta o fator de gasto calórico inicial e o volume inicial (sono < 6 h ou estresse alto = começa no volume mínimo).

### Bloco 8 — Alimentação "na vida real"
- Quantas refeições faz, horários, quem cozinha, come fora quantas vezes.
- **"Monte seu dia típico"**: escolher de cartões (pão com ovo, arroz-feijão-frango, marmita, lanche, açaí…) com porção em medida caseira → vira o **modelo de dia** (o registro diário vira "igual ao típico, exceto…").
- Restrições/alergias, alimentos que não come, suplementos (whey, creatina).
- Quanto quer registrar: **nada** (só peso e "comi mais/menos que o normal") · **leve** (texto livre 1x/dia, o Claude estima) · **detalhado** (por refeição). *(ver decisões)*
- Proteína: aceita whey? quantas porções de proteína "dá pra encaixar".

### Bloco 9 — Feedback e comunicação
- Como quer ser cobrado: lembrete no horário do treino, resumo diário, só semanal.
- Tom do treinador: direto · motivador · técnico.
- Quais perguntas pós-treino aceita responder (tempo máximo: 15 s / 1 min).

**Saída do onboarding:** `profile.json` → `/montar-plano` no Claude Code → plano validado pelo core → aparece no app.

---

## 4. Motor de treino (packages/core)

### 4.1 Modelo de exercício (enriquecido)
Cada exercício da free-exercise-db ganha campos próprios (tabela `exercise_meta`):
```ts
{
  id: "Incline_Dumbbell_Curl",
  name_pt: "Rosca inclinada com halteres",
  pattern: "elbow_flexion",          // padrão de movimento
  muscles_direct: ["biceps"],
  muscles_indirect: ["forearms"],
  stretch_bias: "lengthened",        // lengthened | mid | shortened
  equipment: ["dumbbells", "adjustable_bench"],
  type: "isolation",                 // compound | isolation
  fatigue: 1,                        // 1 baixo .. 3 alto (agachamento = 3)
  joint_stress: { shoulder: 1, elbow: 1 },
  default_reps: [8, 12], default_rir: 1,
  progression: "double",             // double | linear | top_set_backoff
  increment_kg: 1                    // halter de 1 em 1 kg, polia 2.5 ...
}
```

### 4.2 Gerar o plano
1. **Alvos de volume** por músculo (séries fracionadas: direta = 1, indireta = 0,5): base por nível `[8,10,12,14]`, prioridade +2–4, manutenção ×0,6–0,7. Ajustado pelo bloco 7 (recuperação).
2. **Frequência**: todo músculo ≥ 2x/semana; prioridades 3x se ≥ 4 dias.
3. **Divisão** por nº de dias: 2 = full body A/B · 3 = full body A/B/C ou upper/lower/full · 4 = upper/lower ×2 · 5 = U/L + dia de prioridades (braços/ombros) · 6 = PPL ×2.
4. **Teto por sessão**: `floor(minutos / 3)` séries totais, ≤ 10 séries fracionadas por músculo.
5. **Filtro de aparelhos**: exercício só entra se `equipment ⊆ academia.equipment`.
6. **Filtro de lesões e preferências**.
7. O **Claude escolhe** os exercícios dentro do conjunto permitido (variedade, um alongado por músculo prioritário, o que você ama) → `propose_plan`.
8. O **core valida** (`validate_plan`): volume ±2 do alvo, frequência, tempo, aparelhos, lesões, prioridade no início da sessão. Se falhar, devolve os erros e o Claude corrige.
9. `save_plan` cria um **mesociclo** (4–6 semanas + 1 de deload).

### 4.3 Substituição (todo exercício tem "como trocar")
Para cada exercício do plano o core pré-calcula **3 substitutos** com nota de similaridade:
```
score = 3·(mesmo pattern) + 2·(mesmos músculos diretos) + 1·(mesmo stretch_bias)
      + 1·(mesmo tipo) − 2·(estresse em articulação com dor) − 1·(fadiga maior)
filtro: aparelho disponível na academia de hoje, não está em "odeia"
```
Na tela do treino: botão **Trocar ⇄** → abre 3 cartões ("Aparelho ocupado? Faça **Rosca no cabo de costas para a polia** — mesmo alongamento do bíceps"). Opções: **só hoje** ou **definitivo**. Ao trocar, a carga sugerida é convertida pela razão de e1RM histórica entre os dois (ou começa pela regra "RIR 3 na primeira série").
Motivos de troca são registrados (ocupado / dor / não gostei / sem aparelho) → o Claude aprende no `/revisao`.

### 4.4 Progressão (automática, no código)
- **Dupla progressão**: todas as séries no topo da faixa com RIR ≤ alvo → +`increment_kg` e volta ao fundo da faixa. Senão, +1 rep.
- **Alvo da próxima sessão** pré-preenchido na tela (`kg × reps @RIR`).
- **Estagnação**: 3 sessões sem melhora de e1RM (Epley: `kg × (1 + reps/30)`) → sugerir troca de variação ou −10% e reconstruir.
- **Deload**: fim do mesociclo ou ≥ 3 exercícios estagnados ou prontidão baixa por 2 semanas → semana com metade das séries, mesma carga.

### 4.5 Ajuste de volume por feedback (estilo RP / MyFit)
Depois de cada músculo trabalhado no treino, 2 toques: **pump** (0–2) e, na sessão seguinte, **dor muscular residual** (0–3). Mais o desempenho (bateu as reps?).

| Dor residual \ Desempenho | Melhorou | Manteve | Piorou |
|---|---|---|---|
| Nenhuma / leve | **+1–2 séries** | +1 série | manter |
| Moderada (recuperou a tempo) | manter (+1 se pump baixo) | manter | −1 série |
| Ainda dolorido no treino | manter | −1 série | **−2 séries / avaliar deload** |

Limites: nunca abaixo de 4 nem acima de ~20 séries fracionadas/semana por músculo; no máximo +2 por semana.

### 4.6 Presença ("fui / não fui")
- Cada dia planejado vira `scheduled_session` com status: `done · partial · missed · moved · rest`.
- Marcar no app (1 toque na tira da semana) ou pelo Claude ("hoje não fui, joelho doendo" → `mark_attendance(missed, reason)`).
- **Faltou:** no modo flexível o volume que faltou volta para o orçamento da semana e é redistribuído (§4.7). No modo fila, o treino perdido vira o próximo. Se você ficou mais de 7 dias parado, a próxima sessão tem −1 série e −10% de carga ("retorno").
- Métricas:
  - aderência por semana, medida como **volume feito / volume-alvo** (não dias);
  - sequência de semanas com 2× por músculo;
  - heatmap anual estilo GitHub.

### 4.7 Semana flexível (orçamento de séries) ⭐ novo
**Problema:** o plano diz 4 dias (Superior A, Inferior A, Superior B, Inferior B). Você foi segunda e terça, faltou quarta, e só vai conseguir ir **hoje (quinta)**. Pular dois treinos quebra a meta de 2× por músculo.

**Ideia:** a semana não é uma lista de treinos, é um **orçamento de séries por músculo**. Cada vez que você abre o app (ou o Claude chama `get_today`), o core recalcula:

```
entrada: alvo semanal por músculo (séries fracionadas), feito até agora, frequência até agora,
         dias restantes D (perguntado: "quantos dias ainda dá, contando hoje?"),
         minutos hoje M, aparelhos da academia ativa, último grupo treinado, dor articular
1. grupos de hoje: D = 1 → corpo inteiro; D ≥ 2 → alterna superior/inferior a partir do último treino
2. por músculo do grupo:  déficit = alvo − feito
                          séries_hoje = ceil(déficit / dias restantes do mesmo grupo)
                          teto: 6 (prioridade) / 4 (demais) · piso: 2 se frequência < 2
3. cabe no tempo? teto = floor(M / 3) séries
   corta nesta ordem: não prioritários acima de 2 → prioridades acima de 3 → remove o
   não prioritário de menor déficit (aparece em "ficou fora")
4. escolhe exercícios: só aparelhos disponíveis; prefere o alongado; ≥ 5 séries → 2 exercícios
5. o Claude pode trocar exercícios dentro do conjunto permitido → validate_plan → salva "sessão do dia"
saída: sessão + "por quê" em 2 linhas + barras (feito / hoje / meta) + % de fechamento da semana
```
Regras de proteção:
- **Nunca compensar dobrado na semana seguinte.** Semana que fecha em 65% é normal, desde que tenha 2× por músculo.
- Corpo inteiro compensatório: começa pelas **prioridades** (ombro lateral, bíceps, tríceps) e deixa o mais cansativo (agachamento, terra) com no máximo 2–3 séries.
- 48 h entre estímulos pesados do mesmo músculo. Se não der, o segundo estímulo vira isolado leve.
- Se você marcar "não fui" depois, o orçamento volta a ficar em aberto. Se marcar "fui" num dia não planejado, ele é contado.
- Uma semana com só 1 dia vira automaticamente "semana de manutenção", sem contar como falha na aderência.

**Exemplos** (são os mesmos que dá para testar no protótipo):

| Situação | Hoje vira |
|---|---|
| 2 feitos, resta **1** dia, 60 min | **Corpo inteiro compensatório**, 8 exercícios / 19 séries. Glúteo e panturrilha ficam de fora. A semana fecha em ~65% |
| 2 feitos, restam **2**, 60 min | **Superior B com ênfase em braços** hoje, inferior amanhã |
| 2 feitos, restam **3**, 40 min | Superior curto hoje, inferior sexta, superior sábado |

---

## 5. Dieta flexível ("não vai ser seguida à risca")

### 5.1 Filosofia
- Meta em **faixas**, não números exatos: kcal 2.450–2.750, proteína ≥ 140 g.
- O que importa é a **média semanal** e a **tendência do peso**, não o dia.
- **Proteína é a única meta "dura"**; o resto é aproximado.
- Registro aproximado é melhor do que nenhum: "um prato médio de arroz, feijão e frango" vale.

### 5.2 Três modos de registro
| Modo | O que você faz | O que o sistema faz |
|---|---|---|
| **Zero** | Pesa todo dia (ou 3x/semana) e responde 1 pergunta: "comeu menos / normal / mais que o seu típico?" | Usa a tendência do peso + o dia típico como estimativa de consumo |
| **Leve** ⭐ | Manda texto/áudio 1x por dia pro Claude: *"café: 2 pães com ovo e café com leite; almoço: marmita de frango; noite: 2 fatias de pizza"* | O Claude interpreta, busca na TACO com medidas caseiras (`search_food`), registra com **nível de confiança** e devolve: "≈2.380 kcal, 118 g de proteína. Faltaram ~25 g: um iogurte ou 1 scoop de whey resolve." |
| **Detalhado** | Registra por refeição no app (busca + medida caseira, favoritos, "repetir ontem") | Cálculo exato da TACO |

Atalhos: **refeições salvas** ("minha marmita", "café padrão"), "igual ao dia típico", "igual ontem", foto do prato → `/comi` com imagem (o Claude estima a porção).

### 5.3 Gasto calórico adaptativo (aprende com você)
```ts
// peso em tendência (média móvel exponencial, suaviza água/sal)
trend_t = trend_{t-1} + 0.1 * (peso_t - trend_{t-1})

// a cada 7 dias, com ≥ 4 dias de dados
gasto_estimado = media_kcal_consumida - (Δtrend_kg_semana * 7700) / 7
gasto_novo = 0.8 * gasto_anterior + 0.2 * gasto_estimado   // ajuste devagar
meta_kcal = gasto_novo + superavit(ritmo escolhido)         // lento +100 · moderado +250 · rápido +400 kcal
```
- No modo **zero**, `media_kcal_consumida` = kcal do dia típico ± 15% conforme a resposta "menos/normal/mais".
- Regra de segurança: muda no máximo ±150 kcal por semana.
- Cintura subiu > 1 cm em 4 semanas sem o braço subir → −150 kcal (prioriza "manter a forma").

### 5.4 Perguntas de feedback da dieta
- Diário (5 s): fome 1–5 · "comeu mais/normal/menos" · bateu a proteína? (sim/quase/não)
- Semanal: o que mais atrapalhou (fim de semana, comer fora, falta de tempo)? alguma comida que quer encaixar? enjoou de algo?
- O Claude devolve **1–2 ações pequenas** por semana ("coloca 2 ovos a mais no café", "troca o refri do almoço por zero"), nunca uma dieta nova.

---

## 6. Todas as perguntas de feedback (resumo)

| Quando | Pergunta | Formato | Alimenta |
|---|---|---|---|
| Antes do treino | Sono · energia · dor articular (1–5) | 3 toques | prontidão → reduz volume do dia se ≤ 2 |
| Por série | kg · reps · RIR | linha pré-preenchida, só confirma | progressão |
| Por exercício (opcional) | Dor na articulação? Gostou? | 👍/👎 + ícone de dor | troca de exercício |
| Por músculo, fim do treino | Pump (0–2) | 1 toque | ajuste de volume |
| Próximo treino do músculo | Ainda dolorido? (0–3) | 1 toque | ajuste de volume |
| Fim do treino | Dificuldade geral (1–10) · duração real | auto + 1 toque | duração/volume |
| Diário | Peso · fome · "comi menos/normal/mais" · proteína | 15 s | dieta adaptativa |
| Semanal (dom) | Sono médio · estresse · aderência · o que atrapalhou · algo a mudar? | 1 min | `/revisao` |
| Quinzenal | Medidas (braço, ombro, cintura) | 1 min | progresso real do foco |
| Mensal | Fotos | 1 min | comparação lado a lado |

---

## 7. O Claude como "connector" (sem API)

### 7.1 Como funciona com a sua assinatura
A parte de IA sempre roda na sua assinatura. O MCP é só o "braço" que mexe no banco. **Sem chave de API.** Na v2 são dois caminhos para as **mesmas ferramentas**, que ficam em `packages/core` e `packages/mcp-tools`:

| Caminho | Onde funciona | Como liga | Para quê |
|---|---|---|---|
| **Connector remoto** (`https://ciclo.<conta>.workers.dev/mcp`) | claude.ai, **Claude Desktop, app do Claude no celular**, Claude Code (connectors do claude.ai aparecem lá automaticamente) | claude.ai → Personalizar → Connectors → *Adicionar connector personalizado* → URL + cabeçalho `Authorization: Bearer <token>` (ou OAuth depois) | Uso diário: "hoje só vou 40 min", "comi isso", revisão. **Funciona na academia** |
| **MCP stdio local** (`apps/mcp-local`) | Claude Code no Mac | `.mcp.json` do projeto: `{"ciclo": {"command":"node","args":["apps/mcp-local/dist/index.js"]}}` com `CICLO_URL` e `CICLO_TOKEN` | Mesmas ferramentas por proxy, **mais as de arquivo**: subir vídeos e fotos do Mac (`attach_media` com `path`), importar lotes, rodar seeds |

Observações:
- O plano Free aceita 1 connector personalizado, e o seu plano pago aceita vários. Adicionar connector **pelo celular** ainda está em beta: adicione pela web ou pelo Desktop e use no celular.
- O servidor precisa estar acessível pela internet a partir da Anthropic. Por isso `/mcp` fica **fora** do Cloudflare Access e é protegido por token próprio (comparação em tempo constante, troca simples pelo `wrangler secret put`). Na fase 2, o token dá lugar ao OAuth (`workers-oauth-provider`, modelo `remote-mcp-github-oauth`).
- Ferramentas que apagam dados ficam fora do connector remoto (só pelo app). As que mudam o plano exigem `confirm: true`.

### 7.2 Ferramentas do MCP
```
PERFIL / ACADEMIA
  get_profile · update_profile(patch)
  list_gyms · get_gym_equipment(gym) · set_gym_equipment(gym, items[])
  list_equipment_catalog

EXERCÍCIOS
  search_exercises(query?, muscle?, pattern?, equipment_available_in?)
  get_exercise(id) · get_substitutes(exercise_id, gym, reason?)

PLANO
  get_volume_targets()                → alvos calculados pelo core
  propose_plan(plan_json)             → valida e devolve erros/avisos (não salva)
  save_plan(plan_json)                → só aceita plano válido; cria mesociclo
  get_current_plan · get_week(date?)
  swap_exercise(session_exercise_id, new_exercise_id, scope: "today"|"permanent", reason)

SEMANA FLEXÍVEL (novo)
  get_week_budget(week?)              → alvo × feito × frequência por músculo, % de fechamento
  set_availability(days_left, minutes_today?, gym?)  → recalcula a sessão de hoje (§4.7)
  replan_week(reason)                 → mostra o diff do restante da semana; aplica com confirm

MÍDIA DA ACADEMIA (novo, §7.5)
  list_media(equipment_id? | exercise_id?)
  request_upload(kind: photo|video, equipment_id, exercise_id?) → URL assinada do R2 (celular)
  attach_media(path, equipment_id, exercise_id?, note)          → só no MCP local (lê arquivo do Mac)
  annotate_media(media_id, note, setup_json)   → "pino 7", "banco no furo 3", "polia esquerda"
  missing_media(plan_id)              → aparelhos do plano sem mídia (o Claude pede na montagem)

TREINO
  get_today()                         → sessão do dia (já ajustada pela semana flexível)
                                        + alvos kg×reps@RIR + substitutos + mídia do seu aparelho
  start_session · log_set(...) · finish_session(feedback)
  mark_attendance(date, status, reason?)
  get_progress(exercise_id | muscle, range)   → e1RM, volume semanal, PRs

DIETA
  search_food(query)                  → TACO + medidas caseiras
  log_food(items[], confidence, note) · log_meal_text(raw, parsed_items[])
  save_meal_template · get_nutrition_day(date) · get_nutrition_week()
  log_weight(kg) · log_measurements(...)

REVISÃO
  get_weekly_review_data()            → tudo pronto: aderência, progressão calculada,
                                        sugestões de volume (tabela 4.5), TDEE adaptativo
  apply_review(changes_json)          → aplica o que você aprovar
  get_inbox · resolve_inbox_item      → pedidos feitos pelo app web (ver 8.2)
```
Padrão: **ferramentas de escrita só aceitam JSON validado pelo zod**; as que mudam o plano exigem `confirm: true` (o Claude te mostra o diff antes).

### 7.3 Skills do Claude Code (`.claude/skills/*/SKILL.md`)
| Skill | O que faz |
|---|---|
| `/onboarding` | Faz o questionário conversando (alternativa ao app) e salva o perfil |
| `/academia` | Lê fotos gerais da academia (mandadas no chat), identifica os aparelhos e atualiza a grade |
| `/montar-plano` | `get_volume_targets` → escolhe exercícios → `propose_plan` até ficar válido → mostra resumo → `save_plan` |
| `/treino-hoje` | Mostra o treino do dia com cargas-alvo e substitutos |
| `/registrar` | "fiz rosca 12, 12, 10 com 14 kg" → `log_set` |
| `/comi` | Texto ou foto do que comeu → TACO → registro + quanto falta de proteína |
| `/revisao` | Revisão semanal: progresso, volume, dieta, 1–2 ações; aplica após "ok" |
| `/trocar` | "a polia tá ocupada" → 3 substitutos |
| `/novo-bloco` | Fim de mesociclo: deload + novo plano com o que aprendeu |

Exemplo de `SKILL.md`:
```markdown
---
name: revisao
description: Revisão semanal do treino e da dieta. Use quando o usuário pedir revisão, resumo da semana ou ajuste do plano.
---
1. Chame `get_weekly_review_data`. NÃO recalcule progressão nem calorias: use os números que vêm do core.
2. Resuma em até 8 linhas: aderência, PRs, músculos prioritários (volume real × alvo, medida do braço), peso em tendência.
3. Proponha no máximo 3 mudanças (volume, trocas, kcal), cada uma com o motivo.
4. Mostre o diff e só chame `apply_review` depois do "ok" do usuário.
5. Termine com 1–2 ações de dieta simples para a semana.
```

Skills novas da v2:
| Skill | O que faz |
|---|---|
| `/hoje-da` | "Só consigo ir hoje" / "tenho 40 min" → `set_availability` → mostra o treino remontado e o porquê |
| `/midia` | Na montagem: lista `missing_media`. Você manda o vídeo e ele chama `attach_media`/`request_upload` e anota a regulagem |
| `/semana` | Fecha a semana: % do orçamento, quais músculos fizeram 2×, o que fica para a próxima (sem dobrar) |

### 7.4 `CLAUDE.md` do projeto (regras do treinador)
- Atleta natural; nada de divisão de fisiculturista com 1x/semana por músculo.
- Prioridades: braços > ombros > costas; manter a forma (cintura controlada).
- Sempre usar as ferramentas do MCP; nunca inventar exercício fora da base.
- Dieta flexível: nunca montar cardápio rígido; sugerir trocas pequenas.
- Tom: direto, pt-BR, respostas curtas no dia a dia.
- Semana flexível: nunca compensar dobrado; garantir 2× por músculo antes de bater o volume.

### 7.5 Mídia da academia na montagem do treino ⭐ novo
**Por que na montagem e não no cadastro:** no cadastro você ainda não sabe quais aparelhos vai usar. Na montagem, o Claude sabe exatamente quais 8–12 aparelhos entram no bloco e pede só a mídia deles.

Fluxo:
1. `/montar-plano` salva o bloco e chama `missing_media(plan_id)`. Resposta: "polia (tríceps francês), leg press, puxador e remada baixa estão sem mídia".
2. O Claude pede: "na próxima ida, grave **10 s** de cada um mostrando a regulagem (banco, pino, pegada)".
3. Você grava:
   - **pelo celular, no app:** botão *Gravar* no card do exercício. O upload vai direto ao R2 por URL assinada, e o vídeo é cortado para 10–15 s em 720p no próprio navegador;
   - **pelo Claude:** manda o vídeo no chat do celular ou do Desktop, e o Claude descreve e anota a regulagem (`annotate_media`). O arquivo em si sobe pelo app ou pelo Claude Code, porque o connector não recebe arquivos binários grandes;
   - **pelo Mac (Claude Code):** "anexa `~/Movies/polia.mov` ao tríceps francês" → `attach_media(path, ...)` no MCP local.
4. A mídia fica ligada ao **aparelho** (vale para todo exercício nele) **e/ou ao exercício** (pegada, posição). O card do treino passa a mostrar "Sua academia · Polia da esquerda, corda curta, pino 4".
5. Usos depois:
   - **Trocar:** os substitutos mostram primeiro os que têm mídia sua ("esse você já sabe regular").
   - **Técnica:** vídeo seu executando uma série → o Claude comenta a amplitude, com prompt no `/tecnica`.
   - **Academia nova ou viagem:** o perfil da academia nasce sem mídia, e o Claude pede aos poucos.

Modelo: `media(id, kind, r2_key, duration_s, equipment_id?, exercise_id?, gym_id, note, setup_json, created_at)`. Limites: vídeo ≤ 15 s e 720p, foto ≤ 1600 px (compressão no navegador antes de subir). Com isso o R2 gratuito dura anos.
Privacidade: o R2 é privado, e cada visualização usa uma URL assinada de 10 minutos. Nada de mídia no git.

---

## 8. Automação

### 8.1 Rodar o Claude sozinho (ainda na sua assinatura)
`claude -p` (modo sem interface) roda uma skill com o MCP local e termina. Agendado com **launchd** no macOS:
```bash
# scripts/weekly-review.sh — todo domingo 20h
cd ciclo
claude -p "/revisao modo=automatico: gere a revisão e salve como rascunho na inbox, sem aplicar" \
  --allowedTools "mcp__treino__*" > data/logs/review-$(date +%F).md
osascript -e 'display notification "Revisão da semana pronta" with title "Treino"'
```
| Job | Quando | O quê |
|---|---|---|
| Lembrete de treino | dias de treino, no seu horário | notificação (sem IA, só o app/launchd) |
| Processar inbox | a cada 2 h quando o Mac está ligado | `claude -p "/processar-inbox"` → responde pedidos feitos pelo celular |
| Revisão semanal | domingo 20h | rascunho de revisão; você aprova no app ou no Claude |
| Fechar o dia | 23h | marca `missed` nos treinos não registrados, pede o feedback do dia |

**v2: sem depender do Mac ligado**

| Job | Onde roda | IA? |
|---|---|---|
| Fechar o dia (23h): marca `missed` nos dias sem registro e abre a pergunta "quantos dias ainda dá?" | **Cron Trigger** do Worker | não |
| Lembrete de treino / check-in | Cron + Web Push do PWA | não |
| Processar a caixa de pedidos | **Rotina do Claude Code na nuvem** (`/schedule`, sua assinatura) com o connector `ciclo`, a cada 3 h das 7h às 23h | sim |
| Revisão semanal (domingo 20h) | Rotina na nuvem → grava o rascunho na inbox; você aprova no app | sim |
| Fallback | `launchd` + `claude -p` no Mac (o script acima), se as rotinas na nuvem não atenderem | sim |

*Conferir na hora de montar: os limites das rotinas na nuvem no seu plano e se elas enxergam connectors personalizados. Se não enxergarem, a rotina usa o repositório com o `apps/mcp-local` apontando para a URL pública.*

### 8.2 "Fila de pedidos" (o celular conversa com o Claude sem API)
No app web: botão **"Pedir ao treinador"** → grava em `inbox` ("troca o treino de amanhã, tô com o ombro dolorido"). O job `processar-inbox` (ou você abrindo o Claude Code) lê, age pelo MCP e grava a resposta → aparece no app. É assíncrono, mas resolve 90% sem API nem servidor público.

### 8.3 Hooks do Claude Code (opcional)
- Hook depois de `save_plan`/`apply_review` → `git commit` automático de um `plan-snapshots/*.json` (histórico do plano versionado).

---

## 9. Visual e telas (foco em dashboards limpos)

### 9.1 Linguagem visual
- Escuro por padrão (academia, uso noturno) + tema claro. Fundo `#0B0B0C`, superfícies `#151518`/`#1C1C20`, texto `#F4F4F5`/`#A1A1AA`.
- **Uma cor de destaque** (ex.: verde-limão `#C6F432` ou laranja `#FF6B2C`) só para: ação principal, progresso e "feito". Vermelho só para dor/alerta.
- Fonte: **Inter** (ou Geist); números com `font-variant-numeric: tabular-nums` (kg/reps alinhados).
- Cartões com cantos 16 px, sem sombras pesadas, divisórias finas. Um número grande por cartão.
- Toques grandes (≥ 44 px) — se usa com a mão suada e o celular no banco.
- Gráficos: no máximo 2 cores por gráfico; linha de **meta tracejada**; sem legenda quando o título já explica.

### 9.2 Telas
```
HOJE (tela inicial)
┌──────────────────────────────────┐
│ Seg, 10 nov · Semana 2/5          │
│ ┌──────────────────────────────┐ │
│ │ UPPER A · ~50 min             │ │
│ │ Ombros · Braços · Peito        │ │
│ │ 6 exercícios · 18 séries       │ │
│ │ [ ▶ COMEÇAR TREINO ]           │ │
│ └──────────────────────────────┘ │
│ S  T  Q  Q  S  S  D               │
│ ●  ○  ·  ○  ○  ·  ·   (tira semana)│
│ ┌ Proteína ┐ ┌ Kcal ───┐ ┌ Peso ┐ │
│ │ 92/140 g │ │1.850/2.6k│ │77,4↗ │ │
│ └──────────┘ └─────────┘ └──────┘ │
│ 💬 Treinador: "Semana passada a   │
│ rosca subiu 1 kg. Hoje: 16 kg×10"  │
└──────────────────────────────────┘

TREINO ATIVO
┌──────────────────────────────────┐
│ Elevação lateral c/ halter  ⇄ ⋯  │
│ [imagem]  Alvo: 10 kg × 15 @RIR1  │
│ Série  Anterior   kg   reps  RIR ✓│
│  1     9×16      10    15    2  ☑ │
│  2     9×15      10    14    1  ☑ │
│  3     9×14      10    __    _  ☐ │
│  4     9×13      10    __    _  ☐ │
│ ⏱ Descanso 1:12 ━━━━━━━━━░░       │
│ Pump? ( 0 )( 1 )( 2 )             │
│ ‹ anterior            próximo ›   │
└──────────────────────────────────┘
⇄ = Trocar → 3 cartões de substituto (só hoje / definitivo)

PROGRESSO (dashboard)
- Volume semanal por músculo: barras horizontais × linha da meta (prioridades em destaque)
- Braço/ombro/cintura: linhas a cada 15 dias (o gráfico que importa pro seu objetivo)
- Peso: pontos diários + linha de tendência + faixa-alvo
- e1RM dos exercícios-chave (sparkline por exercício)
- Heatmap de presença (ano) + aderência % por mês
- Fotos: comparar dia X × dia Y lado a lado

DIETA
- Anel de proteína (meta dura) + barra de kcal (faixa)
- Média dos 7 dias × meta; gasto estimado (TDEE adaptativo) com tendência
- Lista do dia com nível de confiança (●●○) e "igual ao típico"
- Caixa "o que você comeu?" (texto livre → vai pra inbox / Claude)

ACADEMIA
- Grade de aparelhos (§3 bloco 5), troca de academia ativa no topo

PLANO
- Mesociclo: semanas 1–5 + deload; cada sessão expandível; volume por músculo da semana
- Histórico de mudanças ("semana 3: +2 séries de tríceps — motivo: pouca dor, progrediu")
```

### 9.3 Componentes prontos
shadcn/ui (Card, Tabs, Sheet para o "Trocar", Drawer no celular, Progress, ToggleGroup para pump/RIR, Calendar) + Recharts. Skill `ui-ux-pro-max` / `artifact-design` disponível aqui para refinar paleta e espaçamentos quando for construir.

---

## 10. Modelo de dados (Drizzle, resumido)

```
profile(id, sex, birth_date, height_cm, goal, priorities_json, pace, tone, diet_mode, ...)
profile_history(id, profile_snapshot_json, created_at)
gym(id, name, is_active) · equipment(id, name, category, icon) · gym_equipment(gym_id, equipment_id, details_json)
exercise(id, name, images_json, equipment_json, ...)            ← free-exercise-db
exercise_meta(exercise_id, name_pt, pattern, muscles_direct, muscles_indirect, stretch_bias,
              type, fatigue, joint_stress_json, increment_kg, default_reps, default_rir)
user_exercise_pref(exercise_id, rating: love|ok|hate, pain_flag)
mesocycle(id, start_date, weeks, split, volume_targets_json, status, rationale)
plan_session(id, mesocycle_id, slot "A".."F", name, order)
plan_exercise(id, plan_session_id, exercise_id, order, sets, rep_min, rep_max, rir, rest_s,
              progression, substitutes_json)
scheduled_session(id, date, plan_session_id, status, reason, readiness_json)
session_log(id, scheduled_session_id, started_at, finished_at, rpe, notes)
set_log(id, session_log_id, exercise_id, set_no, kg, reps, rir, swapped_from, swap_reason)
muscle_feedback(id, session_log_id, muscle, pump, soreness_next)
plan_change(id, mesocycle_id, change_json, reason, source: auto|claude|user, created_at)
food(id, taco_id, name, kcal, protein, carbs, fat, per_100g) · household_measure(food_id, label, grams)
meal_template(id, name, items_json)
food_log(id, date, meal, food_id?, grams?, kcal, protein, carbs, fat, confidence, raw_text)
daily_checkin(date, weight_kg, hunger, ate_vs_typical, protein_hit, sleep, energy)
measurement(date, arm_relaxed, arm_flexed, shoulder, chest, waist, thigh)
photo(id, date, pose, path)
nutrition_state(week, tdee_estimate, target_kcal, target_protein)
inbox(id, created_at, source: web|cron, text, status, response, resolved_at)

-- v2
week_budget(week_start, muscle, target_sets, done_sets, frequency, closed_pct)   ← view/materializado
availability(date, days_left, minutes, gym_id, source: app|claude)               ← "quantos dias ainda dá"
day_session(id, date, kind: planned|compensatory|maintenance, items_json, why, validated_at)
media(id, kind: photo|video, r2_key, duration_s, equipment_id?, exercise_id?, gym_id,
      note, setup_json, created_at)
module(id, name, enabled, settings_json)                                         ← §15 Vida
```

---

## 11. Do pessoal ao deploy (sem reescrever)

*(v2: a nuvem vem **primeiro**, porque o requisito é abrir na academia com o Mac em casa.)*

| Fase | O que muda | Custo |
|---|---|---|
| **0 — Nuvem pessoal (já no início)** | Worker + D1 + R2 + Access em `ciclo.<conta>.workers.dev`; `wrangler dev` para desenvolver localmente com o mesmo D1 (SQLite local) | R$ 0 |
| **1 — Connector** | `/mcp` com token → adicionado no claude.ai → funciona no celular; `apps/mcp-local` para o Claude Code | R$ 0 |
| **2 — Automação** | Cron Triggers + rotinas na nuvem + Web Push | R$ 0 |
| **3 — Domínio próprio (opcional)** | `ciclo.seudominio.com.br` + OAuth no MCP no lugar do token | ~R$ 40/ano de domínio |
| **4 — Multiusuário (bem distante)** | `user_id` em todas as tabelas; Access dá lugar a Better Auth; cada pessoa conecta o próprio Claude pelo connector com OAuth; D1 por usuário ou por linha | Workers Paid (US$ 5/mês) se passar dos limites |

Para facilitar a fase 4: desde já, **todo acesso ao banco passa por `packages/core` (repositórios)**, nunca SQL solto no web ou no MCP; IDs em UUID/ULID; datas em ISO + fuso `America/Sao_Paulo`.

---

## 12. Roteiro de construção (ordem sugerida)

**Objetivo: usar na academia em 1 fim de semana e ir evoluindo.** Cada marco é usável sozinho.

| Marco | Entrega | Já dá para… |
|---|---|---|
| **M0 · Esqueleto (2–3 h)** | Repositório público + LICENSE + Worker "hello" no ar + Access com o seu e-mail + D1 criado + CI (typecheck, testes) | abrir a URL no celular com login |
| **M1 · Treino do dia (1 dia)** | Seeds (~60 exercícios, 21 aparelhos), `core/week-budget` com testes (os 3 exemplos da §4.7 viram testes), telas **Hoje** e **Treino** do protótipo em React, "fui / não fui", registrar série | **treinar com o app** e ter a semana flexível |
| **M2 · Claude no celular (½ dia)** | `/mcp` com `get_today`, `set_availability`, `log_set`, `mark_attendance`, `inbox` + connector no claude.ai | "só vou hoje, 40 min" no app do Claude |
| **M3 · Cadastro + academia (1 dia)** | 9 etapas, grade com imagens, `/montar-plano` com `propose/validate/save` | gerar o bloco de 6 semanas |
| **M4 · Mídia (½ dia)** | R2 + `request_upload` + `attach_media` (mcp-local) + botão Gravar | ver a regulagem do **seu** aparelho |
| **M5 · Dieta leve (1 dia)** | TACO + `/comi` + meta adaptativa | registrar comendo de verdade |
| **M6 · Revisão e progresso** | Rotinas na nuvem, dashboard de progresso, deload | piloto automático |
| **M7+ · Vida** | Módulos da §15, um por vez | — |

Regra de evolução: **cada ideia nova vira uma issue** com o rótulo do módulo. O protótipo HTML é atualizado antes do código quando a mudança for visual (mesma regra do DESIGN.md do projeto da concessionária).

---

## 13. Decisões

**Já decididas (09/11):**
- Arquitetura **A (app próprio)**.
- Abre na academia com o Mac desligado, por isso **nuvem gratuita**.
- Semana flexível.
- Mídia do aparelho entra na montagem do treino.
- Repositório público com licença.
- Crescer para "administrar a vida".

**Recomendações já aplicadas no protótipo** (mude se não concordar):
- Claude no Code e no Desktop/celular;
- dieta no modo leve;
- Claude aplica a carga sozinho e pede aprovação para mudar o plano;
- ganho moderado (+0,5 kg/mês);
- free-exercise-db como base;
- verde-limão como destaque, escuro por padrão.

**Ainda abertas:**
1. **Hospedagem:**
   - Cloudflare (recomendada);
   - Vercel + Turso;
   - Supabase.
2. **Login do app:**
   - Cloudflare Access com código por e-mail (recomendado, zero código);
   - GitHub OAuth (Auth.js);
   - senha única.
3. **Proteção do `/mcp`:**
   - token Bearer agora e OAuth depois (recomendado);
   - OAuth desde o início.
4. **Nome do projeto e do repositório:** `ciclo` (nome de trabalho; checar se `github.com/<user>/ciclo` está livre) · `treino-os` · `vida-os` · outro.
5. **Licença:**
   - **MIT** (recomendada: simples e permite tudo);
   - Apache-2.0 (MIT + proteção de patente);
   - AGPL-3.0 (se alguém hospedar uma versão modificada, tem que abrir o código; protege contra virar SaaS de outro).
6. **Mídia:**
   - vídeo de 10–15 s em 720p (recomendado);
   - só fotos;
   - vídeo longo (consome o R2 bem mais rápido).
7. **Domingo conta na semana?** Semana de seg–dom (padrão) ou começando no dia que você escolher.
8. **Próximo módulo de vida** depois de Treino e Dieta: Corpo · Sono · Hábitos · Agenda · Finanças.

---

## 14. Atividades novas para formalizar a semana flexível
São rituais curtos. Cada um vira tela e/ou ferramenta MCP.

| Ritual | Quando | Duração | O que acontece | Ferramenta |
|---|---|---|---|---|
| **Planejar a semana** | domingo à noite ou segunda cedo | 20 s | "Quantos dias você acha que consegue?" (2–5) e quais dias têm risco → define o orçamento e a divisão | `set_availability(week)` |
| **Pré-treino** | ao abrir o app no dia | 10 s | Confirma dias restantes, minutos e academia; sono e energia (3 toques) → treino remontado + "por quê" | `set_availability`, `get_today` |
| **Hoje não dá** | quando bate o imprevisto | 5 s | Botão no app ou frase ao Claude → "não fui" + redistribui; pergunta se quer um treino de 20 min em casa | `mark_attendance`, `replan_week` |
| **Treino-relâmpago** | dia corrido | 20–30 min | Só prioridades (ombro lateral, bíceps, tríceps) com superséries; conta no orçamento | `get_today(mode:"express")` |
| **Treino em casa / viagem** | fora da academia | — | Troca a academia ativa (elásticos, halteres) → a mesma lógica, com aparelhos diferentes | `set_availability(gym)` |
| **Pós-treino** | ao terminar | 15 s | Pump, esforço e dor articular → alimenta o ajuste de volume | `finish_session` |
| **Fechar a semana** | domingo | 1 min de leitura | % do orçamento, quem fez 2×, PRs, 1 ação para a próxima; **sem compensar** | `/semana` |
| **Medidas** | a cada 15 dias | 2 min | Braço relaxado e contraído, ombro, cintura → gráfico do objetivo real | `log_measurements` |
| **Fotos de progresso** | 1× por mês | 1 min | 3 poses, mesmo lugar e luz; comparação lado a lado | `request_upload(kind:"progress")` |
| **Mídia do aparelho** | quando o Claude pedir | 10 s por aparelho | Gravar a regulagem do aparelho novo do plano | `missing_media`, `attach_media` |
| **Fim de bloco** | a cada 5–6 semanas | 5 min | Deload + revisão + novo bloco com o que aprendeu | `/novo-bloco` |

Estados da semana no painel:
- **no ritmo**: ≥ 2× para todos os músculos, possível;
- **apertada**: só dá com corpo inteiro;
- **manutenção**: 1 dia, conta como semana válida;
- **pausa**: doença ou viagem, sem cobrança.

---

## 15. Crescer para "administrar a vida" (módulos)
O app se chama **Ciclo** (nome de trabalho) porque treino, dieta, sono e hábitos são ciclos semanais. A arquitetura já comporta módulos:

```
packages/modules/<nome>/
  schema.ts        tabelas Drizzle do módulo (prefixo: train_, diet_, body_, sleep_, habit_, fin_)
  core.ts          regras puras + testes
  tools.ts         ferramentas MCP do módulo (registradas no mesmo /mcp)
  card.tsx         card no painel "Hoje"
  pages/           telas próprias
  skill.md         skill do Claude para o módulo
```
- **Um connector para tudo.** O Claude vê todas as ferramentas e cruza dados: "dormi mal 3 noites → semana de manutenção"; "gastei muito com delivery → sugestões de marmita que batem a proteína".
- **Painel "Hoje"** = os cards dos módulos ligados, em ordem de prioridade. Um módulo desligado não aparece.
- **Ordem sugerida:**
  1. Treino;
  2. Dieta;
  3. **Corpo** (peso, medidas, fotos);
  4. **Sono e energia** (check-in);
  5. **Hábitos** (água, passos, leitura; sequências sem culpa);
  6. **Agenda**: Google Calendar pelo connector que você já tem. O Claude encaixa o treino nos buracos da semana e cria o evento;
  7. **Finanças** (gastos do mês, metas);
  8. **Estudos / projetos**;
  9. **Diário** (1 linha por dia, resumo mensal pelo Claude).
- **Dados sensíveis:** finanças e saúde nunca vão para o git nem para logs. Exportar tudo (JSON) e apagar tudo são ferramentas do app, não do Claude.

---

## 16. Repositório público: checklist para começar
**Nome:** `ciclo` (decisão 4). **Licença:** MIT (decisão 5). **Visibilidade:** pública.

**O que entra / o que nunca entra**
| Entra | Nunca entra |
|---|---|
| Código, migrations, seeds de exercícios e aparelhos, TACO (fonte pública), dados **fictícios** de exemplo, protótipo, docs | `.dev.vars`, `.env*`, tokens, `wrangler` secrets, banco local (`.wrangler/`), fotos, vídeos, peso, medidas, comida, e-mail pessoal em código |

**Licenças de terceiros (registrar em `THIRD_PARTY.md`):**
- free-exercise-db: **Unlicense** (domínio público);
- TACO (NEPA/UNICAMP): uso livre com citação;
- repositório `brolesi/taco`: conferir a licença antes de copiar;
- workout-cool: MIT, citar se copiar algo;
- MyFit: **AGPL**. Copie só a **ideia** da tabela de ajuste, nunca o código, a menos que o projeto também seja AGPL.

**Comandos (M0):**
```bash
mkdir ciclo && cd ciclo && git init
pnpm init && pnpm add -D typescript vitest wrangler @cloudflare/workers-types
# copiar prototipo/ e docs/ (este .md) para dentro
gh repo create ciclo --public --license mit --description "Treino, dieta e vida administrados pelo Claude (MCP), semana flexível, R$ 0" --source . --push
npx wrangler login
npx wrangler d1 create ciclo-db
npx wrangler r2 bucket create ciclo-media
npx wrangler secret put MCP_TOKEN
npx wrangler deploy
# Cloudflare dashboard → Zero Trust → Access → Applications → self-hosted:
#   domínio ciclo.<conta>.workers.dev, política "Allow" só para o seu e-mail (One-time PIN),
#   exceção (Bypass) para o caminho /mcp
# claude.ai → Personalizar → Connectors → Adicionar connector personalizado → URL /mcp + cabeçalho Authorization
```
**Arquivos do primeiro commit:**
- `README.md`: o que é, captura do protótipo, como rodar e o aviso "uso pessoal, sem garantias";
- `LICENSE`;
- `THIRD_PARTY.md`;
- `CLAUDE.md`: regras do treinador e do código;
- `docs/sistema.md`: este documento;
- `docs/DESIGN.md`: tokens do protótipo;
- `.gitignore`: `node_modules`, `.wrangler`, `.dev.vars`, `.env*`, `*.db`, `media/`;
- `.github/workflows/ci.yml`: typecheck, vitest e varredura de segredos com `gitleaks`;
- `prototipo/index.html`.

**Proteções do repositório público:**
- *secret scanning* e *push protection* ligados (grátis em repositório público);
- Dependabot ligado;
- branch `main` protegida, com PR obrigatório (mesmo sozinho, ajuda o Claude Code a trabalhar em branches).

---

## Protótipo
`prototipo/index.html` é um arquivo único que abre direto no navegador (as imagens vêm do GitHub). Telas:
- **Hoje:** semana flexível interativa, seletor "quantos dias ainda dá" e "tempo hoje", treino remontado com o porquê, barras de volume com o previsto de hoje, peso, dieta, caixa de pedidos e check-in.
- **Treino:** exercícios com imagem, botão de troca com 3 substitutos que respeitam os aparelhos marcados, e espaço para a mídia da sua academia.
- **Dieta.**
- **Cadastro:** 9 etapas; a da Academia tem grade com imagens, filtro e contador.
- **Vida:** os módulos.

Desmarcar um aparelho na etapa Academia muda o treino de hoje na hora. Os dados são fictícios.

---

## Fontes
- [yuhonas/free-exercise-db](https://github.com/yuhonas/free-exercise-db) · [Free Exercise DB (site)](https://yuhonas.github.io/free-exercise-db/)
- [Workout.cool (Show HN)](https://news.ycombinator.com/item?id=44309320) · [LiftLog](https://liftlog.online/) · [Show HN: LiftLog](https://news.ycombinator.com/item?id=38283760) · [pawan67/lift](https://github.com/pawan67/lift) · [boardotmeme-dot/liftlog](https://github.com/boardotmeme-dot/liftlog) · [jovandeginste/workout-tracker](https://github.com/jovandeginste/workout-tracker)
- [Dieterbe/awesome-health-fitness-oss](https://github.com/Dieterbe/awesome-health-fitness-oss) · [Open-source workout apps (2026)](https://awesome-repositories.com/q/open-source-workout-and-fitness-apps) · [AlternativeTo – Fitness trackers](https://www.alternativeto.net/category/sport-and-health/fitness-tracker/)
- MCP treino: [chrisdoc/hevy-mcp](https://github.com/chrisdoc/hevy-mcp) · [arekminajj/mcp-hevy](https://github.com/arekminajj/mcp-hevy) · [meimakes/hevy-mcp-server](https://github.com/meimakes/hevy-mcp-server) · [earthandwonder/hevy-mcp](https://github.com/earthandwonder/hevy-mcp) · [tomtorggler/hevy-mcp-server](https://github.com/tomtorggler/hevy-mcp-server) · [swrm-io/hevy-mcp](https://github.com/swrm-io/hevy-mcp) · [ewongz/fitness-mcp-server](https://github.com/ewongz/fitness-mcp-server) · [MayankKapgate/fitness-tracker-mcp](https://glama.ai/mcp/servers/MayankKapgate/fitness-tracker-mcp)
- MCP nutrição: [edp8489/nutrition-tracker-mcp](https://github.com/edp8489/nutrition-tracker-mcp) · [neonwatty/food-tracker-mcp](https://glama.ai/mcp/servers/@neonwatty/food-tracker-mcp/tree/27c5e83534964cb2ea3c62f2362a9377a1c48311) · [daveremy/nutrition-mcp](https://awesomeclaudeplugins.com/daveremy/nutrition-mcp) · [Mason-Levyy/myfitnesspal-mcp](https://github.com/Mason-Levyy/myfitnesspal-mcp) · [the-mace/loseit-mcp-local](https://github.com/the-mace/loseit-mcp-local) · [chickenzord/sparkyfitness-mcp](https://github.com/chickenzord/sparkyfitness-mcp) · [HackerNoon – trocando o MyFitnessPal por um MCP](https://hackernoon.com/i-replaced-myfitnesspal-and-other-apps-with-a-single-mcp-server-heres-how-i-did-it)
- TACO: [brolesi/taco](https://github.com/brolesi/taco) · [marcelosanto/tabela_taco](https://github.com/marcelosanto/tabela_taco) · [danperrout/tabelataco](https://github.com/danperrout/tabelataco) · [matheusbuniotto/taco-mcp](https://github.com/matheusbuniotto/taco-mcp) · [ianhudsonai/taco-br-mcp](https://github.com/ianhudsonai/taco-br-mcp)
- Ciência de volume/frequência: ver fontes do `quiz-analise-e-criador-de-treinos.md` (Pelland et al. 2024/2025; Schoenfeld 2016; Maeo 2023).
- Hospedagem gratuita (v2):
  - Cloudflare: [limites do free tier 2026](https://eastondev.com/blog/en/posts/dev/20260526-cloudflare-free-limits/) · [Workers + Hono + D1 + R2 free stack](https://www.buildmvpfast.com/blog/cloudflare-workers-hono-d1-r2-free-fullstack-2026) · [D1: o que conta como linha escrita](https://dev.to/signops/cloudflare-d1-free-tier-limits-what-counts-as-a-row-written-d6e) · [Access (plano Free)](https://www.cloudflare.com/sase/products/access/) · [onde o Zero Trust deixa de ser grátis](https://zerometric.net/research/cloudflare-zero-trust-free-plan-limits-2026/)
  - Vercel: [Hobby em 2026](https://dev.to/abhijais1/is-vercel-free-what-the-hobby-plan-covers-in-2026-2ke) · [Hobby só para uso não comercial](https://zplatform.ai/guides/is-vercel-free/)
  - Turso: [free tier](https://freetiertracker.com/s/turso/)
  - Supabase: [pausa por inatividade](https://mykavo.app/blog/supabase-free-tier-limits)
- MCP remoto / connector:
  - [Custom connectors (Anthropic)](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp) · [Docs: connector fora do diretório](https://claude.com/docs/connectors/custom/remote-mcp) · [MCP local × remoto](https://mer.vin/2026/08/local-vs-remote-mcp-claude-custom-connectors/)
  - [MCP remoto no Workers (guia)](https://dev.to/augusto_joaquinriveramu/build-your-first-remote-mcp-server-on-cloudflare-workers-2nio) · [Cloudflare Agents/MCP docs](https://developers.cloudflare.com/agents/mcp/) · [Auth0 + Cloudflare MCP](https://auth0.com/blog/secure-and-deploy-remote-mcp-servers-with-auth0-and-cloudflare/)
- Skills de design usadas no protótipo (de `Tentativa01_Concessionaria/.claude/skills`): `ui-build`, `ui-design-references`, `preview-aprovacao`, `web-design-guidelines` ([vercel-labs/web-interface-guidelines](https://github.com/vercel-labs/web-interface-guidelines)).
