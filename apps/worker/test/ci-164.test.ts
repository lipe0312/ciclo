// #164 CI completo: smoke do app no ar (fetch falso), config do deploy com o database_id injetado (secret do environment),
// URL de cada ambiente, `npm run deploy` local recusado sem CICLO_DEPLOY_LOCAL=1, APP_VERSION/cron e as regras dos workflows
// (nunca pull_request_target, sem set -x, permissions por job, actions por SHA, segredo só em env:). Tudo fictício, sem rede.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// scripts JS (sem tipos)
import { cabecalhosAccess, lerArgs, smoke } from "../../../scripts/smoke.mjs";
import { configComDbId, guardaDeployLocal, readMigrations, readWrangler, stagingProblems, staticProblems, urlDoAmbiente } from "../../../scripts/predeploy.mjs";

const ROOT = new URL("../../../", import.meta.url);
const SHA = "0123456789abcdef0123456789abcdef01234567";
const ID = "11111111-2222-4333-8444-555555555555"; // fictício
const SEGREDO = "segredo-ficticio-do-access-123";

type Resp = { status: number; json?: unknown; csp?: string };
/** fetch falso: responde por rota e anota as chamadas (para conferir cabeçalhos enviados). */
function fetchFalso(rotas: Record<string, Resp | Resp[]>) {
  const chamadas: { url: string; init: any }[] = [];
  const cont: Record<string, number> = {};
  const f = async (url: string, init: any) => {
    chamadas.push({ url, init });
    const p = new URL(url).pathname;
    const r = rotas[p];
    if (!r) throw new Error("rede");
    const lista = Array.isArray(r) ? r : [r];
    const i = Math.min(cont[p] = (cont[p] ?? -1) + 1, lista.length - 1);
    const x = lista[i];
    return { status: x.status, headers: new Headers(x.csp ? { "content-security-policy": x.csp } : {}), json: async () => { if (x.json === undefined) throw new Error("sem json"); return x.json; } };
  };
  return { f, chamadas };
}
const OK = (over: Partial<Record<string, Resp | Resp[]>> = {}) => ({
  "/api/health": { status: 200, json: { ok: true, version: SHA, ambiente: "staging" } },
  "/": { status: 200, csp: "default-src 'self'" },
  "/mcp": { status: 401, json: { error: "não autorizado" } },
  "/api/state": { status: 401, json: { error: "não autorizado" } },
  ...over,
});
const rodar = (rotas: Record<string, any>, extra: Record<string, unknown> = {}) => {
  const ff = fetchFalso(rotas);
  return smoke({ url: "https://ciclo-staging.exemplo.workers.dev", sha: SHA, ambiente: "staging", fetch: ff.f, env: {}, sleep: async () => {}, tentativas: 3, ...extra }).then((r: any) => ({ ...r, chamadas: ff.chamadas }));
};

test("smoke: tudo certo → ok; health com ambiente e commit, / com CSP, /mcp e /api/state 401", async () => {
  const r = await rodar(OK());
  assert.equal(r.ok, true, r.linhas.join("\n"));
  assert.equal(r.linhas.length, 4);
  assert.match(r.linhas[0], /commit 0123456/);
  const mcp = r.chamadas.find((c: any) => c.url.endsWith("/mcp"));
  assert.equal(mcp.init.method, "POST");
  assert.ok(!("Authorization" in mcp.init.headers), "/mcp vai sem token");
  assert.ok(r.chamadas.every((c: any) => c.init.redirect === "manual"), "redirect manual: o login do Access não vira 200");
});

