// #54/#62 Conta própria: bootstrap do dono (código + OWNER_EMAIL), convite amarrado ao e-mail (usado/expirado/forjado/outro e-mail),
// teto de 10 contas, login por passkey (ES256/RS256, assinatura/origem/contador), cookie __Host- de 30 dias (teto de 180),
// "Sair de todos", recuperação, reset de acesso e limite em /auth/*.
import { test } from "node:test";
import assert from "node:assert/strict";
import { AUTH_LIMIT } from "../src/auth-conta.ts";
import { call, makeEnv, mcp } from "./fakes.ts";
import { CAD, DONO_EMAIL, ORIGEM, SETUP, cadastro, contaPorConvite, convite, cookieDe, dono, entrar, envConta, ip, registrar } from "./conta-helpers.ts";
import { assinar } from "../../../packages/core/test/fake-autenticador.ts";

const as = (env: any, cookie: string, m: string, p: string, body?: unknown) => call(env, m, p, { user: cookie, body });

test("bootstrap (#62): o dono nasce só com o OWNER_SETUP_CODE E o e-mail do OWNER_EMAIL; o código é sempre pedido; fecha para sempre", async () => {
  const env = envConta();
  assert.equal((await call(env, "GET", "/auth/status")).data.bootstrap, true);
  const base = { email: DONO_EMAIL, nome: "Dona", ...CAD };
  assert.equal((await registrar(env, { ...base, setup: "errado-errado-errado" })).status, 403);
  assert.equal((await registrar(env, { ...base, setup: "" })).data.code, "setup_errado", "sem código, sem Face ID");
  assert.equal((await registrar(env, { ...base, setup: SETUP, email: "outra@exemplo.com" })).data.code, "setup_errado", "e-mail diferente do OWNER_EMAIL");
  assert.equal((await registrar(env, { ...base, setup: SETUP, sexo: undefined })).status, 400, "sexo obrigatório");
  assert.equal((await registrar(env, { ...base, setup: SETUP, aceite: false })).data.code, "aceite", "aceite obrigatório");
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) n FROM auth_challenge").get().n, 0, "nenhuma cerimônia de Face ID começou sem o código");
  const d = await dono(env);
  assert.equal(d.codigos!.length, 8); assert.match(d.codigos![0], /^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{2}$/);
  const me = await as(env, d.cookie, "GET", "/api/account");
  assert.equal(me.data.account.role, "owner"); assert.equal(me.data.account.name, "Dona Fictícia"); assert.equal(me.data.account.email, DONO_EMAIL);
  assert.equal(me.data.account.sobrenome, "Fictícia"); assert.equal(me.data.account.sexo, "feminino");
  assert.equal((await call(env, "GET", "/auth/status")).data.bootstrap, false);
  assert.equal((await registrar(env, { ...base, setup: SETUP, nome: "Intrusa" })).status, 403, "bootstrap fechado");
  assert.equal((await call(makeEnv({ DEV_NO_AUTH: undefined, OWNER_SETUP_CODE: "curto", OWNER_EMAIL: DONO_EMAIL }), "GET", "/auth/status")).data.bootstrap, false, "código curto não abre");
  assert.equal((await call(makeEnv({ DEV_NO_AUTH: undefined, OWNER_SETUP_CODE: SETUP }), "GET", "/auth/status")).data.bootstrap, false, "sem OWNER_EMAIL não abre");
});

