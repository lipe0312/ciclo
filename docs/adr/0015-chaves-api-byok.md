# ADR-0015 · Chaves de API próprias (BYOK): cofre em envelope no Worker
**Status:** aceito (issue #88, decisão do dono de 16/11: opção 1)

## Contexto
Hoje há dois jeitos de usar IA no Ciclo: conectar o MCP (assinatura do Claude) ou a chave OpenAI **do dono** num secret do Worker (`OPENAI_API_KEY`, ADR-0013). Cada pessoa precisa poder cadastrar a **própria** chave (Anthropic, OpenAI, Google Gemini; extensível) para o Chat interno e as rotinas (#89). A chave é um segredo de terceiro que gera custo: nunca pode voltar ao navegador, aparecer em log, export, erro ou backup em claro.

## Opções
1. **Criptografia em envelope no Worker (escolhida).**
2. Cloudflare AI Gateway com BYOK/Secrets Store. Fica de fora por enquanto: exige conferir se o Gateway grava o corpo das requisições e acrescenta um terceiro no caminho.
3. Cifrar no navegador (WebAuthn PRF) e mandar a chave a cada uso. Descartada: as rotinas rodam sem o navegador.

## Decisão
- **Envelope:** cada chave é cifrada com **AES-256-GCM** (WebCrypto, sem dependência) por uma **DEK aleatória de 32 bytes**, com **IV aleatório de 12 bytes** por cifra. A DEK é embrulhada (AES-256-GCM, outro IV) pela **KEK**, que fica num **secret do Worker** (`KEK_V1`, 32 bytes em base64). Só `ciphertext`, `iv`, `dek_cifrada` e `kek_versao` vão ao D1 (`chave_ia`, migration `0023`).
- **AAD = `user_id|provedor|key_id`** (e `|kek_vN` no embrulho da DEK): um blob copiado para outra conta, outro provedor ou outra linha não decifra (teste).
- **Decifrar só no uso**, por requisição, numa variável local de `comChaveDoUsuario` (`apps/worker/src/chaves.ts`); nunca em `env`, cache, KV, retorno ou erro. Os bytes da DEK e do texto claro são zerados depois do uso (melhor esforço).
- **Cadastro:** `POST /api/account/chaves` exige Face ID dos últimos 5 min (step-up, o mesmo `exigirFaceId` da #62), confere o formato, **valida no provedor** listando os modelos (chamada barata) e guarda a lista filtrada pela allowlist do core. Trocar (`PUT …/:id/segredo`), mudar (`PATCH`: apelido, ativo, modelo, esforço, tetos) e apagar (`DELETE`) também pedem Face ID. A tela recebe só `provedor · apelido · ••••últimos4 · impressão SHA-256 curta · criada · último uso`.
- **Saída:** só `api.anthropic.com`, `api.openai.com` e `generativelanguage.googleapis.com` (`hostPermitido` no core), https, **sem seguir redirect** (um cabeçalho como `x-api-key` não acompanha um 3xx para outro host). A chave vai **só em cabeçalho**, nunca na URL. A CSP do app não muda: só o Worker chama o provedor.
- **Erro do provedor:** o corpo é descartado sem ler; voltam só o código e uma mensagem fixa (o provedor pode ecoar o cabeçalho com a chave).
- **Modelo e esforço por provedor** (`parametrosModelo` no core, com teste): Claude ≥ 4.6 → `thinking: adaptive` + `output_config.effort`; Opus 4.5 → `effort`; Haiku 4.5 → `budget_tokens`. OpenAI gpt-5/o-series → `reasoning_effort` (sem temperatura); gpt-4.x sem esforço. Gemini 2.5 → `thinkingBudget`; Gemini 3 → `thinkingLevel`. Provedor novo = um adaptador em `packages/core/src/chaves.ts`.
- **Gasto:** teto por chave em US$ por dia e por mês (0,01 ≤ dia ≤ mês ≤ 100), o pior caso **reservado num UPDATE atômico** em `chave_ia_uso` antes de chamar e acertado pelo uso real depois. Se o uso real passar da estimativa, o teto pode estourar em **no máximo uma chamada**: o gasto fica ≥ teto e a reserva seguinte já não cabe (bloqueada; teste). Sem a KEK da versão da linha, nada é reservado. O limite de 6 chaves por conta é conferido no próprio INSERT (corrida entre dois cadastros não grava evento sem linha). A impressão é HMAC-SHA256(`user_id|chave`) com chave derivada da KEK por HKDF: sem a KEK não se confere uma chave conhecida contra ela, e a mesma chave em duas contas não correlaciona. Rate limit por conta: usar 20/min, validar 10/h.
- **Prioridade:** a chave da pessoa vence; `OPENAI_API_KEY` vira só o "padrão do servidor" opcional (`fonteOpenai`).
- **Trilha sem segredo:** `chave_ia_evento` (criada, validada, trocada, desativada, ativada, falhou + código, teto, apagada) e `chave_ia_uso` (chamadas e tokens por dia).
- **LGPD:** apagar a chave sobrescreve o envelope e remove a linha na mesma transação; apagar a conta leva as três tabelas. O **export leva só metadados** (nunca ciphertext, iv nem DEK).

## Rotação, revogação e vazamento
- **Rotação da KEK:** crie `KEK_V2` (`wrangler secret put KEK_V2`). As cifras novas usam a maior versão; as antigas seguem legíveis pela `KEK_V1`, que fica até não restar linha com `kek_versao = 1` (a pessoa troca a chave, ou um re-embrulho em lote numa issue própria). Só então apague `KEK_V1`.
- **Revogação:** a pessoa desativa ou apaga na tela; a fonte da verdade é o painel do provedor (revogar lá invalida na hora, e a validação seguinte falha com `chave_recusada`).
- **KEK vazada:** o D1 sozinho não abre nada; com o D1 **e** a KEK, sim. Resposta: gerar `KEK_V2`, pedir a todas as contas que **revoguem no provedor e cadastrem de novo**, apagar as linhas antigas e a `KEK_V1`. Um D1 vazado sem a KEK não exige ação além de avisar.
- **D1 vazado ou backup (Time Travel):** só ciphertext; a KEK não está no D1.

## Consequências
- Sem dependência nova (WebCrypto nativo no Worker, no Node e no navegador).
- Sem `KEK_V1` o cofre fica desligado (falha fechada: cadastrar → 503 `cofre_desligado`).
- O Chat interno e as rotinas usando a chave ficam na #89; hoje a chave da pessoa já vale para o cérebro `openai-api` da caixa.
- Varredura de segredo (`scripts/segredos.mjs`) roda no `npm test`: o repositório não pode ter nada com cara de `sk-…`, `sk-ant-…` ou `AIza…`.
