// Diário (#27): checkout da noite, resumo dos dias sem abrir, lembrete e exames. SQL só com bind e SEMPRE por user_id.
// Regras no core (@ciclo/core: diario.ts); aqui só formato (http.ts) e banco. Dado de saúde nunca vai para log.
import { CARDIO_BY_ID, EXAM_MAX_TEXT, absenceGap, checkExamSummary, checkoutCardioEntry, examExpiresAt, healthMaintenance, healthText, healthWeek, mondayOf, weekDates } from "@ciclo/core";
import type { CheckoutLite } from "@ciclo/core";
import type { Env } from "./env.ts";
import { HttpError, date, id, int, oneOf, str } from "./http.ts";
import { parse } from "./db.ts";

const INTENS = ["zona2", "moderado", "intervalado"] as const;
const SOURCES = ["app", "resumo", "claude"] as const;
export type CheckoutSource = (typeof SOURCES)[number];

/** booleano opcional → 0/1/null (a validação de formato do http.ts não tem bool). */
function bool(v: unknown, field: string): 0 | 1 | null {
  if (v == null) return null;
  if (typeof v !== "boolean") throw new HttpError(400, `${field} deve ser true|false`);
  return v ? 1 : 0;
}
const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);

// ---------- checkout ----------
interface CheckoutRow { date: string; trained: number | null; cardio_json: string | null; water_ml: number | null; alcohol_units: number | null; smoke: number | null; smoke_qty: number | null; caffeine_late: number | null; mood: number | null; sleep_ok: number | null; note: string | null; source: string; updated_at: number }
const b01 = (v: number | null) => (v == null ? null : v === 1);
export const checkoutOut = (r: CheckoutRow) => ({
  date: r.date, trained: b01(r.trained), cardio: parse<Record<string, unknown> | null>(r.cardio_json, null), waterMl: r.water_ml, alcohol: r.alcohol_units,
  smoke: b01(r.smoke), smokeQty: r.smoke_qty, caffeineLate: b01(r.caffeine_late), mood: r.mood, sleptWell: b01(r.sleep_ok), note: r.note, source: r.source, updatedAt: r.updated_at,
});
const lite = (r: CheckoutRow): CheckoutLite => {
  const c = parse<{ minutes?: number; steps?: number } | null>(r.cardio_json, null);
  return { date: r.date, alcohol: r.alcohol_units, smoke: b01(r.smoke), smokeQty: r.smoke_qty, caffeineLate: b01(r.caffeine_late), waterMl: r.water_ml, cardioMin: c?.minutes ?? null, steps: c?.steps ?? null, mood: r.mood };
};
const CO_COLS = "date, trained, cardio_json, water_ml, alcohol_units, smoke, smoke_qty, caffeine_late, mood, sleep_ok, note, source, updated_at";

function parseCardio(v: unknown) {
  if (v == null) return null;
  if (typeof v !== "object" || Array.isArray(v)) throw new HttpError(400, "cardio inválido");
  const c = v as Record<string, unknown>;
  const type = c.type == null || c.type === "" ? null : oneOf(c.type, "cardio.type", Object.keys(CARDIO_BY_ID));
  const minutes = int(c.minutes, "cardio.minutes", 1, 300, false), steps = int(c.steps, "cardio.steps", 0, 100000, false);
  const intensity = c.intensity == null ? null : oneOf(c.intensity, "cardio.intensity", INTENS);
  if (minutes != null && !type) throw new HttpError(400, "cardio.type obrigatório com minutos");
  if (type && minutes == null) throw new HttpError(400, "cardio.minutes obrigatório com o tipo");
  if (!type && steps == null) return null;
  return { ...(type ? { type, minutes, ...(intensity ? { intensity } : {}) } : {}), ...(steps != null ? { steps } : {}) };
}

