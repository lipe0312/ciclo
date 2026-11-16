// #107 Exercício personalizado: a IA cria pelo MCP (só depois do catálogo), usa no treino do dia (hidratado), a pessoa
// edita e apaga no app, limite de 200 por conta e isolamento entre contas. Tudo fictício.
import { test } from "node:test";
import assert from "node:assert/strict";
import { EQUIPMENT, LIMITE_PERSONALIZADOS, MCP_ORCAMENTO_BYTES } from "@ciclo/core";
import { INSTRUCTIONS } from "../src/mcp.ts";
import { call, makeEnv, mcp } from "./fakes.ts";

const HOJE = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const ALL = EQUIPMENT.map((e) => e.id);
const V = "dQw4w9WgXcQ";
const NOVO = { jaBusqueiNoCatalogo: true, nome: "Elevação Y no banco inclinado", musculo: "ombro", aparelho: "halteres", descricao: "De bruços no banco a 30°, sobe os halteres em Y até a linha da orelha.", video: `https://youtu.be/${V}` };

async function tool(env: unknown, token: string, name: string, args: Record<string, unknown> = {}) {
  const r = await mcp(env, token, name, args);
  assert.equal(r.status, 200, r.text);
  const txt = r.data.result.content[0].text as string;
  assert.ok(Buffer.byteLength(txt) <= MCP_ORCAMENTO_BYTES, `${name}: ${Buffer.byteLength(txt)} bytes`);
  return r.data.result.isError ? { erro: txt } : JSON.parse(txt);
}
async function conta(env: any, user: string) {
  const c = (m: string, p: string, body?: unknown) => call(env, m, p, { user, body });
  assert.equal((await c("PUT", "/api/profile", { data: { level: 1, priorities: ["ombro"], minutes: 60, daysTarget: 4, prefs: {}, pinned: {}, avoid: [], goal: { statement: "objetivo fictício" } } })).status, 200);
  assert.equal((await c("PUT", "/api/gyms/acad1", { name: "Academia Exemplo", equipment: ALL })).status, 200);
  const t = await c("POST", "/api/account/tokens", { label: "teste" });
  assert.equal(t.status, 201, t.text);
  return { token: t.data.token as string, c };
}

test("instruções do servidor MCP: catálogo primeiro, personalizado só como último recurso", () => {
  assert.match(INSTRUCTIONS, /catálogo primeiro: ciclo_exercicio_criar \(cus_…\) só como último recurso, depois de buscar e não achar/);
});

test("MCP cria o personalizado (só depois do catálogo), usa no treino do dia e ele aparece hidratado", async () => {
  const env = makeEnv();
  const a = await conta(env, "ana");
  // sem dizer que buscou no catálogo: recusa e lembra a ordem
  assert.match((await tool(env, a.token, "ciclo_exercicio_criar", { ...NOVO, jaBusqueiNoCatalogo: false })).erro, /último recurso: antes, busque no ciclo_catalogo/);
  // vídeo fora do YouTube: recusa
  assert.match((await tool(env, a.token, "ciclo_exercicio_criar", { ...NOVO, video: `https://youtube.com.evil.com/watch?v=${V}` })).erro, /videoUrl: só link do YouTube/);
  const r = await tool(env, a.token, "ciclo_exercicio_criar", NOVO);
  assert.equal(r.criado, true, JSON.stringify(r));
  const id = r.exercicio.id as string;
  assert.match(id, /^cus_[a-z0-9]{12}$/);
  assert.deepEqual(r.exercicio.nome, { tipo: "dado_do_usuario", texto: NOVO.nome });
  assert.equal(r.exercicio.video, `https://www.youtube.com/watch?v=${V}`);
  assert.match(r.lembrete, /último recurso/);
  // mesmo nome e músculo: devolve o existente (não duplica)
  const de1 = await tool(env, a.token, "ciclo_exercicio_criar", NOVO);
  assert.equal(de1.criado, false); assert.equal(de1.exercicio.id, id);
  // aparece no catálogo do músculo, como personalizado da conta
  assert.equal((await tool(env, a.token, "ciclo_catalogo", { muscle: "ombro" })).personalizados[0].id, id);

  const s = await tool(env, a.token, "ciclo_salvar_treino_do_dia", { date: HOJE, itens: [{ id, sets: 3 }, { id: "Side_Lateral_Raise", sets: 3 }], motivo: "teste fictício" });
  assert.equal(s.salvo, true, JSON.stringify(s));
  const st = (await a.c("GET", `/api/state?date=${HOJE}`)).data;
  const it = st.dayPlan.plan.items.find((i: any) => i.exerciseId === id);
  assert.ok(it, "o personalizado está no treino do dia");
  assert.equal(it.nm, NOVO.nome); assert.equal(it.muscle, "ombro"); assert.equal(it.personalizado, true); assert.equal(it.sets, 3);
  assert.equal(st.personalizados[0].descricao, NOVO.descricao);
  // registrar séries do personalizado pelo MCP também vale
  const reg = await tool(env, a.token, "ciclo_treino_registrar", { exercicioId: id, series: [{ kg: 6, reps: 12 }] });
  assert.equal(reg.registrado, 1, JSON.stringify(reg));
});

