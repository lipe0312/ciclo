// #90 ciclo_contexto (gerar = semana, tempo = treino avulso) traz o resumo do histórico pronto, da conta do token e dentro
// do teto de tamanho. Dados fictícios.
import { test } from "node:test";
import assert from "node:assert/strict";
import { EQUIPMENT, TETO_TOKENS, estimarTokens } from "@ciclo/core";
import { call, makeEnv, mcp } from "./fakes.ts";

const D = "2026-11-20", ALL = EQUIPMENT.map((e) => e.id);
const addDays = (iso: string, n: number) => new Date(Date.parse(iso + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const ok = async (p: Promise<{ status: number; text: string; data: any }>) => { const r = await p; assert.ok(r.status < 300, `${r.status} ${r.text}`); return r; };

/** 4 semanas fazendo o mesmo treino superior (2× por semana) */
async function seed(env: any, user: string, ex: string[], tag: string) {
  const c = (m: string, p: string, body?: unknown) => call(env, m, p, { user, body });
  await ok(c("PUT", "/api/profile", { data: { level: 1, priorities: ["ombro", "biceps", "triceps"], minutes: 60, daysTarget: 4, pinned: { biceps: "Incline_Dumbbell_Curl" }, avoid: ["Upright_Barbell_Row"], goal: { id: "bracos_ombros", statement: `${tag} objetivo` } } }));
  await ok(c("PUT", "/api/gyms/acad1", { name: `${tag} academia`, equipment: ALL }));
  const plan = (await ok(c("POST", "/api/plan-day", { date: D, daysLeft: 3 }))).data.plan;
  for (let k = 1; k <= 8; k++) {
    const date = addDays(D, -(k * 3 + (k > 4 ? 1 : 0)));
    const sid = crypto.randomUUID();
    await ok(c("POST", "/api/sessions", { id: sid, date, plan }));
    for (const id of ex) for (let s = 1; s <= 3; s++) await ok(c("POST", `/api/sessions/${sid}/sets`, { exerciseId: id, setNo: s, kg: 10 + k, reps: 10 }));
  }
  await ok(c("PUT", `/api/attendance/${addDays(D, -2)}`, { status: "nao_fui", reason: `${tag} motivo` }));
  return (await ok(call(env, "POST", "/api/account/tokens", { user, body: { label: "t" } }))).data.token as string;
}

test("ciclo_contexto gerar/tempo: resumo do histórico (janelas, repetição, preferências) da conta do token, dentro do teto", async () => {
  const env = makeEnv();
  await seed(env, "bia", ["Hammer_Curls", "Triceps_Pushdown"], "MARCA_B");
  const tok = await seed(env, "ana", ["Side_Lateral_Raise", "Incline_Dumbbell_Curl"], "MARCA_A");
  for (const [pedido, tipo] of [["gerar", "semana"], ["tempo", "dia"]] as const) {
    const r = await mcp(env, tok, "ciclo_contexto", { pedido, date: D });
    assert.equal(r.status, 200);
    const txt = r.data.result.content[0].text as string;
    const f = JSON.parse(txt);
    assert.deepEqual(f.historico.janela, { tipo, mes: [addDays(D, -27), D], recente: [addDays(D, -6), D] });
    assert.deepEqual(f.historico.repetidos.map((x: any) => x.id).sort(), ["Incline_Dumbbell_Curl", "Side_Lateral_Raise"], "só a conta do token");
    assert.ok(f.historico.repetidos.every((x: any) => x.sessoes === 8));
    assert.deepEqual(f.historico.cansados, ["Side_Lateral_Raise"], "o fixado (sempre) não entra na anti-repetição");
    assert.deepEqual(f.historico.sempre, ["Incline_Dumbbell_Curl"]);
    assert.deepEqual(f.historico.nunca, ["Upright_Barbell_Row"]);
    assert.equal(f.historico.faltas, 1);
    for (const s of ["MARCA_B", "MARCA_A motivo", "Hammer_Curls"]) assert.ok(!txt.includes(s), `${pedido} vazou ${s}`);
    assert.ok(estimarTokens(txt) <= TETO_TOKENS[pedido], `${pedido}: ${estimarTokens(txt)} tokens`);
  }
  const troca = JSON.parse((await mcp(env, tok, "ciclo_contexto", { pedido: "trocar", date: D })).data.result.content[0].text);
  assert.equal(troca.historico, undefined, "só gerar e tempo levam o histórico");
});
