// #165 Vagas por fase no Worker: teto da fase (50 + dono), convite pendente reserva, vencido/revogado devolve sem cron,
// criação atômica (duas na última vaga: só uma passa), fase fechada, rotas do dono (403/400/Face ID) e 51 contas.
// Tudo fictício (e-mails @exemplo.com, nomes inventados); D1 falso com as migrations de verdade.
import { test } from "node:test";
import assert from "node:assert/strict";
import { call } from "./fakes.ts";
import { cadastro, contaPorConvite, convite, dono, entrar, envConta, registrar } from "./conta-helpers.ts";

const as = (env: any, cookie: string, m: string, p: string, body?: unknown) => call(env, m, p, { user: cookie, body });
const n = (env: any, sql: string) => env.DB.raw.prepare(sql).get().n as number;
let fict = 0;
/** Contas não-dono fictícias direto no banco (o fluxo de passkey tem teste próprio; aqui só a contagem importa). */
function encher(env: any, qtd: number, fase: string | null = null) {
  const st = env.DB.raw.prepare("INSERT INTO user (id, email, name, role, created_at, fase_id) VALUES (?, ?, ?, 'user', ?, ?)");
  for (let i = 0; i < qtd; i++) { fict++; st.run(`u-ficticia-${fict}`, `ficticia${fict}@exemplo.com`, `Pessoa ${fict}`, Date.now(), fase); }
}
const people = async (env: any, cookie: string) => (await as(env, cookie, "GET", "/api/account/people")).data;

test("migration: fase piloto-2027 semeada (teto 50, aberta, cotas de hoje); convites e contas ganham fase_id", () => {
  const env = envConta();
  const f = env.DB.raw.prepare("SELECT * FROM fase").all();
  assert.equal(f.length, 1);
  assert.deepEqual([f[0].id, f[0].nome, f[0].teto, f[0].aberta, f[0].cota_escritas_dia, f[0].cota_r2_mb, f[0].fim_testes], ["piloto-2027", "Piloto 2027", 50, 1, 2000, 500, null]);
  assert.match(f[0].inicio, /^\d{4}-\d{2}-\d{2}$/);
  for (const t of ["invites", "user"]) assert.ok(env.DB.raw.prepare(`PRAGMA table_info(${t})`).all().some((c: any) => c.name === "fase_id"), `${t}.fase_id`);
});

test("50 contas não-dono + o dono = 51, cheio: convite e a 52ª criação dão 409 sem_vagas; contas antigas contam", async () => {
  const env = envConta();
  const d = await dono(env);
  encher(env, 20); // contas de antes do piloto (sem fase) também ocupam vaga: o teto é de custo
  encher(env, 28, "piloto-2027");
  const a = await contaPorConvite(env, d.cookie, "Ana Fictícia"); // 49ª: nasce com a fase do convite
  assert.equal(env.DB.raw.prepare("SELECT fase_id FROM user WHERE name = 'Ana Fictícia'").get().fase_id, "piloto-2027");
  assert.equal(env.DB.raw.prepare("SELECT fase_id FROM user WHERE role = 'owner'").get().fase_id, null, "o dono fica fora da fase");
  const ultima = await convite(env, d.cookie);
  assert.equal(ultima.status, 201);
  assert.equal(env.DB.raw.prepare("SELECT fase_id FROM invites WHERE id = ?").get(ultima.data.id).fase_id, "piloto-2027");
  const p = await people(env, d.cookie);
  assert.deepEqual([p.vagas.usadas, p.vagas.teto, p.vagas.pendentes, p.vagas.cheio], [50, 50, 1, true], "49 contas + 1 pendente = cheio");
  assert.match(p.motivo, /^Sem vagas na fase Piloto 2027/);
  const recusado = await convite(env, d.cookie);
  assert.equal(recusado.status, 409); assert.equal(recusado.data.code, "sem_vagas"); assert.match(recusado.data.error, /sem vagas na fase Piloto 2027/);
  assert.equal((await registrar(env, cadastro(ultima.data, "Quinquagésima"))).status, 201, "o convite pendente tinha a vaga reservada");
  assert.equal(n(env, "SELECT COUNT(*) n FROM user"), 51);
  assert.equal(n(env, "SELECT COUNT(*) n FROM user WHERE role != 'owner'"), 50);
  // a 52ª: convite emitido antes de o teto baixar (dono subiu para 51, emitiu, voltou para 50)
  assert.equal((await as(env, d.cookie, "PATCH", "/api/account/fases/piloto-2027", { teto: 51 })).status, 200);
  const extra = (await convite(env, d.cookie)).data;
  assert.equal((await as(env, d.cookie, "PATCH", "/api/account/fases/piloto-2027", { teto: 50 })).status, 200);
  const r52 = await registrar(env, cadastro(extra, "Quinquagésima primeira"));
  assert.equal(r52.status, 409); assert.equal(r52.data.code, "sem_vagas");
  assert.equal(n(env, "SELECT COUNT(*) n FROM user"), 51);
  assert.equal(n(env, "SELECT COUNT(*) n FROM invites WHERE used_at IS NULL AND user_id IS NULL"), 1, "o convite recusado não foi gasto");
  // reset de acesso não ocupa vaga: funciona mesmo cheio
  assert.equal((await as(env, d.cookie, "POST", `/api/account/people/${encodeURIComponent(env.DB.raw.prepare("SELECT id FROM user WHERE name = 'Ana Fictícia'").get().id)}/reset`, {})).status, 201);
  assert.equal((await people(env, d.cookie)).vagas.usadas, 51, "50 contas + 1 pendente de conta nova; o reset não conta");
  void a;
});

