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

test("falta no servidor: 1ª abertura na quarta já cobra seg/ter planejados e sem treino, com o nome do treino", async () => {
  const env = makeEnv();
  const a = await conta(env, "ana");
  const w = (await a("GET", `/api/week?date=${QUA}`)).data.week;
  assert.deepEqual(w.misses, [SEG, TER]);
  assert.match(w.days[1].plan.name, /Inferior/);
  const r = await a("POST", `/api/week/day/${TER}`, { action: "falta", resposta: "fui", today: QUA });
  assert.equal(r.data.week.days[1].status, "feito");
  assert.deepEqual(r.data.week.misses, [SEG]);
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

// ---- isolamento de ESCRITA: DELETE de day_override e poda de week_plan da conta A não tocam a B ----
const uidOf = async (env: unknown, user: string) => (await call(env, "GET", "/api/account/export", { user })).data.user.id as string;
const rowsOf = (env: any, uid: string) => JSON.stringify({
  wp: env.DB.raw.prepare("SELECT week_start, version, plan_json, source, created_at FROM week_plan WHERE user_id = ? ORDER BY week_start, version").all(uid),
  ov: env.DB.raw.prepare("SELECT date, kind, opts, updated_at FROM day_override WHERE user_id = ? ORDER BY date").all(uid),
});

test("isolamento de escrita: trocas, desfazer e a poda (> 20 versões) da A não apagam day_override nem week_plan da B", async () => {
  const env = makeEnv();
  const b = await conta(env, "bia");
  await b("GET", `/api/week?date=${SEG}`);
  assert.equal((await b("POST", `/api/week/day/${QUI}`, { action: "gerar", today: SEG, opts: { focus: ["ombro"] } })).status, 200);
  const ub = await uidOf(env, "bia");
  const antes = rowsOf(env, ub);
  assert.match(antes, /"date":"2026-11-12"/, "B tem override na quinta");

  const a = await conta(env, "ana");
  await a("GET", `/api/week?date=${SEG}`);
  assert.equal((await a("POST", `/api/week/day/${TER}`, { action: "gerar", today: SEG, opts: { split: "full" } })).status, 200);
  assert.equal((await a("PUT", "/api/week", { date: SEG, version: 1 })).status, 200);
  assert.equal(rowsOf(env, ub), antes, "escrita da A mexeu nas linhas da B");
  for (let k = 0; k < 22; k++) {
    const r = await a("POST", "/api/week/day/2026-11-14", { action: k % 2 ? "folga" : "treino", today: SEG });
    assert.equal(r.status, 200, r.text);
  }
  const ua = await uidOf(env, "ana");
  assert.equal((env as any).DB.raw.prepare("SELECT COUNT(*) AS n FROM week_plan WHERE user_id = ?").get(ua).n, 20, "A podada para 20 versões");
  assert.equal(rowsOf(env, ub), antes, "a poda da A apagou versões da B");
});

// ---- isolamento de LEITURA: séries, cargas, feedback e semanas anteriores da B não mudam a semana da A ----
const SEM_PASSADA = ["2026-11-03", "2026-11-05"], SEMANAS_ANTES = ["2026-10-12", "2026-10-19", "2026-10-26", "2026-11-02"];
const sid = (k: number, tag: string) => `${tag}0000000-0000-4000-8000-00000000000${k}`;
async function sessao(f: ReturnType<typeof conta> extends Promise<infer T> ? T : never, id: string, date: string, sets: [string, number, number][], feedback?: unknown) {
  assert.equal((await f("POST", "/api/sessions", { id, date, plan: { items: [] } })).status, 201);
  for (const [k, [ex, kg, reps]] of sets.entries()) assert.equal((await f("POST", `/api/sessions/${id}/sets`, { exerciseId: ex, setNo: k + 1, kg, reps })).data.saved, true);
  if (feedback) await f("POST", `/api/sessions/${id}/finish`, { feedback });
}
async function seedA(env: unknown) {
  const a = await conta(env, "ana");
  await a("GET", "/api/week?date=2026-11-02"); // A tem a semana passada (sem deload) → o feedback dela vale
  for (const d of SEM_PASSADA) await a("PUT", `/api/checkin/${d}`, { sleepH: 8, energy: 3, soreness: 0, stress: 1, food: 0 });
  // tríceps 2× (sem progressão própria); bíceps 1× com pump baixo
  await sessao(a, sid(1, "a"), SEM_PASSADA[0], [["Cable_Rope_Overhead_Triceps_Extension", 20, 12], ["Incline_Dumbbell_Curl", 12, 10]], { pump: { triceps: 2, biceps: 0 } });
  await sessao(a, sid(2, "a"), SEM_PASSADA[1], [["Cable_Rope_Overhead_Triceps_Extension", 20, 12]], { pump: { triceps: 2 } });
  return a;
}
async function seedB(env: unknown) {
  const b = await conta(env, "bia");
  for (const w of SEMANAS_ANTES) await b("GET", `/api/week?date=${w}`); // 4 semanas sem deload
  // bíceps 2× na semana passada; tríceps progrediu (retrasada → passada); séries nesta semana
  await sessao(b, sid(1, "b"), "2026-10-28", [["Triceps_Pushdown", 30, 10]]);
  await sessao(b, sid(2, "b"), SEM_PASSADA[0], [["Triceps_Pushdown", 40, 12], ["Barbell_Curl", 30, 10]]);
  await sessao(b, sid(3, "b"), SEM_PASSADA[1], [["Barbell_Curl", 30, 10]]);
  await sessao(b, sid(4, "b"), SEG, [["Barbell_Curl", 30, 10], ["Leg_Press", 100, 10]]);
}
const semanaA = async (env: unknown) => {
  const w = (await call(env, "GET", `/api/week?date=${QUA}`, { user: "ana" })).data.week;
  return JSON.stringify({ days: w.days, targets: w.targets, progression: w.progression, projected: w.projected, misses: w.misses, offer: w.offer, extra: w.extraToday });
};

test("isolamento de leitura: dados da B (séries, cargas, frequência, semanas anteriores) não entram na semana da A", async () => {
  for (const ex of ["Triceps_Pushdown", "Barbell_Curl", "Leg_Press", "Cable_Rope_Overhead_Triceps_Extension", "Incline_Dumbbell_Curl"]) assert.ok(EXERCISE_BY_ID[ex], ex);
  const so = makeEnv();
  await seedA(so);
  const sozinha = await semanaA(so);
  const junto = makeEnv();
  await seedB(junto);
  await seedA(junto);
  assert.equal(await semanaA(junto), sozinha, "a semana da A mudou com os dados da B");
});

test("gerar outro treino (#44): ocupados/estilo/leve/adiantar viram versão, validam a entrada e desfazer volta; cardio planejado e futsal que abate", async () => {
  const env = makeEnv();
  const a = await conta(env, "ana");
  const w0 = (await a("GET", `/api/week?date=${SEG}`)).data.week;
  assert.equal(w0.days.filter((d: any) => d.cardio).length, 2, "cardio previsto pela dose do objetivo");
  const antes = w0.days[0].plan;
  const usados = [...new Set(antes.items.flatMap((i: any) => EXERCISE_BY_ID[i.exerciseId].eq))].filter((q) => q !== "halteres").slice(0, 3);

  const r = await a("POST", `/api/week/day/${SEG}`, { action: "outro", today: SEG, opts: { ocupados: usados, leve: true } });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.data.week.version, 2);
  const novo = r.data.week.days[0];
  assert.equal(novo.plan.leve, true);
  for (const it of novo.plan.items) for (const q of usados) assert.ok(!EXERCISE_BY_ID[it.exerciseId].eq.includes(q as string), `${it.nm} usa ${q}`);
  assert.deepEqual(novo.opts.ocupados, usados);

  for (const bad of [{ ocupados: ["nao_existe"] }, { ocupados: "x" }, { estilo: "robo" }, { adiantar: "orelha" }])
    assert.equal((await a("POST", `/api/week/day/${SEG}`, { action: "outro", today: SEG, opts: bad })).status, 400, JSON.stringify(bad));

  const volta = await a("PUT", "/api/week", { date: SEG, version: 1 });
  assert.equal(volta.status, 200, volta.text);
  assert.deepEqual(volta.data.week.days[0].plan.items.map((i: any) => i.exerciseId), antes.items.map((i: any) => i.exerciseId));
  assert.equal(volta.data.week.days[0].plan.leve, undefined);

  const f = await a("POST", "/api/cardio", { date: SEG, type: "Futsal", minutes: 60, intensity: "moderado" });
  assert.equal(f.status, 201, f.text);
  assert.equal((await a("GET", `/api/week?date=${TER}`)).data.week.days.filter((d: any) => d.cardio).length, 1, "o futsal abate uma das 2 sessões");
});

test("isolamento do cardio (#44): o cardio_log da B não abate nem muda o cardio planejado da A", async () => {
  const env = makeEnv();
  const a = await conta(env, "ana");
  const b = await conta(env, "bia");
  const dias = (r: any) => r.data.week.days.filter((d: any) => d.cardio).map((d: any) => d.date);
  const antes = dias(await a("GET", `/api/week?date=${TER}`));
  assert.equal(antes.length, 2);
  // a B registra futsal e corrida na semana: se a query do cardio perder o user_id, a A teria a dose abatida
  for (const t of ["Futsal", "Running_Treadmill"]) assert.equal((await b("POST", "/api/cardio", { date: SEG, type: t, minutes: 60, intensity: "moderado" })).status, 201);
  assert.equal((await b("GET", `/api/week?date=${TER}`)).data.week.days.filter((d: any) => d.cardio).length, 0, "a B cumpriu a dose dela");
  assert.deepEqual(dias(await a("GET", `/api/week?date=${TER}`)), antes, "o cardio da B abateu o da A");
});