test("convite: forjado, usado, expirado e de outro e-mail são recusados; só o dono cria", async () => {
  const env = envConta();
  const d = await dono(env);
  assert.equal((await registrar(env, cadastro({ codigo: "ABCD-EFGH-JKMN-PQRS", email: "x@exemplo.com" }, "Forja"))).status, 404, "forjado");
  assert.equal((await registrar(env, cadastro({ codigo: "<script>", email: "x@exemplo.com" }, "Forja"))).status, 404, "lixo");
  assert.equal((await call(env, "POST", "/api/account/invites", { user: d.cookie, body: { nome: "Sem e-mail" } })).status, 400, "convite sem e-mail");
  const inv = (await convite(env, d.cookie, { nome: "Ana" })).data;
  assert.match(inv.link, /\/#convite\/[0-9A-Z]{4}-/);
  assert.ok(!JSON.stringify(env.DB.raw.prepare("SELECT * FROM invites").all()).includes(inv.codigo.replace(/-/g, "")), "só hash no banco");
  const prev = await call(env, "POST", "/auth/convite", { body: { convite: inv.codigo }, headers: ip() });
  assert.deepEqual([prev.data.nome, prev.data.email, prev.data.por, prev.data.reset], ["Ana", inv.email, "Dona Fictícia", false], "boas-vindas com quem convidou");
  const outro = await registrar(env, cadastro({ ...inv, email: "intrusa@exemplo.com" }, "Intrusa"));
  assert.equal(outro.status, 403); assert.equal(outro.data.code, "convite_email", "e-mail diferente do convite");
  const a = await registrar(env, cadastro(inv, "Ana Fictícia"));
  assert.equal(a.status, 201);
  assert.equal((await as(env, a.cookie, "GET", "/api/account")).data.account.email, inv.email, "e-mail vem do convite");
  const de_novo = await registrar(env, cadastro(inv, "Outra"));
  assert.equal(de_novo.status, 410); assert.equal(de_novo.data.code, "convite_usado");
  assert.equal((await call(env, "POST", "/auth/convite", { body: { convite: inv.codigo }, headers: ip() })).status, 410);
  const velho = (await convite(env, d.cookie)).data;
  env.DB.raw.prepare("UPDATE invites SET expires_at = 1 WHERE id = ?").run(velho.id);
  const exp = await registrar(env, cadastro(velho, "Tarde"));
  assert.equal(exp.status, 410); assert.equal(exp.data.code, "convite_expirado");
  // convite válido nas opções, mas usado por outra aba antes de terminar: o registro final também recusa
  const corrida = (await convite(env, d.cookie)).data;
  const opt = await call(env, "POST", "/auth/register/options", { body: cadastro(corrida, "Corrida"), headers: ip() });
  assert.equal((await registrar(env, cadastro(corrida, "Primeira"))).status, 201);
  const { criar, novoAutenticador } = await import("../../../packages/core/test/fake-autenticador.ts");
  const cred = await criar(await novoAutenticador(), { ...ORIGEM, challenge: opt.data.options.challenge });
  assert.equal((await call(env, "POST", "/auth/register", { body: { challengeId: opt.data.challengeId, credential: cred }, headers: ip() })).status, 410);
  assert.equal((await as(env, a.cookie, "POST", "/api/account/invites", { email: "z@exemplo.com", nome: "Z" })).status, 403, "user não convida");
});

test("teto: a 11ª conta é recusada pelo servidor (convite e criação), e MAX_USERS nunca passa de 10", async () => {
  const env = envConta({ MAX_USERS: "50" });
  const d = await dono(env);
  for (let i = 2; i <= 9; i++) await contaPorConvite(env, d.cookie, `Pessoa ${i}`);
  const p = await as(env, d.cookie, "GET", "/api/account/people");
  assert.equal(p.data.vagas.texto, "9 de 10 vagas");
  assert.equal((await call(env, "GET", "/auth/status")).data.vagas.texto, "9 de 10 vagas", "#entrar mostra as vagas");
  const [x, y] = [(await convite(env, d.cookie)).data, (await convite(env, d.cookie)).data]; // dois convites com 1 vaga
  assert.equal((await registrar(env, cadastro(x, "Décima"))).status, 201);
  const onze = await registrar(env, cadastro(y, "Décima primeira"));
  assert.equal(onze.status, 409); assert.equal(onze.data.code, "sem_vagas");
  assert.equal((await convite(env, d.cookie)).status, 409, "com 10 contas nem o convite nasce");
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) n FROM user").get().n, 10);
  // corrida no registro final: opções pegas com vaga, mas a vaga acabou antes de terminar
  const env3 = envConta({ MAX_USERS: "2" });
  const d3 = await dono(env3);
  const [c1, c2] = [(await convite(env3, d3.cookie)).data, (await convite(env3, d3.cookie)).data];
  const opt = await call(env3, "POST", "/auth/register/options", { body: cadastro(c2, "Atrasada"), headers: ip() });
  assert.equal(opt.status, 200);
  assert.equal((await registrar(env3, cadastro(c1, "Primeira"))).status, 201);
  const { criar, novoAutenticador } = await import("../../../packages/core/test/fake-autenticador.ts");
  const cred = await criar(await novoAutenticador(), { ...ORIGEM, challenge: opt.data.options.challenge });
  const r = await call(env3, "POST", "/auth/register", { body: { challengeId: opt.data.challengeId, credential: cred }, headers: ip() });
  assert.equal(r.status, 409); assert.equal(env3.DB.raw.prepare("SELECT COUNT(*) n FROM user").get().n, 2);
  assert.equal(env3.DB.raw.prepare("SELECT COUNT(*) n FROM invites WHERE used_at IS NULL").get().n, 1, "convite não foi gasto");
});