test("convite pendente reserva; vencido (relógio falso) e revogado devolvem a vaga, sem cron", async (t) => {
  const env = envConta();
  const d = await dono(env);
  assert.equal((await as(env, d.cookie, "PATCH", "/api/account/fases/piloto-2027", { teto: 3 })).status, 200);
  encher(env, 1);
  const c1 = await convite(env, d.cookie), c2 = await convite(env, d.cookie);
  assert.equal(c1.status, 201); assert.equal(c2.status, 201);
  assert.equal((await convite(env, d.cookie)).status, 409, "1 conta + 2 pendentes = 3 de 3");
  assert.equal((await as(env, d.cookie, "DELETE", `/api/account/invites/${c1.data.id}`)).status, 200);
  assert.equal((await convite(env, d.cookie)).status, 201, "revogar devolveu a vaga");
  assert.equal((await convite(env, d.cookie)).status, 409);
  // relógio falso: 7 dias e 1 h depois os pendentes venceram (nenhuma limpeza rodou; a contagem é por consulta)
  const real = Date.now(), depois = real + 7 * 86_400_000 + 3_600_000;
  t.mock.method(Date, "now", () => depois);
  const novo = await entrar(env, d.auth); // a sessão travou (app fechado > 7 dias): entra de novo com o Face ID
  assert.equal(novo.status, 200);
  assert.equal((await people(env, novo.cookie)).vagas.usadas, 1, "vencidos não contam");
  assert.equal((await convite(env, novo.cookie)).status, 201, "o vencido devolveu a vaga");
  assert.equal(n(env, "SELECT COUNT(*) n FROM invites WHERE used_at IS NULL"), 3, "nada foi apagado: só deixou de contar");
});

test("duas criações simultâneas na última vaga (Promise.all): só uma passa", async () => {
  const env = envConta();
  const d = await dono(env);
  assert.equal((await as(env, d.cookie, "PATCH", "/api/account/fases/piloto-2027", { teto: 3 })).status, 200);
  encher(env, 1);
  const [x, y] = [(await convite(env, d.cookie)).data, (await convite(env, d.cookie)).data];
  assert.equal((await as(env, d.cookie, "PATCH", "/api/account/fases/piloto-2027", { teto: 2 })).status, 200); // sobra 1 vaga para 2 convites
  const [rx, ry] = await Promise.all([registrar(env, cadastro(x, "Xênia Fictícia")), registrar(env, cadastro(y, "Yara Fictícia"))]);
  assert.deepEqual([rx.status, ry.status].sort(), [201, 409]);
  assert.equal([rx, ry].find((r) => r.status === 409)!.data.code, "sem_vagas");
  assert.equal(n(env, "SELECT COUNT(*) n FROM user WHERE role != 'owner'"), 2);
  assert.equal(n(env, "SELECT COUNT(*) n FROM invites WHERE used_at IS NOT NULL"), 1, "só um convite foi gasto");
});

test("fase fechada recusa convite novo; o convite antigo ainda cria a conta; a próxima fase reabre", async () => {
  const env = envConta();
  const d = await dono(env);
  const antigo = (await convite(env, d.cookie)).data;
  const fechou = await as(env, d.cookie, "PATCH", "/api/account/fases/piloto-2027", { aberta: false, fimTestes: "2099-06-30" });
  assert.equal(fechou.status, 200); assert.equal(fechou.data.fase.aberta, false); assert.equal(fechou.data.fase.fimTestes, "2099-06-30");
  const r = await convite(env, d.cookie);
  assert.equal(r.status, 409); assert.equal(r.data.code, "fase_fechada");
  assert.match((await people(env, d.cookie)).motivo, /fase Piloto 2027 está fechada/);
  assert.equal((await registrar(env, cadastro(antigo, "Antiga Fictícia"))).status, 201, "a vaga já estava prometida");
  const nova = await as(env, d.cookie, "POST", "/api/account/fases", { nome: "Turma 2", teto: 80 });
  assert.equal(nova.status, 201); assert.equal(nova.data.fase.id, "turma-2"); assert.equal(nova.data.fase.cotaEscritasDia, 2000, "cotas copiadas da fase anterior");
  assert.equal((await as(env, d.cookie, "POST", "/api/account/fases", { nome: "Turma 2", teto: 10 })).status, 409, "nome repetido");
  const inv = await convite(env, d.cookie);
  assert.equal(inv.status, 201);
  assert.equal(env.DB.raw.prepare("SELECT fase_id FROM invites WHERE id = ?").get(inv.data.id).fase_id, "turma-2");
  const lista = await as(env, d.cookie, "GET", "/api/account/fases");
  assert.equal(lista.status, 200); assert.equal(lista.data.vigente, "turma-2"); assert.deepEqual(lista.data.fases.map((f: any) => f.id), ["turma-2", "piloto-2027"]);
  assert.equal((await people(env, d.cookie)).fase.nome, "Turma 2");
});

