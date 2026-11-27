// #147 GET /api/evolucao: linhas agregadas por dia de até 12 meses, só da conta que pergunta; entrada validada (AAAA-MM,
// teto de 12 meses, nada de SQL em parâmetro). Dados fictícios.
import { test } from "node:test";
import assert from "node:assert/strict";
import { call, makeEnv } from "./fakes.ts";

const AGORA = Date.parse("2026-11-20T15:00:00Z");
const addDays = (iso: string, n: number) => new Date(Date.parse(iso + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const HOJE = "2026-11-20";
const as = (env: any, user: string) => (m: string, p: string, body?: unknown) => call(env, m, p, { user, body });
const ok = async (p: Promise<{ status: number; text: string; data: any }>) => { const r = await p; assert.ok(r.status >= 200 && r.status < 300, `${r.status} ${r.text}`); return r; };
const SID = (n: number) => `5c1d2e3f-4a5b-4c6d-8e7f-90a1b2c3d4${String(n).padStart(2, "0")}`;
const EX = "Cable_Seated_Lateral_Raise";

async function seed(c: ReturnType<typeof as>, o: { sid: number; kg: number; peso: number; braco: number; kcal: number; agua: number; doses: number; dias: number[];
  cardio: number; sono: number; cerveja: number; naoComi: "cafe" | "jantar" }) {
  for (const [i, n] of o.dias.entries()) {
    const d = addDays(HOJE, n), sid = SID(o.sid + i);
    await ok(c("POST", "/api/sessions", { id: sid, date: d, plan: { name: "t", items: [] } }));
    for (let k = 1; k <= 3; k++) await ok(c("POST", `/api/sessions/${sid}/sets`, { exerciseId: EX, setNo: k, kg: o.kg, reps: 10 }));
  }
  await ok(c("PUT", `/api/checkin/${addDays(HOJE, -3)}`, { sleepH: o.sono, energy: 2, soreness: 0, stress: 1, food: 0, weightKg: o.peso }));
  await ok(c("PUT", `/api/measurements/${addDays(HOJE, -10)}`, { armCm: o.braco, waistCm: 80 }));
  await ok(c("POST", "/api/food", { date: addDays(HOJE, -2), text: "almoço", kcal: o.kcal, protein: 40, meal: "almoco" }));
  await ok(c("PUT", `/api/checkout/${addDays(HOJE, -1)}`, { trained: false, waterMl: o.agua, alcohol: o.doses }));
  await ok(c("PUT", `/api/attendance/${addDays(HOJE, -4)}`, { status: "nao_fui" }));
  await ok(c("POST", "/api/cardio", { date: addDays(HOJE, -7), type: "Running_Treadmill", minutes: o.cardio, intensity: "zona2" }));
  await ok(c("PUT", "/api/food-nao-comi", { date: addDays(HOJE, -2), meal: o.naoComi }));
  // a bebida do recap vira o registro "bebida-…" na Comida (a consulta de bebida filtra por esse id)
  const sab = addDays(HOJE, -6);
  await ok(c("POST", "/api/diario/recap", { from: sab, to: sab, dias: [{ date: sab, alcool: { cerveja: o.cerveja } }] }));
}

test("evolução: só a própria conta (falha se qualquer consulta perder o filtro de user_id)", async (t) => {
  t.mock.method(Date, "now", () => AGORA);
  const env = makeEnv(), a = as(env, "ana"), b = as(env, "bia");
  await seed(a, { sid: 10, kg: 10, peso: 72.4, braco: 33.6, kcal: 810, agua: 2100, doses: 1, dias: [-30, -12, -5], cardio: 25, sono: 7, cerveja: 1, naoComi: "cafe" });
  // a Bia tem marcas de outra ordem de grandeza, no MESMO período: nada disso pode voltar para a Ana
  await seed(b, { sid: 40, kg: 66, peso: 133.3, braco: 55.5, kcal: 4321, agua: 7700, doses: 9, dias: [-40, -11, -6, -3], cardio: 77, sono: 9, cerveja: 7, naoComi: "jantar" });
  await ok(b("PUT", `/api/measurements/${addDays(HOJE, -200)}`, { armCm: 51.1 }));
  const r = await ok(a("GET", "/api/evolucao?de=2026-10&ate=2026-11"));
  const e = r.data.evolucao;
  assert.deepEqual([e.de, e.ate], ["2026-10", "2026-11"]);
  assert.deepEqual(e.sessoes.sort(), [addDays(HOJE, -30), addDays(HOJE, -12), addDays(HOJE, -5)]);
  assert.deepEqual(e.sets.map((x: any) => x.n), [3, 3, 3]);
  assert.ok(e.e1rm.every((x: any) => Math.abs(x.e1rm - 10 * (1 + 10 / 30)) < 1e-9 && x.muscle === "ombro"), JSON.stringify(e.e1rm));
  assert.deepEqual(e.peso, [{ date: addDays(HOJE, -3), kg: 72.4 }]);
  assert.deepEqual(e.medidas.map((m: any) => m.braco), [33.6]);
  assert.deepEqual(e.refeicoes, [{ date: addDays(HOJE, -6), meal: null, kcal: 150, prot: 0 }, { date: addDays(HOJE, -2), meal: "almoco", kcal: 810, prot: 40 }]);
  assert.deepEqual(e.agua, [{ date: addDays(HOJE, -1), litros: 2.1 }]);
  assert.deepEqual(e.alcool.sort((x: any, y: any) => (x.date < y.date ? -1 : 1)), [{ date: addDays(HOJE, -6), doses: 1 }, { date: addDays(HOJE, -1), doses: 1 }]); // o recap grava as doses no checkout
  assert.deepEqual(e.presenca, [{ date: addDays(HOJE, -4), status: "nao_fui" }]);
  assert.deepEqual(e.cardio, [{ date: addDays(HOJE, -7), minutes: 25 }]);
  assert.deepEqual(e.sono, [{ date: addDays(HOJE, -3), horas: 7 }]);
  assert.deepEqual(e.naoComi, [{ date: addDays(HOJE, -2), meal: "cafe" }]);
  assert.deepEqual(e.bebida, [{ date: addDays(HOJE, -6), kcal: 150 }]);
  assert.equal(e.primeiro, addDays(HOJE, -30));
  assert.deepEqual(e.comecoCorpo.braco, { date: addDays(HOJE, -10), value: 33.6 });
  assert.deepEqual(e.comecoCorpo.peso, { date: addDays(HOJE, -3), value: 72.4 });
  for (const s of ["133.3", "55.5", "51.1", "4321", "7.7", "66", "\"doses\":9", "1050", "77", "\"meal\":\"jantar\"", "\"horas\":9"]) assert.ok(!r.text.includes(s), `vazou ${s} da outra conta`);
  // recorde antes do período: só o da própria conta
  const nov = (await ok(a("GET", "/api/evolucao?de=2026-11&ate=2026-11"))).data.evolucao;
  assert.equal(nov.recordeAntes.length, 1);
  assert.ok(nov.recordeAntes.every((x: any) => x.e1rm < 20), JSON.stringify(nov.recordeAntes));
  // a Bia vê os dela (e o começo dela é a medida de 200 dias atrás)
  const eb = (await ok(b("GET", "/api/evolucao?de=2026-10&ate=2026-11"))).data.evolucao;
  assert.equal(eb.sessoes.length, 4);
  assert.equal(eb.comecoCorpo.braco.value, 51.1);
  assert.ok(!JSON.stringify(eb).includes("72.4"));
});

test("evolução: entrada validada (AAAA-MM, de ≤ ate, no máximo 12 meses, nada de SQL em parâmetro)", async (t) => {
  t.mock.method(Date, "now", () => AGORA);
  const env = makeEnv(), a = as(env, "caio");
  const st = async (q: string) => (await a("GET", `/api/evolucao${q}`)).status;
  assert.equal(await st("?de=2025-12&ate=2026-11"), 200, "12 meses é o teto e passa");
  assert.equal(await st("?de=2026-11&ate=2026-11"), 200);
  for (const q of ["", "?de=2026-10", "?ate=2026-10", "?de=2026-13&ate=2026-12", "?de=2026-1&ate=2026-02", "?de=2026-10-01&ate=2026-11",
    "?de=2025-11&ate=2026-11", "?de=2020-01&ate=2026-11", "?de=2026-11&ate=2026-10", `?de=${encodeURIComponent("2026-10'; DROP TABLE checkin;--")}&ate=2026-11`,
    `?de=2026-10&ate=${encodeURIComponent("2026-11 OR 1=1")}`]) assert.equal(await st(q), 400, q);
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'checkin'").get().n, 1, "a tabela continua lá");
  // conta nova: tudo vazio, nada quebra
  const e = (await ok(a("GET", "/api/evolucao?de=2026-06&ate=2026-11"))).data.evolucao;
  assert.deepEqual([e.primeiro, e.sessoes, e.refeicoes, e.comecoCorpo.peso], [null, [], [], null]);
});