test("smoke: cada falha reprova (status, ambiente, commit, CSP, 401 que virou 200)", async () => {
  const casos: [string, Record<string, any>, RegExp][] = [
    ["health 500", { "/api/health": { status: 500 } }, /HTTP 500/],
    ["health 401 (Access sem service token)", { "/api/health": { status: 401 } }, /HTTP 401/],
    ["ambiente errado", { "/api/health": { status: 200, json: { ok: true, version: SHA, ambiente: null } } }, /ambiente diferente/],
    ["commit antigo", { "/api/health": { status: 200, json: { ok: true, version: "dev", ambiente: "staging" } } }, /ainda não é o commit 0123456/],
    ["sem CSP", { "/": { status: 200 } }, /sem o cabeçalho Content-Security-Policy/],
    ["/ 302 (login do Access)", { "/": { status: 302 } }, /HTTP 302/],
    ["/mcp aberto", { "/mcp": { status: 200, json: {} } }, /\/mcp sem token: HTTP 200/],
    ["/api/state aberto", { "/api/state": { status: 200, json: {} } }, /\/api\/state sem sessão: HTTP 200/],
  ];
  for (const [nome, over, re] of casos) {
    const r = await rodar(OK(over));
    assert.equal(r.ok, false, nome);
    assert.ok(r.linhas.some((l: string) => l.startsWith("✖") && re.test(l)), `${nome}: ${r.linhas.join(" | ")}`);
  }
  const semRede = await rodar({});
  assert.equal(semRede.ok, false);
  assert.ok(semRede.linhas.every((l: string) => l.startsWith("✖")));
});

test("smoke: health tenta de novo (a borda ainda serve a versão anterior) e passa quando o commit chega", async () => {
  let dormiu = 0;
  const r = await rodar(OK({ "/api/health": [{ status: 200, json: { ok: true, version: "aaaaaaa", ambiente: "staging" } }, { status: 200, json: { ok: true, version: SHA, ambiente: "staging" } }] }), { sleep: async () => { dormiu++; } });
  assert.equal(r.ok, true, r.linhas.join("\n"));
  assert.equal(dormiu, 1);
  assert.equal(r.chamadas.filter((c: any) => c.url.endsWith("/api/health")).length, 2);
  const prod = await rodar(OK({ "/api/health": { status: 200, json: { ok: true, version: SHA, ambiente: null } } }), { ambiente: "producao" });
  assert.equal(prod.ok, true, "produção: ambiente null");
});

test("smoke: nunca imprime cabeçalho nem corpo de resposta", async () => {
  const CORPO = "corpo-secreto-que-nao-pode-aparecer";
  const r = await rodar(OK({
    "/api/health": { status: 200, json: { ok: true, version: CORPO, ambiente: "staging" } },
    "/": { status: 200, csp: "default-src 'self'; report-uri https://x.exemplo/" + CORPO },
    "/mcp": { status: 500, json: { error: CORPO } },
  }), { env: { CF_ACCESS_CLIENT_ID: "id-ficticio.access", CF_ACCESS_CLIENT_SECRET: SEGREDO } });
  const saida = r.linhas.join("\n");
  assert.equal(r.ok, false);
  for (const proibido of [CORPO, SEGREDO, "id-ficticio.access", "report-uri", "CF-Access"]) assert.ok(!saida.includes(proibido), proibido);
});

test("smoke: service token do Access só com as DUAS variáveis; vai em toda chamada", async () => {
  assert.deepEqual(cabecalhosAccess({}), {});
  assert.deepEqual(cabecalhosAccess({ CF_ACCESS_CLIENT_ID: "a" }), {});
  assert.deepEqual(cabecalhosAccess({ CF_ACCESS_CLIENT_ID: "a", CF_ACCESS_CLIENT_SECRET: " " }), {});
  assert.deepEqual(cabecalhosAccess({ CF_ACCESS_CLIENT_ID: "a", CF_ACCESS_CLIENT_SECRET: "b" }), { "CF-Access-Client-Id": "a", "CF-Access-Client-Secret": "b" });
  const com = await rodar(OK(), { env: { CF_ACCESS_CLIENT_ID: "a", CF_ACCESS_CLIENT_SECRET: "b" } });
  assert.ok(com.chamadas.every((c: any) => c.init.headers["CF-Access-Client-Id"] === "a" && c.init.headers["CF-Access-Client-Secret"] === "b"));
  const sem = await rodar(OK());
  assert.ok(sem.chamadas.every((c: any) => !("CF-Access-Client-Id" in c.init.headers)));
});

