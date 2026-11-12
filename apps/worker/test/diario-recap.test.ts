// #42 Diário 2.0 no Worker: recap do fds/semana/mês pelo relógio do servidor (fuso America/Bahia, vira às 07:00),
// bebida → kcal na Comida sem duplicar, refeições que faltaram, texto livre (XSS fica como dado) e isolamento. Dados fictícios.
import { test } from "node:test";
import assert from "node:assert/strict";
import { call, makeEnv } from "./fakes.ts";

const FRI = "2026-11-13", SAT = "2026-11-14", SUN = "2026-11-15", MON = "2026-11-16";
const at = (iso: string) => Date.parse(`${iso}:00-03:00`);
const ok = async (p: Promise<{ status: number; text: string; data: any }>, st = 200) => { const r = await p; assert.ok(r.status >= st && r.status < 300, `${r.status} ${r.text}`); return r; };
const as = (env: any, user: string) => (m: string, p: string, body?: unknown) => call(env, m, p, { user, body });
const abrir = (env: any, user: string) => ok(call(env, "POST", "/api/diario/abrir", { user, body: { today: "ignorado" } }));
const food = async (c: ReturnType<typeof as>, d: string) => (await ok(c("GET", `/api/food?from=${d}&to=${d}`))).data.entries as any[];

test("segunda 07:00 depois de um fds sem abrir → recap do fds; 06:59 ainda não; abrir de novo não repete", async (t) => {
  const env = makeEnv(), now = t.mock.method(Date, "now", () => at(`${FRI}T10:00`));
  assert.equal((await abrir(env, "ana")).data.recap, null, "1º uso não pede");
  now.mock.mockImplementation(() => at(`${MON}T06:59`));
  assert.equal((await abrir(env, "ana")).data.recap, null, "antes das 07:00 ainda é domingo no diário");
  now.mock.mockImplementation(() => at(`${MON}T07:00`));
  const r = (await abrir(env, "ana")).data;
  assert.deepEqual(r.recap, { kind: "fds", from: FRI, to: SUN }); assert.equal(r.hoje, MON);
  assert.deepEqual((await abrir(env, "ana")).data.recap, { kind: "fds", from: FRI, to: SUN }, "fica até concluir ou pular");
  // pular este período
  await ok(call(env, "PUT", "/api/diario/lembrete", { user: "ana", body: { dismissAbsence: true } }));
  assert.equal((await abrir(env, "ana")).data.recap, null, "pulado não volta");
});

test("abriu no sábado e depois segunda 07:05 → recap do fds mesmo assim; 25 dias fora → mês", async (t) => {
  const env = makeEnv(), now = t.mock.method(Date, "now", () => at(`${SAT}T15:00`));
  await abrir(env, "ana");
  now.mock.mockImplementation(() => at(`${MON}T07:05`));
  assert.deepEqual((await abrir(env, "ana")).data.recap, { kind: "fds", from: FRI, to: SUN });
  const env2 = makeEnv();
  now.mock.mockImplementation(() => at("2026-10-22T09:00"));
  await abrir(env2, "bia");
  now.mock.mockImplementation(() => at(`${MON}T09:00`));
  assert.deepEqual((await abrir(env2, "bia")).data.recap, { kind: "mes", from: "2026-10-23", to: SUN });
});

test("fds todo registrado → confirmar com 1 toque (só o período) e a faixa some", async (t) => {
  const env = makeEnv(), c = as(env, "ana"), now = t.mock.method(Date, "now", () => at(`${FRI}T09:00`));
  await abrir(env, "ana");
  for (const d of [FRI, SAT, SUN]) await ok(c("PUT", `/api/checkout/${d}`, { alcohol: d === FRI ? 3 : 0, mood: 4 }));
  now.mock.mockImplementation(() => at(`${MON}T07:30`));
  assert.equal((await abrir(env, "ana")).data.recap.kind, "fds");
  await ok(c("POST", "/api/diario/recap", { from: FRI, to: SUN }));
  const d = (await ok(c("GET", `/api/diario?from=${FRI}&to=${MON}`))).data;
  assert.equal(d.reminder.recap, null);
  assert.deepEqual(d.checkouts.map((x: any) => [x.date, x.alcohol, x.source]), [[FRI, 3, "app"], [SAT, 0, "app"], [SUN, 0, "app"]], "confirmar não mexe em nada");
});

test("2 cervejas no recap → +300 kcal na Comida do dia, marcadas como bebida; regravar não duplica", async () => {
  const env = makeEnv(), c = as(env, "ana");
  await ok(c("POST", "/api/food", { date: SAT, text: "almoço: arroz e feijão (fictício)", meal: "almoco", kcal: 600 }), 201);
  const body = { from: FRI, to: SUN, dias: [{ date: SAT, alcool: { cerveja: 2 }, sleptWell: true, trained: false, cardio: { type: "Trail_Running_Walking", minutes: 60 } }] };
  const r = (await ok(c("POST", "/api/diario/recap", body))).data;
  assert.deepEqual(r.bebidaKcal, { [SAT]: 300 });
  await ok(c("POST", "/api/diario/recap", body)); // regravar
  const f = await food(c, SAT);
  const beb = f.filter((x) => /^Bebida:/.test(x.text));
  assert.equal(beb.length, 1, "um registro de bebida por dia");
  assert.equal(beb[0].kcal, 300); assert.equal(beb[0].text, "Bebida: 2 cervejas (lata)"); assert.equal(beb[0].meal, null);
  assert.equal(f.reduce((s, x) => s + (x.kcal ?? 0), 0), 900, "+300 no total do dia");
  const co = (await ok(c("GET", `/api/diario?from=${SAT}&to=${SAT}`))).data.checkouts[0];
  assert.equal(co.alcohol, 2); assert.equal(co.sleptWell, true); assert.equal(co.source, "resumo");
  // mudou de ideia: 1 taça de vinho → troca, não soma; 0 doses → some da Comida
  await ok(c("POST", "/api/diario/recap", { from: FRI, to: SUN, dias: [{ date: SAT, alcool: { vinho: 1 } }] }));
  assert.deepEqual((await food(c, SAT)).filter((x) => /^Bebida:/.test(x.text)).map((x) => x.kcal), [125]);
  await ok(c("POST", "/api/diario/recap", { from: FRI, to: SUN, dias: [{ date: SAT, alcool: {} }] }));
  assert.equal((await food(c, SAT)).filter((x) => /^Bebida:/.test(x.text)).length, 0);
});

