// #26 Academias e lugares: CRUD validado, dias da semana (espelho do perfil), apagar com reatribuição + lixeira de 30 dias,
// mídia do aparelho (tipo errado → 415, lugar obrigatório e só da própria conta, Range) e busca de endereço (Nominatim pelo Worker).
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { call, makeEnv } from "./fakes.ts";
import { TRASH_MS, purgeTrash } from "../src/db.ts";

const PNG = new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4, 5, 6]);
const NO_DAYS = Object.fromEntries(["seg", "ter", "qua", "qui", "sex", "sab", "dom"].map((d) => [d, null])); // o perfil padrão já traz dias; os testes começam limpos
const profile = { data: { dayGym: NO_DAYS, level: 1, priorities: ["ombro"], minutes: 60, daysTarget: 4, daysUsual: ["seg", "ter", "qua", "qui"], prefs: {}, pinned: {}, avoid: [], goal: { statement: "x" } } };
const ok = async (p: Promise<{ status: number; text: string; data: any }>, st = 200) => { const r = await p; assert.ok(r.status >= st && r.status < st + 100, `${r.status} ${r.text}`); return r; };
const put = (env: any, user: string, id: string, body: unknown) => call(env, "PUT", `/api/gyms/${id}`, { user, body });
const upload = (env: any, user: string, qs: string, raw = PNG, ct = "image/png") => call(env, "POST", `/api/media?${qs}`, { user, raw, ct });
const mirror = (env: any, uid = "u") => Object.fromEntries(env.DB.raw.prepare("SELECT weekday, gym_id FROM gym_weekday WHERE user_id = ?1").all(uid).map((r: any) => [r.weekday, r.gym_id]));
const uidOf = async (env: any, user: string) => (await call(env, "GET", "/api/account/export", { user })).data.user.id as string;

test("lugar: cria com tipo, endereço e ponto no mapa; lista; edita só o que veio", async () => {
  const env = makeEnv();
  const r = await ok(put(env, "ana", "smart-fit", { name: "Smart Fit", kind: "academia", address: "Av. Paulista, 1000", lat: -23.5614, lng: -46.6559, equipment: ["halteres", "banco"], busyHours: ["18-20"] }));
  assert.equal(r.data.gym.lat, -23.5614); assert.equal(r.data.gym.kind, "academia");
  await ok(put(env, "ana", "casa", { name: "Casa", kind: "casa" }));
  const list = (await ok(call(env, "GET", "/api/gyms", { user: "ana" }))).data.gyms;
  assert.deepEqual(list.map((g: any) => g.id), ["smart-fit", "casa"]);
  assert.equal(list[1].lat, null);
  // renomear sem mandar o resto: aparelhos, endereço e ponto continuam
  const e = (await ok(put(env, "ana", "smart-fit", { name: "Smart Fit Centro" }))).data.gym;
  assert.equal(e.name, "Smart Fit Centro"); assert.deepEqual(e.equipment, ["halteres", "banco"]); assert.equal(e.address, "Av. Paulista, 1000"); assert.equal(e.lng, -46.6559);
  // tirar o ponto do mapa
  const n = (await ok(put(env, "ana", "smart-fit", { lat: null, lng: null }))).data.gym;
  assert.equal(n.lat, null); assert.equal(n.lng, null);
  // o estado do app traz tudo
  const st = (await ok(call(env, "GET", "/api/state?date=2026-11-05", { user: "ana" }))).data;
  assert.equal(st.gyms.length, 2); assert.equal(st.gyms[0].kind, "academia");
});

test("lugar: validação (nome ≤ 40, faixa de lat/lng, aparelho do catálogo, SQL literal) e limite de 20", async () => {
  const env = makeEnv();
  const bad = async (b: object, re: RegExp) => { const x = await put(env, "ana", "a1", { name: "A", ...b }); assert.equal(x.status, 400, x.text); assert.match(x.data.error, re); };
  await bad({ name: "x".repeat(41) }, /40/);
  await bad({ lat: 91, lng: 0 }, /lat/);
  await bad({ lat: 10, lng: 181 }, /lng/);
  await bad({ lat: 10 }, /juntos/);
  await bad({ kind: "praça" }, /tipo/);
  await bad({ equipment: ["nave"] }, /aparelho/);
  await bad({ weekdays: ["xyz"] }, /dia/);
  assert.equal((await call(env, "PUT", "/api/gyms/Maiúscula!", { user: "ana", body: { name: "A" } })).status, 400);
  assert.equal((await call(env, "PUT", "/api/gyms/a1", { user: "ana", raw: PNG, ct: "text/plain" })).status, 415);
  const inj = "x'; DROP TABLE gym;--";
  await ok(put(env, "ana", "inj", { name: inj }));
  assert.equal((await call(env, "GET", "/api/gyms", { user: "ana" })).data.gyms[0].name, inj, "texto gravado como texto");
  for (let i = 0; i < 19; i++) await ok(put(env, "ana", `g${i}`, { name: `G ${i}` }));
  const over = await put(env, "ana", "g20", { name: "G 20" });
  assert.equal(over.status, 409); assert.match(over.data.error, /20/);
  assert.equal((await put(env, "ana", "g3", { name: "G três" })).status, 200, "editar um existente continua valendo");
});

