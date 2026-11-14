// API JSON do app (atrás do Cloudflare Access). Rotas pequenas, um estado agregado por chamada (/api/state)
// para o celular fazer 1 requisição ao abrir. Toda rota recebe o usuário autenticado (u) e filtra por u.id.
import { CARDIO_BY_ID, EQUIPMENT_BY_ID, EXERCISE_BY_ID, INTENSITIES, MAX_PLACES, MEDIA_MAX_BYTES, MUSCLE_IDS, PROMPTS, applyManualEdit, checkCardio, classify, planDay, validatePlace } from "@ciclo/core";
import type { DayPlan, Intensity, ManualEdit, Mode, MuscleId, Tier } from "@ciclo/core";
import type { AuthUser, Env } from "./env.ts";
import { HttpError, date, id, int, json, num, oneOf, readJson, str } from "./http.ts";
import { EMPTY_MSG, buildDayInput, cardioOut, closeStaleSessions, countGyms, deleteAccount, exerciseHistory, exportAccount, getGymRow, getProfile, gymDays, gymView, hitRateLimit, listGyms, mediaPrefix, parse, planProfileFingerprint, saveProfile, setGymWeekdays, summarizeSession, takeGeocodeSlot, trashGym, upsertPain, weekState } from "./db.ts";
import { pushEnabled, validEndpoint } from "./push.ts";
import { newMcpToken } from "./auth.ts";
import { dayAction, getWeek, regenerate, restore } from "./semana.ts";
import { registerComida } from "./comida.ts";
import { registerHome } from "./home.ts";
import { registerClaude } from "./mcp-chat.ts";
import { registerConta } from "./auth-conta.ts";
import { createExam, deleteExam, getDiary, openDiary, putCheckout, saveDaysSummary, saveRecap, setReminder } from "./diario.ts";

type Handler = (req: Request, env: Env, p: Record<string, string>, u: AuthUser) => Promise<Response>;
const routes: { method: string; path: string; re: RegExp; h: Handler }[] = [];
const on = (method: string, path: string, h: Handler) =>
  routes.push({ method, path, re: new RegExp("^" + path.replace(/:(\w+)/g, "(?<$1>[^/]+)") + "$"), h });

const MODES = ["normal", "compensatorio", "expresso"] as const;
const TIERS = ["haiku", "sonnet", "opus"] as const;
const MEDIA_MIME: Record<string, "foto" | "video"> = { "image/jpeg": "foto", "image/png": "foto", "image/webp": "foto", "video/mp4": "video", "video/webm": "video", "video/quicktime": "video" };
const MAX_MEDIA = MEDIA_MAX_BYTES;
const MAX_TOKENS = 10;

const account = (u: AuthUser) => ({ email: u.email.endsWith("@passkey.invalid") ? null : u.email, name: u.name, role: u.role, via: u.via ?? null, createdAt: u.createdAt, onboardingDoneAt: u.onboardingDoneAt });
const onboarding = (u: AuthUser) => (u.onboardingDoneAt ? "concluido" : "pendente");

