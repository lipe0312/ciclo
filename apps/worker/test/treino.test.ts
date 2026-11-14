// #25 modo treino no Worker: cardio, sessão restaurável, desfazer série, histórico, resumo/PRs e Web Push (cron).
import { test } from "node:test";
import assert from "node:assert/strict";
import { call, makeEnv } from "./fakes.ts";
import { b64u, sendDueRests, validEndpoint, vapidAuth } from "../src/push.ts";

const D = "2026-11-05", EX = "Incline_Dumbbell_Curl";
const U1 = "0b7c6a2e-1d2f-4a3b-8c9d-0e1f2a3b4c5d", U2 = "1c8d7b3f-2e30-4b4c-9d0e-1f2a3b4c5d6e", U3 = "2d9e8c40-3f41-4c5d-8e1f-2a3b4c5d6e7f";
const PLAN = { name: "Sup. A", groups: ["sup"], items: [] };
const ok = async (p: Promise<{ status: number; text: string; data: any }>, st = 200) => { const r = await p; assert.ok(r.status >= st && r.status < 300, `${r.status} ${r.text}`); return r; };

async function vapidEnv() {
  const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const pub = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey)), jwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
  return { VAPID_PUBLIC_KEY: b64u(pub), VAPID_PRIVATE_KEY: jwk.d!, pub, kp };
}
async function startSession(env: any, user: string, id: string, startedAt = Date.now()) {
  await ok(call(env, "POST", "/api/sessions", { user, body: { id, date: D, plan: PLAN, startedAt } }), 201);
}
const set = (env: any, user: string, sid: string, n: number, kg: number, reps: number, ex = EX) =>
  ok(call(env, "POST", `/api/sessions/${sid}/sets`, { user, body: { exerciseId: ex, setNo: n, kg, reps } }));

test("cardio: registra, lista, entra no resumo da semana e valida (SQL em campo → 400)", async () => {
  const env = makeEnv();
  const c = (m: string, p: string, body?: unknown) => call(env, m, p, { user: "ana", body });
  const r = await ok(c("POST", "/api/cardio", { date: D, type: "Running_Treadmill", minutes: 30, intensity: "zona2", distanceKm: 4.2 }), 201);
  await ok(c("POST", "/api/cardio", { date: D, type: "Bicycling_Stationary", minutes: 20, intensity: "moderado" }), 201);
  const list = (await ok(c("GET", "/api/cardio"))).data.cardio;
  assert.equal(list.length, 2);
  assert.ok(list.some((x: any) => x.type === "Running_Treadmill" && x.distanceKm === 4.2 && x.minutes === 30));
  const week = (await ok(c("GET", `/api/state?date=${D}`))).data.week.cardio;
  assert.equal(week.length, 2, "aparece no resumo da semana");
  assert.equal((await c("GET", "/api/state?date=2026-12-24")).data.week.cardio.length, 0, "outra semana não");
  const bad = async (b: object, re: RegExp) => { const x = await c("POST", "/api/cardio", { date: D, type: "Running_Treadmill", minutes: 10, intensity: "zona2", ...b }); assert.equal(x.status, 400, x.text); assert.match(x.data.error, re); };
  await bad({ type: "x'; DROP TABLE cardio_log;--" }, /tipo/);
  await bad({ minutes: 0 }, /minutes/);
  await bad({ minutes: 301 }, /minutes/);
  await bad({ intensity: "forte" }, /intensity/);
  await bad({ type: "Elliptical_Trainer", distanceKm: 3 }, /distância/);
  await bad({ date: "ontem" }, /date/);
  assert.equal((await c("GET", "/api/cardio")).data.cardio.length, 2, "tabela intacta");
  // outra conta não vê nem apaga
  assert.equal((await call(env, "GET", "/api/cardio", { user: "bia" })).data.cardio.length, 0);
  assert.equal((await call(env, "DELETE", `/api/cardio/${r.data.id}`, { user: "bia" })).status, 404);
  assert.equal((await c("GET", "/api/cardio")).data.cardio.length, 2);
  assert.equal((await c("DELETE", `/api/cardio/${r.data.id}`)).status, 200);
  assert.equal((await c("GET", "/api/cardio")).data.cardio.length, 1);
});

