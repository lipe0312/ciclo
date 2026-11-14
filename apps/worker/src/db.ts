// Repositório: todo SQL fica aqui (ou nas rotas), sempre com parâmetros (bind) e SEMPRE filtrado por user_id.
// O uid vem da autenticação (auth.ts), nunca do corpo da requisição.
import { DEFAULT_PROFILE, DOWS, MAX_SESSION_MS, assignWeekdays, reassignDays, MUSCLE_IDS, PAIN_REGIONS, applyProfilePatch, mondayOf, normalizeProfile, planFingerprint, sessionSummary, weekDates, weeklyTargets } from "@ciclo/core";
import { HttpError, int, oneOf, str } from "./http.ts";
import type { DayInput, Group, Mode, MuscleId, Pain, SetLog } from "@ciclo/core";
import type { Env } from "./env.ts";
import { somarEscrita } from "./limites.ts";

export interface Profile {
  level: 0 | 1 | 2 | 3; priorities: MuscleId[]; minutes: number; daysTarget: number;
  prefs: DayInput["prefs"]; pinned: DayInput["pinned"]; avoid: string[];
  dayGym?: Record<string, string>; [k: string]: unknown;
}

export const parse = <T>(s: unknown, fallback: T): T => { try { return s ? (JSON.parse(String(s)) as T) : fallback; } catch { return fallback; } };
const DEFAULTS: Profile = { level: 1, priorities: [], minutes: 60, daysTarget: 4, prefs: {}, pinned: {}, avoid: [] };

/** Perfil salvo da conta ou null (conta nova, antes dos Primeiros passos). */
export async function getProfile(env: Env, uid: string): Promise<Profile | null> {
  const r = await env.DB.prepare("SELECT data FROM profile WHERE user_id = ?1").bind(uid).first<{ data: string }>();
  return r ? { ...DEFAULTS, ...(normalizeProfile(parse<unknown>(r.data, {})) as Partial<Profile>) } : null;
}
/** Comandos que gravam o perfil e a versão no histórico (para rodar sozinhos ou dentro de um batch maior). */
function profileStmts(env: Env, uid: string, data: unknown, now = Date.now()) {
  const s = JSON.stringify(data);
  return [
    env.DB.prepare("INSERT INTO profile (user_id, data, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(user_id) DO UPDATE SET data = ?2, updated_at = ?3").bind(uid, s, now),
    env.DB.prepare("INSERT INTO profile_history (user_id, data, created_at) VALUES (?1, ?2, ?3)").bind(uid, s, now),
  ];
}
/** Grava o perfil e a versão no histórico; devolve o número da versão (contado no mesmo batch, atômico). */
export async function putProfile(env: Env, uid: string, data: unknown): Promise<number> {
  const r = await env.DB.batch([
    ...profileStmts(env, uid, data),
    env.DB.prepare("SELECT COUNT(*) AS n FROM profile_history WHERE user_id = ?1").bind(uid),
  ]);
  return (r[2].results as { n: number }[])[0]?.n ?? 1;
}

/** Perfil bruto da conta (sem preencher padrões) ou null. */
async function rawProfile(env: Env, uid: string): Promise<Record<string, unknown> | null> {
  const r = await env.DB.prepare("SELECT data FROM profile WHERE user_id = ?1").bind(uid).first<{ data: string }>();
  return r ? normalizeProfile(parse<unknown>(r.data, {})) : null;
}
/** Valida e grava. `replace`: o corpo é o perfil inteiro (app); senão é parcial e mescla no que já existe (Claude). Erro de validação → 400 com a lista. */
export async function saveProfile(env: Env, uid: string, input: unknown, mode: "replace" | "merge", extra: Record<string, unknown> = {}) {
  const base = mode === "merge" ? { ...DEFAULT_PROFILE, ...((await rawProfile(env, uid)) ?? {}) } : DEFAULT_PROFILE;
  const r = applyProfilePatch(base, input);
  if (!r.ok) throw new HttpError(400, r.errors.join("; "));
  const data = { ...r.profile, ...extra };
  const versao = await putProfile(env, uid, data);
  await syncGymWeekdays(env, uid, (data as { dayGym?: Record<string, string> }).dayGym ?? {});
  return { data, versao };
}
/** Impressão do perfil vigente quando o treino foi gerado (a última versão gravada até `at`). Sem histórico → null (não alarma). */
export async function planProfileFingerprint(env: Env, uid: string, at: number): Promise<string | null> {
  const r = await env.DB.prepare("SELECT data FROM profile_history WHERE user_id = ?1 AND created_at <= ?2 ORDER BY created_at DESC, id DESC LIMIT 1").bind(uid, at).first<{ data: string }>();
  return r ? planFingerprint(normalizeProfile(parse<unknown>(r.data, {}))) : null;
}

