// API JSON do app (atrás do Cloudflare Access). Rotas pequenas, um estado agregado por chamada (/api/state)
// para o celular fazer 1 requisição ao abrir. Toda rota recebe o usuário autenticado (u) e filtra por u.id.
import { EXERCISE_BY_ID, MUSCLE_IDS, PROMPTS, applyManualEdit, classify, planDay } from "@ciclo/core";
import type { DayPlan, ManualEdit, Mode, MuscleId, Tier } from "@ciclo/core";
import type { AuthUser, Env } from "./env.ts";
import { HttpError, date, id, int, json, num, oneOf, readJson, str } from "./http.ts";
import { EMPTY_MSG, buildDayInput, closeStaleSessions, deleteAccount, exportAccount, getProfile, hitRateLimit, listGyms, mediaPrefix, putProfile, upsertPain, weekState } from "./db.ts";
import { newMcpToken } from "./auth.ts";
import { dayAction, getWeek, regenerate, restore } from "./semana.ts";

type Handler = (req: Request, env: Env, p: Record<string, string>, u: AuthUser) => Promise<Response>;
const routes: { method: string; path: string; re: RegExp; h: Handler }[] = [];
const on = (method: string, path: string, h: Handler) =>
  routes.push({ method, path, re: new RegExp("^" + path.replace(/:(\w+)/g, "(?<$1>[^/]+)") + "$"), h });

const MODES = ["normal", "compensatorio", "expresso"] as const;
const TIERS = ["haiku", "sonnet", "opus"] as const;
const MEDIA_MIME: Record<string, "foto" | "video"> = { "image/jpeg": "foto", "image/png": "foto", "image/webp": "foto", "video/mp4": "video", "video/webm": "video", "video/quicktime": "video" };
const MAX_MEDIA = 20 * 1024 * 1024;
const MAX_AUDIO = 4 * 1024 * 1024;
const MAX_TOKENS = 10;

const account = (u: AuthUser) => ({ email: u.email, createdAt: u.createdAt, onboardingDoneAt: u.onboardingDoneAt });
const onboarding = (u: AuthUser) => (u.onboardingDoneAt ? "concluido" : "pendente");

on("GET", "/api/state", async (req, env, _p, u) => {
  const url = new URL(req.url);
  const today = date(url.searchParams.get("date"));
  await closeStaleSessions(env, u.id);
  const [profile, gyms, week, dayPlan, hist, media, meas] = await Promise.all([
    getProfile(env, u.id), listGyms(env, u.id), weekState(env, u.id, today),
    env.DB.prepare("SELECT plan, source, gym_id FROM day_plan WHERE user_id = ?2 AND date = ?1").bind(today, u.id).first<{ plan: string; source: string; gym_id: string }>(),
    // última sessão de cada exercício (para a dupla progressão sugerir a carga)
    env.DB.prepare(`SELECT l.exercise_id, l.kg, l.reps FROM set_log l
      WHERE l.user_id = ?1 AND l.session_id = (SELECT s2.session_id FROM set_log s2 WHERE s2.user_id = ?1 AND s2.exercise_id = l.exercise_id ORDER BY s2.created_at DESC LIMIT 1)
      ORDER BY l.exercise_id, l.set_no LIMIT 400`).bind(u.id).all<{ exercise_id: string; kg: number; reps: number }>(),
    env.DB.prepare("SELECT id, kind, exercise_id, equipment_id, note FROM media WHERE user_id = ?1 ORDER BY created_at DESC LIMIT 200").bind(u.id).all(),
    env.DB.prepare("SELECT date, arm_cm AS braco, waist_cm AS cintura FROM measurement WHERE user_id = ?1 ORDER BY date DESC LIMIT 12").bind(u.id).all(),
  ]);
  const history: Record<string, { kg: number; reps: number }[]> = {};
  for (const r of hist.results) (history[r.exercise_id] ??= []).push({ kg: r.kg, reps: r.reps });
  return json({
    account: account(u), onboarding: onboarding(u),
    profile: profile ?? {}, gyms, week, history, media: media.results, measures: meas.results.reverse(),
    features: { ai: !!env.AI, media: !!env.MEDIA },
    dayPlan: dayPlan ? { ...dayPlan, plan: JSON.parse(dayPlan.plan) } : null, version: env.APP_VERSION,
  });
});

// ---- conta (LGPD + token do Claude) ----
on("GET", "/api/account", async (_req, _env, _p, u) => json({ account: account(u), onboarding: onboarding(u) }));

