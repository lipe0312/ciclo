// #115 Médias de comida no Worker real (D1 em memória): Configurações de métricas validadas e por conta, "não comi" por
// conta, e a prévia do MCP mostrando a refeição completável faltando com a oferta de "não comi". Dados fictícios.
import { test } from "node:test";
import assert from "node:assert/strict";
import { call, makeEnv, mcp } from "./fakes.ts";

const SP = 3 * 3600e3;
const dia = (n: number) => new Date(Date.now() - SP + n * 864e5).toISOString().slice(0, 10);

async function conta(env: any, user: string) {
  const c = (m: string, p: string, body?: unknown) => call(env, m, p, { user, body });
  const ok = async (m: string, p: string, body?: unknown) => { const r = await c(m, p, body); assert.ok(r.status < 300, `${m} ${p}: ${r.status} ${r.text}`); return r.data; };
  const t = await c("POST", "/api/account/tokens", { label: "teste" });
  assert.equal(t.status, 201, t.text);
  const tool = async (name: string, args: Record<string, unknown> = {}) => {
    const r = await mcp(env, t.data.token, name, args);
    assert.equal(r.status, 200, r.text);
    const txt = r.data.result.content[0].text as string;
    return r.data.result.isError ? { erro: txt } : JSON.parse(txt);
  };
  return { c, ok, tool };
}

test("Configurações de métricas: padrão, mudança parcial, validação de tipo/valor e isolamento entre contas", async () => {
  const env = makeEnv();
  const a = await conta(env, "ana"), b = await conta(env, "bia");
  const padrao = { completar: { cafe: true, almoco: true, lanche: false, jantar: true, ceia: false }, diaVazio: "fora" };
  assert.deepEqual((await a.ok("GET", "/api/food-metricas")).regras, padrao);
  const r = await a.ok("PUT", "/api/food-metricas", { completar: { cafe: false, lanche: true }, diaVazio: "zero" });
  assert.deepEqual(r.regras, { completar: { ...padrao.completar, cafe: false, lanche: true }, diaVazio: "zero" });
  // mudança parcial mantém o resto
  assert.deepEqual((await a.ok("PUT", "/api/food-metricas", { completar: { ceia: true } })).regras.completar, { cafe: false, almoco: true, lanche: true, jantar: true, ceia: true });
  assert.equal((await a.ok("GET", `/api/diet?date=${dia(0)}`)).medias.diaVazio, "zero", "a tela Comida recebe as regras junto da dieta");
  // entrada inválida: tipo e valor errados, campo desconhecido, refeição que não existe
  for (const body of [{ completar: { cafe: "sim" } }, { completar: { cafe: 1 } }, { completar: { pizza: true } }, { diaVazio: "meio" }, { diaVazio: 0 }, { completar: [] }, {}, { outro: 1 }, []]) {
    const x = await a.c("PUT", "/api/food-metricas", body);
    assert.equal(x.status, 400, JSON.stringify(body));
  }
  // a conta B não vê nem mexe nas regras da A
  assert.deepEqual((await b.ok("GET", "/api/food-metricas")).regras, padrao);
  await b.ok("PUT", "/api/food-metricas", { diaVazio: "fora" });
  assert.equal((await a.ok("GET", "/api/food-metricas")).regras.diaVazio, "zero");
});

