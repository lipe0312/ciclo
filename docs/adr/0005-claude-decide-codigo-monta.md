# ADR-0005 · O Claude decide, o código monta
**Status:** aceito

**Decisão:**
1. O Claude devolve itens compactos (`{id, sets, reps?}`).
2. `hydrate()` monta nome, imagem, descanso e alternativas.
3. `validateItems()` recusa erro (aparelho, ID inexistente, séries) e avisa riscos (dor, tempo, prioridade sem série).

Trocas, cortes e compensatório são calculados localmente.

**Por quê:**
- Menos tokens.
- Resultado reproduzível.
- O Claude não alucina exercício ou aparelho.