test("sessão restaurável: plano, séries, 'não fiz' e descanso voltam do servidor; outra conta recebe 404", async () => {
  const env = makeEnv();
  await startSession(env, "ana", U1);
  await set(env, "ana", U1, 1, 12, 10); await set(env, "ana", U1, 2, 12, 9);
  await ok(call(env, "POST", `/api/sessions/${U1}/skip`, { user: "ana", body: { exerciseId: "Leg_Press", reason: "ocupado" } }));
  const rest = await ok(call(env, "PUT", `/api/sessions/${U1}/rest`, { user: "ana", body: { seconds: 90 } }));
  assert.equal(rest.data.scheduled, true);
  assert.equal(rest.data.push, false, "sem VAPID o push fica desligado");
  const s = (await ok(call(env, "GET", `/api/sessions/${U1}`, { user: "ana" }))).data;
  assert.equal(s.plan.name, "Sup. A");
  assert.deepEqual(s.sets.map((x: any) => [x.exerciseId, x.setNo, x.kg, x.reps]), [[EX, 1, 12, 10], [EX, 2, 12, 9]]);
  assert.deepEqual(s.skips, [{ exerciseId: "Leg_Press", reason: "ocupado" }]);
  assert.ok(s.rest.until > Date.now() + 80_000 && s.rest.until < Date.now() + 100_000);
  assert.equal((await call(env, "GET", `/api/sessions/${U1}`, { user: "bia" })).status, 404);
  // a conta B não agenda descanso na sessão da A
  const x = await ok(call(env, "PUT", `/api/sessions/${U1}/rest`, { user: "bia", body: { seconds: 30 } }));
  assert.equal(x.data.scheduled, false);
  assert.equal((await call(env, "PUT", `/api/sessions/${U1}/rest`, { user: "ana", body: { seconds: 5000 } })).status, 400);
  await ok(call(env, "DELETE", `/api/sessions/${U1}/rest`, { user: "ana" }));
  assert.equal((await call(env, "GET", `/api/sessions/${U1}`, { user: "ana" })).data.rest, null);
});

test("desfazer série: apaga só a da própria conta; editar (reenviar) atualiza", async () => {
  const env = makeEnv();
  await startSession(env, "ana", U1); await startSession(env, "bia", U1); // mesmo id, contas diferentes
  await set(env, "ana", U1, 1, 12, 10); await set(env, "bia", U1, 1, 50, 5);
  await set(env, "ana", U1, 1, 14, 8); // editar
  const get = async (u: string) => (await call(env, "GET", `/api/sessions/${U1}`, { user: u })).data.sets;
  assert.deepEqual((await get("ana")).map((x: any) => [x.kg, x.reps]), [[14, 8]]);
  const del = await call(env, "DELETE", `/api/sessions/${U1}/sets/${EX}/1`, { user: "ana" });
  assert.equal(del.data.removed, true);
  assert.equal((await get("ana")).length, 0);
  assert.deepEqual((await get("bia")).map((x: any) => [x.kg, x.reps]), [[50, 5]], "série da B intacta");
  const again = await call(env, "DELETE", `/api/sessions/${U1}/sets/${EX}/1`, { user: "ana" });
  assert.equal(again.data.removed, false);
  assert.equal((await call(env, "DELETE", `/api/sessions/${U1}/sets/${EX}/99`, { user: "ana" })).status, 400);
  assert.equal((await call(env, "DELETE", `/api/sessions/${U1}/sets/${encodeURIComponent("x'; DROP TABLE set_log;--")}/1`, { user: "ana" })).status, 400);
});

