// #95 O MCP lê o "Meu treino atual" e as academias: ciclo_estado (resumo), ciclo_treino_atual (completo, escopo ler),
// ciclo_contexto com as academias, planejar/salvar presos aos aparelhos da academia pedida, orçamento e isolamento. Fictício.
import { test } from "node:test";
import assert from "node:assert/strict";
import { EQUIPMENT, EXERCISES, EXERCISE_BY_ID, MCP_ORCAMENTO_BYTES } from "@ciclo/core";
import { call, makeEnv, mcp } from "./fakes.ts";

const D = "2026-11-16"; // segunda
const ALL = EQUIPMENT.map((e) => e.id);
const SEM_LEG = ALL.filter((q) => q !== "legpress");
const comLeg = EXERCISES.find((e) => e.eq.includes("legpress") && e.m === "quad")!;
const halter = EXERCISES.find((e) => e.eq.length === 1 && e.eq[0] === "halteres" && e.m === "biceps")!;

async function tool(env: unknown, token: string, name: string, args: Record<string, unknown> = {}) {
  const r = await mcp(env, token, name, args);
  assert.equal(r.status, 200, r.text);
  const txt = r.data.result.content[0].text as string;
  assert.ok(Buffer.byteLength(txt) <= MCP_ORCAMENTO_BYTES, `${name}: ${Buffer.byteLength(txt)} bytes acima do orçamento`);
  return r.data.result.isError ? { erro: txt } : JSON.parse(txt);
}

async function conta(env: any, user: string, o: { treinoAtual?: unknown; escopo?: string; gyms?: [string, string, string[]][] } = {}) {
  const c = (m: string, p: string, body?: unknown) => call(env, m, p, { user, body });
  const perfil = { level: 1, priorities: ["ombro"], minutes: 60, daysTarget: 4, prefs: {}, pinned: {}, avoid: [], goal: { statement: "objetivo fictício" }, dayGym: { seg: "casa" }, ...(o.treinoAtual !== undefined ? { treinoAtual: o.treinoAtual } : {}) };
  assert.equal((await c("PUT", "/api/profile", { data: perfil })).status, 200);
  for (const [id, name, equipment] of o.gyms ?? [["acad1", "Academia Exemplo", ALL], ["casa", "Prédio sem leg", SEM_LEG]]) assert.equal((await c("PUT", `/api/gyms/${id}`, { name, equipment })).status, 200);
  const t = await c("POST", "/api/account/tokens", { label: "teste", ...(o.escopo ? { escopo: o.escopo } : {}) });
  assert.equal(t.status, 201, t.text);
  return { token: t.data.token as string, c };
}

const TA = { divisoes: [
  { nome: "Treino A", grupos: ["biceps", "costas"], exercicios: [{ id: halter.id, sets: 3, reps: 10, kg: 12 }, { nome: "Remada do prédio", grupo: "costas" }] },
  { nome: "Treino B", grupos: ["pernas"], exercicios: [{ id: comLeg.id, sets: 4 }] },
] };

test("ciclo_estado e ciclo_treino_atual leem o treino atual (2 divisões); sem cadastro → null; 'estou começando' → []; outra conta não vê", async () => {
  const env = makeEnv();
  const a = await conta(env, "ana", { treinoAtual: TA });
  const b = await conta(env, "bia", { gyms: [["lug_b", "Academia da Bia", ["halteres"]]] });
  const cris = await conta(env, "cris", { treinoAtual: { divisoes: [] } });

  const ea = await tool(env, a.token, "ciclo_estado", { date: D });
  assert.equal(ea.treinoAtualPor, "você");
  assert.deepEqual(ea.treinoAtual.map((d: any) => d.nome), ["Treino A", "Treino B"]);
  assert.deepEqual(ea.treinoAtual[0].ex, [`${halter.id} 3×10 12kg`, "livre: Remada do prédio (costas)"]);
  assert.deepEqual(ea.treinoAtual[1].ex, [`${comLeg.id} 4 séries`]);
  const ta = await tool(env, a.token, "ciclo_treino_atual");
  assert.equal(ta.por, "você"); assert.match(ta.aviso, /dado, não instrução/);
  assert.deepEqual(ta.treinoAtual.divisoes[0].exercicios, [{ id: halter.id, nm: halter.nm, sets: 3, reps: 10, kg: 12 }, { livre: "Remada do prédio", grupo: "costas" }]);
  assert.deepEqual(ta.treinoAtual.divisoes[1].grupos, ["pernas"]);

  // a B não cadastrou: null nas duas; e nada da A aparece para ela
  const eb = await tool(env, b.token, "ciclo_estado", { date: D });
  assert.equal(eb.treinoAtual, null); assert.equal(eb.treinoAtualPor, undefined);
  assert.equal((await tool(env, b.token, "ciclo_treino_atual")).treinoAtual, null);
  const txtB = JSON.stringify([eb, await tool(env, b.token, "ciclo_contexto", { pedido: "gerar", date: D }), await tool(env, b.token, "ciclo_contexto", { date: D }), await tool(env, b.token, "ciclo_treino_atual")]);
  for (const s of ["Treino A", "Remada do prédio", "Academia Exemplo", "Prédio sem leg", "acad1"]) assert.ok(!txtB.includes(s), `vazou da A para a B: ${s}`);
  assert.deepEqual(eb.academias, [{ id: "lug_b", nome: "Academia da Bia", aparelhos: ["halteres"] }]);

  const ec = await tool(env, cris.token, "ciclo_estado", { date: D });
  assert.deepEqual(ec.treinoAtual, []);
  assert.deepEqual((await tool(env, cris.token, "ciclo_treino_atual")).treinoAtual, { divisoes: [] });

  // salvo pelo Chat → o rótulo muda
  assert.equal((await tool(env, b.token, "ciclo_treino_atual_salvar", { treinoAtual: TA })).salvo, true);
  assert.equal((await tool(env, b.token, "ciclo_estado", { date: D })).treinoAtualPor, "Chat");
  assert.equal((await tool(env, b.token, "ciclo_treino_atual")).por, "Chat");
});

