// Prova de isolamento: a conta A tenta ler/alterar dados da B em TODAS as rotas /api/* e ferramentas MCP.
// Falha se qualquer query perder o filtro user_id (vazamento de MARCA_B ou mudança no export da B).
import { test } from "node:test";
import assert from "node:assert/strict";
import { EQUIPMENT } from "@ciclo/core";
import { routeSignatures } from "../src/api.ts";
import { toolNames } from "../src/mcp.ts";
import { call, makeEnv, mcp } from "./fakes.ts";

const D = "2026-11-05", ALL = EQUIPMENT.map((e) => e.id), PNG = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
// uma sessão por conta; a B guarda cargas marcadas (77.5 kg) que NUNCA podem aparecer em respostas da A
const SID_A = "0b7c6a2e-1d2f-4a3b-8c9d-0e1f2a3b4c5d", SID_B = "9f1e2d3c-4b5a-4c6d-8e7f-0a1b2c3d4e5f", MARK_KG = 77.5;
const profile = (tag: string) => ({ data: { level: 1, priorities: ["ombro"], minutes: 60, daysTarget: 4, prefs: {}, pinned: {}, avoid: [], goal: { statement: `${tag} objetivo` } } });

async function seed(env: any, user: string, tag: string, SID: string, kg: number) {
  const c = (m: string, p: string, body?: unknown) => call(env, m, p, { user, body });
  const ok = async (p: Promise<{ status: number; text: string }>) => { const r = await p; assert.ok(r.status < 300, r.text); return r as any; };
  await ok(c("PUT", "/api/profile", profile(tag)));
  await ok(c("PUT", "/api/gyms/acad1", { name: `${tag} academia`, equipment: ALL }));
  await ok(c("PUT", `/api/checkin/${D}`, { sleepH: 7, energy: 2, soreness: 1, stress: 2, food: 0, note: `${tag} nota` }));
  await ok(c("PUT", `/api/attendance/${D}`, { status: "folga", reason: `${tag} motivo` }));
  await ok(c("PUT", `/api/measurements/${D}`, { armCm: 33 }));
  const plan = (await ok(c("POST", "/api/plan-day", { date: D, daysLeft: 3 }))).data.plan;
  await ok(c("PUT", `/api/day-plan/${D}`, { plan: { ...plan, name: `${tag} plano` }, gymId: "acad1" }));
  await ok(c("POST", "/api/plan-edits", { date: D, edit: { index: 0, sets: 2 } }));
  await ok(c("POST", "/api/sessions", { id: SID, date: D, plan }));
  await ok(c("POST", `/api/sessions/${SID}/sets`, { exerciseId: plan.items[0].exerciseId, setNo: 1, kg, reps: 9 }));
  const ex = plan.items[0].exerciseId as string;
  await ok(c("POST", `/api/sessions/${SID}/skip`, { exerciseId: plan.items[1].exerciseId, reason: "ocupado" }));
  await ok(c("PUT", `/api/sessions/${SID}/rest`, { seconds: 60 }));
  const cardio = (await ok(c("POST", "/api/cardio", { date: D, type: "Running_Treadmill", minutes: 30, intensity: "zona2", distanceKm: 4 }))).data.id;
  const endpoint = `https://fcm.googleapis.com/fcm/send/${tag}`;
  await ok(c("POST", "/api/push/subscribe", { endpoint, p256dh: "BPk_abc", auth: "xyz" }));
  const pain = (await ok(c("POST", "/api/pains", { region: "ombro_e", intensity: 2, context: `${tag} dor` }))).data.id;
  const inbox = (await ok(c("POST", "/api/inbox", { text: `${tag} pedido` }))).data.id;
  const food = (await ok(c("POST", "/api/food", { date: D, text: `${tag} comida`, meal: "cafe" }))).data.id;
  const tpl = (await ok(c("POST", "/api/meal-templates", { name: `${tag} marmita`, text: `${tag} arroz` }))).data.id;
  // #43: base de alimentos pessoal (o ovo ajustado com a marca no nome)
  await ok(c("PUT", "/api/food-items/ovo", { nome: `${tag} ovo`, kcal: 150, prot: 13, carb: 1, gord: 10, unidades: [{ nome: "ovo", g: 55 }] }));
  const media = (await ok(call(env, "POST", `/api/media?note=${tag}`, { user, raw: PNG, ct: "image/png" }))).data.id;
  // #26: lugar só desta conta (nome, endereço e ponto no mapa com a marca) e mídia de aparelho dentro dele
  const lug = `lug_${user}`;
  await ok(c("PUT", `/api/gyms/${lug}`, { name: `${tag} lugar`, kind: "hotel", address: `${tag} rua`, lat: tag === "MARCA_B" ? -10.123 : -30.5, lng: tag === "MARCA_B" ? -20.456 : -50.5, equipment: ["halteres"], weekdays: ["sab"] }));
  const mediaLug = (await ok(call(env, "POST", `/api/media?gymId=${lug}&equipmentId=halteres&note=${tag}`, { user, raw: PNG, ct: "image/png" }))).data.id;
  await ok(c("GET", `/api/week?date=${D}`));
  await ok(c("POST", "/api/week/day/2026-11-07", { action: "gerar", today: D, opts: { focus: ["ombro"] } }));
  // #27 diário: checkout, lembrete, resumo dos dias e exame (texto bruto marcado)
  await ok(c("PUT", `/api/checkout/${D}`, { trained: false, alcohol: 2, smoke: true, note: `${tag} checkout`, cardio: { type: "Rope_Jumping", minutes: 10 } }));
  await ok(c("POST", "/api/diario/abrir", { today: D }));
  await ok(c("PUT", "/api/diario/lembrete", { snoozedOn: D }));
  await ok(c("POST", "/api/diario/resumo", { dias: [{ date: "2026-11-04", alcohol: 1, note: `${tag} resumo` }] }));
  // #42 recap: bebida e refeição viram registros na Comida, texto livre na nota
  await ok(c("POST", "/api/diario/recap", { from: "2026-10-30", to: "2026-11-01", dias: [{ date: "2026-10-31", alcool: { cerveja: 2 }, sleptWell: true }], refeicoes: [{ date: "2026-10-31", meal: "almoco", text: `${tag} almoço` }], texto: `${tag} recap` }));
  const exam = (await ok(c("POST", "/api/exames", { label: `${tag} exame`, text: `${tag} laudo` }))).data.id;
  const tok = (await ok(c("POST", "/api/account/tokens", { label: `${tag} token` }))).data;
  const exp = (await c("GET", "/api/account/export")).data;
  return { sid: SID, ex, cardio, food, tpl, endpoint, pain, inbox, media, lug, mediaLug, exam, tokenId: tok.id, token: tok.token, edit: exp.plan_edit[0].id, uid: exp.user.id };
}
const snap = async (env: any, user: string) => {
  const e = (await call(env, "GET", "/api/account/export", { user })).data;
  delete e.exportadoEm; delete e.user.last_seen_at; return JSON.stringify(e);
};

