# 10 · Chat: o mesmo cérebro em duas interfaces

Guia único do Chat (#66). Vale para toda conta. Nenhum passo exige Mac nem computador ligado.

## As duas interfaces
| Onde | Como funciona |
|---|---|
| **No Claude** (claude.ai ou o app Claude no celular) | O Ciclo é um **conector personalizado**. Você conversa e o Claude usa as ferramentas do Ciclo. |
| **No app**, na aba Chat | Você escreve na caixa de pedidos. Responde quem puder, na ordem da tabela abaixo. |

As duas usam **as mesmas ferramentas MCP e o mesmo histórico** (a caixa `inbox`, a memória e a busca).

## Conectar (4 passos, sem chave para copiar)
O app mostra estes passos em **Chat → Chat ligado → Como conectar**:
1. Abra o claude.ai, ou o app Claude, em **Configurações → Conectores**.
2. Adicione um **conector personalizado** com a URL `https://<seu-ciclo>/mcp`. O app tem um botão para copiar.
3. Abre a tela do Ciclo **"Permitir acesso ao seu Ciclo?"**, com o destino em destaque (`claude.ai`, "destino verificado"). Toque em **Permitir com Face ID**. O Face ID é pedido sempre, mesmo se você já estiver logado.
4. Teste com: *"Use o Ciclo: qual é o meu treino de hoje?"*

Por trás, é o **OAuth 2.1 da especificação de autorização do MCP** (versão 2026-07-28; ADR-0013):
- o `/mcp` responde 401 com `WWW-Authenticate: Bearer resource_metadata=…`;
- `/.well-known/oauth-protected-resource` aponta para `/.well-known/oauth-authorization-server`;
- o cliente se registra sozinho (registro dinâmico) e usa PKCE S256;
- o token de acesso dura 1 h e o refresh gira a cada uso. A conexão expira com 90 dias sem uso.

Só o callback oficial do Claude (`https://claude.ai/api/mcp/auth_callback`) é aceito como destino. Outro app que se registre com o nome "Claude" e um site próprio é recusado. A var `OAUTH_REDIRECT_HOSTS` troca a lista. Ferramentas locais (`http://localhost`) funcionam, mas a tela avisa "app não verificado".

Cada conexão aparece em **Conta → Claude conectado** e pode ser revogada ali. São no máximo 3 conexões por pessoa; a mais antiga sai para caber a nova.

**Plano B:** a chave manual da #55 (Conta → gerar chave) continua valendo para clientes sem OAuth.

**Pré-requisito em produção:** `/mcp`, `/oauth/*` e `/.well-known/*` não podem ficar atrás do Cloudflare Access. O `wrangler.jsonc` já manda essas rotas para o Worker (`run_worker_first`), e o `predeploy` confere isso.

## O que dá para fazer pela conexão
Tudo com as ferramentas que já existem (`tools/list`). O Claude não apaga nada: apagar é só no app.

| Pedido | Ferramentas |
|---|---|
| Perguntas ("como foi minha semana?", "quanto falta de proteína?") | `ciclo_contexto`, `ciclo_estado`, `ciclo_buscar`, `ciclo_memoria_listar` |
| Gerar o treino do dia ou da semana | `ciclo_contexto` (gerar/tempo) → `ciclo_planejar_dia` → `ciclo_salvar_treino_do_dia` |
| Ajustar o treino (tempo, academia cheia, troca, foco) | `ciclo_contexto` (trocar/tempo) → `ciclo_catalogo` → `ciclo_salvar_treino_do_dia` |
| Responder a caixa do app | `ciclo_chat_pendentes` → `ciclo_responder_pedido` |

O servidor valida todo treino salvo (IDs do catálogo, aparelhos, dores, tempo e prioridades) e recusa o que estiver fora das regras.

## Quem responde na aba Chat: a interface `Cerebro`
O código fica em `apps/worker/src/cerebro.ts` (Worker) e as regras em `packages/core/src/cerebro.ts`. A ordem é esta:

| Provedor | Quando | Custo |
|---|---|---|
| `regra` | **padrão.** Pedidos que dão para responder sem IA, como "qual meu treino de hoje". Responde na hora. | grátis |
| `openai-api` | **opcional e desligado por padrão.** Só **gerar e ajustar treino**, e só com `OPENAI_API_KEY` e `OPENAI_MAX_USD`. | pago pelo dono |
| `claude-assinatura` | Todo o resto, ou quando a API falha. O pedido fica na fila até a rotina ou você abrir o Claude. | a assinatura que você já tem |

O app marca quem respondeu: "Ciclo (regra, sem IA)", "IA de reserva" ou "Claude".

### A API paga é pior e mais cara que a assinatura
- **Pior:** ela não conversa, não usa as ferramentas e não tem a memória. Recebe um contexto fixo e devolve só uma lista `{id, sets}`.
- **Mais cara:** cada pedido custa dinheiro além da assinatura. A assinatura do Claude já cobre o conector e a rotina.
- Serve **só de reserva**, para quem quer resposta na hora sem rotina.
- **Sem SDK:** é um `fetch` direto para `api.openai.com/v1/chat/completions`.
- **Ligar:** `wrangler secret put OPENAI_API_KEY` e `wrangler secret put OPENAI_MAX_USD` (ex.: `2`, em US$ por mês, até 100).
  - Opcional: `OPENAI_MODEL` (padrão `gpt-4.1-mini`). Modelo fora da tabela de preços conta com um preço alto, para errar do lado seguro.
- **Seus dados vão para a OpenAI.** Com ela ligada, a fatia do contexto do pedido (treino, volume, dores, médias de saúde) é enviada à OpenAI. Quem liga é o dono do app; a aba Chat avisa todas as contas enquanto estiver ligada.
- **Teto:** o gasto do mês fica em `cerebro_gasto`, no D1. Antes de cada chamada, o pior caso é reservado de forma atômica; depois, a reserva é acertada pelo uso real (sem `usage` ou com timeout, fica a estimativa). Também há uma cota de 10 chamadas por conta por dia.
- **Toda saída passa pelo validador** (`lerSaidaOpenai` + `hydrate`/`validateItems`). Fora das regras, a saída é descartada e o pedido segue para o Claude. A chamada descartada também conta no gasto.
- **Nunca vai para a API:** dor, revisão, comida e explicações.
- Nenhuma chave entra no repositório.

## Respostas automáticas sem computador: a rotina na nuvem
Para os pedidos da aba Chat serem respondidos com o celular e o computador desligados:
1. Abra o **claude.ai/code** e crie uma rotina agendada (`/schedule`). Ela roda na infraestrutura da Anthropic, na sua assinatura.
2. Agende a cada 3 horas. O app assume 3 h no status; confira no `/schedule` o intervalo mínimo e o limite de execuções do seu plano.
3. Use o pedido que o app copia ("Respostas automáticas", no passo a passo). Ele chama `ciclo_chat_pendentes` com `origem: "rotina"` e responde com `ciclo_responder_pedido`.

A rotina usa a mesma conexão OAuth do passo a passo.

## O vigia no Mac é opcional
O `vigia.sh` responde em segundos, mas só com um computador ligado. Saiu do caminho principal: use só se não custar nada além da assinatura que você já tem.

## Status honesto na tela
O selo da aba Chat e o cartão "Chat ligado" vêm de `statusClaude` (core):

| Selo | Quando aparece |
|---|---|
| **online agora** | o vigia respondeu há menos de 2 min |
| **na fila · responde em ~N** | a rotina rodou nas últimas 3 h |
| **sem rotina ativa** | ninguém processa a caixa; os pedidos esperam você abrir o Claude |

A regra responde na hora em qualquer modo.

## Bug do PDF em produção (resolvido na #66)
- **Sintoma:** "Não consegui ler este PDF" no iPhone. A transcrição de voz funcionava.
- **Causa:** o `page.getTextContent()` do pdf.js 6 faz `for await` num `ReadableStream`. O Safari (iOS e macOS) não implementa `ReadableStream[Symbol.asyncIterator]`, e a build `legacy` do pdf.js não traz polyfill disso.
- **Correção:** o texto é lido pelo `getReader()` (`lerTudo`/`textoDosItens` em `packages/core/src/pdf-texto.ts`, com teste).
- **Hipóteses descartadas** no build de produção (`npm run build` + `wrangler dev`):
  - CSP: o pdf.js roda com `useWasm: false`, então não precisa de `wasm-unsafe-eval`;
  - MIME do `.mjs`: é servido como `text/javascript`;
  - Chrome: lia normalmente.
- **Endurecido também:**
  - o service worker não guarda mais HTML no lugar de um chunk sumido (cache `ciclo-v0.3.0`);
  - a tela pede para reabrir o app se o chunk não carregar.
- **Teste:** `npm run e2e:pdf`, com o build e o servidor locais rodando. Ele lê um PDF fictício no Chrome e "como o Safari".
