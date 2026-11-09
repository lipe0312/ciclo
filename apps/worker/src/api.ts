// API JSON do app (atrás do Cloudflare Access). Rotas pequenas, um estado agregado por chamada (/api/state)
// para o celular fazer 1 requisição ao abrir.
import { EXERCISE_BY_ID, MUSCLE_IDS, PROMPTS, applyManualEdit, classify, planDay } from "@ciclo/core";
import type { DayPlan, ManualEdit, Mode, MuscleId, Tier } from "@ciclo/core";
import type { Env } from "./env.ts";
import { HttpError, date, id, int, json, num, oneOf, readJson, str } from "./http.ts";
import { buildDayInput, closeStaleSessions, getProfile, listGyms, putProfile, upsertPain, weekState } from "./db.ts";

type Handler = (req: Request, env: Env, p: Record<string, string>) => Promise<Response>;
const routes: [string, RegExp, Handler][] = [];
const on = (method: string, path: string, h: Handler) =>
  routes.push([method, new RegExp("^" + path.replace(/:(\w+)/g, "(?<$1>[^/]+)") + "$"), h]);

const MODES = ["normal", "compensatorio", "expresso"] as const;
const TIERS = ["haiku", "sonnet", "opus"] as const;
const MEDIA_MIME: Record<string, "foto" | "video"> = { "image/jpeg": "foto", "image/png": "foto", "image/webp": "foto", "video/mp4": "video", "video/webm": "video", "video/quicktime": "video" };
const MAX_MEDIA = 20 * 1024 * 1024;
const MAX_AUDIO = 4 * 1024 * 1024;

on("GET", "/api/state", async (req, env) => {
  const url = new URL(req.url);
  const today = date(url.searchParams.get("date"));
  await closeStaleSessions(env);
  const [profile, gyms, week, dayPlan, hist, media, meas] = await Promise.all([
    getProfile(env), listGyms(env), weekState(env, today),
    env.DB.prepare("SELECT plan, source, gym_id FROM day_plan WHERE date = ?1").bind(today).first<{ plan: string; source: string; gym_id: string }>(),
    // última sessão de cada exercício (para a dupla progressão sugerir a carga)
    env.DB.prepare(`SELECT l.exercise_id, l.kg, l.reps FROM set_log l
      WHERE l.session_id = (SELECT s2.session_id FROM set_log s2 WHERE s2.exercise_id = l.exercise_id ORDER BY s2.created_at DESC LIMIT 1)
      ORDER BY l.exercise_id, l.set_no LIMIT 400`).all<{ exercise_id: string; kg: number; reps: number }>(),
    env.DB.prepare("SELECT id, kind, exercise_id, equipment_id, note FROM media ORDER BY created_at DESC LIMIT 200").all(),
    env.DB.prepare("SELECT date, arm_cm AS braco, waist_cm AS cintura FROM measurement ORDER BY date DESC LIMIT 12").all(),
  ]);
  const history: Record<string, { kg: number; reps: number }[]> = {};
  for (const r of hist.results) (history[r.exercise_id] ??= []).push({ kg: r.kg, reps: r.reps });
  return json({
    profile, gyms, week, history, media: media.results, measures: meas.results.reverse(),
    features: { ai: !!env.AI, media: !!env.MEDIA },
    dayPlan: dayPlan ? { ...dayPlan, plan: JSON.parse(dayPlan.plan) } : null, version: env.APP_VERSION,
  });
});

on("PUT", "/api/measurements/:date", async (req, env, p) => {
  const b = await readJson<Record<string, unknown>>(req);
  await env.DB.prepare("INSERT INTO measurement (date, arm_cm, waist_cm, shoulder_cm, updated_at) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(date) DO UPDATE SET arm_cm=?2, waist_cm=?3, shoulder_cm=?4, updated_at=?5")
    .bind(date(p.date), num(b.armCm, "armCm", 15, 70, false), num(b.waistCm, "waistCm", 40, 200, false), num(b.shoulderCm, "shoulderCm", 60, 200, false), Date.now()).run();
  return json({ ok: true });
});

on("PUT", "/api/profile", async (req, env) => {
  const b = await readJson<{ data: Record<string, unknown> }>(req, 32 * 1024);
  const pr = b.data?.priorities;
  if (!Array.isArray(pr) || pr.length > 3 || !pr.every((m) => MUSCLE_IDS.includes(m as MuscleId))) throw new HttpError(400, "priorities: até 3 músculos válidos");
  await putProfile(env, b.data);
  return json({ ok: true });
});