test("o dono edita e apaga no app; nome com <script> volta como texto (a tela escapa)", async () => {
  const env = makeEnv();
  const a = await conta(env, "ana");
  const id = (await tool(env, a.token, "ciclo_exercicio_criar", { ...NOVO, nome: "<script>alert(1)</script> remada" })).exercicio.id;
  const l = await a.c("GET", "/api/exercicios-personalizados");
  assert.equal(l.status, 200); assert.equal(l.data.exercicios[0].nome, "<script>alert(1)</script> remada");
  assert.equal(l.headers.get("Content-Type"), "application/json; charset=utf-8");
  const e = await a.c("PATCH", `/api/exercicios-personalizados/${id}`, { nome: "Remada fictícia", videoUrl: "" });
  assert.equal(e.status, 200, e.text); assert.equal(e.data.exercicio.nome, "Remada fictícia"); assert.equal(e.data.exercicio.videoUrl, null);
  assert.equal((await a.c("PATCH", `/api/exercicios-personalizados/${id}`, { videoUrl: "javascript:alert(1)" })).status, 400);
  assert.equal((await a.c("PATCH", `/api/exercicios-personalizados/${id}`, { musculo: "pescoco" })).status, 400);
  assert.equal((await a.c("DELETE", `/api/exercicios-personalizados/${id}`)).status, 200);
  assert.equal((await a.c("DELETE", `/api/exercicios-personalizados/${id}`)).status, 404);
  assert.equal((await a.c("GET", "/api/exercicios-personalizados")).data.exercicios.length, 0);
});

test(`limite de ${LIMITE_PERSONALIZADOS} personalizados por conta`, async () => {
  const env = makeEnv();
  const a = await conta(env, "ana");
  await tool(env, a.token, "ciclo_exercicio_criar", NOVO);
  const uid = env.DB.raw.prepare("SELECT user_id FROM exercicio_personalizado").get().user_id;
  const ins = env.DB.raw.prepare("INSERT INTO exercicio_personalizado (user_id, id, nome, musculo, descricao, criado_por, created_at, updated_at) VALUES (?, ?, ?, 'ombro', 'x', 'ia', 1, 1)");
  for (let i = 1; i < LIMITE_PERSONALIZADOS; i++) ins.run(uid, `cus_lim${String(i).padStart(5, "0")}`, `Fictício ${i}`);
  const r = await tool(env, a.token, "ciclo_exercicio_criar", { ...NOVO, nome: "Mais um fictício" });
  assert.match(r.erro, /limite de 200 exercícios personalizados/);
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM exercicio_personalizado").get().n, LIMITE_PERSONALIZADOS);
});

test("isolamento: a conta B não vê, não edita, não apaga e não usa o cus_ da A", async () => {
  const env = makeEnv();
  const a = await conta(env, "ana"), b = await conta(env, "bia");
  const id = (await tool(env, a.token, "ciclo_exercicio_criar", { ...NOVO, nome: "MARCA_A elevação" })).exercicio.id as string;
  const lista = await b.c("GET", "/api/exercicios-personalizados");
  assert.equal(lista.data.exercicios.length, 0); assert.ok(!lista.text.includes("MARCA_A"));
  assert.ok(!(await b.c("GET", `/api/state?date=${HOJE}`)).text.includes("MARCA_A"));
  assert.ok(!JSON.stringify(await tool(env, b.token, "ciclo_catalogo", { muscle: "ombro" })).includes("MARCA_A"));
  assert.equal((await b.c("PATCH", `/api/exercicios-personalizados/${id}`, { nome: "hackeado" })).status, 404);
  assert.equal((await b.c("DELETE", `/api/exercicios-personalizados/${id}`)).status, 404);
  // usar no treino do dia: recusa mesmo mandando nome e músculo (o caminho "exercício seu" não serve para cus_)
  const s = await tool(env, b.token, "ciclo_salvar_treino_do_dia", { date: HOJE, itens: [{ id, sets: 3, nm: "qualquer", muscle: "ombro" }], motivo: "t" });
  assert.equal(s.salvo, false); assert.ok(s.problemas.some((p: any) => p.code === "id_desconhecido"), JSON.stringify(s));
  assert.match((await tool(env, b.token, "ciclo_treino_registrar", { exercicioId: id, series: [{ kg: 1, reps: 1 }] })).erro, /use um ID do ciclo_catalogo/);
  // o da A segue intacto
  assert.equal((await a.c("GET", "/api/exercicios-personalizados")).data.exercicios[0].nome, "MARCA_A elevação");
});
