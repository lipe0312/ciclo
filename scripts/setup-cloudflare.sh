#!/usr/bin/env bash
# Cria D1 + R2 na sua conta Cloudflare (grátis) e grava o database_id no wrangler.jsonc.
set -euo pipefail
cd "$(dirname "$0")/../apps/worker"
npx wrangler whoami >/dev/null || { echo "Rode antes: npx wrangler login"; exit 1; }
OUT=$(npx wrangler d1 create ciclo-db 2>&1 || true)
ID=$(echo "$OUT" | grep -Eo '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1)
if [ -z "$ID" ]; then ID=$(npx wrangler d1 list --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const d=JSON.parse(s).find(x=>x.name==="ciclo-db");console.log(d?d.uuid:"")})'); fi
[ -n "$ID" ] || { echo "Não consegui obter o database_id"; exit 1; }
sed -i.bak -E "s/\"database_id\": \"[0-9a-f-]+\"/\"database_id\": \"$ID\"/" wrangler.jsonc && rm wrangler.jsonc.bak
npx wrangler r2 bucket create ciclo-media || true
echo "✔ D1 $ID e R2 ciclo-media prontos. Próximo: openssl rand -hex 32 | npx wrangler secret put MCP_TOKEN && npm run deploy"
