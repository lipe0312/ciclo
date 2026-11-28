// Confere, sem rede, o que costuma quebrar o 1º deploy: database_id ainda de exemplo, variável de dev indo para produção,
// URLs de preview abertas, migration com transação (o D1 remoto recusa) e o build do front ausente.
// `npm run deploy` roda isto antes de tudo; `node scripts/predeploy.mjs` também funciona sozinho.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const stripJsonc = (s) => s.replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m, str) => str ?? "").replace(/,(\s*[}\]])/g, "$1");
export const WRANGLER_PADRAO = `${ROOT}apps/worker/wrangler.jsonc`;
/** #164 Cópia que o CI grava com o database_id real (variable D1_DATABASE_ID do environment). Fica ao lado do wrangler.jsonc para os
 *  caminhos relativos (main, assets, migrations) continuarem valendo; só existe no runner (o comando recusa fora do CI) e nunca vai para o git. */
export const WRANGLER_DEPLOY = `${ROOT}apps/worker/wrangler.deploy.jsonc`;
export const readWrangler = (text = readFileSync(WRANGLER_PADRAO, "utf8")) => JSON.parse(stripJsonc(text));
const MIG_RE = /^(\d{4})_[a-z0-9_]+\.sql$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PLACEHOLDER_RE = /^0{8}-/;

