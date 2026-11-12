// Semana completa planejada (#24): monta a entrada do core a partir do D1, guarda versões (desfazer) e as escolhas
// por dia. Todo SQL com bind e filtrado por user_id; o uid vem da autenticação.
import {
  EQUIPMENT_BY_ID, MUSCLE_IDS, applyDayAction, diffWeeks, mondayOf, planWeek, weekDates, weekProgression, weekView, weeklyTargets,
} from "@ciclo/core";
import type { CardioEntry, DayAction, DayOpts, DayOverride, DayPlan, Intensity, MuscleId, Progression, Sets, WeekInput, WeekPlan, WeekProfile } from "@ciclo/core";
import type { Env } from "./env.ts";
import { HttpError, date, int, oneOf, str } from "./http.ts";
import { EMPTY_MSG, getProfile, listGyms, parse, weekState } from "./db.ts";
import type { EmptyReason } from "./db.ts";

export type Source = "auto" | "regenerar" | "ajuste" | "falta" | "extra" | "desfazer";
/** O que vai no plan_json de cada versão. */
export interface Stored { plan: WeekPlan; overrides: Record<string, DayOverride>; progression: Progression; basis: string[] }

const addDays = (iso: string, k: number) => new Date(Date.parse(iso + "T12:00:00Z") + k * 864e5).toISOString().slice(0, 10);
const MAX_VERSIONS = 20;

interface Ctx {
  uid: string; today: string; weekStart: string; dates: string[];
  profile: WeekProfile; base: Record<MuscleId, number>;
  sets: Record<string, Sets>; attendance: WeekInput["attendance"];
  overrides: Record<string, DayOverride>; fixed: NonNullable<WeekInput["fixed"]>;
  latest: { version: number; stored: Stored | null; createdAt: number } | null;
  versions: { version: number; source: Source; createdAt: number }[];
  gymIds: string[];
  cardioLog: CardioEntry[];
}

export async function loadCtx(env: Env, uid: string, today: string): Promise<Ctx | { empty: EmptyReason }> {
  const weekStart = mondayOf(today), dates = weekDates(weekStart), [from, to] = [dates[0], dates[6]];
  const [profile, gyms, week] = await Promise.all([getProfile(env, uid), listGyms(env, uid), weekState(env, uid, today)]);
  if (!profile) return { empty: "sem_perfil" };
  if (!gyms.length) return { empty: "sem_academia" };
  const [sets, ovr, fixed, vers, latest, cardio] = await env.DB.batch([
    env.DB.prepare(`SELECT s.date AS date, l.muscle AS muscle, COUNT(*) AS n FROM set_log l JOIN session s ON s.user_id = l.user_id AND s.id = l.session_id
      WHERE l.user_id = ?1 AND s.date BETWEEN ?2 AND ?3 GROUP BY s.date, l.muscle`).bind(uid, from, to),
    env.DB.prepare("SELECT date, kind, opts FROM day_override WHERE user_id = ?1 AND date BETWEEN ?2 AND ?3").bind(uid, from, to),
    env.DB.prepare("SELECT date, plan, source FROM day_plan WHERE user_id = ?1 AND date BETWEEN ?2 AND ?3 AND source IN ('claude', 'manual')").bind(uid, from, to),
    env.DB.prepare("SELECT version, source, created_at FROM week_plan WHERE user_id = ?1 AND week_start = ?2 ORDER BY version DESC LIMIT ?3").bind(uid, weekStart, MAX_VERSIONS),
    env.DB.prepare("SELECT version, plan_json, created_at FROM week_plan WHERE user_id = ?1 AND week_start = ?2 ORDER BY version DESC LIMIT 1").bind(uid, weekStart),
    env.DB.prepare("SELECT id, date, type, minutes, intensity, distance_km FROM cardio_log WHERE user_id = ?1 AND date BETWEEN ?2 AND ?3 ORDER BY date, created_at").bind(uid, from, to),
  ]);
  const setsBy: Record<string, Sets> = {};
  for (const r of sets.results as { date: string; muscle: MuscleId; n: number }[]) if (MUSCLE_IDS.includes(r.muscle)) (setsBy[r.date] ??= {})[r.muscle] = r.n;
  const lr = (latest.results as { version: number; plan_json: string; created_at: number }[])[0];
  const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const p = profile;
  return {
    uid, today, weekStart, dates,
    profile: {
      daysUsual: strs(p.daysUsual), daysTarget: typeof p.daysTarget === "number" ? p.daysTarget : 4, minutes: typeof p.minutes === "number" ? p.minutes : 60,
      priorities: (p.priorities ?? []).filter((m) => MUSCLE_IDS.includes(m)), dayGym: (p.dayGym ?? {}) as Record<string, string>,
      gyms: gyms.map((g) => ({ id: g.id, equipment: g.equipment })), prefs: p.prefs, pinned: p.pinned, avoid: p.avoid,
      pains: week.pains.map((x) => ({ region: x.region, intensity: x.intensity })),
      goalId: typeof (p.goal as { id?: unknown } | undefined)?.id === "string" ? (p.goal as { id: string }).id : null,
    },
    base: weeklyTargets(([0, 1, 2, 3].includes(p.level) ? p.level : 1) as 0 | 1 | 2 | 3, (p.priorities ?? []).filter((m) => MUSCLE_IDS.includes(m))),
    sets: setsBy,
    attendance: Object.fromEntries((week.attendance as { date: string; status: "fui" | "nao_fui" | "folga" }[]).map((a) => [a.date, a.status])),
    overrides: Object.fromEntries((ovr.results as { date: string; kind: DayOverride["kind"]; opts: string }[]).map((o) => [o.date, { kind: o.kind, opts: parse<DayOpts>(o.opts, {}) }])),
    fixed: Object.fromEntries((fixed.results as { date: string; plan: string; source: "claude" | "manual" }[]).flatMap((f) => {
      const plan = parse<DayPlan | null>(f.plan, null);
      return Array.isArray(plan?.items) ? [[f.date, { plan: plan!, source: f.source }]] : [];
    })),
    latest: lr ? { version: lr.version, stored: parse<Stored | null>(lr.plan_json, null), createdAt: lr.created_at } : null,
    versions: (vers.results as { version: number; source: Source; created_at: number }[]).map((v) => ({ version: v.version, source: v.source, createdAt: v.created_at })),
    gymIds: gyms.map((g) => g.id),
    cardioLog: (cardio.results as { id: string; date: string; type: string; minutes: number; intensity: Intensity; distance_km: number | null }[])
      .map((r) => ({ id: r.id, date: r.date, type: r.type, minutes: r.minutes, intensity: r.intensity, distanceKm: r.distance_km })),
  };
}

