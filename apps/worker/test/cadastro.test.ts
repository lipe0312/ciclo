// #62 Conta de verdade, de ponta a ponta pelo Worker (dados fictícios): conta nova VAZIA, sair → 401, Face ID de novo
// (app fechado há mais de 7 dias e ações sensíveis), aviso de aparelho novo, aceite LGPD versionado, Conta → Perfil e #privacidade.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CONSENT_VERSAO, contaNovaVazia } from "@ciclo/core";
import { USER_TABLES } from "../src/db.ts";
import { call } from "./fakes.ts";
import { DONO_EMAIL, ORIGEM, cadastro, contaPorConvite, convite, cookieDe, dono, envConta, ip, registrar } from "./conta-helpers.ts";
import { assinar } from "../../../packages/core/test/fake-autenticador.ts";
import type { Autenticador } from "../../../packages/core/test/fake-autenticador.ts";

const as = (env: any, cookie: string, m: string, p: string, body?: unknown, headers: Record<string, string> = {}) => call(env, m, p, { user: cookie, body, headers });
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const uidDe = async (env: any, cookie: string) => (await as(env, cookie, "GET", "/api/account/export")).data.user.id as string;
const linhas = (env: any, uid: string) => Object.fromEntries(USER_TABLES.map((t) => [t, env.DB.raw.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE user_id = ?1`).get(uid).n as number]));

/** Face ID de novo na MESMA sessão (destrava e libera ações sensíveis por 5 min). */
async function reauth(env: any, auth: Autenticador, cookie: string) {
  const opt = await as(env, cookie, "POST", "/auth/reauth/options", {}, ip());
  assert.equal(opt.status, 200, opt.text);
  const credential = await assinar(auth, { ...ORIGEM, challenge: opt.data.options.challenge });
  return as(env, cookie, "POST", "/auth/reauth", { challengeId: opt.data.challengeId, credential }, ip());
}

test("conta criada por convite nasce vazia: nenhuma academia, semana, perfil ou prioridade (só credenciais, sessão e aceite)", async () => {
  const env = envConta();
  const d = await dono(env);
  const ana = await contaPorConvite(env, d.cookie, "Ana Fictícia");
  // o app abre: estado, conta, home e semana não semeiam nada
  const st = await as(env, ana.cookie, "GET", "/api/state?date=2026-11-14");
  assert.equal(st.status, 200);
  assert.deepEqual(st.data.profile, {}); assert.deepEqual(st.data.gyms, []); assert.equal(st.data.dayPlan, null); assert.equal(st.data.onboarding, "pendente");
  assert.equal(st.data.account.sexo, "feminino"); assert.equal(st.data.account.sobrenome, "Fictícia");
  await as(env, ana.cookie, "GET", "/api/account");
  const uid = await uidDe(env, ana.cookie);
  const n = linhas(env, uid);
  assert.deepEqual(contaNovaVazia(n), [], `linhas inesperadas: ${JSON.stringify(n)}`);
  assert.equal(n.passkeys, 1); assert.equal(n.sessions, 1); assert.equal(n.recovery_codes, 8); assert.equal(n.consent, 2);
  // o dono também nasce vazio (sem herdar dado de conta antiga); convites e o contador técnico de escrita são dele ter convidado
  const donoUid = await uidDe(env, d.cookie);
  const nd = linhas(env, donoUid);
  assert.deepEqual(contaNovaVazia({ ...nd, invites: 0, rate_limit: 0 }), [], `dono: ${JSON.stringify(nd)}`);
  // planejar sem perfil devolve o estado vazio claro (não inventa treino)
  const p = await as(env, ana.cookie, "POST", "/api/plan-day", { date: "2026-11-14", daysLeft: 2 });
  assert.equal(p.data.plan, null); assert.equal(p.data.empty, "sem_perfil");
});

test("sair: o cookie e a sessão no servidor somem e /api/* responde 401 (o app volta ao login)", async () => {
  const env = envConta();
  const d = await dono(env);
  const ana = await contaPorConvite(env, d.cookie, "Ana Fictícia");
  assert.equal((await as(env, ana.cookie, "GET", "/api/state?date=2026-11-14")).status, 200);
  const uid = await uidDe(env, ana.cookie);
  const r = await call(env, "POST", "/auth/logout", { user: ana.cookie, body: {} });
  assert.equal(r.status, 200); assert.match(r.headers.get("set-cookie")!, /^__Host-ciclo=; .*Max-Age=0/);
  const depois = await as(env, ana.cookie, "GET", "/api/state?date=2026-11-14");
  assert.equal(depois.status, 401); assert.equal(depois.data.code, "entrar");
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) n FROM sessions WHERE user_id = ?1").get(uid).n, 0, "sessão apagada no servidor");
});

test("Face ID de novo: app fechado há mais de 7 dias trava sem deslogar; ações sensíveis pedem Face ID dos últimos 5 min", async () => {
  const env = envConta();
  const d = await dono(env);
  const ana = await contaPorConvite(env, d.cookie, "Ana Fictícia");
  const uid = await uidDe(env, ana.cookie);
  // 8 dias sem abrir: 401 faceid, mas a sessão continua lá
  env.DB.raw.prepare("UPDATE sessions SET last_seen_at = ?2 WHERE user_id = ?1").run(uid, Date.now() - 8 * 86_400_000);
  const trava = await as(env, ana.cookie, "GET", "/api/state?date=2026-11-14");
  assert.equal(trava.status, 401); assert.equal(trava.data.code, "faceid");
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) n FROM sessions WHERE user_id = ?1").get(uid).n, 1, "não deslogou");
  assert.equal((await as(env, ana.cookie, "GET", "/api/account")).status, 401, "continua travado até o Face ID");
  const ok = await reauth(env, ana.auth, ana.cookie);
  assert.equal(ok.status, 200, ok.text);
  assert.equal((await as(env, ana.cookie, "GET", "/api/state?date=2026-11-14")).status, 200, "destravou");
  // passkey de outra conta não destrava esta sessão
  const bia = await contaPorConvite(env, d.cookie, "Bia Fictícia");
  assert.equal((await reauth(env, bia.auth, ana.cookie)).status, 401);
  // ações sensíveis: Face ID há mais de 5 min → 403 reauth; depois do Face ID, passa
  env.DB.raw.prepare("UPDATE sessions SET reauth_at = ?2 WHERE user_id = ?1").run(uid, Date.now() - 6 * 60_000);
  const sensiveis: [string, string, unknown][] = [
    ["POST", "/api/account/tokens", { label: "x" }], ["POST", "/api/account/recovery-codes", {}], ["POST", "/api/account/logout-all", {}], ["DELETE", "/api/account", { confirm: "APAGAR" }],
  ];
  for (const [m, p, b] of sensiveis) {
    const r = await as(env, ana.cookie, m, p, b);
    assert.equal(r.status, 403, `${m} ${p}`); assert.equal(r.data.code, "reauth", `${m} ${p}`);
  }
  const donoUid = await uidDe(env, d.cookie);
  env.DB.raw.prepare("UPDATE sessions SET reauth_at = ?2 WHERE user_id = ?1").run(donoUid, Date.now() - 6 * 60_000);
  assert.equal((await convite(env, d.cookie)).data.code, "reauth", "convidar pede Face ID");
  assert.equal((await reauth(env, d.auth, d.cookie)).status, 200);
  assert.equal((await convite(env, d.cookie)).status, 201);
  assert.equal((await reauth(env, ana.auth, ana.cookie)).status, 200);
  assert.equal((await as(env, ana.cookie, "POST", "/api/account/tokens", { label: "Chat" })).status, 201);
});

test("aviso de login em aparelho novo: aparece nas outras sessões; 'Fui eu' some; 'Não fui eu' encerra todas", async () => {
  const env = envConta();
  const d = await dono(env);
  const ana = await contaPorConvite(env, d.cookie, "Ana Fictícia");
  const opt = await call(env, "POST", "/auth/login/options", { body: {}, headers: ip() });
  const credential = await assinar(ana.auth, { ...ORIGEM, challenge: opt.data.options.challenge });
  const novo = await call(env, "POST", "/auth/login", { body: { challengeId: opt.data.challengeId, credential }, headers: { ...ip(), "User-Agent": IPHONE } });
  const iphone = cookieDe(novo);
  const dev = (await as(env, ana.cookie, "GET", "/api/account/devices")).data.sessions;
  const aviso = dev.find((s: any) => s.aviso);
  assert.ok(aviso, "aviso no aparelho antigo"); assert.equal(aviso.aparelho, "iPhone · Safari");
  assert.ok(!(await as(env, iphone, "GET", "/api/account/devices")).data.sessions.some((s: any) => s.atual && s.aviso), "a sessão nova não avisa a si mesma");
  assert.equal((await as(env, ana.cookie, "POST", `/api/account/sessions/${aviso.id}/ok`, {})).status, 200);
  assert.ok(!(await as(env, ana.cookie, "GET", "/api/account/devices")).data.sessions.some((s: any) => s.aviso), "Fui eu");
  // "Não fui eu" = sair de todos (com Face ID recente): o intruso cai na hora
  assert.equal((await as(env, ana.cookie, "POST", "/api/account/logout-all", {})).status, 200);
  assert.equal((await as(env, iphone, "GET", "/api/account")).status, 401);
});

test("aceite LGPD: gravado no cadastro com versão e data (IP só em hash); versão nova obriga novo aceite antes de usar", async () => {
  const env = envConta();
  const d = await dono(env);
  const ana = await contaPorConvite(env, d.cookie, "Ana Fictícia");
  const uid = await uidDe(env, ana.cookie);
  const rows = env.DB.raw.prepare("SELECT doc, versao, aceito_em, ip_hash FROM consent WHERE user_id = ?1 ORDER BY doc").all(uid) as any[];
  assert.deepEqual(rows.map((r) => [r.doc, r.versao]), [["privacidade", CONSENT_VERSAO.privacidade], ["termos", CONSENT_VERSAO.termos]]);
  assert.ok(rows.every((r) => r.aceito_em > 0 && r.ip_hash && !String(r.ip_hash).includes("10.0.")), "IP nunca puro");
  // sem aceite não há conta
  const inv = (await convite(env, d.cookie)).data;
  const sem = await registrar(env, cadastro(inv, "Sem Aceite", { aceite: undefined }));
  assert.equal(sem.status, 400); assert.equal(sem.data.code, "aceite");
  // a versão dos termos mudou (simulado): a API pede o aceite; conta, exportar e aceitar continuam
  env.DB.raw.prepare("UPDATE consent SET versao = 'velha' WHERE user_id = ?1 AND doc = 'termos'").run(uid);
  const bloq = await as(env, ana.cookie, "GET", "/api/state?date=2026-11-14");
  assert.equal(bloq.status, 403); assert.equal(bloq.data.code, "aceite");
  const acc = await as(env, ana.cookie, "GET", "/api/account");
  assert.equal(acc.status, 200); assert.equal(acc.data.aceitePendente, true);
  assert.equal((await as(env, ana.cookie, "GET", "/api/account/export")).status, 200);
  assert.equal((await as(env, ana.cookie, "POST", "/api/account/consent", { termos: "velha", privacidade: CONSENT_VERSAO.privacidade })).status, 400);
  assert.equal((await as(env, ana.cookie, "POST", "/api/account/consent", { ...CONSENT_VERSAO })).status, 200);
  assert.equal((await as(env, ana.cookie, "GET", "/api/state?date=2026-11-14")).status, 200);
  assert.ok((await as(env, ana.cookie, "GET", "/api/account/export")).data.consent.length >= 2, "aceites no export");
});

test("Conta → Perfil edita nome, sobrenome, sexo, nascimento, altura e peso; #privacidade traz o controlador sem estar no repositório", async () => {
  const env = envConta();
  const d = await dono(env);
  const r = await as(env, d.cookie, "PATCH", "/api/account/perfil", { sobrenome: "Exemplo", sexo: "nao_informado", nascimento: "1990-05-01", alturaCm: 170, pesoKg: 68.5 });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.data.perfil, { nome: "Dona Fictícia", sobrenome: "Exemplo", sexo: "nao_informado", nascimento: "1990-05-01", alturaCm: 170, pesoKg: 68.5 });
  assert.equal((await as(env, d.cookie, "PATCH", "/api/account/perfil", { sexo: "x" })).status, 400);
  assert.equal((await as(env, d.cookie, "PATCH", "/api/account/perfil", { pesoKg: null })).data.perfil.pesoKg, null);
  const legal = await call(env, "GET", "/auth/legal");
  assert.equal(legal.status, 200); assert.deepEqual(legal.data.controlador, { nome: "Dona Fictícia Exemplo", email: DONO_EMAIL });
  assert.deepEqual(legal.data.versoes, CONSENT_VERSAO);
});
