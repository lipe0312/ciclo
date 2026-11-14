# DESIGN.md: Ciclo

> A fonte da verdade visual são os tokens em `apps/web/src/app.css`. Mudou aqui, muda lá. Direção feita com as skills `ui-build`, `ui-design-references` e `web-design-guidelines` (Vercel).

## Atmosfera
É uma ferramenta de academia, não um app de startup: tela escura, números grandes e tabulares, uma cor de destaque só. Ela tem que ser usável com uma mão, suada, entre séries. Visual simples e limpo: nada que não ajude a decidir ou registrar.

## Tokens

### Cor
| Token | Escuro | Claro | Uso |
|---|---|---|---|
| `--bg` | `#0B0B0C` | `#F6F6F3` | fundo |
| `--sup` / `--sup-2` / `--sup-3` | `#151518` / `#1C1C20` / `#26262B` | `#FFF` / `#EFEFEB` / `#E4E4DE` | cartões, segmentos, trilhos |
| `--txt` / `--sub` | `#F4F4F5` / `#A1A1AA` | `#16161A` / `#5B5B57` | texto |
| `--borda` / `--borda-ctrl` | `#2A2A30` / `#6B6B74` | `#DDDDD6` / `#8A8A84` | divisória / contorno de controle |
| `--acc-bg` | `#C6F432` (verde-limão) | igual | ação principal, foco, "hoje", progresso |
| `--ok` / `--warn` / `--bad` / `--info` | verde / âmbar / vermelho / azul | — | feito / pendente / dor ou falta / aviso neutro |

### Espaço, raio, alvo
| Token | Valor | Uso |
|---|---|---|
| `--sp-1` … `--sp-5` | 4 / 8 / 12 / 16 / 24 px | espaçamento (múltiplos de 4) |
| `--r` | 12 px | cartão, estado, sheet (16 px no topo) |
| `--r-btn` | 10 px | botão, input, segmento |
| `--r-chip` | 999 px | chip, badge |
| `--alvo` | 44 px | menor área de toque |

### Tipografia
Inter / system-ui. Corpo 15 px; `.small` 13; `.tiny` 12; `h2` 17; `h1` 22–28 (clamp); `.big` 34 (um por cartão). **Inputs com 16 px no celular** (o iOS não dá zoom). Números com `tabular-nums` (`.num`).

### Movimento
| Token | Valor | Uso |
|---|---|---|
| `--dur-1` | 150 ms | hover, pressão |
| `--dur-2` | 200 ms | entrada de tela (fade + 4 px), scrim |
| `--dur-3` | 250 ms | sheet subindo/descendo |
| `--ease` | `cubic-bezier(.2,.8,.2,1)` | tudo que entra |

Nada passa de 250 ms. `prefers-reduced-motion: reduce` desliga transição e animação (inclusive o esqueleto).

## Navegação
- **Barra inferior com 5 destinos** no celular (Hoje, Treino, Diário, Comida, Chat); o resto fica em **Mais**. No computador, barra lateral.
- **Toda tela tem saída previsível.** Fora das 5 raízes, o topo mostra `‹ Destino` (componente `Voltar`, `lib/voltar`). O destino é o nível de cima (`voltarDe` no core), nunca `history.back`: Semana → Hoje, dia → Semana, exercício → Exercícios, telas do Mais → Mais, Mais → Hoje. Teste: `packages/core/test/navegacao.test.ts`.
- **Esc** (computador) e **arrasto da borda esquerda** (app instalado no iPhone) levam ao mesmo destino. Esc com sheet aberto fecha só o sheet.
- O modo treino tem o próprio `×` (sair sem encerrar).

## iPhone
- `viewport-fit=cover` e `env(safe-area-inset-*)` em toda barra: topo da tela, barra inferior, sheet, modo treino e rodapés fixos.
- `overscroll-behavior` em `html` e nos sheets (sem puxar a página atrás).
- `apple-touch-icon` PNG 180 px, `apple-mobile-web-app-*` e status bar translúcida.

## Componentes
| Componente | Onde | Regra |
|---|---|---|
| **Botão** `.btn` | `app.css` | 44 px; `.pri` (verde-limão) só **um por cartão**; `.ghost` para ação secundária; `.danger` para apagar |
| **Chip** `Chip` / `.chip` | `lib/ui` | 44 px, raio 999; `aria-pressed` quando liga/desliga |
| **Segmento** `Seg` | `lib/ui` | opções curtas (2–5) |
| **Cartão** `Card` / `.card` | `lib/ui` | raio 12, borda 1 px, padding 16; `.hl` destaca |
| **Sheet** `openSheet` + `SheetHead` | `lib/folha` | sobe em 250 ms; fecha no `×`, no scrim, no Esc e **arrastando para baixo** (alça no topo) |
| **EstadoVazio** `Estado` | `lib/estado` | um só para `vazio`, `erro` e `offline`: ícone, título, uma linha e no máximo um CTA |
| **Esqueleto** `Esqueleto` | `lib/estado` | no lugar de spinner, com a forma da tela que vem |
| **Voltar** `Voltar` | `lib/voltar` | no topo, rótulo = nome do destino |
| **Avatar** | Home (#62) | círculo 44 px, iniciais em `--sup-2` |
| **Faixa** `showFaixa` | `lib/faixa` | aviso da casca (offline, ambiente de teste); uma linha, borda esquerda colorida |
| **Toast** `toast()` | `lib/ui` | confirmação curta, 2,4 s |

## Microcopy
- pt-BR, frases curtas, verbo no começo do botão ("Registrar", "Gerar outro treino").
- O assistente se chama **Chat** em toda a interface. O nome do fornecedor aparece só no passo a passo de conexão ("Funciona com o Claude, da Anthropic"). Sem logo ou marca de terceiros. Teste: `apps/web/test/textos.test.ts`.
- Estado vazio diz o que fazer a seguir; erro diz o que aconteceu e como tentar de novo; offline diz que os dados do aparelho continuam valendo.
- Sem culpa nem exclamação ("Faltou ontem?" e não "Você faltou!").

## Regras
- **Uma ação principal por cartão** (botão verde-limão). Toques de ≥ 44 px.
- Números com `tabular-nums`. Um número grande por cartão.
- Gráficos em SVG/CSS: barra = feito (cor do texto) + hoje (hachurado verde) + marca da meta. O valor sempre vem escrito; a cor nunca é o único sinal.
- Selo de modelo: Haiku verde, Sonnet azul, Opus âmbar (contorno, não preenchido).
- Mapa de dor: âmbar (leve), laranja (média), vermelho (forte).
- Não usar gradiente roxo, glassmorphism, emoji como ícone nem sombra pesada.
- Foco visível de 3 px.
- Celular primeiro (390 px, sem rolagem lateral).

## Performance (iPhone no 4G)
- JS inicial ≤ 130 KB gzip (Hoje + Treino); cada tela que baixa ao abrir ≤ 40 KB; pdf.js e Leaflet ≤ 180 KB e só numa ação. `scripts/orcamento-js.mjs` roda no `npm run build` e falha se passar.
- Telas fora de Hoje/Treino são `telaLenta` (`lib/tela-lenta`): baixam ao abrir e, no ócio depois da 1ª tela, uma a uma, para o service worker guardar (abre sem sinal).
