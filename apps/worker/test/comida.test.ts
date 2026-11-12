// #28 Comida 2.0 no Worker: registros (editar/apagar), refeições salvas, calorias adaptativas, TACO e transcrição (413/501/502).
import { test } from "node:test";
import assert from "node:assert/strict";
import { call, makeEnv, mcp } from "./fakes.ts";
import { searchTaco, tacoHints } from "../src/taco.ts";

const D = "2026-11-22";
const addDays = (iso: string, n: number) => new Date(Date.parse(iso + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const ok = async (p: Promise<{ status: number; text: string; data: any }>, st = 200) => { const r = await p; assert.ok(r.status >= st && r.status < 300, `${r.status} ${r.text}`); return r; };
const audio = (n: number) => new Uint8Array(n).fill(7);

test("transcrição: áudio acima de 4 MB → 413 (com ou sem Whisper); no limite passa", async () => {
  const env = makeEnv();
  const big = await call(env, "POST", "/api/transcribe", { user: "ana", raw: audio(4 * 1024 * 1024 + 1), ct: "audio/webm" });
  assert.equal(big.status, 413);
  assert.equal(big.data.code, "audio_grande");
  const semAi = makeEnv({ AI: undefined });
  assert.equal((await call(semAi, "POST", "/api/transcribe", { user: "ana", raw: audio(4 * 1024 * 1024 + 1), ct: "audio/webm" })).status, 413);
  const edge = await call(env, "POST", "/api/transcribe", { user: "ana", raw: audio(4 * 1024 * 1024), ct: "audio/webm;codecs=opus" });
  assert.equal(edge.status, 200);
});

test("transcrição: erros tipados (501 sem Whisper, 415 tipo, 400 vazio, 502 falha) e texto do Whisper", async () => {
  const env = makeEnv({ AI: { run: async (_m: string, i: any) => { assert.equal(i.language, "pt"); return { text: "  três ovos, dois pães e um whey " }; } } });
  const okr = await call(env, "POST", "/api/transcribe", { user: "ana", raw: audio(2000), ct: "audio/mp4" });
  assert.deepEqual([okr.status, okr.data.text, okr.data.engine], [200, "três ovos, dois pães e um whey", "whisper"]);
  const sem = await call(makeEnv({ AI: undefined }), "POST", "/api/transcribe", { user: "ana", raw: audio(100), ct: "audio/webm" });
  assert.deepEqual([sem.status, sem.data.code], [501, "sem_servidor"]);
  const tipo = await call(env, "POST", "/api/transcribe", { user: "ana", raw: audio(100), ct: "image/png" });
  assert.deepEqual([tipo.status, tipo.data.code], [415, "tipo_invalido"]);
  const vazio = await call(env, "POST", "/api/transcribe", { user: "ana", raw: audio(0), ct: "audio/webm" });
  assert.deepEqual([vazio.status, vazio.data.code], [400, "audio_vazio"]);
  const quebrado = makeEnv({ AI: { run: async () => { throw new Error("modelo fora do ar com TEXTO_SECRETO"); } } });
  const falha = await call(quebrado, "POST", "/api/transcribe", { user: "ana", raw: audio(100), ct: "audio/webm" });
  assert.deepEqual([falha.status, falha.data.code], [502, "falha_modelo"]);
  assert.ok(!falha.text.includes("TEXTO_SECRETO"), "não vaza o erro do modelo");
});

test("transcrição: só áudio da allowlist (415) e usa o limite de upload (20 por 10 min → 429)", async () => {
  const env = makeEnv();
  for (const ct of ["video/webm", "video/mp4", "image/png", "application/octet-stream", "text/plain"]) {
    const r = await call(env, "POST", "/api/transcribe", { user: "ana", raw: audio(100), ct });
    assert.deepEqual([ct, r.status, r.data.code], [ct, 415, "tipo_invalido"]);
  }
  for (const ct of ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav", "audio/webm;codecs=opus"]) {
    assert.equal((await call(env, "POST", "/api/transcribe", { user: "bia", raw: audio(100), ct })).status, 200, ct);
  }
  // limite de upload: 20 por 10 min por conta (a bia já gastou 6; a ana, 5 das recusas)
  const cnt = (u: string) => env.DB.raw.prepare("SELECT count FROM rate_limit WHERE bucket = 'upload' AND user_id = (SELECT id FROM user WHERE email LIKE ?1)").get(`${u}@%`)?.count;
  assert.equal(cnt("bia"), 6);
  let last = 0;
  for (let i = 0; i < 20; i++) last = (await call(env, "POST", "/api/transcribe", { user: "bia", raw: audio(100), ct: "audio/webm" })).status;
  assert.equal(last, 429);
  assert.ok(env.DB.raw.prepare("SELECT 1 FROM rate_limit WHERE bucket = 'write' AND user_id = (SELECT id FROM user WHERE email LIKE 'bia@%')").get() === undefined, "não gasta o limite de escrita");
  // a ana não é afetada pela bia
  assert.equal((await call(env, "POST", "/api/transcribe", { user: "ana", raw: audio(100), ct: "audio/webm" })).status, 200);
});

test("registro: estimativa pelo core, refeição, editar (re-estima), ajuste manual e apagar", async () => {
  const env = makeEnv();
  const c = (m: string, p: string, body?: unknown) => call(env, m, p, { user: "ana", body });
  const r = await ok(c("POST", "/api/food", { date: D, text: "café: três ovos, dois pães e um whey", meal: "cafe" }), 201);
  assert.deepEqual([r.data.kcal, r.data.prot, r.data.meal], [610, 51, "cafe"]);
  const list = (await ok(c("GET", `/api/food?from=${D}&to=${D}`))).data.entries;
  assert.equal(list.length, 1);
  assert.equal(list[0].source, "local");
  assert.equal(list[0].kcalEst, 610);
  const id = list[0].id;
  // editar o texto re-estima
  await ok(c("PUT", `/api/food/${id}`, { text: "2 ovos" }));
  let e = (await ok(c("GET", `/api/food?from=${D}&to=${D}`))).data.entries[0];
  assert.deepEqual([e.text, e.kcal, e.prot, e.meal], ["2 ovos", 140, 12, "cafe"]);
  // ajuste manual do dono vale e vira fonte local sem confiança
  await ok(c("PUT", `/api/food/${id}`, { kcal: 300, protein: 20, meal: "lanche" }));
  e = (await ok(c("GET", `/api/food?from=${D}&to=${D}`))).data.entries[0];
  assert.deepEqual([e.kcal, e.prot, e.meal, e.source], [300, 20, "lanche", "local"]);
  // validação
  assert.equal((await c("PUT", `/api/food/${id}`, { kcal: -5 })).status, 400);
  assert.equal((await c("PUT", `/api/food/${id}`, { meal: "brunch" })).status, 400);
  assert.equal((await c("POST", "/api/food", { date: D, text: "x'; DROP TABLE food_log;--", meal: "x" })).status, 400);
  assert.equal((await c("GET", "/api/food?from=2026-01-01&to=2026-12-31")).status, 400, "período longo demais");
  // apagar
  await ok(c("DELETE", `/api/food/${id}`));
  assert.equal((await ok(c("GET", `/api/food?from=${D}&to=${D}`))).data.entries.length, 0);
  assert.equal((await c("DELETE", `/api/food/${id}`)).status, 404);
});

test("Claude confere com a TACO: ciclo_comida_dia mostra dicas e ciclo_comida_corrigir grava fonte=claude", async () => {
  const env = makeEnv();
  const tok = (await ok(call(env, "POST", "/api/account/tokens", { user: "ana", body: { label: "t" } }), 201)).data.token;
  await ok(call(env, "POST", "/api/food", { user: "ana", body: { date: D, text: "arroz, feijão e frango" } }), 201);
  const dia = JSON.parse((await mcp(env, tok, "ciclo_comida_dia", { date: D })).data.result.content[0].text);
  assert.equal(dia.registros.length, 1);
  assert.equal(dia.registros[0].fonte, "local");
  assert.ok(dia.registros[0].taco.some((t: string) => /Arroz/.test(t)), "dica da TACO para o arroz");
  const r = await mcp(env, tok, "ciclo_comida_corrigir", { id: dia.registros[0].id, kcal: 640, proteina: 52, confianca: "media" });
  assert.ok(!r.data.result.isError, r.text);
  const e = (await ok(call(env, "GET", `/api/food?from=${D}&to=${D}`, { user: "ana" }))).data.entries[0];
  assert.deepEqual([e.kcal, e.prot, e.source, e.confidence], [640, 52, "claude", "media"]);
  assert.equal(e.kcalEst, 590, "estimativa local preservada ao lado da conferida");
  // registro editado à mão pela pessoa: o Claude não sobrescreve sem forcar:true
  await ok(call(env, "PUT", `/api/food/${e.id}`, { user: "ana", body: { kcal: 700, protein: 60 } }));
  const dia2 = JSON.parse((await mcp(env, tok, "ciclo_comida_dia", { date: D })).data.result.content[0].text);
  assert.equal(dia2.registros[0].editadoPelaPessoa, true);
  assert.equal(dia2.registros[0].taco, undefined, "sem dicas: o valor é da pessoa");
  const barrado = await mcp(env, tok, "ciclo_comida_corrigir", { id: e.id, kcal: 500, proteina: 40, confianca: "alta" });
  assert.equal(barrado.data.result.isError, true);
  assert.match(barrado.data.result.content[0].text, /forcar/);
  let atual = (await ok(call(env, "GET", `/api/food?from=${D}&to=${D}`, { user: "ana" }))).data.entries[0];
  assert.deepEqual([atual.kcal, atual.prot, atual.source], [700, 60, "local"], "valor da pessoa intacto");
  const forca = await mcp(env, tok, "ciclo_comida_corrigir", { id: e.id, kcal: 500, proteina: 40, confianca: "alta", forcar: true });
  assert.ok(!forca.data.result.isError, forca.text);
  atual = (await ok(call(env, "GET", `/api/food?from=${D}&to=${D}`, { user: "ana" }))).data.entries[0];
  assert.deepEqual([atual.kcal, atual.prot, atual.source], [500, 40, "claude"]);
  assert.equal((await mcp(env, tok, "ciclo_comida_corrigir", { id: e.id, kcal: 1, proteina: 1, confianca: "alta", forcar: "sim" })).data.result.isError, true, "forcar só aceita true");
  const nada = await mcp(env, tok, "ciclo_comida_corrigir", { id: "nao-existe", kcal: 1, proteina: 1, confianca: "alta" });
  assert.equal(nada.data.result.isError, true);
});

test("migration 0008: CHECKs de faixa em diet_target_history", () => {
  const env = makeEnv();
  env.DB.raw.prepare("INSERT INTO user (id, email, created_at) VALUES ('u1', 'u1@x', 1)").run();
  const ins = (adjust: number, tdee: number | null, trend: number | null, code: string) => env.DB.raw.prepare(
    "INSERT INTO diet_target_history (user_id, id, date, kcal_before, kcal_after, adjust, tdee, trend_kg_week, code, reason, created_at) VALUES ('u1', ?1, '2026-11-01', 2400, 2550, ?2, ?3, ?4, ?5, 'r', 1)").run(Math.random().toString(), adjust, tdee, trend, code);
  assert.doesNotThrow(() => ins(150, 2400, 0.2, "ok"));
  assert.doesNotThrow(() => ins(-150, null, null, "cintura"));
  assert.throws(() => ins(151, 2400, 0.2, "ok"), /CHECK/);
  assert.throws(() => ins(-151, 2400, 0.2, "ok"), /CHECK/);
  assert.throws(() => ins(0, 100, 0.2, "ok"), /CHECK/);
  assert.throws(() => ins(0, 2400, 9, "ok"), /CHECK/);
  assert.throws(() => ins(0, 2400, 0.2, "sem_dados"), /CHECK/);
});

test("TACO estática: busca por palavras e dicas compactas", () => {
  assert.equal(searchTaco("peito de frango grelhado")[0].nome, "Frango, peito, sem pele, grelhado");
  assert.ok(searchTaco("feijão carioca").some((i) => /carioca/.test(i.nome)));
  assert.deepEqual(searchTaco("xyzzy"), []);
  assert.equal(tacoHints("2 ovos, banana e leite").length, 3);
});

test("refeições salvas: criar, listar em /api/diet, limite de 20 e apagar", async () => {
  const env = makeEnv();
  const c = (m: string, p: string, body?: unknown) => call(env, m, p, { user: "ana", body });
  const t = await ok(c("POST", "/api/meal-templates", { name: "Marmita", meal: "almoco", text: "arroz, feijão e frango" }), 201);
  const d = (await ok(c("GET", `/api/diet?date=${D}`))).data;
  assert.equal(d.templates.length, 1);
  assert.deepEqual([d.templates[0].name, d.templates[0].kcal, d.templates[0].prot], ["Marmita", 590, 58]);
  for (let i = 1; i < 20; i++) await ok(c("POST", "/api/meal-templates", { name: `T${i}`, text: "pão" }), 201);
  assert.equal((await c("POST", "/api/meal-templates", { name: "21", text: "pão" })).status, 409);
  await ok(c("DELETE", `/api/meal-templates/${t.data.id}`));
  assert.equal((await c("DELETE", `/api/meal-templates/${t.data.id}`)).status, 404);
  assert.equal((await c("POST", "/api/meal-templates", { name: "", text: "pão" })).status, 400);
});

// 21 dias (ending 2026-11-21) de comida e peso direto no banco (evita o limite de escrita por minuto)
function seedDiet(env: any, uid: string, kcalOf: (i: number) => number, kgOf: (i: number) => number, start = "2026-11-01") {
  for (let i = 0; i < 21; i++) {
    const d = addDays(start, i);
    env.DB.raw.prepare("INSERT INTO food_log (user_id, id, date, raw_text, kcal, protein, source, created_at) VALUES (?1, ?2, ?3, 'dia', ?4, 120, 'local', ?5)").run(uid, `f-${uid}-${i}`, d, kcalOf(i), Date.now());
    env.DB.raw.prepare("INSERT INTO checkin (user_id, date, sleep_h, energy, soreness, stress, food, weight_kg, updated_at) VALUES (?1, ?2, 7, 2, 1, 2, 0, ?3, ?4)").run(uid, d, kgOf(i), Date.now());
  }
}
const uidOf = async (env: any, user: string) => (await call(env, "GET", "/api/account/export", { user })).data.user.id as string;

test("calorias adaptativas no servidor: ajusta a meta do perfil, grava o motivo e só revisa 1× por semana", async () => {
  const env = makeEnv();
  const c = (m: string, p: string, body?: unknown) => call(env, m, p, { user: "ana", body });
  await ok(c("PUT", "/api/profile", { data: { diet: { mode: "leve", kcal: 2400, protein: 140, pace: "moderado" } } }));
  const uid = await uidOf(env, "ana");
  seedDiet(env, uid, () => 2400, () => 72);                     // peso parado comendo 2400 → gasto 2400; moderado pede ~2675
  const r = await ok(c("POST", "/api/diet/adapt", { date: D }));
  assert.equal(r.data.changed, true);
  assert.equal(r.data.adjust, 150);
  assert.equal(r.data.kcal, 2550);
  assert.match(r.data.reason, /2\.400 kcal/);
  const prof = (await ok(c("GET", `/api/state?date=${D}`))).data.profile;
  assert.equal(prof.diet.kcal, 2550, "a meta do perfil mudou");
  assert.equal(prof.diet.protein, 140);
  const d = (await ok(c("GET", `/api/diet?date=${D}`))).data;
  assert.equal(d.history.length, 1);
  assert.deepEqual([d.history[0].before, d.history[0].after, d.history[0].adjust], [2400, 2550, 150]);
  assert.match(d.history[0].reason, /\+150/);
  assert.ok(d.weights.length >= 20);
  // segunda chamada na mesma semana: não mexe
  const again = await ok(c("POST", "/api/diet/adapt", { date: addDays(D, 3) }));
  assert.deepEqual([again.data.changed, again.data.code, again.data.kcal], [false, "recente", 2550]);
  // 7 dias depois pode revisar de novo
  const next = await ok(c("POST", "/api/diet/adapt", { date: addDays(D, 7) }));
  assert.notEqual(next.data.code, "recente");
  assert.equal((await c("POST", "/api/diet/adapt", { date: "ontem" })).status, 400);
});

test("calorias adaptativas: sem dados suficientes não grava nada e explica", async () => {
  const env = makeEnv();
  const c = (m: string, p: string, body?: unknown) => call(env, m, p, { user: "ana", body });
  const sem = await ok(c("POST", "/api/diet/adapt", { date: D }));
  assert.equal(sem.data.code, "sem_perfil");
  await ok(c("PUT", "/api/profile", { data: { diet: { kcal: 2650 } } }));
  const poucos = await ok(c("POST", "/api/diet/adapt", { date: D }));
  assert.deepEqual([poucos.data.changed, poucos.data.code], [false, "sem_dados"]);
  assert.match(poucos.data.reason, /peso/i);
  assert.equal((await ok(c("GET", `/api/diet?date=${D}`))).data.history.length, 0, "sem dados não consome a semana");
});

test("calorias adaptativas: duas contas, cada uma com os próprios dados", async () => {
  const env = makeEnv();
  const prof = { data: { diet: { kcal: 2400, protein: 140, pace: "moderado" } } };
  await ok(call(env, "PUT", "/api/profile", { user: "ana", body: prof }));
  await ok(call(env, "PUT", "/api/profile", { user: "bia", body: { data: { diet: { kcal: 3000, protein: 140, pace: "moderado" } } } }));
  seedDiet(env, await uidOf(env, "ana"), () => 2400, () => 72);
  seedDiet(env, await uidOf(env, "bia"), () => 3000, (i) => 72 + i * (0.6 / 7));
  const a = (await ok(call(env, "POST", "/api/diet/adapt", { user: "ana", body: { date: D } }))).data;
  const b = (await ok(call(env, "POST", "/api/diet/adapt", { user: "bia", body: { date: D } }))).data;
  assert.equal(a.adjust, 150);   // peso parado: sobe
  assert.equal(b.adjust, -150);  // ganhando ~0,5 kg/sem: desce
  assert.ok(!JSON.stringify(a).includes("3.000"));
});

test("cintura subindo com peso subindo rápido: -150 antes de tudo (a partir das medidas)", async () => {
  const env = makeEnv();
  const c = (m: string, p: string, body?: unknown) => call(env, m, p, { user: "ana", body });
  await ok(c("PUT", "/api/profile", { data: { diet: { kcal: 3000, protein: 140, pace: "rapido" } } }));
  seedDiet(env, await uidOf(env, "ana"), () => 3000, (i) => 72 + i * (0.7 / 7));
  await ok(c("PUT", "/api/measurements/2026-10-25", { waistCm: 80 }));
  await ok(c("PUT", "/api/measurements/2026-11-20", { waistCm: 81.4 }));
  const r = await ok(c("POST", "/api/diet/adapt", { date: D }));
  assert.equal(r.data.code, "cintura");
  assert.equal(r.data.adjust, -150);
  assert.match(r.data.reason, /cintura/i);
});
