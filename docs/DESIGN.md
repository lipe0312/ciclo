# DESIGN.md: Ciclo

> A fonte da verdade visual são os tokens em `apps/web/public/app.css`. Mudou aqui, muda lá. Direção feita com as skills `ui-build`, `ui-design-references` e `web-design-guidelines` (Vercel).

## Atmosfera
É uma ferramenta de academia, não um app de startup: tela escura, números grandes e tabulares, uma cor de destaque só. Ela tem que ser usável com uma mão, suada, entre séries.

## Tokens
| Token | Escuro | Claro | Uso |
|---|---|---|---|
| `--bg` | `#0B0B0C` | `#F6F6F3` | fundo |
| `--sup` / `--sup-2` / `--sup-3` | `#151518` / `#1C1C20` / `#26262B` | `#FFF` / `#EFEFEB` / `#E4E4DE` | cartões, segmentos, trilhos |
| `--txt` / `--sub` | `#F4F4F5` / `#A1A1AA` | `#16161A` / `#5B5B57` | texto |
| `--acc-bg` | `#C6F432` (verde-limão) | igual | ação principal, foco, "hoje", progresso |
| `--ok` / `--warn` / `--bad` | verde / âmbar / vermelho | — | feito / pendente / dor ou falta |
| Raio | 12 px (cartão), 10 px (botão), 999 (chip) | | |

## Regras
- **Uma ação principal por cartão** (botão verde-limão). Toques de ≥ 44 px.
- Números com `tabular-nums`. Um número grande por cartão.
- Gráficos em SVG/CSS: barra = feito (cor do texto) + hoje (hachurado verde) + marca da meta. O valor sempre vem escrito; a cor nunca é o único sinal.
- Selo de modelo do Claude: Haiku verde, Sonnet azul, Opus âmbar (contorno, não preenchido).
- Mapa de dor: âmbar (leve), laranja (média), vermelho (forte).
- Não usar gradiente roxo, glassmorphism, emoji como ícone nem sombra pesada.
- `prefers-reduced-motion` respeitado; foco visível de 3 px.
- Celular primeiro (390 px); barra inferior com 5 destinos; no computador, barra lateral.