test("login por passkey (ES256 e RS256): cookie __Host- HttpOnly Secure de 30 dias; só o hash no banco", async () => {
  const env = envConta();
  const d = await dono(env);
  for (const alg of ["ES256", "RS256"] as const) {
    const c = await contaPorConvite(env, d.cookie, `Conta ${alg}`, alg);
    const r = await entrar(env, c.auth);
    assert.equal(r.status, 200, r.text);
    const sc = r.headers.get("set-cookie")!;
    assert.match(sc, /^__Host-ciclo=[0-9a-f]{64}; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000$/);
    assert.equal((await as(env, r.cookie, "GET", "/api/account")).data.account.name, `Conta ${alg}`);
    const val = r.cookie.split("=")[1];
    assert.ok(!JSON.stringify(env.DB.raw.prepare("SELECT * FROM sessions").all()).includes(val));
  }
  const sem = await call(env, "GET", "/api/state?date=2026-11-13");
  assert.equal(sem.status, 401); assert.equal(sem.data.code, "entrar");
});

test("login recusado: assinatura de outra chave, origem/rpId errados, desafio reusado, contador voltando", async () => {
  const env = envConta();
  const d = await dono(env);
  const c = await contaPorConvite(env, d.cookie, "Ana Fictícia");
  assert.equal((await entrar(env, c.auth, { origin: "https://phishing.exemplo" })).status, 401);
  assert.equal((await entrar(env, c.auth, { rpId: "phishing.exemplo" })).status, 401);
  assert.equal((await entrar(env, c.auth, { flags: 0x01 })).status, 401, "sem verificação do usuário (Face ID)");
  const outra = await contaPorConvite(env, d.cookie, "Bia Fictícia");
  const trocado = { ...outra.auth, credId: c.auth.credId }; // assina com a chave da Bia fingindo ser a passkey da Ana
  assert.equal((await entrar(env, trocado)).status, 401);
  // desafio é de uso único
  const opt = await call(env, "POST", "/auth/login/options", { body: {}, headers: ip() });
  const cred = await assinar(c.auth, { ...ORIGEM, challenge: opt.data.options.challenge });
  assert.equal((await call(env, "POST", "/auth/login", { body: { challengeId: opt.data.challengeId, credential: cred }, headers: ip() })).status, 200);
  assert.equal((await call(env, "POST", "/auth/login", { body: { challengeId: opt.data.challengeId, credential: cred }, headers: ip() })).status, 400);
  // contador: autenticador que conta e depois "volta" (clone)
  env.DB.raw.prepare("UPDATE passkeys SET counter = 50 WHERE user_id = (SELECT id FROM user WHERE name = 'Ana Fictícia')").run();
  c.auth.counter = 10;
  assert.equal((await entrar(env, c.auth)).status, 401);
  c.auth.counter = 60;
  assert.equal((await entrar(env, c.auth)).status, 200);
});

test("Sair de todos: sessão roubada deixa de valer; a outra conta segue", async () => {
  const env = envConta();
  const d = await dono(env);
  const a = await contaPorConvite(env, d.cookie, "Ana Fictícia");
  const b = await contaPorConvite(env, d.cookie, "Bia Fictícia");
  const roubada = (await entrar(env, a.auth)).cookie;
  assert.equal((await as(env, roubada, "GET", "/api/account")).status, 200);
  const dev = (await as(env, a.cookie, "GET", "/api/account/devices")).data;
  assert.equal(dev.sessions.length, 2); assert.equal(dev.sessions.filter((s: any) => s.atual).length, 1); assert.equal(dev.codigosRestantes, 8);
  const r = await as(env, a.cookie, "POST", "/api/account/logout-all", {});
  assert.equal(r.status, 200); assert.match(r.headers.get("set-cookie")!, /Max-Age=0/);
  assert.equal((await as(env, roubada, "GET", "/api/account")).status, 401);
  assert.equal((await as(env, a.cookie, "GET", "/api/account")).status, 401);
  assert.equal((await as(env, b.cookie, "GET", "/api/account")).status, 200, "a Bia continua");
  // sair só deste aparelho
  const n1 = (await entrar(env, a.auth)).cookie, n2 = (await entrar(env, a.auth)).cookie;
  const outra = (await as(env, n1, "GET", "/api/account/devices")).data.sessions.find((s: any) => !s.atual);
  assert.equal((await as(env, n1, "DELETE", `/api/account/sessions/${outra.id}`)).status, 200);
  assert.equal((await as(env, n2, "GET", "/api/account")).status, 401);
  assert.equal((await call(env, "POST", "/auth/logout", { user: n1, body: {} })).status, 200);
  assert.equal((await as(env, n1, "GET", "/api/account")).status, 401);
});

