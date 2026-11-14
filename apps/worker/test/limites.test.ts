// #56 Abuso e custo no Worker real: 5 tentativas/min e bloqueio de 15 min em /auth/*, limite global de recuperação e setup,
// Turnstile validado no servidor, upload (tamanho, tipo falso, cota de 500 MB) e cota global a 95%. Tudo fictício.
import { test } from "node:test";
import assert from "node:assert/strict";
import { GRATIS, LINHAS_POR_ESCRITA, diaUtc } from "@ciclo/core";
import { SITEVERIFY } from "../src/limites.ts";
import { call, makeEnv } from "./fakes.ts";
import { convite, dono, envConta, ip } from "./conta-helpers.ts";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 1, 2]);
const H = { "CF-Connecting-IP": "198.51.100.7" };
/** Login errado: desafio válido, passkey que não existe → 401. */
async function loginErrado(env: unknown, headers = H) {
  const o = await call(env, "POST", "/auth/login/options", { body: {}, headers });
  if (o.status !== 200) return o;
  return call(env, "POST", "/auth/login", { body: { challengeId: o.data.challengeId, credential: { id: "passkey-ficticia", response: {} } }, headers });
}
const passaUmMinuto = (env: any) => env.DB.raw.prepare("DELETE FROM auth_rate_limit WHERE key LIKE 't:%'").run();

test("login: o 6º errado em 1 min dá 429 com Retry-After; outro IP segue", async () => {
  const env = envConta();
  for (let i = 1; i <= 5; i++) assert.equal((await loginErrado(env)).status, 401, `tentativa ${i}`);
  const sexto = await loginErrado(env);
  assert.equal(sexto.status, 429); assert.equal(sexto.data.code, "limite");
  const ra = Number(sexto.headers.get("Retry-After")); assert.ok(ra >= 1 && ra <= 60, String(ra));
  assert.equal((await loginErrado(env, { "CF-Connecting-IP": "198.51.100.8" })).status, 401, "o limite é por IP");
  assert.ok(!JSON.stringify(env.DB.raw.prepare("SELECT * FROM auth_rate_limit").all()).includes("198.51.100"), "nunca o IP puro");
});

test("login: 10 falhas seguidas bloqueiam o IP por 15 min (até o desafio); depois libera", async () => {
  const env = envConta();
  for (let i = 1; i <= 5; i++) assert.equal((await loginErrado(env)).status, 401);
  passaUmMinuto(env);
  for (let i = 6; i <= 10; i++) assert.equal((await loginErrado(env)).status, 401, `falha ${i}`);
  passaUmMinuto(env);
  const preso = await call(env, "POST", "/auth/login/options", { body: {}, headers: H });
  assert.equal(preso.status, 429); assert.equal(preso.data.code, "bloqueado");
  const ra = Number(preso.headers.get("Retry-After")); assert.ok(ra > 14 * 60 && ra <= 15 * 60, String(ra));
  assert.equal((await call(env, "POST", "/auth/recover", { body: { codigo: "AAAA-AAAA-AA" }, headers: H })).status, 429, "vale para toda tentativa");
  env.DB.raw.prepare("UPDATE auth_falhas SET ate = 1").run(); // 15 min depois
  assert.equal((await call(env, "POST", "/auth/login/options", { body: {}, headers: H })).status, 200);
});

test("limite global (força bruta distribuída): /auth/recover e setup do dono, mesmo com um IP por tentativa", async () => {
  const env = envConta();
  let last = 0;
  for (let i = 0; i < 100; i++) last = (await call(env, "POST", "/auth/recover", { body: { codigo: "AAAA-AAAA-AA" }, headers: ip() })).status;
  assert.equal(last, 401);
  const r = await call(env, "POST", "/auth/recover", { body: { codigo: "AAAA-AAAA-AA" }, headers: ip() });
  assert.equal(r.status, 429); assert.ok(r.headers.get("Retry-After"));
  for (let i = 0; i < 20; i++) last = (await call(env, "POST", "/auth/register/options", { body: { setup: "errado-errado-errado", nome: "X" }, headers: ip() })).status;
  assert.equal(last, 403);
  assert.equal((await call(env, "POST", "/auth/register/options", { body: { setup: "errado-errado-errado", nome: "X" }, headers: ip() })).status, 429);
  assert.equal((await call(env, "POST", "/auth/login/options", { body: {}, headers: ip() })).status, 200, "login segue");
});