test("\"não comi\": marcar, ler no /api/food, desmarcar; validação; isolamento entre contas", async () => {
  const env = makeEnv();
  const a = await conta(env, "ana"), b = await conta(env, "bia");
  const d = dia(-1);
  await a.ok("PUT", "/api/food-nao-comi", { date: d, meal: "cafe" });
  await a.ok("PUT", "/api/food-nao-comi", { date: d, meal: "cafe" }); // repetir não duplica
  assert.deepEqual((await a.ok("GET", `/api/food?from=${d}&to=${d}`)).naoComi, [{ date: d, meal: "cafe" }]);
  // validação
  assert.equal((await a.c("PUT", "/api/food-nao-comi", { date: d, meal: "pizza" })).status, 400);
  assert.equal((await a.c("PUT", "/api/food-nao-comi", { date: "ontem", meal: "cafe" })).status, 400);
  assert.equal((await a.c("PUT", "/api/food-nao-comi", { date: dia(1), meal: "cafe" })).status, 400, "futuro");
  assert.equal((await a.c("PUT", "/api/food-nao-comi", { date: dia(-40), meal: "cafe" })).status, 400, "fora dos 30 dias");
  // B não lê nem apaga a marca da A
  assert.deepEqual((await b.ok("GET", `/api/food?from=${d}&to=${d}`)).naoComi, []);
  assert.equal((await b.c("DELETE", `/api/food-nao-comi/${d}/cafe`)).status, 404);
  assert.deepEqual((await a.ok("GET", `/api/food?from=${d}&to=${d}`)).naoComi, [{ date: d, meal: "cafe" }], "a marca da A continua");
  await b.ok("PUT", "/api/food-nao-comi", { date: d, meal: "almoco" });
  assert.deepEqual((await a.ok("GET", `/api/food?from=${d}&to=${d}`)).naoComi, [{ date: d, meal: "cafe" }], "a marca da B não aparece na A");
  await a.ok("DELETE", `/api/food-nao-comi/${d}/cafe`);
  assert.deepEqual((await a.ok("GET", `/api/food?from=${d}&to=${d}`)).naoComi, []);
  // export e exclusão da conta levam a tabela
  await a.ok("PUT", "/api/food-nao-comi", { date: d, meal: "jantar" });
  const exp = await a.ok("GET", "/api/account/export");
  assert.deepEqual(exp.food_nao_comi.map((x: any) => [x.date, x.meal]), [[d, "jantar"]]);
});

test("MCP: a prévia mostra a refeição completável faltando e oferece \"não comi\"; confirmar com naoComi conta 0", async () => {
  const env = makeEnv();
  const a = await conta(env, "ana"), b = await conta(env, "bia");
  const ontem = dia(-1), anteontem = dia(-2);
  // histórico: café de anteontem (dá a média do café)
  await a.ok("POST", "/api/food", { text: "2 ovos e pão", date: anteontem, meal: "cafe" });
  const p = await a.tool("ciclo_comida_registrar", { texto: "almocei arroz, feijão e frango", data: ontem, refeicao: "almoco", simular: true });
  assert.equal(p.previa, true);
  assert.deepEqual(p.faltando.map((f: any) => f.refeicao), ["cafe", "jantar"], "café e jantar faltam; lanche e ceia não são completáveis");
  assert.ok(p.faltando[0].mediaKcal > 0, "o café tem média");
  assert.equal(p.faltando[1].mediaKcal, null, "jantar sem histórico: sem média");
  assert.match(p.naoComeuOuEsqueceu.pergunta, /Não comeu ou esqueceu/);
  assert.match(p.proximoPasso, /naoComi/);
  // naoComi só com refeição válida (schema)
  const ruim = await a.tool("ciclo_comida_registrar", { confirmar: p.token, naoComi: ["pizza"] });
  assert.ok(ruim.erro, "refeição inválida recusada");
  const ok = await a.tool("ciclo_comida_registrar", { confirmar: p.token, naoComi: ["cafe"] });
  assert.equal(ok.gravado, true);
  assert.deepEqual(ok.naoComi, ["cafe"]);
  assert.deepEqual((await a.ok("GET", `/api/food?from=${ontem}&to=${ontem}`)).naoComi, [{ date: ontem, meal: "cafe" }]);
  // a próxima prévia do mesmo dia já não pergunta do café
  const p2 = await a.tool("ciclo_comida_registrar", { texto: "lanchei uma banana", data: ontem, refeicao: "lanche", simular: true });
  assert.deepEqual(p2.faltando.map((f: any) => f.refeicao), ["jantar"]);
  // regras da pessoa mudam a pergunta: jantar desligado → nada falta
  await a.ok("PUT", "/api/food-metricas", { completar: { jantar: false } });
  const p3 = await a.tool("ciclo_comida_registrar", { texto: "lanchei uma banana", data: ontem, refeicao: "lanche", simular: true });
  assert.equal(p3.faltando, undefined);
  // isolamento: a marca e o histórico da A não aparecem na prévia da B
  const pb = await b.tool("ciclo_comida_registrar", { texto: "almocei arroz e frango", data: ontem, refeicao: "almoco", simular: true });
  assert.deepEqual(pb.faltando.map((f: any) => [f.refeicao, f.mediaKcal]), [["cafe", null], ["jantar", null]], "B não herda a média nem o \"não comi\" da A");
  assert.deepEqual((await b.ok("GET", `/api/food?from=${ontem}&to=${ontem}`)).naoComi, []);
});
