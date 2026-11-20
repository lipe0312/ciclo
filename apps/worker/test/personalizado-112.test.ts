// #112 Exercício personalizado (cus_) em todos os caminhos: registrar (MCP e app), trocar, salvar o treino do dia e o
// "Meu treino atual". Conta volume no músculo cadastrado nele e nunca vira troca forçada. cus_ de outra conta → 400. Tudo fictício.
import { test } from "node:test";
import assert from "node:assert/strict";
import { EQUIPMENT } from "@ciclo/core";
import { call, makeEnv, mcp } from "./fakes.ts";

const HOJE = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const ALL = EQUIPMENT.map((e) => e.id);
const EX = [
  { nome: "Y-T-W fictício", musculo: "post", descricao: "De bruços, braços em Y, T e W." },
  { nome: "Panturrilha unilateral fictícia", musculo: "pant", descricao: "Num degrau, uma perna por vez." },
  { nome: "Afundo reverso fictício", musculo: "quad", descricao: "Passo para trás e desce o joelho." },
];

async function tool(env: unknown, token: string, name: string, args: Record<string, unknown> = {}) {
  const r = await mcp(env, token, name, args);
  assert.equal(r.status, 200, r.text);
  const txt = r.data.result.content[0].text as string;
  return r.data.result.isError ? { erro: txt } : JSON.parse(txt);
}
async function conta(env: any, user: string) {
  const c = (m: string, p: string, body?: unknown) => call(env, m, p, { user, body });
  assert.equal((await c("PUT", "/api/profile", { data: { level: 1, priorities: ["ombro"], minutes: 60, daysTarget: 4, prefs: {}, pinned: {}, avoid: [], goal: { statement: "objetivo fictício" } } })).status, 200);
  assert.equal((await c("PUT", "/api/gyms/acad1", { name: "Academia Exemplo", equipment: ALL })).status, 200);
  const t = await c("POST", "/api/account/tokens", { label: "teste" });
  assert.equal(t.status, 201, t.text);
  const ids: string[] = [];
  for (const x of EX) ids.push((await tool(env, t.data.token, "ciclo_exercicio_criar", { jaBusqueiNoCatalogo: true, ...x })).exercicio.id);
  return { token: t.data.token as string, c, ids };
}
const versao = (env: any) => env.DB.raw.prepare("SELECT COUNT(*) AS n FROM week_plan").get().n as number;

test("registrar 3 cus_ pelo MCP: volume no músculo cadastrado, sem troca forçada e sem reorganizar a semana", async () => {
  const env = makeEnv();
  const a = await conta(env, "ana");
  const s = await tool(env, a.token, "ciclo_salvar_treino_do_dia", { date: HOJE, itens: [{ id: "Reverse_Flyes", sets: 3 }, { id: "Side_Lateral_Raise", sets: 3 }], motivo: "teste fictício" });
  assert.equal(s.salvo, true, JSON.stringify(s));
  await tool(env, a.token, "ciclo_semana_ver", { date: HOJE });
  const antes = versao(env);
  for (const id of a.ids) {
    const r = await tool(env, a.token, "ciclo_treino_registrar", { exercicioId: id, series: [{ kg: 4, reps: 12 }, { kg: 4, reps: 12 }] });
    assert.equal(r.registrado, 2, JSON.stringify(r));
    assert.doesNotMatch(r.nota, /troca forçada: a semana repõe/);
    assert.match(r.nota, /não vira troca forçada/);
  }
  const vol = env.DB.raw.prepare("SELECT exercise_id AS ex, muscle, COUNT(*) AS n FROM set_log GROUP BY exercise_id, muscle").all() as { ex: string; muscle: string; n: number }[];
  assert.deepEqual(a.ids.map((id) => vol.find((v) => v.ex === id)?.muscle), ["post", "pant", "quad"]);
  assert.ok(vol.every((v) => v.n === 2));
  const sem = await tool(env, a.token, "ciclo_semana_ver", { date: HOJE });
  assert.ok(sem.dias, JSON.stringify(sem));
  assert.equal(versao(env), antes, "a semana não ganhou versão nova (nada reorganizou)");
  // controle: um exercício do catálogo de outra parte no lugar do planejado reorganiza (troca forçada)
  await tool(env, a.token, "ciclo_treino_registrar", { exercicioId: "Seated_Dumbbell_Press", series: [{ kg: 10, reps: 10 }, { kg: 10, reps: 10 }, { kg: 10, reps: 10 }] });
  await tool(env, a.token, "ciclo_semana_ver", { date: HOJE });
  assert.ok(versao(env) > antes, "controle: a troca forçada do catálogo segue valendo");
});