test("histórico por exercício: paginado, mais recente primeiro, só da própria conta; refs em lote", async () => {
  const env = makeEnv(), now = Date.now();
  const ids = [U1, U2, U3];
  for (const [i, sid] of ids.entries()) {
    await startSession(env, "ana", sid, now - (3 - i) * 3600e3);
    await set(env, "ana", sid, 1, 10 + i, 12); await set(env, "ana", sid, 2, 10 + i, 10);
  }
  await startSession(env, "bia", U1, now - 3600e3); await set(env, "bia", U1, 1, 99, 3);
  const h = (q = "") => call(env, "GET", `/api/exercises/${EX}/history${q}`, { user: "ana" });
  const all = (await ok(h())).data;
  assert.deepEqual(all.sessions.map((s: any) => s.sessionId), [U3, U2, U1]);
  assert.deepEqual(all.sessions[0].sets, [{ setNo: 1, kg: 12, reps: 12 }, { setNo: 2, kg: 12, reps: 10 }]);
  assert.equal(all.next, null);
  const p1 = (await h("?limit=2")).data;
  assert.deepEqual(p1.sessions.map((s: any) => s.sessionId), [U3, U2]);
  assert.ok(p1.next);
  const p2 = (await h(`?limit=2&before=${p1.next}`)).data;
  assert.deepEqual(p2.sessions.map((s: any) => s.sessionId), [U1]);
  assert.ok(!all.sessions.some((s: any) => s.sets.some((x: any) => x.kg === 99)), "nada da conta B"); // (o texto "99" aparece em timestamps)
  const last = (await ok(call(env, "GET", `/api/history/last?ids=${EX},Leg_Press&n=2`, { user: "ana" }))).data.history;
  assert.equal(last[EX].length, 2);
  assert.deepEqual(last[EX][0], [{ kg: 12, reps: 12 }, { kg: 12, reps: 10 }]);
  assert.deepEqual(last.Leg_Press, []);
  assert.equal((await call(env, "GET", "/api/history/last?ids=", { user: "ana" })).status, 400);
  assert.equal((await call(env, "GET", `/api/history/last?ids=${encodeURIComponent("a'--")}`, { user: "ana" })).status, 400);
  assert.equal((await call(env, "GET", `/api/exercises/${encodeURIComponent("x'; DROP TABLE set_log;--")}/history`, { user: "ana" })).status, 400);
});

test("encerrar: o servidor calcula o resumo (volume, PR) e a lista de sessões mostra volume e PRs", async () => {
  const env = makeEnv(), now = Date.now();
  await startSession(env, "ana", U1, now - 2 * 3600e3); await set(env, "ana", U1, 1, 10, 10);
  await ok(call(env, "POST", `/api/sessions/${U1}/finish`, { user: "ana", body: { feedback: {} } }));
  await startSession(env, "ana", U2, now - 1800e3); await set(env, "ana", U2, 1, 12, 10); await set(env, "ana", U2, 2, 12, 9);
  const fin = (await ok(call(env, "POST", `/api/sessions/${U2}/finish`, { user: "ana", body: { feedback: { effort: 2 } } }))).data;
  assert.equal(fin.summary.sets, 2);
  assert.equal(fin.summary.volume, 12 * 10 + 12 * 9);
  assert.ok(fin.summary.prs.some((p: any) => p.exerciseId === EX && p.kind === "carga" && p.value === 12 && p.prev === 10));
  assert.equal(fin.summary.perExercise[0].lastAvgReps, 10);
  const list = (await ok(call(env, "GET", "/api/sessions?limit=5", { user: "ana" }))).data;
  assert.deepEqual(list.sessions.map((s: any) => s.id), [U2, U1]);
  assert.equal(list.sessions[0].volume, 228);
  assert.ok(list.sessions[0].prs.length >= 1);
  assert.equal((await call(env, "GET", "/api/sessions", { user: "bia" })).data.sessions.length, 0);
  const pg = (await call(env, "GET", `/api/sessions?limit=1`, { user: "ana" })).data;
  assert.equal(pg.sessions.length, 1); assert.ok(pg.next);
  assert.equal((await call(env, "GET", `/api/sessions?before=${pg.next}`, { user: "ana" })).data.sessions[0].id, U1);
});

