#!/usr/bin/env bash
# Vigia local do Ciclo ("online agora"): a cada ~30 s pergunta ao connector se há pedido na caixa (isso também avisa o app
# que o vigia está vivo) e, só quando há, roda `claude -p /processar-caixa` com o modelo de cada pedido. Sem API: usa a
# sua assinatura do Claude Code. Para parar: Ctrl+C.
# Uso: CICLO_URL=https://ciclo.<conta>.workers.dev CICLO_TOKEN=... .claude/skills/processar-caixa/vigia.sh
set -euo pipefail
cd "$(dirname "$0")/../../.."
: "${CICLO_URL:?defina CICLO_URL}" "${CICLO_TOKEN:?defina CICLO_TOKEN}"
INTERVALO="${CICLO_VIGIA_S:-30}"
mkdir -p logs
pendentes() {
  curl -fsS --max-time 15 -X POST "$CICLO_URL/mcp" -H "Authorization: Bearer $CICLO_TOKEN" -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"ciclo_chat_pendentes","arguments":{"origem":"vigia"}}}' \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const r=JSON.parse(JSON.parse(s).result.content[0].text);console.log(Object.entries(r.porModelo).filter(([,n])=>n>0).map(([t])=>t).join(" "))}catch{console.log("")}})'
}
echo "vigia ligado (a cada ${INTERVALO}s)"
while true; do
  for t in $(pendentes || true); do
    case "$t" in haiku|sonnet|opus) ;; *) continue ;; esac
    echo "$(date +%T) → $t"
    claude -p "/processar-caixa tier=$t origem=vigia" --model "$t" --allowedTools "mcp__ciclo__*" >> "logs/caixa-$(date +%F).md" 2>&1 || true
  done
  sleep "$INTERVALO"
done