export interface GymOut { id: string; name: string; equipment: string[]; busyHours: string[]; kind: string; lat: number | null; lng: number | null; address: string | null; weekdays: string[] }
interface GymRow { id: string; name: string; equipment: string; busy_hours: string; kind: string; lat: number | null; lng: number | null; address: string | null; sort: number; deleted_at: number | null }
const GYM_COLS = "id, name, equipment, busy_hours, kind, lat, lng, address, sort, deleted_at";
const gymOut = (g: GymRow, days: Record<string, string[]>): GymOut => ({
  id: g.id, name: g.name, equipment: parse<string[]>(g.equipment, []), busyHours: parse<string[]>(g.busy_hours, []),
  kind: g.kind, lat: g.lat, lng: g.lng, address: g.address, weekdays: days[g.id] ?? [],
});
async function weekdaysByGym(env: Env, uid: string): Promise<Record<string, string[]>> {
  const { results } = await env.DB.prepare("SELECT gym_id, weekday FROM gym_weekday WHERE user_id = ?1").bind(uid).all<{ gym_id: string; weekday: string }>();
  const out: Record<string, string[]> = {};
  for (const r of results) (out[r.gym_id] ??= []).push(r.weekday);
  for (const k of Object.keys(out)) out[k] = DOWS.filter((d) => out[k].includes(d));
  return out;
}
/** Lugares da conta (sem os apagados). */
export async function listGyms(env: Env, uid: string): Promise<GymOut[]> {
  const [{ results }, days] = await Promise.all([
    env.DB.prepare(`SELECT ${GYM_COLS} FROM gym WHERE user_id = ?1 AND deleted_at IS NULL ORDER BY sort, created_at`).bind(uid).all<GymRow>(),
    weekdaysByGym(env, uid),
  ]);
  return results.map((g) => gymOut(g, days));
}
/** Um lugar da conta, apagado ou não (null = não existe NESTA conta). */
export async function getGymRow(env: Env, uid: string, gid: string): Promise<GymRow | null> {
  return env.DB.prepare(`SELECT ${GYM_COLS} FROM gym WHERE user_id = ?1 AND id = ?2`).bind(uid, gid).first<GymRow>();
}
export const gymView = async (env: Env, uid: string, g: GymRow) => gymOut(g, await weekdaysByGym(env, uid));
export async function countGyms(env: Env, uid: string): Promise<number> {
  return (await env.DB.prepare("SELECT COUNT(*) AS n FROM gym WHERE user_id = ?1 AND deleted_at IS NULL").bind(uid).first<{ n: number }>())?.n ?? 0;
}

