// Home de evolução (#29): GET /api/home agrega as séries semanais e as lacunas de registro numa chamada só (um batch no D1).
// Todo SQL com bind e filtrado por user_id; só números e datas saem daqui (nenhum texto livre do dono). A conta fica no core (homeView).
import { HOME_SEMANAS, aparelhosSemMidia, ctxDoPerfil, homeView, semanasAte } from "@ciclo/core";
import type { HomeRaw } from "@ciclo/core";
import type { Env } from "./env.ts";
import { date } from "./http.ts";
import { getProfile, listGyms } from "./db.ts";
import type { Handler } from "./comida.ts";
import { json } from "./http.ts";

const addDays = (iso: string, n: number) => new Date(Date.parse(iso + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const diffDays = (a: string, b: string) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 864e5);
const PERIODO_REGISTRO = 28;

export async function getHome(env: Env, uid: string, createdAt: number, hoje: string) {
  const from = semanasAte(hoje, HOME_SEMANAS)[0], recente = addDays(hoje, -(PERIODO_REGISTRO - 1));
  const [profile, gyms, r] = await Promise.all([
    getProfile(env, uid), listGyms(env, uid),
    env.DB.batch([
      env.DB.prepare(`SELECT s.date AS date, l.muscle AS muscle, COUNT(*) AS n FROM set_log l JOIN session s ON s.user_id = l.user_id AND s.id = l.session_id
        WHERE l.user_id = ?1 AND s.date BETWEEN ?2 AND ?3 GROUP BY s.date, l.muscle LIMIT 1500`).bind(uid, from, hoje),
      env.DB.prepare(`SELECT s.date AS date, l.exercise_id AS exerciseId, MAX(l.kg * (1 + l.reps / 30.0)) AS e1rm FROM set_log l JOIN session s ON s.user_id = l.user_id AND s.id = l.session_id
        WHERE l.user_id = ?1 AND s.date BETWEEN ?2 AND ?3 AND l.kg > 0 AND l.reps > 0 GROUP BY s.date, l.exercise_id LIMIT 2000`).bind(uid, from, hoje),
      env.DB.prepare("SELECT DISTINCT date FROM session WHERE user_id = ?1 AND date BETWEEN ?2 AND ?3 LIMIT 400").bind(uid, from, hoje),
      env.DB.prepare("SELECT date FROM attendance WHERE user_id = ?1 AND status = 'fui' AND date BETWEEN ?2 AND ?3 LIMIT 400").bind(uid, from, hoje),
      env.DB.prepare("SELECT date, minutes FROM cardio_log WHERE user_id = ?1 AND date BETWEEN ?2 AND ?3 LIMIT 400").bind(uid, from, hoje),
      env.DB.prepare("SELECT date, weight_kg AS kg FROM checkin WHERE user_id = ?1 AND weight_kg IS NOT NULL AND date BETWEEN ?2 AND ?3 ORDER BY date LIMIT 400").bind(uid, from, hoje),
      env.DB.prepare("SELECT date, arm_cm AS braco, waist_cm AS cintura FROM measurement WHERE user_id = ?1 AND date BETWEEN ?2 AND ?3 ORDER BY date LIMIT 60").bind(uid, from, hoje),
      env.DB.prepare("SELECT date, SUM(kcal) AS kcal, SUM(protein) AS prot FROM food_log WHERE user_id = ?1 AND date BETWEEN ?2 AND ?3 GROUP BY date LIMIT 60").bind(uid, recente, hoje),
      env.DB.prepare("SELECT date FROM checkin WHERE user_id = ?1 AND date BETWEEN ?2 AND ?3 LIMIT 60").bind(uid, recente, hoje),
      env.DB.prepare("SELECT date FROM checkout WHERE user_id = ?1 AND date BETWEEN ?2 AND ?3 LIMIT 60").bind(uid, recente, hoje),
      env.DB.prepare("SELECT MAX(date) AS d FROM measurement WHERE user_id = ?1 AND (arm_cm IS NOT NULL OR waist_cm IS NOT NULL) AND date <= ?2").bind(uid, hoje),
      env.DB.prepare("SELECT MAX(date) AS d FROM checkin WHERE user_id = ?1 AND weight_kg IS NOT NULL AND date <= ?2").bind(uid, hoje),
      env.DB.prepare("SELECT gym_id AS gymId, equipment_id AS equipmentId FROM media WHERE user_id = ?1 AND deleted_at IS NULL AND gym_id IS NOT NULL AND equipment_id IS NOT NULL LIMIT 500").bind(uid),
    ]),
  ]);
  const rows = <T>(i: number) => r[i].results as T[];
  const raw: HomeRaw = {
    sets: rows<{ date: string; muscle: string; n: number }>(0),
    e1rm: rows<{ date: string; exerciseId: string; e1rm: number }>(1),
    sessoes: rows<{ date: string }>(2).map((x) => x.date),
    presenca: rows<{ date: string }>(3).map((x) => x.date),
    cardio: rows<{ date: string; minutes: number }>(4),
    pesos: rows<{ date: string; kg: number }>(5),
    medidas: rows<{ date: string; braco: number | null; cintura: number | null }>(6),
    comida: rows<{ date: string; kcal: number | null; prot: number | null }>(7).map((x) => ({ date: x.date, kcal: x.kcal ?? 0, prot: x.prot ?? 0 })),
    checkins: rows<{ date: string }>(8).map((x) => x.date),
    checkouts: rows<{ date: string }>(9).map((x) => x.date),
    ultimaMedida: rows<{ d: string | null }>(10)[0]?.d ?? null,
    ultimoPeso: rows<{ d: string | null }>(11)[0]?.d ?? null,
  };
  const ctx = ctxDoPerfil(profile);
  const criada = new Date(createdAt).toISOString().slice(0, 10);
  const diasDevidos = Math.max(1, Math.min(7, diffDays(criada, hoje) + 1));
  return homeView(raw, { ...ctx, hoje, diasDevidos, aparelhosSemMidia: aparelhosSemMidia(gyms, rows<{ gymId: string; equipmentId: string }>(12), ctx.prioridades) });
}

export function registerHome(on: (method: string, path: string, h: Handler) => void) {
  on("GET", "/api/home", async (req, env, _p, u) => json({ home: await getHome(env, u.id, u.createdAt, date(new URL(req.url).searchParams.get("date"))) }));
}
