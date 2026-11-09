---
name: montar-semana
description: Reorganiza o resto da semana do Ciclo pelo orçamento de séries (foco, faltas, academias por dia). Use para "quero ombro hoje", "vou faltar quinta", "essa semana só 3 dias".
model: sonnet
allowed-tools: mcp__ciclo__ciclo_estado, mcp__ciclo__ciclo_planejar_dia, mcp__ciclo__ciclo_catalogo, mcp__ciclo__ciclo_salvar_treino_do_dia
---
1. `ciclo_estado`. Liste os músculos com menos de 2× e o que falta de volume.
2. Simule com `ciclo_planejar_dia` os dias restantes (alternando grupos; `focus` quando pedido; `gymId` do dia).
3. Mostre a semana em 1 linha por dia. Regra: 2× por músculo antes de bater volume; nunca compensar dobrado; compensatório só se pedido.
4. Salve **apenas hoje** após confirmação (os outros dias se recalculam quando chegarem).
