// #70 Cenários de teste local (npm run dev:cenario): argumentos, comandos SÓ LOCAIS (nunca --remote), seeds fictícios nos três cenários
// pelo Worker real + D1 falso, zerar e semear de novo (o reset), a rota do botão "↺ cenário" e a abertura direto na tela.
// Também cobre o `ler` por --command do scripts/limpar-legado.mjs (leitura remota não devolve linhas por --file).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { contaNovaVazia } from "@ciclo/core";
import { USER_TABLES } from "../src/db.ts";
import { call, makeEnv } from "./fakes.ts";
// scripts JS (sem tipos)
import { CENARIOS, NOMES, PORTA_CTRL, comandos, dirCenario, garantirLocal, lerArgs, textoLista, urlAbertura } from "../../../scripts/cenarios/index.mjs";
import { hojeSP, limparTudo, somarDias } from "../../../scripts/cenarios/lib.mjs";
import { wranglerEnv } from "../../../scripts/limpar-legado.mjs";

const ROOT = new URL("../../../", import.meta.url).pathname;

/** ctx do seed contra o Worker real + D1 falso (a mesma interface que o dev:cenario usa com o wrangler). */
function ctxFalso(env: any, slug: string) {
  const agora = Date.now(), hoje = hojeSP(agora);
  return {
    agora, hoje, dia: (n: number) => somarDias(hoje, n),
    sql: async (t: string) => /^\s*SELECT/i.test(t) ? (env.DB.raw.prepare(t).all() as object[]).map((r) => ({ ...r })) as any[] : (env.DB.raw.exec(t), [] as any[]),
    api: async (m: string, p: string, body?: unknown, o: { status?: number } = {}) => {
      const r = await call(env, m, p, { user: slug, body });
      if (o.status ? r.status !== o.status : r.status >= 300) throw new Error(`${m} ${p} → ${r.status} ${r.text.slice(0, 200)}`);
      return r.data;
    },
  };
}
const subir = async (nome: string) => { const env = makeEnv(); await CENARIOS[nome as "vazio"].seed(ctxFalso(env, CENARIOS[nome as "vazio"].slug)); return env; };
const n = (env: any, sql: string, ...a: unknown[]) => env.DB.raw.prepare(sql).get(...a).n as number;

test("lerArgs: cenário, --tela, --reset, --lista, --com-login; recusa o que não existe e qualquer --remote", () => {
  assert.deepEqual(lerArgs(["vazio", "--tela", "primeiros-passos/0"]), { nome: "vazio", tela: "primeiros-passos/0", reset: false, lista: false, comLogin: false, semAbrir: false, porta: 8791 });
  assert.equal(lerArgs(["semi", "--tela", "#hoje", "--reset", "--com-login", "--sem-abrir", "--porta", "8800"]).tela, "hoje");
  assert.equal(lerArgs(["--lista"]).lista, true);
  for (const ruim of [[], ["nao-existe"], ["vazio", "semi"], ["vazio", "--tela"], ["vazio", "--tela", "//evil.com"], ["vazio", "--tela", "a b"], ["vazio", "--porta", "80"], ["vazio", "--porta", String(PORTA_CTRL)], ["vazio", "--x"]])
    assert.throws(() => lerArgs(ruim as string[]), undefined, JSON.stringify(ruim));
  for (const r of ["--remote", "-r", "--env", "--remote=true"]) assert.throws(() => lerArgs(["vazio", r]), /só local/, r);
  for (const nome of NOMES) assert.match(textoLista(), new RegExp(`^${nome}$`, "m"));
});