test("sessão (#62): deslizante de 30 dias, teto de 180 desde o login; vencida = 401", async () => {
  const env = envConta();
  const d = await dono(env);
  env.DB.raw.prepare("UPDATE sessions SET expires_at = ?").run(Date.now() + 10 * 86_400_000);
  const r = await as(env, d.cookie, "GET", "/api/account");
  assert.match(r.headers.get("set-cookie") ?? "", /Max-Age=259(19|20)\d\d/);
  assert.ok(env.DB.raw.prepare("SELECT expires_at FROM sessions").get().expires_at > Date.now() + 29 * 86_400_000);
  // perto do teto: renova só até 180 dias desde o login
  env.DB.raw.prepare("UPDATE sessions SET created_at = ?, expires_at = ?").run(Date.now() - 175 * 86_400_000, Date.now() + 86_400_000);
  await as(env, d.cookie, "GET", "/api/account");
  assert.ok(env.DB.raw.prepare("SELECT expires_at FROM sessions").get().expires_at <= Date.now() + 5 * 86_400_000 + 1000, "não passa do teto");
  env.DB.raw.prepare("UPDATE sessions SET created_at = ?, expires_at = ?").run(Date.now() - 181 * 86_400_000, Date.now() + 86_400_000);
  assert.equal((await as(env, d.cookie, "GET", "/api/account")).status, 401, "passou de 180 dias");
  env.DB.raw.prepare("UPDATE sessions SET created_at = ?, expires_at = ?").run(Date.now(), Date.now() - 1);
  assert.equal((await as(env, d.cookie, "GET", "/api/account")).status, 401);
});

test("recuperação: código vale uma vez, só hash no banco; 2ª passkey e apagar a última é recusado", async () => {
  const env = envConta();
  const d = await dono(env);
  const a = await contaPorConvite(env, d.cookie, "Ana Fictícia");
  const code = a.codigos![3];
  assert.ok(!JSON.stringify(env.DB.raw.prepare("SELECT * FROM recovery_codes").all()).includes(code.replace(/-/g, "")));
  const r = await call(env, "POST", "/auth/recover", { body: { codigo: code.toLowerCase() }, headers: ip() });
  assert.equal(r.status, 200); assert.equal(r.data.restantes, 7);
  const ck = cookieDe(r);
  assert.equal((await as(env, ck, "GET", "/api/account")).data.account.name, "Ana Fictícia");
  assert.equal((await call(env, "POST", "/auth/recover", { body: { codigo: code }, headers: ip() })).status, 401, "uso único");
  // 2ª passkey (Mac) a partir da sessão
  const pks = (await as(env, ck, "GET", "/api/account/devices")).data.passkeys;
  assert.equal((await as(env, ck, "DELETE", `/api/account/passkeys/${pks[0].id}`)).status, 409, "única passkey");
  const mac = await registrar(env, {}, { cookie: ck });
  assert.equal(mac.status, 201); assert.equal(mac.codigos, undefined);
  assert.equal((await entrar(env, mac.auth)).status, 200);
  assert.equal((await as(env, ck, "DELETE", `/api/account/passkeys/${pks[0].id}`)).status, 200);
  assert.equal((await entrar(env, a.auth)).status, 401, "passkey apagada não entra");
  assert.equal((await registrar(env, {})).status, 401, "adicionar passkey exige estar logado");
  // #62: ver códigos novos pede Face ID; a sessão do código de recuperação não teve Face ID
  const semFace = await as(env, ck, "POST", "/api/account/recovery-codes", {});
  assert.equal(semFace.status, 403); assert.equal(semFace.data.code, "reauth");
  const comFace = (await entrar(env, mac.auth)).cookie;
  const novos = await as(env, comFace, "POST", "/api/account/recovery-codes", {});
  assert.equal(novos.status, 201); assert.equal(novos.data.codigos.length, 8);
  assert.equal((await call(env, "POST", "/auth/recover", { body: { codigo: a.codigos![0] }, headers: ip() })).status, 401, "códigos antigos morrem");
});