test("dias da semana: o lugar vira o padrão do dia no perfil e no espelho; um dia tem um lugar só", async () => {
  const env = makeEnv(); const uid = await uidOf(env, "ana");
  await ok(call(env, "PUT", "/api/profile", { user: "ana", body: profile }));
  await ok(put(env, "ana", "a", { name: "A", weekdays: ["seg", "qua"] }));
  await ok(put(env, "ana", "b", { name: "B", weekdays: ["qua", "sex"] }));
  const dayGym = JSON.parse(env.DB.raw.prepare("SELECT data FROM profile WHERE user_id = ?1").get(uid).data).dayGym;
  assert.equal(dayGym.seg, "a"); assert.equal(dayGym.qua, "b"); assert.equal(dayGym.sex, "b");
  assert.deepEqual(mirror(env, uid), { seg: "a", qua: "b", sex: "b" });
  const gyms = (await call(env, "GET", "/api/gyms", { user: "ana" })).data.gyms;
  assert.deepEqual(gyms.find((g: any) => g.id === "a").weekdays, ["seg"]);
  assert.deepEqual(gyms.find((g: any) => g.id === "b").weekdays, ["qua", "sex"]);
  // tirar os dias
  await ok(put(env, "ana", "b", { weekdays: [] }));
  assert.deepEqual(mirror(env, uid), { seg: "a" });
  // o app grava o perfil inteiro: o espelho acompanha
  await ok(call(env, "PUT", "/api/profile", { user: "ana", body: { data: { ...profile.data, dayGym: { ...NO_DAYS, ter: "b", qui: "b" } } } }));
  assert.deepEqual(mirror(env, uid), { ter: "b", qui: "b" });
});

test("dias da semana sem perfil ainda: só o espelho; perfil não é criado", async () => {
  const env = makeEnv(); const uid = await uidOf(env, "nova");
  await ok(put(env, "nova", "a", { name: "A", weekdays: ["seg"] }));
  assert.deepEqual(mirror(env, uid), { seg: "a" });
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM profile WHERE user_id = ?1").get(uid).n, 0);
});

test("apagar: pede o destino dos dias; reatribui; lugar e mídia vão para a lixeira e some do R2 só depois de 30 dias", async () => {
  const env = makeEnv(); const uid = await uidOf(env, "ana");
  await ok(call(env, "PUT", "/api/profile", { user: "ana", body: profile }));
  await ok(put(env, "ana", "a", { name: "A", weekdays: ["seg", "qua"] }));
  await ok(put(env, "ana", "b", { name: "B" }));
  const m = (await ok(upload(env, "ana", "gymId=a&equipmentId=halteres&note=pino%204"), 201)).data.id;
  const r2Keys = () => [...env.MEDIA.m.keys()].filter((k: string) => k.includes(uid));
  assert.equal(r2Keys().length, 1);

  const sem = await call(env, "DELETE", "/api/gyms/a", { user: "ana" });
  assert.equal(sem.status, 409); assert.deepEqual(sem.data.days, ["seg", "qua"]); assert.deepEqual(sem.data.options, ["b"]);
  assert.equal((await call(env, "DELETE", "/api/gyms/a", { user: "ana", body: { reassignTo: "a" } })).status, 404, "destino igual ao apagado");
  assert.equal((await call(env, "DELETE", "/api/gyms/a", { user: "ana", body: { reassignTo: "nao_existe" } })).status, 404);
  assert.equal((await call(env, "GET", "/api/gyms", { user: "ana" })).data.gyms.length, 2, "nada mudou");

  const t0 = Date.now();
  await ok(call(env, "DELETE", "/api/gyms/a", { user: "ana", body: { reassignTo: "b" } }));
  assert.deepEqual((await call(env, "GET", "/api/gyms", { user: "ana" })).data.gyms.map((g: any) => g.id), ["b"]);
  assert.deepEqual(mirror(env, uid), { seg: "b", qua: "b" });
  const dayGym = JSON.parse(env.DB.raw.prepare("SELECT data FROM profile WHERE user_id = ?1").get(uid).data).dayGym;
  assert.equal(dayGym.seg, "b"); assert.equal(dayGym.qua, "b");
  assert.equal((await call(env, "GET", `/api/media/${m}`, { user: "ana" })).status, 404, "mídia na lixeira não é servida");
  assert.equal((await call(env, "GET", "/api/media?gymId=a", { user: "ana" })).data.media.length, 0);
  assert.equal((await call(env, "GET", "/api/state?date=2026-11-05", { user: "ana" })).data.media.length, 0);
  assert.equal(r2Keys().length, 1, "o arquivo continua no R2 durante a carência");
  assert.equal((await call(env, "DELETE", "/api/gyms/a", { user: "ana" })).status, 404, "já apagado");
  assert.equal((await upload(env, "ana", "gymId=a&equipmentId=halteres")).status, 404, "não grava em lugar apagado");

  assert.deepEqual(await purgeTrash(env, t0 + TRASH_MS - 60_000), { media: 0, gyms: 0 }, "antes dos 30 dias nada some");
  assert.equal(r2Keys().length, 1);
  assert.deepEqual(await purgeTrash(env, t0 + TRASH_MS + 60_000), { media: 1, gyms: 1 });
  assert.equal(r2Keys().length, 0, "agora some do R2");
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM media WHERE user_id = ?1").get(uid).n, 0);
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM gym WHERE user_id = ?1 AND id = 'a'").get(uid).n, 0);
});