test("push: só endpoints de serviços conhecidos (sem SSRF); limite de 5; remover", async () => {
  assert.ok(validEndpoint("https://fcm.googleapis.com/fcm/send/abc"));
  assert.ok(validEndpoint("https://updates.push.services.mozilla.com/wpush/v2/abc"));
  assert.ok(validEndpoint("https://web.push.apple.com/QWxs"));
  for (const bad of ["http://fcm.googleapis.com/x", "https://fcm.googleapis.com.evil.com/x", "https://evil.com/fcm.googleapis.com", "https://127.0.0.1/x", "https://localhost/x",
    "https://user:pw@fcm.googleapis.com/x", "https://fcm.googleapis.com:8443/x", "file:///etc/passwd", "", 5]) assert.ok(!validEndpoint(bad), String(bad));
  const env = makeEnv();
  const sub = (n: number | string, endpoint = `https://fcm.googleapis.com/fcm/send/${n}`) => call(env, "POST", "/api/push/subscribe", { user: "ana", body: { endpoint, p256dh: "BPk_abc-DEF", auth: "xyz_123" } });
  assert.equal((await sub(1, "https://evil.example/x")).status, 400);
  assert.equal((await call(env, "POST", "/api/push/subscribe", { user: "ana", body: { endpoint: "https://fcm.googleapis.com/x", p256dh: "a b", auth: "x" } })).status, 400);
  for (let i = 1; i <= 5; i++) assert.equal((await sub(i)).status, 201);
  assert.equal((await sub(3)).status, 201, "reenviar o mesmo aparelho atualiza, não conta de novo");
  assert.equal((await sub(6)).status, 409);
  assert.equal((await call(env, "DELETE", "/api/push/subscribe", { user: "ana", body: { endpoint: "https://fcm.googleapis.com/fcm/send/1" } })).data.removed, true);
  assert.equal((await call(env, "DELETE", "/api/push/subscribe", { user: "bia", body: { endpoint: "https://fcm.googleapis.com/fcm/send/2" } })).data.removed, false);
  assert.equal((await call(env, "GET", "/api/push/key", { user: "ana" })).data.publicKey, null);
  const v = await vapidEnv();
  assert.equal((await call(makeEnv({ VAPID_PUBLIC_KEY: v.VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY: v.VAPID_PRIVATE_KEY }), "GET", "/api/push/key", { user: "ana" })).data.publicKey, v.VAPID_PUBLIC_KEY);
});

test("VAPID: o JWT tem aud do serviço e assinatura ES256 válida", async () => {
  const v = await vapidEnv(), env = makeEnv({ VAPID_PUBLIC_KEY: v.VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY: v.VAPID_PRIVATE_KEY });
  const h = await vapidAuth(env, "https://fcm.googleapis.com/fcm/send/abc", 1_700_000_000_000);
  const m = h.match(/^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/)!;
  assert.ok(m, h);
  assert.equal(m[4], v.VAPID_PUBLIC_KEY);
  const claims = JSON.parse(Buffer.from(m[2], "base64url").toString());
  assert.equal(claims.aud, "https://fcm.googleapis.com");
  assert.equal(claims.exp, 1_700_000_000 + 12 * 3600);
  assert.match(claims.sub, /^mailto:/);
  const good = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, v.kp.publicKey, Buffer.from(m[3], "base64url"), new TextEncoder().encode(`${m[1]}.${m[2]}`));
  assert.ok(good, "assinatura confere com a chave pública");
});

