// #58 `npm run staging`: ambiente de testes OPCIONAL na sua conta Cloudflare, num comando e idempotente.
// Cria o D1 "ciclo-db-staging" e o R2 "ciclo-media-staging" se faltarem, aplica as migrations, roda o predeploy e faz o deploy
// em env.staging. Nunca toca a produção (ciclo-db, ciclo-media, Worker "ciclo"). `--dry` só mostra o plano, sem rede.
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const WRANGLER = `${ROOT}apps/worker/wrangler.jsonc`;
export const STAGING_DB = "ciclo-db-staging";
export const STAGING_R2 = "ciclo-media-staging";
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;

/** Grava o database_id só na linha do D1 de staging (a de produção nunca é tocada). */
export function setStagingDbId(text, id) {
  if (!UUID.test(id)) throw new Error("database_id inválido");
  const re = new RegExp(`("database_name": "${STAGING_DB}", "database_id": ")[0-9a-f-]+(")`);
  if (!re.test(text)) throw new Error(`linha do D1 ${STAGING_DB} não encontrada no wrangler.jsonc`);
  return text.replace(re, `$1${id}$2`);
}
export const parseD1Id = (out) => UUID.exec(out)?.[0] ?? null;
export const jaExiste = (out) => /already exists|already own/i.test(out);

/** Plano em ordem; cada passo é [descrição, comando, args, opções]. */
export function plano() {
  const w = (...a) => ["npx", ["wrangler", ...a]];
  return [
    ["login do wrangler", ...w("whoami")],
    ["D1 (cria se faltar, grava o id)", "node", ["scripts/staging.mjs", "--so-d1"]],
    ["R2 (cria se faltar)", ...w("r2", "bucket", "create", STAGING_R2)],
    ["build do front", "npm", ["run", "build"]],
    ["migrations no D1 de staging", ...w("d1", "migrations", "apply", STAGING_DB, "--remote", "--env", "staging", "--config", "apps/worker/wrangler.jsonc")],
    ["predeploy do staging", "node", ["scripts/predeploy.mjs", "--staging", "--with-build"]],
    ["deploy em env.staging", ...w("deploy", "--env", "staging", "--config", "apps/worker/wrangler.jsonc")],
  ];
}

const sh = (cmd, args) => spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const say = (s) => console.log(s);

function garantirD1() {
  const r = sh("npx", ["wrangler", "d1", "create", STAGING_DB]);
  let id = parseD1Id((r.stdout ?? "") + (r.stderr ?? ""));
  if (!id) { // já existia: pega o id pela lista
    const l = sh("npx", ["wrangler", "d1", "list", "--json"]);
    const out = l.stdout ?? "";
    try { id = JSON.parse(out.slice(out.indexOf("["))).find((d) => d.name === STAGING_DB)?.uuid ?? null; } catch { id = null; }
  }
  if (!id) { console.error(`✖ Não consegui obter o database_id de ${STAGING_DB}:\n${r.stdout}${r.stderr}`); process.exit(1); }
  const antes = readFileSync(WRANGLER, "utf8");
  const depois = setStagingDbId(antes, id);
  if (depois !== antes) writeFileSync(WRANGLER, depois);
  say(`✔ D1 ${STAGING_DB} (${id.slice(0, 8)}…)`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.includes("--so-d1")) { garantirD1(); process.exit(0); }
  if (process.argv.includes("--dry")) {
    say("Plano do `npm run staging` (nada é executado):");
    plano().forEach(([d, c, a], i) => say(`  ${i + 1}. ${d}: ${c} ${a.join(" ")}`));
    process.exit(0);
  }
  for (const [desc, cmd, args] of plano()) {
    say(`→ ${desc}`);
    if (cmd === "node" && args.includes("--so-d1")) { garantirD1(); continue; }
    const r = spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    const out = (r.stdout ?? "") + (r.stderr ?? "");
    if (r.status === 0) { if (desc.startsWith("deploy") || desc.startsWith("migrations")) process.stdout.write(out); continue; }
    if (desc.startsWith("R2") && jaExiste(out)) { say(`ℹ R2 ${STAGING_R2} já existia`); continue; }
    if (desc.startsWith("login")) console.error("✖ Wrangler sem login. Rode antes: npx wrangler login");
    else if (desc.startsWith("R2")) console.error("✖ R2 falhou (ative em R2 Object Storage no painel):\n" + out);
    else console.error(`✖ Falhou em "${desc}":\n${out}`);
    process.exit(1);
  }
  say("\n✔ Staging no ar (faixa AMBIENTE DE TESTES). A URL https://ciclo-staging.<sua-conta>.workers.dev apareceu no deploy acima.");
  say("  OBRIGATÓRIO (sem eles o /auth/* do staging responde 503, falha fechada):");
  say("    npx wrangler secret put AUTH_PEPPER --env staging --config apps/worker/wrangler.jsonc        (texto aleatório longo)");
  say("    npx wrangler secret put OWNER_SETUP_CODE --env staging --config apps/worker/wrangler.jsonc   (≥ 16 caracteres, uso único)");
}