test("smoke: argumentos (https, sha hex, ambiente conhecido)", () => {
  assert.deepEqual(lerArgs(["https://a.exemplo.workers.dev/", "--sha", SHA, "--ambiente", "staging"]), { url: "https://a.exemplo.workers.dev", sha: SHA, ambiente: "staging" });
  assert.equal(lerArgs(["http://localhost:8791"]).url, "http://localhost:8791");
  for (const ruim of [[], ["http://a.exemplo.com"], ["https://a.exemplo.com", "--sha", "xyz"], ["https://a.exemplo.com", "--ambiente", "prod"], ["https://a", "https://b"], ["https://a", "--sha"]]) {
    assert.throws(() => lerArgs(ruim), String(ruim));
  }
  const r = spawnSync(process.execPath, ["scripts/smoke.mjs"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 2);
});

test("predeploy com a config nova: database_id injetado só no ambiente certo; o git segue com o placeholder", () => {
  const cfg = readWrangler();
  const dbDe = (c: any) => c.d1_databases.find((d: any) => d.binding === "DB").database_id;
  assert.match(dbDe(cfg), /^0{8}-/, "repositório público: placeholder no topo");
  assert.match(dbDe(cfg.env.staging), /^0{8}-/, "repositório público: placeholder no staging");
  const st = configComDbId(cfg, ID, "staging");
  assert.equal(dbDe(st.env.staging), ID);
  assert.match(dbDe(st), /^0{8}-/, "staging não toca o id da produção");
  assert.match(dbDe(cfg.env.staging), /^0{8}-/, "não muta o original");
  assert.deepEqual([...staticProblems(st, readMigrations()), ...stagingProblems(st)], []);
  const pr = configComDbId(cfg, ID, "production");
  assert.equal(dbDe(pr), ID);
  assert.match(dbDe(pr.env.staging), /^0{8}-/);
  assert.deepEqual([...staticProblems(pr, readMigrations()), ...stagingProblems(pr)], []);
  for (const ruim of ["", undefined, "00000000-0000-0000-0000-000000000000", "nao-e-uuid", `${ID}\nx`]) assert.throws(() => configComDbId(cfg, ruim, "staging"), /D1_DATABASE_ID/);
  assert.equal(dbDe(configComDbId(cfg, " ABCDEF12-2222-4333-8444-555555555555 ", "production")), "abcdef12-2222-4333-8444-555555555555", "colado com espaço/maiúscula");
  assert.throws(() => configComDbId(cfg, ID, "preview"), /staging \| production/);
});

test("predeploy --config: lê a config passada (a do CI), sem imprimir o id no CI; --gerar-config recusa fora do CI", () => {
  const dir = mkdtempSync(join(tmpdir(), "ciclo-164-"));
  try {
    const arq = join(dir, "wrangler.deploy.jsonc");
    writeFileSync(arq, JSON.stringify(configComDbId(readWrangler(), ID, "staging")));
    const env = { ...process.env, CI: "true" };
    const ok = spawnSync(process.execPath, ["scripts/predeploy.mjs", "--staging", "--config", arq], { cwd: ROOT, encoding: "utf8", env });
    assert.equal(ok.status, 0, ok.stderr);
    assert.ok(!(ok.stdout + ok.stderr).includes(ID.slice(0, 8)), "o começo do id não aparece no log do CI");
    const git = spawnSync(process.execPath, ["scripts/predeploy.mjs", "--staging"], { cwd: ROOT, encoding: "utf8", env });
    assert.equal(git.status, 1, "o wrangler.jsonc do git (placeholder) não passa no pré-staging");
    assert.match(git.stderr, /D1_DATABASE_ID/);
    const fora = spawnSync(process.execPath, ["scripts/predeploy.mjs", "--gerar-config", "staging"], { cwd: ROOT, encoding: "utf8", env: { ...process.env, CI: "", D1_DATABASE_ID: ID } });
    assert.equal(fora.status, 1);
    assert.match(fora.stderr, /só roda no CI/);
    const semId = spawnSync(process.execPath, ["scripts/predeploy.mjs", "--gerar-config", "staging"], { cwd: ROOT, encoding: "utf8", env: { ...process.env, CI: "true", D1_DATABASE_ID: "" } });
    assert.equal(semId.status, 1);
    assert.match(semId.stderr, /D1_DATABASE_ID ausente/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("URL de cada ambiente sai do PUBLIC_ORIGIN (sem variável nova)", () => {
  const cfg = { name: "ciclo", vars: { PUBLIC_ORIGIN: "https://ciclo.conta-ficticia.workers.dev" }, env: { staging: { name: "ciclo-staging" } } };
  assert.equal(urlDoAmbiente(cfg, "production"), "https://ciclo.conta-ficticia.workers.dev");
  assert.equal(urlDoAmbiente(cfg, "staging"), "https://ciclo-staging.conta-ficticia.workers.dev");
  assert.throws(() => urlDoAmbiente({ ...cfg, vars: { PUBLIC_ORIGIN: "https://app.exemplo.com.br" } }, "staging"), /URL do staging/);
  assert.throws(() => urlDoAmbiente(cfg, "dev"));
  assert.match(urlDoAmbiente(readWrangler(), "staging"), /^https:\/\/ciclo-staging\.[a-z0-9-]+\.workers\.dev$/);
});

test("npm run deploy local recusa sem CICLO_DEPLOY_LOCAL=1 e aponta o Actions (N8)", () => {
  assert.match(guardaDeployLocal({}) ?? "", /GitHub Actions/);
  assert.match(guardaDeployLocal({ CICLO_DEPLOY_LOCAL: "true" }) ?? "", /CICLO_DEPLOY_LOCAL=1/, "só o valor 1 libera");
  assert.equal(guardaDeployLocal({ CICLO_DEPLOY_LOCAL: "1" }), null);
  const pkg = JSON.parse(readFileSync(new URL("package.json", ROOT), "utf8"));
  assert.match(pkg.scripts.deploy, /^node scripts\/predeploy\.mjs --guarda-local && /, "a guarda é o 1º passo (antes do gate)");
  const { CICLO_DEPLOY_LOCAL: _x, ...semVar } = process.env;
  const r = spawnSync(process.execPath, ["scripts/predeploy.mjs", "--guarda-local"], { cwd: ROOT, encoding: "utf8", env: semVar });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Actions/);
  assert.equal(spawnSync(process.execPath, ["scripts/predeploy.mjs", "--guarda-local"], { cwd: ROOT, encoding: "utf8", env: { ...semVar, CICLO_DEPLOY_LOCAL: "1" } }).status, 0);
});

test("APP_VERSION local = dev (o CI injeta o commit) e o cron do staging é de hora em hora", () => {
  const cfg = readWrangler();
  assert.equal(cfg.vars.APP_VERSION, "dev");
  assert.equal(cfg.env.staging.vars.APP_VERSION, "dev");
  assert.deepEqual(cfg.env.staging.triggers.crons, ["0 * * * *"]);
  const comCron = (c: string) => ({ ...cfg, env: { staging: { ...cfg.env.staging, triggers: { crons: [c] } } } });
  for (const c of ["*/15 * * * *", "* * * * *", "0,30 * * * *"]) assert.ok(stagingProblems(comCron(c)).some((p: string) => p.includes("mais de 1 vez por hora")), c);
  assert.deepEqual(stagingProblems(comCron("17 */2 * * *")), []);
});

test("workflows: sem pull_request_target nem set -x, permissions por job, actions por SHA, segredo só em env:", () => {
  const wf = Object.fromEntries(["ci.yml", "deploy.yml"].map((n) => [n, readFileSync(new URL(`.github/workflows/${n}`, ROOT), "utf8")]));
  for (const [nome, y] of Object.entries(wf)) {
    const semComent = y.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");
    assert.ok(!/pull_request_target/.test(semComent), `${nome}: pull_request_target`);
    assert.ok(!/set -x|set -o xtrace|bash -x/.test(semComent), `${nome}: set -x`);
    assert.match(semComent, /^permissions: \{\}$/m, `${nome}: permissions vazias no topo`);
    for (const l of semComent.split("\n").filter((x) => /^\s*-?\s*uses:/.test(x))) {
      if (/uses: \.\//.test(l)) continue; // workflow local
      assert.match(l, /uses: [\w.-]+\/[\w.-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/, `${nome}: action sem SHA fixo: ${l.trim()}`);
    }
    // job: cada um declara permissions
    const jobs = semComent.split(/^jobs:$/m)[1].split(/^ {2}(?=[\w-]+:$)/m).filter((b) => b.trim());
    for (const j of jobs) assert.match(j, /\n {4}permissions:\n {6}contents: read\n/, `${nome}: job sem permissions mínimas: ${j.split("\n")[0]}`);
    // segredo/variable/input nunca interpolado direto num `run:` (só via env: ou with:)
    const linhasRun: string[] = [];
    let emRun = false, ind = 0;
    for (const l of semComent.split("\n")) {
      const m = /^(\s*)-?\s*run:(.*)$/.exec(l);
      if (m) { emRun = true; ind = m[1].length; linhasRun.push(m[2]); continue; }
      if (emRun && (l.trim() === "" || l.search(/\S/) > ind + 1)) { linhasRun.push(l); continue; }
      emRun = false;
    }
    for (const l of linhasRun) assert.ok(!/\$\{\{\s*(secrets|vars|inputs|github\.event)\./.test(l), `${nome}: interpolação em run: ${l.trim()}`);
  }
  assert.match(wf["ci.yml"], /^\s+e2e:$/m);
  for (const r of ["primeiro-acesso", "pular", "treino-atual", "navegacao", "chat", "mcp"]) assert.match(wf["ci.yml"], new RegExp(`npm run e2e:${r}$`, "m"), r);
  for (const j of ["check", "deploy-dry", "gitleaks"]) assert.match(wf["ci.yml"], new RegExp(`^ {2}${j}:$`, "m"), j);
  const d = wf["deploy.yml"];
  assert.match(d, /environment: staging/); assert.match(d, /environment: production/);
  assert.equal((d.match(/github\.repository == 'lipe0312\/ciclo'/g) ?? []).length, 2, "os dois deploys só neste repositório");
  assert.equal((d.match(/cancel-in-progress: false/g) ?? []).length, 2, "deploy em andamento nunca é cancelado");
  assert.match(d, /time-travel info ciclo-db/); assert.match(d, /--var "APP_VERSION:\$SHA"/); assert.match(d, /--var "APP_VERSION:\$GITHUB_SHA"/);
  assert.equal((d.match(/scripts\/smoke\.mjs "\$URL" --sha/g) ?? []).length, 2, "smoke conferindo o commit nos dois");
  // #164 revisão: o id do D1 é secret (variable sai no log público, no env: do passo); nunca vars.D1_DATABASE_ID
  assert.ok(!/vars\.D1_DATABASE_ID/.test(d), "D1_DATABASE_ID precisa ser secret, não variable");
  assert.equal((d.match(/\$\{\{ secrets\.D1_DATABASE_ID \}\}/g) ?? []).length, 4);
  // produção: só commit que já está na main (checkout com histórico + merge-base antes de qualquer passo com token)
  const prod = d.split(/^ {2}production:$/m)[1];
  assert.match(prod, /ref: \$\{\{ inputs\.ref \}\}\n {10}fetch-depth: 0\n/);
  const anc = prod.indexOf("git merge-base --is-ancestor HEAD origin/main");
  assert.ok(anc > 0 && anc < prod.indexOf("--gerar-config") && anc < prod.indexOf("time-travel"), "confere o ref antes de tocar a Cloudflare");
  assert.match(prod, /git fetch --no-tags origin main/);
  assert.ok(readFileSync(new URL(".gitignore", ROOT), "utf8").split("\n").includes("apps/worker/wrangler.deploy.jsonc"), "cópia com o id real fora do git");
  // o token da Cloudflare nunca no nível do job (npm ci não o enxerga)
  assert.ok(!/^ {4}env:\n {6}CLOUDFLARE_API_TOKEN/m.test(d), "CLOUDFLARE_API_TOKEN só no passo do wrangler");
});
