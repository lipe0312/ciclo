// Repositório: todo SQL fica aqui, sempre com parâmetros (bind). Nada de SQL montado com string do usuário.
import { MAX_SESSION_MS, MUSCLE_IDS, PAIN_REGIONS, mondayOf, weekDates, weeklyTargets } from "@ciclo/core";
import { int, oneOf, str } from "./http.ts";
import type { DayInput, Group, Mode, MuscleId, Pain } from "@ciclo/core";
import type { Env } from "./env.ts";

export interface Profile {
  level: 0 | 1 | 2 | 3; priorities: MuscleId[]; minutes: number; daysTarget: number;
  prefs: DayInput["prefs"]; pinned: DayInput["pinned"]; avoid: string[];
  dayGym?: Record<string, string>; [k: string]: unknown;
}

const parse = <T>(s: unknown, fallback: T): T => { try { return s ? (JSON.parse(String(s)) as T) : fallback; } catch { return fallback; } };

export async function getProfile(env: Env): Promise<Profile> {
  const r = await env.DB.prepare("SELECT data FROM profile WHERE id = 1").first<{ data: string }>();
  return parse<Profile>(r?.data, { level: 1, priorities: [], minutes: 60, daysTarget: 4, prefs: {}, pinned: {}, avoid: [] });
}
export async function putProfile(env: Env, data: unknown) {
  const s = JSON.stringify(data), now = Date.now();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO profile (id, data, updated_at) VALUES (1, ?1, ?2) ON CONFLICT(id) DO UPDATE SET data = ?1, updated_at = ?2").bind(s, now),
    env.DB.prepare("INSERT INTO profile_history (data, created_at) VALUES (?1, ?2)").bind(s, now),
  ]);
}

export async function listGyms(env: Env) {
  const { results } = await env.DB.prepare("SELECT id, name, equipment, busy_hours FROM gym ORDER BY sort").all<{ id: string; name: string; equipment: string; busy_hours: string }>();
  return results.map((g) => ({ id: g.id, name: g.name, equipment: parse<string[]>(g.equipment, []), busyHours: parse<string[]>(g.busy_hours, []) }));
}

/** Sessões abertas há mais de 2 h fecham sozinhas (iniciou = foi). Chamado no cron e em cada leitura de estado. */
export async function closeStaleSessions(env: Env, now = Date.now()) {
  return env.DB.prepare("UPDATE session SET finished_at = started_at + ?1, closed_by = 'auto' WHERE finished_at IS NULL AND started_at <= ?2")
    .bind(MAX_SESSION_MS, now - MAX_SESSION_MS).run();
}

export interface InboxRow { id: string; created_at: number; text: string; action: string; tier: string; status: string; response: string | null; change: unknown }

export async function weekState(env: Env, anyDate: string) {
  const monday = mondayOf(anyDate);
  const dates = weekDates(monday);
  const [from, to] = [dates[0], dates[6]];
  const [att, chk, ses, vol, pains, inbox] = await env.DB.batch([
    env.DB.prepare("SELECT date, status, reason, source FROM attendance WHERE date BETWEEN ?1 AND ?2").bind(from, to),
    env.DB.prepare("SELECT date, sleep_h, energy, soreness, stress, food, weight_kg, note FROM checkin WHERE date BETWEEN ?1 AND ?2").bind(from, to),
    env.DB.prepare("SELECT id, date, gym_id, started_at, finished_at, closed_by, json_extract(plan, '$.name') AS name, json_extract(plan, '$.groups') AS groups FROM session WHERE date BETWEEN ?1 AND ?2 ORDER BY started_at").bind(from, to),
    env.DB.prepare("SELECT l.muscle, COUNT(*) AS sets, COUNT(DISTINCT l.session_id) AS freq FROM set_log l JOIN session s ON s.id = l.session_id WHERE s.date BETWEEN ?1 AND ?2 GROUP BY l.muscle").bind(from, to),
    env.DB.prepare("SELECT id, region, intensity, kind, context, created_at FROM pain WHERE resolved_at IS NULL ORDER BY created_at DESC"),
    env.DB.prepare("SELECT id, created_at, text, action, tier, status, response, change FROM inbox ORDER BY created_at DESC LIMIT 20"),
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
  };
}

export async function lastGroup(env: Env, beforeDate: string): Promise<Group | "full" | null> {
  const r = await env.DB.prepare("SELECT json_extract(plan, '$.groups') AS g FROM session WHERE date < ?1 ORDER BY started_at DESC LIMIT 1").bind(beforeDate).first<{ g: string }>();
  const g = parse<Group[]>(r?.g, []);
  return g.length === 2 ? "full" : g[0] ?? null;
}

export interface DayArgs { date: string; daysLeft: number; minutes?: number; mode?: Mode; focus?: MuscleId[]; gymId?: string; crowded?: boolean }
export async function buildDayInput(env: Env, a: DayArgs): Promise<{ input: DayInput; gymId: string }> {
  const [profile, gyms, week, lg] = await Promise.all([getProfile(env), listGyms(env), weekState(env, a.date), lastGroup(env, a.date)]);
  const dow = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"][new Date(a.date + "T12:00:00Z").getUTCDay()];
  const gymId = a.gymId ?? profile.dayGym?.[dow] ?? gyms[0]?.id;
  const gym = gyms.find((g) => g.id === gymId) ?? gyms[0];
  return {
    gymId: gym?.id,
    input: {
      targets: weeklyTargets(profile.level, profile.priorities), done: week.done, freq: week.freq,
      priorities: profile.priorities, daysLeft: a.daysLeft, minutes: a.minutes ?? profile.minutes, lastGroup: lg,
      mode: a.mode ?? "normal", focus: a.focus ?? null, equipment: gym?.equipment ?? [], crowded: !!a.crowded,
      prefs: profile.prefs, pinned: profile.pinned, avoid: profile.avoid,
      pains: week.pains.map((p) => ({ region: p.region, intensity: p.intensity })),
    },
  };
}

export const muscleIds = MUSCLE_IDS;

/** Uma dor aberta por região: registrar de novo atualiza intensidade/contexto (ex.: "melhorou"). */
export async function upsertPain(env: Env, b: Record<string, unknown>): Promise<{ id: string }> {
  const region = oneOf(b.region, "region", PAIN_REGIONS.map((r) => r.id));
  const intensity = int(b.intensity, "intensity", 1, 3), kind = str(b.kind, "kind", 40, false), context = str(b.context, "context", 300, false);
  const open = await env.DB.prepare("SELECT id FROM pain WHERE region = ?1 AND resolved_at IS NULL").bind(region).first<{ id: string }>();
  if (open) {
    await env.DB.prepare("UPDATE pain SET intensity = ?2, kind = COALESCE(?3, kind), context = COALESCE(?4, context) WHERE id = ?1").bind(open.id, intensity, kind, context).run();
    return { id: open.id };
  }
  const pid = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO pain (id, region, intensity, kind, context, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)").bind(pid, region, intensity, kind, context, Date.now()).run();
  return { id: pid };
}