test("apagar: lugar sem dias não pede destino; o último lugar pode ser apagado; o id apagado pode ser usado de novo (limpo)", async () => {
  const env = makeEnv();
  await ok(put(env, "ana", "a", { name: "A", equipment: ["halteres"], lat: 1, lng: 2, address: "Rua X" }));
  await ok(call(env, "DELETE", "/api/gyms/a", { user: "ana" }));
  assert.deepEqual((await call(env, "GET", "/api/gyms", { user: "ana" })).data.gyms, []);
  const n = (await ok(put(env, "ana", "a", { name: "Nova A" }))).data.gym;
  assert.equal(n.name, "Nova A"); assert.deepEqual(n.equipment, []); assert.equal(n.lat, null); assert.equal(n.address, null);
});

test("apagar sem outro lugar: os dias ficam sem padrão", async () => {
  const env = makeEnv(); const uid = await uidOf(env, "ana");
  await ok(call(env, "PUT", "/api/profile", { user: "ana", body: profile }));
  await ok(put(env, "ana", "a", { name: "A", weekdays: ["seg"] }));
  const r = await ok(call(env, "DELETE", "/api/gyms/a", { user: "ana" }));
  assert.equal(r.data.reassignedTo, null);
  assert.deepEqual(mirror(env, uid), {});
  assert.equal(JSON.parse(env.DB.raw.prepare("SELECT data FROM profile WHERE user_id = ?1").get(uid).data).dayGym.seg, undefined);
});

test("mídia do aparelho: tipo errado → 415 (nada vai ao R2); aparelho exige lugar; lugar tem que ser da conta", async () => {
  const env = makeEnv();
  await ok(put(env, "ana", "a", { name: "A" }));
  await ok(put(env, "bia", "b", { name: "MARCA_B" }));
  const bad = await upload(env, "ana", "gymId=a&equipmentId=halteres", new TextEncoder().encode("<script>"), "text/html");
  assert.equal(bad.status, 415);
  assert.equal((await upload(env, "ana", "gymId=a&equipmentId=halteres", PNG, "application/pdf")).status, 415);
  assert.equal((await upload(env, "ana", "gymId=a&equipmentId=halteres", PNG, "image/svg+xml")).status, 415);
  assert.equal(env.MEDIA.m.size, 0, "tipo errado não grava nada");
  assert.equal((await upload(env, "ana", "equipmentId=halteres")).status, 400, "aparelho sem lugar");
  assert.equal((await upload(env, "ana", "gymId=a&equipmentId=nave")).status, 400);
  assert.equal((await upload(env, "ana", "gymId=b&equipmentId=halteres")).status, 404, "lugar da outra conta");
  assert.equal((await upload(env, "ana", "gymId=nao_existe")).status, 404);
  assert.equal(env.MEDIA.m.size, 0);
  const good = await ok(upload(env, "ana", "gymId=a&equipmentId=halteres&note=pino%203"), 201);
  assert.equal(env.MEDIA.m.size, 1);
  const list = (await call(env, "GET", "/api/media?gymId=a&equipmentId=halteres", { user: "ana" })).data.media;
  assert.equal(list.length, 1); assert.equal(list[0].note, "pino 3"); assert.equal(list[0].gym_id, "a");
  assert.equal((await call(env, "GET", "/api/media?gymId=a&equipmentId=banco", { user: "ana" })).data.media.length, 0);
  assert.equal((await call(env, "GET", `/api/media/${good.data.id}`, { user: "bia" })).status, 404);
  assert.equal((await call(env, "GET", "/api/media?gymId=a", { user: "bia" })).data.media.length, 0);
  // acima de 20 MB → 413
  const big = await call(env, "POST", "/api/media?gymId=a&equipmentId=halteres", { user: "ana", raw: PNG, ct: "video/mp4", headers: {} });
  assert.equal(big.status, 201);
  const huge = new Request("http://localhost:8791/api/media", { method: "POST", headers: { "Content-Type": "video/mp4", "Content-Length": String(21 * 1024 * 1024), "x-dev-user": "ana" }, body: PNG });
  const w = (await import("../src/index.ts")).default as any;
  assert.equal((await w.fetch(huge, env)).status, 413);
});

