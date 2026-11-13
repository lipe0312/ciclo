#!/usr/bin/env bash
# Vigia local do Ciclo ("online agora"): a cada ~30 s pergunta ao connector se há pedido na caixa (isso também avisa o app
# que o vigia está vivo) e, só quando há, roda `claude -p /processar-caixa` com o modelo de cada pedido. Sem API: usa a
# sua assinatura do Claude Code. Para parar: Ctrl+C.
# Segurança: o token nunca vai na linha de comando (some do `ps`); o claude roda só com o MCP do ciclo (--strict-mcp-config),
# só as ferramentas listadas no SKILL.md e sem Bash/Edit/Write/WebFetch.
# Uso: CICLO_URL=https://ciclo.<conta>.workers.dev CICLO_TOKEN=... .claude/skills/processar-caixa/vigia.sh
set -euo pipefail
cd "$(dirname "$0")/../../.."
: "${CICLO_URL:?defina CICLO_URL}" "${CICLO_TOKEN:?defina CICLO_TOKEN}"
INTERVALO="${CICLO_VIGIA_S:-30}"
SKILL=".claude/skills/processar-caixa/SKILL.md"
ALLOWED=$(sed -n 's/^allowed-tools: //p' "$SKILL" | tr -d ' ')
[ -n "$ALLOWED" ] || { echo "allowed-tools vazio em $SKILL" >&2; exit 1; }
mkdir -p logs
umask 077
MCP_CFG=$(mktemp "${TMPDIR:-/tmp}/ciclo-mcp.XXXXXX")
trap 'rm -f "$MCP_CFG"' EXIT INT TERM
# config MCP só do ciclo (arquivo 600, apagado na saída); o token vem do ambiente, não de argumento
node -e 'const fs=require("fs");fs.writeFileSync(process.argv[1],JSON.stringify({mcpServers:{ciclo:{type:"http",url:process.env.CICLO_URL.replace(/\/$/,"")+"/mcp",headers:{Authorization:"Bearer "+process.env.CICLO_TOKEN}}}}),{mode:0o600})' "$MCP_CFG"
pendentes() {
  # printf é builtin: o cabeçalho com o token vai por stdin (--config -), não aparece no ps
  printf 'header = "Authorization: Bearer %s"\n' "$CICLO_TOKEN" | curl -fsS --max-time 15 --config - -X POST "$CICLO_URL/mcp" -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"ciclo_chat_pendentes","arguments":{"origem":"vigia"}}}' \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const r=JSON.parse(JSON.parse(s).result.content[0].text);console.log(Object.entries(r.porModelo).filter(([,n])=>n>0).map(([t])=>t).join(" "))}catch{console.log("")}})'
}
echo "vigia ligado (a cada ${INTERVALO}s)"
while true; do
  for t in $(pendentes || true); do
    case "$t" in haiku|sonnet|opus) ;; *) continue ;; esac
    echo "$(date +%T) → $t"
    claude -p "/processar-caixa tier=$t origem=vigia" --model "$t" \
      --strict-mcp-config --mcp-config "$MCP_CFG" \
      --allowedTools "$ALLOWED" --disallowedTools "Bash Edit Write WebFetch" \
      >> "logs/caixa-$(date +%F).md" 2>&1 || true
  done
  sleep "$INTERVALO"
done
