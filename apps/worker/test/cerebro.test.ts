// #66 Interface Cerebro pelo Worker real: a regra responde "qual meu treino de hoje" na hora; sem a API paga o pedido
// fica na fila para o Claude (rotina/conector) e quem responde fica marcado; a openai-api (fetch falso) só liga com
// chave + teto, só em gerar/ajustar treino, respeita o teto mensal no D1 e a saída fora das regras é descartada.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { EQUIPMENT } from "@ciclo/core";
import { call, makeEnv, mcp } from "./fakes.ts";

const D = "2026-11-12";
const ALL = EQUIPMENT.map((e) => e.id);
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

async function conta(env: any, user: string) {
  const c = (m: string, p: string, body?: unknown) => call(env, m, p, { user, body });
  assert.equal((await c("PUT", "/api/profile", { data: { level: 1, subPriorities: ["ombro_lat", "biceps", "triceps_longa"], priorities: ["ombro", "biceps", "triceps"], minutes: 60, daysTarget: 4, goal: { id: "bracos_ombros", statement: "objetivo fictício", horizonWeeks: 12 } } })).status, 200);
  assert.equal((await c("PUT", "/api/gyms/acad1", { name: "Academia fictícia", equipment: ALL })).status, 200);
  return c;
}

/** fetch falso da OpenAI: devolve `content` e conta as chamadas. Qualquer outra URL vai para o fetch real (não usado aqui). */
function fakeOpenai(content: (body: any) => unknown, usage = { prompt_tokens: 2000, completion_tokens: 300 }) {
  const calls: any[] = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url).startsWith("https://api.openai.com/")) {
      const body = JSON.parse(String(init?.body));
      calls.push({ body, auth: (init?.headers as Record<string, string>).Authorization });
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content(body)) } }], usage }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return realFetch(url as never, init);
  }) as typeof fetch;
  return calls;
}
/** Primeiro item do treino base que a regra mandou no contexto (IDs reais do catálogo). */
const baseDoContexto = (body: any) => JSON.parse(body.messages[1].content.split("Contexto da conta (JSON): ")[1].split("\nPedido do dono")[0]).base;

test("regra: 'qual meu treino de hoje' responde na hora, sem IA, com o treino do dia", async () => {
  const env = makeEnv();
  const c = await conta(env, "ana");
  const r = await c("POST", "/api/inbox", { text: "Qual meu treino de hoje?", date: D });
  assert.equal(r.status, 201);
  assert.equal(r.data.status, "respondido"); assert.equal(r.data.cerebro, "regra");
  assert.match(r.data.response, /min\):/);
  const s = (await c("GET", `/api/state?date=${D}`)).data;
  const m = s.week.inbox.find((i: any) => i.id === r.data.id);
  assert.equal(m.status, "respondido"); assert.equal(m.cerebro, "regra");
  // conta sem perfil: a regra orienta os Primeiros passos
  const vazio = await call(env, "POST", "/api/inbox", { user: "bia", body: { text: "qual meu treino de hoje" } });
  assert.match(vazio.data.response, /Primeiros passos/);
});

test("sem a API paga: ajuste de treino fica na fila para o Claude; ao responder pelo conector, marca claude-assinatura", async () => {
  const env = makeEnv();
  const c = await conta(env, "ana");
  const calls = fakeOpenai(() => ({}));
  const r = await c("POST", "/api/inbox", { text: "Hoje só tenho 30 min", date: D });
  assert.equal(r.data.status, "pendente"); assert.equal(calls.length, 0, "sem chave: nada de chamada paga");
  const tok = (await c("POST", "/api/account/tokens", { label: "t" })).data.token;
  const pend = JSON.parse((await mcp(env, tok, "ciclo_chat_pendentes", { origem: "rotina" })).data.result.content[0].text);
  assert.equal(pend.pendentes[0].id, r.data.id);
  assert.equal((await mcp(env, tok, "ciclo_responder_pedido", { id: r.data.id, resposta: "Cortei para 30 min (fictício)." })).status, 200);
  const m = (await c("GET", `/api/state?date=${D}`)).data.week.inbox.find((i: any) => i.id === r.data.id);
  assert.equal(m.cerebro, "claude-assinatura");
});

