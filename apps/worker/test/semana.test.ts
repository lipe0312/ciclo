// Rotas da semana (#24) no Worker real sobre D1 em memória: gera na segunda, versões/desfazer, falta, extra,
// validação da entrada e isolamento entre contas (falha se a query de day_override/week_plan perder o user_id).
import { test } from "node:test";
import assert from "node:assert/strict";
import { EQUIPMENT, EXERCISE_BY_ID, MUSCLES } from "@ciclo/core";
import { call, makeEnv } from "./fakes.ts";

const ALL = EQUIPMENT.map((e) => e.id);
const SEG = "2026-11-09", TER = "2026-11-10", QUA = "2026-11-11", QUI = "2026-11-12";
const SID = "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f";
const profile = { data: { level: 1, priorities: ["ombro", "biceps", "triceps"], minutes: 60, daysTarget: 4, daysUsual: ["seg", "ter", "qui", "sex"], dayGym: {}, prefs: {}, pinned: {}, avoid: [] } };

async function conta(env: unknown, user: string) {
  for (const [m, p, b] of [["PUT", "/api/profile", profile], ["PUT", "/api/gyms/acad1", { name: "Academia 1", equipment: ALL }]] as const) {
    const r = await call(env, m, p, { user, body: b }); assert.ok(r.status < 300, r.text);
  }
  return (m: string, p: string, body?: unknown) => call(env, m, p, { user, body });
}
const groups = (d: any) => [...new Set((d.plan?.items ?? []).map((i: any) => MUSCLES[i.muscle as keyof typeof MUSCLES].group))].sort().join();

test("semana: nasce inteira na segunda (v1), trocar geração vira v2, regenerar mostra diff, desfazer volta", async () => {
  const env = makeEnv();
  const a = await conta(env, "ana");
  const g = await a("GET", `/api/week?date=${SEG}`);
  assert.equal(g.status, 200, g.text);
  const w = g.data.week;
  assert.equal(w.version, 1);
  assert.equal(w.days.length, 7);
  assert.deepEqual(w.days.map((d: any) => d.kind), ["treino", "treino", "folga", "treino", "treino", "folga", "folga"]);
  for (const d of w.days.filter((x: any) => x.kind === "treino")) for (const it of d.plan.items) assert.equal(it.nm, EXERCISE_BY_ID[it.exerciseId].nm);
  assert.equal((await a("GET", `/api/week?date=${SEG}`)).data.week.version, 1, "ler de novo não cria versão");

  const t = await a("POST", `/api/week/day/${QUI}`, { action: "gerar", today: SEG, opts: { focus: ["ombro"], minutes: 45 } });
  assert.equal(t.status, 200, t.text);
  assert.equal(t.data.week.version, 2);
  assert.match(t.data.week.days[3].plan.name, /Foco: ombro/);
  assert.equal(t.data.week.days[3].source, "voce");

  const mv = await a("POST", `/api/week/day/${QUI}`, { action: "mover", to: "2026-11-14", today: SEG });
  assert.equal(mv.status, 200, mv.text);
  assert.equal(mv.data.week.days[3].kind, "folga");
  assert.match(mv.data.week.days[5].plan.name, /Foco: ombro/);
  assert.equal((await a("POST", `/api/week/day/${SEG}`, { action: "mover", to: TER, today: SEG })).status, 409, "destino com treino → trocar");

  const dry = await a("POST", "/api/week/regenerate", { date: SEG, reset: true });
  assert.equal(dry.status, 200, dry.text);
  assert.equal(dry.data.week, null);
  assert.ok(dry.data.diff.some((x: any) => x.date === "2026-11-14"), "o diff mostra o sábado voltando a folga");

  const back = await a("PUT", "/api/week", { date: SEG, version: 1 });
  assert.equal(back.status, 200, back.text);
  assert.equal(back.data.week.version, 4);
  assert.equal(back.data.week.days[3].kind, "treino");
  assert.equal(back.data.week.days[3].source, "auto");
  assert.ok(back.data.week.versions.some((v: any) => v.source === "desfazer"));
  assert.equal((await a("PUT", "/api/week", { date: SEG, version: 99 })).status, 404);
});

