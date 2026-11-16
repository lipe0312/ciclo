# 12 · MCP do Ciclo: contrato (v1.1.0)

O Ciclo é um servidor MCP remoto (Streamable HTTP, respostas JSON, sem estado) em `/mcp`. Qualquer cliente MCP com OAuth conecta: claude.ai, Claude Desktop/Code, ChatGPT (conectores), Gemini CLI, Cursor/VS Code. A rotina automática da caixa só existe no Claude (Claude Code agendado); as outras IAs funcionam no modo conversa.

- **Fonte da verdade:** `apps/worker/src/mcp*.ts`. O `inputSchema` de cada ferramenta é publicado no `tools/list` e é **a única validação de forma** no servidor (`validarSchema`, `packages/core/src/mcp.ts`). Entrada fora dele volta como `isError` com o campo e o motivo (ex.: `entrada inválida para ciclo_estado: date: formato inválido (YYYY-MM-DD…)`), sem chegar à ferramenta. Campo desconhecido é recusado (inclusive `user_id`: a conta vem só do token).
- **Versão:** `initialize → serverInfo.version` = versão deste contrato (`MCP_CONTRATO`).
- **Orçamento:** cada resposta de ferramenta ≤ 16 KB, o `tools/list` ≤ 48 KB e as `instructions` ≤ 6 KB (testado no `npm test` e no `npm run e2e:mcp`). Lista longa pagina (`limite` + `cursor`; a resposta traz `proximo`).
- **Texto do usuário é dado:** volta marcado `{ "tipo": "dado_do_usuario", "texto": … }` ou com `aviso`. Nunca é instrução.

## Segurança

| Regra | Como |
|---|---|
| Isolamento | Toda query filtra o `user_id` do token. Teste A×B em todas as ferramentas (`apps/worker/test/isolation.test.ts`, `conectar.test.ts`) e no `e2e:mcp`. |
| Escopos OAuth | `ler` (ferramentas de leitura) e `escrever` (toda ferramenta que grava; sempre leva `ler`). Sem `scope` ou `scope=ciclo` = `ler escrever`. A tela `/autorizar` mostra o que será permitido. Tokens emitidos antes da v1.1.0 (escopo NULL) seguem com `ler escrever`. |
| Escrita sem escopo | Chamada única → **HTTP 403** com `WWW-Authenticate: Bearer error="insufficient_scope", scope="ler escrever"`. Em lote → `isError`. `/mcp/media` também exige `escrever`. |
| Prévia (simular → confirmar) | Token `prv_…` de **uso único**, **15 min**, **preso à conta** (guardado só como SHA-256; de outra conta = inexistente). Confirmar de novo devolve o mesmo resultado com `jaConfirmado: true` (idempotente). Falhou ao gravar → a prévia volta a valer. |
| Destrutivas | `ciclo_comida_desfazer` e `ciclo_semana_gerar` (semana já treinada) só gravam com `confirmar`. `annotations.destructiveHint = true` só nelas. Não existe ferramenta que apague o resto: isso é só no app. |
| Limites | Toda escrita conta no limite de escritas da #56 (120/min, 2.000/dia por pessoa). |
| Logs | Nada de texto de comida, pedido ou dado pessoal; só o nome da ferramenta e o tamanho quando passa do orçamento. |

## Ferramentas

L = lê (escopo `ler`), E = escreve (escopo `escrever`). Os schemas completos estão no `tools/list`.