/** Problemas que valem para qualquer checkout (testados no `npm test`). */
export function staticProblems(cfg, migrations) {
  const p = [];
  const vars = cfg.vars ?? {};
  for (const k of ["DEV_NO_AUTH", "CENARIO_NOME", "CENARIO_CTRL", "MCP_TOKEN", "VAPID_PRIVATE_KEY", "OWNER_EMAIL", "OWNER_SETUP_CODE", "AUTH_PEPPER", "DEV_TUNNEL", "TURNSTILE_SECRET"]) if (k in vars) p.push(`wrangler.jsonc: "${k}" não pode estar em vars (dev ou segredo; use wrangler secret put)`);
  try { const o = new URL(vars.PUBLIC_ORIGIN ?? ""); if (o.protocol !== "https:" || o.pathname !== "/" || o.hostname === "localhost") throw 0; } catch { p.push('wrangler.jsonc: vars.PUBLIC_ORIGIN precisa ser a origem https de produção (ex.: "https://ciclo.<conta>.workers.dev"); é a origem do passkey'); }
  if (cfg.workers_dev !== true) p.push("wrangler.jsonc: workers_dev precisa ser true (o app mora em *.workers.dev)");
  if (cfg.preview_urls !== false) p.push("wrangler.jsonc: preview_urls precisa ser false (URL de preview ficaria fora da origem do passkey)");
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
  for (const k of ["DEV_NO_AUTH", "DEV_TUNNEL", "MCP_TOKEN", "VAPID_PRIVATE_KEY", "OWNER_EMAIL", "OWNER_SETUP_CODE", "AUTH_PEPPER", "TURNSTILE_SECRET", "PUBLIC_ORIGIN"]) if (k in (st.vars ?? {})) p.push(`env.staging: "${k}" não pode estar em vars`);
  // #164: staging e produção dividem a cota grátis; no staging, no máximo 1 disparo por hora (minuto fixo, ex.: "0 * * * *")
  for (const c of st.triggers?.crons ?? []) if (!/^\d{1,2}$/.test(String(c).trim().split(/\s+/)[0] ?? "")) p.push(`env.staging: cron "${c}" dispara mais de 1 vez por hora (use "0 * * * *" ou desligue)`);
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

/** #164 Config do deploy pelo CI: o wrangler.jsonc do git (placeholder) com o database_id real do ambiente (`staging` grava em
 *  env.staging, `production` no topo). O outro ambiente continua com o placeholder. Recusa id inválido ou de exemplo. */
export function configComDbId(cfg, id, alvo) {
  if (!["staging", "production"].includes(alvo)) throw new Error("ambiente do deploy: staging | production");
  const v = String(id ?? "").trim().toLowerCase();
  if (!UUID_RE.test(v) || PLACEHOLDER_RE.test(v)) throw new Error("D1_DATABASE_ID ausente ou inválido (variable do environment no GitHub; veja a issue H-02)");
  const novo = structuredClone(cfg);
  const dono = alvo === "staging" ? novo.env?.staging : novo;
  const db = (dono?.d1_databases ?? []).find((d) => d.binding === "DB");
  if (!db) throw new Error(`binding DB ausente em ${alvo === "staging" ? "env.staging" : "topo"} do wrangler.jsonc`);
  db.database_id = v;
  return novo;
}

/** #164 URL pública do ambiente, sem variável nova: a produção é o PUBLIC_ORIGIN; o staging mora no mesmo subdomínio workers.dev
 *  da conta, com o nome do Worker de staging (ciclo-staging.<conta>.workers.dev). */
export function urlDoAmbiente(cfg, alvo) {
  let o;
  try { o = new URL(cfg.vars?.PUBLIC_ORIGIN ?? ""); } catch { throw new Error("vars.PUBLIC_ORIGIN ausente ou inválido"); }
  if (alvo === "production") return o.origin;
  if (alvo !== "staging") throw new Error("ambiente: staging | production");
  const [primeiro, ...resto] = o.hostname.split(".");
  const st = cfg.env?.staging?.name;
  if (!st || primeiro !== cfg.name || resto.slice(-2).join(".") !== "workers.dev") throw new Error("não dá para deduzir a URL do staging do PUBLIC_ORIGIN (esperado https://<nome>.<conta>.workers.dev)");
  return `https://${st}.${resto.join(".")}`;
}

/** #164 N8: produção só sai pelo GitHub Actions. `npm run deploy` local só com CICLO_DEPLOY_LOCAL=1 (emergência). null = pode. */
export function guardaDeployLocal(env = process.env) {
  if (env.CICLO_DEPLOY_LOCAL === "1") return null;
  return "Deploy local desligado: a produção sai pelo GitHub Actions (Actions → deploy → Run workflow, com a sua aprovação no environment production). "
    + "Passo a passo em docs/11-testar-antes-de-subir.md. Só em emergência: CICLO_DEPLOY_LOCAL=1 npm run deploy";
}

/** Valor de `--flag <valor>` nos argumentos (ou null). */
const argDe = (argv, flag) => { const i = argv.indexOf(flag); if (i < 0) return null; const v = argv[i + 1]; if (!v || v.startsWith("--")) throw new Error(`${flag} pede um valor`); return v; };

export const readMigrations = () => readdirSync(`${ROOT}apps/worker/migrations`).filter((f) => f.endsWith(".sql")).sort()
  .map((name) => ({ name, sql: readFileSync(`${ROOT}apps/worker/migrations/${name}`, "utf8") }));

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const argv = process.argv.slice(2);
  const sair = (msg) => { console.error(`✖ ${msg}`); process.exit(1); };
  if (argv.includes("--guarda-local")) { // #164: 1º passo do `npm run deploy` (antes do gate, que demora)
    const m = guardaDeployLocal();
    if (m) sair(m);
    console.warn("⚠ CICLO_DEPLOY_LOCAL=1: deploy local de emergência. Depois, rode o deploy pelo Actions para a versão no ar voltar a ser um commit conferido.");
    process.exit(0);
  }
  let alvoArg, cfgArg;
  try { alvoArg = argDe(argv, "--gerar-config") ?? argDe(argv, "--url"); cfgArg = argDe(argv, "--config"); } catch (e) { sair(e.message); }
  if (argv.includes("--url")) { // #164: URL pública do ambiente (o CI passa para o smoke)
    try { console.log(urlDoAmbiente(readWrangler(), alvoArg)); } catch (e) { sair(e.message); }
    process.exit(0);
  }
  if (argv.includes("--gerar-config")) { // #164: só no CI, com a variable D1_DATABASE_ID do environment; o id nunca é impresso
    if (process.env.CI !== "true") sair("--gerar-config só roda no CI (GitHub Actions): o database_id real nunca fica num arquivo da sua máquina");
    try { writeFileSync(WRANGLER_DEPLOY, JSON.stringify(configComDbId(readWrangler(), process.env.D1_DATABASE_ID, alvoArg), null, 2) + "\n", { mode: 0o600 }); }
    catch (e) { sair(e.message); }
    console.log(`✔ config do deploy (${alvoArg}) gravada em apps/worker/wrangler.deploy.jsonc (fora do git)`);
    process.exit(0);
  }
  // #164: --config <arquivo> confere a config passada (a do CI, com o database_id injetado) em vez do wrangler.jsonc do git
  const cfgPath = cfgArg ? resolve(cfgArg) : WRANGLER_PADRAO;
  let cfg;
  try { cfg = readWrangler(readFileSync(cfgPath, "utf8")); } catch { sair(`não consegui ler a config ${cfgArg ?? "apps/worker/wrangler.jsonc"}`); }
  const idCurto = (id) => (process.env.CI ? "id injetado" : `${String(id ?? "?").slice(0, 8)}…`); // log do CI é público: nem o começo do id
  if (argv.includes("--staging")) { // #58: `npm run staging` — confere só o staging (o database_id de produção pode nem existir)
    const q = [...staticProblems(cfg, readMigrations()), ...stagingProblems(cfg)];
    const sdb = (cfg.env?.staging?.d1_databases ?? []).find((d) => d.binding === "DB");
    if (PLACEHOLDER_RE.test(sdb?.database_id ?? "0")) q.push("env.staging: database_id ainda é o de exemplo (no CI vem da variable D1_DATABASE_ID do environment staging; local, o `npm run staging` grava depois de criar o D1)");
    if (argv.includes("--with-build") && !existsSync(`${ROOT}apps/web/dist/index.html`)) q.push("apps/web/dist ausente: rode `npm run build`");
    if (q.length) { console.error("✖ Antes do staging:\n  - " + q.join("\n  - ")); process.exit(1); }
    console.log(`✔ pré-staging ok (D1 ${idCurto(sdb.database_id)}, ${readMigrations().length} migrations)`);
    process.exit(0);
  }
  const p = [...staticProblems(cfg, readMigrations()), ...stagingProblems(cfg)];
  const db = (cfg.d1_databases ?? []).find((d) => d.binding === "DB");
  const soEstatico = argv.includes("--static"); // deploy:dry: confere tudo menos o database_id (que só existe depois do cf:setup)
  if (!soEstatico && (!db || PLACEHOLDER_RE.test(db.database_id ?? ""))) p.push("database_id ainda é o de exemplo (no CI vem da variable D1_DATABASE_ID do environment production; local: `npx wrangler login` e `npm run cf:setup`)");
  if (!soEstatico) {
    let names = null;
    try { names = JSON.parse(execFileSync("npx", ["wrangler", "secret", "list", "--format", "json", "--config", cfgPath], { cwd: `${ROOT}apps/worker`, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })).map((s) => s.name); }
    catch { console.warn("⚠ não deu para listar os secrets (wrangler login? token sem Workers Scripts?): confira AUTH_PEPPER e as duas chaves do Turnstile à mão"); }
    if (names) p.push(...secretProblems(names, cfg.vars ?? {}));
  }
  if (argv.includes("--with-build") && !existsSync(`${ROOT}apps/web/dist/index.html`)) p.push("apps/web/dist ausente: rode `npm run build`");
  if (p.length) { console.error("✖ Antes do deploy:\n  - " + p.join("\n  - ")); process.exit(1); }
  console.log(`✔ pré-deploy ok (D1 ${idCurto(db?.database_id)}, ${readMigrations().length} migrations). Secrets esperados: AUTH_PEPPER (obrigatório), OWNER_SETUP_CODE (1º acesso; apague depois), OWNER_EMAIL (e-mail do dono, exigido no 1º acesso; nunca no git) (e VAPID_* opcional) → \`npx wrangler secret list --cwd apps/worker\``);
}
