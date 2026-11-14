// #58 Ambiente de testes: rpId/origem do WebAuthn, config do staging (nunca a produção) e script de staging.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { webauthnWhere, ambiente } from "../src/ambiente.ts";
import { call, makeEnv } from "./fakes.ts";
import { readWrangler, readMigrations, staticProblems, stagingProblems } from "../../../scripts/predeploy.mjs";
import { STAGING_DB, setStagingDbId, parseD1Id, plano } from "../../../scripts/staging.mjs";
import { tunnelUrl } from "../../../scripts/dev-tunnel.mjs";

const rq = (url: string, h: Record<string, string> = {}) => new Request(url, { headers: h });

test("WebAuthn: rpId e origem vêm do host; localhost continua igual", () => {
  assert.deepEqual(webauthnWhere(rq("http://localhost:8791/auth/x"), {}), { rpId: "localhost", origin: "http://localhost:8791" });
  assert.deepEqual(webauthnWhere(rq("https://ciclo.exemplo.workers.dev/auth/x"), {}), { rpId: "ciclo.exemplo.workers.dev", origin: "https://ciclo.exemplo.workers.dev" });
});

test("WebAuthn no túnel: https vem do X-Forwarded-Proto, mas só com DEV_TUNNEL=1 (não dá para forjar em produção)", () => {
  const r = rq("http://abc-def.trycloudflare.com/auth/x", { "X-Forwarded-Proto": "https" });
  assert.deepEqual(webauthnWhere(r, { DEV_TUNNEL: "1" }), { rpId: "abc-def.trycloudflare.com", origin: "https://abc-def.trycloudflare.com" });
  assert.equal(webauthnWhere(r, {}).origin, "http://abc-def.trycloudflare.com");
});

test("WebAuthn: PUBLIC_ORIGIN fixa o par; valor http não-local ou inválido é ignorado", () => {
  const r = rq("http://interno:8791/x");
  assert.deepEqual(webauthnWhere(r, { PUBLIC_ORIGIN: "https://teste.exemplo.com" }), { rpId: "teste.exemplo.com", origin: "https://teste.exemplo.com" });
  assert.equal(webauthnWhere(r, { PUBLIC_ORIGIN: "http://evil.com" }).rpId, "interno");
  assert.equal(webauthnWhere(r, { PUBLIC_ORIGIN: "lixo" }).rpId, "interno");
});

test("PUBLIC_ORIGIN (produção) não vale no localhost nem no túnel", () => {
  const o = { PUBLIC_ORIGIN: "https://ciclo.exemplo.workers.dev" };
  assert.equal(webauthnWhere(rq("http://localhost:8791/x"), o).rpId, "localhost");
  assert.equal(webauthnWhere(rq("http://x.trycloudflare.com/x", { "X-Forwarded-Proto": "https" }), { ...o, DEV_TUNNEL: "1" }).rpId, "x.trycloudflare.com");
  assert.equal(webauthnWhere(rq("https://qualquer.host/x"), o).rpId, "ciclo.exemplo.workers.dev", "em produção o host da requisição não manda");
});

test("túnel: /api/* e /mcp respondem 401 pelo host do túnel ou X-Forwarded-Host, com DEV_NO_AUTH ligado ou desligado", async () => {
  for (const dev of ["0", "1"]) {
    const env = makeEnv({ DEV_NO_AUTH: dev, DEV_TUNNEL: "1", MCP_TOKEN: dev === "1" ? "t".repeat(40) : "" });
    for (const headers of [{}, { "X-Forwarded-Host": "localhost:8791" }, { Host: "localhost", "X-Forwarded-Host": "localhost" }, { "x-dev-user": "ana", Cookie: "ciclo_dev_user=ana" }]) {
      const r = await call(env, "GET", "/api/state", { host: "abc.trycloudflare.com", headers });
      assert.equal(r.status, 401, `DEV_NO_AUTH=${dev} ${JSON.stringify(headers)}`);
    }
    assert.equal((await call(env, "POST", "/mcp", { host: "abc.trycloudflare.com", bearer: "t".repeat(40), body: { jsonrpc: "2.0", id: 1, method: "tools/list" } })).status, 401);
  }
});

test("staging falha fechado sem AUTH_PEPPER e OWNER_SETUP_CODE; produção não é afetada", async () => {
  const post = (env: unknown) => call(env, "POST", "/auth/login/options", { host: "ciclo-staging.exemplo.workers.dev", body: {} });
  assert.equal((await post(makeEnv({ ENVIRONMENT: "staging", DEV_NO_AUTH: undefined }))).status, 503);
  assert.equal((await post(makeEnv({ ENVIRONMENT: "staging", DEV_NO_AUTH: undefined, AUTH_PEPPER: "p".repeat(32) }))).status, 503);
  assert.notEqual((await post(makeEnv({ ENVIRONMENT: "staging", DEV_NO_AUTH: undefined, AUTH_PEPPER: "p".repeat(32), OWNER_SETUP_CODE: "o".repeat(20) }))).status, 503);
  // #56: produção também falha fechado sem AUTH_PEPPER (hash do IP nos limites); com ele e o IP da Cloudflare, responde
  assert.equal((await post(makeEnv({ DEV_NO_AUTH: undefined }))).status, 503);
  assert.notEqual((await call(makeEnv({ DEV_NO_AUTH: undefined, AUTH_PEPPER: "p".repeat(32) }), "POST", "/auth/login/options", { host: "ciclo.exemplo.workers.dev", body: {}, headers: { "CF-Connecting-IP": "203.0.113.5" } })).status, 503);
});

