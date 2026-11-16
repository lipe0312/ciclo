// #106 Série por tempo no Worker real: prancha 45 s e polichinelo em tempo e em reps pelo app e pelo MCP, histórico certo,
// validação pela medida do exercício (core), isolamento por user_id. Dados fictícios.
import { test } from "node:test";
import assert from "node:assert/strict";
import { call, makeEnv, mcp } from "./fakes.ts";

const D = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const U1 = "0b7c6a2e-1d2f-4a3b-8c9d-0e1f2a3b4c5d", U2 = "1c8d7b3f-2e30-4b4c-9d0e-1f2a3b4c5d6e";
const PLAN = { name: "Core", groups: ["inf"], items: [] };
const SUPINO = "Barbell_Bench_Press_-_Medium_Grip";

async function sessao(env: unknown, user: string, id: string, startedAt = Date.now()) {
  const r = await call(env, "POST", "/api/sessions", { user, body: { id, date: D, plan: PLAN, startedAt } });
  assert.equal(r.status, 201, r.text);
}
const serie = (env: unknown, user: string, sid: string, body: Record<string, unknown>) => call(env, "POST", `/api/sessions/${sid}/sets`, { user, body });

test("app: prancha 45 s e polichinelo em tempo e em reps; histórico e resumo certos", async () => {
  const env = makeEnv();
  await sessao(env, "ana", U1, Date.now() - 86400e3);
  for (const b of [{ exerciseId: "Plank", setNo: 1, segundos: 50 }, { exerciseId: "Star_Jump", setNo: 1, segundos: 40 }]) assert.equal((await serie(env, "ana", U1, b)).status, 200);
  await call(env, "POST", `/api/sessions/${U1}/finish`, { user: "ana", body: { feedback: {} } });

  await sessao(env, "ana", U2);
  const ok = async (b: Record<string, unknown>) => { const r = await serie(env, "ana", U2, b); assert.equal(r.status, 200, r.text); assert.equal(r.data.saved, true); };
  await ok({ exerciseId: "Plank", setNo: 1, segundos: 45 });
  await ok({ exerciseId: "Star_Jump", setNo: 1, segundos: 60 });
  await ok({ exerciseId: "Star_Jump", setNo: 2, reps: 30 });
  await ok({ exerciseId: SUPINO, setNo: 1, kg: 40, reps: 8 });

  const s = (await call(env, "GET", `/api/sessions/${U2}`, { user: "ana" })).data;
  assert.deepEqual(s.sets.map((x: any) => [x.exerciseId, x.setNo, x.reps, x.segundos]),
    [[SUPINO, 1, 8, null], ["Plank", 1, null, 45], ["Star_Jump", 1, null, 60], ["Star_Jump", 2, 30, null]]);

  const h = (await call(env, "GET", `/api/history/last?ids=Plank,Star_Jump&n=5`, { user: "ana" })).data.history;
  assert.deepEqual(h.Plank, [[{ kg: 0, reps: 0, segundos: 45 }], [{ kg: 0, reps: 0, segundos: 50 }]]);
  assert.deepEqual(h.Star_Jump[0], [{ kg: 0, reps: 0, segundos: 60 }, { kg: 0, reps: 30 }]);

  const fim = (await call(env, "POST", `/api/sessions/${U2}/finish`, { user: "ana", body: { feedback: {} } })).data.summary;
  assert.equal(fim.sets, 4, "série por tempo conta como série");
  assert.equal(fim.volume, 320, "volume kg × reps só do supino");
  assert.ok(fim.prs.some((p: any) => p.exerciseId === "Star_Jump" && p.kind === "tempo" && p.value === 60), "recorde de tempo");
  const lista = (await call(env, "GET", "/api/sessions", { user: "ana" })).data.sessions;
  assert.equal(lista[0].sets, 4);
});

test("app: a medida do exercício valida a série (prancha sem reps, supino sem tempo, 1–3600 s)", async () => {
  const env = makeEnv();
  await sessao(env, "ana", U1);
  const bad = async (b: Record<string, unknown>, re: RegExp) => { const r = await serie(env, "ana", U1, { setNo: 1, ...b }); assert.equal(r.status, 400, r.text); assert.match(r.data.error, re); };
  await bad({ exerciseId: "Plank", reps: 10 }, /tempo/);
  await bad({ exerciseId: "Plank" }, /segundos obrigatório/);
  await bad({ exerciseId: SUPINO, segundos: 30 }, /repetições/);
  await bad({ exerciseId: "Plank", segundos: 0 }, /segundos fora/);
  await bad({ exerciseId: "Plank", segundos: 3601 }, /segundos fora/);
  await bad({ exerciseId: "Plank", segundos: "45; DROP TABLE set_log" }, /segundos fora/);
  await bad({ exerciseId: "Star_Jump", segundos: 30, reps: 10 }, /não os dois/);
  assert.equal((await call(env, "GET", `/api/sessions/${U1}`, { user: "ana" })).data.sets.length, 0, "nada gravado");
});

