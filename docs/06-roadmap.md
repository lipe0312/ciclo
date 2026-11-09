# Roadmap: usar logo e evoluir

Cada marco é usável sozinho. As tarefas viram issues no GitHub com o rótulo do marco.

## M0 · Funciona local (✅ feito no primeiro commit)
- Core com 16 testes (semana flexível, compensatório a pedido, foco, dor/prehab, sessão de 2 h, cargas, validador, check-in, classificador de pedidos).
- Worker com API, MCP remoto, auth, cron, D1 e R2 locais.
- PWA com Hoje, Treino (cronômetro e descanso), Comida (microfone), Corpo (mapa de dor), Perfil e Vida.
- Ponte MCP local com anexar mídia.

## M1 · No ar e no celular (1 noite)
- [ ] `wrangler login`, `npm run cf:setup`, `MCP_TOKEN`, `npm run deploy`
- [ ] Cloudflare Access (o seu e-mail) + Bypass de `/mcp`
- [ ] Instalar o PWA no celular; testar um treino completo offline e online
- [ ] Connector no claude.ai; testar "ciclo_estado" pelo app do Claude

## M2 · Fechar as pontas do dia a dia
- [ ] Calorias adaptativas (tendência de peso com EMA → ajuste de ±150 kcal por semana)
- [ ] `/api/history` paginado + gráfico de e1RM por exercício (SVG)
- [ ] Gráfico do peso (tendência) e das medidas no Corpo
- [ ] Push no fim do descanso com a tela bloqueada (Web Push com VAPID) — hoje vibra e apita com a tela acesa
- [ ] Desfazer a última série / editar uma série registrada

## M3 · Claude no piloto
- [ ] Rotina na nuvem: `/processar-caixa` a cada 3 h e `/revisao` no domingo
- [ ] `scripts/processar-caixa.sh` com `launchd` (plano B)
- [ ] Ajuste de volume pelo feedback (pump/dor → ±1–2 séries por músculo por semana)
- [ ] Deload automático (fim de bloco, ≥ 3 estagnações ou 2 semanas de "segurar")

## M4 · Mídia e técnica
- [ ] Compressão de vídeo no navegador (WebCodecs → 720p) antes do upload
- [ ] Miniatura do vídeo nos cards e nas trocas ("você já tem vídeo deste")
- [ ] `/tecnica`: vídeo de uma série → comentário (Opus, sob demanda)

## M5 · Vida
- [ ] Sono e energia: gráfico a partir do check-in
- [ ] Agenda: encaixar o treino com o connector do Google Calendar
- [ ] Hábitos (água, passos)
- [ ] Finanças (módulo separado, mesmo connector)

## Débito técnico consciente
- O front é JS puro num arquivo só (~1.000 linhas). Quando passar de ~1.500 linhas ou ganhar mais de 2 telas novas, migrar para Vite + Preact (mantendo o core).
- O MCP é um JSON-RPC mínimo, sem SSE nem sessões. Se um cliente exigir, trocar pelo SDK oficial com `McpAgent`.