test("comandos: tudo local, no D1 do cenário (.wrangler/cenarios/<nome>), nunca --remote; garantirLocal barra o resto", () => {
  for (const nome of NOMES) for (const comLogin of [false, true]) {
    const c = comandos(nome, { comLogin, codigo: "x".repeat(24), root: "/tmp/ciclo-x" });
    assert.equal(c.dir, "/tmp/ciclo-x/.wrangler/cenarios/" + nome); assert.equal(dirCenario(nome, "/tmp/ciclo-x"), c.dir);
    for (const cmd of [c.migrar, c.sql("/tmp/q.sql"), c.dev]) {
      assert.ok(!cmd.some((a: string) => /remote|^-r$|^--env/.test(a)), cmd.join(" "));
      assert.equal(cmd[cmd.indexOf("--persist-to") + 1], c.dir, `${cmd.join(" ")} precisa do --persist-to do cenário`);
    }
    for (const cmd of [c.migrar, c.sql("/tmp/q.sql")]) assert.ok(cmd.includes("--local"));
    assert.ok(c.dev.includes(`CENARIO_NOME:${nome}`));
    assert.ok(comLogin ? c.dev.includes("DEV_NO_AUTH:0") && c.dev.some((a: string) => a.startsWith("OWNER_SETUP_CODE:")) : c.dev.includes("DEV_NO_AUTH:1") && !c.dev.some((a: string) => a.startsWith("OWNER_")));
  }
  assert.throws(() => garantirLocal(["wrangler", "d1", "execute", "ciclo-db", "--remote"]), /só local/);
  assert.throws(() => garantirLocal(["wrangler", "deploy", "--env", "staging"]), /só local/);
  assert.ok(garantirLocal(["wrangler", "dev", "--var", "A:1"]));
});

test("dev:cenario recusa --remote antes de fazer qualquer coisa (código de saída 2)", () => {
  const r = spawnSync(process.execPath, [join(ROOT, "scripts/dev-cenario.mjs"), "vazio", "--remote"], { encoding: "utf8", timeout: 20_000 });
  assert.equal(r.status, 2); assert.match(r.stderr, /só local/);
  assert.equal(spawnSync(process.execPath, [join(ROOT, "scripts/dev-cenario.mjs"), "--lista"], { encoding: "utf8" }).stdout.includes("dono"), true);
});

test("abrir direto na tela: a URL de abertura leva o usuário do cenário e a rota; /api/dev/user?t= só aceita rota simples", async () => {
  assert.equal(urlAbertura("vazio", "primeiros-passos/0"), "http://localhost:8791/api/dev/user?u=cenario-vazio&t=primeiros-passos%2F0");
  assert.equal(urlAbertura("semi", null), "http://localhost:8791/api/dev/user?u=cenario-semi");
  const env = makeEnv();
  const r = await call(env, "GET", "/api/dev/user?u=cenario-vazio&t=primeiros-passos/0");
  assert.equal(r.status, 302); assert.equal(r.headers.get("location"), "/#primeiros-passos/0"); assert.match(r.headers.get("set-cookie")!, /^ciclo_dev_user=cenario-vazio;/);
  assert.equal((await call(env, "GET", "/api/dev/user?u=cenario-vazio")).headers.get("location"), "/");
  for (const t of ["//evil.com", "https://evil.com", "a b", "/x"]) assert.equal((await call(env, "GET", `/api/dev/user?u=a&t=${encodeURIComponent(t)}`)).status, 400, t);
  assert.equal((await call(env, "GET", "/api/dev/user?u=a&t=hoje", { host: "ciclo.exemplo.com" })).status, 404, "fora do localhost não existe");
});

test("vazio: conta recém-criada pelo cadastro e mais nada (Primeiros passos pendente, sem perfil, academia, treino, comida ou dor)", async () => {
  const env = await subir("vazio");
  const st = await call(env, "GET", `/api/state?date=${hojeSP()}`, { user: "cenario-vazio" });
  assert.equal(st.status, 200);
  assert.deepEqual(st.data.profile, {}); assert.deepEqual(st.data.gyms, []); assert.equal(st.data.dayPlan, null); assert.equal(st.data.onboarding, "pendente");
  assert.equal(st.data.account.sexo, "feminino"); assert.equal(st.data.account.sobrenome, "Teste"); assert.equal(st.data.account.name, "Ana");
  const uid = env.DB.raw.prepare("SELECT id FROM user").get().id;
  const cont = Object.fromEntries(USER_TABLES.map((t) => [t, n(env, `SELECT COUNT(*) n FROM ${t} WHERE user_id = ?1`, uid)]));
  assert.deepEqual(contaNovaVazia(cont), [], JSON.stringify(cont));
  assert.equal(cont.consent, 2); assert.equal(n(env, "SELECT COUNT(*) n FROM user"), 1);
});