/** Comandos que refazem o espelho de profile.dayGym em gym_weekday (1 lugar por dia). */
function weekdayStmts(env: Env, uid: string, dayGym: Record<string, string | undefined>) {
  return [
    env.DB.prepare("DELETE FROM gym_weekday WHERE user_id = ?1").bind(uid),
    ...DOWS.filter((d) => typeof dayGym[d] === "string").map((d) => env.DB.prepare("INSERT INTO gym_weekday (user_id, gym_id, weekday) VALUES (?1, ?2, ?3)").bind(uid, dayGym[d], d)),
  ];
}
/** Espelho de profile.dayGym em gym_weekday. Refeito inteiro a cada gravação do perfil. */
export async function syncGymWeekdays(env: Env, uid: string, dayGym: Record<string, string>) {
  await env.DB.batch(weekdayStmts(env, uid, dayGym));
}
/** Padrão por dia da conta: o do perfil (o que o planejador lê) por cima do espelho. */
async function currentDayGym(env: Env, uid: string): Promise<{ dayGym: Record<string, string>; hasProfile: boolean }> {
  const [p, { results }] = await Promise.all([
    getProfile(env, uid),
    env.DB.prepare("SELECT gym_id, weekday FROM gym_weekday WHERE user_id = ?1").bind(uid).all<{ gym_id: string; weekday: string }>(),
  ]);
  const dayGym: Record<string, string> = Object.fromEntries(results.map((r) => [r.weekday, r.gym_id]));
  return { dayGym: p ? { ...dayGym, ...((p.dayGym ?? {}) as Record<string, string>) } : dayGym, hasProfile: !!p };
}
/** Aplica uma mudança de dias no perfil (se a conta já tem) e no espelho. Perfil não é criado só por causa disto. */
async function applyDaysChange(env: Env, uid: string, ch: { dayGym: Record<string, string>; patch: Record<string, string | null> }, hasProfile: boolean) {
  if (!Object.keys(ch.patch).length) return;
  if (hasProfile) await saveProfile(env, uid, { dayGym: ch.patch }, "merge"); // também refaz o espelho
  else await syncGymWeekdays(env, uid, ch.dayGym);
}
/** O lugar passa a ser o padrão exatamente nos dias dados. */
export async function setGymWeekdays(env: Env, uid: string, gid: string, weekdays: string[]) {
  const { dayGym, hasProfile } = await currentDayGym(env, uid);
  await applyDaysChange(env, uid, assignWeekdays(dayGym, gid, weekdays), hasProfile);
}
/** Dias que o lugar tem hoje (para a API pedir a reatribuição antes de apagar). */
export async function gymDays(env: Env, uid: string, gid: string): Promise<string[]> {
  const { dayGym } = await currentDayGym(env, uid);
  return DOWS.filter((d) => dayGym[d] === gid);
}
/** Apagar o lugar: dias vão para `to` (ou ficam sem padrão); lugar e mídia vão para a lixeira (30 dias).
 *  Tudo num batch só (perfil + histórico + espelho dos dias + lugar + mídia): ou muda tudo, ou nada. */
export async function trashGym(env: Env, uid: string, gid: string, to: string | null, now = Date.now()) {
  const { dayGym, hasProfile } = await currentDayGym(env, uid);
  const ch = reassignDays(dayGym, gid, to);
  const trash = [
    env.DB.prepare("UPDATE gym SET deleted_at = ?3 WHERE user_id = ?1 AND id = ?2 AND deleted_at IS NULL").bind(uid, gid, now),
    env.DB.prepare("UPDATE media SET deleted_at = ?3 WHERE user_id = ?1 AND gym_id = ?2 AND deleted_at IS NULL").bind(uid, gid, now),
  ];
  let days: D1PreparedStatement[] = [];
  if (Object.keys(ch.patch).length) {
    if (hasProfile) {
      const r = applyProfilePatch({ ...DEFAULT_PROFILE, ...((await rawProfile(env, uid)) ?? {}) }, { dayGym: ch.patch });
      if (!r.ok) throw new HttpError(400, r.errors.join("; "));
      days = [...profileStmts(env, uid, r.profile, now), ...weekdayStmts(env, uid, (r.profile as { dayGym?: Record<string, string> }).dayGym ?? {})];
    } else days = weekdayStmts(env, uid, ch.dayGym);
  }
  await env.DB.batch([...days, ...trash]);
}

export const TRASH_MS = 30 * 864e5;
/** Cron (a cada hora, todas as contas): o que está na lixeira há mais de 30 dias some do R2 e do banco. */
export async function purgeTrash(env: Env, now = Date.now()): Promise<{ media: number; gyms: number }> {
  const cutoff = now - TRASH_MS;
  let media = 0;
  if (env.MEDIA) {
    const { results } = await env.DB.prepare("SELECT user_id, id, r2_key FROM media WHERE deleted_at IS NOT NULL AND deleted_at < ?1 LIMIT 200").bind(cutoff).all<{ user_id: string; id: string; r2_key: string }>();
    for (const m of results) {
      await env.MEDIA.delete(m.r2_key);
      await env.DB.prepare("DELETE FROM media WHERE user_id = ?1 AND id = ?2").bind(m.user_id, m.id).run();
      media++;
    }
  }
  const g = await env.DB.prepare("DELETE FROM gym WHERE deleted_at IS NOT NULL AND deleted_at < ?1").bind(cutoff).run();
  return { media, gyms: Number(g.meta?.changes ?? 0) };
}

