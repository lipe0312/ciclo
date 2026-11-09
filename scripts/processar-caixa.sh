#!/usr/bin/env bash
# Processa a caixa de pedidos com o modelo de cada pedido (plano B quando não houver rotina na nuvem).
# Uso: CICLO_URL=https://ciclo.<conta>.workers.dev CICLO_TOKEN=... scripts/processar-caixa.sh
set -euo pipefail
cd "$(dirname "$0")/.."
: "${CICLO_URL:?defina CICLO_URL}" "${CICLO_TOKEN:?defina CICLO_TOKEN}"
TIERS=$(curl -fsS -X POST "$CICLO_URL/mcp" -H "Authorization: Bearer $CICLO_TOKEN" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"ciclo_estado","arguments":{}}}' \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(JSON.parse(s).result.content[0].text);console.log([...new Set(r.pedidos_pendentes.map(p=>p.modelo))].join(" "))})')
for t in $TIERS; do
  echo "→ $t"
  claude -p "/processar-caixa tier=$t" --model "$t" --allowedTools "mcp__ciclo__*" >> "logs/caixa-$(date +%F).md" 2>&1 || true
done