test("cron do descanso: avisa só a conta dona, uma vez, só com sessão aberta; 410 remove a assinatura", async () => {
  const v = await vapidEnv();
  const env = makeEnv({ VAPID_PUBLIC_KEY: v.VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY: v.VAPID_PRIVATE_KEY });
  const calls: { url: string; auth: string; redirect?: string }[] = []; let status = 201;
  const real = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit) => { calls.push({ url: String(url), auth: String((init.headers as Record<string, string>).Authorization), redirect: init.redirect }); return new Response(null, { status }); }) as typeof fetch;
  try {
    const sub = (u: string, n: string) => call(env, "POST", "/api/push/subscribe", { user: u, body: { endpoint: `https://fcm.googleapis.com/fcm/send/${n}`, p256dh: "BPk_abc", auth: "xyz" } });
    await sub("ana", "ana-aparelho"); await sub("bia", "bia-aparelho");
    await startSession(env, "ana", U1); await startSession(env, "bia", U2);
    await ok(call(env, "PUT", `/api/sessions/${U1}/rest`, { user: "ana", body: { seconds: 60 } }));
    const t0 = Date.now();
    assert.equal(await sendDueRests(env, t0 + 30_000), 0, "ainda não venceu");
    assert.equal(calls.length, 0);
    assert.equal(await sendDueRests(env, t0 + 65_000), 1);
    assert.deepEqual(calls.map((c) => c.url), ["https://fcm.googleapis.com/fcm/send/ana-aparelho"], "a conta B (sem descanso) não recebe nada");
    assert.match(calls[0].auth, /^vapid t=.+, k=/);
    assert.equal(calls[0].redirect, "manual", "não segue redirecionamento do serviço de push");
    assert.equal(await sendDueRests(env, t0 + 125_000), 0, "não repete");
    // reagendar (+15) rearma; sessão encerrada não avisa
    await ok(call(env, "PUT", `/api/sessions/${U1}/rest`, { user: "ana", body: { seconds: 20 } }));
    await ok(call(env, "POST", `/api/sessions/${U1}/finish`, { user: "ana", body: { feedback: {} } }));
    assert.equal(await sendDueRests(env, Date.now() + 60_000), 0, "treino encerrado");
    // assinatura morta (410) é removida
    await ok(call(env, "PUT", `/api/sessions/${U2}/rest`, { user: "bia", body: { seconds: 10 } }));
    status = 410;
    assert.equal(await sendDueRests(env, Date.now() + 30_000), 0);
    assert.equal(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM push_subscription WHERE user_id IN (SELECT id FROM user WHERE email LIKE 'bia@%')").get().n, 0);
    // sem chaves VAPID o cron não faz nada e não marca como enviado
    const off = makeEnv(); const n0 = calls.length;
    assert.equal(await sendDueRests(off, Date.now()), 0); assert.equal(calls.length, n0);
  } finally { globalThis.fetch = real; }
});

test("isolamento do resumo e do descanso: A escolhe o MESMO id de sessão da B e tem o mesmo exercício; nada da B entra", async () => {
  const env = makeEnv(), now = Date.now();
  // B: histórico antigo do exercício (77.5 kg, já encerrado) + sessão aberta com séries e descanso agendado
  await startSession(env, "bia", U1, now - 5 * 3600e3); await set(env, "bia", U1, 1, 77.5, 9); await set(env, "bia", U1, 2, 77.5, 8);
  await ok(call(env, "POST", `/api/sessions/${U1}/finish`, { user: "bia", body: { feedback: {} } }));
  await startSession(env, "bia", U2, now - 600e3); await set(env, "bia", U2, 1, 55, 6); await set(env, "bia", U2, 2, 55, 6);
  await ok(call(env, "PUT", `/api/sessions/${U2}/rest`, { user: "bia", body: { seconds: 120 } }));
  // A: sessão com o id da B (o id vem do aparelho), 1 série de 10 kg
  await startSession(env, "ana", U2, now);
  await set(env, "ana", U2, 1, 10, 10);
  const got = (await ok(call(env, "GET", `/api/sessions/${U2}`, { user: "ana" }))).data;
  assert.deepEqual(got.sets.map((x: any) => [x.kg, x.reps]), [[10, 10]], "séries só da A");
  assert.equal(got.rest, null, "descanso da B não aparece na sessão da A");
  assert.ok(!JSON.stringify(got).includes("77.5") && !JSON.stringify(got).includes('"kg":55'));
  const fin = (await ok(call(env, "POST", `/api/sessions/${U2}/finish`, { user: "ana", body: { feedback: {} } }))).data.summary;
  assert.equal(fin.sets, 1, "resumo conta só as séries da A");
  assert.equal(fin.volume, 100);
  assert.deepEqual(fin.prs, [], "sem histórico próprio não há recorde (o 77.5 da B não é referência)");
  assert.equal(fin.perExercise.length, 1);
  assert.equal(fin.perExercise[0].lastAvgKg, null, "'última vez' da A não vem da B");
  assert.equal(fin.vs.pct, null);
  // o resumo salvo e a lista da A também
  const list = (await ok(call(env, "GET", "/api/sessions", { user: "ana" }))).data.sessions;
  assert.equal(list.length, 1); assert.equal(list[0].volume, 100); assert.deepEqual(list[0].prs, []);
  // a sessão da B segue aberta, com o descanso e as séries intactos
  const b = (await ok(call(env, "GET", `/api/sessions/${U2}`, { user: "bia" }))).data;
  assert.equal(b.finishedAt, null);
  assert.deepEqual(b.sets.map((x: any) => x.kg), [55, 55]);
  assert.ok(b.rest && b.rest.until > Date.now());
});