test("refeições que faltaram: texto vira estimativa, 'não lembro' não fica zero, regravar não duplica; texto livre na nota", async () => {
  const env = makeEnv(), c = as(env, "ana");
  await ok(c("POST", "/api/food", { date: "2026-11-10", text: "jantar fictício", meal: "jantar", kcal: 800 }), 201);
  const body = { from: FRI, to: SUN, refeicoes: [{ date: SAT, meal: "almoco", text: "2 ovos e arroz" }, { date: SUN, meal: "jantar", naoLembro: true }], texto: "<img src=x onerror=alert(1)> churrasco" };
  await ok(c("POST", "/api/diario/recap", body));
  await ok(c("POST", "/api/diario/recap", body));
  const sat = await food(c, SAT), sun = await food(c, SUN);
  assert.equal(sat.length, 1); assert.equal(sat[0].meal, "almoco"); assert.ok(sat[0].kcal > 0);
  assert.equal(sun.length, 1); assert.equal(sun[0].kcal, 800, "estimativa = média da janta no histórico"); assert.match(sun[0].text, /Não lembro/);
  const note = (await ok(c("GET", `/api/diario?from=${SUN}&to=${SUN}`))).data.checkouts[0].note;
  assert.equal(note, "<img src=x onerror=alert(1)> churrasco", "texto livre é guardado como dado (a tela escapa) e não duplica");
  const bad = async (b: object, re: RegExp) => { const x = await c("POST", "/api/diario/recap", b); assert.equal(x.status, 400, x.text); assert.match(x.data.error, re); };
  await bad({ from: SUN, to: FRI }, /período/);
  await bad({ from: "2026-09-01", to: SUN }, /período/);
  await bad({ from: FRI, to: SUN, dias: [{ date: MON }] }, /fora do período/);
  await bad({ from: FRI, to: SUN, dias: [{ date: SAT, alcool: { cachaca: 2 } }] }, /tipo/);
  await bad({ from: FRI, to: SUN, dias: [{ date: SAT, alcool: { cerveja: 31 } }] }, /cerveja/);
  await bad({ from: FRI, to: SUN, refeicoes: [{ date: SAT, meal: "almoco" }] }, /naoLembro/);
  await bad({ from: FRI, to: SUN, refeicoes: [{ date: SAT, meal: "brunch'; DROP TABLE food_log;--", text: "x" }] }, /meal/);
  await bad({ from: FRI, to: SUN, texto: "x".repeat(1001) }, /texto/);
});

test("isolamento: o recap de uma conta não toca na outra (checkout, comida, faixa)", async (t) => {
  const env = makeEnv(), a = as(env, "ana"), b = as(env, "bia"), now = t.mock.method(Date, "now", () => at(`${FRI}T09:00`));
  await abrir(env, "ana"); await abrir(env, "bia");
  await ok(a("PUT", `/api/checkout/${SAT}`, { alcohol: 1, note: "nota da ana" }));
  await ok(a("POST", "/api/food", { date: SAT, text: "almoço da ana", meal: "almoco", kcal: 500 }), 201);
  now.mock.mockImplementation(() => at(`${MON}T08:00`));
  await abrir(env, "ana"); await abrir(env, "bia");
  await ok(b("POST", "/api/diario/recap", { from: FRI, to: SUN, dias: [{ date: SAT, alcool: { cerveja: 4 }, sleptWell: false }], refeicoes: [{ date: SAT, meal: "almoco", text: "almoço da bia" }], texto: "fds da bia" }));
  const da = (await ok(a("GET", `/api/diario?from=${FRI}&to=${SUN}`))).data;
  assert.deepEqual(da.checkouts.map((x: any) => [x.date, x.alcohol, x.note, x.sleptWell]), [[SAT, 1, "nota da ana", null]]);
  assert.deepEqual(da.reminder.recap, { kind: "fds", from: FRI, to: SUN }, "o recap da ana segue pendente");
  const fa = await food(a, SAT);
  assert.deepEqual(fa.map((x) => x.text), ["almoço da ana"], "a bebida e a refeição da bia não entram na ana");
  const fb = await food(b, SAT);
  assert.deepEqual(fb.map((x) => x.text).sort(), ["Bebida: 4 cervejas (lata)", "almoço da bia"], "a refeição da ana não bloqueia a da bia");
  assert.equal((await ok(b("GET", `/api/diario?from=${FRI}&to=${SUN}`))).data.checkouts.find((x: any) => x.date === SUN).note, "fds da bia");
  // a ana regrava: não apaga a bebida da bia
  await ok(a("POST", "/api/diario/recap", { from: FRI, to: SUN, dias: [{ date: SAT, alcool: {} }] }));
  assert.equal((await food(b, SAT)).filter((x) => /^Bebida/.test(x.text)).length, 1);
});