/** Sessões abertas há mais de 2 h fecham sozinhas (iniciou = foi). Cron: todas as contas; leitura de estado: só a conta. */
export async function closeStaleSessions(env: Env, uid: string | null = null, now = Date.now()) {
  return env.DB.prepare("UPDATE session SET finished_at = started_at + ?1, closed_by = 'auto' WHERE finished_at IS NULL AND started_at <= ?2 AND (?3 IS NULL OR user_id = ?3)")
    .bind(MAX_SESSION_MS, now - MAX_SESSION_MS, uid).run();
}

export interface InboxRow { id: string; created_at: number; text: string; action: string; tier: string; status: string; response: string | null; change: unknown }

export async function weekState(env: Env, uid: string, anyDate: string) {
  const monday = mondayOf(anyDate);
  const dates = weekDates(monday);
  const [from, to] = [dates[0], dates[6]];
  const [att, chk, ses, vol, pains, inbox, cardio] = await env.DB.batch([
    env.DB.prepare("SELECT date, status, reason, source FROM attendance WHERE user_id = ?3 AND date BETWEEN ?1 AND ?2").bind(from, to, uid),
    env.DB.prepare("SELECT date, sleep_h, energy, soreness, stress, food, weight_kg, note FROM checkin WHERE user_id = ?3 AND date BETWEEN ?1 AND ?2").bind(from, to, uid),
    env.DB.prepare("SELECT id, date, gym_id, started_at, finished_at, closed_by, json_extract(plan, '$.name') AS name, json_extract(plan, '$.groups') AS groups FROM session WHERE user_id = ?3 AND date BETWEEN ?1 AND ?2 ORDER BY started_at").bind(from, to, uid),
    env.DB.prepare("SELECT l.muscle, COUNT(*) AS sets, COUNT(DISTINCT l.session_id) AS freq FROM set_log l JOIN session s ON s.user_id = l.user_id AND s.id = l.session_id WHERE l.user_id = ?3 AND s.date BETWEEN ?1 AND ?2 GROUP BY l.muscle").bind(from, to, uid),
    env.DB.prepare("SELECT id, region, intensity, kind, context, created_at FROM pain WHERE user_id = ?1 AND resolved_at IS NULL ORDER BY created_at DESC").bind(uid),
    env.DB.prepare("SELECT id, created_at, text, action, tier, status, response, change FROM inbox WHERE user_id = ?1 ORDER BY created_at DESC LIMIT 20").bind(uid),
    env.DB.prepare("SELECT id, date, type, minutes, intensity, distance_km FROM cardio_log WHERE user_id = ?3 AND date BETWEEN ?1 AND ?2 ORDER BY date, created_at").bind(from, to, uid),
  ]);
  const done: Partial<Record<MuscleId, number>> = {}, freq: Partial<Record<MuscleId, number>> = {};
  for (const r of vol.results as { muscle: MuscleId; sets: number; freq: number }[]) { done[r.muscle] = r.sets; freq[r.muscle] = r.freq; }
  const sessions = ses.results as { id: string; date: string; gym_id: string; started_at: number; finished_at: number | null; closed_by: string | null; name: string; groups: string }[];
  return {
    monday, dates, done, freq,
    attendance: att.results, checkins: chk.results,
    sessions: sessions.map((s) => ({ ...s, groups: parse<Group[]>(s.groups, []) })),
    pains: pains.results as (Pain & { id: string; kind: string; context: string })[],
    inbox: (inbox.results as InboxRow[]).map((i) => ({ ...i, change: parse<unknown>(i.change, null) })),
    // cardio da semana: o app/Claude resumem com cardioWeekSummary (core)
    cardio: (cardio.results as CardioRow[]).map(cardioOut),
  };
}

export interface CardioRow { id: string; date: string; type: string; minutes: number; intensity: string; distance_km: number | null }
export const cardioOut = (r: CardioRow) => ({ id: r.id, date: r.date, type: r.type, minutes: r.minutes, intensity: r.intensity, distanceKm: r.distance_km });