on("PATCH", "/api/account", async (req, env, _p, u) => {
  const b = await readJson<Record<string, unknown>>(req, 4 * 1024);
  const st = oneOf(b.onboarding, "onboarding", ["pendente", "concluido"] as const);
  const at = st === "concluido" ? u.onboardingDoneAt ?? Date.now() : null;
  await env.DB.prepare("UPDATE user SET onboarding_done_at = ?2 WHERE id = ?1").bind(u.id, at).run();
  return json({ ok: true, account: { ...account(u), onboardingDoneAt: at }, onboarding: st });
});

on("GET", "/api/account/export", async (_req, env, _p, u) =>
  json(await exportAccount(env, u.id), 200, { "Content-Disposition": `attachment; filename="ciclo-export-${new Date().toISOString().slice(0, 10)}.json"` }));

on("DELETE", "/api/account", async (req, env, _p, u) => {
  const b = await readJson<Record<string, unknown>>(req, 1024);
  if (b.confirm !== "APAGAR") throw new HttpError(400, 'confirme com {"confirm":"APAGAR"}');
  await deleteAccount(env, u.id);
  return json({ ok: true });
});

on("GET", "/api/account/tokens", async (_req, env, _p, u) => {
  const { results } = await env.DB.prepare("SELECT id, label, created_at AS createdAt, last_used_at AS lastUsedAt, revoked_at AS revokedAt FROM mcp_token WHERE user_id = ?1 ORDER BY created_at DESC").bind(u.id).all();
  return json({ tokens: results });
});

on("POST", "/api/account/tokens", async (req, env, _p, u) => {
  const b = await readJson<Record<string, unknown>>(req, 2 * 1024);
  const label = str(b.label, "label", 60, false) ?? "Claude";
  const active = await env.DB.prepare("SELECT COUNT(*) AS n FROM mcp_token WHERE user_id = ?1 AND revoked_at IS NULL").bind(u.id).first<{ n: number }>();
  if ((active?.n ?? 0) >= MAX_TOKENS) throw new HttpError(409, `máximo de ${MAX_TOKENS} tokens ativos; revogue um`);
  const t = await newMcpToken(), now = Date.now();
  await env.DB.prepare("INSERT INTO mcp_token (id, user_id, hash, label, created_at) VALUES (?1, ?2, ?3, ?4, ?5)").bind(t.id, u.id, t.hash, label, now).run();
  return json({ id: t.id, label, createdAt: now, token: t.token, aviso: "copie agora: o token não aparece de novo" }, 201);
});

on("DELETE", "/api/account/tokens/:id", async (_req, env, p, u) => {
  const r = await env.DB.prepare("UPDATE mcp_token SET revoked_at = ?3 WHERE id = ?1 AND user_id = ?2 AND revoked_at IS NULL").bind(p.id, u.id, Date.now()).run();
  if (!r.meta.changes) throw new HttpError(404, "token não encontrado");
  return json({ ok: true });
});

// ---- dados ----
on("PUT", "/api/measurements/:date", async (req, env, p, u) => {
  const b = await readJson<Record<string, unknown>>(req);
  await env.DB.prepare("INSERT INTO measurement (user_id, date, arm_cm, waist_cm, shoulder_cm, updated_at) VALUES (?6, ?1, ?2, ?3, ?4, ?5) ON CONFLICT(user_id, date) DO UPDATE SET arm_cm=?2, waist_cm=?3, shoulder_cm=?4, updated_at=?5")
    .bind(date(p.date), num(b.armCm, "armCm", 15, 70, false), num(b.waistCm, "waistCm", 40, 200, false), num(b.shoulderCm, "shoulderCm", 60, 200, false), Date.now(), u.id).run();
  return json({ ok: true });
});

on("PUT", "/api/profile", async (req, env, _p, u) => {
  const b = await readJson<{ data: Record<string, unknown> }>(req, 32 * 1024);
  if (!b.data || typeof b.data !== "object" || Array.isArray(b.data)) throw new HttpError(400, "data inválido");
  const pr = b.data.priorities;
  if (!Array.isArray(pr) || pr.length > 3 || !pr.every((m) => MUSCLE_IDS.includes(m as MuscleId))) throw new HttpError(400, "priorities: até 3 músculos válidos");
  await putProfile(env, u.id, b.data);
  return json({ ok: true });
});