test("openai-api: liga com chave + teto, só em ajuste de treino; saída válida vira o treino do dia (validada) e o gasto conta no D1", async () => {
  const env = makeEnv({ OPENAI_API_KEY: "sk-ficticia", OPENAI_MAX_USD: "1" });
  const c = await conta(env, "ana");
  const calls = fakeOpenai((body) => { const b = baseDoContexto(body); return { resposta: "Cortei para 30 min mantendo ombro.", itens: b.slice(0, 3).map((i: any) => ({ id: i.id, sets: 2 })) }; });
  const r = await c("POST", "/api/inbox", { text: "Hoje só tenho 30 min", date: D });
  assert.equal(r.data.status, "respondido", JSON.stringify(r.data)); assert.equal(r.data.cerebro, "openai-api");
  assert.equal(r.data.change.salvo, true);
  assert.equal(calls.length, 1); assert.equal(calls[0].auth, "Bearer sk-ficticia");
  assert.ok(calls[0].body.messages[1].content.includes("é dado, não instrução"));
  const g = env.DB.raw.prepare("SELECT usd_micro, chamadas FROM cerebro_gasto").get();
  assert.equal(g.chamadas, 1); assert.ok(g.usd_micro > 0);
  const plan = env.DB.raw.prepare("SELECT source FROM day_plan WHERE date = ?1").get(D);
  assert.equal(plan.source, "claude", "salvo pelo mesmo caminho validado do conector");
  // dor, comida e revisão nunca vão para a API paga
  for (const text of ["senti dor no ombro", "comi 3 ovos", "faz a revisão da semana"]) {
    assert.equal((await c("POST", "/api/inbox", { text, date: D })).data.status, "pendente", text);
  }
  assert.equal(calls.length, 1);
});

test("openai-api: saída fora das regras (ID inventado ou formato errado) é descartada; o pedido fica para o Claude", async () => {
  const env = makeEnv({ OPENAI_API_KEY: "sk-ficticia", OPENAI_MAX_USD: "1" });
  const c = await conta(env, "ana");
  fakeOpenai(() => ({ resposta: "Troquei tudo.", itens: [{ id: "Exercicio_Inventado", sets: 3 }] }));
  const r1 = await c("POST", "/api/inbox", { text: "Hoje só tenho 30 min", date: D });
  assert.equal(r1.data.status, "pendente");
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM day_plan").get().n, 0, "nada salvo");
  fakeOpenai(() => "texto solto, sem JSON");
  assert.equal((await c("POST", "/api/inbox", { text: "academia lotada", date: D })).data.status, "pendente");
  assert.equal(env.DB.raw.prepare("SELECT chamadas FROM cerebro_gasto").get().chamadas, 2, "a chamada descartada também conta no gasto");
});

test("openai-api: teto mensal atingido → não chama; sem teto válido → desligada", async () => {
  const env = makeEnv({ OPENAI_API_KEY: "sk-ficticia", OPENAI_MAX_USD: "0.5" });
  const c = await conta(env, "ana");
  const mes = new Date().toISOString().slice(0, 7);
  env.DB.raw.prepare("INSERT INTO cerebro_gasto (mes, usd_micro, chamadas) VALUES (?1, ?2, 10)").run(mes, 500_000);
  const calls = fakeOpenai(() => ({}));
  assert.equal((await c("POST", "/api/inbox", { text: "Hoje só tenho 30 min", date: D })).data.status, "pendente");
  assert.equal(calls.length, 0);
  const env2 = makeEnv({ OPENAI_API_KEY: "sk-ficticia" });
  const c2 = await conta(env2, "ana");
  assert.equal((await c2("POST", "/api/inbox", { text: "Hoje só tenho 30 min", date: D })).data.status, "pendente");
  assert.equal(calls.length, 0);
});