export interface ExerciseSession { sessionId: string; date: string; startedAt: number; sets: { setNo: number; kg: number; reps: number }[] }
/** Histórico de UM exercício, sessões da mais recente para trás (paginado por `before` = started_at da última recebida). */
export async function exerciseHistory(env: Env, uid: string, exerciseId: string, before: number | null, limit: number): Promise<ExerciseSession[]> {
  const { results } = await env.DB.prepare(`SELECT s.id AS session_id, s.date, s.started_at, l.set_no, l.kg, l.reps
    FROM session s JOIN set_log l ON l.user_id = s.user_id AND l.session_id = s.id
    WHERE s.user_id = ?1 AND l.exercise_id = ?2 AND (?3 IS NULL OR s.started_at < ?3)
      AND s.id IN (SELECT s2.id FROM session s2 JOIN set_log l2 ON l2.user_id = s2.user_id AND l2.session_id = s2.id
        WHERE s2.user_id = ?1 AND l2.exercise_id = ?2 AND (?3 IS NULL OR s2.started_at < ?3) GROUP BY s2.id ORDER BY s2.started_at DESC LIMIT ?4)
    ORDER BY s.started_at DESC, l.set_no`).bind(uid, exerciseId, before, limit)
    .all<{ session_id: string; date: string; started_at: number; set_no: number; kg: number | null; reps: number | null }>();
  const out: ExerciseSession[] = [];
  for (const r of results) {
    let cur = out[out.length - 1];
    if (!cur || cur.sessionId !== r.session_id) { cur = { sessionId: r.session_id, date: r.date, startedAt: r.started_at, sets: [] }; out.push(cur); }
    cur.sets.push({ setNo: r.set_no, kg: r.kg ?? 0, reps: r.reps ?? 0 });
  }
  return out;
}

/** Resumo do treino encerrado (volume, séries, PRs, médias vs última vez) a partir do que está no banco; grava em session.summary. */
export async function summarizeSession(env: Env, uid: string, sid: string) {
  const ses = await env.DB.prepare("SELECT started_at, finished_at FROM session WHERE user_id = ?1 AND id = ?2").bind(uid, sid).first<{ started_at: number; finished_at: number | null }>();
  if (!ses) return null;
  const cur = await env.DB.prepare("SELECT exercise_id, kg, reps FROM set_log WHERE user_id = ?1 AND session_id = ?2 ORDER BY exercise_id, set_no").bind(uid, sid).all<{ exercise_id: string; kg: number | null; reps: number | null }>();
  const current: Record<string, SetLog[]> = {};
  for (const r of cur.results) (current[r.exercise_id] ??= []).push({ kg: r.kg ?? 0, reps: r.reps ?? 0 });
  const ids = Object.keys(current);
  const past: Record<string, SetLog[][]> = {};
  if (ids.length) {
    const rows = await env.DB.prepare(`SELECT l.exercise_id, l.session_id, l.kg, l.reps FROM set_log l JOIN session s ON s.user_id = l.user_id AND s.id = l.session_id
      WHERE l.user_id = ?1 AND l.session_id <> ?2 AND s.started_at < ?3 AND l.exercise_id IN (SELECT value FROM json_each(?4))
      ORDER BY s.started_at DESC, l.set_no LIMIT 3000`).bind(uid, sid, ses.started_at, JSON.stringify(ids)).all<{ exercise_id: string; session_id: string; kg: number | null; reps: number | null }>();
    const lastSid: Record<string, string> = {};
    for (const r of rows.results) {
      const list = (past[r.exercise_id] ??= []);
      if (lastSid[r.exercise_id] !== r.session_id) { lastSid[r.exercise_id] = r.session_id; list.push([]); }
      list[list.length - 1].push({ kg: r.kg ?? 0, reps: r.reps ?? 0 });
    }
  }
  const sum = sessionSummary(Math.max(0, (ses.finished_at ?? Date.now()) - ses.started_at), current, past);
  await env.DB.prepare("UPDATE session SET summary = ?3 WHERE user_id = ?1 AND id = ?2").bind(uid, sid, JSON.stringify(sum)).run();
  return sum;
}

export async function lastGroup(env: Env, uid: string, beforeDate: string): Promise<Group | "full" | null> {
  const r = await env.DB.prepare("SELECT json_extract(plan, '$.groups') AS g FROM session WHERE user_id = ?2 AND date < ?1 ORDER BY started_at DESC LIMIT 1").bind(beforeDate, uid).first<{ g: string }>();
  const g = parse<Group[]>(r?.g, []);
  return g.length === 2 ? "full" : g[0] ?? null;
}

/** Motivo de não dar para planejar: conta sem perfil ou sem academia (Primeiros passos pendentes). */
export type EmptyReason = "sem_perfil" | "sem_academia";
export const EMPTY_MSG: Record<EmptyReason, string> = {
  sem_perfil: "complete os Primeiros passos: falta o perfil",
  sem_academia: "complete os Primeiros passos: cadastre ao menos uma academia",
};