on("GET", "/api/state", async (req, env, _p, u) => {
  const url = new URL(req.url);
  const today = date(url.searchParams.get("date"));
  await closeStaleSessions(env, u.id);
  const [profile, gyms, week, dayPlan, hist, media, meas] = await Promise.all([
    getProfile(env, u.id), listGyms(env, u.id), weekState(env, u.id, today),
    env.DB.prepare("SELECT plan, source, gym_id, created_at FROM day_plan WHERE user_id = ?2 AND date = ?1").bind(today, u.id).first<{ plan: string; source: string; gym_id: string; created_at: number }>(),
    // última sessão de cada exercício (para a dupla progressão sugerir a carga)
    env.DB.prepare(`SELECT l.exercise_id, l.kg, l.reps FROM set_log l
      WHERE l.user_id = ?1 AND l.session_id = (SELECT s2.session_id FROM set_log s2 WHERE s2.user_id = ?1 AND s2.exercise_id = l.exercise_id ORDER BY s2.created_at DESC LIMIT 1)
      ORDER BY l.exercise_id, l.set_no LIMIT 400`).bind(u.id).all<{ exercise_id: string; kg: number; reps: number }>(),
    env.DB.prepare("SELECT id, kind, exercise_id, equipment_id, gym_id, note FROM media WHERE user_id = ?1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 200").bind(u.id).all(),
    env.DB.prepare("SELECT date, arm_cm AS braco, waist_cm AS cintura FROM measurement WHERE user_id = ?1 ORDER BY date DESC LIMIT 12").bind(u.id).all(),
  ]);
  const history: Record<string, { kg: number; reps: number }[]> = {};
  for (const r of hist.results) (history[r.exercise_id] ??= []).push({ kg: r.kg, reps: r.reps });
  // Treino desatualizado: impressão do perfil na hora em que o treino foi gerado (o app compara com o perfil de hoje).
  const profileFp = dayPlan ? await planProfileFingerprint(env, u.id, dayPlan.created_at) : null;
  return json({
    account: account(u), onboarding: onboarding(u),
    profile: profile ?? {}, gyms, week, history, media: media.results, measures: meas.results.reverse(),
    features: { ai: !!env.AI, media: !!env.MEDIA },
    dayPlan: dayPlan ? { ...dayPlan, plan: JSON.parse(dayPlan.plan), profileFp } : null, version: env.APP_VERSION,
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
  // #54: a dona não apaga a própria conta enquanto houver outras (ninguém mais administraria convites e resets)
  if (u.role === "owner" && ((await env.DB.prepare("SELECT COUNT(*) AS n FROM user").first<{ n: number }>())?.n ?? 0) > 1)
    throw new HttpError(409, "apague ou passe as outras contas antes: a dona não sai enquanto houver outras pessoas", "dona_com_contas");
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

// O app manda o perfil inteiro; a mesma validação do core vale para o Claude (ciclo_salvar_perfil).
on("PUT", "/api/profile", async (req, env, _p, u) => {
  const b = await readJson<{ data: Record<string, unknown> }>(req, 32 * 1024);
  if (!b.data || typeof b.data !== "object" || Array.isArray(b.data)) throw new HttpError(400, "data inválido");
  await saveProfile(env, u.id, b.data, "replace");
  return json({ ok: true });
});

// ---- lugares (academia, casa, hotel) ----
const GYM_ID = /^[a-z0-9_-]{1,40}$/;
const gymId = (v: unknown) => { const g = str(v, "id", 40)!; if (!GYM_ID.test(g)) throw new HttpError(400, "id inválido"); return g; };
/** Corpo opcional (DELETE pode vir sem corpo). */
async function optJson(req: Request, max = 2 * 1024): Promise<Record<string, unknown>> {
  if (!req.headers.get("Content-Type") && !Number(req.headers.get("Content-Length") ?? "0")) return {};
  const b = await readJson<unknown>(req, max);
  if (typeof b !== "object" || b === null || Array.isArray(b)) throw new HttpError(400, "corpo inválido");
  return b as Record<string, unknown>;
}

on("GET", "/api/gyms", async (_req, env, _p, u) => json({ gyms: await listGyms(env, u.id) }));

// Cria ou edita. Edição é parcial: o que não veio fica como está. `weekdays` (opcional) troca os dias em que o lugar é o padrão.
on("PUT", "/api/gyms/:id", async (req, env, p, u) => {
  const gid = gymId(p.id);
  const row = await getGymRow(env, u.id, gid);
  const live = row && row.deleted_at == null ? row : null; // id de um lugar apagado pode ser usado de novo
  const v = validatePlace(await readJson(req, 16 * 1024), { partial: !!live });
  if (!v.ok) throw new HttpError(400, v.errors.join("; "));
  const n = v.value;
  if (!live && (await countGyms(env, u.id)) >= MAX_PLACES) throw new HttpError(409, `até ${MAX_PLACES} lugares`);
  const cur = live ?? { name: "", equipment: "[]", busy_hours: "[]", kind: "academia", lat: null, lng: null, address: null, sort: await countGyms(env, u.id) };
  await env.DB.prepare(`INSERT INTO gym (user_id, id, name, equipment, busy_hours, kind, lat, lng, address, sort, created_at, deleted_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, NULL)
      ON CONFLICT(user_id, id) DO UPDATE SET name = ?3, equipment = ?4, busy_hours = ?5, kind = ?6, lat = ?7, lng = ?8, address = ?9, sort = ?10, deleted_at = NULL,
        created_at = CASE WHEN gym.deleted_at IS NULL THEN gym.created_at ELSE ?11 END`)
    .bind(u.id, gid, n.name ?? cur.name, n.equipment ? JSON.stringify(n.equipment) : cur.equipment, n.busyHours ? JSON.stringify(n.busyHours) : cur.busy_hours,
      n.kind ?? cur.kind, n.lat !== undefined ? n.lat : cur.lat, n.lng !== undefined ? n.lng : cur.lng, n.address !== undefined ? n.address : cur.address,
      n.sort ?? cur.sort, Date.now()).run();
  if (n.weekdays) await setGymWeekdays(env, u.id, gid, n.weekdays);
  const saved = await getGymRow(env, u.id, gid);
  return json({ ok: true, gym: await gymView(env, u.id, saved!) });
});

// Apagar: o lugar e a mídia dele vão para a lixeira por 30 dias. Se o lugar tem dias da semana, `reassignTo` diz para qual lugar eles vão.
on("DELETE", "/api/gyms/:id", async (req, env, p, u) => {
  const gid = gymId(p.id);
  const b = await optJson(req);
  const row = await getGymRow(env, u.id, gid);
  if (!row || row.deleted_at != null) throw new HttpError(404, "lugar não encontrado");
  const others = (await listGyms(env, u.id)).filter((g) => g.id !== gid);
  const days = await gymDays(env, u.id, gid);
  let to: string | null = null;
  if (b.reassignTo != null) {
    to = gymId(b.reassignTo);
    if (to === gid || !others.some((g) => g.id === to)) throw new HttpError(404, "lugar de destino não encontrado");
  } else if (days.length && others.length) {
    return json({ error: "este lugar tem dias da semana: informe para qual lugar mudar (reassignTo)", days, options: others.map((g) => g.id) }, 409);
  }
  await trashGym(env, u.id, gid, to);
  return json({ ok: true, reassignedTo: to, days });
});

// Busca de endereço (Nominatim/OpenStreetMap) pelo servidor: o Worker é quem se identifica (User-Agent do app, sem dado pessoal) e o limite é 1 req/s.
on("GET", "/api/geocode", async (req, env, _p, u) => {
  const q = (str(new URL(req.url).searchParams.get("q"), "q", 120) ?? "").replace(/\s+/g, " ").trim();
  if (q.length < 3) throw new HttpError(400, "digite ao menos 3 letras");
  const wait = await hitRateLimit(env, u.id, "geocode");
  if (wait) return json({ error: "muitas buscas; espere um instante" }, 429, { "Retry-After": String(wait) });
  const global = await takeGeocodeSlot(env); // 1 req/s do app inteiro (política do Nominatim)
  if (global) return json({ error: "o serviço de endereços está ocupado; tente de novo em instantes" }, 429, { "Retry-After": String(global) });
  let rows: unknown;
  try {
    const r = await fetch("https://nominatim.openstreetmap.org/search?" + new URLSearchParams({ q, format: "jsonv2", limit: "5", "accept-language": "pt-BR" }),
      { headers: { "User-Agent": "Ciclo-app/1.0", Accept: "application/json" }, signal: AbortSignal.timeout(6000) });
    if (!r.ok) throw new Error("status");
    rows = await r.json();
  } catch { throw new HttpError(502, "a busca de endereço está indisponível; marque o ponto no mapa"); }
  const results = (Array.isArray(rows) ? rows : []).flatMap((x: any) => {
    const lat = Number(x?.lat), lng = Number(x?.lon);
    return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && typeof x?.display_name === "string"
      ? [{ label: x.display_name.slice(0, 160), lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5 }] : [];
  }).slice(0, 5);
  return json({ results });
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

// ---- diário (#27): checkout da noite, resumo dos dias sem abrir, lembrete sem modal e exames ----
on("GET", "/api/diario", async (req, env, _p, u) => {
  const q = new URL(req.url).searchParams;
  return json(await getDiary(env, u.id, date(q.get("from"), "from"), date(q.get("to"), "to")));
});
on("PUT", "/api/checkout/:date", async (req, env, p, u) => json(await putCheckout(env, u.id, date(p.date), await readJson(req, 8 * 1024))));
// #42: o dia do diário vem do relógio do servidor (vira às 07:00); o corpo ({ today }) é aceito e ignorado
on("POST", "/api/diario/abrir", async (_req, env, _p, u) => json(await openDiary(env, u.id)));
on("PUT", "/api/diario/lembrete", async (req, env, _p, u) => json(await setReminder(env, u.id, await readJson(req, 1024))));
on("POST", "/api/diario/resumo", async (req, env, _p, u) => json(await saveDaysSummary(env, u.id, (await readJson(req, 16 * 1024)).dias, "resumo")));
on("POST", "/api/diario/recap", async (req, env, _p, u) => json(await saveRecap(env, u.id, await readJson(req, 64 * 1024))));
// Exame: chega só o TEXTO (o PDF é lido no aparelho, até 5 MB); o arquivo nunca vai ao servidor nem ao R2.
on("POST", "/api/exames", async (req, env, _p, u) => json(await createExam(env, u.id, await readJson(req, 256 * 1024)), 201));
on("DELETE", "/api/exames/:id", async (_req, env, p, u) => json(await deleteExam(env, u.id, p.id)));

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
  const r = await env.DB.prepare("UPDATE session SET finished_at = ?2, closed_by = 'usuario', feedback = ?3 WHERE user_id = ?4 AND id = ?1 AND finished_at IS NULL")
    .bind(p.id, Date.now(), JSON.stringify(b.feedback ?? {}), u.id).run();
  // terminou: não há mais descanso para avisar
  await env.DB.prepare("DELETE FROM rest_timer WHERE user_id = ?1 AND session_id = ?2").bind(u.id, p.id).run();
  return json({ ok: true, summary: r.meta.changes ? await summarizeSession(env, u.id, p.id) : null });
});

// ---- modo treino (#25): restaurar sessão, desfazer série, descanso agendado, histórico, push e cardio ----
const EX_RE = /^[A-Za-z0-9_.-]{1,80}$/;
const exId = (v: unknown) => { if (typeof v !== "string" || !EX_RE.test(v)) throw new HttpError(400, "exerciseId inválido"); return v; };

// Sessão completa para recarregar/trocar de aparelho: plano, séries, "não fiz" e o descanso em curso.
on("GET", "/api/sessions/:id", async (_req, env, p, u) => {
  const s = await env.DB.prepare("SELECT id, date, gym_id, plan, started_at, finished_at, closed_by, summary FROM session WHERE user_id = ?1 AND id = ?2").bind(u.id, p.id)
    .first<{ id: string; date: string; gym_id: string | null; plan: string; started_at: number; finished_at: number | null; closed_by: string | null; summary: string | null }>();
  if (!s) throw new HttpError(404, "sessão não encontrada");
  const [sets, skips, rest] = await Promise.all([
    env.DB.prepare("SELECT exercise_id, set_no, kg, reps, rir FROM set_log WHERE user_id = ?1 AND session_id = ?2 ORDER BY exercise_id, set_no").bind(u.id, p.id).all<{ exercise_id: string; set_no: number; kg: number | null; reps: number | null; rir: number | null }>(),
    env.DB.prepare("SELECT exercise_id, reason FROM exercise_skip WHERE user_id = ?1 AND session_id = ?2").bind(u.id, p.id).all<{ exercise_id: string; reason: string }>(),
    env.DB.prepare("SELECT fire_at FROM rest_timer WHERE user_id = ?1 AND session_id = ?2 AND sent_at IS NULL").bind(u.id, p.id).first<{ fire_at: number }>(),
  ]);
  return json({
    id: s.id, date: s.date, gymId: s.gym_id, plan: parse(s.plan, {}), startedAt: s.started_at, finishedAt: s.finished_at, closedBy: s.closed_by, summary: parse(s.summary, null),
    sets: sets.results.map((x) => ({ exerciseId: x.exercise_id, setNo: x.set_no, kg: x.kg, reps: x.reps, rir: x.rir })),
    skips: skips.results.map((x) => ({ exerciseId: x.exercise_id, reason: x.reason })),
    rest: rest ? { until: rest.fire_at } : null,
  });
});

// Histórico de sessões (aba Histórico), paginado por `before` = started_at da última recebida.
on("GET", "/api/sessions", async (req, env, _p, u) => {
  const q = new URL(req.url).searchParams;
  const before = q.get("before") ? Number(q.get("before")) : null;
  if (before != null && !Number.isFinite(before)) throw new HttpError(400, "before inválido");
  const limit = Math.min(Math.max(Number(q.get("limit") ?? 20) || 20, 1), 50);
  const { results } = await env.DB.prepare(`SELECT s.id, s.date, s.started_at, s.finished_at, s.closed_by, json_extract(s.plan, '$.name') AS name, s.summary,
      (SELECT COUNT(*) FROM set_log l WHERE l.user_id = s.user_id AND l.session_id = s.id) AS sets,
      (SELECT COALESCE(SUM(l.kg * l.reps), 0) FROM set_log l WHERE l.user_id = s.user_id AND l.session_id = s.id) AS volume
    FROM session s WHERE s.user_id = ?1 AND (?2 IS NULL OR s.started_at < ?2) ORDER BY s.started_at DESC LIMIT ?3`).bind(u.id, before, limit)
    .all<{ id: string; date: string; started_at: number; finished_at: number | null; closed_by: string | null; name: string | null; summary: string | null; sets: number; volume: number }>();
  const sessions = results.map((r) => ({ id: r.id, date: r.date, startedAt: r.started_at, finishedAt: r.finished_at, closedBy: r.closed_by, name: r.name, sets: r.sets, volume: Math.round(r.volume),
    prs: parse<{ prs?: unknown[] } | null>(r.summary, null)?.prs ?? [] }));
  return json({ sessions, next: results.length === limit ? results[results.length - 1].started_at : null });
});

on("DELETE", "/api/sessions/:id/sets/:exerciseId/:setNo", async (_req, env, p, u) => {
  const n = Number(p.setNo);
  if (!Number.isInteger(n) || n < 1 || n > 12) throw new HttpError(400, "setNo fora de 1..12");
  const r = await env.DB.prepare(`DELETE FROM set_log WHERE user_id = ?1 AND session_id = ?2 AND exercise_id = ?3 AND set_no = ?4
    AND EXISTS (SELECT 1 FROM session WHERE user_id = ?1 AND id = ?2 AND (finished_at IS NULL OR closed_by = 'auto'))`).bind(u.id, p.id, exId(p.exerciseId), n).run();
  return json({ ok: true, removed: r.meta.changes > 0 });
});

// Descanso: o app avisa "acaba em N s" e o cron de 1 min manda o Web Push se a tela estiver bloqueada.
on("PUT", "/api/sessions/:id/rest", async (req, env, p, u) => {
  const b = await readJson<Record<string, unknown>>(req, 1024);
  const seconds = int(b.seconds, "seconds", 1, 900)!, fireAt = Date.now() + seconds * 1000;
  const r = await env.DB.prepare(`INSERT INTO rest_timer (user_id, session_id, fire_at, sent_at)
    SELECT ?1, ?2, ?3, NULL WHERE EXISTS (SELECT 1 FROM session WHERE user_id = ?1 AND id = ?2 AND finished_at IS NULL)
    ON CONFLICT(user_id) DO UPDATE SET session_id = ?2, fire_at = ?3, sent_at = NULL`).bind(u.id, p.id, fireAt).run();
  return json({ ok: true, scheduled: r.meta.changes > 0, push: pushEnabled(env) });
});
on("DELETE", "/api/sessions/:id/rest", async (_req, env, p, u) => {
  await env.DB.prepare("DELETE FROM rest_timer WHERE user_id = ?1 AND session_id = ?2").bind(u.id, p.id).run();
  return json({ ok: true });
});

// Histórico de um exercício (séries por sessão, da mais recente para trás) e as últimas sessões de vários de uma vez.
on("GET", "/api/exercises/:id/history", async (req, env, p, u) => {
  const q = new URL(req.url).searchParams;
  const before = q.get("before") ? Number(q.get("before")) : null;
  if (before != null && !Number.isFinite(before)) throw new HttpError(400, "before inválido");
  const limit = Math.min(Math.max(Number(q.get("limit") ?? 10) || 10, 1), 30);
  const sessions = await exerciseHistory(env, u.id, exId(p.id), before, limit);
  return json({ exerciseId: p.id, sessions, next: sessions.length === limit ? sessions[sessions.length - 1].startedAt : null });
});
on("GET", "/api/history/last", async (req, env, _p, u) => {
  const q = new URL(req.url).searchParams;
  const ids = [...new Set((q.get("ids") ?? "").split(",").filter(Boolean))];
  if (!ids.length || ids.length > 20) throw new HttpError(400, "ids: de 1 a 20 exercícios");
  const n = Math.min(Math.max(Number(q.get("n") ?? 5) || 5, 1), 10);
  const before = q.get("before") ? Number(q.get("before")) : null;
  if (before != null && !Number.isFinite(before)) throw new HttpError(400, "before inválido");
  const out: Record<string, { kg: number; reps: number }[][]> = {};
  await Promise.all(ids.map(async (id) => { out[exId(id)] = (await exerciseHistory(env, u.id, id, before, n)).map((s) => s.sets.map(({ kg, reps }) => ({ kg, reps }))); }));
  return json({ history: out });
});

// Web Push: chave pública (null = push desligado no servidor) e assinatura do aparelho.
on("GET", "/api/push/key", async (_req, env) => json({ publicKey: pushEnabled(env) ? env.VAPID_PUBLIC_KEY : null }));
on("POST", "/api/push/subscribe", async (req, env, _p, u) => {
  const b = await readJson<Record<string, unknown>>(req, 4 * 1024);
  if (!validEndpoint(b.endpoint)) throw new HttpError(400, "endpoint de push não aceito");
  const p256dh = str(b.p256dh, "p256dh", 200)!, auth = str(b.auth, "auth", 100)!;
  if (!/^[A-Za-z0-9_-]+$/.test(p256dh) || !/^[A-Za-z0-9_-]+$/.test(auth)) throw new HttpError(400, "chaves inválidas");
  // Limite de 5 aparelhos por conta, atômico: o INSERT só entra se o endpoint já é da conta (atualiza) ou se há vaga.
  const ins = await env.DB.prepare(`INSERT INTO push_subscription (user_id, endpoint, p256dh, auth, created_at)
    SELECT ?1, ?2, ?3, ?4, ?5
    WHERE EXISTS (SELECT 1 FROM push_subscription WHERE user_id = ?1 AND endpoint = ?2)
       OR (SELECT COUNT(*) FROM push_subscription WHERE user_id = ?1) < 5
    ON CONFLICT(user_id, endpoint) DO UPDATE SET p256dh = ?3, auth = ?4`)
    .bind(u.id, b.endpoint, p256dh, auth, Date.now()).run();
  if (!ins.meta.changes) throw new HttpError(409, "até 5 aparelhos com aviso; remova um");
  // aparelho compartilhado: o endpoint passa a ser desta conta; some das outras (não recebem push do aparelho alheio)
  await env.DB.prepare("DELETE FROM push_subscription WHERE endpoint = ?2 AND user_id <> ?1").bind(u.id, b.endpoint).run();
  return json({ ok: true }, 201);
});
on("DELETE", "/api/push/subscribe", async (req, env, _p, u) => {
  const b = await readJson<Record<string, unknown>>(req, 2 * 1024);
  const r = await env.DB.prepare("DELETE FROM push_subscription WHERE user_id = ?1 AND endpoint = ?2").bind(u.id, str(b.endpoint, "endpoint", 700)).run();
  return json({ ok: true, removed: r.meta.changes > 0 });
});

// Cardio: tipo, minutos, intensidade, distância opcional. Conta no resumo da semana e no histórico.
on("POST", "/api/cardio", async (req, env, _p, u) => {
  const b = await readJson<Record<string, unknown>>(req, 4 * 1024);
  const type = str(b.type, "type", 60)!, minutes = int(b.minutes, "minutes", 1, 300)!, intensity = oneOf(b.intensity, "intensity", Object.keys(INTENSITIES) as Intensity[]);
  const km = num(b.distanceKm, "distanceKm", 0.1, 200, false);
  const bad = checkCardio({ type, minutes, intensity, distanceKm: km });
  if (bad) throw new HttpError(400, bad);
  const cid = id();
  await env.DB.prepare("INSERT INTO cardio_log (user_id, id, date, type, minutes, intensity, distance_km, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)")
    .bind(u.id, cid, date(b.date), type, minutes, intensity, km, Date.now()).run();
  return json({ id: cid, name: CARDIO_BY_ID[type].nm }, 201);
});
on("GET", "/api/cardio", async (req, env, _p, u) => {
  const q = new URL(req.url).searchParams;
  const from = q.get("from") ? date(q.get("from"), "from") : null, to = q.get("to") ? date(q.get("to"), "to") : null;
  const limit = Math.min(Math.max(Number(q.get("limit") ?? 60) || 60, 1), 200);
  const { results } = await env.DB.prepare("SELECT id, date, type, minutes, intensity, distance_km FROM cardio_log WHERE user_id = ?1 AND (?2 IS NULL OR date >= ?2) AND (?3 IS NULL OR date <= ?3) ORDER BY date DESC, created_at DESC LIMIT ?4")
    .bind(u.id, from, to, limit).all<{ id: string; date: string; type: string; minutes: number; intensity: string; distance_km: number | null }>();
  return json({ cardio: results.map(cardioOut) });
});
on("DELETE", "/api/cardio/:id", async (_req, env, p, u) => {
  const r = await env.DB.prepare("DELETE FROM cardio_log WHERE user_id = ?1 AND id = ?2").bind(u.id, p.id).run();
  if (!r.meta.changes) throw new HttpError(404, "registro não encontrado");
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

// Comida (registros, refeições salvas, metas adaptativas) e transcrição de voz: ver comida.ts
registerComida(on);
// Home de evolução (#29): ver home.ts
registerHome(on);
// Claude no app (#30): status da fila e memória do Claude: ver mcp-chat.ts
registerClaude(on);
// Conta própria (#54): aparelhos, sair de todos, passkeys, códigos de recuperação, pessoas e convites: ver auth-conta.ts
registerConta(on);

// Mídia do SEU aparelho → R2 privado, sob o prefixo da conta. Upload passa pelo Worker (simples, valida tipo e tamanho).
// Mídia de aparelho (equipmentId) exige o lugar (gymId) e o lugar tem que ser desta conta.
export async function uploadMedia(req: Request, env: Env, uid: string): Promise<Response> {
  if (!env.MEDIA) throw new HttpError(501, "R2 não configurado");
  const url = new URL(req.url);
  const mime = (req.headers.get("Content-Type") ?? "").split(";")[0];
  const kind = MEDIA_MIME[mime];
  if (!kind) throw new HttpError(415, "use jpeg/png/webp/mp4/webm/mov");
  const len = Number(req.headers.get("Content-Length") ?? "0");
  if (!len || len > MAX_MEDIA) throw new HttpError(413, "até 20 MB (vídeo de 10–15 s)");
  const q = (k: string, max = 80) => str(url.searchParams.get(k), k, max, false);
  const equipmentId = q("equipmentId"), exerciseId = q("exerciseId"), gid = q("gymId", 40), note = q("note", 300);
  if (equipmentId && !Object.prototype.hasOwnProperty.call(EQUIPMENT_BY_ID, equipmentId)) throw new HttpError(400, "equipmentId inválido");
  if (equipmentId && !gid) throw new HttpError(400, "gymId obrigatório para mídia de aparelho");
  if (gid) {
    const g = await getGymRow(env, uid, gid);
    if (!g || g.deleted_at != null) throw new HttpError(404, "lugar não encontrado");
  }
  const mid = id(), key = `${mediaPrefix(uid)}media/${new Date().toISOString().slice(0, 7)}/${mid}`;
  const obj = await env.MEDIA.put(key, req.body, { httpMetadata: { contentType: mime } });
  if (!obj || obj.size > MAX_MEDIA) { if (obj) await env.MEDIA.delete(key); throw new HttpError(413, "arquivo grande demais"); }
  try {
    await env.DB.prepare("INSERT INTO media (user_id, id, kind, r2_key, mime, bytes, equipment_id, exercise_id, gym_id, note, created_at) VALUES (?11, ?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)")
      .bind(mid, kind, key, mime, obj.size, equipmentId, exerciseId, gid, note, Date.now(), uid).run();
  } catch (e) { await env.MEDIA.delete(key); throw e; }
  return json({ id: mid, kind }, 201);
}
on("POST", "/api/media", (req, env, _p, u) => uploadMedia(req, env, u.id));
on("GET", "/api/media", async (req, env, _p, u) => {
  const url = new URL(req.url);
  const ex = str(url.searchParams.get("exerciseId"), "exerciseId", 80, false);
  const gid = str(url.searchParams.get("gymId"), "gymId", 40, false), eq = str(url.searchParams.get("equipmentId"), "equipmentId", 80, false);
  const { results } = await env.DB.prepare(`SELECT id, kind, equipment_id, exercise_id, gym_id, note, setup, bytes, created_at FROM media
    WHERE user_id = ?4 AND deleted_at IS NULL AND (?1 IS NULL OR exercise_id = ?1) AND (?2 IS NULL OR gym_id = ?2) AND (?3 IS NULL OR equipment_id = ?3)
    ORDER BY created_at DESC LIMIT 100`).bind(ex, gid, eq, u.id).all();
  return json({ media: results });
});
// Com suporte a Range (Safari só toca vídeo se o servidor responder 206).
on("GET", "/api/media/:id", async (req, env, p, u) => {
  if (!env.MEDIA) throw new HttpError(501, "R2 não configurado");
  const row = await env.DB.prepare("SELECT r2_key, mime, bytes FROM media WHERE id = ?1 AND user_id = ?2 AND deleted_at IS NULL").bind(p.id, u.id).first<{ r2_key: string; mime: string; bytes: number }>();
  if (!row) throw new HttpError(404, "não encontrado");
  const base = { "Content-Type": row.mime, "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff", "Accept-Ranges": "bytes", "Content-Security-Policy": "default-src 'none'; media-src 'self'; img-src 'self'; sandbox" };
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("Range") ?? "");
  if (m && (m[1] || m[2]) && row.bytes > 0) {
    let start = m[1] ? Number(m[1]) : Math.max(0, row.bytes - Number(m[2])), end = m[1] && m[2] ? Number(m[2]) : row.bytes - 1;
    end = Math.min(end, row.bytes - 1);
    if (start > end || start >= row.bytes) return new Response(null, { status: 416, headers: { ...base, "Content-Range": `bytes */${row.bytes}` } });
    const part = await env.MEDIA.get(row.r2_key, { range: { offset: start, length: end - start + 1 } });
    if (!part) throw new HttpError(404, "não encontrado");
    return new Response(part.body, { status: 206, headers: { ...base, "Content-Range": `bytes ${start}-${end}/${row.bytes}`, "Content-Length": String(end - start + 1) } });
  }
  const obj = await env.MEDIA.get(row.r2_key);
  if (!obj) throw new HttpError(404, "não encontrado");
  return new Response(obj.body, { headers: base });
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
        const wait = await hitRateLimit(env, u.id, r.path === "/api/media" || r.path === "/api/transcribe" ? "upload" : "write");
        if (wait) return json({ error: "muitas requisições; tente de novo em instantes" }, 429, { "Retry-After": String(wait) });
      }
      return await r.h(req, env, (m.groups ?? {}) as Record<string, string>, u);
    } catch (e) {
      if (e instanceof HttpError) return json(e.code ? { error: e.message, code: e.code } : { error: e.message }, e.status);
      console.error("api", r.path, e instanceof Error ? e.message : "erro");
      return json({ error: "erro interno" }, 500);
    }
  }
  return json({ error: "rota não encontrada" }, 404);
}