test("semi: Perfil respondido, 1 academia, 2 semanas de treinos, check-ins, 1 dor leve e comida de 3 dias", async () => {
  const env = await subir("semi"), q = (s: string) => n(env, s);
  const st = await call(env, "GET", `/api/state?date=${hojeSP()}`, { user: "cenario-semi" });
  assert.equal(st.data.onboarding, "concluido"); assert.equal(st.data.profile.goal.id, "bracos_ombros"); assert.equal(st.data.profile.goal.statement.includes("cintura"), true);
  assert.equal(st.data.gyms.length, 1); assert.ok(st.data.gyms[0].equipment.length >= 5);
  assert.ok(q("SELECT COUNT(*) n FROM session WHERE finished_at IS NOT NULL") >= 6, "treinos feitos nas 2 semanas");
  assert.ok(q("SELECT COUNT(*) n FROM set_log") >= 36);
  assert.ok(q("SELECT COUNT(*) n FROM checkin") >= 3);
  assert.equal(q("SELECT COUNT(*) n FROM pain WHERE intensity = 1 AND resolved_at IS NULL"), 1);
  assert.equal(q("SELECT COUNT(DISTINCT date) n FROM food_log"), 3);
  assert.equal(q("SELECT COUNT(*) n FROM session WHERE date = '" + hojeSP() + "'"), 0, "hoje fica livre para treinar");
  // #77 o marco "1ª semana gerada" (MIN(created_at) de week_plan) não pode vir depois do "1º treino"
  const sem = env.DB.raw.prepare("SELECT MIN(created_at) t FROM week_plan").get().t, treino = env.DB.raw.prepare("SELECT MIN(date) d FROM session").get().d;
  assert.ok(new Date(sem).toISOString().slice(0, 10) <= treino, `1ª semana ${new Date(sem).toISOString()} depois do 1º treino ${treino}`);
  assert.equal(q("SELECT COUNT(*) n FROM user"), 1);
});

test("dono: o semi + papel de dono, 2 convites (1 pendente) e 3 de 50 vagas (#165: 2 contas + 1 pendente; o dono fica fora)", async () => {
  const env = await subir("dono");
  const r = await call(env, "GET", "/api/account/people", { user: "cenario-dono" });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.data.vagas.usadas, 3); assert.equal(r.data.vagas.teto, 50); assert.equal(r.data.people.find((p: any) => p.eu).role, "owner");
  assert.equal(r.data.invites.length, 1, "1 pendente"); assert.equal(n(env, "SELECT COUNT(*) n FROM invites"), 2); assert.equal(n(env, "SELECT COUNT(*) n FROM invites WHERE used_at IS NOT NULL"), 1);
  assert.equal(n(env, "SELECT COUNT(*) n FROM session WHERE finished_at IS NOT NULL") >= 6, true, "traz tudo do semi");
});

test("reset: limparTudo zera todas as tabelas e o seed roda de novo do mesmo jeito", async () => {
  const env = await subir("dono"), ctx = () => ctxFalso(env, CENARIOS.dono.slug);
  assert.ok(n(env, "SELECT COUNT(*) n FROM session") > 0);
  await limparTudo(ctx());
  for (const t of ["user", "invites", "consent", "rate_limit", "uso_dia", ...USER_TABLES]) assert.equal(n(env, `SELECT COUNT(*) n FROM ${t}`), 0, t);
  await CENARIOS.dono.seed(ctx());
  assert.equal(n(env, "SELECT COUNT(*) n FROM user"), 3);
  await limparTudo(ctx()); await CENARIOS.vazio.seed(ctxFalso(env, CENARIOS.vazio.slug));
  assert.equal(n(env, "SELECT COUNT(*) n FROM user"), 1); assert.equal(n(env, "SELECT COUNT(*) n FROM session"), 0);
});