on("PUT", "/api/gyms/:id", async (req, env, p) => {
  const b = await readJson<{ name: string; equipment: string[]; busyHours?: string[] }>(req);
  const gid = str(p.id, "id", 40)!;
  if (!/^[a-z0-9_-]+$/.test(gid)) throw new HttpError(400, "id inválido");
  if (!Array.isArray(b.equipment) || b.equipment.length > 80 || !b.equipment.every((e) => typeof e === "string" && e.length < 40)) throw new HttpError(400, "equipment inválido");
  await env.DB.prepare("INSERT INTO gym (id, name, equipment, busy_hours, created_at) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(id) DO UPDATE SET name = ?2, equipment = ?3, busy_hours = ?4")
    .bind(gid, str(b.name, "name", 60), JSON.stringify(b.equipment), JSON.stringify(b.busyHours ?? []), Date.now()).run();
  return json({ ok: true });
});

on("PUT", "/api/checkin/:date", async (req, env, p) => {
  const b = await readJson<Record<string, unknown>>(req);
  await env.DB.prepare(`INSERT INTO checkin (date, sleep_h, energy, soreness, stress, food, weight_kg, note, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
    ON CONFLICT(date) DO UPDATE SET sleep_h=?2, energy=?3, soreness=?4, stress=?5, food=?6, weight_kg=?7, note=?8, updated_at=?9`)
    .bind(date(p.date), int(b.sleepH, "sleepH", 5, 9), int(b.energy, "energy", 1, 3), int(b.soreness, "soreness", 0, 2),
      int(b.stress, "stress", 1, 3), int(b.food, "food", -1, 1), num(b.weightKg, "weightKg", 30, 250, false), str(b.note, "note", 500, false), Date.now()).run();
  return json({ ok: true });
});

on("PUT", "/api/attendance/:date", async (req, env, p) => {
  const b = await readJson<Record<string, unknown>>(req);
  await env.DB.prepare("INSERT INTO attendance (date, status, reason, source, updated_at) VALUES (?1, ?2, ?3, 'app', ?4) ON CONFLICT(date) DO UPDATE SET status=?2, reason=?3, source='app', updated_at=?4")
    .bind(date(p.date), oneOf(b.status, "status", ["fui", "nao_fui", "folga"] as const), str(b.reason, "reason", 200, false), Date.now()).run();
  return json({ ok: true });
});

// Gera (não salva) o treino do dia com o core — o mesmo cálculo que o app faz localmente.
on("POST", "/api/plan-day", async (req, env) => {
  const b = await readJson<Record<string, unknown>>(req);
  const { input, gymId } = await buildDayInput(env, {
    date: date(b.date), daysLeft: int(b.daysLeft, "daysLeft", 1, 7)!, minutes: int(b.minutes, "minutes", 15, 150, false) ?? undefined,
    mode: b.mode ? oneOf(b.mode, "mode", MODES) as Mode : "normal", gymId: str(b.gymId, "gymId", 40, false) ?? undefined,
    focus: Array.isArray(b.focus) ? (b.focus.filter((m) => MUSCLE_IDS.includes(m as MuscleId)) as MuscleId[]) : undefined, crowded: !!b.crowded,
  });
  return json({ gymId, input, plan: planDay(input) });
});

on("PUT", "/api/day-plan/:date", async (req, env, p) => {
  const b = await readJson<{ plan: DayPlan; gymId?: string; source?: string }>(req, 48 * 1024);
  if (!b.plan || !Array.isArray(b.plan.items) || b.plan.items.length > 20) throw new HttpError(400, "plan inválido");
  await env.DB.prepare("INSERT INTO day_plan (date, gym_id, plan, source, created_at) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(date) DO UPDATE SET gym_id=?2, plan=?3, source=?4, created_at=?5")
    .bind(date(p.date), str(b.gymId, "gymId", 40, false), JSON.stringify(b.plan), oneOf(b.source ?? "core", "source", ["core", "claude", "manual"] as const), Date.now()).run();
  return json({ ok: true });
});

// Edição manual: aplica no plano salvo do dia e registra para revisão do Claude.
on("POST", "/api/plan-edits", async (req, env) => {
  const b = await readJson<{ date: string; edit: ManualEdit; daysLeft?: number }>(req);
  const d = date(b.date);
  const row = await env.DB.prepare("SELECT plan, gym_id FROM day_plan WHERE date = ?1").bind(d).first<{ plan: string; gym_id: string }>();
  if (!row) throw new HttpError(404, "sem treino salvo para o dia");
  const { input } = await buildDayInput(env, { date: d, daysLeft: b.daysLeft ?? 1, gymId: row.gym_id });
  const r = applyManualEdit(JSON.parse(row.plan), b.edit, input);
  if (r.issues.some((i) => i.severity === "erro")) return json({ ok: false, issues: r.issues }, 422);
  await env.DB.batch([
    env.DB.prepare("UPDATE day_plan SET plan = ?2, source = 'manual' WHERE date = ?1").bind(d, JSON.stringify(r.plan)),
    env.DB.prepare("INSERT INTO plan_edit (id, date, edit, issues, created_at) VALUES (?1, ?2, ?3, ?4, ?5)").bind(id(), d, JSON.stringify(b.edit), JSON.stringify(r.issues), Date.now()),
  ]);
  return json({ ok: true, plan: r.plan, issues: r.issues });
});