test("falta: terça sem treino aparece como pendente; 'não fui' reorganiza (quinta vira inferior)", async () => {
  const env = makeEnv();
  const a = await conta(env, "ana");
  await a("GET", `/api/week?date=${SEG}`);
  const w = (await a("GET", `/api/week?date=${QUA}`)).data.week;
  assert.deepEqual(w.misses, [SEG, TER], "segunda e terça passaram sem registro");
  const f = await a("POST", `/api/week/day/${SEG}`, { action: "falta", resposta: "fui", today: QUA });
  assert.equal(f.status, 200, f.text);
  assert.equal(f.data.week.days[0].status, "feito", "fui e esqueci de marcar");
  assert.deepEqual(f.data.week.misses, [TER]);
  const r = await a("POST", `/api/week/day/${TER}`, { action: "falta", resposta: "nao_fui", today: QUA });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.data.week.days[1].status, "faltou");
  assert.equal(groups(r.data.week.days[3]), "inf");
  assert.equal((await a("POST", `/api/week/day/${QUI}`, { action: "falta", resposta: "nao_fui", today: QUA })).status, 400, "falta só para dia que já chegou");
});

test("treino num dia não planejado vira extra e o resto da semana se reorganiza", async () => {
  const env = makeEnv();
  const a = await conta(env, "ana");
  const w1 = (await a("GET", `/api/week?date=${SEG}`)).data.week;
  const plan = w1.extraToday ?? w1.days[0].plan;
  assert.equal((await a("POST", "/api/sessions", { id: SID, date: QUA, plan })).status, 201);
  for (const [k, it] of plan.items.slice(0, 3).entries()) await a("POST", `/api/sessions/${SID}/sets`, { exerciseId: it.exerciseId, setNo: k + 1, kg: 10, reps: 10 });
  const w = (await a("GET", `/api/week?date=${QUA}`)).data.week;
  assert.equal(w.days[2].status, "extra");
  assert.equal(w.versions[0].source, "extra");
  assert.ok(w.version > 1);
});

test("entrada validada: data, ação, foco e academia (SQL só com bind)", async () => {
  const env = makeEnv();
  const a = await conta(env, "ana");
  await a("GET", `/api/week?date=${SEG}`);
  const bad: [string, string, unknown][] = [
    ["GET", "/api/week?date=2026-11-09'--", undefined],
    ["POST", `/api/week/day/${QUI}'; DROP TABLE week_plan;--`, { action: "folga", today: SEG }],
    ["POST", `/api/week/day/${QUI}`, { action: "apagar", today: SEG }],
    ["POST", `/api/week/day/${QUI}`, { action: "gerar", today: SEG, opts: { focus: ["x'; DROP TABLE day_override;--"] } }],
    ["POST", `/api/week/day/${QUI}`, { action: "gerar", today: SEG, opts: { gymId: "de-outra-conta" } }],
    ["POST", `/api/week/day/${QUI}`, { action: "gerar", today: SEG, opts: { minutes: 9999 } }],
    ["PUT", "/api/week", { date: SEG, version: "1 OR 1=1" }],
  ];
  for (const [m, p, b] of bad) assert.equal((await a(m, p, b)).status, 400, `${m} ${p} ${JSON.stringify(b)}`);
  assert.equal((await a("GET", `/api/week?date=${SEG}`)).data.week.version, 1, "nada mudou");
});

test("isolamento: as escolhas e versões da conta B não aparecem nem são restauráveis pela A", async () => {
  const env = makeEnv();
  const b = await conta(env, "bia");
  await b("GET", `/api/week?date=${SEG}`);
  await b("POST", `/api/week/day/${QUI}`, { action: "gerar", today: SEG, opts: { focus: ["ombro"] } });
  await b("POST", `/api/week/day/2026-11-15`, { action: "treino", today: SEG });
  const a = await conta(env, "ana");
  const wa = (await a("GET", `/api/week?date=${SEG}`)).data.week;
  assert.equal(wa.version, 1);
  assert.deepEqual(wa.versions.map((v: any) => v.version), [1]);
  assert.ok(wa.days.every((d: any) => d.source === "auto"), "override da B vazou para a A");
  assert.equal(wa.days[6].kind, "folga");
  assert.equal((await a("PUT", "/api/week", { date: SEG, version: 3 })).status, 404, "versão 3 é só da B");
  const exp = (await a("GET", "/api/account/export")).data;
  assert.equal(exp.week_plan.length, 1);
  assert.equal(exp.day_override.length, 0);
  const wb = (await b("GET", `/api/week?date=${SEG}`)).data.week;
  assert.equal(wb.version, 3);
  assert.match(wb.days[3].plan.name, /Foco: ombro/);
});