test("mídia: Range devolve 206 com o pedaço certo (Safari só toca vídeo assim)", async () => {
  const env = makeEnv();
  await ok(put(env, "ana", "a", { name: "A" }));
  const bytes = new Uint8Array(Array.from({ length: 100 }, (_, i) => i));
  const id = (await ok(upload(env, "ana", "gymId=a&equipmentId=halteres", bytes, "video/mp4"), 201)).data.id;
  const get = (range?: string) => (import("../src/index.ts") as Promise<any>).then((m) => m.default.fetch(new Request(`http://localhost:8791/api/media/${id}`, { headers: { "x-dev-user": "ana", ...(range ? { Range: range } : {}) } }), env));
  const full = await get(); assert.equal(full.status, 200); assert.equal(full.headers.get("Accept-Ranges"), "bytes");
  assert.equal((await full.arrayBuffer()).byteLength, 100);
  const part = await get("bytes=10-19"); assert.equal(part.status, 206); assert.equal(part.headers.get("Content-Range"), "bytes 10-19/100");
  assert.deepEqual([...new Uint8Array(await part.arrayBuffer())], [10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
  const tail = await get("bytes=95-"); assert.equal(tail.status, 206); assert.equal((await tail.arrayBuffer()).byteLength, 5);
  const last = await get("bytes=-4"); assert.equal(last.headers.get("Content-Range"), "bytes 96-99/100");
  assert.equal((await get("bytes=500-600")).status, 416);
});

test("busca de endereço: o Worker chama o Nominatim com User-Agent genérico, filtra o resultado e limita a 1 req/s", async (t) => {
  const env = makeEnv();
  const calls: { url: string; ua: string }[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, init: any) => {
    calls.push({ url: String(url), ua: init?.headers?.["User-Agent"] });
    return new Response(JSON.stringify([
      { display_name: "Av. Paulista, São Paulo", lat: "-23.56135", lon: "-46.65591" },
      { display_name: "Fora da faixa", lat: "999", lon: "0" },
      { display_name: 42, lat: "1", lon: "2" },
      { lat: "1", lon: "2" },
    ]), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  t.mock.method(Date, "now", () => 1_800_000_000_000);
  const r = await ok(call(env, "GET", "/api/geocode?q=Avenida%20Paulista", { user: "ana" }));
  assert.deepEqual(r.data.results, [{ label: "Av. Paulista, São Paulo", lat: -23.56135, lng: -46.65591 }]);
  assert.match(calls[0].url, /^https:\/\/nominatim\.openstreetmap\.org\/search\?/);
  assert.match(calls[0].url, /q=Avenida\+Paulista/);
  assert.equal(calls[0].ua, "Ciclo-app/1.0");
  assert.ok(!/@/.test(calls[0].ua), "sem e-mail no User-Agent");
  const again = await call(env, "GET", "/api/geocode?q=Avenida%20Paulista", { user: "ana" });
  assert.equal(again.status, 429); assert.ok(again.headers.get("Retry-After"));
  assert.equal(calls.length, 1, "a 2ª busca nem chegou ao Nominatim");
  assert.equal((await call(env, "GET", "/api/geocode?q=ab", { user: "bia" })).status, 400);
  assert.equal((await call(env, "GET", "/api/geocode", { user: "bia" })).status, 400);
});

test("busca de endereço: Nominatim fora do ar → 502 com mensagem para marcar no mapa", async (t) => {
  const env = makeEnv();
  t.mock.method(globalThis, "fetch", async () => { throw new Error("rede"); });
  const r = await call(env, "GET", "/api/geocode?q=Rua%20Augusta", { user: "ana" });
  assert.equal(r.status, 502); assert.match(r.data.error, /mapa/);
});

test("exportar a conta inclui lugares (com lixeira) e dias", async () => {
  const env = makeEnv();
  await ok(call(env, "PUT", "/api/profile", { user: "ana", body: profile }));
  await ok(put(env, "ana", "a", { name: "A", lat: 1.5, lng: 2.5, address: "Rua X", weekdays: ["seg"] }));
  await ok(put(env, "ana", "b", { name: "B" }));
  await ok(call(env, "DELETE", "/api/gyms/b", { user: "ana" }));
  const e = (await call(env, "GET", "/api/account/export", { user: "ana" })).data;
  assert.equal(e.gym.length, 2); assert.equal(e.gym[0].lat, 1.5); assert.ok(e.gym[1].deleted_at > 0);
  assert.deepEqual(e.gym_weekday, [{ gym_id: "a", weekday: "seg" }]);
  // apagar a conta leva tudo
  await ok(call(env, "DELETE", "/api/account", { user: "ana", body: { confirm: "APAGAR" } }));
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM gym_weekday").get().n, 0);
});

test("busca de endereço: o limite de 1 req/s é do app inteiro (contas diferentes dividem a mesma vaga)", async (t) => {
  const env = makeEnv();
  let n = 0;
  t.mock.method(globalThis, "fetch", async () => { n++; return new Response("[]", { status: 200 }); });
  let agora = 1_800_000_000_000;
  t.mock.method(Date, "now", () => agora);
  await ok(call(env, "GET", "/api/geocode?q=Rua%20Augusta", { user: "ana" }));
  const outra = await call(env, "GET", "/api/geocode?q=Rua%20Oscar%20Freire", { user: "bia" });
  assert.equal(outra.status, 429, "a conta B não tem limite próprio esgotado, mas o app inteiro sim");
  assert.ok(Number(outra.headers.get("Retry-After")) >= 1);
  assert.equal(n, 1, "só uma consulta saiu para o Nominatim");
  agora += 1001;
  await ok(call(env, "GET", "/api/geocode?q=Rua%20Oscar%20Freire", { user: "bia" }));
  assert.equal(n, 2);
});

test("apagar lugar é atômico: se a lixeira falhar, perfil, histórico, dias e lugar ficam como estavam; e roda em um batch só", async () => {
  const env = makeEnv(); const uid = await uidOf(env, "ana");
  await ok(call(env, "PUT", "/api/profile", { user: "ana", body: profile }));
  await ok(put(env, "ana", "a", { name: "A", weekdays: ["seg", "qua"] }));
  await ok(put(env, "ana", "b", { name: "B" }));
  await ok(upload(env, "ana", "gymId=a&equipmentId=halteres"), 201);
  const estado = () => JSON.stringify([
    env.DB.raw.prepare("SELECT data FROM profile WHERE user_id = ?1").get(uid), env.DB.raw.prepare("SELECT COUNT(*) AS n FROM profile_history WHERE user_id = ?1").get(uid),
    mirror(env, uid), env.DB.raw.prepare("SELECT id, deleted_at FROM gym WHERE user_id = ?1 ORDER BY id").all(uid), env.DB.raw.prepare("SELECT deleted_at FROM media WHERE user_id = ?1").all(uid)]);
  const antes = estado();

  const prepare = env.DB.prepare, batch = env.DB.batch; let batches = 0, falhar = true;
  env.DB.batch = async (st: any[]) => { batches++; return batch(st); };
  env.DB.prepare = (sql: string) => {
    const s = prepare(sql);
    if (!falhar || !sql.startsWith("UPDATE media SET deleted_at")) return s;
    return { bind: () => ({ allSync: () => { throw new Error("falha simulada"); } }) } as any; // o último comando do batch quebra
  };
  const r = await call(env, "DELETE", "/api/gyms/a", { user: "ana", body: { reassignTo: "b" } });
  assert.equal(r.status, 500);
  assert.equal(estado(), antes, "nada mudou: nem o perfil, nem o histórico, nem o espelho, nem o lugar");

  falhar = false; batches = 0;
  await ok(call(env, "DELETE", "/api/gyms/a", { user: "ana", body: { reassignTo: "b" } }));
  assert.equal(batches, 1, "perfil + espelho + lugar + mídia num batch só");
  assert.deepEqual(mirror(env, uid), { seg: "b", qua: "b" });
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM profile_history WHERE user_id = ?1").get(uid).n, JSON.parse(antes)[1].n + 1);
});