on("PUT", "/api/gyms/:id", async (req, env, p, u) => {
  const b = await readJson<{ name: string; equipment: string[]; busyHours?: string[]; sort?: number }>(req);
  const gid = str(p.id, "id", 40)!;
  if (!/^[a-z0-9_-]+$/.test(gid)) throw new HttpError(400, "id inválido");
  if (!Array.isArray(b.equipment) || b.equipment.length > 80 || !b.equipment.every((e) => typeof e === "string" && e.length < 40)) throw new HttpError(400, "equipment inválido");
  const busy = b.busyHours ?? [];
  if (!Array.isArray(busy) || busy.length > 24 || !busy.every((h) => typeof h === "string" && h.length < 12)) throw new HttpError(400, "busyHours inválido");
  const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM gym WHERE user_id = ?1").bind(u.id).first<{ n: number }>();
  if ((count?.n ?? 0) >= 20) {
    const exists = await env.DB.prepare("SELECT 1 AS x FROM gym WHERE user_id = ?1 AND id = ?2").bind(u.id, gid).first();
    if (!exists) throw new HttpError(409, "até 20 academias");
  }
  await env.DB.prepare("INSERT INTO gym (user_id, id, name, equipment, busy_hours, sort, created_at) VALUES (?6, ?1, ?2, ?3, ?4, ?7, ?5) ON CONFLICT(user_id, id) DO UPDATE SET name = ?2, equipment = ?3, busy_hours = ?4, sort = ?7")
    .bind(gid, str(b.name, "name", 60), JSON.stringify(b.equipment), JSON.stringify(busy), Date.now(), u.id, int(b.sort, "sort", 0, 99, false) ?? (count?.n ?? 0)).run();
  return json({ ok: true });
});

on("PUT", "/api/checkin/:date", async (req, env, p, u) => {
  const b = await readJson<Record<string, unknown>>(req);
  await env.DB.prepare(`INSERT INTO checkin (user_id, date, sleep_h, energy, soreness, stress, food, weight_kg, note, updated_at)
    VALUES (?10, ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
    ON CONFLICT(user_id, date) DO UPDATE SET sleep_h=?2, energy=?3, soreness=?4, stress=?5, food=?6, weight_kg=?7, note=?8, updated_at=?9`)
    .bind(date(p.date), int(b.sleepH, "sleepH", 5, 9), int(b.energy, "energy", 1, 3), int(b.soreness, "soreness", 0, 2),
      int(b.stress, "stress", 1, 3), int(b.food, "food", -1, 1), num(b.weightKg, "weightKg", 30, 250, false), str(b.note, "note", 500, false), Date.now(), u.id).run();
  return json({ ok: true });
});

on("PUT", "/api/attendance/:date", async (req, env, p, u) => {
  const b = await readJson<Record<string, unknown>>(req);
  await env.DB.prepare("INSERT INTO attendance (user_id, date, status, reason, source, updated_at) VALUES (?5, ?1, ?2, ?3, 'app', ?4) ON CONFLICT(user_id, date) DO UPDATE SET status=?2, reason=?3, source='app', updated_at=?4")
    .bind(date(p.date), oneOf(b.status, "status", ["fui", "nao_fui", "folga"] as const), str(b.reason, "reason", 200, false), Date.now(), u.id).run();
  return json({ ok: true });
});

// Gera (não salva) o treino do dia com o core — o mesmo cálculo que o app faz localmente.
// Conta sem perfil/academia → { plan: null, empty: "sem_perfil" | "sem_academia", message }.
on("POST", "/api/plan-day", async (req, env, _p, u) => {
  const b = await readJson<Record<string, unknown>>(req);
  const r = await buildDayInput(env, u.id, {
    date: date(b.date), daysLeft: int(b.daysLeft, "daysLeft", 1, 7)!, minutes: int(b.minutes, "minutes", 15, 150, false) ?? undefined,
    mode: b.mode ? oneOf(b.mode, "mode", MODES) as Mode : "normal", gymId: str(b.gymId, "gymId", 40, false) ?? undefined,
    focus: Array.isArray(b.focus) ? (b.focus.filter((m) => MUSCLE_IDS.includes(m as MuscleId)) as MuscleId[]) : undefined, crowded: !!b.crowded,
  });
  if (r.empty) return json({ gymId: null, input: null, plan: null, empty: r.empty, message: EMPTY_MSG[r.empty] });
  return json({ gymId: r.gymId, input: r.input, plan: planDay(r.input) });
});

