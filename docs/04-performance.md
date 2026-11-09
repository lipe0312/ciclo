# Performance (celular, 4G fraco, mão suada)

## Metas
- Abrir o app na academia: **< 1 s** com o app em cache (service worker) e **1 requisição** de dados (`/api/state`).
- Interação (marcar série, trocar exercício): **< 50 ms**, porque é calculada no aparelho (`core.js`), sem ida ao servidor.
- Lighthouse mobile ≥ 90 em performance e acessibilidade.
- Worker: cada requisição bem abaixo do limite de CPU do plano gratuito, já que as regras são O(exercícios) e o SQL é indexado.

## Como
| Técnica | Detalhe |
|---|---|
| JS mínimo | Sem framework. `app.js` (~55 KB sem minificar) + `core.js` (27 KB minificado). Zero fontes externas (fonte do sistema). |
| Cache | `sw.js`: shell em cache e imagens com cache-first. `/api` nunca é cacheado. As imagens têm `Cache-Control: immutable` de 30 dias. |
| Imagens | 62 imagens de referência em WebP 360 px, ~10 KB cada (704 KB no total contra 4 MB dos JPGs originais), `loading="lazy"`, `width`/`height` declarados (sem pulo de layout). |
| Uma chamada só | `/api/state` agrega perfil, academias, semana, dores, caixa, histórico, mídia e medidas, com `Promise.all` e `DB.batch` no Worker. |
| SQL | Índices: `session(date)`, `session(finished_at) WHERE NULL`, `set_log(exercise_id, created_at)`, `pain(resolved_at) WHERE NULL`, `inbox(status, created_at)`, `food_log(date)`. Histórico de cargas com subconsulta indexada e `LIMIT`. |
| Render | Delegação de eventos única (`data-act`). O cronômetro atualiza **só o texto** a cada 1 s, sem re-render. Só a tela visível é renderizada. |
| Offline | Fila de escrita em `localStorage`, reenviada no evento `online`. A sessão tem id gerado no aparelho, então séries offline não se perdem. |
| Mídia | Upload direto ao R2 pelo Worker (streaming), limite de 20 MB. Recomendado: gravar 720p de 10–15 s. 📋 Compressão no navegador (WebCodecs) antes de subir. |
| Tokens do Claude | Respostas MCP compactas; o Claude manda só IDs; trocas e contas são locais. |

## Como medir
- `npx lighthouse http://localhost:8791 --preset=desktop` (e `--form-factor=mobile`).
- `wrangler tail` em produção (CPU por requisição).
- No celular: Chrome → `chrome://inspect` → Performance.