test("dono: pessoas sem dado de saúde; resetar acesso derruba sessões e passkey, mantém os dados", async () => {
  const env = envConta();
  const d = await dono(env);
  const b = await contaPorConvite(env, d.cookie, "Bia Fictícia");
  await as(env, b.cookie, "POST", "/api/pains", { region: "ombro_e", intensity: 2, context: "MARCA_SAUDE" });
  await as(env, b.cookie, "PUT", "/api/checkin/2026-11-13", { sleepH: 7, energy: 2, soreness: 1, stress: 2, food: 0, note: "MARCA_SAUDE" });
  const tok = (await as(env, b.cookie, "POST", "/api/account/tokens", { label: "x" })).data.token;
  const pp = await as(env, d.cookie, "GET", "/api/account/people");
  assert.equal(pp.status, 200); assert.ok(!pp.text.includes("MARCA_SAUDE")); assert.ok(!pp.text.includes("@"));
  const bia = pp.data.people.find((p: any) => p.nome === "Bia Fictícia");
  assert.deepEqual(Object.keys(bia).sort(), ["createdAt", "eu", "id", "lastSeenAt", "nome", "role"]);
  const reset = await as(env, d.cookie, "POST", `/api/account/people/${bia.id}/reset`, {});
  assert.equal(reset.status, 201);
  assert.equal((await as(env, b.cookie, "GET", "/api/account")).status, 401, "sessão antiga caiu");
  const nova = await registrar(env, { convite: reset.data.codigo });
  assert.equal(nova.status, 201); assert.equal(nova.codigos!.length, 8);
  assert.equal((await entrar(env, b.auth)).status, 401, "passkey antiga não vale");
  const exp = (await as(env, nova.cookie, "GET", "/api/account/export")).data;
  assert.equal(exp.user.id, bia.id); assert.equal(exp.pain.length, 1, "dados ficaram");
  assert.equal((await mcp(env, tok, "ciclo_estado")).status, 401, "reset revoga os tokens do Claude dela");
  assert.equal((await as(env, d.cookie, "POST", `/api/account/people/${pp.data.people.find((p: any) => p.eu).id}/reset`, {})).status, 400);
});

test("a dona não apaga a própria conta enquanto houver outras; o convite em andamento não guarda o código", async () => {
  const env = envConta();
  const d = await dono(env);
  const inv = (await convite(env, d.cookie)).data;
  await call(env, "POST", "/auth/register/options", { body: cadastro(inv, "Ana"), headers: ip() });
  assert.ok(!JSON.stringify(env.DB.raw.prepare("SELECT data FROM auth_challenge").all()).includes(inv.codigo.replace(/-/g, "")), "código puro no desafio");
  const a = await registrar(env, cadastro(inv, "Ana Fictícia"));
  assert.equal(a.status, 201, "convite continua válido pelo hash");
  const r = await as(env, d.cookie, "DELETE", "/api/account", { confirm: "APAGAR" });
  assert.equal(r.status, 409); assert.equal(r.data.code, "dona_com_contas");
  assert.equal((await as(env, a.cookie, "DELETE", "/api/account", { confirm: "APAGAR" })).status, 200);
  assert.equal((await as(env, d.cookie, "DELETE", "/api/account", { confirm: "APAGAR" })).status, 200, "sozinha, pode");
});

test("brute force em /auth/*: limite por IP → 429; outro IP segue", async () => {
  const env = envConta();
  const h = { "CF-Connecting-IP": "203.0.113.7" };
  let last = 0;
  for (let i = 0; i <= AUTH_LIMIT.max; i++) last = (await call(env, "POST", "/auth/recover", { body: { codigo: "AAAA-AAAA-AA" }, headers: h })).status;
  assert.equal(last, 429);
  assert.equal((await call(env, "POST", "/auth/recover", { body: { codigo: "AAAA-AAAA-AA" }, headers: { "CF-Connecting-IP": "203.0.113.8" } })).status, 401);
  assert.ok(!JSON.stringify(env.DB.raw.prepare("SELECT * FROM auth_rate_limit").all()).includes("203.0.113"), "IP nunca puro");
  assert.equal((await call(env, "POST", "/auth/login/options", { body: {}, headers: { Origin: "https://outro.exemplo" } })).status, 403, "origem");
});
