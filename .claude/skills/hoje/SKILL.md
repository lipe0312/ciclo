---
name: hoje
description: Mostra o treino de hoje do Ciclo (semana flexível) em poucas linhas. Use quando o usuário perguntar "o que treino hoje", "só consigo ir hoje", "tenho X minutos".
model: haiku
allowed-tools: mcp__ciclo__ciclo_contexto, mcp__ciclo__ciclo_planejar_dia, mcp__ciclo__ciclo_salvar_treino_do_dia
---
1. `ciclo_contexto` com `pedido: "tempo"` (hoje; `minutos`/`diasRestantes` se o usuário disse). O objetivo, as prioridades e o método vêm primeiro: o treino serve a eles. Pergunte só o que faltar: quantos dias ainda dá (com hoje) e quantos minutos.
2. `ciclo_planejar_dia` com isso. **Não** use modo compensatório sem o usuário pedir; se `sugerirCompensatorio`, apenas ofereça.
3. Responda em até 6 linhas: nome, exercícios `séries×reps`, por quê (1 linha, ligado ao objetivo), quanto a semana fecha. Use os números da fatia; não recalcule.
4. Só salve (`ciclo_salvar_treino_do_dia` com itens compactos `{id, sets}`) se o usuário confirmar uma mudança.
