// #31 Pronto para deploy: configuração de produção, CSP, migrations, falha fechada em TODAS as rotas e ferramentas
// (listas geradas do roteador e do schema, sem lista manual) e LGPD (export/apagar cobrem toda tabela com user_id).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { routeSignatures } from "../src/api.ts";
import { toolNames } from "../src/mcp.ts";
import { USER_TABLES } from "../src/db.ts";
import { call, makeEnv, mcp } from "./fakes.ts";
// script JS (sem tipos): a mesma checagem roda no `npm run deploy`
import { readMigrations, readWrangler, secretProblems, staticProblems } from "../../../scripts/predeploy.mjs";

const PROD = "ciclo.exemplo.workers.dev";
const sample = (p: string) => p.replace(/:(\w+)/g, (_m, k) => (k === "date" ? "2026-11-05" : k === "setNo" ? "1" : "x1"));

test("config de produção: sem variável de dev, sem preview, bindings e migrations aceitas pelo D1 remoto", () => {
  assert.deepEqual(staticProblems(readWrangler(), readMigrations()), []);
  const ruim = staticProblems({ vars: { DEV_NO_AUTH: "1" }, preview_urls: true }, [{ name: "0011_x.sql", sql: "BEGIN TRANSACTION; CREATE TABLE a(x); COMMIT;" }, { name: "0011_y.sql", sql: "" }]);
  for (const s of ["DEV_NO_AUTH", "preview_urls", "workers_dev", "transação", "repetido", "MEDIA"]) assert.ok(ruim.some((p: string) => p.includes(s)), s);
  const gatilho = staticProblems(readWrangler(), [{ name: "0001_a.sql", sql: "CREATE TRIGGER t AFTER INSERT ON a BEGIN\n  INSERT INTO b VALUES (1);\nEND;" }]);
  assert.deepEqual(gatilho, [], "BEGIN de gatilho não é transação");
});

test("CSP do app: só 'self', os tiles do OSM (ADR-0010) e o Turnstile (ADR-0012); sem inline/eval nem outros terceiros", () => {
  const h = readFileSync(new URL("../../web/public/_headers", import.meta.url), "utf8");
  const csp = /Content-Security-Policy: (.+)/.exec(h)![1];
  const dir = Object.fromEntries(csp.split(";").map((d) => d.trim().split(/\s+/)).map(([k, ...v]) => [k, v]));
  assert.deepEqual(dir["script-src"], ["'self'", "https://challenges.cloudflare.com"]);
  assert.deepEqual(dir["frame-src"], ["https://challenges.cloudflare.com"]);
  assert.deepEqual(dir["connect-src"], ["'self'"]);
  assert.deepEqual(dir["frame-ancestors"], ["'none'"]);
  assert.deepEqual(dir["object-src"], ["'none'"]);
  const hosts = csp.match(/https?:\/\/[^\s;]+/g) ?? [];
  assert.deepEqual([...new Set(hosts)].sort(), ["https://challenges.cloudflare.com", "https://tile.openstreetmap.org"]);
  assert.ok(!/unsafe-eval|\*/.test(csp));
  assert.match(h, /Strict-Transport-Security/); assert.match(h, /Permissions-Policy/);
  const html = readFileSync(new URL("../../web/index.html", import.meta.url), "utf8");
  assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(html), "sem script inline");
  assert.match(html, /rel="manifest"[^>]*crossorigin="use-credentials"/, "manifest leva o cookie do Access (senão o PWA não instala)");
});