test("botão ↺ cenário: /api/dev/cenario só existe no localhost com o dev:cenario; o reset vai para 127.0.0.1 e para por aí", async () => {
  const com = makeEnv({ CENARIO_NOME: "vazio", CENARIO_CTRL: "8795" });
  assert.deepEqual((await call(com, "GET", "/api/dev/cenario")).data, { nome: "vazio" });
  assert.equal((await call(makeEnv(), "GET", "/api/dev/cenario")).status, 404, "sem CENARIO_NOME (npm run dev normal)");
  assert.equal((await call(com, "GET", "/api/dev/cenario", { host: "ciclo.exemplo.com" })).status, 404, "fora do localhost");
  assert.equal((await call(makeEnv({ CENARIO_NOME: "vazio", DEV_NO_AUTH: undefined }), "GET", "/api/dev/cenario")).status, 404, "sem DEV_NO_AUTH");
  assert.equal((await call(com, "GET", "/api/dev/cenario/reset")).status, 404, "reset só por POST");
  assert.equal((await call(com, "POST", "/api/dev/cenario/reset", { headers: { Origin: "https://evil.com" } })).status, 403);
  assert.equal((await call(makeEnv({ CENARIO_NOME: "vazio", CENARIO_CTRL: "80" }), "POST", "/api/dev/cenario/reset")).status, 404, "porta fora da faixa");
  const orig = globalThis.fetch, vistas: { url: string; h: unknown }[] = [];
  try {
    globalThis.fetch = (async (u: string, init: RequestInit) => { vistas.push({ url: String(u), h: init.headers }); return new Response("{}", { status: 200 }); }) as typeof fetch;
    const ok = await call(com, "POST", "/api/dev/cenario/reset");
    assert.equal(ok.status, 200); assert.deepEqual(vistas, [{ url: "http://127.0.0.1:8795/reset", h: { "x-ciclo-cenario": "reset" } }]);
    globalThis.fetch = (async () => { throw new Error("recusou"); }) as typeof fetch;
    assert.equal((await call(com, "POST", "/api/dev/cenario/reset")).status, 502);
  } finally { globalThis.fetch = orig; }
});

test("limpar-legado: leitura (SELECT) vai por --command e escrita por --file, inclusive o batch de SELECT do export", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ciclo-fake-npx-")), log = join(dir, "args.log");
  writeFileSync(join(dir, "npx"), `#!/bin/sh\necho "$@" >> '${log}'\necho '[{"results":[{"id":"abc"}],"meta":{"changes":1}}]'\n`); chmodSync(join(dir, "npx"), 0o755);
  const antes = process.env.PATH; process.env.PATH = `${dir}:${antes}`;
  try {
    const { DB } = wranglerEnv({ remote: true });
    assert.deepEqual((await DB.prepare("SELECT id FROM user").all()).results, [{ id: "abc" }]);
    assert.deepEqual(await DB.prepare("SELECT id FROM user").first(), { id: "abc" });
    await DB.batch([DB.prepare("SELECT 1"), DB.prepare("SELECT 2")]);
    await DB.prepare("DELETE FROM user").run();
  } finally { process.env.PATH = antes; }
  const l = readFileSync(log, "utf8").trim().split("\n");
  assert.equal(l.length, 5);
  for (const x of l.slice(0, 4)) assert.match(x, /--command SELECT/, x);
  assert.match(l[4], /--file /); assert.doesNotMatch(l[4], /--command/);
  assert.ok(l.every((x) => x.includes("--remote")), "o teste confirma que o script do dono continua indo ao alvo que ele pediu");
});