test("isolamento: outra conta não grava série por tempo na sessão alheia nem vê o histórico", async () => {
  const env = makeEnv();
  await sessao(env, "ana", U1);
  assert.equal((await serie(env, "ana", U1, { exerciseId: "Plank", setNo: 1, segundos: 45 })).data.saved, true);
  const x = await serie(env, "bia", U1, { exerciseId: "Plank", setNo: 1, segundos: 999 });
  assert.equal(x.status, 200); assert.equal(x.data.saved, false);
  assert.equal((await call(env, "GET", `/api/sessions/${U1}`, { user: "bia" })).status, 404);
  assert.deepEqual((await call(env, "GET", "/api/history/last?ids=Plank", { user: "bia" })).data.history.Plank, []);
  assert.deepEqual((await call(env, "GET", `/api/sessions/${U1}`, { user: "ana" })).data.sets.map((s: any) => s.segundos), [45]);
});

test("MCP: ciclo_treino_registrar aceita segundos; histórico e contexto informam a medida", async () => {
  const env = makeEnv();
  const c = (m: string, p: string, body?: unknown) => call(env, m, p, { user: "ana", body });
  assert.equal((await c("PUT", "/api/profile", { data: { level: 1, priorities: ["ombro"], minutes: 60, daysTarget: 4, prefs: {}, pinned: {}, avoid: [], goal: { statement: "objetivo fictício" } } })).status, 200);
  assert.equal((await c("PUT", "/api/gyms/acad1", { name: "Academia Exemplo", equipment: ["halteres", "banco"] })).status, 200);
  const token = (await c("POST", "/api/account/tokens", { label: "teste" })).data.token as string;
  const tool = async (name: string, args: Record<string, unknown>) => {
    const r = await mcp(env, token, name, args); const txt = r.data.result.content[0].text as string;
    return r.data.result.isError ? { erro: txt } : JSON.parse(txt);
  };
  const p = await tool("ciclo_treino_registrar", { exercicioId: "Plank", series: [{ segundos: 45 }, { segundos: 40 }] });
  assert.equal(p.registrado, 2); assert.equal(p.medida, "tempo"); assert.deepEqual(p.series, ["1: 0:45", "2: 0:40"]);
  const pj = await tool("ciclo_treino_registrar", { exercicioId: "Star_Jump", series: [{ segundos: 60 }, { reps: 30 }] });
  assert.deepEqual(pj.series, ["1: 1:00", "2: 30 reps"]); assert.equal(pj.medida, "ambos");
  assert.match((await tool("ciclo_treino_registrar", { exercicioId: "Plank", series: [{ reps: 10 }] })).erro, /series\[0\]: .*tempo/);
  assert.match((await tool("ciclo_treino_registrar", { exercicioId: "Plank", series: [{ segundos: 4000 }] })).erro, /segundos/);
  assert.match((await tool("ciclo_treino_registrar", { exercicioId: SUPINO, series: [{ segundos: 30 }] })).erro, /repetições/);
  const h = await tool("ciclo_historico", { tipo: "series", exercicioId: "Star_Jump" });
  assert.deepEqual(h.itens.map((i: any) => [i.reps, i.seg]), [[null, 60], [30, null]]);
  const cg = await tool("ciclo_historico", { tipo: "cargas", exercicioId: "Plank" });
  assert.equal(cg.itens[0].segMax, 45); assert.equal(cg.itens[0].series, 2);
  const ctx = await tool("ciclo_contexto", { pedido: "trocar", exercicioId: "Plank" });
  assert.equal(ctx.exercicio.medida, "tempo");
  const cat = await tool("ciclo_catalogo", { muscle: "core", limite: 60 });
  assert.equal(cat.itens.find((i: any) => i.id === "Plank").medida, "tempo");
  assert.equal(cat.itens.find((i: any) => i.id === "Crunches").medida, undefined);
  // outra conta não vê
  await call(env, "PUT", "/api/profile", { user: "bia", body: { data: { level: 1, priorities: ["ombro"], minutes: 60, daysTarget: 4, prefs: {}, pinned: {}, avoid: [], goal: { statement: "x" } } } });
  const tb = (await call(env, "POST", "/api/account/tokens", { user: "bia", body: { label: "t" } })).data.token as string;
  const hb = JSON.parse((await mcp(env, tb, "ciclo_historico", { tipo: "series" })).data.result.content[0].text);
  assert.equal(hb.itens.length, 0);
});
