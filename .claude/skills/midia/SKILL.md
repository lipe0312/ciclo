---
name: midia
description: Liga fotos/vídeos do aparelho da academia aos exercícios do Ciclo a partir de arquivos do Mac. Use na montagem do treino ou quando o usuário disser "anexa esse vídeo".
model: haiku
allowed-tools: mcp__ciclo__ciclo_planejar_dia, mcp__ciclo__ciclo_catalogo, mcp__ciclo__ciclo_anexar_midia
---
1. Descubra o exercício (ID via `ciclo_catalogo` se precisar).
2. Descubra o lugar e o aparelho: `gymId` = campo `academia` de `ciclo_planejar_dia` (ou o lugar que o usuário disser); `equipmentId` = um dos `aparelhos` do exercício em `ciclo_catalogo`.
3. `ciclo_anexar_midia` com `path`, `exerciseId`, `equipmentId`, `gymId` e a `note` de regulagem (pino, banco, pegada) em ≤ 1 linha. **Mídia de aparelho exige `gymId`**: sem ele a chamada é recusada. A mídia mora na página do aparelho (Academias › lugar › aparelho).
4. Vídeo > 20 MB: peça para regravar 10–15 s em 720p. Só arquivos de Filmes/Imagens/Downloads/Mesa.
