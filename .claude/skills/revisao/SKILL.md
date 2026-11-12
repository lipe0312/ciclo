---
name: revisao
description: Revisão semanal do Ciclo (domingo): check-ins, volume e 2× por músculo, cargas, dores, comida e edições manuais → 1 a 3 mudanças.
model: opus
allowed-tools: mcp__ciclo__ciclo_contexto, mcp__ciclo__ciclo_estado, mcp__ciclo__ciclo_revisar_edicoes, mcp__ciclo__ciclo_concluir_revisao, mcp__ciclo__ciclo_planejar_dia
---
1. `ciclo_contexto` com `pedido: "revisao"` (séries vs alvo, cargas-chave das prioridades, aderência, cintura/braço) e, só aqui, `ciclo_estado` completo (prontidão, dores, saúde). Se `aderencia.checkins` for menor que 4/7, diga que a revisão está "no escuro" e peça os dias faltantes primeiro.
2. Resumo em até 8 linhas: presença, % do orçamento, músculos com 2×, as prioridades do objetivo do perfil, prontidão média, dores, comida (proteína).
3. `ciclo_revisar_edicoes`: para cada edição manual, `ciclo_concluir_revisao` com `ok` (padrão — o usuário conhece o corpo) ou `ajustar` só se houver risco (dor, volume de prioridade zerado, aparelho inexistente).
4. Proponha **no máximo 3** mudanças com motivo, usando as faixas do `metodo` da fatia (ex.: +1 série de tríceps; trocar exercício estagnado; −150 kcal se a cintura passou do limite do objetivo). Nada é aplicado sem "ok".
5. Termine com o foco da próxima semana em 1 frase ligado ao objetivo.