export interface DayArgs { date: string; daysLeft: number; minutes?: number; mode?: Mode; focus?: MuscleId[]; gymId?: string; crowded?: boolean }
export async function buildDayInput(env: Env, uid: string, a: DayArgs): Promise<{ input: DayInput; gymId: string; empty?: undefined } | { empty: EmptyReason }> {
  const [profile, gyms, week, lg] = await Promise.all([getProfile(env, uid), listGyms(env, uid), weekState(env, uid, a.date), lastGroup(env, uid, a.date)]);
  if (!profile) return { empty: "sem_perfil" };
  if (!gyms.length) return { empty: "sem_academia" };
  const dow = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"][new Date(a.date + "T12:00:00Z").getUTCDay()];
  const wanted = a.gymId ?? profile.dayGym?.[dow];
  const gym = gyms.find((g) => g.id === wanted) ?? gyms[0];
  return {
    gymId: gym.id,
    input: {
      targets: weeklyTargets(profile.level, profile.priorities), done: week.done, freq: week.freq,
      priorities: profile.priorities, daysLeft: a.daysLeft, minutes: a.minutes ?? profile.minutes, lastGroup: lg,
      mode: a.mode ?? "normal", focus: a.focus ?? null, equipment: gym.equipment, crowded: !!a.crowded,
      prefs: profile.prefs, pinned: profile.pinned, avoid: profile.avoid,
      pains: week.pains.map((p) => ({ region: p.region, intensity: p.intensity })),
    },
  };
}

export const muscleIds = MUSCLE_IDS;

/** Uma dor aberta por região: registrar de novo atualiza intensidade/contexto (ex.: "melhorou"). */
export async function upsertPain(env: Env, uid: string, b: Record<string, unknown>): Promise<{ id: string }> {
  const region = oneOf(b.region, "region", PAIN_REGIONS.map((r) => r.id));
  const intensity = int(b.intensity, "intensity", 1, 3), kind = str(b.kind, "kind", 40, false), context = str(b.context, "context", 300, false);
  const open = await env.DB.prepare("SELECT id FROM pain WHERE user_id = ?1 AND region = ?2 AND resolved_at IS NULL").bind(uid, region).first<{ id: string }>();
  if (open) {
    await env.DB.prepare("UPDATE pain SET intensity = ?3, kind = COALESCE(?4, kind), context = COALESCE(?5, context) WHERE id = ?1 AND user_id = ?2").bind(open.id, uid, intensity, kind, context).run();
    return { id: open.id };
  }
  const pid = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO pain (user_id, id, region, intensity, kind, context, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)").bind(uid, pid, region, intensity, kind, context, Date.now()).run();
  return { id: pid };
}

// ---- limite de requisições por usuário (janela fixa no D1; ver ADR-0007) ----
export const RATE_LIMITS = { write: { max: 120, windowMs: 60_000 }, upload: { max: 20, windowMs: 10 * 60_000 }, geocode: { max: 1, windowMs: 1000 } } as const; // geocode: 1 req/s (política do Nominatim)
export type RateBucket = keyof typeof RATE_LIMITS;

/** Conta +1 na janela atual e devolve quantos segundos esperar se passou do limite (0 = liberado). */
export async function hitRateLimit(env: Env, uid: string, bucket: RateBucket, now = Date.now()): Promise<number> {
  const { max, windowMs } = RATE_LIMITS[bucket];
  const w = now - (now % windowMs);
  const lim = env.DB.prepare(`INSERT INTO rate_limit (user_id, bucket, window_start, count) VALUES (?1, ?2, ?3, 1)
    ON CONFLICT(user_id, bucket) DO UPDATE SET count = CASE WHEN window_start = ?3 THEN count + 1 ELSE 1 END, window_start = ?3
    RETURNING count`).bind(uid, bucket, w);
  const count = (await lim.first<{ count: number }>())?.count ?? 0;
  // #56: escrita e upload também contam no uso do app inteiro (cota global do plano grátis)
  if (bucket !== "geocode") await somarEscrita(env, now).run();
  return count > max ? Math.ceil((w + windowMs - now) / 1000) : 0;
}

export const GEOCODE_GAP_MS = 1000;
/** Limite GLOBAL do Nominatim (todas as contas juntas): 1 consulta por segundo. Atômico: só uma requisição ganha a vaga.
 *  Devolve 0 se pode consultar, ou os segundos a esperar. */