test("config de produção exige PUBLIC_ORIGIN https e proíbe DEV_TUNNEL; staging sem cron por minuto", () => {
  const cfg = readWrangler();
  assert.equal(cfg.vars.PUBLIC_ORIGIN, "https://ciclo.ciclo-worker.workers.dev");
  const m = (f: (c: any) => void) => { const c = structuredClone(cfg); f(c); return staticProblems(c, readMigrations()); };
  assert.ok(m((c) => { delete c.vars.PUBLIC_ORIGIN; }).some((p: string) => p.includes("PUBLIC_ORIGIN")));
  assert.ok(m((c) => { c.vars.PUBLIC_ORIGIN = "http://ciclo.exemplo.com"; }).some((p: string) => p.includes("PUBLIC_ORIGIN")));
  assert.ok(m((c) => { c.vars.DEV_TUNNEL = "1"; }).some((p: string) => p.includes("DEV_TUNNEL")));
  const c2 = structuredClone(cfg); c2.env.staging.triggers.crons = ["* * * * *"];
  assert.ok(stagingProblems(c2).some((p: string) => p.includes("cron")));
});

test("dev:tunnel nunca passa o código na linha de comando e força DEV_NO_AUTH=0", () => {
  const src = readFileSync(new URL("../../../scripts/dev-tunnel.mjs", import.meta.url), "utf8");
  assert.ok(!/--var[^\n]*OWNER_SETUP_CODE/.test(src));
  assert.match(src, /"DEV_NO_AUTH:0"/); assert.match(src, /"MCP_TOKEN:"/); assert.match(src, /--env-file/);
});

test("/api/health informa o ambiente (staging, túnel ou nada) para a faixa do app", async () => {
  assert.equal(ambiente({}), null);
  assert.equal((await call(makeEnv(), "GET", "/api/health")).data.ambiente, null);
  assert.equal((await call(makeEnv({ ENVIRONMENT: "staging" }), "GET", "/api/health")).data.ambiente, "staging");
  assert.equal((await call(makeEnv({ DEV_TUNNEL: "1" }), "GET", "/api/health")).data.ambiente, "tunel");
});

test("config: staging nunca usa o banco, o bucket nem o Worker da produção", () => {
  const cfg = readWrangler();
  assert.deepEqual(stagingProblems(cfg), []);
  assert.deepEqual(staticProblems(cfg, readMigrations()), []);
  const st = cfg.env.staging;
  assert.notEqual(st.name, cfg.name);
  assert.notEqual(st.d1_databases[0].database_name, cfg.d1_databases[0].database_name);
  assert.notEqual(st.r2_buckets[0].bucket_name, cfg.r2_buckets[0].bucket_name);
  assert.equal(st.vars.ENVIRONMENT, "staging");
  assert.equal(cfg.vars.ENVIRONMENT, undefined, "produção não leva a faixa");
  // regressões que o teste precisa pegar
  const mut = (f: (c: any) => void) => { const c = structuredClone(cfg); f(c); return stagingProblems(c); };
  assert.ok(mut((c) => { c.env.staging.d1_databases[0].database_name = "ciclo-db"; }).some((p: string) => p.includes("D1")));
  assert.ok(mut((c) => { c.env.staging.d1_databases[0].database_id = c.d1_databases[0].database_id = "11111111-2222-3333-4444-555555555555"; }).some((p: string) => p.includes("database_id")));
  assert.ok(mut((c) => { c.env.staging.r2_buckets[0].bucket_name = "ciclo-media"; }).some((p: string) => p.includes("R2")));
  assert.ok(mut((c) => { delete c.env.staging.d1_databases; }).some((p: string) => p.includes("DB ausente")));
  assert.ok(mut((c) => { delete c.env.staging.r2_buckets; }).some((p: string) => p.includes("MEDIA ausente")));
  assert.ok(mut((c) => { c.env.staging.name = c.name; }).some((p: string) => p.includes("name")));
  assert.ok(mut((c) => { c.env.staging.vars.DEV_NO_AUTH = "1"; }).some((p: string) => p.includes("DEV_NO_AUTH")));
  assert.ok(mut((c) => { delete c.env.staging.vars.ENVIRONMENT; }).some((p: string) => p.includes("ENVIRONMENT")));
});

test("npm run staging: grava o id só no D1 de staging; todo comando do plano mira staging", () => {
  const txt = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
  const id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  const novo = setStagingDbId(txt, id);
  assert.equal(setStagingDbId(novo, id), novo, "idempotente");
  const cfg = readWrangler(novo);
  assert.equal(cfg.env.staging.d1_databases[0].database_id, id);
  assert.equal(cfg.d1_databases[0].database_id, readWrangler().d1_databases[0].database_id, "produção intacta");
  assert.throws(() => setStagingDbId(txt, "lixo"));
  assert.equal(parseD1Id(`✅ Successfully created DB '${STAGING_DB}' ${id}`), id);
  const cmds = plano().map(([, c, a]) => `${c} ${a.join(" ")}`);
  for (const c of cmds.filter((x) => /wrangler (d1|r2|deploy)/.test(x) && !/whoami|list/.test(x))) assert.match(c, /staging/, c);
  assert.ok(!cmds.some((c) => /ciclo-db\b(?!-)|ciclo-media\b(?!-)/.test(c)), "nenhum comando cita o D1/R2 de produção");
  assert.ok(cmds.some((c) => c.includes("migrations apply") && c.includes("--env staging")));
  assert.ok(cmds.some((c) => c.includes("predeploy.mjs --staging")));
});

test("dev:tunnel: acha a URL do túnel na saída do cloudflared", () => {
  assert.equal(tunnelUrl("INF |  https://quiet-river-1234.trycloudflare.com  |"), "https://quiet-river-1234.trycloudflare.com");
  assert.equal(tunnelUrl("INF Starting tunnel"), null);
});