test("ciclo_treino_trocar aceita cus_ da conta (alternativas pelo músculo dele); de outra conta → erro", async () => {
  const env = makeEnv();
  const a = await conta(env, "ana"), b = await conta(env, "bia");
  const r = await tool(env, a.token, "ciclo_treino_trocar", { exercicioId: a.ids[1] });
  assert.equal(r.musculo, "pant", JSON.stringify(r));
  assert.ok(r.alternativas.length > 0); // #125 top 3 compacto
  const catalogo = await tool(env, a.token, "ciclo_catalogo", { muscle: "pant" });
  assert.ok(JSON.stringify(catalogo).includes(r.alternativas[0].id), "alternativa de panturrilha do catálogo");
  assert.match((await tool(env, b.token, "ciclo_treino_trocar", { exercicioId: a.ids[1] })).erro, /cus_ desta conta/);
});

test("app: série de cus_ conta no músculo dele (ignora o do corpo); cus_ de outra conta → 400", async () => {
  const env = makeEnv();
  const a = await conta(env, "ana"), b = await conta(env, "bia");
  const sa = await a.c("POST", "/api/sessions", { date: HOJE, plan: { items: [] } });
  assert.equal(sa.status, 201, sa.text);
  const ok = await a.c("POST", `/api/sessions/${sa.data.id}/sets`, { exerciseId: a.ids[2], setNo: 1, kg: 8, reps: 10, muscle: "peito" });
  assert.equal(ok.status, 200, ok.text); assert.equal(ok.data.saved, true);
  assert.equal(env.DB.raw.prepare("SELECT muscle FROM set_log WHERE exercise_id = ?").get(a.ids[2]).muscle, "quad");
  const sb = await b.c("POST", "/api/sessions", { date: HOJE, plan: { items: [] } });
  const outro = await b.c("POST", `/api/sessions/${sb.data.id}/sets`, { exerciseId: a.ids[2], setNo: 1, kg: 8, reps: 10, muscle: "quad" });
  assert.equal(outro.status, 400, outro.text);
  // MCP de outra conta também recusa
  assert.ok((await tool(env, b.token, "ciclo_treino_registrar", { exercicioId: a.ids[0], series: [{ kg: 1, reps: 1 }] })).erro);
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM set_log WHERE exercise_id = ?").get(a.ids[0]).n, 0);
});

test("salvar treino do dia com cus_ da conta; de outra conta não salva", async () => {
  const env = makeEnv();
  const a = await conta(env, "ana"), b = await conta(env, "bia");
  const s = await tool(env, a.token, "ciclo_salvar_treino_do_dia", { date: HOJE, itens: a.ids.map((id) => ({ id, sets: 3 })), motivo: "teste fictício" });
  assert.equal(s.salvo, true, JSON.stringify(s));
  const x = await tool(env, b.token, "ciclo_salvar_treino_do_dia", { date: HOJE, itens: [{ id: a.ids[0], sets: 3 }], motivo: "t" });
  assert.equal(x.salvo, false);
});

test("Meu treino atual aceita cus_ da conta (MCP e app); de outra conta → 400", async () => {
  const env = makeEnv();
  const a = await conta(env, "ana"), b = await conta(env, "bia");
  const treino = (id: string) => ({ divisoes: [{ nome: "Pernas", grupos: ["pernas"], exercicios: [{ id, sets: 3 }, { id: "Hack_Squat", sets: 3 }] }] });
  const s = await tool(env, a.token, "ciclo_treino_atual_salvar", { treinoAtual: treino(a.ids[1]) });
  assert.equal(s.salvo, true, JSON.stringify(s));
  const l = await tool(env, a.token, "ciclo_treino_atual");
  const it = l.treinoAtual.divisoes[0].exercicios.find((x: any) => x.id === a.ids[1]);
  assert.deepEqual(it.nm, { tipo: "dado_do_usuario", texto: EX[1].nome });
  // app: PUT do perfil inteiro com o treino que já tem cus_ continua salvando
  assert.equal((await a.c("PUT", "/api/profile", { data: { level: 1, priorities: ["ombro"], minutes: 60, daysTarget: 4, prefs: {}, pinned: {}, avoid: [], goal: { statement: "objetivo fictício" }, treinoAtual: treino(a.ids[2]) } })).status, 200);
  // outra conta: recusa no MCP e no app
  assert.match((await tool(env, b.token, "ciclo_treino_atual_salvar", { treinoAtual: treino(a.ids[1]) })).erro, /não existe no catálogo/);
  assert.equal((await b.c("PUT", "/api/profile", { data: { level: 1, priorities: ["ombro"], minutes: 60, daysTarget: 4, prefs: {}, pinned: {}, avoid: [], goal: { statement: "objetivo fictício" }, treinoAtual: treino(a.ids[1]) } })).status, 400);
});
