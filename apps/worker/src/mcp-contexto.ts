// #45 ciclo_contexto: busca só o que a fatia do pedido precisa (todo SQL com bind e filtrado por user_id) e entrega ao core
// (contexto()), que monta a fatia enxuta. Texto livre do usuário (notas, texto de comida, contexto da dor, pedidos) não é lido.
import { MUSCLE_IDS, PEDIDOS, contexto, mondayOf, weeklyTargets } from "@ciclo/core";
import type { EstadoContexto, FoodEntry, Meal, MuscleId, Pedido } from "@ciclo/core";
import type { Env } from "./env.ts";
import { EMPTY_MSG, getProfile, listGyms, parse, weekState } from "./db.ts";
import { date, int, oneOf, str } from "./http.ts";

const addDays = (iso: string, n: number) => new Date(Date.parse(iso + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const DOW = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];

export const CONTEXTO_SCHEMA = {
  type: "object", additionalProperties: false, required: ["pedido"],
  properties: {
    pedido: { type: "string", enum: PEDIDOS, description: "trocar (aparelho ocupado/trocar exercício) · dor · tempo (só X min) · gerar (foco, compensatório, outra academia) · comida · recap · revisao" },
    date: { type: "string", description: "YYYY-MM-DD (fuso America/Sao_Paulo)" },
    exercicioId: { type: "string", description: "trocar/dor: ID do catálogo do exercício em questão" },
    gymId: { type: "string" }, minutos: { type: "integer", minimum: 15, maximum: 180 }, diasRestantes: { type: "integer", minimum: 1, maximum: 7 },
  },
};

type Args = Record<string, unknown>;
export async function ciclo_contexto(a: Args, env: Env, uid: string, today: string) {
  const pedido = oneOf(a.pedido, "pedido", PEDIDOS) as Pedido;
  const d = a.date ? date(a.date) : today;
  const exercicioId = str(a.exercicioId, "exercicioId", 80, false);
  const gymId = str(a.gymId, "gymId", 40, false);
  const minutos = int(a.minutos, "minutos", 15, 180, false), diasRestantes = int(a.diasRestantes, "diasRestantes", 1, 7, false);

  const profile = await getProfile(env, uid);
  if (!profile) return { vazio: "sem_perfil", motivo: EMPTY_MSG.sem_perfil };
  const monday = mondayOf(d);
  const precisa = { treino: pedido === "trocar" || pedido === "dor", semana: pedido !== "comida" && pedido !== "recap", comida: pedido === "comida" || pedido === "recap" || pedido === "revisao", revisao: pedido === "revisao" };

  const [gyms, week, plan, food, series, medidas] = await Promise.all([
    precisa.treino ? listGyms(env, uid) : Promise.resolve([]),
    precisa.semana ? weekState(env, uid, d) : Promise.resolve(null),
    precisa.treino ? env.DB.prepare("SELECT plan, gym_id FROM day_plan WHERE user_id = ?1 AND date = ?2").bind(uid, d).first<{ plan: string; gym_id: string | null }>() : Promise.resolve(null),
    precisa.comida ? env.DB.prepare("SELECT date, meal, kcal, protein FROM food_log WHERE user_id = ?1 AND date BETWEEN ?2 AND ?3 ORDER BY date, created_at LIMIT 400").bind(uid, addDays(d, -6), d)
      .all<{ date: string; meal: Meal | null; kcal: number | null; protein: number | null }>() : Promise.resolve(null),
    precisa.revisao ? env.DB.prepare(`SELECT s.date, l.exercise_id, l.muscle, l.kg, l.reps FROM set_log l JOIN session s ON s.user_id = l.user_id AND s.id = l.session_id
      WHERE l.user_id = ?1 AND s.date BETWEEN ?2 AND ?3 LIMIT 2000`).bind(uid, addDays(monday, -7), d)
      .all<{ date: string; exercise_id: string; muscle: MuscleId; kg: number | null; reps: number | null }>() : Promise.resolve(null),
    precisa.revisao ? env.DB.prepare("SELECT date, arm_cm, waist_cm FROM measurement WHERE user_id = ?1 AND date BETWEEN ?2 AND ?3 ORDER BY date").bind(uid, addDays(d, -60), d)
      .all<{ date: string; arm_cm: number | null; waist_cm: number | null }>() : Promise.resolve(null),
  ]);

  const wanted = gymId ?? plan?.gym_id ?? (profile.dayGym as Record<string, string> | undefined)?.[DOW[new Date(d + "T12:00:00Z").getUTCDay()]];
  const gym = gyms.find((g) => g.id === wanted) ?? gyms[0];
  const dia = plan ? parse<{ name?: string; items?: { exerciseId: string; sets: number }[] }>(plan.plan, {}) : null;
  const diet = (profile.diet ?? {}) as { kcal?: number; protein?: number };
  const e: EstadoContexto = {
    data: d, perfil: profile,
    dia: dia ? { nome: dia.name, itens: (dia.items ?? []).map((i) => ({ exerciseId: String(i.exerciseId), sets: Number(i.sets) || 0 })) } : null,
    exercicioId, aparelhos: gym?.equipment ?? [],
    dores: (week?.pains ?? []).map((p) => ({ region: p.region, intensity: p.intensity })),
    semana: week ? {
      inicio: monday, diasRestantes, minutos: minutos ?? profile.minutes,
      alvo: weeklyTargets(profile.level, profile.priorities), feito: week.done, freq: week.freq,
      presenca: { fui: (week.attendance as { status: string }[]).filter((x) => x.status === "fui").length, meta: profile.daysTarget },
      checkins: week.checkins.length,
    } : undefined,
    comida: food ? { registros: food.results.map((r): FoodEntry => ({ date: r.date, meal: r.meal, kcal: r.kcal, prot: r.protein })), metas: { kcal: diet.kcal ?? 0, protein: diet.protein ?? 0 } } : undefined,
    series: series?.results.filter((r) => MUSCLE_IDS.includes(r.muscle)).map((r) => ({ date: r.date, exerciseId: r.exercise_id, muscle: r.muscle, kg: r.kg ?? 0, reps: r.reps ?? 0 })),
    medidas: medidas?.results.map((m) => ({ date: m.date, armCm: m.arm_cm, waistCm: m.waist_cm })),
  };
  return contexto(pedido, e);
}
