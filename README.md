# Ciclo

**Treino com semana flexível, check-in diário, mapa de dor e dieta leve, administrados pelo Claude.** Sem API: o Claude usa a **sua assinatura** por um connector MCP. Custo de hospedagem: **R$ 0** (Cloudflare).

> Projeto pessoal, aberto para quem quiser copiar. Não é aconselhamento médico.

| Hoje | Treino | Corpo |
|---|---|---|
| objetivo no topo, check-in em 10 s, semana flexível (dias que ainda dá, tempo, academia, foco), compensatório **só a pedido**, pedidos ao Claude com diff | cronômetro, descanso que vibra e apita, "começou = fui", fecha sozinho em 2 h, trocar/editar/"não fiz", mídia do **seu** aparelho | mapa de dor (frente/costas) que tira exercícios e coloca fortalecimento; medidas de braço e cintura |

## Rodar em 1 minuto (local)
```bash
git clone https://github.com/lipe0312/ciclo && cd ciclo
npm install
npm run setup        # .dev.vars com token, build do front, banco local
npm run dev          # vite build --watch + wrangler dev → http://localhost:8791  (demo: /?demo)
npm run demo         # só o front (Vite :5173, /api e /mcp com proxy para :8791) em modo demonstração
npm run check        # typecheck (core, web, worker) + testes + build do front
```

## Usar na academia (Mac em casa desligado)
Deploy grátis na Cloudflare (Workers + D1 + R2 + Access): [`docs/05-deploy-gratis.md`](docs/05-deploy-gratis.md). Depois instale no celular ("Adicionar à tela inicial") e adicione o connector no claude.ai.

## Como funciona
```
celular (PWA) ─┐                 ┌─ claude.ai / app do Claude (connector /mcp)
               ├─ Cloudflare Worker ─┤
               │   app · /api · /mcp · cron      └─ Claude Code (apps/mcp-local, stdio)
               └─ packages/core (regras puras, testadas) → D1 (dados) · R2 (vídeos)
```
- **O Claude decide, o código monta:** o Claude devolve só IDs e séries; o core valida (aparelho, dor, tempo, prioridades) e monta o treino com imagens e vídeos.
- **Modelo por pedido:** Haiku para registros, Sonnet para reorganizar o dia, Opus para dor e revisão.

## Documentação
| | |
|---|---|
| [01 · Requisitos v3](docs/01-requisitos-v3.md) | o que o app faz e por quê, ligado ao objetivo |
| [02 · Arquitetura](docs/02-arquitetura.md) | peças, fluxos, dados, ADRs |
| [03 · Segurança](docs/03-seguranca.md) | Access, token do MCP, CSP, validação, segredos |
| [04 · Performance](docs/04-performance.md) | metas e técnicas (offline, 1 requisição, WebP) |
| [05 · Deploy grátis](docs/05-deploy-gratis.md) | Cloudflare passo a passo, celular, connector |
| [06 · Roadmap](docs/06-roadmap.md) | marcos M0–M5 |
| [07 · Claude](docs/07-claude.md) | ferramentas MCP, skills, modelo por pedido, automação |
| [DESIGN](docs/DESIGN.md) · [ADRs](docs/adr) · [Concepção v2](docs/00-concepcao-v2.md) | |

## Licença
MIT. Imagens de exercícios: [free-exercise-db](https://github.com/yuhonas/free-exercise-db) (domínio público). Veja [THIRD_PARTY.md](THIRD_PARTY.md).
