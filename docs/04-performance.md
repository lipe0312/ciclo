# Performance (celular, 4G fraco, mão suada)

## Metas
- Abrir o app na academia: **< 1 s** com o app em cache (service worker) e **1 requisição** de dados (`/api/state`).
- Interação (marcar série, trocar exercício): **< 50 ms**, porque é calculada no aparelho (`core.js`), sem ida ao servidor.
- Lighthouse mobile ≥ 90 em performance e acessibilidade.
- Worker: cada requisição bem abaixo do limite de CPU do plano gratuito, já que as regras são O(exercícios) e o SQL é indexado.

## Como
| Técnica | Detalhe |
|---|---|
| JS enxuto | Vite + Preact (ADR-0008): **129,8 KB gzip** de JS inicial (`main` + `conta`) e 12 KB gzip de CSS (medido em 22/11/2026). pdf.js e Leaflet em chunks sob demanda. Zero fontes externas (fonte do sistema). |
| Cache | `sw.js`: shell em cache e imagens com cache-first. `/api` nunca é cacheado. As imagens têm `Cache-Control: immutable` de 30 dias. |
| Imagens | 62 imagens de referência em WebP 360 px, ~10 KB cada (704 KB no total contra 4 MB dos JPGs originais), `loading="lazy"`, `width`/`height` declarados (sem pulo de layout). |
| Uma chamada só | `/api/state` agrega perfil, academias, semana, dores, caixa, histórico, mídia e medidas, com `Promise.all` e `DB.batch` no Worker. |
| SQL | Índices: `session(date)`, `session(finished_at) WHERE NULL`, `set_log(exercise_id, created_at)`, `pain(resolved_at) WHERE NULL`, `inbox(status, created_at)`, `food_log(date)`. Histórico de cargas com subconsulta indexada e `LIMIT`. |
| Render | Preact com estado global e `commit()` (re-render por assinatura). Só a tela visível é renderizada; telas pesadas em `import()` sob demanda. |
| Atualização | O app confere `GET /api/version` (1 linha por conta) a cada 8 s **só com a aba visível** e ao voltar para a aba; escritas seguidas viram uma conferência só (debounce de 600 ms). A versão sobe em `waitUntil`, sem atrasar a resposta (#114). |
| Offline | Fila de escrita em `localStorage`, reenviada no evento `online`. A sessão tem id gerado no aparelho, então séries offline não se perdem. |
| Mídia | Upload direto ao R2 pelo Worker (streaming), limite de 20 MB. Recomendado: gravar 720p de 10–15 s. 📋 Compressão no navegador (WebCodecs) antes de subir. |
| Tokens do Claude | Respostas MCP compactas; o Claude manda só IDs; trocas e contas são locais. |

## Medido (local, #31)
| Item | Meta | Medido |
|---|---|---|
| JS inicial (`index-*.js`) | ≤ 150 KB gzip | **145,4 KB** gzip (+ CSS 9,9 KB); pdf.js (162 KB) e Leaflet (43 KB) só sob demanda |
| Upload total do Worker + assets | — | 388 KB (105 KB gzip), `wrangler deploy --dry-run` |
| `/api/state` e `/api/home` | < 150 ms | **4 ms** e **3 ms** (mediana, D1 local, `npm run e2e:local`). Em produção o D1 soma a ida à região do banco |
| Lighthouse mobile ≥ 90 | — | passo do dono depois do deploy (05, passo 8) |

## Como medir
- `npx lighthouse http://localhost:8791 --preset=desktop` (e `--form-factor=mobile`).
- `wrangler tail` em produção (CPU por requisição).
- No celular: Chrome → `chrome://inspect` → Performance.
