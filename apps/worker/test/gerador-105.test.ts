// #105 Worker real sobre D1 em memória: a semana do app e a do MCP (ciclo_semana_gerar) saem do gerarSemana e passam no
// validarSemana; o perfil é validado na entrada do gerador (400 quando inválido); o campo de saúde só vira aviso de
// encaminhamento, isolado por conta e fora dos logs. Dados fictícios.
import { test } from "node:test";
import assert from "node:assert/strict";
import { diasDoPlano, gerarSemana, validarSemana } from "@ciclo/core";
import type { MuscleId, PerfilGerador } from "@ciclo/core";
import { HttpError } from "../src/http.ts";
import { entradaGeradorSalva, validarEntradaGerador } from "../src/gerador.ts";
import { call, makeEnv, mcp } from "./fakes.ts";

const SEG = "2026-11-16";
const EQ = ["halteres", "banco", "polia", "barra", "puxador", "legpress", "extensora", "flexora"];
const DIAS = ["seg", "ter", "qui", "sex"];
const PERFIL = { level: 1, priorities: ["ombro", "biceps"], minutes: 60, daysTarget: 4, daysUsual: DIAS, prefs: {}, pinned: {}, avoid: [], goal: { statement: "objetivo fictício" } };
const naSegunda = (t: any) => t.mock.method(Date, "now", () => Date.parse(`${SEG}T13:00:00Z`));

async function conta(env: any, user: string, extra: Record<string, unknown> = {}) {
  const c = (m: string, p: string, body?: unknown) => call(env, m, p, { user, body });
  const r = await c("PUT", "/api/profile", { data: { ...PERFIL, ...extra } });
  assert.equal(r.status, 200, r.text);
  assert.equal((await c("PUT", "/api/gyms/acad1", { name: "Academia Exemplo", equipment: EQ })).status, 200);
  const t = await c("POST", "/api/account/tokens", { label: "teste" });
  return { token: t.data.token as string, c };
}
/** A entrada do gerador que a semana usou: os dias de treino, a academia, o perfil e os alvos da semana. */
const perfilDa = (week: any, o: Partial<PerfilGerador> = {}): PerfilGerador => {
  const dias = week.days.filter((d: any) => d.kind === "treino").map((d: any) => d.dow);
  return { sexo: null, nivel: 1, prioridades: ["ombro", "biceps"] as MuscleId[], equipamentos: EQ, dias, diasMeta: dias.length, minutos: 60, alvos: week.targets, ...o };
};
async function tool(env: unknown, token: string, name: string, args: Record<string, unknown> = {}) {
  const r = await mcp(env, token, name, args);
  assert.equal(r.status, 200, r.text);
  const txt = r.data.result.content[0].text as string;
  return r.data.result.isError ? { erro: txt } : JSON.parse(txt);
}

test("semana gerada no app (1ª abertura) sai do gerarSemana e passa no validarSemana", async (t) => {
  naSegunda(t);
  const env = makeEnv();
  const a = await conta(env, "ana");
  const r = await a.c("GET", `/api/week?date=${SEG}`);
  assert.equal(r.status, 200, r.text);
  const week = r.data.week, p = perfilDa(week);
  assert.deepEqual(p.dias, DIAS);
  assert.deepEqual(validarSemana({ dias: diasDoPlano(week) }, p), [], "a semana do app passa no validarSemana");
  const g = gerarSemana(p);
  for (const d of week.days.filter((x: any) => x.kind === "treino")) {
    assert.deepEqual(d.plan.items.map((i: any) => [i.exerciseId, i.sets]), g.dias.find((x) => x.dow === d.dow)!.itens.map((i) => [i.exerciseId, i.sets]), d.dow);
  }
});

test("MCP ciclo_semana_gerar refaz a semana pelo gerador e ela passa no validarSemana", async (t) => {
  naSegunda(t);
  const env = makeEnv();
  const a = await conta(env, "ana", { sex: "f" });
  const r = await tool(env, a.token, "ciclo_semana_gerar", {});
  assert.equal(r.refeita, true, JSON.stringify(r));
  const week = (await a.c("GET", `/api/week?date=${SEG}`)).data.week;
  const p = perfilDa(week, { sexo: "f" });
  assert.deepEqual(validarSemana({ dias: diasDoPlano(week) }, p), []);
  // o resumo compacto do MCP mostra os mesmos itens do gerador
  const seg = r.dias.find((d: any) => d.date === SEG);
  assert.deepEqual(seg.itens, gerarSemana(p).dias[0].itens.map((i) => `${i.exerciseId} ${i.sets}×${i.reps.join("–")}`));
  assert.ok(week.avisos.some((x: string) => /Ponto de partida para mulher/.test(x)), "avisos do gerador chegam à semana");
});

