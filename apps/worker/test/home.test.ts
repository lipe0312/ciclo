// #29 GET /api/home: séries e lacunas agregadas numa chamada, só da conta que pergunta. Dados fictícios.
import { test } from "node:test";
import assert from "node:assert/strict";
import { call, makeEnv } from "./fakes.ts";

const HOJE = "2026-11-12"; // quinta
const addDays = (iso: string, n: number) => new Date(Date.parse(iso + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const ok = async (p: Promise<{ status: number; text: string; data: any }>, _st = 200) => { const r = await p; assert.ok(r.status >= 200 && r.status < 300, `${r.status} ${r.text}`); return r; };
const as = (env: any, user: string) => (m: string, p: string, body?: unknown) => call(env, m, p, { user, body });
const SID = (n: number) => `0b7c6a2e-1d2f-4a3b-8c9d-0e1f2a3b4c${String(n).padStart(2, "0")}`;

async function treino(c: ReturnType<typeof as>, sid: string, d: string, ex: string, kg: number, reps: number, sets = 3) {
  await ok(c("POST", "/api/sessions", { id: sid, date: d, plan: { name: "t", items: [] } }), 201);
  for (let i = 1; i <= sets; i++) await ok(c("POST", `/api/sessions/${sid}/sets`, { exerciseId: ex, setNo: i, kg, reps }), 201);
}

test("home: séries, metas e lacunas da conta; a outra conta não aparece", async () => {
  const env = makeEnv(), a = as(env, "ana"), b = as(env, "bia");
  await ok(a("PUT", "/api/profile", { data: { level: 1, priorities: ["ombro", "biceps", "triceps"], minutes: 60, daysTarget: 4, prefs: {}, pinned: {}, avoid: [] } }));
  const EX = "Cable_Seated_Lateral_Raise";
  await treino(a, SID(1), addDays(HOJE, -10), EX, 6, 12);
  await treino(a, SID(2), addDays(HOJE, -3), EX, 7, 12);
  await ok(a("PUT", `/api/measurements/${addDays(HOJE, -30)}`, { armCm: 33, waistCm: 79 }));
  await ok(a("PUT", `/api/measurements/${addDays(HOJE, -20)}`, { armCm: 33.4, waistCm: 79.1 }));
  for (const [n, kg] of [[-12, 72], [-5, 72.4], [-1, 72.8]]) await ok(a("PUT", `/api/checkin/${addDays(HOJE, n)}`, { sleepH: 7, energy: 2, soreness: 0, stress: 1, food: 0, weightKg: kg }));
  await ok(a("POST", "/api/food", { date: HOJE, text: "arroz e feijão", kcal: 700, protein: 30 }), 201);
  await ok(a("POST", "/api/food", { date: HOJE, text: "ovos", kcal: 300, protein: 24 }), 201);
  await ok(a("POST", "/api/cardio", { date: addDays(HOJE, -2), type: "Running_Treadmill", minutes: 25, intensity: "zona2" }), 201);
  // a Bia tem dados de outra ordem de grandeza: nada disso pode aparecer para a Ana
  await treino(b, SID(3), addDays(HOJE, -2), EX, 99, 9, 5);
  await ok(b("PUT", `/api/measurements/${addDays(HOJE, -1)}`, { armCm: 50, waistCm: 120 }));
  await ok(b("POST", "/api/food", { date: HOJE, text: "festa", kcal: 9000, protein: 500 }), 201);

  const t0 = Date.now();
  const r = await ok(a("GET", `/api/home?date=${HOJE}`));
  assert.ok(Date.now() - t0 < 1500);
  const h = r.data.home;
  assert.equal(h.vazio, false);
  assert.equal(h.series.semanas.length, 12);
  assert.equal(h.series.semanas[11], "2026-11-09");
  assert.deepEqual(h.series.volume.ombro.slice(-3), [0, 3, 3]); // 3 séries na semana de 02/11 (−10 d é segunda 02) e 3 na de 09/11
  assert.equal(h.series.e1rm.length, 1);
  assert.equal(h.series.e1rm[0].exerciseId, EX);
  assert.deepEqual(h.series.braco.map((p: any) => p.value), [33, 33.4]);
  assert.equal(h.series.peso.ultimo, 72.8);
  assert.equal(h.series.cardio.at(-1), 25);
  assert.equal(h.comida.hoje.kcal, 1000); assert.equal(h.comida.hoje.prot, 54);
  assert.equal(h.metas.find((m: any) => m.id === "braco").atual, 33.4);
  assert.ok(h.gaps.length <= 5);
  assert.ok(h.gaps.every((g: any) => g.href.startsWith("#") && g.cta));
  assert.ok(!r.text.includes("9000") && !r.text.includes("120") && !r.text.includes("festa"), "nada da outra conta");
});

test("home: conta nova → vazio; data inválida → 400", async () => {
  const env = makeEnv(), a = as(env, "caio");
  const h = (await ok(a("GET", `/api/home?date=${HOJE}`))).data.home;
  assert.equal(h.vazio, true);
  assert.equal(h.comida.hoje.kcal, 0);
  assert.ok(h.metas.slice(0, 3).every((m: any) => m.ritmo === "sem_dados"));
  assert.equal((await a("GET", "/api/home?date=ontem")).status, 400);
  assert.equal((await a("GET", "/api/home")).status, 400);
});

// ---------- #73 cartão de boas-vindas, caminho de evolução e médias ----------
const PERFIL = { level: 1, priorities: ["ombro", "biceps"], minutes: 60, daysTarget: 4, daysUsual: ["seg", "qui"], places: ["academia"], goal: { id: "bracos_ombros" }, prefs: {}, pinned: {}, avoid: [], meta: { checkup: "feito" } };
const hojeSrv = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);

async function contaPronta(env: any, user: string) {
  const c = as(env, user);
  await ok(c("PUT", "/api/profile", { data: PERFIL }));
  await ok(c("PATCH", "/api/account", { onboarding: "concluido" }));
  return c;
}

test("home #73: checkup feito → cartão aparece; 'Dispensar' grava no servidor e não volta (outro aparelho = nova leitura)", async () => {
  const env = makeEnv(), a = await contaPronta(env, "dani");
  const hoje = hojeSrv();
  const h0 = (await ok(a("GET", `/api/home?date=${hoje}`))).data.home;
  assert.equal(h0.boasVindas, "mostrar");
  assert.equal(h0.marcos.find((m: any) => m.id === "perfil").feito, true);
  assert.equal(h0.marcos.find((m: any) => m.id === "treino").proximo || h0.marcos.find((m: any) => m.id === "semana").proximo, true);
  const p = await ok(a("PATCH", "/api/home/preferencias", { boasVindas: "dispensar" }));
  assert.equal(p.data.boasVindasDispensadoEm, hoje);
  assert.equal((await ok(a("GET", `/api/home?date=${hoje}`))).data.home.boasVindas, "oculto");
  // dispensar de novo não muda a data; adiar o perfil é outro campo
  await ok(a("PATCH", "/api/home/preferencias", { perfil: "adiar" }));
  const h2 = (await ok(a("GET", `/api/home?date=${hoje}`))).data.home;
  assert.equal(h2.boasVindas, "oculto"); assert.equal(h2.perfilAdiadoEm, hoje);
  // entrada validada
  assert.equal((await a("PATCH", "/api/home/preferencias", {})).status, 400);
  assert.equal((await a("PATCH", "/api/home/preferencias", { boasVindas: "sim" })).status, 400);
  assert.equal((await a("PATCH", "/api/home/preferencias", { perfil: 1 })).status, 400);
  // a preferência é da conta: a outra conta continua vendo o próprio cartão
  const b = await contaPronta(env, "edu");
  assert.equal((await ok(b("GET", `/api/home?date=${hoje}`))).data.home.boasVindas, "mostrar");
  // sai no export
  const ex = (await ok(a("GET", "/api/account/export"))).data;
  assert.equal(ex.ui_pref[0].boas_vindas_dispensado_em, hoje);
});

test("home #73: a 1ª série esconde o cartão; água e sono viram médias; os marcos vêm do banco", async () => {
  const env = makeEnv(), a = await contaPronta(env, "fabi");
  const hoje = hojeSrv();
  await ok(a("PUT", `/api/checkin/${hoje}`, { sleepH: 8, energy: 2, soreness: 0, stress: 1, food: 0 }));
  await ok(a("PUT", `/api/checkin/${addDays(hoje, -1)}`, { sleepH: 6, energy: 2, soreness: 0, stress: 1, food: 0 }));
  const co = await a("PUT", `/api/checkout/${addDays(hoje, -1)}`, { trained: false, waterMl: 2500 });
  assert.ok(co.status < 300, co.text);
  const h0 = (await ok(a("GET", `/api/home?date=${hoje}`))).data.home;
  assert.equal(h0.boasVindas, "mostrar");
  const [p, ag, so] = h0.medias;
  assert.equal(p.media, null);
  assert.equal(ag.media, 2.5);
  assert.equal(so.media, 7);
  // sessão sem série não conta como treino
  await ok(a("POST", "/api/sessions", { id: SID(40), date: hoje, plan: { name: "t", items: [] } }), 201);
  assert.equal((await ok(a("GET", `/api/home?date=${hoje}`))).data.home.boasVindas, "mostrar");
  await ok(a("POST", `/api/sessions/${SID(40)}/sets`, { exerciseId: "Cable_Seated_Lateral_Raise", setNo: 1, kg: 6, reps: 12 }), 201);
  const h1 = (await ok(a("GET", `/api/home?date=${hoje}`))).data.home;
  assert.equal(h1.boasVindas, "oculto");
  const treino = h1.marcos.find((m: any) => m.id === "treino");
  assert.equal(treino.feito, true); assert.equal(treino.data, hoje);
});

test("home #73: conta que pulou o checkup não tem cartão de boas-vindas", async () => {
  const env = makeEnv(), a = as(env, "gabi");
  await ok(a("PUT", "/api/profile", { data: { meta: { checkup: "pulado" } } }));
  await ok(a("PATCH", "/api/account", { onboarding: "concluido" }));
  const h = (await ok(a("GET", `/api/home?date=${hojeSrv()}`))).data.home;
  assert.equal(h.boasVindas, "oculto");
  assert.equal(h.marcos.find((m: any) => m.id === "perfil").feito, false);
});
