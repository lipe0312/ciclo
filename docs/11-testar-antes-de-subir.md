# Testar antes de subir (no computador, sem túnel e sem login)

Cada teste abre direto na tela que importa, num banco de cenário conhecido e fictício. Nunca toca a produção: só `--local`, num D1 próprio em `.wrangler/cenarios/<nome>` (há teste que garante isso).

## Cenários
`npm run dev:cenario -- --lista` mostra o que cada um tem.

| Cenário | O que tem | Use para |
|---|---|---|
| `vazio` | conta recém-criada (nome, sobrenome, sexo, termos). Sem perfil, academia, treino, comida ou dor | Primeiros passos, primeiro cadastro de coisas, Hoje vazio |
| `semi` | Perfil respondido, 1 academia, 2 semanas de treinos, check-ins, 1 dor leve, comida de 3 dias | Hoje, Semana, Treino, Diário, Comida, Corpo, gráficos |
| `dono` | o `semi` + papel de dono, 2 convites (1 pendente), 3 de 10 vagas | Conta, convites, vagas |

## Subir
```bash
npm run dev:cenario -- vazio --tela primeiros-passos/0   # abre o navegador já logado, na tela
npm run dev:cenario -- semi --tela hoje
npm run dev:cenario -- vazio --reset                     # de outro terminal: volta ao início sem derrubar o servidor
npm run dev:cenario -- vazio --com-login                 # banco vazio e login de verdade (DevTools → WebAuthn)
```
No navegador há o botão discreto "↺ cenário" (só em localhost, só neste modo). Opções: `--porta N`, `--sem-abrir`.

## Roteiro manual: primeiro acesso
Rode `npm run dev:cenario -- vazio --tela primeiros-passos/0` e confira em 390 e 1280 px:
1. Passo 1 sem nada marcado; escolha objetivo e foco; Continuar habilita.
2. Volte e avance: objetivo e foco continuam.
3. Recarregue no meio: volta no mesmo passo, com as respostas.
4. Músculos sem pré-marcação; marque 2 e a ordem fica salva.
5. Rotina, Onde, Dores, Dados básicos, Como você se vê e Comida: nada pré-marcado; cada resposta sobrevive a voltar e recarregar.
6. Pular etapa não perde o que já foi respondido.
7. Resumo mostra o objetivo e o foco escrito.
8. Gerar semana termina sem erro e o Hoje mostra o treino.
9. `--reset`, abra `primeiros-passos/0` e toque em Pular por agora: Hoje vazio com o cartão "Complete o Perfil de treino", sem erro.
10. Menu ⋯: cada item faz o que diz.
11. Console sem erro nem aviso de validação.

## Automático
```bash
npm run e2e:primeiro-acesso   # cenário vazio, roteiro acima (Chrome headless, sobe e derruba o servidor sozinho, porta 8793)
npm run e2e:pular             # cenário vazio, Pular por agora no passo 1
```
Falham no primeiro passo errado e dizem qual, e qualquer erro ou aviso no console reprova o passo. Eles rodam no `npm run gate` (= `npm run check` + os 6 roteiros: `primeiro-acesso`, `pular`, `treino-atual`, `navegacao`, `chat`, `mcp`), que o CI roda em todo PR (job `e2e`). O `npm run check` continua só com typecheck, testes e build (rápido, sem Chrome), para rodar a cada commit.

