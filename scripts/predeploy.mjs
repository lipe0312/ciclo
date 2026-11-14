// Confere, sem rede, o que costuma quebrar o 1º deploy: database_id ainda de exemplo, variável de dev indo para produção,
// URLs de preview abertas, migration com transação (o D1 remoto recusa) e o build do front ausente.
// `npm run deploy` roda isto antes de tudo; `node scripts/predeploy.mjs` também funciona sozinho.
import { execFileSync } from "node:child_process";
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
  for (const k of ["DEV_NO_AUTH", "MCP_TOKEN", "VAPID_PRIVATE_KEY", "ACCESS_AUD", "ALLOWED_EMAILS", "OWNER_SETUP_CODE", "AUTH_PEPPER", "DEV_TUNNEL", "TURNSTILE_SECRET"]) if (k in vars) p.push(`wrangler.jsonc: "${k}" não pode estar em vars (dev ou segredo; use wrangler secret put)`);
  try { const o = new URL(vars.PUBLIC_ORIGIN ?? ""); if (o.protocol !== "https:" || o.pathname !== "/" || o.hostname === "localhost") throw 0; } catch { p.push('wrangler.jsonc: vars.PUBLIC_ORIGIN precisa ser a origem https de produção (ex.: "https://ciclo.<conta>.workers.dev"); é a origem do passkey'); }
  if (cfg.workers_dev !== true) p.push("wrangler.jsonc: workers_dev precisa ser true (o app mora em *.workers.dev)");
  if (cfg.preview_urls !== false) p.push("wrangler.jsonc: preview_urls precisa ser false (URL de preview ficaria fora do Access)");
  const first = cfg.assets?.run_worker_first ?? [];
  for (const r of ["/api/*", "/auth/*", "/mcp", "/mcp/*", "/oauth/*", "/.well-known/*"]) if (!first.includes(r)) p.push(`wrangler.jsonc: assets.run_worker_first sem "${r}"`);
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

/** #58: o env.staging nunca pode tocar a produção (Worker, D1, R2) nem levar variável de dev/segredo. `cfg` = wrangler.jsonc inteiro. */
export function stagingProblems(cfg) {
  const p = [];
  const st = cfg.env?.staging;
  if (!st) return ["wrangler.jsonc: env.staging ausente"];
  const dbOf = (c) => (c.d1_databases ?? []).find((d) => d.binding === "DB");
  const r2Of = (c) => (c.r2_buckets ?? []).find((b) => b.binding === "MEDIA");
  const prod = { db: dbOf(cfg), r2: r2Of(cfg) }, sdb = dbOf(st), sr2 = r2Of(st);
  if (!st.name || st.name === cfg.name) p.push("env.staging: name igual ao da produção");
  if (!sdb) p.push("env.staging: binding DB ausente (bindings não são herdados)");
  else {
    if (!/-staging$/.test(sdb.database_name ?? "") || sdb.database_name === prod.db?.database_name) p.push("env.staging: D1 precisa ser próprio (*-staging), nunca o da produção");
    if (sdb.database_id === prod.db?.database_id && !/^0{8}-/.test(sdb.database_id ?? "")) p.push("env.staging: database_id igual ao da produção");
    if (sdb.migrations_dir !== "migrations") p.push("env.staging: migrations_dir precisa ser migrations");
  }
  if (!sr2) p.push("env.staging: binding MEDIA ausente (bindings não são herdados)");
  else if (!/-staging$/.test(sr2.bucket_name ?? "") || sr2.bucket_name === prod.r2?.bucket_name) p.push("env.staging: R2 precisa ser próprio (*-staging), nunca o da produção");
  if (st.vars?.ENVIRONMENT !== "staging") p.push('env.staging: vars.ENVIRONMENT precisa ser "staging" (faixa AMBIENTE DE TESTES)');
  for (const k of ["DEV_NO_AUTH", "DEV_TUNNEL", "MCP_TOKEN", "VAPID_PRIVATE_KEY", "ACCESS_AUD", "ALLOWED_EMAILS", "OWNER_SETUP_CODE", "AUTH_PEPPER", "TURNSTILE_SECRET", "PUBLIC_ORIGIN"]) if (k in (st.vars ?? {})) p.push(`env.staging: "${k}" não pode estar em vars`);
  if (JSON.stringify(st.triggers?.crons ?? []).includes('"* * * * *"')) p.push("env.staging: cron a cada minuto não (use */15 ou desligue)");
  if (st.preview_urls !== false) p.push("env.staging: preview_urls precisa ser false");
  return p;
}