test("produção sem Access: TODA rota /api → 401 e TODA ferramenta MCP sem token válido → 401 (gerado do roteador)", async () => {
  const env = makeEnv({ DEV_NO_AUTH: undefined, ACCESS_TEAM_DOMAIN: "time.cloudflareaccess.com", ACCESS_AUD: "aud", ALLOWED_EMAILS: "a@exemplo.com" });
  const sigs = routeSignatures();
  assert.ok(sigs.length > 60);
  for (const sig of sigs) {
    const [m, p] = sig.split(" ");
    const r = await call(env, m, sample(p), { host: PROD, user: "ana", body: m === "GET" ? undefined : {}, headers: { Cookie: "ciclo_dev_user=ana" } });
    assert.equal(r.status, 401, `${sig}: ${r.status}`);
    assert.match(r.headers.get("Content-Security-Policy") ?? "", /default-src 'none'/, sig);
    assert.equal(r.headers.get("Cache-Control"), "no-store", sig);
  }
  assert.equal((await call(env, "GET", "/api/dev/user?u=ana", { host: PROD })).status, 404, "troca de usuário de dev não existe em produção");
  for (const name of toolNames) {
    for (const tok of ["", "b".repeat(64), `ciclo_${"0".repeat(16)}_${"1".repeat(64)}`]) {
      const r = tok ? await call(env, "POST", "/mcp", { host: PROD, bearer: tok, body: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: {} } } })
        : await call(env, "POST", "/mcp", { host: PROD, body: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: {} } } });
      assert.equal(r.status, 401, `${name} com token ${tok.slice(0, 6) || "vazio"}`);
    }
  }
  assert.equal((await call(env, "POST", "/mcp/media", { host: PROD, bearer: "b".repeat(64), raw: new Uint8Array([1]), ct: "image/png" })).status, 401);
  assert.equal((await call(env, "GET", "/api/health", { host: PROD })).status, 200, "health fica aberto (Bypass no Access)");
});

test("LGPD: toda tabela com user_id (lida do schema) é apagada com a conta; export cobre todas, menos as técnicas", async () => {
  const env = makeEnv();
  const comUser = env.DB.raw.prepare("SELECT name FROM sqlite_master WHERE type='table' AND sql LIKE '%user_id%' AND name NOT LIKE 'busca_%'").all().map((r: any) => r.name).sort();
  assert.deepEqual([...USER_TABLES].sort(), comUser, "deleteAccount (USER_TABLES) precisa cobrir toda tabela com user_id");
  // técnicas/derivadas: contador de limite, aparelho de push, descanso agendado e índice de busca (cópia de textos já exportados)
  const TECNICAS = ["auth_challenge", "busca", "oauth_code", "push_subscription", "rate_limit", "rest_timer"]; // #54: desafio WebAuthn de 5 min · #66: código OAuth de 5 min
  const tok = (await call(env, "POST", "/api/account/tokens", { user: "z", body: { label: "t" } })).data.token;
  assert.equal((await mcp(env, tok, "ciclo_estado")).status, 200);
  const exp = (await call(env, "GET", "/api/account/export", { user: "z" })).data;
  const faltam = comUser.filter((t: string) => !TECNICAS.includes(t) && !(t in exp));
  assert.deepEqual(faltam, [], "export sem essas tabelas");
  assert.equal(exp.formato, "ciclo-export-1");
  assert.ok(!JSON.stringify(exp).includes(tok), "export nunca traz o token");
});

test("nada de dado real versionado: migrations não semeiam pessoas nem e-mails", () => {
  for (const { name, sql } of readMigrations()) {
    const ins = sql.replace(/--[^\n]*/g, "").match(/INSERT INTO\s+(\w+)/gi) ?? [];
    for (const i of ins) assert.match(i, /geocode_gate|busca/i, `${name}: seed inesperado (${i})`);
    assert.ok(!/@[a-z0-9-]+\.(com|br|net|org)/i.test(sql), `${name}: e-mail no SQL`);
  }
});

test("#56 predeploy: AUTH_PEPPER obrigatório, Turnstile com as duas chaves ou nenhuma, secret do Turnstile fora de vars", () => {
  assert.deepEqual(secretProblems(["AUTH_PEPPER"]), []);
  assert.deepEqual(secretProblems(["AUTH_PEPPER", "TURNSTILE_SITE_KEY", "TURNSTILE_SECRET"]), []);
  assert.match(secretProblems([]).join(), /AUTH_PEPPER/);
  assert.match(secretProblems(["AUTH_PEPPER", "TURNSTILE_SECRET"]).join(), /Turnstile pela metade/);
  assert.match(secretProblems(["AUTH_PEPPER"], { TURNSTILE_SITE_KEY: "x" }).join(), /Turnstile pela metade/);
  const cfg = readWrangler();
  assert.ok(staticProblems({ ...cfg, vars: { ...cfg.vars, TURNSTILE_SECRET: "x" } }, []).some((x: string) => /TURNSTILE_SECRET/.test(x)));
});