test("MAX_USERS virou trava de emergência que só abaixa", async () => {
  const env = envConta({ MAX_USERS: "1" });
  const d = await dono(env);
  assert.equal((await people(env, d.cookie)).vagas.teto, 1);
  assert.equal((await convite(env, d.cookie)).status, 201);
  assert.equal((await convite(env, d.cookie)).status, 409);
  const alto = envConta({ MAX_USERS: "900" });
  const d2 = await dono(alto);
  assert.equal((await people(alto, d2.cookie)).vagas.teto, 50, "não sobe acima da fase");
  assert.equal((await call(alto, "GET", "/auth/status")).data.vagas.texto, "0 de 50 vagas", "#entrar mostra as vagas da fase");
});

test("rotas de fase: não-dono → 403; teto 501 → 400; sem Face ID recente → recusa; id desconhecido → 404", async () => {
  const env = envConta();
  const d = await dono(env);
  const a = await contaPorConvite(env, d.cookie, "Ana Fictícia");
  for (const [m, p, b] of [["GET", "/api/account/fases"], ["POST", "/api/account/fases", { nome: "Invasão", teto: 5 }], ["PATCH", "/api/account/fases/piloto-2027", { teto: 500 }]] as const) {
    assert.equal((await as(env, a.cookie, m, p, b)).status, 403, `${m} ${p} de não-dono`);
  }
  assert.equal(env.DB.raw.prepare("SELECT teto FROM fase WHERE id = 'piloto-2027'").get().teto, 50, "a não-dona não mudou nada");
  assert.equal(n(env, "SELECT COUNT(*) n FROM fase"), 1);
  for (const teto of [501, 0, 2.5, "50"]) assert.equal((await as(env, d.cookie, "PATCH", "/api/account/fases/piloto-2027", { teto })).status, 400, `teto ${teto}`);
  assert.equal((await as(env, d.cookie, "POST", "/api/account/fases", { nome: "x".repeat(41), teto: 5 })).status, 400, "nome de 41");
  assert.equal((await as(env, d.cookie, "PATCH", "/api/account/fases/piloto-2027", { fimTestes: "2026-02-30" })).status, 400, "data inválida");
  assert.equal((await as(env, d.cookie, "PATCH", "/api/account/fases/nao-existe", { teto: 5 })).status, 404);
  env.DB.raw.prepare("UPDATE sessions SET reauth_at = 1 WHERE user_id = (SELECT id FROM user WHERE role = 'owner')").run();
  for (const [m, p, b] of [["GET", "/api/account/fases"], ["POST", "/api/account/fases", { nome: "Turma 3", teto: 5 }], ["PATCH", "/api/account/fases/piloto-2027", { teto: 40 }]] as const) {
    const r = await as(env, d.cookie, m, p, b);
    assert.equal(r.status, 403, `${m} ${p} sem Face ID`); assert.equal(r.data.code, "reauth");
  }
  assert.equal(env.DB.raw.prepare("SELECT teto FROM fase WHERE id = 'piloto-2027'").get().teto, 50);
});

test("isolamento com 51 contas: só o dono vê pessoas e fases; a resposta tem só nome, papel e datas", async () => {
  const env = envConta();
  const d = await dono(env);
  encher(env, 48);
  const a = await contaPorConvite(env, d.cookie, "Ana Fictícia");
  const b = await contaPorConvite(env, d.cookie, "Bia Fictícia");
  env.DB.raw.prepare("UPDATE user SET peso_kg = 77.7, altura_cm = 199, nascimento = '1990-01-02' WHERE name = 'Bia Fictícia'").run();
  assert.equal(n(env, "SELECT COUNT(*) n FROM user"), 51);
  for (const c of [a.cookie, b.cookie]) {
    for (const [m, p, body] of [["GET", "/api/account/people"], ["GET", "/api/account/fases"], ["POST", "/api/account/fases", { nome: "X", teto: 5 }], ["PATCH", "/api/account/fases/piloto-2027", { aberta: false }], ["POST", "/api/account/invites", { email: "z@exemplo.com", nome: "Z" }]] as const) {
      assert.equal((await as(env, c, m, p, body)).status, 403, `${m} ${p}`);
    }
  }
  const p = await as(env, d.cookie, "GET", "/api/account/people");
  assert.equal(p.data.people.length, 51, "a lista não corta em 50");
  for (const pp of p.data.people) assert.deepEqual(Object.keys(pp).sort(), ["createdAt", "eu", "id", "lastSeenAt", "nome", "role"]);
  assert.ok(!/77\.7|199|1990-01-02|@exemplo/.test(p.text), "nenhum dado de saúde nem e-mail de conta");
  assert.equal(p.data.vagas.texto, "50 de 50 vagas");
});