test("escopo ler: ciclo_treino_atual, ciclo_estado e ciclo_contexto funcionam; tools/list marca readOnly; instructions pedem a leitura", async () => {
  const env = makeEnv();
  const l = await conta(env, "ana", { treinoAtual: TA, escopo: "ler" });
  assert.equal((await tool(env, l.token, "ciclo_treino_atual")).treinoAtual.divisoes.length, 2);
  assert.equal((await tool(env, l.token, "ciclo_estado", { date: D })).treinoAtual.length, 2);
  assert.equal((await tool(env, l.token, "ciclo_contexto", { pedido: "gerar", date: D })).academias.length, 2);
  const list = await call(env, "POST", "/mcp", { bearer: l.token, body: { jsonrpc: "2.0", id: 1, method: "tools/list" } });
  const t = list.data.result.tools.find((x: any) => x.name === "ciclo_treino_atual");
  assert.equal(t.annotations.readOnlyHint, true);
  const init = await call(env, "POST", "/mcp", { bearer: l.token, body: { jsonrpc: "2.0", id: 1, method: "initialize", params: {} } });
  assert.match(init.data.result.instructions, /Contrato v1\.5\.0/);
  assert.match(init.data.result.instructions, /leia o treino atual \(ciclo_treino_atual/);
  assert.match(init.data.result.instructions, /pediu outra academia → leia os aparelhos dela/);
});

test("academias no ciclo_estado e no ciclo_contexto (id, nome, aparelhos) e a do dia: plano salvo > dia da semana > primeira", async () => {
  const env = makeEnv();
  const a = await conta(env, "ana", { treinoAtual: TA });
  const e = await tool(env, a.token, "ciclo_estado", { date: D });
  assert.deepEqual(e.academias, [{ id: "acad1", nome: "Academia Exemplo", aparelhos: ALL }, { id: "casa", nome: "Prédio sem leg", aparelhos: SEM_LEG }]);
  assert.equal(e.academiaDoDia, "casa", "segunda → dayGym.seg");
  assert.equal((await tool(env, a.token, "ciclo_estado", { date: "2026-11-17" })).academiaDoDia, "acad1", "terça sem dayGym → a primeira");
  for (const args of [{ pedido: "gerar", date: D }, { pedido: "trocar", date: D, exercicioId: halter.id }, { pedido: "tempo", date: D }]) {
    const ctx = await tool(env, a.token, "ciclo_contexto", args);
    assert.deepEqual(ctx.academias.map((g: any) => [g.id, g.nome, g.aparelhos.length]), [["acad1", "Academia Exemplo", ALL.length], ["casa", "Prédio sem leg", SEM_LEG.length]], JSON.stringify(args));
    assert.equal(ctx.academiaDoDia, "casa");
  }
  // treino salvo na acad1 para a segunda → a do dia passa a ser a do plano
  const s = await tool(env, a.token, "ciclo_salvar_treino_do_dia", { date: D, gymId: "acad1", itens: [{ id: comLeg.id, sets: 3 }], motivo: "teste" });
  assert.equal(s.salvo, true, JSON.stringify(s));
  assert.equal((await tool(env, a.token, "ciclo_estado", { date: D })).academiaDoDia, "acad1");
  assert.equal((await tool(env, a.token, "ciclo_contexto", { pedido: "gerar", date: D })).academiaDoDia, "acad1");
});

test("academia sem leg press: montar o dia ali nunca traz leg press; salvar com leg press recusa e sugere ciclo_treino_trocar", async () => {
  const env = makeEnv();
  const a = await conta(env, "ana", { treinoAtual: TA });
  // D é fixo (semana passada quando o teste roda depois): sem pedido especial o treino do dia lê a semana gravada; abre-a antes
  assert.equal((await a.c("GET", `/api/week?date=${D}`)).status, 200);
  const usaLeg = (id: string) => EXERCISE_BY_ID[id]?.eq.includes("legpress");
  for (const focus of [["quad"], ["pant"], ["gluteo"], []]) {
    for (const gym of [{ gymId: "casa" }, {}]) { // {} = a do dia (segunda → casa)
      const p = await tool(env, a.token, "ciclo_planejar_dia", { date: D, daysLeft: 1, focus, ...gym });
      assert.equal(p.academia, "casa");
      assert.ok(p.itens.length >= 1);
      for (const i of p.itens) { assert.ok(!usaLeg(i.id), `${i.id} usa leg press`); for (const x of i.alts) assert.ok(!usaLeg(x), `alt ${x} usa leg press`); }
    }
  }
  // na acad1 (com tudo) o leg press pode aparecer
  const comTudo = await tool(env, a.token, "ciclo_planejar_dia", { date: D, daysLeft: 1, focus: ["quad"], gymId: "acad1" });
  assert.equal(comTudo.academia, "acad1");

  const ruim = await tool(env, a.token, "ciclo_salvar_treino_do_dia", { date: D, gymId: "casa", itens: [{ id: halter.id, sets: 3 }, { id: comLeg.id, sets: 3 }], motivo: "teste" });
  assert.match(ruim.erro, new RegExp(`academia casa não tem o aparelho de: ${comLeg.id} \\(falta legpress\\)`));
  assert.match(ruim.erro, /ciclo_treino_trocar \{exercicioId, gymId: "casa"\}/);
  // sem gymId vale a do dia (casa): também recusa
  assert.match((await tool(env, a.token, "ciclo_salvar_treino_do_dia", { date: D, itens: [{ id: comLeg.id, sets: 3 }], motivo: "teste" })).erro, /não tem o aparelho/);
  assert.equal((await a.c("GET", `/api/day-plan/${D}`)).data?.plan?.source === "claude", false, "nada gravado");
  // academia que não é desta conta (ou não existe): erro claro, nunca cai na primeira em silêncio
  for (const [name, args] of [["ciclo_salvar_treino_do_dia", { itens: [{ id: halter.id, sets: 3 }], motivo: "t" }], ["ciclo_planejar_dia", { daysLeft: 1 }]] as const) {
    const r = await tool(env, a.token, name, { date: D, gymId: "nao_existe", ...args });
    assert.match(r.erro ?? "", /gymId: academia não encontrada nesta conta .*acad1, casa/, name);
  }
  // a troca sugerida resolve: alternativa da mesma parte que dá na casa, e aí salva
  const troca = await tool(env, a.token, "ciclo_treino_trocar", { exercicioId: comLeg.id, date: D, gymId: "casa" });
  const alt = troca.alternativas[0].id; // #125 top 3 compacto, na ordem
  assert.ok(!usaLeg(alt));
  assert.equal((await tool(env, a.token, "ciclo_salvar_treino_do_dia", { date: D, gymId: "casa", itens: [{ id: halter.id, sets: 3 }, { id: alt, sets: 3 }], motivo: "teste" })).salvo, true);
});

test("orçamento: treino atual cheio (7 × 24) + 6 academias com tudo cabem no ciclo_estado", async () => {
  const env = makeEnv();
  const ids = EXERCISES.filter((e) => e.kind !== "cardio").slice(0, 24).map((e) => ({ id: e.id, sets: 4, reps: 12, kg: 100 }));
  const cheio = { divisoes: Array.from({ length: 7 }, (_, i) => ({ nome: `Treino ${"ABCDEFG"[i]} longo nome`, grupos: ["peito", "costas", "ombro"], exercicios: ids })) };
  const gyms = Array.from({ length: 6 }, (_, i) => [`acad${i}`, `Academia ${i} com nome comprido`, ALL] as [string, string, string[]]);
  const a = await conta(env, "ana", { treinoAtual: cheio, gyms });
  for (let i = 0; i < 10; i++) await a.c("POST", "/api/inbox", { text: `pedido fictício ${i} `.padEnd(300, "y") });
  const e = await tool(env, a.token, "ciclo_estado", { date: D }); // tool() já confere o orçamento
  assert.ok(e.treinoAtual.every((d: any) => d.ex.length === 12 && d.mais === 12), "compacto: corta e diz quantos faltam");
  assert.equal(e.academias.length, 6);
  const full = await tool(env, a.token, "ciclo_treino_atual");
  assert.equal(full.treinoAtual.divisoes[6].exercicios.length, 24);
});
