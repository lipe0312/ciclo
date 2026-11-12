---
name: dor
description: Registra e trata dor/desconforto no treino (ex.: escápula esquerda, ombro, lombar) no app Ciclo — ajusta o treino e propõe fortalecimento.
model: opus
allowed-tools: mcp__ciclo__ciclo_contexto, mcp__ciclo__ciclo_registrar_dor, mcp__ciclo__ciclo_planejar_dia, mcp__ciclo__ciclo_salvar_treino_do_dia
---
1. Pergunte só o essencial: região e lado, intensidade (leve/média/forte), tipo (articular, muscular, pontada, formigamento), em qual exercício.
2. **Sinais de alerta** (formigamento, perda de força, dor noturna, trauma, piora há > 1–2 semanas): recomende médico/fisioterapeuta antes de qualquer ajuste e registre intensidade 3.
3. `ciclo_registrar_dor`. Depois `ciclo_contexto` com `pedido: "dor"` (e `exercicioId` do exercício): traz o dia, o que a dor bloqueia (`bloqueadosPorDor`) e 3 alternativas já filtradas. Use `ciclo_planejar_dia` para mostrar o aquecimento de fortalecimento que entrou.
4. Explique em ≤ 5 linhas: por que esses exercícios saem, o que fortalecer (2 exercícios, 2×12–15 leve), quando reavaliar (1 semana). Trocas só com IDs das `alternativas`, em `{id, sets}`, protegendo as prioridades do objetivo.
5. Você não diagnostica. Nada de "é tendinite".