on("PUT", "/api/day-plan/:date", async (req, env, p, u) => {
  const b = await readJson<{ plan: DayPlan; gymId?: string; source?: string }>(req, 48 * 1024);
  if (!b.plan || !Array.isArray(b.plan.items) || b.plan.items.length > 20) throw new HttpError(400, "plan inválido");
  await env.DB.prepare("INSERT INTO day_plan (user_id, date, gym_id, plan, source, created_at) VALUES (?6, ?1, ?2, ?3, ?4, ?5) ON CONFLICT(user_id, date) DO UPDATE SET gym_id=?2, plan=?3, source=?4, created_at=?5")
    .bind(date(p.date), str(b.gymId, "gymId", 40, false), JSON.stringify(b.plan), oneOf(b.source ?? "core", "source", ["core", "claude", "manual"] as const), Date.now(), u.id).run();
  return json({ ok: true });
});

// Edição manual: aplica no plano salvo do dia e registra para revisão do Claude.
on("POST", "/api/plan-edits", async (req, env, _p, u) => {
  const b = await readJson<{ date: string; edit: ManualEdit; daysLeft?: number }>(req);
  const d = date(b.date);
  const row = await env.DB.prepare("SELECT plan, gym_id FROM day_plan WHERE user_id = ?2 AND date = ?1").bind(d, u.id).first<{ plan: string; gym_id: string }>();
  if (!row) throw new HttpError(404, "sem treino salvo para o dia");
  const bi = await buildDayInput(env, u.id, { date: d, daysLeft: int(b.daysLeft, "daysLeft", 1, 7, false) ?? 1, gymId: row.gym_id ?? undefined });
  if (bi.empty) throw new HttpError(409, EMPTY_MSG[bi.empty]);
  const r = applyManualEdit(JSON.parse(row.plan), b.edit, bi.input);
  if (r.issues.some((i) => i.severity === "erro")) return json({ ok: false, issues: r.issues }, 422);
  await env.DB.batch([
    env.DB.prepare("UPDATE day_plan SET plan = ?2, source = 'manual' WHERE user_id = ?3 AND date = ?1").bind(d, JSON.stringify(r.plan), u.id),
    env.DB.prepare("INSERT INTO plan_edit (user_id, id, date, edit, issues, created_at) VALUES (?6, ?1, ?2, ?3, ?4, ?5)").bind(id(), d, JSON.stringify(b.edit), JSON.stringify(r.issues), Date.now(), u.id),
  ]);
  return json({ ok: true, plan: r.plan, issues: r.issues });
});

// ---- semana completa planejada (#24) ----
on("GET", "/api/week", async (req, env, _p, u) => json(await getWeek(env, u.id, date(new URL(req.url).searchParams.get("date")))));
on("PUT", "/api/week", async (req, env, _p, u) => json(await restore(env, u.id, await readJson(req, 2 * 1024))));
on("POST", "/api/week/regenerate", async (req, env, _p, u) => json(await regenerate(env, u.id, await readJson(req, 2 * 1024))));
on("POST", "/api/week/day/:date", async (req, env, p, u) => json(await dayAction(env, u.id, p.date, await readJson(req, 4 * 1024))));

// Iniciou = foi. A presença é gravada no "Começar".
on("POST", "/api/sessions", async (req, env, _p, u) => {
  const b = await readJson<{ id?: string; date: string; gymId?: string; plan: DayPlan; startedAt?: number }>(req, 48 * 1024);
  // id gerado no aparelho permite registrar séries offline antes de a sessão chegar ao servidor (chave = user_id + id)
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const d = date(b.date), sid = b.id && UUID.test(b.id) ? b.id.toLowerCase() : id(), now = Date.now();
  const startedAt = typeof b.startedAt === "number" && Math.abs(now - b.startedAt) < 6 * 3600e3 ? b.startedAt : now; // aceita início offline recente
  await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO session (user_id, id, date, gym_id, plan, started_at) VALUES (?6, ?1, ?2, ?3, ?4, ?5)").bind(sid, d, str(b.gymId, "gymId", 40, false), JSON.stringify(b.plan ?? {}), startedAt, u.id),
    env.DB.prepare("INSERT INTO attendance (user_id, date, status, source, updated_at) VALUES (?3, ?1, 'fui', 'inicio', ?2) ON CONFLICT(user_id, date) DO UPDATE SET status='fui', source='inicio', updated_at=?2").bind(d, now, u.id),
  ]);
  return json({ id: sid, startedAt }, 201);
});

