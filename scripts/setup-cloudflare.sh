#!/usr/bin/env bash
# Cria D1 + R2 na sua conta Cloudflare (grátis) e grava o database_id no wrangler.jsonc. Pode rodar de novo sem estragar nada.
# Pré: `npx wrangler login`. Depois: secrets do Access e `npm run deploy` (docs/05-deploy-gratis.md).
set -euo pipefail
cd "$(dirname "$0")/../apps/worker"
if npx wrangler whoami </dev/null 2>&1 | grep -qi "not authenticated\|not logged in"; then
  echo "✖ Wrangler sem login. Rode antes: npx wrangler login"; exit 1
fi
# </dev/null: sem perguntas interativas (o wrangler novo oferece editar o config; aqui gravamos só o database_id)
OUT=$(npx wrangler d1 create ciclo-db </dev/null 2>&1 || true)
ID=$(echo "$OUT" | grep -Eo '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1 || true)
if [ -z "$ID" ]; then # já existia: pega o id pela lista
  ID=$(npx wrangler d1 list --json </dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const d=JSON.parse(s.slice(s.indexOf("["))).find(x=>x.name==="ciclo-db");console.log(d?d.uuid:"")})')
fi
[ -n "$ID" ] || { echo "✖ Não consegui obter o database_id. Saída do wrangler:"; echo "$OUT"; exit 1; }
sed -i.bak -E "s/\"database_id\": \"[0-9a-f-]+\"/\"database_id\": \"$ID\"/" wrangler.jsonc && rm wrangler.jsonc.bak
grep -q "\"database_id\": \"$ID\"" wrangler.jsonc || { echo "✖ Não consegui gravar o database_id no wrangler.jsonc"; exit 1; }
if ! R2=$(npx wrangler r2 bucket create ciclo-media </dev/null 2>&1); then
  if echo "$R2" | grep -qi "already exists\|already own"; then echo "ℹ R2 ciclo-media já existia";
  else echo "✖ R2 falhou (ative o R2 no painel: R2 Object Storage → Ativar; o plano grátis pode pedir um cartão, sem cobrança até 10 GB):"; echo "$R2"; exit 1; fi
fi
echo "✔ D1 ciclo-db ($ID) e R2 ciclo-media prontos."
echo "  Próximo: npm run deploy   (depois Access + secrets: docs/05-deploy-gratis.md, passo 4)"