/** Alvos da semana: perfil + ajuste por feedback da semana passada + deload (core: weekProgression). */
async function progression(env: Env, c: Ctx): Promise<Progression> {
  const uid = c.uid, lastStart = addDays(c.weekStart, -7), lastEnd = addDays(c.weekStart, -1), from = addDays(c.weekStart, -42);
  const [prev, ses, cks, freq, e1] = await env.DB.batch([
    env.DB.prepare(`SELECT w.week_start AS ws, w.plan_json AS pj FROM week_plan w WHERE w.user_id = ?1 AND w.week_start < ?2 AND w.week_start >= ?3
      AND w.version = (SELECT MAX(x.version) FROM week_plan x WHERE x.user_id = ?1 AND x.week_start = w.week_start) ORDER BY w.week_start DESC LIMIT 6`).bind(uid, c.weekStart, from),
    env.DB.prepare("SELECT feedback FROM session WHERE user_id = ?1 AND date BETWEEN ?2 AND ?3").bind(uid, lastStart, lastEnd),
    env.DB.prepare("SELECT date, sleep_h, energy, soreness, stress FROM checkin WHERE user_id = ?1 AND date BETWEEN ?2 AND ?3").bind(uid, addDays(c.weekStart, -21), lastEnd),
    env.DB.prepare(`SELECT l.muscle AS muscle, COUNT(DISTINCT l.session_id) AS f FROM set_log l JOIN session s ON s.user_id = l.user_id AND s.id = l.session_id
      WHERE l.user_id = ?1 AND s.date BETWEEN ?2 AND ?3 GROUP BY l.muscle`).bind(uid, lastStart, lastEnd),
    env.DB.prepare(`SELECT s.date AS date, l.exercise_id AS ex, l.muscle AS muscle, MAX(l.kg * (1 + l.reps / 30.0)) AS v FROM set_log l JOIN session s ON s.user_id = l.user_id AND s.id = l.session_id
      WHERE l.user_id = ?1 AND s.date BETWEEN ?2 AND ?3 AND l.kg > 0 AND l.reps > 0 GROUP BY l.session_id, l.exercise_id ORDER BY s.started_at LIMIT 2000`).bind(uid, from, lastEnd),
  ]);
  const pump: Partial<Record<MuscleId, number[]>> = {};
  for (const r of ses.results as { feedback: string | null }[]) {
    const fb = parse<{ pump?: Record<string, unknown> }>(r.feedback, {});
    for (const m of MUSCLE_IDS) { const v = fb.pump?.[m]; if (typeof v === "number" && v >= 0 && v <= 2) (pump[m] ??= []).push(v); }
  }
  const weekIdx = (d: string) => Math.round((Date.parse(c.weekStart) - Date.parse(mondayOf(d))) / 6048e5) - 1;
  const checkinsByWeek: { sleepH: 5 | 6 | 7 | 8 | 9; energy: 1 | 2 | 3; soreness: 0 | 1 | 2; stress: 1 | 2 | 3 }[][] = [[], [], []];
  for (const r of cks.results as { date: string; sleep_h: 5 | 6 | 7 | 8 | 9; energy: 1 | 2 | 3; soreness: 0 | 1 | 2; stress: 1 | 2 | 3 }[]) {
    const k = weekIdx(r.date);
    if (k >= 0 && k < 3) checkinsByWeek[k].push({ sleepH: r.sleep_h, energy: r.energy, soreness: r.soreness, stress: r.stress });
  }
  return weekProgression({
    base: c.base,
    prevWeeks: (prev.results as { pj: string }[]).map((r) => { const s = parse<Partial<Stored>>(r.pj, {}); return { offsets: s.progression?.offsets, deload: !!s.progression?.deload?.on }; }),
    checkinsByWeek, pump,
    freq: Object.fromEntries((freq.results as { muscle: MuscleId; f: number }[]).map((r) => [r.muscle, r.f])),
    e1rm: (e1.results as { date: string; ex: string; muscle: MuscleId; v: number }[]).filter((r) => MUSCLE_IDS.includes(r.muscle)).map((r) => ({ exerciseId: r.ex, muscle: r.muscle, week: weekIdx(r.date), value: r.v })),
  });
}