on("POST", "/api/sessions/:id/sets", async (req, env, p, u) => {
  const b = await readJson<Record<string, unknown>>(req);
  const ex = str(b.exerciseId, "exerciseId", 80)!;
  const muscle = EXERCISE_BY_ID[ex]?.m ?? oneOf(b.muscle, "muscle", MUSCLE_IDS);
  const r = await env.DB.prepare(`INSERT INTO set_log (user_id, session_id, exercise_id, muscle, set_no, kg, reps, rir, created_at)
    SELECT ?9, ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8 WHERE EXISTS (SELECT 1 FROM session WHERE user_id = ?9 AND id = ?1 AND (finished_at IS NULL OR closed_by = 'auto'))
    ON CONFLICT(user_id, session_id, exercise_id, set_no) DO UPDATE SET kg=?5, reps=?6, rir=?7`)
    .bind(p.id, ex, muscle, int(b.setNo, "setNo", 1, 12), num(b.kg, "kg", 0, 600, false), int(b.reps, "reps", 0, 100), int(b.rir, "rir", 0, 6, false), Date.now(), u.id).run();
  return json({ ok: true, saved: r.meta.changes > 0 });
});

on("POST", "/api/sessions/:id/skip", async (req, env, p, u) => {
  const b = await readJson<Record<string, unknown>>(req);
  const r = await env.DB.prepare(`INSERT INTO exercise_skip (user_id, session_id, exercise_id, reason, created_at)
    SELECT ?5, ?1, ?2, ?3, ?4 WHERE EXISTS (SELECT 1 FROM session WHERE user_id = ?5 AND id = ?1)
    ON CONFLICT(user_id, session_id, exercise_id) DO UPDATE SET reason = ?3, created_at = ?4`)
    .bind(p.id, str(b.exerciseId, "exerciseId", 80), oneOf(b.reason, "reason", ["ocupado", "dor", "sem_tempo", "nao_quis", "outro"] as const), Date.now(), u.id).run();
  return json({ ok: true, saved: r.meta.changes > 0 });
});

on("POST", "/api/sessions/:id/finish", async (req, env, p, u) => {
  const b = await readJson<{ feedback: unknown }>(req, 16 * 1024);
  await env.DB.prepare("UPDATE session SET finished_at = ?2, closed_by = 'usuario', feedback = ?3 WHERE user_id = ?4 AND id = ?1 AND finished_at IS NULL")
    .bind(p.id, Date.now(), JSON.stringify(b.feedback ?? {}), u.id).run();
  return json({ ok: true });
});

on("POST", "/api/pains", async (req, env, _p, u) => {
  const b = await readJson<Record<string, unknown>>(req);
  return json(await upsertPain(env, u.id, b), 201);
});
on("POST", "/api/pains/:id/resolve", async (_req, env, p, u) => {
  const r = await env.DB.prepare("UPDATE pain SET resolved_at = ?2 WHERE id = ?1 AND user_id = ?3").bind(p.id, Date.now(), u.id).run();
  if (!r.meta.changes) throw new HttpError(404, "dor não encontrada");
  return json({ ok: true });
});

on("POST", "/api/inbox", async (req, env, _p, u) => {
  const b = await readJson<Record<string, unknown>>(req);
  const text = str(b.text, "text", 2000)!;
  const auto = classify(text);
  const preset = PROMPTS.find((x) => x.id === b.promptId);
  const tier = (b.tier ? oneOf(b.tier, "tier", TIERS) : preset?.tier ?? auto.tier) as Tier;
  const iid = id();
  await env.DB.prepare("INSERT INTO inbox (user_id, id, created_at, text, action, tier) VALUES (?6, ?1, ?2, ?3, ?4, ?5)")
    .bind(iid, Date.now(), text, preset?.action ?? auto.action, tier, u.id).run();
  return json({ id: iid, tier, action: preset?.action ?? auto.action }, 201);
});
on("POST", "/api/inbox/:id/status", async (req, env, p, u) => {
  const b = await readJson<Record<string, unknown>>(req);
  const r = await env.DB.prepare("UPDATE inbox SET status = ?2 WHERE id = ?1 AND user_id = ?3").bind(p.id, oneOf(b.status, "status", ["aplicado", "descartado"] as const), u.id).run();
  if (!r.meta.changes) throw new HttpError(404, "pedido não encontrado");
  return json({ ok: true });
});