/** #56: secrets de produção (nomes de `wrangler secret list` + vars). AUTH_PEPPER é obrigatório (sem ele o login falha
 *  fechado em produção) e o Turnstile precisa das duas chaves ou de nenhuma. */
export function secretProblems(names, vars = {}) {
  const tem = (k) => names.includes(k) || k in vars;
  const p = [];
  if (!tem("AUTH_PEPPER")) p.push("secret AUTH_PEPPER ausente: sem ele o login falha fechado em produção (`npx wrangler secret put AUTH_PEPPER --cwd apps/worker`)");
  if (tem("TURNSTILE_SITE_KEY") !== tem("TURNSTILE_SECRET")) p.push("Turnstile pela metade: defina TURNSTILE_SITE_KEY e TURNSTILE_SECRET, ou nenhum dos dois");
  return p;
}

export const readMigrations = () => readdirSync(`${ROOT}apps/worker/migrations`).filter((f) => f.endsWith(".sql")).sort()
  .map((name) => ({ name, sql: readFileSync(`${ROOT}apps/worker/migrations/${name}`, "utf8") }));

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const cfg = readWrangler();
  if (process.argv.includes("--staging")) { // #58: `npm run staging` — confere só o staging (o database_id de produção pode nem existir)
    const q = [...staticProblems(cfg, readMigrations()), ...stagingProblems(cfg)];
    const sdb = (cfg.env?.staging?.d1_databases ?? []).find((d) => d.binding === "DB");
    if (/^0{8}-/.test(sdb?.database_id ?? "0")) q.push("env.staging: database_id ainda é o de exemplo (o `npm run staging` grava depois de criar o D1)");
    if (process.argv.includes("--with-build") && !existsSync(`${ROOT}apps/web/dist/index.html`)) q.push("apps/web/dist ausente: rode `npm run build`");
    if (q.length) { console.error("✖ Antes do staging:\n  - " + q.join("\n  - ")); process.exit(1); }
    console.log(`✔ pré-staging ok (D1 ${sdb.database_id.slice(0, 8)}…, ${readMigrations().length} migrations)`);
    process.exit(0);
  }
  const p = [...staticProblems(cfg, readMigrations()), ...stagingProblems(cfg)];
  const db = (cfg.d1_databases ?? []).find((d) => d.binding === "DB");
  const soEstatico = process.argv.includes("--static"); // deploy:dry: confere tudo menos o database_id (que só existe depois do cf:setup)
  if (!soEstatico && (!db || /^0{8}-/.test(db.database_id ?? ""))) p.push("database_id ainda é o de exemplo: rode `npx wrangler login` e `npm run cf:setup`");
  if (!soEstatico) {
    let names = null;
    try { names = JSON.parse(execFileSync("npx", ["wrangler", "secret", "list", "--format", "json"], { cwd: `${ROOT}apps/worker`, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })).map((s) => s.name); }
    catch { console.warn("⚠ não deu para listar os secrets (wrangler login?): confira AUTH_PEPPER e as duas chaves do Turnstile à mão"); }
    if (names) p.push(...secretProblems(names, cfg.vars ?? {}));
  }
  if (process.argv.includes("--with-build") && !existsSync(`${ROOT}apps/web/dist/index.html`)) p.push("apps/web/dist ausente: rode `npm run build`");
  if (p.length) { console.error("✖ Antes do deploy:\n  - " + p.join("\n  - ")); process.exit(1); }
  console.log(`✔ pré-deploy ok (D1 ${(db?.database_id ?? "?").slice(0, 8)}…, ${readMigrations().length} migrations). Secrets esperados: AUTH_PEPPER (obrigatório), OWNER_SETUP_CODE (1º acesso; apague depois), ACCESS_* + ALLOWED_EMAILS só na transição (e VAPID_* opcional) → \`npx wrangler secret list --cwd apps/worker\``);
}
