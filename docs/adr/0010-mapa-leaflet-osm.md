# ADR-0010 · Mapa dos lugares: Leaflet + OpenStreetMap
**Status:** aceito (decisão do dono, issue #26)

**Contexto:** academias, casa e hotel ganham localização no mapa (marcar ponto, buscar endereço, "usar minha localização"). O app é grátis e sem chave de API.

**Decisão:**
- **Leaflet 1.9.4** (única dependência nova de runtime, `~1.9.4`, sem `@types`; declarações mínimas em `apps/web/src/leaflet.d.ts`). Carregado por `import()` só na tela que tem mapa (chunk de ~43 KB gzip fora do JS inicial). Pino desenhado em CSS (`L.divIcon`), sem imagens do Leaflet.
- **Tiles:** `https://tile.openstreetmap.org` (atribuição "© OpenStreetMap" visível). CSP: só `img-src` ganha esse domínio. Os tiles pedem Referer: o `TileLayer` usa `referrerPolicy: "origin"` (só a origem do app, nunca o caminho); o resto do app continua com `Referrer-Policy: no-referrer`.
- **Busca de endereço (Nominatim) pelo Worker**, não pelo navegador: o navegador não deixa definir `User-Agent`, e o Worker é quem se identifica (`Ciclo-app/1.0`, sem e-mail nem dado pessoal). Limite de 1 req/s por conta (`hitRateLimit`, balde `geocode`) → 429. Por isso a CSP **não** libera o Nominatim em `connect-src`. Só a frase digitada sai do app; nada é enviado sem o toque em "Buscar".
- **Localização do aparelho:** `Permissions-Policy: geolocation=(self)` (era `()`); `getCurrentPosition` só roda no toque em "Usar minha localização".
- **Dados:** `gym` ganha `kind`, `lat`, `lng`, `address`, `deleted_at`; `gym_weekday(user_id, gym_id, weekday)` com PK `(user_id, weekday)` (um lugar por dia) espelha `profile.dayGym`, que continua sendo o que o planejador lê; a API mantém os dois iguais. `media` ganha `deleted_at`: apagar um lugar leva o lugar e a mídia para a lixeira por 30 dias; o cron horário apaga do R2 e do banco depois disso.
- **Mídia de aparelho** exige `equipmentId` válido + `gymId` de lugar vivo da própria conta. `GET /api/media/:id` aceita `Range` (Safari só toca vídeo com 206).
- **Vídeo:** WebCodecs (H.264) → MP4 no próprio aparelho (720p, taxa calculada pelo core para caber em 6 MB; sem áudio); contêiner escrito em `packages/core/src/mp4.ts` (sem dependência). Sem WebCodecs ou falha: sobe como está até 20 MB, com mensagem.

**Alternativas descartadas:** MapLibre (mais pesado), sem mapa (perde o ponto e a sugestão de lugar).
