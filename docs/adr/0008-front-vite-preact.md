# ADR-0008 · Front em Vite + Preact + TypeScript
**Status:** aceito (09/11/2026) · substitui parcialmente o [ADR-0003](0003-front-sem-framework.md) (front sem framework) e a parte "o esbuild gera `core.js`" do [ADR-0002](0002-core-compartilhado.md).

**Contexto:** o `app.js` único (~1.050 linhas) gerava conflito em toda issue e a fase 1 traz várias telas novas em paralelo (issue #22).

**Decisão:**
- `apps/web` vira projeto Vite: `src/main.tsx`, uma pasta por tela em `src/screens/<tela>/`, peças compartilhadas em `src/lib/` (api, fila offline, store, roteador por hash, folha, faixa, mini-barra, voz, grade de aparelhos, mapa de músculos, gráficos, carrossel).
- Preact (~4 KB) é a única dependência nova de runtime. Dev: `vite`, `@preact/preset-vite`.
- O front importa `packages/core` direto (TS); o `core.js` gerado e o check de diff no CI deixam de existir.
- Build em `apps/web/dist`, servido pelo Worker (`assets.directory`). `public/` guarda `_headers`, `sw.js`, manifest e imagens.
- CSP continua estrita: o Vite gera só `<script type="module" src>`, sem script inline. Dado externo nunca vai em `dangerouslySetInnerHTML` (o Preact já escapa texto).

**Consequências:** `npm run dev` builda e observa o front e sobe o Worker; abrir `index.html` por `file://` deixa de funcionar (demo: `?demo` em http). JS ~150 KB (50 KB gzip) incluindo o core.