export async function takeGeocodeSlot(env: Env, now = Date.now()): Promise<number> {
  const r = await env.DB.prepare("UPDATE geocode_gate SET last_at = ?1 WHERE id = 1 AND last_at <= ?2").bind(now, now - GEOCODE_GAP_MS).run();
  if (r.meta.changes) return 0;
  const row = await env.DB.prepare("SELECT last_at FROM geocode_gate WHERE id = 1").first<{ last_at: number }>();
  return Math.max(1, Math.ceil(((row?.last_at ?? now) + GEOCODE_GAP_MS - now) / 1000));
}

// ---- direitos da conta (LGPD) ----
/** Tabelas de dado pessoal (todas têm user_id). Ordem de apagar: filhas antes das mães. */
export const USER_TABLES = ["set_log", "exercise_skip", "media", "week_plan", "day_override", "day_plan", "session", "attendance", "checkin", "pain", "inbox", "plan_edit", "food_log", "measurement", "gym_weekday", "gym", "profile_history", "profile", "mcp_token", "rate_limit", "cardio_log", "push_subscription", "rest_timer", "meal_template", "diet_target_history", "checkout", "health_exam", "reminder_state", "food_item", "claude_memory", "claude_heartbeat", "busca", "auth_challenge", "recovery_codes", "sessions", "passkeys", "invites"] as const;

