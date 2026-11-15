// Home de evolução (#29): GET /api/home agrega as séries semanais e as lacunas de registro numa chamada só (um batch no D1).
// Todo SQL com bind e filtrado por user_id; só números e datas saem daqui (nenhum texto livre do dono). A conta fica no core (homeView).
// #73: + água/sono (28 dias), os marcos do caminho de evolução e o estado do cartão de boas-vindas (prazo pela data do servidor).
import { HOME_SEMANAS, aparelhosSemMidia, ctxDoPerfil, dataSP, estadoCheckup, faltaParaGerar, homeView, semanasAte } from "@ciclo/core";
import type { HomeRaw } from "@ciclo/core";
import type { AuthUser, Env } from "./env.ts";
import { HttpError, date, json, oneOf, readJson } from "./http.ts";
import { getProfile, listGyms } from "./db.ts";
import type { Handler } from "./comida.ts";

const addDays = (iso: string, n: number) => new Date(Date.parse(iso + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const diffDays = (a: string, b: string) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 864e5);
const PERIODO_REGISTRO = 28;

/** Com uma série registrada (sessão vazia não conta como 1º treino). */
const COM_SERIE = "EXISTS (SELECT 1 FROM set_log l WHERE l.user_id = s.user_id AND l.session_id = s.id)";

export async function getHome(env: Env, u: Pick<AuthUser, "id" | "createdAt" | "onboardingDoneAt">, hoje: string) {
  const uid = u.id, createdAt = u.createdAt;
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
      // #73 (13 em diante)
      env.DB.prepare("SELECT date, water_ml AS ml FROM checkout WHERE user_id = ?1 AND water_ml IS NOT NULL AND date BETWEEN ?2 AND ?3 LIMIT 60").bind(uid, recente, hoje),
      env.DB.prepare("SELECT date, sleep_h AS horas FROM checkin WHERE user_id = ?1 AND sleep_h IS NOT NULL AND date BETWEEN ?2 AND ?3 LIMIT 60").bind(uid, recente, hoje),
      env.DB.prepare(`SELECT MIN(s.date) AS d FROM session s WHERE s.user_id = ?1 AND ${COM_SERIE}`).bind(uid),
      env.DB.prepare(`SELECT DISTINCT s.date AS date FROM session s WHERE s.user_id = ?1 AND s.date <= ?2 AND ${COM_SERIE} ORDER BY s.date DESC LIMIT 400`).bind(uid, hoje),
      env.DB.prepare("SELECT MIN(date) AS d FROM measurement WHERE user_id = ?1 AND (arm_cm IS NOT NULL OR waist_cm IS NOT NULL)").bind(uid),
      env.DB.prepare("SELECT DISTINCT date FROM food_log WHERE user_id = ?1 ORDER BY date LIMIT 7").bind(uid),
      env.DB.prepare("SELECT MIN(created_at) AS t FROM week_plan WHERE user_id = ?1").bind(uid),
      env.DB.prepare("SELECT boas_vindas_dispensado_em AS bv, perfil_adiado_em AS pa FROM ui_pref WHERE user_id = ?1").bind(uid),
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
  const pref = rows<{ bv: string | null; pa: string | null }>(20)[0];
  const feitoEm = dataSP(u.onboardingDoneAt);
  const checkupFeito = estadoCheckup(u.onboardingDoneAt != null, (profile as Record<string, any> | null)?.meta) === "feito";
  Object.assign(raw, {
    agua: rows<{ date: string; ml: number }>(13).map((x) => ({ date: x.date, litros: x.ml / 1000 })),
    sono: rows<{ date: string; horas: number }>(14),
    checkupEm: checkupFeito ? feitoEm : null,
    primeiroTreinoEm: rows<{ d: string | null }>(15)[0]?.d ?? null,
    diasTreino: rows<{ date: string }>(16).map((x) => x.date),
    primeiraMedidaEm: rows<{ d: string | null }>(17)[0]?.d ?? null,
    diasComida: rows<{ date: string }>(18).map((x) => x.date),
    semanaEm: dataSP(rows<{ t: number | null }>(19)[0]?.t ?? null),
    contaEm: dataSP(createdAt),
    perfilEm: feitoEm && profile && (checkupFeito || !faltaParaGerar(profile).length) ? feitoEm : null,
    boasVindasDispensadoEm: pref?.bv ?? null, perfilAdiadoEm: pref?.pa ?? null,
  } satisfies Partial<HomeRaw>);
  const ctx = ctxDoPerfil(profile);
  const criada = new Date(createdAt).toISOString().slice(0, 10);
  const diasDevidos = Math.max(1, Math.min(7, diffDays(criada, hoje) + 1));
  return homeView(raw, { ...ctx, hoje, hojeServidor: dataSP(Date.now())!, diasDevidos, aparelhosSemMidia: aparelhosSemMidia(gyms, rows<{ gymId: string; equipmentId: string }>(12), ctx.prioridades) });
}

/** #73 PATCH /api/home/preferencias: { boasVindas: "dispensar" } e/ou { perfil: "adiar" }. A data é a do servidor. */
export async function salvarPreferencias(env: Env, uid: string, body: Record<string, unknown>, agora = Date.now()) {
  const bv = body.boasVindas == null ? null : oneOf(body.boasVindas, "boasVindas", ["dispensar"] as const);
  const pa = body.perfil == null ? null : oneOf(body.perfil, "perfil", ["adiar"] as const);
  if (!bv && !pa) throw new HttpError(400, "diga boasVindas ou perfil");
  const hoje = dataSP(agora)!;
  // dispensar é para sempre: a 1ª data fica (COALESCE); adiar o perfil recomeça os 7 dias
  await env.DB.prepare(`INSERT INTO ui_pref (user_id, boas_vindas_dispensado_em, perfil_adiado_em, updated_at) VALUES (?1, ?2, ?3, ?4)
    ON CONFLICT(user_id) DO UPDATE SET boas_vindas_dispensado_em = COALESCE(ui_pref.boas_vindas_dispensado_em, excluded.boas_vindas_dispensado_em),
      perfil_adiado_em = COALESCE(excluded.perfil_adiado_em, ui_pref.perfil_adiado_em), updated_at = excluded.updated_at`)
    .bind(uid, bv ? hoje : null, pa ? hoje : null, agora).run();
  const r = await env.DB.prepare("SELECT boas_vindas_dispensado_em AS bv, perfil_adiado_em AS pa FROM ui_pref WHERE user_id = ?1").bind(uid).first<{ bv: string | null; pa: string | null }>();
  return { boasVindasDispensadoEm: r?.bv ?? null, perfilAdiadoEm: r?.pa ?? null };
}

export function registerHome(on: (method: string, path: string, h: Handler) => void) {
  on("GET", "/api/home", async (req, env, _p, u) => json({ home: await getHome(env, u, date(new URL(req.url).searchParams.get("date"))) }));
  on("PATCH", "/api/home/preferencias", async (req, env, _p, u) => json({ ok: true, ...(await salvarPreferencias(env, u.id, await readJson<Record<string, unknown>>(req, 1024))) }));
}