const input = (c: Ctx, s: { overrides: Record<string, DayOverride>; progression: Progression }, prev: WeekPlan | null): WeekInput => ({
  weekStart: c.weekStart, today: c.today, sets: c.sets, attendance: c.attendance, profile: c.profile,
  targets: s.progression.targets, overrides: s.overrides, fixed: c.fixed, cardioLog: c.cardioLog, prev,
});

async function generate(env: Env, c: Ctx, overrides: Record<string, DayOverride>, fresh: boolean): Promise<Stored> {
  const prog = !fresh && c.latest?.stored?.progression ? c.latest.stored.progression : await progression(env, c);
  const plan = planWeek(input(c, { overrides, progression: prog }, c.latest?.stored?.plan ?? null));
  return { plan, overrides, progression: prog, basis: Object.keys(c.sets).sort() };
}

/** Grava uma versão nova (e as escolhas vivas, se mudaram). "auto" só entra se a semana ainda não tem versão. */
async function persist(env: Env, c: Ctx, s: Stored, source: Source, writeOverrides: boolean): Promise<number> {
  const now = Date.now();
  const stmts = [];
  if (writeOverrides) {
    stmts.push(env.DB.prepare("DELETE FROM day_override WHERE user_id = ?1 AND date BETWEEN ?2 AND ?3").bind(c.uid, c.dates[0], c.dates[6]));
    for (const [d, o] of Object.entries(s.overrides)) if (c.dates.includes(d))
      stmts.push(env.DB.prepare("INSERT INTO day_override (user_id, date, kind, opts, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)").bind(c.uid, d, o.kind, JSON.stringify(o.opts ?? {}), now));
  }
  stmts.push(env.DB.prepare(`INSERT INTO week_plan (user_id, week_start, version, plan_json, source, created_at)
    SELECT ?1, ?2, COALESCE(MAX(version), 0) + 1, ?3, ?4, ?5 FROM week_plan WHERE user_id = ?1 AND week_start = ?2 HAVING ?4 != 'auto' OR COUNT(*) = 0`)
    .bind(c.uid, c.weekStart, JSON.stringify(s), source, now));
  stmts.push(env.DB.prepare(`DELETE FROM week_plan WHERE user_id = ?1 AND week_start = ?2
    AND version <= (SELECT MAX(version) - ?3 FROM week_plan WHERE user_id = ?1 AND week_start = ?2)`).bind(c.uid, c.weekStart, MAX_VERSIONS));
  await env.DB.batch(stmts);
  const r = await env.DB.prepare("SELECT MAX(version) AS v FROM week_plan WHERE user_id = ?1 AND week_start = ?2").bind(c.uid, c.weekStart).first<{ v: number }>();
  return r?.v ?? 1;
}

