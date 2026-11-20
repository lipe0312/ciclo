// #122 Treino em andamento segue o treino do dia, no Worker real (D1 em memória): uma sessão aberta por dia (outro aparelho
// e "Começar" repetido retomam), o plano ajustado da sessão volta igual em outro aparelho, "Treinar de novo" abre a 2ª e as
// duas contam no volume, terminar para o descanso. Isolamento: a sessão aberta da B não impede a A nem é tocada por ela.
// Dados fictícios.
import { test } from "node:test";
import assert from "node:assert/strict";
import { b64u, sendDueRests } from "../src/push.ts";
import { call, makeEnv } from "./fakes.ts";

const D = "2026-11-20", EX = "Incline_Dumbbell_Curl", EX2 = "Cable_Seated_Lateral_Raise";
const S1 = "0b7c6a2e-1d2f-4a3b-8c9d-0e1f2a3b4c5d", S2 = "1c8d7b3f-2e30-4b4c-9d0e-1f2a3b4c5d6e", S3 = "2d9e8c40-3f41-4c5d-8e1f-2a3b4c5d6e7f";
const PLAN = { name: "Braços (fictício)", groups: ["sup"], items: [{ exerciseId: EX, sets: 3 }] };
const ok = async (p: Promise<{ status: number; text: string; data: any }>) => { const r = await p; assert.ok(r.status >= 200 && r.status < 300, `${r.status} ${r.text}`); return r.data; };
const comecar = (env: any, user: string, id: string) => ok(call(env, "POST", "/api/sessions", { user, body: { id, date: D, plan: PLAN, startedAt: Date.now() } }));
const serie = (env: any, user: string, sid: string, n: number, ex = EX) => ok(call(env, "POST", `/api/sessions/${sid}/sets`, { user, body: { exerciseId: ex, setNo: n, kg: 10, reps: 10 } }));
const doDia = async (env: any, user: string) => (await ok(call(env, "GET", `/api/state?date=${D}`, { user }))).week.sessions.filter((s: any) => s.date === D);

test("recarregar/outro aparelho: o 2º Começar no dia retoma a sessão aberta (não cria outra)", async () => {
  const env = makeEnv();
  const a = await comecar(env, "ana", S1);
  assert.equal(a.id, S1);
  const b = await comecar(env, "ana", S2); // outro aparelho, sem cópia local, tocou Começar
  assert.deepEqual([b.id, b.retomada, b.startedAt], [S1, true, a.startedAt]);
  const c = await comecar(env, "ana", S1); // o mesmo aparelho reenviando (fila offline)
  assert.equal(c.id, S1);
  assert.equal((await doDia(env, "ana")).length, 1, "uma sessão só");
});

test("IA altera o dia com treino em andamento: o plano ajustado fica na mesma sessão e outro aparelho retoma igual; séries não duplicam", async () => {
  const env = makeEnv();
  await comecar(env, "ana", S1);
  await serie(env, "ana", S1, 1); await serie(env, "ana", S1, 2);
  const ajustado = { ...PLAN, name: "Braços (IA)", doDia: "x", items: [{ exerciseId: EX, sets: 2, trocado: true }, { exerciseId: EX2, sets: 3 }] };
  assert.equal((await ok(call(env, "PUT", `/api/sessions/${S1}/plan`, { user: "ana", body: { plan: ajustado } }))).saved, true);
  await serie(env, "ana", S1, 2); // reenvio da mesma série (fila) não duplica
  const s = await ok(call(env, "GET", `/api/sessions/${S1}`, { user: "ana" }));
  assert.equal(s.plan.name, "Braços (IA)");
  assert.deepEqual(s.plan.items.map((i: any) => [i.exerciseId, i.trocado ?? false]), [[EX, true], [EX2, false]]);
  assert.equal(s.sets.length, 2);
  assert.equal((await doDia(env, "ana")).length, 1);
  // validação e conta alheia
  assert.equal((await call(env, "PUT", `/api/sessions/${S1}/plan`, { user: "ana", body: { plan: "x" } })).status, 400);
  assert.equal((await ok(call(env, "PUT", `/api/sessions/${S1}/plan`, { user: "bia", body: { plan: { items: [] } } }))).saved, false, "a B não troca o plano da A");
  assert.equal((await ok(call(env, "GET", `/api/sessions/${S1}`, { user: "ana" }))).plan.name, "Braços (IA)");
});

test("Treinar de novo depois de terminar → 2ª sessão no dia e as duas contam no volume; terminada não recebe plano nem descanso", async () => {
  const env = makeEnv();
  await comecar(env, "ana", S1); await serie(env, "ana", S1, 1); await serie(env, "ana", S1, 2);
  await ok(call(env, "POST", `/api/sessions/${S1}/finish`, { user: "ana", body: { feedback: {} } }));
  const n = await comecar(env, "ana", S2);
  assert.equal(n.id, S2, "2ª sessão de propósito");
  await serie(env, "ana", S2, 1);
  const st = await ok(call(env, "GET", `/api/state?date=${D}`, { user: "ana" }));
  assert.equal(st.week.sessions.filter((s: any) => s.date === D).length, 2);
  assert.equal(st.week.done.biceps, 3, "volume soma as duas sessões");
  assert.equal(st.week.freq.biceps, 2);
  // a 1ª, terminada, não volta a aceitar plano nem descanso
  assert.equal((await ok(call(env, "PUT", `/api/sessions/${S1}/plan`, { user: "ana", body: { plan: PLAN } }))).saved, false);
  assert.equal((await ok(call(env, "PUT", `/api/sessions/${S1}/rest`, { user: "ana", body: { seconds: 30 } }))).scheduled, false);
});

test("terminar para o push de descanso (mesmo agendado antes)", async () => {
  const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const pub = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey)), jwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
  const env = makeEnv({ VAPID_PUBLIC_KEY: b64u(pub), VAPID_PRIVATE_KEY: jwk.d! });
  const real = globalThis.fetch; let enviados = 0;
  globalThis.fetch = (async () => { enviados++; return new Response(null, { status: 201 }); }) as typeof fetch;
  try {
    await ok(call(env, "POST", "/api/push/subscribe", { user: "ana", body: { endpoint: "https://fcm.googleapis.com/fcm/send/ficticio", p256dh: "BPk_abc", auth: "xyz" } }));
    await comecar(env, "ana", S1);
    await ok(call(env, "PUT", `/api/sessions/${S1}/rest`, { user: "ana", body: { seconds: 30 } }));
    await ok(call(env, "POST", `/api/sessions/${S1}/finish`, { user: "ana", body: { feedback: {} } }));
    assert.equal(await sendDueRests(env, Date.now() + 60_000), 0);
    assert.equal(enviados, 0);
    const s = await ok(call(env, "GET", `/api/sessions/${S1}`, { user: "ana" }));
    assert.ok(s.finishedAt, "fica terminada ao recarregar");
    assert.equal(s.rest, null);
  } finally { globalThis.fetch = real; }
});

test("isolamento: a sessão aberta da B (mesmo dia, mesmo id) não faz a A retomar a dela", async () => {
  const env = makeEnv();
  await comecar(env, "bia", S3);
  const a = await comecar(env, "ana", S1);
  assert.deepEqual([a.id, a.retomada], [S1, undefined]);
  const a2 = await comecar(env, "ana", S3); // id igual ao da B
  assert.equal(a2.id, S1, "retoma a da própria conta");
  assert.equal((await doDia(env, "bia")).length, 1);
  assert.equal((await doDia(env, "ana")).length, 1);
});