// Iniciou = foi. A presença é gravada no "Começar".
on("POST", "/api/sessions", async (req, env) => {
  const b = await readJson<{ id?: string; date: string; gymId?: string; plan: DayPlan; startedAt?: number }>(req, 48 * 1024);
  // id gerado no aparelho permite registrar séries offline antes de a sessão chegar ao servidor
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const d = date(b.date), sid = b.id && UUID.test(b.id) ? b.id : id(), now = Date.now();
  const startedAt = b.startedAt && Math.abs(now - b.startedAt) < 6 * 3600e3 ? b.startedAt : now; // aceita início offline recente
  await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO session (id, date, gym_id, plan, started_at) VALUES (?1, ?2, ?3, ?4, ?5)").bind(sid, d, str(b.gymId, "gymId", 40, false), JSON.stringify(b.plan), startedAt),
    env.DB.prepare("INSERT INTO attendance (date, status, source, updated_at) VALUES (?1, 'fui', 'inicio', ?2) ON CONFLICT(date) DO UPDATE SET status='fui', source='inicio', updated_at=?2").bind(d, now),
  ]);
  return json({ id: sid, startedAt }, 201);
});

on("POST", "/api/sessions/:id/sets", async (req, env, p) => {
  const b = await readJson<Record<string, unknown>>(req);
  const ex = str(b.exerciseId, "exerciseId", 80)!;
  const muscle = EXERCISE_BY_ID[ex]?.m ?? oneOf(b.muscle, "muscle", MUSCLE_IDS);
  await env.DB.prepare(`INSERT INTO set_log (session_id, exercise_id, muscle, set_no, kg, reps, rir, created_at)
    SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8 WHERE EXISTS (SELECT 1 FROM session WHERE id = ?1 AND (finished_at IS NULL OR closed_by = 'auto'))
    ON CONFLICT(session_id, exercise_id, set_no) DO UPDATE SET kg=?5, reps=?6, rir=?7`)
    .bind(p.id, ex, muscle, int(b.setNo, "setNo", 1, 12), num(b.kg, "kg", 0, 600, false), int(b.reps, "reps", 0, 100), int(b.rir, "rir", 0, 6, false), Date.now()).run();
  return json({ ok: true });
});

on("POST", "/api/sessions/:id/skip", async (req, env, p) => {
  const b = await readJson<Record<string, unknown>>(req);
  await env.DB.prepare("INSERT OR REPLACE INTO exercise_skip (session_id, exercise_id, reason, created_at) VALUES (?1, ?2, ?3, ?4)")
    .bind(p.id, str(b.exerciseId, "exerciseId", 80), oneOf(b.reason, "reason", ["ocupado", "dor", "sem_tempo", "nao_quis", "outro"] as const), Date.now()).run();
  return json({ ok: true });
});

on("POST", "/api/sessions/:id/finish", async (req, env, p) => {
  const b = await readJson<{ feedback: unknown }>(req, 16 * 1024);
  await env.DB.prepare("UPDATE session SET finished_at = ?2, closed_by = 'usuario', feedback = ?3 WHERE id = ?1 AND finished_at IS NULL")
    .bind(p.id, Date.now(), JSON.stringify(b.feedback ?? {})).run();
  return json({ ok: true });
});

on("POST", "/api/pains", async (req, env) => {
  const b = await readJson<Record<string, unknown>>(req);
  return json(await upsertPain(env, b), 201);
});
on("POST", "/api/pains/:id/resolve", async (_req, env, p) => {
  await env.DB.prepare("UPDATE pain SET resolved_at = ?2 WHERE id = ?1").bind(p.id, Date.now()).run();
  return json({ ok: true });
});

on("POST", "/api/inbox", async (req, env) => {
  const b = await readJson<Record<string, unknown>>(req);
  const text = str(b.text, "text", 2000)!;
  const auto = classify(text);
  const preset = PROMPTS.find((x) => x.id === b.promptId);
  const tier = (b.tier ? oneOf(b.tier, "tier", TIERS) : preset?.tier ?? auto.tier) as Tier;
  const iid = id();
  await env.DB.prepare("INSERT INTO inbox (id, created_at, text, action, tier) VALUES (?1, ?2, ?3, ?4, ?5)")
    .bind(iid, Date.now(), text, preset?.action ?? auto.action, tier).run();
  return json({ id: iid, tier, action: preset?.action ?? auto.action }, 201);
});
on("POST", "/api/inbox/:id/status", async (req, env, p) => {
  const b = await readJson<Record<string, unknown>>(req);
  await env.DB.prepare("UPDATE inbox SET status = ?2 WHERE id = ?1").bind(p.id, oneOf(b.status, "status", ["aplicado", "descartado"] as const)).run();
  return json({ ok: true });
});