function view(c: Ctx, s: Stored, version: number) {
  const v = weekView(input(c, s, null), s.plan);
  return {
    ...v, version, versions: c.versions,
    progression: { changes: s.progression.changes, deload: s.progression.deload, base: c.base },
  };
}

/** Lê a semana; na 1ª vez (segunda de manhã) gera e grava a versão 1. Treino num dia não planejado reorganiza o resto. */
export async function getWeek(env: Env, uid: string, today: string) {
  let c = await loadCtx(env, uid, today);
  if ("empty" in c) return { week: null, empty: c.empty, message: EMPTY_MSG[c.empty] };
  if (!c.latest?.stored?.plan) {
    const s = await generate(env, c, c.overrides, true);
    await persist(env, c, s, "auto", false);
  } else {
    const st = c.latest.stored;
    const extra = Object.keys(c.sets).filter((d) => !st.basis?.includes(d) && st.plan.days.find((x) => x.date === d)?.kind === "folga");
    if (extra.length) await persist(env, c, await generate(env, c, c.overrides, false), "extra", false);
    else return { week: view(c, st, c.latest.version) };
  }
  c = (await loadCtx(env, uid, today)) as Ctx;
  return { week: view(c, c.latest!.stored!, c.latest!.version) };
}

async function ready(env: Env, uid: string, today: string): Promise<Ctx> {
  const c = await loadCtx(env, uid, today);
  if ("empty" in c) throw new HttpError(409, EMPTY_MSG[c.empty]);
  if (c.latest?.stored?.plan) return c;
  await persist(env, c, await generate(env, c, c.overrides, true), "auto", false);
  return (await loadCtx(env, uid, today)) as Ctx;
}

/** Regenerar: devolve o diff; com apply grava. `reset` descarta as trocas dos dias que ainda não passaram. */
export async function regenerate(env: Env, uid: string, b: Record<string, unknown>) {
  const c = await ready(env, uid, date(b.date));
  const keep = Object.fromEntries(Object.entries(c.overrides).filter(([d]) => !b.reset || d < c.today || !!c.sets[d]));
  const s = await generate(env, c, keep, true);
  const diff = diffWeeks(c.latest!.stored!.plan, s.plan);
  if (b.apply !== true) return { diff, week: null };
  await persist(env, c, s, "regenerar", !!b.reset);
  const c2 = (await loadCtx(env, uid, c.today)) as Ctx;
  return { diff, week: view(c2, c2.latest!.stored!, c2.latest!.version) };
}

/** Desfazer: volta para uma versão anterior (vira uma versão nova "desfazer"; nada se perde). */
export async function restore(env: Env, uid: string, b: Record<string, unknown>) {
  const c = await ready(env, uid, date(b.date));
  const v = int(b.version, "version", 1, 10000)!;
  const row = await env.DB.prepare("SELECT plan_json FROM week_plan WHERE user_id = ?1 AND week_start = ?2 AND version = ?3").bind(uid, c.weekStart, v).first<{ plan_json: string }>();
  const s = row && parse<Stored | null>(row.plan_json, null);
  if (!s?.plan) throw new HttpError(404, "versão não encontrada");
  await persist(env, c, { ...s, overrides: s.overrides ?? {} }, "desfazer", true);
  const c2 = (await loadCtx(env, uid, c.today)) as Ctx;
  return { week: view(c2, c2.latest!.stored!, c2.latest!.version) };
}

