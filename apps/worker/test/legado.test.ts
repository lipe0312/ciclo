// #62 scripts/limpar-legado.mjs: acha a conta antiga do Access (role=user, sem passkey), exporta para o arquivo e só
// então apaga pela rotina deleteAccount. Nunca o owner nem conta com passkey. D1 local falso (migrations de verdade), dados fictícios.
import { test } from "node:test";
import assert from "node:assert/strict";
import { USER_TABLES } from "../src/db.ts";
import { call } from "./fakes.ts";
import { contaPorConvite, dono, envConta } from "./conta-helpers.ts";
// script JS (sem tipos)
import { escolherLegado, limparLegado } from "../../../scripts/limpar-legado.mjs";

test("limpar-legado: exporta a conta legada para o arquivo e depois apaga; owner e contas com passkey ficam", async () => {
  const env = envConta({ DEV_NO_AUTH: "1" }); // o usuário de dev (localhost) faz o papel da conta criada pelo Access
  await call(env, "PUT", "/api/gyms/g1", { user: "legado", body: { name: "Academia herdada", equipment: ["halteres"] } });
  await call(env, "POST", "/api/inbox", { user: "legado", body: { text: "pedido antigo fictício" } });
  const d = await dono(env);
  await contaPorConvite(env, d.cookie, "Ana Fictícia");
  const legado = env.DB.raw.prepare("SELECT id FROM user WHERE email = 'legado@dev.localhost'").get().id;
  assert.deepEqual(await escolherLegado(env.DB), { uid: legado }, "só a conta sem passkey é candidata");
  assert.match((await escolherLegado(env.DB, "nao-e-uuid")).erro, /inválido/);
  const donoId = env.DB.raw.prepare("SELECT id FROM user WHERE role = 'owner'").get().id;
  assert.match((await escolherLegado(env.DB, donoId)).erro, /não é legada/, "nunca o owner");

  const arquivos: Record<string, string> = {};
  const gravar = (f: string, txt: string) => { arquivos[f] = txt; };
  // sem --apagar: só exporta
  const so = await limparLegado(env, { saida: "/fora/do/git/a.json", gravar });
  assert.equal(so.apagada, false); assert.equal(so.contagem.gym, 1);
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) n FROM user").get().n, 3);
  // com --apagar: exporta de novo e apaga tudo da conta
  const r = await limparLegado(env, { saida: "/fora/do/git/b.json", apagar: true, gravar });
  assert.equal(r.ok, true); assert.equal(r.apagada, true);
  const exp = JSON.parse(arquivos["/fora/do/git/b.json"]);
  assert.equal(exp.user.id, legado); assert.equal(exp.gym[0].name, "Academia herdada"); assert.equal(exp.inbox.length, 1);
  for (const t of USER_TABLES) assert.equal(env.DB.raw.prepare(`SELECT COUNT(*) n FROM ${t} WHERE user_id = ?1`).get(legado).n, 0, t);
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) n FROM user").get().n, 2, "dono e Ana ficam");
  assert.match((await escolherLegado(env.DB)).erro ?? "", /nenhuma conta legada/);
});
