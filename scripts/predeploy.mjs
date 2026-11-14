// Confere, sem rede, o que costuma quebrar o 1º deploy: database_id ainda de exemplo, variável de dev indo para produção,
// URLs de preview abertas, migration com transação (o D1 remoto recusa) e o build do front ausente.
// `npm run deploy` roda isto antes de tudo; `node scripts/predeploy.mjs` também funciona sozinho.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const stripJsonc = (s) => s.replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m, str) => str ?? "").replace(/,(\s*[}\]])/g, "$1");
export const readWrangler = (text = readFileSync(`${ROOT}apps/worker/wrangler.jsonc`, "utf8")) => JSON.parse(stripJsonc(text));
const MIG_RE = /^(\d{4})_[a-z0-9_]+\.sql$/;

/** Problemas que valem para qualquer checkout (testados no `npm test`). */
export function staticProblems(cfg, migrations) {
  const p = [];
  const vars = cfg.vars ?? {};
  for (const k of ["DEV_NO_AUTH", "MCP_TOKEN", "VAPID_PRIVATE_KEY", "ACCESS_AUD", "ALLOWED_EMAILS", "OWNER_SETUP_CODE", "AUTH_PEPPER"]) if (k in vars) p.push(`wrangler.jsonc: "${k}" não pode estar em vars (dev ou segredo; use wrangler secret put)`);
  if (cfg.workers_dev !== true) p.push("wrangler.jsonc: workers_dev precisa ser true (o app mora em *.workers.dev)");
  if (cfg.preview_urls !== false) p.push("wrangler.jsonc: preview_urls precisa ser false (URL de preview ficaria fora do Access)");
  const first = cfg.assets?.run_worker_first ?? [];
  for (const r of ["/api/*", "/auth/*", "/mcp", "/mcp/*"]) if (!first.includes(r)) p.push(`wrangler.jsonc: assets.run_worker_first sem "${r}"`);
  const db = (cfg.d1_databases ?? []).find((d) => d.binding === "DB");
  if (!db || db.database_name !== "ciclo-db" || db.migrations_dir !== "migrations") p.push("wrangler.jsonc: binding DB (ciclo-db, migrations) ausente");
  if (!(cfg.r2_buckets ?? []).some((b) => b.binding === "MEDIA")) p.push("wrangler.jsonc: binding MEDIA (R2) ausente");
  const seen = new Set();
  for (const { name, sql } of migrations) {
    const m = MIG_RE.exec(name);
    if (!m) { p.push(`migration ${name}: nome fora do padrão NNNN_slug.sql`); continue; }
    if (seen.has(m[1])) p.push(`migration ${name}: número ${m[1]} repetido`);
    seen.add(m[1]);
    const code = sql.replace(/--[^\n]*/g, "");
    if (/\b(BEGIN\s+(TRANSACTION|IMMEDIATE|EXCLUSIVE|DEFERRED)|BEGIN\s*;|COMMIT|ROLLBACK|SAVEPOINT)\b/i.test(code)) p.push(`migration ${name}: transação explícita (o D1 remoto recusa; ele já aplica cada arquivo numa transação)`);
  }
  return p;
}

export const readMigrations = () => readdirSync(`${ROOT}apps/worker/migrations`).filter((f) => f.endsWith(".sql")).sort()
  .map((name) => ({ name, sql: readFileSync(`${ROOT}apps/worker/migrations/${name}`, "utf8") }));

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const cfg = readWrangler();
  const p = staticProblems(cfg, readMigrations());
  const db = (cfg.d1_databases ?? []).find((d) => d.binding === "DB");
  const soEstatico = process.argv.includes("--static"); // deploy:dry: confere tudo menos o database_id (que só existe depois do cf:setup)
  if (!soEstatico && (!db || /^0{8}-/.test(db.database_id ?? ""))) p.push("database_id ainda é o de exemplo: rode `npx wrangler login` e `npm run cf:setup`");
  if (process.argv.includes("--with-build") && !existsSync(`${ROOT}apps/web/dist/index.html`)) p.push("apps/web/dist ausente: rode `npm run build`");
  if (p.length) { console.error("✖ Antes do deploy:\n  - " + p.join("\n  - ")); process.exit(1); }
  console.log(`✔ pré-deploy ok (D1 ${(db?.database_id ?? "?").slice(0, 8)}…, ${readMigrations().length} migrations). Secrets esperados: OWNER_SETUP_CODE (1º acesso; apague depois), ACCESS_* + ALLOWED_EMAILS só na transição (e VAPID_* opcional) → \`npx wrangler secret list --cwd apps/worker\``);
}