on("POST", "/api/food", async (req, env) => {
  const b = await readJson<Record<string, unknown>>(req);
  const fid = id(), text = str(b.text, "text", 2000)!;
  await env.DB.batch([
    env.DB.prepare("INSERT INTO food_log (id, date, raw_text, created_at) VALUES (?1, ?2, ?3, ?4)").bind(fid, date(b.date), text, Date.now()),
    env.DB.prepare("INSERT INTO inbox (id, created_at, text, action, tier) VALUES (?1, ?2, ?3, 'registrar_comida', 'haiku')").bind(id(), Date.now(), `[comida ${b.date}] ${text}`),
  ]);
  return json({ id: fid }, 201);
});

// Transcrição (Workers AI Whisper). Sem binding AI → 501 e o app usa o reconhecimento de voz do navegador.
on("POST", "/api/transcribe", async (req, env) => {
  if (!env.AI) throw new HttpError(501, "transcrição no servidor desativada");
  const len = Number(req.headers.get("Content-Length") ?? "0");
  if (!len || len > MAX_AUDIO) throw new HttpError(413, "áudio de até ~2 min");
  const buf = new Uint8Array(await req.arrayBuffer());
  if (buf.byteLength > MAX_AUDIO) throw new HttpError(413, "áudio grande demais");
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  const out = (await env.AI.run("@cf/openai/whisper-large-v3-turbo", { audio: btoa(bin), language: "pt", task: "transcribe" })) as { text?: string };
  return json({ text: (out.text ?? "").trim() });
});

// Mídia do SEU aparelho → R2 privado. Upload passa pelo Worker (simples, valida tipo e tamanho).
export async function uploadMedia(req: Request, env: Env): Promise<Response> {
  if (!env.MEDIA) throw new HttpError(501, "R2 não configurado");
  const url = new URL(req.url);
  const mime = (req.headers.get("Content-Type") ?? "").split(";")[0];
  const kind = MEDIA_MIME[mime];
  if (!kind) throw new HttpError(415, "use jpeg/png/webp/mp4/webm/mov");
  const len = Number(req.headers.get("Content-Length") ?? "0");
  if (!len || len > MAX_MEDIA) throw new HttpError(413, "até 20 MB (vídeo de 10–15 s)");
  const mid = id(), key = `media/${new Date().toISOString().slice(0, 7)}/${mid}`;
  const obj = await env.MEDIA.put(key, req.body, { httpMetadata: { contentType: mime } });
  if (!obj || obj.size > MAX_MEDIA) { if (obj) await env.MEDIA.delete(key); throw new HttpError(413, "arquivo grande demais"); }
  const q = (k: string, max = 80) => str(url.searchParams.get(k), k, max, false);
  await env.DB.prepare("INSERT INTO media (id, kind, r2_key, mime, bytes, equipment_id, exercise_id, gym_id, note, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)")
    .bind(mid, kind, key, mime, obj.size, q("equipmentId"), q("exerciseId"), q("gymId", 40), q("note", 300), Date.now()).run();
  return json({ id: mid, kind }, 201);
}
on("POST", "/api/media", uploadMedia);
on("GET", "/api/media", async (req, env) => {
  const url = new URL(req.url);
  const ex = url.searchParams.get("exerciseId");
  const { results } = await env.DB.prepare("SELECT id, kind, equipment_id, exercise_id, gym_id, note, setup, created_at FROM media WHERE (?1 IS NULL OR exercise_id = ?1) ORDER BY created_at DESC LIMIT 100").bind(ex).all();
  return json({ media: results });
});
on("GET", "/api/media/:id", async (_req, env, p) => {
  if (!env.MEDIA) throw new HttpError(501, "R2 não configurado");
  const row = await env.DB.prepare("SELECT r2_key, mime FROM media WHERE id = ?1").bind(p.id).first<{ r2_key: string; mime: string }>();
  const obj = row && (await env.MEDIA.get(row.r2_key));
  if (!obj) throw new HttpError(404, "não encontrado");
  return new Response(obj.body, { headers: { "Content-Type": row!.mime, "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" } });
});

export async function handleApi(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  for (const [method, re, h] of routes) {
    if (method !== req.method) continue;
    const m = url.pathname.match(re);
    if (m) {
      try { return await h(req, env, (m.groups ?? {}) as Record<string, string>); }
      catch (e) {
        if (e instanceof HttpError) return json({ error: e.message }, e.status);
        console.error("api", url.pathname, e instanceof Error ? e.message : "erro");
        return json({ error: "erro interno" }, 500);
      }
    }
  }
  return json({ error: "rota não encontrada" }, 404);
}