test("perfil inválido → 400 (nível, minutos, dias, meta, saúde) e nada muda; o Chat também é recusado", async (t) => {
  naSegunda(t);
  const env = makeEnv();
  const a = await conta(env, "ana");
  const antes = env.DB.raw.prepare("SELECT data FROM profile").get().data;
  for (const ruim of [{ level: 7 }, { minutes: 5 }, { minutes: 500 }, { daysUsual: ["xx"] }, { daysTarget: 0 }, { saude: ["xyz"] }, { saude: "gestacao" }, { sex: "x" }]) {
    for (const m of ["PUT", "PATCH"]) {
      const r = await a.c(m, "/api/profile", { data: m === "PUT" ? { ...PERFIL, ...ruim } : ruim });
      assert.equal(r.status, 400, `${m} ${JSON.stringify(ruim)}`);
      assert.match(r.data.error ?? r.text, /Não deu para salvar/, "mensagem humana");
    }
  }
  assert.equal(env.DB.raw.prepare("SELECT data FROM profile").get().data, antes, "nada foi salvo");
  const chat = await tool(env, a.token, "ciclo_perfil_atualizar", { perfil: { saude: ["inventado"] } });
  assert.match(chat.erro, /saude/);
  // a entrada nova passa pelos helpers de http.ts (mensagem "fora de min..max" do int, não a do perfil)
  assert.match((await tool(env, a.token, "ciclo_perfil_atualizar", { perfil: { level: 7 } })).erro, /level fora de 0\.\.3/);
  assert.equal((await a.c("GET", `/api/week?date=${SEG}`)).status, 200, "a semana segue com o perfil válido");
});

test("entrada do gerador validada com http.ts: cada campo fora da faixa → HttpError 400", () => {
  const ok = { sex: "f", level: 2, minutes: 45, daysUsual: ["seg", "qua"], daysTarget: 3, pains: [{ region: "ombro_d", intensity: 2 }], saude: ["red_s"] };
  assert.deepEqual(validarEntradaGerador(ok), { sexo: "f", nivel: 2, minutos: 45, dias: ["seg", "qua"], diasMeta: 3, dores: [{ region: "ombro_d", intensity: 2 }], saude: ["red_s"] });
  assert.equal(validarEntradaGerador({ ...ok, sex: null, pains: undefined, saude: undefined }).sexo, null);
  const ruins: Record<string, unknown>[] = [
    { level: 4 }, { level: "1" }, { level: undefined }, { minutes: 19 }, { minutes: 181 }, { minutes: 60.5 },
    { daysUsual: ["seg", "xx"] }, { daysUsual: ["seg", "seg"] }, { daysUsual: "seg" }, { daysTarget: 8 },
    { pains: [{ region: "inventada", intensity: 2 }] }, { pains: [{ region: "ombro_d", intensity: 5 }] }, { pains: ["ombro_d"] },
    { saude: ["xyz"] }, { saude: ["gestacao", "gestacao"] }, { sex: "outro" },
  ];
  for (const r of ruins) {
    assert.throws(() => validarEntradaGerador({ ...ok, ...r }), (e: unknown) => e instanceof HttpError && e.status === 400, JSON.stringify(r));
  }
  // a mensagem só nomeia o campo e as opções: o valor recebido nunca volta no erro
  try { validarEntradaGerador({ ...ok, saude: ["segredo-ficticio"] }); assert.fail("devia recusar"); }
  catch (e) { assert.doesNotMatch((e as Error).message, /segredo/); }
});

