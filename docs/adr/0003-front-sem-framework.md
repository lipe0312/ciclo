# ADR-0003 · Front sem framework (por enquanto)
**Status:** aceito

**Decisão:** PWA em JS puro (`app.js`), com delegação de eventos e render por tela.

**Por quê:**
- ~80 KB no total e abertura instantânea no 4G.
- Zero build além do core.
- Nenhuma dependência de runtime.

**Revisar quando:** `app.js` passar de ~1.500 linhas ou ganhar mais 2 telas grandes. Aí migrar para Vite + Preact, mantendo o core e os mesmos tokens.