on("POST", "/api/food", async (req, env, _p, u) => {
  const b = await readJson<Record<string, unknown>>(req);
  const fid = id(), text = str(b.text, "text", 2000)!, d = date(b.date);
  await env.DB.batch([
    env.DB.prepare("INSERT INTO food_log (user_id, id, date, raw_text, created_at) VALUES (?5, ?1, ?2, ?3, ?4)").bind(fid, d, text, Date.now(), u.id),
    env.DB.prepare("INSERT INTO inbox (user_id, id, created_at, text, action, tier) VALUES (?4, ?1, ?2, ?3, 'registrar_comida', 'haiku')").bind(id(), Date.now(), `[comida ${d}] ${text}`, u.id),
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

// Mídia do SEU aparelho → R2 privado, sob o prefixo da conta. Upload passa pelo Worker (simples, valida tipo e tamanho).
export async function uploadMedia(req: Request, env: Env, uid: string): Promise<Response> {
  if (!env.MEDIA) throw new HttpError(501, "R2 não configurado");
  const url = new URL(req.url);
  const mime = (req.headers.get("Content-Type") ?? "").split(";")[0];
  const kind = MEDIA_MIME[mime];
  if (!kind) throw new HttpError(415, "use jpeg/png/webp/mp4/webm/mov");
  const len = Number(req.headers.get("Content-Length") ?? "0");
  if (!len || len > MAX_MEDIA) throw new HttpError(413, "até 20 MB (vídeo de 10–15 s)");
  const q = (k: string, max = 80) => str(url.searchParams.get(k), k, max, false);
  const meta = [q("equipmentId"), q("exerciseId"), q("gymId", 40), q("note", 300)];
  const mid = id(), key = `${mediaPrefix(uid)}media/${new Date().toISOString().slice(0, 7)}/${mid}`;
  const obj = await env.MEDIA.put(key, req.body, { httpMetadata: { contentType: mime } });
  if (!obj || obj.size > MAX_MEDIA) { if (obj) await env.MEDIA.delete(key); throw new HttpError(413, "arquivo grande demais"); }
  await env.DB.prepare("INSERT INTO media (user_id, id, kind, r2_key, mime, bytes, equipment_id, exercise_id, gym_id, note, created_at) VALUES (?11, ?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)")
    .bind(mid, kind, key, mime, obj.size, ...meta, Date.now(), uid).run();
  return json({ id: mid, kind }, 201);
}
on("POST", "/api/media", (req, env, _p, u) => uploadMedia(req, env, u.id));
on("GET", "/api/media", async (req, env, _p, u) => {
  const url = new URL(req.url);
  const ex = str(url.searchParams.get("exerciseId"), "exerciseId", 80, false);
  const { results } = await env.DB.prepare("SELECT id, kind, equipment_id, exercise_id, gym_id, note, setup, created_at FROM media WHERE user_id = ?2 AND (?1 IS NULL OR exercise_id = ?1) ORDER BY created_at DESC LIMIT 100").bind(ex, u.id).all();
  return json({ media: results });
});
on("GET", "/api/media/:id", async (_req, env, p, u) => {
  if (!env.MEDIA) throw new HttpError(501, "R2 não configurado");
  const row = await env.DB.prepare("SELECT r2_key, mime FROM media WHERE id = ?1 AND user_id = ?2").bind(p.id, u.id).first<{ r2_key: string; mime: string }>();
  const obj = row && (await env.MEDIA.get(row.r2_key));
  if (!obj) throw new HttpError(404, "não encontrado");
  return new Response(obj.body, { headers: { "Content-Type": row!.mime, "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" } });
});

/** Assinaturas "MÉTODO /caminho" de todas as rotas (o teste de isolamento confere que cobre todas). */
export const routeSignatures = () => routes.map((r) => `${r.method} ${r.path}`);

const isWrite = (method: string) => method !== "GET" && method !== "HEAD";

export async function handleApi(req: Request, env: Env, u: AuthUser): Promise<Response> {
  const url = new URL(req.url);
  for (const r of routes) {
    if (r.method !== req.method) continue;
    const m = url.pathname.match(r.re);
    if (!m) continue;
    try {
      if (isWrite(req.method)) {
        const wait = await hitRateLimit(env, u.id, r.path === "/api/media" ? "upload" : "write");
        if (wait) return json({ error: "muitas requisições; tente de novo em instantes" }, 429, { "Retry-After": String(wait) });
      }
      return await r.h(req, env, (m.groups ?? {}) as Record<string, string>, u);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error("api", r.path, e instanceof Error ? e.message : "erro");
      return json({ error: "erro interno" }, 500);
    }
  }
  return json({ error: "rota não encontrada" }, 404);
}