## O caminho de uma mudança (#164, D17 e N8)
```
1. LOCAL      npm run dev:cenario -- semi · npm run check a cada commit · npm run gate antes do PR
2. PR         CI (.github/workflows/ci.yml): check + e2e (Chrome headless) + deploy-dry + gitleaks. Qualquer um vermelho = PR vermelho
3. MERGE      deploy.yml, job "staging" sozinho, depois do mesmo CI verde: migrations no staging → deploy com APP_VERSION=<commit> → smoke
4. ENSAIO     você abre o staging (https://ciclo-staging.<conta>.workers.dev) e testa no iPhone
5. PRODUÇÃO   Actions → deploy → Run workflow (ref, padrão main) → você aprova no environment production →
              anota o ponto de restauração do D1 → migrations → deploy com APP_VERSION=<commit> → smoke → confere o commit no ar
6. SE QUEBRAR rollback (abaixo)
```
- **A produção só sai pelo Actions.** O `npm run deploy` local recusa e aponta para cá. Só em emergência (Actions fora do ar): `CICLO_DEPLOY_LOCAL=1 npm run deploy`; depois, rode o deploy pelo Actions para a versão no ar voltar a ser um commit conferido.
- **Versão no ar = commit.** O CI faz `wrangler deploy --var APP_VERSION:<sha>` e o `/api/health` devolve `{ ok, version, ambiente }` (`ambiente`: `"staging"` no staging, `null` na produção). No local continua `dev`.
- **Smoke** (`node scripts/smoke.mjs <url> --sha <commit> --ambiente staging|producao`): `/api/health` 200 com o ambiente e o commit, `/` 200 com CSP, `/mcp` sem token → 401, `/api/state` sem sessão → 401. Com `CF_ACCESS_CLIENT_ID` e `CF_ACCESS_CLIENT_SECRET` no ambiente, manda o *service token* do Cloudflare Access (staging fechado, #167). A saída nunca mostra cabeçalho nem corpo.
- **Os jobs de deploy só rodam em `lipe0312/ciclo`** (fork não publica nada) e nunca cancelam um deploy em andamento. O CI nunca usa `pull_request_target`: PR de fork roda sem segredo.

### O que cada environment do GitHub precisa (Settings → Environments; ligar é a #167)
| Nome | Tipo | `staging` | `production` |
|---|---|---|---|
| `CLOUDFLARE_API_TOKEN` | secret | token só do staging | token só da produção |
| `CLOUDFLARE_ACCOUNT_ID` | secret | id da conta | id da conta |
| `D1_DATABASE_ID` | variable | id do `ciclo-db-staging` | id do `ciclo-db` |
| `CF_ACCESS_CLIENT_ID` / `_SECRET` | secret | service token do Access (quando o Access ligar) | não usa |
| Proteção | | só a branch `main` | *required reviewer*: o dono; só a branch `main` |

Sem esses valores o job falha logo no 1º passo dizendo o que falta ("environment staging sem CLOUDFLARE_API_TOKEN: veja a issue H-02"). Nunca coloque esses segredos no nível do repositório: o token de produção só existe no environment `production`, e só é entregue depois da sua aprovação.

**`database_id` fora do git.** O repositório público fica com o placeholder `00000000-…`. No runner, `node scripts/predeploy.mjs --gerar-config <staging|production>` grava `apps/worker/wrangler.deploy.jsonc` (fora do git, só no CI) com o id da variable, e o wrangler roda com `--config` nessa cópia; o `predeploy --config <arquivo>` confere a cópia, e o log do CI nunca mostra o id. A sua mudança local do `wrangler.jsonc` com os ids reais pode ser descartada.

**Permissão mínima de cada token** (Cloudflare → My Profile → API Tokens → Create Custom Token, um por ambiente):
- *Account* → **Workers Scripts: Edit** e **D1: Edit**, só na conta do Ciclo (*Account Resources*: Include → a sua conta).
- **Sem** permissão de zona, DNS, R2 admin, Access ou usuário. Se o `predeploy` avisar que não listou os secrets, o token está sem Workers Scripts.
- Opcional: *Client IP Address Filtering* não serve (os IPs do runner mudam); prefira validade curta (ex.: 1 ano) e renovar.

## Rollback
- **Código:** `npx wrangler rollback --config apps/worker/wrangler.jsonc` (produção) ou `--env staging` (staging) volta para a versão anterior; `npx wrangler deployments list` mostra as últimas (até 100). O rollback não mexe no banco.
- **Dados:** o job de produção anota no resumo (Actions → o run → Summary) o **ponto de restauração do D1** de antes das migrations. Para voltar: `npx wrangler d1 time-travel restore ciclo-db --bookmark=<o anotado>` (até 7 dias no plano grátis). Restaurar apaga o que foi escrito depois desse ponto: avise os convidados antes.
- **Migrações no padrão "expandir e depois contrair":** numa entrega, só acrescente (tabela, coluna, índice). `DROP` ou `RENAME` só numa entrega **seguinte**, quando nenhum código no ar usa mais o que sai. Assim o rollback do código nunca encontra um banco que ele não entende. Migração aplicada nunca é editada: corrige-se com outra.

## Antes de subir
`npm run gate` e `npm run deploy:dry` (o CI roda os dois em todo PR; ver também [09 · Teste local](09-teste-local.md) e [05 · Deploy](05-deploy-gratis.md)). O iPhone, pelo túnel (`npm run dev:tunnel`), fica para depois do fluxo aprovado aqui.