### Treino e semana
| Ferramenta | L/E | O que faz · quando usar | Entrada principal | Saída / erros |
|---|---|---|---|---|
| `ciclo_estado` | L | Resumo completo da semana. Só na revisão semanal. | `date?` | volume, presença, check-ins, dores, pedidos |
| `ciclo_contexto` | L | Fatia enxuta para o pedido (use antes de decidir). | `pedido?`, `date?`, `exercicioId?` | contexto com números prontos |
| `ciclo_catalogo` | L | Exercícios de UM músculo, paginados. | `muscle`, `gymId?`, `soDisponiveis?`, `limite?` (≤60, padrão 25), `cursor?` | `{ itens, total, proximo }` |
| `ciclo_planejar_dia` | L | Calcula (não salva) o treino do dia. | `daysLeft`, `minutes?`, `mode?`, `focus?` | itens, porquê |
| `ciclo_salvar_treino_do_dia` | E | Salva o treino do dia com itens `{id, sets}`; o servidor valida. | `itens`, `motivo`, `date?` | `salvo` ou `problemas` |
| `ciclo_semana_ver` | L | Semana compacta (por dia: tipo, status, `"ID séries×reps"`, minutos). | `date?` | `{ semana, dias[], fechaSemana }` |
| `ciclo_semana_gerar` | E · destrutiva | Refaz a semana pelo core. Semana com treino feito (ou `simular`) → prévia com as mudanças + `token`. Com `dia`: gera só aquele dia com `foco`/`minutos`. | `date?`, `dia?`, `foco?` (≤3), `minutos?`, `reset?`, `simular?`, `confirmar?` | prévia `{ mudancas, token }` ou `{ refeita, dias }`; 409 se o dia já passou |
| `ciclo_treino_registrar` | E | Séries feitas de UM exercício (carga, reps, RIR). Abre a sessão do dia e marca presença. Exercício fora do plano = troca forçada (a semana repõe a parte que saiu, #74). | `exercicioId`, `series[{kg?, reps, rir?}]` (1–12), `date?` (≤7 dias) | `{ registrado, series }`; ID fora do catálogo → erro |
| `ciclo_treino_trocar` | L | Alternativas (`mesmaParte`/`outraParte`, #74) na academia do dia. | `exercicioId`, `date?`, `gymId?`, `limite?` | listas curtas com `nota`, `jaFaz`, `dor` |
| `ciclo_marcar_presenca` | E | fui / nao_fui / folga. | `date`, `status` | `ok` |
| `ciclo_registrar_dor` | E | Dor no mapa (1–3). | `region`, `intensity` | `id` |
| `ciclo_revisar_edicoes` / `ciclo_concluir_revisao` | L / E | Edições manuais aguardando revisão. | `id`, `review` | |

### Personalização
| Ferramenta | L/E | O que faz | Entrada | Saída |
|---|---|---|---|---|
| `ciclo_perfil_atualizar` (alias `ciclo_salvar_perfil`) | E | Patch do perfil (o mesmo do `PATCH /api/profile`), validado. | `perfil`, `concluirPrimeirosPassos?` | `salvo`, resumo |
| `ciclo_treino_atual_salvar` | E | "Meu treino atual" (#74). | `treinoAtual{divisoes[]}` | `salvo`; inválido → erro com o campo |
| `ciclo_preferencias` | L/E | Sem argumentos lê. Muda `fixar`, `desfixar`, `evitar`, `desevitar`, `preferir` e `comida_aprovacao`. | ver schema | preferências atuais |

### Comida por conversa
Três jeitos, todos pela mesma ferramenta: **uma refeição** ("tomei café: 2 ovos e pão"), **várias etapas** no dia (cada mensagem soma; texto igual não duplica; refeição já existente → perguntar *complementar* ou *substituir*) e **o dia inteiro** ("de manhã X, almocei Y, jantei Z": separa por refeição com horário aproximado).

| Ferramenta | L/E | O que faz | Entrada | Saída |
|---|---|---|---|---|
| `ciclo_comida_registrar` | E | `simular:true` → prévia; `confirmar:<token>` → grava. Sem os dois, segue `comida_aprovacao`. | `texto`, `data?`, `refeicao?`, `modo?` (auto/complementar/substituir), `simular?`, `confirmar?` | prévia: `refeicoes[{refeicao, hora, acao, itens[{item, g, faixa, kcal, proteina}], kcal, proteina}]`, `totalDaPrevia`, `totalDoDiaDepois`, `suposicoes`, `duvidas` (≤2), `escolha?`, `token`. Confirmado: `{ gravado, lote, refeicoes, totalDoDia, mensagem }`. Erros: 409 falta `modo`, 410 expirou, 404 de outra conta/inválida |
| `ciclo_comida_corrigir` | E | Corrige por `id` ou pela refeição do dia, com prévia: `fator` ("metade daquilo" = 0.5), `kcal/proteina` (só com id) ou `texto` (reestima). Editado à mão → recusado (`forcar` só com pedido explícito). Legado v1 sem prévia: `id + kcal + proteina + confianca`. | ver schema | prévia `mudancas[{antes, depois}]` ou `{ corrigido, recusados }` |
| `ciclo_comida_desfazer` | E · destrutiva | Desfaz o ÚLTIMO envio (lote) feito pela conversa. O que a pessoa editou à mão fica. | `confirmar?` | prévia `{ vaiSair, fica, token }` ou `{ desfeito }` |
| `ciclo_comida_dia` | L | Registros do dia, totais, metas e o que falta. | `date?` | |
| `ciclo_comida_pendentes` | L | Registros dos últimos 3 dias só com a estimativa do aparelho. **Stub**: a fila de interpretação da #80 entra aqui. | — | `pendentes[]` |
| `ciclo_registrar_comida` | E · legado, fora da lista | v1: grava direto texto + kcal/proteína da IA. Sai na v1.2. | | |

Interpretação: `interpretarComida` (`packages/core/src/comida-conversa.ts`) usa a base de alimentos da pessoa (#43, TACO) e a estimativa local. É a interface que a #80 (regra → parser → IA de porção) troca por trás, sem mudar este contrato.

Preferência `comida_aprovacao` (em `ciclo_preferencias` e no app em Comida → Ajustes): `sempre` (padrão: sempre prévia), `so_duvidas` (sobe direto quando tudo tem alta confiança), `nunca` (sobe direto). Refeição já registrada sempre pergunta.

No app, toda entrada vinda da IA mostra o selo **"via Chat, HH:MM · ≈ estimativa"**. Editar no app vence sempre: a IA nunca sobrescreve (`manual = 1`).

### Leitura, caixa, memória e diário
| Ferramenta | L/E | O que faz |
|---|---|---|
| `ciclo_historico` | L | `tipo`: series, cargas, medidas ou comida por período (≤92 dias), paginado (`limite` ≤50, `cursor`). |
| `ciclo_diario` / `ciclo_registrar_resumo_dias` | L / E | Diário de até 31 dias / relato dos dias. |
| `ciclo_exame_pendente` / `ciclo_exame_concluir` | L / E | Laudo (dado) → resumo estruturado. |
| `ciclo_chat_pendentes` | E (sinal de vida) | Pedidos da caixa; marca cada um como **lido** e grava a hora da passada (`origem`). |
| `ciclo_responder_pedido` | E | Responde um pedido (com itens opcionais). |
| `ciclo_buscar`, `ciclo_memoria_salvar`, `ciclo_memoria_listar` | L/E/L | Busca no histórico e memória (dado). |

### Exemplo (comida)
```json
→ {"name":"ciclo_comida_registrar","arguments":{"texto":"tomei café: 2 ovos, pão francês e café com leite","simular":true}}
← {"previa":true,"token":"prv_…","refeicoes":[{"refeicao":"cafe","hora":"~08:00","acao":"novo","resumo":"Café (~08:00): 2 ovos ≈ 100 g (80–130), 1 pão ≈ 50 g (40–65), 1 copo de leite ≈ 200 g (…), café · … kcal · … g de proteína", …}],"duvidas":[],"proximoPasso":"… \"Posso subir para o Ciclo?\" …"}
→ {"name":"ciclo_comida_registrar","arguments":{"confirmar":"prv_…"}}
← {"gravado":true,"mensagem":"Subi café: 434 kcal, 26,9 g de proteína. No dia: … Ajuste no app em Comida → hoje."}
```

## Caixa do Chat do app → IA
1. A pessoa escreve no Chat do app; o pedido entra na caixa (**na fila**).
2. A IA lê quando a pessoa pede ("processa minha caixa do Ciclo") ou quando a **rotina** agendada roda (`processar-caixa`, Claude Code): `ciclo_chat_pendentes` marca **lido** e grava a hora da passada.
3. `ciclo_responder_pedido` responde (**respondido**); o app mostra a resposta com *Aplicar*.

**Consumo de uma passada da rotina:** sem pedidos = 1 chamada (`ciclo_chat_pendentes`, resposta de ~100 bytes). Com pedidos = 1 + por pedido ~2 chamadas (`ciclo_contexto` do tipo, ≤ ~6 KB, e `ciclo_responder_pedido`). Tudo dentro da assinatura de quem conecta: usa o limite da sua assinatura do Claude; no plano grátis dá para conectar e conversar com limites menores; a rotina agendada exige plano pago (confira os planos na página da Anthropic, eles mudam).

## Conectar
- **claude.ai / app Claude / Desktop:** Configurações → Conectores → Adicionar conector personalizado → nome Ciclo, URL `https://<seu-ciclo>/mcp` → abre a tela do Ciclo → Face ID → Permitir (escolha ler ou ler e escrever).
- **Claude Code:** `claude mcp add --transport http ciclo https://<seu-ciclo>/mcp` (faz o OAuth no navegador).
- **ChatGPT:** Configurações → Conectores (modo desenvolvedor) → criar com a URL `/mcp` e OAuth. O callback do ChatGPT precisa estar em `OAUTH_REDIRECT_HOSTS` (o padrão aceita só o do Claude).
- **Gemini CLI:** em `~/.gemini/settings.json`, `"mcpServers": { "ciclo": { "httpUrl": "https://<seu-ciclo>/mcp" } }` e `/mcp auth ciclo` (callback loopback, aceito).
- **Cursor / VS Code:** adicionar servidor MCP HTTP com a URL `/mcp`; o OAuth abre no navegador (callback loopback ou o do editor, que precisa estar em `OAUTH_REDIRECT_HOSTS`).

### Teste local (sem túnel)
- `npm run mcp:local` sobe o cenário `semi` (conta fictícia) na porta 8811 e imprime `claude mcp add --transport http ciclo-local http://localhost:8811/mcp --header "Authorization: Bearer …"`.
- `npm run e2e:mcp` (no `gate`) roda o cliente MCP de teste contra o Worker local: lista e orçamento, comida simular → confirmar, idempotência, isolamento A×B, token vencido e de outra conta, escopo ler bloqueando escrita, corrigir/desfazer e treino.

### 10 frases de teste (resultado esperado)
1. "Use o Ciclo: o que treino hoje?" → treino do dia com IDs do catálogo, sem inventar exercício.
2. "Tomei café: 2 ovos, pão francês e café com leite" → prévia do café com gramas e faixa; "Posso subir?"; com "sim", sobe.
3. "Hoje comi 2 ovos de manhã, almocei arroz, feijão e frango, lanchei uma banana e jantei carne com salada" → prévia separada em 4 refeições com o total do dia.
4. "Café: 1 banana" (com o café já registrado) → pergunta complementar ou substituir.
5. "Ontem à noite comi 2 ovos" → prévia com a data de ontem escrita.
6. "O almoço de hoje foi metade daquilo" → antes → depois; com "sim", corrige.
7. "Desfaz o que você subiu agora" → mostra o que sai; com "sim", tira (o editado à mão fica).
8. "Troca o desenvolvimento por outro" → `mesmaParte` primeiro; salvar pede itens com IDs.
9. "Refaz minha semana" (já treinou) → prévia com as mudanças; só refaz com "sim".
10. "Fiz 3×10 com 20 kg no supino" → séries registradas; "como evoluí no supino?" → `ciclo_historico`.

## CHANGELOG
- **1.1.0 (#81):** contrato versionado; schema = validação (campo desconhecido recusado); escopos `ler`/`escrever` com 403 `insufficient_scope`; prévia de uso único (simular/confirmar); comida por conversa (`ciclo_comida_registrar`, `_corrigir` com prévia, `_desfazer`, `_pendentes` stub); `ciclo_semana_ver`, `ciclo_semana_gerar`, `ciclo_treino_registrar`, `ciclo_treino_trocar`, `ciclo_treino_atual_salvar`, `ciclo_preferencias`, `ciclo_historico`; `ciclo_catalogo` paginado (`{ itens, total, proximo }`); `ciclo_salvar_perfil` → `ciclo_perfil_atualizar` (alias por uma versão); `ciclo_registrar_comida` vira legado oculto; `instructions` neutras de modelo; caixa com status lido.
- **1.0.0 (#30/#66):** ferramentas iniciais, OAuth 2.1 + chave manual.