test("Turnstile: validado no servidor (sem token, token inválido → 403); convite pede sempre; login pede depois de 3 falhas", async (t) => {
  const vistos: URLSearchParams[] = [];
  const orig = globalThis.fetch;
  globalThis.fetch = (async (u: RequestInfo | URL, init?: RequestInit) => {
    if (String(u) !== SITEVERIFY) return orig(u, init);
    const p = new URLSearchParams(String(init?.body)); vistos.push(p);
    return new Response(JSON.stringify({ success: p.get("secret") === "secret-ficticio" && p.get("response") === "token-bom" }), { headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  t.after(() => { globalThis.fetch = orig; });
  const env = envConta({ TURNSTILE_SECRET: "secret-ficticio", TURNSTILE_SITE_KEY: "site-ficticio" });
  assert.equal((await call(env, "GET", "/auth/status")).data.turnstile, "site-ficticio");
  const d = await dono(env); // setup do dono não pede Turnstile
  const inv = (await convite(env, d.cookie)).data;
  const opt = (turnstile?: string) => call(env, "POST", "/auth/register/options", { body: { convite: inv.codigo, nome: "Ana Fictícia", turnstile }, headers: ip() });
  const sem = await opt(); assert.equal(sem.status, 403); assert.equal(sem.data.code, "turnstile");
  assert.equal((await opt("token-ruim")).status, 403);
  assert.equal((await opt("token-bom")).status, 200);
  assert.equal(vistos.at(-1)!.get("remoteip") !== null, true);
  // login: até a 3ª falha não pede; depois, o desafio só sai com Turnstile válido
  for (let i = 0; i < 3; i++) assert.equal((await loginErrado(env)).status, 401);
  const pede = await call(env, "POST", "/auth/login/options", { body: {}, headers: H });
  assert.equal(pede.status, 403); assert.equal(pede.data.code, "turnstile");
  assert.equal((await call(env, "POST", "/auth/login/options", { body: { turnstile: "token-ruim" }, headers: H })).status, 403);
  assert.equal((await call(env, "POST", "/auth/login/options", { body: { turnstile: "token-bom" }, headers: H })).status, 200);
  // siteverify fora do ar: falha fechada
  globalThis.fetch = (async () => { throw new Error("rede"); }) as typeof fetch;
  assert.equal((await opt("token-bom")).status, 403);
});

test("Turnstile desligado sem secret: status sem chave e convite sem token funciona", async () => {
  const env = envConta();
  assert.equal((await call(env, "GET", "/auth/status")).data.turnstile, null);
  const d = await dono(env);
  const inv = (await convite(env, d.cookie)).data;
  assert.equal((await call(env, "POST", "/auth/register/options", { body: { convite: inv.codigo, nome: "Bia Fictícia" }, headers: ip() })).status, 200);
});

test("upload: acima de 25 MB → 413; tipo falso (magic bytes) → 415; conta acima de 500 MB → 429", async () => {
  const env = makeEnv();
  assert.equal((await call(env, "POST", "/api/media", { user: "ana", raw: PNG, ct: "image/png" })).status, 201);
  const w = (await import("../src/index.ts")).default as any;
  const grande = new Request("http://localhost:8791/api/media", { method: "POST", headers: { "Content-Type": "video/mp4", "Content-Length": String(26 * 1024 * 1024), "x-dev-user": "ana" }, body: PNG });
  assert.equal((await w.fetch(grande, env)).status, 413);
  const html = new TextEncoder().encode("<html><script>alert(1)</script></html>");
  const falso = await call(env, "POST", "/api/media", { user: "ana", raw: html, ct: "image/png" });
  assert.equal(falso.status, 415); assert.equal(falso.data.code, "tipo_falso");
  assert.equal((await call(env, "POST", "/api/media", { user: "ana", raw: PNG, ct: "video/mp4" })).status, 415, "PNG dizendo ser vídeo");
  assert.equal(env.MEDIA.m.size, 1, "nada recusado foi ao R2");
  env.DB.raw.prepare("UPDATE media SET bytes = ? WHERE user_id = (SELECT id FROM user WHERE email = 'ana@dev.localhost')").run(500 * 1024 * 1024 - 5);
  const cheia = await call(env, "POST", "/api/media", { user: "ana", raw: PNG, ct: "image/png" });
  assert.equal(cheia.status, 429); assert.equal(cheia.data.code, "cota_conta"); assert.match(cheia.data.error, /500 MB/);
  assert.equal((await call(env, "POST", "/api/media", { user: "bia", raw: PNG, ct: "image/png" })).status, 201, "a cota é da conta");
});

test("cota global: a 95% do grátis, upload e convite param e a leitura continua; a 90% ainda passa", async () => {
  const env = envConta();
  const d = await dono(env);
  const hoje = diaUtc(Date.now());
  const escritas = (pct: number) => env.DB.raw.prepare("INSERT INTO uso_dia (dia, escritas) VALUES (?, ?) ON CONFLICT(dia) DO UPDATE SET escritas = excluded.escritas")
    .run(hoje, Math.ceil((GRATIS.d1EscritasDia * pct) / LINHAS_POR_ESCRITA));
  const up = () => call(env, "POST", "/api/media", { user: d.cookie, raw: PNG, ct: "image/png" });
  escritas(0.9);
  assert.equal((await up()).status, 201, "aviso, não trava");
  escritas(0.95);
  const u = await up(); assert.equal(u.status, 429); assert.equal(u.data.code, "cota_global"); assert.match(u.data.error, /amanhã/);
  const c = await convite(env, d.cookie); assert.equal(c.status, 429); assert.equal(c.data.code, "cota_global");
  assert.equal((await call(env, "GET", "/api/media", { user: d.cookie })).status, 200, "leitura segue");
  assert.equal((await call(env, "GET", "/api/account", { user: d.cookie })).status, 200);
  // o R2 guardado também conta (10 GB grátis)
  escritas(0);
  env.DB.raw.prepare("UPDATE media SET bytes = ?").run(Math.ceil(GRATIS.r2Bytes * 0.96));
  assert.equal((await convite(env, d.cookie)).status, 429);
  // toda escrita soma no contador do dia
  const antes = (env.DB.raw.prepare("SELECT escritas FROM uso_dia WHERE dia = ?").get(hoje) as { escritas: number }).escritas;
  await call(env, "POST", "/api/inbox", { user: d.cookie, body: { text: "pedido fictício" } });
  assert.equal((env.DB.raw.prepare("SELECT escritas FROM uso_dia WHERE dia = ?").get(hoje) as { escritas: number }).escritas, antes + 1);
});