/** Grava o checkout do dia (substitui) e sincroniza o cardio "ck-<date>" do resumo da semana. */
export async function putCheckout(env: Env, uid: string, d: string, b: Record<string, unknown>, source: CheckoutSource = "app") {
  const smoke = bool(b.smoke, "smoke");
  const cardio = parseCardio(b.cardio);
  const vals = [
    bool(b.trained, "trained"), cardio ? JSON.stringify(cardio) : null, int(b.waterMl, "waterMl", 0, 10000, false), int(b.alcohol, "alcohol", 0, 30, false),
    smoke, smoke ? int(b.smokeQty, "smokeQty", 1, 100, false) : null, bool(b.caffeineLate, "caffeineLate"), int(b.mood, "mood", 1, 5, false),
    bool(b.sleptWell, "sleptWell"), str(b.note, "note", 1000, false),
  ];
  const now = Date.now(), entry = checkoutCardioEntry(d, cardio as never);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO checkout (user_id, date, trained, cardio_json, water_ml, alcohol_units, smoke, smoke_qty, caffeine_late, mood, sleep_ok, note, source, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
      ON CONFLICT(user_id, date) DO UPDATE SET trained=?3, cardio_json=?4, water_ml=?5, alcohol_units=?6, smoke=?7, smoke_qty=?8, caffeine_late=?9, mood=?10, sleep_ok=?11, note=?12, source=?13, updated_at=?14`)
      .bind(uid, d, ...vals, source, now),
    entry
      ? env.DB.prepare(`INSERT INTO cardio_log (user_id, id, date, type, minutes, intensity, distance_km, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, ?7)
          ON CONFLICT(user_id, id) DO UPDATE SET type=?4, minutes=?5, intensity=?6`).bind(uid, entry.id, d, entry.type, entry.minutes, entry.intensity, now)
      : env.DB.prepare("DELETE FROM cardio_log WHERE user_id = ?1 AND id = ?2").bind(uid, `ck-${d}`),
  ]);
  return { ok: true, cardio: entry };
}

/** Resumo dos dias sem abrir (formulário único ou relato ao Claude): completa o que faltava, sem apagar o que já existe. */
export async function saveDaysSummary(env: Env, uid: string, input: unknown, source: "resumo" | "claude") {
  if (!Array.isArray(input) || !input.length || input.length > 14) throw new HttpError(400, "dias: de 1 a 14");
  const now = Date.now(), seen = new Set<string>();
  const st = input.flatMap((x, i) => {
    const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
    const d = date(o.date, `dias[${i}].date`);
    if (seen.has(d)) throw new HttpError(400, `dias[${i}].date repetida`); seen.add(d);
    const trained = bool(o.trained, `dias[${i}].trained`);
    // Formulário do próprio dono ('resumo'): o que ele marcou vale. Relato via Claude: SÓ completa o que falta
    // (COALESCE(coluna, novo)) e nunca troca nota, álcool nem a origem de um registro que já existe.
    const upd = source === "claude"
      ? "trained = COALESCE(trained, ?3), alcohol_units = COALESCE(alcohol_units, ?4), sleep_ok = COALESCE(sleep_ok, ?5), note = COALESCE(note, ?6)"
      : "trained = COALESCE(?3, trained), alcohol_units = COALESCE(?4, alcohol_units), sleep_ok = COALESCE(?5, sleep_ok), note = COALESCE(?6, note)";
    const q = [env.DB.prepare(`INSERT INTO checkout (user_id, date, trained, alcohol_units, sleep_ok, note, source, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
      ON CONFLICT(user_id, date) DO UPDATE SET ${upd}, updated_at = ?8`) // upd é constante do código, não do usuário
      .bind(uid, d, trained, int(o.alcohol, `dias[${i}].alcohol`, 0, 30, false), bool(o.sleptWell, `dias[${i}].sleptWell`), str(o.note, `dias[${i}].note`, 500, false), source, now)];
    // "foi treinar?" também vira presença, sem sobrescrever o que o app já marcou (ex.: iniciou = foi)
    if (trained != null) q.push(env.DB.prepare("INSERT INTO attendance (user_id, date, status, source, updated_at) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(user_id, date) DO NOTHING")
      .bind(uid, d, trained ? "fui" : "nao_fui", source, now));
    return q;
  });
  st.push(env.DB.prepare("UPDATE reminder_state SET absence_from = NULL, absence_to = NULL, updated_at = ?2 WHERE user_id = ?1").bind(uid, now));
  await env.DB.batch(st);
  return { ok: true, dias: [...seen].sort() };
}

// ---------- lembrete ----------
interface ReminderRow { last_open: string | null; snoozed_on: string | null; absence_days: number; absence_from: string | null; absence_to: string | null }
const reminderOut = (r: ReminderRow | null) => ({
  lastOpen: r?.last_open ?? null, snoozedOn: r?.snoozed_on ?? null, absenceDays: r?.absence_days ?? 2,
  absence: r?.absence_from && r.absence_to ? { from: r.absence_from, to: r.absence_to } : null,
});
const getReminder = (env: Env, uid: string) =>
  env.DB.prepare("SELECT last_open, snoozed_on, absence_days, absence_from, absence_to FROM reminder_state WHERE user_id = ?1").bind(uid).first<ReminderRow>();

/** Abriu o app hoje: calcula os dias sem abrir (core) e, se passou de X, guarda o intervalo para o resumo único. */
export async function openDiary(env: Env, uid: string, today: string) {
  const r = await getReminder(env, uid);
  const gap = absenceGap(r?.last_open ?? null, today, r?.absence_days ?? 2);
  let from = r?.absence_from ?? null, to = r?.absence_to ?? null;
  if (gap.ask) {
    const a = gap.missing[0], b = gap.missing[gap.missing.length - 1];
    from = from && from < a ? from : a; to = to && to > b ? to : b;
  }
  await env.DB.prepare(`INSERT INTO reminder_state (user_id, last_open, absence_from, absence_to, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)
    ON CONFLICT(user_id) DO UPDATE SET last_open = CASE WHEN last_open IS NULL OR last_open < ?2 THEN ?2 ELSE last_open END, absence_from = ?3, absence_to = ?4, updated_at = ?5`)
    .bind(uid, today, from, to, Date.now()).run();
  return reminderOut(await getReminder(env, uid));
}

/** "Mais tarde" (1× no dia), X dias sem abrir e dispensar o resumo pendente. */
export async function setReminder(env: Env, uid: string, b: Record<string, unknown>) {
  const snooze = b.snoozedOn == null ? null : date(b.snoozedOn, "snoozedOn");
  const x = int(b.absenceDays, "absenceDays", 1, 14, false);
  const dismiss = b.dismissAbsence === true;
  await env.DB.prepare(`INSERT INTO reminder_state (user_id, snoozed_on, absence_days, updated_at) VALUES (?1, ?2, COALESCE(?3, 2), ?5)
    ON CONFLICT(user_id) DO UPDATE SET snoozed_on = COALESCE(?2, snoozed_on), absence_days = COALESCE(?3, absence_days),
      absence_from = CASE WHEN ?4 = 1 THEN NULL ELSE absence_from END, absence_to = CASE WHEN ?4 = 1 THEN NULL ELSE absence_to END, updated_at = ?5`)
    .bind(uid, snooze, x, dismiss ? 1 : 0, Date.now()).run();
  return reminderOut(await getReminder(env, uid));
}

// ---------- leitura ----------
/** Check-ins, checkouts, lembrete e exames de um intervalo (calendário de 7/30 dias, até 62). */
export async function getDiary(env: Env, uid: string, from: string, to: string) {
  if (from > to || days(from, to) > 62) throw new HttpError(400, "intervalo de até 62 dias");
  await purgeExpiredExams(env, Date.now(), uid);
  const [ci, co, rem, ex] = await env.DB.batch([
    env.DB.prepare("SELECT date, sleep_h, energy, soreness, stress, food, weight_kg FROM checkin WHERE user_id = ?1 AND date BETWEEN ?2 AND ?3 ORDER BY date").bind(uid, from, to),
    env.DB.prepare(`SELECT ${CO_COLS} FROM checkout WHERE user_id = ?1 AND date BETWEEN ?2 AND ?3 ORDER BY date`).bind(uid, from, to),
    env.DB.prepare("SELECT last_open, snoozed_on, absence_days, absence_from, absence_to FROM reminder_state WHERE user_id = ?1").bind(uid),
    env.DB.prepare("SELECT id, label, created_at, expires_at, analyzed_at, status, summary_json, raw_text IS NOT NULL AS has_text FROM health_exam WHERE user_id = ?1 ORDER BY created_at DESC LIMIT 30").bind(uid),
  ]);
  return {
    checkins: (ci.results as { date: string; sleep_h: number; energy: number; soreness: number; stress: number; food: number; weight_kg: number | null }[])
      .map((c) => ({ date: c.date, sleepH: c.sleep_h, energy: c.energy, soreness: c.soreness, stress: c.stress, food: c.food, weightKg: c.weight_kg })),
    checkouts: (co.results as CheckoutRow[]).map(checkoutOut),
    reminder: reminderOut((rem.results[0] as ReminderRow | undefined) ?? null),
    exams: (ex.results as { id: string; label: string; created_at: number; expires_at: number; analyzed_at: number | null; status: string; summary_json: string | null; has_text: number }[])
      .map((e) => ({ id: e.id, label: e.label, createdAt: e.created_at, expiresAt: e.expires_at, analyzedAt: e.analyzed_at, status: e.status, summary: parse(e.summary_json, null), hasText: !!e.has_text })),
  };
}

/** Saúde da semana (core) para o resumo de contexto do Claude (ciclo_estado / ciclo_diario) e a revisão. */
export async function healthOfWeek(env: Env, uid: string, anyDate: string) {
  const dates = weekDates(mondayOf(anyDate));
  const [ci, co, ca] = await env.DB.batch([
    env.DB.prepare("SELECT date, sleep_h FROM checkin WHERE user_id = ?1 AND date BETWEEN ?2 AND ?3").bind(uid, dates[0], dates[6]),
    env.DB.prepare(`SELECT ${CO_COLS} FROM checkout WHERE user_id = ?1 AND date BETWEEN ?2 AND ?3`).bind(uid, dates[0], dates[6]),
    env.DB.prepare("SELECT COALESCE(SUM(minutes), 0) AS m FROM cardio_log WHERE user_id = ?1 AND date BETWEEN ?2 AND ?3").bind(uid, dates[0], dates[6]),
  ]);
  const hw = healthWeek(dates, (ci.results as { date: string; sleep_h: number }[]).map((c) => ({ date: c.date, sleepH: c.sleep_h })), (co.results as CheckoutRow[]).map(lite), (ca.results[0] as { m: number }).m);
  const m = healthMaintenance(hw);
  return { semana: dates[0], medias: hw, manutencao: m, texto: healthText(hw, m) };
}

export async function checkoutsBetween(env: Env, uid: string, from: string, to: string) {
  const { results } = await env.DB.prepare(`SELECT ${CO_COLS} FROM checkout WHERE user_id = ?1 AND date BETWEEN ?2 AND ?3 ORDER BY date`).bind(uid, from, to).all<CheckoutRow>();
  return results.map(checkoutOut);
}

// ---------- exames ----------
const MAX_PENDING_EXAMS = 5;
/** Texto do laudo (extraído no aparelho ou colado) → pendente de análise do Claude, com prazo de 7 dias. */
export async function createExam(env: Env, uid: string, b: Record<string, unknown>) {
  const text = (str(b.text, "text", EXAM_MAX_TEXT) ?? "").trim();
  if (!text) throw new HttpError(400, "text obrigatório");
  const label = (str(b.label, "label", 80, false) ?? "").trim() || "Exame";
  const pend = await env.DB.prepare("SELECT COUNT(*) AS n FROM health_exam WHERE user_id = ?1 AND status = 'pendente' AND raw_text IS NOT NULL").bind(uid).first<{ n: number }>();
  if ((pend?.n ?? 0) >= MAX_PENDING_EXAMS) throw new HttpError(409, `até ${MAX_PENDING_EXAMS} exames aguardando análise`);
  const eid = id(), now = Date.now();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO health_exam (user_id, id, label, created_at, raw_text, expires_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)").bind(uid, eid, label, now, text, examExpiresAt(now)),
    // a caixa só avisa que há exame; o texto fica em health_exam (ciclo_exame_pendente)
    env.DB.prepare("INSERT INTO inbox (user_id, id, created_at, text, action, tier) VALUES (?1, ?2, ?3, ?4, 'analisar_exame', 'sonnet')")
      .bind(uid, id(), now, "Exame novo para analisar: use ciclo_exame_pendente e conclua com ciclo_exame_concluir."),
  ]);
  return { id: eid, expiresAt: examExpiresAt(now) };
}

/** Apaga o texto bruto vencido (7 dias sem análise). Cron: todas as contas; leitura: só a conta. */
export async function purgeExpiredExams(env: Env, now = Date.now(), uid: string | null = null) {
  return env.DB.prepare(`UPDATE health_exam SET raw_text = NULL, status = CASE WHEN status = 'pendente' THEN 'expirado' ELSE status END
    WHERE raw_text IS NOT NULL AND expires_at <= ?1 AND (?2 IS NULL OR user_id = ?2)`).bind(now, uid).run();
}

/** Só leitura (a purga fica no cron e no GET /api/diario): o vencido já fica de fora pelo expires_at. 1 exame por chamada. */
export async function pendingExam(env: Env, uid: string, now = Date.now()) {
  const [one, count] = await env.DB.batch([
    env.DB.prepare("SELECT id, label, created_at, expires_at, raw_text FROM health_exam WHERE user_id = ?1 AND status = 'pendente' AND raw_text IS NOT NULL AND expires_at > ?2 ORDER BY created_at LIMIT 1").bind(uid, now),
    env.DB.prepare("SELECT COUNT(*) AS n FROM health_exam WHERE user_id = ?1 AND status = 'pendente' AND raw_text IS NOT NULL AND expires_at > ?2").bind(uid, now),
  ]);
  const e = one.results[0] as { id: string; label: string; created_at: number; expires_at: number; raw_text: string } | undefined;
  const n = (count.results[0] as { n: number }).n;
  return {
    exame: e ? { id: e.id, rotulo: e.label, enviadoEm: new Date(e.created_at).toISOString().slice(0, 10), expiraEm: new Date(e.expires_at).toISOString().slice(0, 10), texto: e.raw_text } : null,
    depoisDeste: Math.max(0, n - 1),
  };
}

/** Salva o resumo estruturado (validado no core) e apaga o texto bruto na mesma escrita. */
export async function concludeExam(env: Env, uid: string, eid: unknown, resumo: unknown) {
  const exId = str(eid, "id", 60)!;
  const r = checkExamSummary(resumo);
  if (!r.ok) throw new HttpError(400, r.errors.join("; "));
  const u = await env.DB.prepare("UPDATE health_exam SET summary_json = ?3, raw_text = NULL, analyzed_at = ?4, status = 'analisado' WHERE user_id = ?1 AND id = ?2 AND status = 'pendente' AND raw_text IS NOT NULL")
    .bind(uid, exId, JSON.stringify(r.value), Date.now()).run();
  if (!u.meta.changes) throw new HttpError(404, "exame não encontrado, já analisado ou vencido");
  return { ok: true, textoApagado: true, resumo: r.value };
}

export async function deleteExam(env: Env, uid: string, eid: string) {
  const r = await env.DB.prepare("DELETE FROM health_exam WHERE user_id = ?1 AND id = ?2").bind(uid, eid).run();
  if (!r.meta.changes) throw new HttpError(404, "exame não encontrado");
  return { ok: true };
}

