// #134 Histórico do Chat no servidor: nova conversa, mensagens, lista, apagar de verdade, export, apagar a conta, teto e
// ataques (XSS guardado como texto, papel "ia" pelo app, id malformado). Dados fictícios; o isolamento está na matriz.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CHAT } from "@ciclo/core/chat";
import { call, makeEnv } from "./fakes.ts";

const conta = (env: any, user = "ana") => (m: string, p: string, body?: unknown) => call(env, m, p, { user, body });
const linhas = (env: any, t: string, uid: string) => env.DB.raw.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE user_id = ?1`).get(uid).n as number;
const uidDe = async (env: any, user = "ana") => (await call(env, "GET", "/api/account/export", { user })).data.user.id as string;

test("nova conversa com a 1ª mensagem, mais mensagens, lista por recência e abrir", async () => {
  const env = makeEnv(), a = conta(env);
  const r1 = await a("POST", "/api/conversas/mensagens", { texto: "o que   treino hoje?\ncom 40 min" });
  assert.equal(r1.status, 201, r1.text);
  const cid = r1.data.conversa.id;
  assert.equal(r1.data.conversa.titulo, "o que treino hoje? com 40 min");
  assert.equal(r1.data.mensagem.papel, "usuario");
  assert.equal((await a("POST", "/api/conversas/mensagens", { conversaId: cid, papel: "aviso", texto: "virou pedido na rotina" })).status, 201);
  const r2 = await a("POST", "/api/conversas/mensagens", { texto: "outra conversa" });
  const lista = (await a("GET", "/api/conversas")).data.conversas.map((c: any) => c.id);
  assert.deepEqual(lista, [r2.data.conversa.id, cid]);
  const ab = await a("GET", `/api/conversas/${cid}`);
  assert.deepEqual(ab.data.mensagens.map((m: any) => [m.papel, m.texto]), [["usuario", "o que   treino hoje?\ncom 40 min"], ["aviso", "virou pedido na rotina"]]);
});

test("apagar a conversa apaga mesmo (mensagens juntas); de novo = 404", async () => {
  const env = makeEnv(), a = conta(env), uid = await uidDe(env);
  const cid = (await a("POST", "/api/conversas/mensagens", { texto: "apagar isto" })).data.conversa.id;
  await a("POST", "/api/conversas/mensagens", { conversaId: cid, texto: "e isto" });
  assert.equal(linhas(env, "conversa_msg", uid), 2);
  assert.equal((await a("DELETE", `/api/conversas/${cid}`)).status, 200);
  assert.equal(linhas(env, "conversa", uid), 0); assert.equal(linhas(env, "conversa_msg", uid), 0);
  assert.equal((await a("DELETE", `/api/conversas/${cid}`)).status, 404);
  assert.equal((await a("GET", `/api/conversas/${cid}`)).status, 404);
});

test("entra no export e sai no apagar da conta", async () => {
  const env = makeEnv(), a = conta(env), uid = await uidDe(env);
  await a("POST", "/api/conversas/mensagens", { texto: "fictício: minha semana" });
  const exp = (await a("GET", "/api/account/export")).data;
  assert.equal(exp.conversa.length, 1); assert.equal(exp.conversa_msg[0].texto, "fictício: minha semana");
  assert.equal((await a("DELETE", "/api/account", { confirm: "APAGAR" })).status, 200);
  assert.equal(linhas(env, "conversa", uid), 0); assert.equal(linhas(env, "conversa_msg", uid), 0);
});

test("ataques: XSS fica como texto puro no JSON; papel ia pelo app, vazio, longo e id malformado são recusados", async () => {
  const env = makeEnv(), a = conta(env);
  const xss = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
  const r = await a("POST", "/api/conversas/mensagens", { texto: xss });
  assert.equal(r.status, 201);
  assert.equal(r.headers.get("content-type"), "application/json; charset=utf-8");
  assert.equal((await a("GET", `/api/conversas/${r.data.conversa.id}`)).data.mensagens[0].texto, xss);
  assert.equal((await a("POST", "/api/conversas/mensagens", { texto: "oi", papel: "ia" })).status, 400);
  assert.equal((await a("POST", "/api/conversas/mensagens", { texto: "   " })).status, 400);
  assert.equal((await a("POST", "/api/conversas/mensagens", { texto: "a".repeat(CHAT.textoMax + 1) })).status, 400);
  assert.equal((await a("POST", "/api/conversas/mensagens", { texto: "oi", conversaId: "x' OR 1=1 --" })).status, 404);
  assert.equal((await a("GET", "/api/conversas/..%2F..")).status, 404);
  assert.equal((await a("POST", "/api/conversas/mensagens", { texto: "oi", pedidoId: "nao-existe-123" })).status, 404);
});

test("teto de conversas: a mais antiga sai (com as mensagens) ao passar do limite", async () => {
  const env = makeEnv(), a = conta(env), uid = await uidDe(env);
  const ins = env.DB.raw.prepare("INSERT INTO conversa (user_id, id, titulo, created_at, updated_at) VALUES (?1, ?2, 't', ?3, ?3)");
  for (let i = 0; i < CHAT.conversasMax; i++) ins.run(uid, `antiga-${String(i).padStart(4, "0")}`, 1000 + i);
  env.DB.raw.prepare("INSERT INTO conversa_msg (user_id, conversa_id, id, papel, texto, created_at) VALUES (?1, 'antiga-0000', 'msg-antiga-1', 'usuario', 'x', 1)").run(uid);
  assert.equal((await a("POST", "/api/conversas/mensagens", { texto: "nova" })).status, 201);
  assert.equal(linhas(env, "conversa", uid), CHAT.conversasMax);
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM conversa WHERE user_id = ?1 AND id = 'antiga-0000'").get(uid).n, 0);
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM conversa_msg WHERE user_id = ?1 AND conversa_id = 'antiga-0000'").get(uid).n, 0);
});