const SPLITS = ["sup", "inf", "full"] as const;
const MODES = ["normal", "compensatorio", "expresso"] as const;
const FORMATS = ["tradicional", "superserie", "circuito"] as const;
function opts(v: unknown, gymIds: string[]): DayOpts {
  if (v == null) return {};
  if (typeof v !== "object" || Array.isArray(v)) throw new HttpError(400, "opts inválido");
  const o = v as Record<string, unknown>, out: DayOpts = {};
  if (o.split != null) out.split = oneOf(o.split, "split", SPLITS);
  if (o.focus != null) {
    if (!Array.isArray(o.focus) || o.focus.length > 3 || !o.focus.every((m) => MUSCLE_IDS.includes(m as MuscleId))) throw new HttpError(400, "focus: até 3 músculos válidos");
    if (o.focus.length) out.focus = o.focus as MuscleId[];
  }
  if (o.mode != null) out.mode = oneOf(o.mode, "mode", MODES);
  if (o.minutes != null) out.minutes = int(o.minutes, "minutes", 15, 150)!;
  if (o.gymId != null) { const g = str(o.gymId, "gymId", 40)!; if (!gymIds.includes(g)) throw new HttpError(400, "gymId inválido"); out.gymId = g; }
  if (o.format != null) out.format = oneOf(o.format, "format", FORMATS);
  if (o.crowded != null) out.crowded = o.crowded === true;
  Object.assign(out, geracao(o, gymIds));
  return out;
}
const ESTILOS = ["livre", "maquina"] as const;
/** As 4 escolhas do "Gerar outro treino" (#44): aparelhos ocupados, estilo, mais leve e músculo a adiantar. Tudo opcional. */
function geracao(o: Record<string, unknown>, _gymIds: string[]): Pick<DayOpts, "ocupados" | "estilo" | "leve" | "adiantar"> {
  const out: Pick<DayOpts, "ocupados" | "estilo" | "leve" | "adiantar"> = {};
  if (o.ocupados != null) {
    if (!Array.isArray(o.ocupados) || o.ocupados.length > 60 || !o.ocupados.every((q) => typeof q === "string" && !!EQUIPMENT_BY_ID[q])) throw new HttpError(400, "ocupados: lista de aparelhos válidos");
    if (o.ocupados.length) out.ocupados = [...new Set(o.ocupados as string[])];
  }
  if (o.estilo != null) out.estilo = oneOf(o.estilo, "estilo", ESTILOS);
  if (o.leve != null) out.leve = o.leve === true || undefined;
  if (o.adiantar != null) { if (!MUSCLE_IDS.includes(o.adiantar as MuscleId)) throw new HttpError(400, "adiantar: músculo inválido"); out.adiantar = o.adiantar as MuscleId; }
  return out;
}

const ACTIONS = ["gerar", "outro", "mover", "trocar", "folga", "treino", "extra", "manter", "falta"] as const;
/** Ações num dia: trocar a geração, mover, trocar com outro, folga/treino/extra, manter (sem compensatório) e responder falta. */
export async function dayAction(env: Env, uid: string, d: string, b: Record<string, unknown>) {
  const day = date(d);
  const c = await ready(env, uid, date(b.today, "today"));
  const action = oneOf(b.action, "action", ACTIONS);
  let overrides = c.overrides, source: Source = "ajuste";
  if (action === "falta") {
    if (!c.dates.includes(day) || day > c.today) throw new HttpError(400, "falta só para dias desta semana até hoje");
    const status = oneOf(b.resposta, "resposta", ["fui", "nao_fui", "folga"] as const);
    await env.DB.prepare("INSERT INTO attendance (user_id, date, status, source, updated_at) VALUES (?1, ?2, ?3, 'app', ?4) ON CONFLICT(user_id, date) DO UPDATE SET status = ?3, source = 'app', updated_at = ?4")
      .bind(uid, day, status, Date.now()).run();
    c.attendance = { ...c.attendance, [day]: status };
    source = "falta";
  } else {
    const a = (action === "gerar" ? { type: action, date: day, opts: opts(b.opts, c.gymIds) }
      : action === "outro" ? { type: action, date: day, geracao: geracao((typeof b.opts === "object" && b.opts && !Array.isArray(b.opts) ? b.opts : {}) as Record<string, unknown>, c.gymIds) }
      : action === "mover" || action === "trocar" ? { type: action, date: day, to: date(b.to, "to") }
      : { type: action, date: day }) as DayAction;
    const r = applyDayAction(c.latest!.stored!.plan, c.overrides, a, c);
    if ("error" in r) throw new HttpError(409, r.error);
    overrides = r.overrides;
  }
  const s = await generate(env, c, overrides, false);
  await persist(env, c, s, source, action !== "falta");
  const c2 = (await loadCtx(env, uid, c.today)) as Ctx;
  return { week: view(c2, c2.latest!.stored!, c2.latest!.version) };
}
