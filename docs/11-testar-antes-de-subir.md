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
Falham no primeiro passo errado e dizem qual, e qualquer erro ou aviso no console reprova o passo. Os dois rodam no `npm run gate` (= `npm run check` + `e2e:primeiro-acesso` + `e2e:pular`), que o `npm run deploy` exige antes de subir. O `npm run check` continua só com typecheck, testes e build (rápido, sem Chrome), para rodar a cada commit.

## Antes de subir
`npm run gate` e `npm run deploy:dry` (ver também [09 · Teste local](09-teste-local.md) e [05 · Deploy](05-deploy-gratis.md)). O iPhone, pelo túnel (`npm run dev:tunnel`), fica para depois do fluxo aprovado aqui.
