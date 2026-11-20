// #125 ciclo_treino_trocar devolve a mesma lista do app (banco fixo, mesma academia), só o top 3 {id, nome, motivo};
// itens compactos aceitam `par` e o servidor recusa par de músculos que competem. Dados fictícios.
import { test } from "node:test";
import assert from "node:assert/strict";
import { EQUIPMENT, MCP_ORCAMENTO_BYTES, alternativas, idsAlternativas, topAlternativas } from "@ciclo/core";
import { call, makeEnv, mcp } from "./fakes.ts";

const D = "2026-11-16"; // segunda
const ALL = EQUIPMENT.map((e) => e.id);
const CASA = ["halteres", "banco", "ez"];

async function tool(env: unknown, token: string, name: string, args: Record<string, unknown> = {}) {
  const r = await mcp(env, token, name, args);
  assert.equal(r.status, 200, r.text);
  const txt = r.data.result.content[0].text as string;
  assert.ok(Buffer.byteLength(txt) <= MCP_ORCAMENTO_BYTES);
  return r.data.result.isError ? { erro: txt } : JSON.parse(txt);
}
async function conta(env: any, user: string) {
  const c = (m: string, p: string, body?: unknown) => call(env, m, p, { user, body });
  const perfil = { level: 1, priorities: ["ombro", "biceps"], minutes: 60, daysTarget: 4, prefs: {}, pinned: {}, avoid: [], goal: { statement: "objetivo fictício" }, dayGym: { seg: "acad1" } };
  assert.equal((await c("PUT", "/api/profile", { data: perfil })).status, 200);
  for (const [id, name, equipment] of [["acad1", "Academia Exemplo", ALL], ["casa", "Casa fictícia", CASA]] as const) assert.equal((await c("PUT", `/api/gyms/${id}`, { name, equipment })).status, 200);
  const t = await c("POST", "/api/account/tokens", { label: "teste" });
  return { token: t.data.token as string, c };
}

test("ciclo_treino_trocar: top 3 compacto, na mesma ordem do Detalhe/Trocar do app para a mesma academia", async () => {
  const env = makeEnv();
  const a = await conta(env, "ana");
  for (const [ex, gymId, eq] of [["Incline_Dumbbell_Curl", "acad1", ALL], ["Side_Lateral_Raise", "casa", CASA], ["Triceps_Pushdown", "acad1", ALL]] as const) {
    const r = await tool(env, a.token, "ciclo_treino_trocar", { exercicioId: ex, date: D, gymId });
    assert.equal(r.academia, gymId);
    assert.deepEqual(r.alternativas.map((x: any) => x.id), idsAlternativas(ex, { equipment: [...eq] }).slice(0, 3), ex);
    assert.deepEqual(Object.keys(r.alternativas[0]).sort(), ["id", "motivo", "nome"], "compacto: só id, nome e motivo");
    assert.equal(r.alternativas[0].motivo, topAlternativas(alternativas(ex, { equipment: [...eq] }), 1)[0].motivo);
    assert.equal(r.mesmaParte, undefined); assert.equal(r.outraParte, undefined);
  }
  // casa sem polia: a elevação no cabo não aparece e conta como "precisa de aparelho"
  const casa = await tool(env, a.token, "ciclo_treino_trocar", { exercicioId: "Side_Lateral_Raise", date: D, gymId: "casa" });
  assert.ok(!casa.alternativas.some((x: any) => x.id === "Cable_Seated_Lateral_Raise"));
  assert.ok(casa.precisaDeAparelho > 0);
  assert.match((await tool(env, a.token, "ciclo_treino_trocar", { exercicioId: "Side_Lateral_Raise", limite: 5 })).erro ?? "", /limite/);
});

test("salvar treino com par: bíceps × tríceps salva com A1/A2; bíceps × bíceps é recusado (nada gravado)", async () => {
  const env = makeEnv();
  const a = await conta(env, "ana");
  const ok = await tool(env, a.token, "ciclo_salvar_treino_do_dia", { date: D, gymId: "acad1", motivo: "teste", itens: [{ id: "Dumbbell_Bicep_Curl", sets: 3, par: "A1" }, { id: "Triceps_Pushdown", sets: 3, par: "A2" }] });
  assert.equal(ok.salvo, true, JSON.stringify(ok));
  const linha = (d: string) => env.DB.raw.prepare("SELECT plan FROM day_plan WHERE date = ?1").get(d) as { plan: string } | undefined;
  assert.deepEqual(JSON.parse(linha(D)!.plan).items.map((i: any) => i.par), ["A1", "A2"], "par fica no JSON do plano (sem coluna nova)");
  const D2 = "2026-11-17";
  const ruim = await tool(env, a.token, "ciclo_salvar_treino_do_dia", { date: D2, gymId: "acad1", motivo: "teste", itens: [{ id: "Dumbbell_Bicep_Curl", sets: 3, par: "A1" }, { id: "Hammer_Curls", sets: 3, par: "A2" }] });
  assert.equal(ruim.salvo, false);
  assert.ok(ruim.problemas.some((p: any) => p.code === "par" && p.severity === "erro"), JSON.stringify(ruim));
  assert.equal(linha(D2), undefined, "nada gravado");
  // formato fora do padrão é recusado pelo schema
  assert.match((await tool(env, a.token, "ciclo_salvar_treino_do_dia", { date: D2, gymId: "acad1", motivo: "t", itens: [{ id: "Dumbbell_Bicep_Curl", sets: 3, par: "Z9" }] })).erro ?? "", /par/);
});