test("push: aparelho compartilhado troca de dono; limite de 5 é por conta e só conta o que é da conta", async () => {
  const env = makeEnv();
  const ep = (n: string) => `https://fcm.googleapis.com/fcm/send/${n}`;
  const sub = (u: string, n: string) => call(env, "POST", "/api/push/subscribe", { user: u, body: { endpoint: ep(n), p256dh: "BPk_abc", auth: "xyz" } });
  const owners = (n: string) => env.DB.raw.prepare("SELECT u.email FROM push_subscription p JOIN user u ON u.id = p.user_id WHERE p.endpoint = ?1").all(ep(n)).map((r: any) => r.email.split("@")[0]);
  assert.equal((await sub("ana", "tel")).status, 201);
  assert.deepEqual(owners("tel"), ["ana"]);
  assert.equal((await sub("bia", "tel")).status, 201, "a Bia entrou no mesmo aparelho");
  assert.deepEqual(owners("tel"), ["bia"], "o endpoint saiu da Ana: ela não recebe aviso no aparelho da Bia");
  // a Bia lota (5 aparelhos); a Ana tem o "novo" e a Bia tenta pegá-lo como 6º: 409 e a Ana mantém
  for (const n of ["b2", "b3", "b4", "b5"]) assert.equal((await sub("bia", n)).status, 201);
  assert.equal((await sub("ana", "novo")).status, 201);
  assert.equal((await sub("bia", "novo")).status, 409, "existir na conta de OUTRA pessoa não dá vaga");
  assert.deepEqual(owners("novo"), ["ana"], "falhou, então não tirou da Ana");
  assert.equal((await sub("bia", "tel")).status, 201, "reassinar o próprio aparelho com a conta lotada atualiza");
  // o limite vale na concorrência: 8 pedidos simultâneos de uma conta nova entram no máximo 5
  const rs = await Promise.all(Array.from({ length: 8 }, (_, i) => sub("caio", `c${i}`)));
  assert.ok(rs.filter((r) => r.status === 201).length <= 5);
  assert.ok(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM push_subscription p JOIN user u ON u.id = p.user_id WHERE u.email LIKE 'caio@%'").get().n <= 5);
});

test("migration 0005: CHECKs recusam dado fora do formato (cardio, descanso, assinatura)", async () => {
  const env = makeEnv(); await call(env, "GET", "/api/account", { user: "ana" });
  const uid = env.DB.raw.prepare("SELECT id FROM user").get().id;
  const bad = (sql: string, ...a: unknown[]) => assert.throws(() => env.DB.raw.prepare(sql).run(...a), /CHECK constraint/, sql);
  const cardio = "INSERT INTO cardio_log (user_id, id, date, type, minutes, intensity, distance_km, created_at) VALUES (?1, ?2, ?3, ?4, 10, 'zona2', NULL, 1)";
  env.DB.raw.prepare(cardio).run(uid, "ok", "2026-11-05", "Running_Treadmill");
  bad(cardio, uid, "d1", "05/11/2026", "Running_Treadmill");
  bad(cardio, uid, "d2", "2026-11-5x", "Running_Treadmill");
  bad(cardio, uid, "d3", "2026-11-05", "");
  bad(cardio, uid, "d4", "2026-11-05", "x".repeat(61));
  bad("INSERT INTO rest_timer (user_id, session_id, fire_at) VALUES (?1, 's', 0)", uid);
  bad("INSERT INTO rest_timer (user_id, session_id, fire_at) VALUES (?1, 's', 9999999999999999)", uid);
  bad("INSERT INTO push_subscription (user_id, endpoint, p256dh, auth, created_at) VALUES (?1, ?2, 'a', 'b', 1)", uid, "https://x/" + "a".repeat(800));
});