test("conta A não lê nem altera dados da conta B (todas as rotas e ferramentas)", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("[]", { status: 200 })); // Nominatim (busca de endereço) não sai da máquina
  const env = makeEnv();
  const B = await seed(env, "bia", "MARCA_B", SID_B, MARK_KG);
  const A = await seed(env, "ana", "MARCA_A", SID_A, 10);
  const before = await snap(env, "bia");
  const r2Before = [...env.MEDIA.m.keys()].filter((k: string) => k.includes(B.uid)).length;
  const secrets = ["MARCA_B", B.food, B.tpl, B.uid, B.pain, B.inbox, B.media, B.mediaLug, B.lug, "-10.123", "-20.456", B.tokenId, B.edit, B.cardio, B.exam, String(MARK_KG), "bia@"];
  const subsB = () => env.DB.raw.prepare("SELECT COUNT(*) AS n FROM push_subscription WHERE endpoint = ?1").get(B.endpoint).n;
  const restB = () => JSON.stringify(env.DB.raw.prepare("SELECT fire_at, sent_at FROM rest_timer WHERE user_id = ?1").get(B.uid));
  const restBefore = restB();
  const noLeak = (label: string, text: string) => { for (const s of secrets) assert.ok(!text.includes(s), `${label} vazou ${s}`); };

  const a = (m: string, p: string, body?: unknown) => call(env, m, p, { user: "ana", body });
  const cases: [string, () => Promise<{ status: number; text: string }>, number?][] = [
    ["GET /api/state", () => a("GET", `/api/state?date=${D}`)],
    ["GET /api/account", () => a("GET", "/api/account")],
    ["PATCH /api/account", () => a("PATCH", "/api/account", { onboarding: "concluido" })],
    ["GET /api/account/export", () => a("GET", "/api/account/export")],
    ["GET /api/account/tokens", () => a("GET", "/api/account/tokens")],
    ["POST /api/account/tokens", () => a("POST", "/api/account/tokens", { label: "x" })],
    ["DELETE /api/account/tokens/:id", () => a("DELETE", `/api/account/tokens/${B.tokenId}`), 404],
    ["PUT /api/measurements/:date", () => a("PUT", `/api/measurements/${D}`, { armCm: 40 })],
    ["PUT /api/profile", () => a("PUT", "/api/profile", profile("A2"))],
    ["GET /api/gyms", () => a("GET", "/api/gyms")],
    ["PUT /api/gyms/:id", () => a("PUT", "/api/gyms/acad1", { name: "A2", equipment: ["halteres"] })],
    ["DELETE /api/gyms/:id", () => a("DELETE", `/api/gyms/${B.lug}`), 404],
    ["GET /api/geocode", () => a("GET", "/api/geocode?q=Avenida%20Paulista")],
    ["PUT /api/checkin/:date", () => a("PUT", `/api/checkin/${D}`, { sleepH: 5, energy: 1, soreness: 0, stress: 1, food: 1 })],
    ["PUT /api/attendance/:date", () => a("PUT", `/api/attendance/${D}`, { status: "fui" })],
    ["GET /api/diario", () => a("GET", `/api/diario?from=2026-10-20&to=${D}`)],
    ["PUT /api/checkout/:date", () => a("PUT", `/api/checkout/${D}`, { alcohol: 0, cardio: { type: "HIIT", minutes: 5 } })],
    ["POST /api/diario/abrir", () => a("POST", "/api/diario/abrir", { today: "2026-11-09" })],
    ["PUT /api/diario/lembrete", () => a("PUT", "/api/diario/lembrete", { absenceDays: 3, dismissAbsence: true })],
    ["POST /api/diario/resumo", () => a("POST", "/api/diario/resumo", { dias: [{ date: "2026-11-04", trained: true, note: "A" }, { date: D, alcohol: 5 }] })],
    ["POST /api/diario/recap", () => a("POST", "/api/diario/recap", { from: "2026-10-30", to: "2026-11-01", dias: [{ date: "2026-10-31", alcool: {}, sleptWell: false, trained: true }], refeicoes: [{ date: "2026-10-31", meal: "almoco", naoLembro: true }], texto: "A" })],
    ["POST /api/exames", () => a("POST", "/api/exames", { text: "A laudo 2" }), 201],
    ["DELETE /api/exames/:id", () => a("DELETE", `/api/exames/${B.exam}`), 404],
    ["POST /api/plan-day", () => a("POST", "/api/plan-day", { date: D, daysLeft: 2, gymId: "acad1" })],
    ["PUT /api/day-plan/:date", () => a("PUT", `/api/day-plan/${D}`, { plan: { items: [] } })],
    ["POST /api/plan-edits", () => a("POST", "/api/plan-edits", { date: D, edit: { index: 0, sets: 3 } }), 422],
    ["GET /api/week", () => a("GET", `/api/week?date=${D}`)],
    ["PUT /api/week", () => a("PUT", "/api/week", { date: D, version: 1 })],
    ["POST /api/week/regenerate", () => a("POST", "/api/week/regenerate", { date: D, apply: true, reset: true })],
    ["POST /api/week/day/:date", () => a("POST", "/api/week/day/2026-11-08", { action: "folga", today: D })],
    ["POST /api/sessions/:id/sets", () => a("POST", `/api/sessions/${B.sid}/sets`, { exerciseId: B.ex, muscle: "ombro", setNo: 1, kg: 1, reps: 1 })],
    ["POST /api/sessions/:id/skip", () => a("POST", `/api/sessions/${B.sid}/skip`, { exerciseId: B.ex, reason: "dor" })],
    ["GET /api/sessions/:id", () => a("GET", `/api/sessions/${B.sid}`), 404],
    ["GET /api/sessions", () => a("GET", "/api/sessions")],
    ["DELETE /api/sessions/:id/sets/:exerciseId/:setNo", () => a("DELETE", `/api/sessions/${B.sid}/sets/${B.ex}/1`)],
    ["PUT /api/sessions/:id/rest", () => a("PUT", `/api/sessions/${B.sid}/rest`, { seconds: 30 })],
    ["DELETE /api/sessions/:id/rest", () => a("DELETE", `/api/sessions/${B.sid}/rest`)],
    ["GET /api/exercises/:id/history", () => a("GET", `/api/exercises/${B.ex}/history`)],
    ["GET /api/history/last", () => a("GET", `/api/history/last?ids=${B.ex}`)],
    ["GET /api/push/key", () => a("GET", "/api/push/key")],
    ["POST /api/push/subscribe", () => a("POST", "/api/push/subscribe", { endpoint: "https://fcm.googleapis.com/fcm/send/MARCA_A", p256dh: "BPk_abc", auth: "xyz" }), 201],
    ["DELETE /api/push/subscribe", () => a("DELETE", "/api/push/subscribe", { endpoint: B.endpoint })],
    ["POST /api/cardio", () => a("POST", "/api/cardio", { date: D, type: "Bicycling_Stationary", minutes: 15, intensity: "moderado" }), 201],
    ["GET /api/cardio", () => a("GET", "/api/cardio")],
    ["DELETE /api/cardio/:id", () => a("DELETE", `/api/cardio/${B.cardio}`), 404],
    ["POST /api/sessions/:id/finish", () => a("POST", `/api/sessions/${B.sid}/finish`, { feedback: {} })],
    ["POST /api/sessions", () => a("POST", "/api/sessions", { id: B.sid, date: D, plan: {} }), 201],
    ["POST /api/pains", () => a("POST", "/api/pains", { region: "ombro_e", intensity: 3 })],
    ["POST /api/pains/:id/resolve", () => a("POST", `/api/pains/${B.pain}/resolve`), 404],
    ["POST /api/inbox", () => a("POST", "/api/inbox", { text: "oi" })],
    ["POST /api/inbox/:id/status", () => a("POST", `/api/inbox/${B.inbox}/status`, { status: "descartado" }), 404],
    ["POST /api/food", () => a("POST", "/api/food", { date: D, text: "arroz" }), 201],
    ["GET /api/food", () => a("GET", `/api/food?from=${D}&to=${D}`)],
    ["PUT /api/food/:id", () => a("PUT", `/api/food/${B.food}`, { text: "hackeado", kcal: 1 }), 404],
    ["DELETE /api/food/:id", () => a("DELETE", `/api/food/${B.food}`), 404],
    ["GET /api/food-items", () => a("GET", "/api/food-items")],
    ["PUT /api/food-items/:key", () => a("PUT", "/api/food-items/ovo", { nome: "A ovo", kcal: 140, prot: 12, carb: 1, gord: 9, unidades: [{ nome: "ovo", g: 50 }] })],
    ["DELETE /api/food-items/:key", () => a("DELETE", "/api/food-items/ovo")],
    ["DELETE /api/food-items/:key (já apagado)", () => a("DELETE", "/api/food-items/ovo"), 404],
    ["POST /api/meal-templates", () => a("POST", "/api/meal-templates", { name: "A", text: "pão" }), 201],
    ["DELETE /api/meal-templates/:id", () => a("DELETE", `/api/meal-templates/${B.tpl}`), 404],
    ["GET /api/home", () => a("GET", `/api/home?date=${D}`)],
    ["GET /api/diet", () => a("GET", `/api/diet?date=${D}`)],
    ["POST /api/diet/adapt", () => a("POST", "/api/diet/adapt", { date: D })],
    ["POST /api/transcribe", () => call(env, "POST", "/api/transcribe", { user: "ana", raw: PNG, ct: "audio/webm" })],
    ["POST /api/media", () => call(env, "POST", "/api/media", { user: "ana", raw: PNG, ct: "image/png" })],
    ["GET /api/media", () => a("GET", "/api/media")],
    ["GET /api/media (lugar da B)", () => a("GET", `/api/media?gymId=${B.lug}&equipmentId=halteres`)],
    ["POST /api/media (lugar da B)", () => call(env, "POST", `/api/media?gymId=${B.lug}&equipmentId=halteres`, { user: "ana", raw: PNG, ct: "image/png" }), 404],
    ["POST /api/media (tipo errado)", () => call(env, "POST", "/api/media?gymId=acad1&equipmentId=halteres", { user: "ana", raw: PNG, ct: "text/html" }), 415],
    ["GET /api/media/:id", () => a("GET", `/api/media/${B.media}`), 404],
    ["GET /api/media/:id (mídia do lugar da B)", () => a("GET", `/api/media/${B.mediaLug}`), 404],
  ];
  const tools: [string, Record<string, unknown>, boolean?][] = [
    ["ciclo_estado", { date: D }], ["ciclo_contexto", { pedido: "revisao", date: D }], ["ciclo_catalogo", { muscle: "ombro", gymId: "acad1" }], ["ciclo_planejar_dia", { date: D, daysLeft: 2 }],
    ["ciclo_salvar_treino_do_dia", { date: D, itens: [{ id: "x_inexistente", sets: 2 }], motivo: "t" }],
    ["ciclo_responder_pedido", { id: B.inbox, resposta: "oi" }, true], ["ciclo_marcar_presenca", { date: D, status: "nao_fui" }],
    ["ciclo_registrar_dor", { region: "ombro_e", intensity: 1 }], ["ciclo_registrar_comida", { texto: "pão", date: D }],
    ["ciclo_comida_dia", { date: D }], ["ciclo_comida_corrigir", { id: B.food, kcal: 1, proteina: 1, confianca: "alta" }, true],
    ["ciclo_salvar_perfil", { perfil: { minutes: 45 } }], ["ciclo_revisar_edicoes", {}], ["ciclo_concluir_revisao", { id: B.edit, review: "ok" }, true],
    ["ciclo_diario", { from: "2026-11-01", to: D }], ["ciclo_registrar_resumo_dias", { dias: [{ date: D, alcohol: 3, sleptWell: false }] }],
    ["ciclo_exame_pendente", {}], ["ciclo_exame_concluir", { id: B.exam, resumo: { marcadores: [{ nome: "TSH", valor: 1, status: "dentro" }] } }, true],
  ];
  assert.deepEqual([...new Set(cases.map((c) => c[0].replace(/ \(.*\)$/, "")))].concat("DELETE /api/account").sort(), routeSignatures().sort(), "toda rota precisa de caso de isolamento");
  assert.deepEqual(tools.map((t) => t[0]).sort(), [...toolNames].sort(), "toda ferramenta MCP precisa de caso");

  for (const [sig, run, status] of cases) {
    const r = await run();
    if (status) assert.equal(r.status, status, `${sig}: ${r.text}`); else assert.ok(r.status < 300, `${sig}: ${r.status} ${r.text}`);
    noLeak(sig, r.text);
  }
  for (const [name, args, isErr] of tools) {
    const r = await mcp(env, A.token, name, args);
    assert.equal(r.status, 200); assert.equal(!!r.data.result.isError, !!isErr, `${name}: ${r.text}`);
    noLeak(name, r.text);
  }
  const up = await call(env, "POST", "/mcp/media", { bearer: A.token, raw: PNG, ct: "image/png" });
  assert.equal(up.status, 201);
  noLeak("export A", (await a("GET", "/api/account/export")).text);

  assert.equal((await a("DELETE", "/api/account", { confirm: "APAGAR" })).status, 200);
  assert.equal(await snap(env, "bia"), before, "dados da B mudaram");
  assert.equal(subsB(), 1, "assinatura de push da B apagada pela A");
  assert.equal(restB(), restBefore, "descanso da B alterado pela A");
  assert.equal([...env.MEDIA.m.keys()].filter((k: string) => k.includes(B.uid)).length, r2Before);
  assert.equal((await mcp(env, B.token, "ciclo_estado")).status, 200);
});
