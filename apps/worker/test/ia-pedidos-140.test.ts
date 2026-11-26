// #140 Sua IA → Avançado grava modelo e esforço por tipo de pedido no perfil da própria conta (PATCH /api/profile), validado
// no core: valor fora da lista é 400 e nada muda; a preferência de uma conta nunca aparece (nem é alterada) em outra. Dados fictícios.
import { test } from "node:test";
import assert from "node:assert/strict";
import { call, makeEnv } from "./fakes.ts";

const profileOf = (env: any, user: string) => {
  const r = env.DB.raw.prepare("SELECT data FROM profile WHERE user_id = (SELECT id FROM user WHERE email = ?1)").get(`${user}@dev.localhost`);
  return r ? JSON.parse(r.data) : null;
};

test("PATCH grava por tipo (mescla), null apaga o tipo, e a outra conta não vê nem muda", async () => {
  const env = makeEnv();
  const a = (m: string, body?: unknown) => call(env, m, "/api/profile", { user: "ana", body });
  const b = (m: string, body?: unknown) => call(env, m, "/api/profile", { user: "bia", body });
  assert.equal((await b("PATCH", { data: { iaPedidos: { comida: { esforco: "alto" } } } })).status, 200);
  const bAntes = JSON.stringify(profileOf(env, "bia"));
  assert.equal((await a("PATCH", { data: { iaPedidos: { gerar_semana: { provedor: "gemini", modelo: "gemini-2.5-pro", esforco: "alto" } } } })).status, 200);
  assert.equal((await a("PATCH", { data: { iaPedidos: { comida: { esforco: "baixo" } } } })).status, 200);
  assert.deepEqual(profileOf(env, "ana").iaPedidos, { gerar_semana: { provedor: "gemini", modelo: "gemini-2.5-pro", esforco: "alto" }, comida: { esforco: "baixo" } });
  assert.equal(JSON.stringify(profileOf(env, "bia")), bAntes, "a conta da Bia não pode mudar");
  assert.ok(!JSON.stringify(profileOf(env, "bia")).includes("gemini-2.5-pro"));
  assert.equal((await a("PATCH", { data: { iaPedidos: { gerar_semana: null } } })).status, 200);
  assert.deepEqual(Object.keys(profileOf(env, "ana").iaPedidos), ["comida"]);
  assert.equal(profileOf(env, "bia").iaPedidos.comida.esforco, "alto", "a Bia continua com o dela");
});

test("valor fora da lista: 400 e o perfil fica como estava (modelo de outro provedor, esforço, tipo, campo extra)", async () => {
  const env = makeEnv();
  const a = (body: unknown) => call(env, "PATCH", "/api/profile", { user: "ana", body });
  assert.equal((await a({ data: { iaPedidos: { comida: { esforco: "baixo" } } } })).status, 200);
  const antes = JSON.stringify(profileOf(env, "ana"));
  for (const iaPedidos of [
    { gerar_semana: { provedor: "gemini", modelo: "gpt-5" } }, { comida: { esforco: "turbo" } }, { voo: { esforco: "baixo" } },
    { comida: { modelo: "gemini-2.5-pro" } }, { comida: { esforco: "baixo", userId: "x" } }, { comida: {} }, "x",
  ]) {
    const r = await a({ data: { iaPedidos } });
    assert.equal(r.status, 400, JSON.stringify(iaPedidos));
    assert.ok(!JSON.stringify(r.data).includes("turbo"), "o erro não ecoa o valor");
  }
  assert.equal(JSON.stringify(profileOf(env, "ana")), antes);
});