/** Tudo da conta em JSON (mídia: só metadados; tokens: sem hash). */
export async function exportAccount(env: Env, uid: string) {
  const q = (sql: string) => env.DB.prepare(sql).bind(uid);
  const names = ["user", "profile", "profile_history", "gym", "day_plan", "session", "set_log", "exercise_skip", "attendance", "checkin", "pain", "inbox", "plan_edit", "food_log", "measurement", "media", "gym_weekday", "mcp_token", "week_plan", "day_override", "cardio_log", "meal_template", "diet_target_history", "checkout", "health_exam", "reminder_state", "food_item", "claude_memory", "claude_heartbeat", "passkeys", "sessions", "recovery_codes", "invites"] as const;
  const res = await env.DB.batch([
    q("SELECT id, email, name, role, created_at, last_seen_at, onboarding_done_at FROM user WHERE id = ?1"),
    q("SELECT data, updated_at FROM profile WHERE user_id = ?1"),
    q("SELECT data, created_at FROM profile_history WHERE user_id = ?1 ORDER BY created_at"),
    q("SELECT id, name, equipment, busy_hours, kind, lat, lng, address, sort, created_at, deleted_at FROM gym WHERE user_id = ?1 ORDER BY sort"),
    q("SELECT date, gym_id, input, plan, source, created_at FROM day_plan WHERE user_id = ?1 ORDER BY date"),
    q("SELECT id, date, gym_id, plan, started_at, finished_at, closed_by, feedback, summary FROM session WHERE user_id = ?1 ORDER BY started_at"),
    q("SELECT session_id, exercise_id, muscle, set_no, kg, reps, rir, created_at FROM set_log WHERE user_id = ?1 ORDER BY created_at"),
    q("SELECT session_id, exercise_id, reason, created_at FROM exercise_skip WHERE user_id = ?1 ORDER BY created_at"),
    q("SELECT date, status, reason, source, updated_at FROM attendance WHERE user_id = ?1 ORDER BY date"),
    q("SELECT date, sleep_h, energy, soreness, stress, food, weight_kg, note, updated_at FROM checkin WHERE user_id = ?1 ORDER BY date"),
    q("SELECT id, region, intensity, kind, context, created_at, resolved_at FROM pain WHERE user_id = ?1 ORDER BY created_at"),
    q("SELECT id, created_at, text, action, tier, status, response, change, answered_at FROM inbox WHERE user_id = ?1 ORDER BY created_at"),
    q("SELECT id, date, edit, issues, review, review_note, created_at FROM plan_edit WHERE user_id = ?1 ORDER BY created_at"),
    q("SELECT id, date, raw_text, meal, items, kcal, protein, kcal_est, protein_est, manual, source, confidence, created_at FROM food_log WHERE user_id = ?1 ORDER BY created_at"),
    q("SELECT date, arm_cm, waist_cm, shoulder_cm, updated_at FROM measurement WHERE user_id = ?1 ORDER BY date"),
    q("SELECT id, kind, mime, bytes, equipment_id, exercise_id, gym_id, note, setup, created_at, deleted_at FROM media WHERE user_id = ?1 ORDER BY created_at"),
    q("SELECT gym_id, weekday FROM gym_weekday WHERE user_id = ?1 ORDER BY weekday"),
    q("SELECT id, label, created_at, last_used_at, revoked_at FROM mcp_token WHERE user_id = ?1 ORDER BY created_at"),
    q("SELECT week_start, version, plan_json, source, created_at FROM week_plan WHERE user_id = ?1 ORDER BY week_start, version"),
    q("SELECT date, kind, opts, updated_at FROM day_override WHERE user_id = ?1 ORDER BY date"),
    q("SELECT id, date, type, minutes, intensity, distance_km, created_at FROM cardio_log WHERE user_id = ?1 ORDER BY date, created_at"),
    q("SELECT id, name, meal, text, kcal, protein, created_at FROM meal_template WHERE user_id = ?1 ORDER BY created_at"),
    q("SELECT id, date, kcal_before, kcal_after, adjust, tdee, trend_kg_week, code, reason, created_at FROM diet_target_history WHERE user_id = ?1 ORDER BY date, created_at"),
    q("SELECT date, trained, cardio_json, water_ml, alcohol_units, smoke, smoke_qty, caffeine_late, mood, sleep_ok, note, source, updated_at FROM checkout WHERE user_id = ?1 ORDER BY date"),
    q("SELECT id, label, created_at, raw_text, expires_at, analyzed_at, summary_json, status FROM health_exam WHERE user_id = ?1 ORDER BY created_at"),
    q("SELECT last_open, snoozed_on, absence_days, absence_from, absence_to, updated_at FROM reminder_state WHERE user_id = ?1"),
    q("SELECT key, name, kcal, protein, carb, fat, units, source, uses, last_used_at, updated_at FROM food_item WHERE user_id = ?1 ORDER BY key"),
    q("SELECT id, fact, source, created_at, updated_at, expires_at FROM claude_memory WHERE user_id = ?1 ORDER BY created_at"),
    q("SELECT origem, at FROM claude_heartbeat WHERE user_id = ?1 ORDER BY origem"),
    // #54: credenciais sem segredo (nem hash): passkey só id/datas, sessão sem id_hash, código só a data de uso
    q("SELECT id, alg, transports, synced, created_at, last_used_at FROM passkeys WHERE user_id = ?1 ORDER BY created_at"),
    q("SELECT id, created_at, expires_at, last_seen_at, user_agent, via FROM sessions WHERE user_id = ?1 ORDER BY created_at"),
    q("SELECT created_at, used_at FROM recovery_codes WHERE user_id = ?1 ORDER BY created_at"),
    q("SELECT id, email, created_at, expires_at, used_at, CASE WHEN user_id = ?1 THEN 'para_mim' ELSE 'criado_por_mim' END AS tipo FROM invites WHERE created_by = ?1 OR user_id = ?1 ORDER BY created_at"),
  ]);
  const out: Record<string, unknown> = { formato: "ciclo-export-1", exportadoEm: new Date().toISOString() };
  names.forEach((n, i) => { out[n] = n === "user" || n === "profile" ? res[i].results[0] ?? null : res[i].results; });
  return out;
}

/** Apaga a conta inteira: objetos R2 (prefixo da conta + chaves registradas) e depois todas as linhas, numa transação. */
export async function deleteAccount(env: Env, uid: string) {
  if (env.MEDIA) {
    const { results } = await env.DB.prepare("SELECT r2_key FROM media WHERE user_id = ?1").bind(uid).all<{ r2_key: string }>();
    const keys = new Set(results.map((r) => r.r2_key));
    let cursor: string | undefined;
    do {
      const page = await env.MEDIA.list({ prefix: mediaPrefix(uid), cursor, limit: 1000 });
      for (const o of page.objects) keys.add(o.key);
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
    const all = [...keys];
    for (let i = 0; i < all.length; i += 1000) await env.MEDIA.delete(all.slice(i, i + 1000));
  }
  await env.DB.batch([
    ...USER_TABLES.map((t) => env.DB.prepare(`DELETE FROM ${t} WHERE user_id = ?1`).bind(uid)), // t é constante do código, não do usuário
    env.DB.prepare("DELETE FROM user WHERE id = ?1").bind(uid),
  ]);
}

export const mediaPrefix = (uid: string) => `u/${uid}/`;