test("saúde: aviso de encaminhamento só na semana da conta que marcou; a outra não vê; nada vai para o log", async (t) => {
  naSegunda(t);
  const logs: string[] = [];
  for (const k of ["log", "info", "warn", "error", "debug"] as const) t.mock.method(console, k, (...xs: unknown[]) => { logs.push(xs.map(String).join(" ")); });
  const env = makeEnv();
  const a = await conta(env, "ana", { sex: "f", saude: ["gestacao"] });
  const b = await conta(env, "bia", { sex: "f" });
  const wa = (await a.c("GET", `/api/week?date=${SEG}`)).data.week;
  const wb = (await b.c("GET", `/api/week?date=${SEG}`)).data.week;
  assert.ok(wa.avisos.some((x: string) => /profissional de saúde/.test(x) && /assoalho pélvico/.test(x)));
  assert.ok(!wb.avisos.some((x: string) => /profissional de saúde/.test(x)), "a outra conta não recebe o aviso");
  // a saúde não muda o treino: mesmas séries e exercícios nas duas contas (mesmo perfil, mesma academia)
  assert.deepEqual(wa.days.map((d: any) => d.plan?.items ?? null), wb.days.map((d: any) => d.plan?.items ?? null));
  const sb = (await b.c("GET", `/api/state?date=${SEG}`)).data;
  assert.equal(sb.profile?.saude, undefined, "B não vê a saúde de A");
  assert.deepEqual((await a.c("GET", `/api/state?date=${SEG}`)).data.profile.saude, ["gestacao"]);
  assert.ok(!logs.some((l) => /gestacao|Gestação/.test(l)), "dado de saúde nunca em log");
});

test("saúde fora do que é gravado: marcar → aviso; desmarcar → some sem refazer a semana (versões e desfazer limpos)", async (t) => {
  naSegunda(t);
  const env = makeEnv();
  const a = await conta(env, "ana", { saude: ["red_s"] });
  const w1 = (await a.c("GET", `/api/week?date=${SEG}`)).data.week;
  assert.ok(w1.avisos.some((x: string) => /RED-S/.test(x)));
  const gravado = () => env.DB.raw.prepare("SELECT plan_json FROM week_plan").all().map((r: any) => r.plan_json).join("\n");
  assert.doesNotMatch(gravado(), /RED-S|profissional de saúde/, "o aviso de saúde nunca vai para week_plan");
  assert.equal((await a.c("PATCH", "/api/profile", { data: { saude: [] } })).status, 200);
  const w2 = (await a.c("GET", `/api/week?date=${SEG}`)).data.week;
  assert.equal(w2.version, w1.version, "a semana não foi refeita");
  assert.ok(!w2.avisos.some((x: string) => /RED-S/.test(x)), "desmarcou: o aviso some");
});

test("dado legado já salvo (dor de região que saiu do catálogo, perfil fora das faixas) não trava a semana nem o Gerar treino", async (t) => {
  naSegunda(t);
  const env = makeEnv();
  const a = await conta(env, "ana");
  const uid = env.DB.raw.prepare("SELECT id FROM user WHERE email LIKE 'ana%'").get().id;
  // gravado direto no D1, como se viesse de uma versão antiga (fora da validação de hoje)
  env.DB.raw.prepare("INSERT INTO pain (user_id, id, region, intensity, created_at) VALUES (?1, 'p-legado', 'regiao_antiga', 2, ?2)").run(uid, Date.now());
  const perfil = JSON.parse(env.DB.raw.prepare("SELECT data FROM profile WHERE user_id = ?1").get(uid).data);
  env.DB.raw.prepare("UPDATE profile SET data = ?2 WHERE user_id = ?1").run(uid, JSON.stringify({ ...perfil, level: 9, minutes: 500, sex: "x", saude: ["xyz"] }));
  const r = await a.c("GET", `/api/week?date=${SEG}`);
  assert.equal(r.status, 200, r.text);
  assert.ok(r.data.week.days.some((d: any) => d.kind === "treino" && d.plan?.items.length));
  const g = await a.c("POST", `/api/week/day/2026-11-19/gerar-treino`, { today: SEG });
  assert.notEqual(g.status, 400, g.text);
  assert.equal((await tool(env, a.token, "ciclo_semana_gerar", {})).refeita, true);
  // o saneamento: região desconhecida sai, faixas ajustadas, valores inválidos ignorados
  assert.deepEqual(entradaGeradorSalva({ level: 9, minutes: 500, sex: "x", daysUsual: ["seg", "xx", "seg"], daysTarget: 0, pains: [{ region: "regiao_antiga", intensity: 2 }, { region: "ombro_d", intensity: 7 }], saude: ["xyz", "red_s"] }),
    { sexo: null, nivel: 3, minutos: 180, dias: ["seg"], diasMeta: 1, dores: [{ region: "ombro_d", intensity: 3 }], saude: ["red_s"] });
});
