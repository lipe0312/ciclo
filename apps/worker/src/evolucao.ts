// #147 GET /api/evolucao?de=AAAA-MM&ate=AAAA-MM: linhas agregadas por dia de até 12 meses, só da conta que pergunta (um batch
// no D1). Todo SQL com bind e filtrado por user_id; só números e datas saem daqui (nenhum texto livre). A janela, as médias,
// a comparação e as conquistas ficam no core (`@ciclo/core/evolucao`), que o app roda sobre uma ou mais consultas.
// "Tudo" = o app pede de 12 em 12 meses até o 1º registro (`primeiro`), nunca uma consulta maior que o teto.
import { MAX_MESES, fimDoMes, mesesEntre } from "@ciclo/core/evolucao";
import type { EvolucaoRaw, PontoEvo } from "@ciclo/core/evolucao";
import type { Meal } from "@ciclo/core";
import type { Env } from "./env.ts";
import { HttpError, json, mes } from "./http.ts";
import { regrasMedias } from "./comida-medias.ts";
import type { Handler } from "./comida.ts";

const addDays = (iso: string, n: number) => new Date(Date.parse(iso + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
/** A média de cada refeição (#115) olha 28 dias para trás: a comida vem desde 27 dias antes do início. */
const JANELA_REFEICAO = 27;
const E1RM = "MAX(l.kg * (1 + l.reps / 30.0))";
const SESSAO = "FROM set_log l JOIN session s ON s.user_id = l.user_id AND s.id = l.session_id";
/** 1ª medida de cada coluna (nomes fixos daqui, nunca vindos da requisição). */
const COLUNAS_CORPO = { braco: "arm_cm", cintura: "waist_cm", ombro: "shoulder_cm" } as const;

export async function getEvolucao(env: Env, uid: string, deMes: string, ateMes: string): Promise<EvolucaoRaw> {
  const n = mesesEntre(deMes, ateMes);
  if (n < 1) throw new HttpError(400, "ate deve ser o mesmo mês de de ou depois");
  if (n > MAX_MESES) throw new HttpError(400, `no máximo ${MAX_MESES} meses por consulta`);
  const de = `${deMes}-01`, ate = fimDoMes(ateMes), comidaDe = addDays(de, -JANELA_REFEICAO);
  const q = (sql: string, ...args: unknown[]) => env.DB.prepare(sql).bind(uid, ...args);
  const [regras, r] = await Promise.all([
    regrasMedias(env, uid),
    env.DB.batch([
      q(`SELECT s.date AS date, l.muscle AS muscle, COUNT(*) AS n ${SESSAO} WHERE l.user_id = ?1 AND s.date BETWEEN ?2 AND ?3 GROUP BY s.date, l.muscle LIMIT 6000`, de, ate),
      q(`SELECT s.date AS date, l.exercise_id AS exerciseId, MAX(l.muscle) AS muscle, ${E1RM} AS e1rm ${SESSAO}
        WHERE l.user_id = ?1 AND s.date BETWEEN ?2 AND ?3 AND l.kg > 0 AND l.reps > 0 GROUP BY s.date, l.exercise_id LIMIT 8000`, de, ate),
      q("SELECT DISTINCT date FROM session WHERE user_id = ?1 AND date BETWEEN ?2 AND ?3 LIMIT 400", de, ate),
      q("SELECT date, status FROM attendance WHERE user_id = ?1 AND date BETWEEN ?2 AND ?3 LIMIT 400", de, ate),
      q("SELECT date, SUM(minutes) AS minutes FROM cardio_log WHERE user_id = ?1 AND date BETWEEN ?2 AND ?3 GROUP BY date LIMIT 400", de, ate),
      q("SELECT date, weight_kg AS kg, sleep_h AS horas FROM checkin WHERE user_id = ?1 AND date BETWEEN ?2 AND ?3 ORDER BY date LIMIT 400", de, ate),
      q("SELECT date, water_ml AS ml, alcohol_units AS doses FROM checkout WHERE user_id = ?1 AND date BETWEEN ?2 AND ?3 LIMIT 400", de, ate),
      q("SELECT date, arm_cm AS braco, waist_cm AS cintura, shoulder_cm AS ombro FROM measurement WHERE user_id = ?1 AND date BETWEEN ?2 AND ?3 ORDER BY date LIMIT 400", de, ate),
      q("SELECT date, meal, SUM(kcal) AS kcal, SUM(protein) AS prot FROM food_log WHERE user_id = ?1 AND date BETWEEN ?2 AND ?3 GROUP BY date, meal LIMIT 3000", comidaDe, ate),
      q("SELECT date, SUM(kcal) AS kcal FROM food_log WHERE user_id = ?1 AND id LIKE 'bebida-%' AND date BETWEEN ?2 AND ?3 GROUP BY date LIMIT 400", de, ate),
      q("SELECT date, meal FROM food_nao_comi WHERE user_id = ?1 AND date BETWEEN ?2 AND ?3 LIMIT 2000", comidaDe, ate),
      q(`SELECT l.exercise_id AS exerciseId, ${E1RM} AS e1rm ${SESSAO} WHERE l.user_id = ?1 AND s.date < ?2 AND l.kg > 0 AND l.reps > 0 GROUP BY l.exercise_id LIMIT 500`, de),
      // Sem UNION: o D1 limita os termos de um SELECT composto (7 tabelas davam 500 no wrangler dev).
      q(`SELECT NULLIF(MIN(COALESCE((SELECT MIN(date) FROM session WHERE user_id = ?1), '9999'),
        COALESCE((SELECT MIN(date) FROM attendance WHERE user_id = ?1), '9999'),
        COALESCE((SELECT MIN(date) FROM cardio_log WHERE user_id = ?1), '9999'),
        COALESCE((SELECT MIN(date) FROM food_log WHERE user_id = ?1), '9999'),
        COALESCE((SELECT MIN(date) FROM checkin WHERE user_id = ?1), '9999'),
        COALESCE((SELECT MIN(date) FROM checkout WHERE user_id = ?1), '9999'),
        COALESCE((SELECT MIN(date) FROM measurement WHERE user_id = ?1), '9999')), '9999') AS d`),
      q("SELECT date, weight_kg AS v FROM checkin WHERE user_id = ?1 AND weight_kg IS NOT NULL ORDER BY date LIMIT 1"),
      ...Object.values(COLUNAS_CORPO).map((c) => q(`SELECT date, ${c} AS v FROM measurement WHERE user_id = ?1 AND ${c} IS NOT NULL ORDER BY date LIMIT 1`)),
    ]),
  ]);
  const rows = <T>(i: number) => (r[i].results ?? []) as T[];
  const ponto = (i: number): PontoEvo | null => { const x = rows<{ date: string; v: number }>(i)[0]; return x ? { date: x.date, value: x.v } : null; };
  const checkin = rows<{ date: string; kg: number | null; horas: number | null }>(5), checkout = rows<{ date: string; ml: number | null; doses: number | null }>(6);
  return {
    de: deMes, ate: ateMes,
    sets: rows(0), e1rm: rows(1),
    sessoes: rows<{ date: string }>(2).map((x) => x.date),
    presenca: rows(3), cardio: rows(4),
    peso: checkin.filter((x) => x.kg != null).map((x) => ({ date: x.date, kg: x.kg! })),
    sono: checkin.filter((x) => x.horas != null).map((x) => ({ date: x.date, horas: x.horas! })),
    agua: checkout.filter((x) => x.ml != null).map((x) => ({ date: x.date, litros: x.ml! / 1000 })),
    alcool: checkout.filter((x) => x.doses != null).map((x) => ({ date: x.date, doses: x.doses! })),
    medidas: rows(7),
    refeicoes: rows<{ date: string; meal: Meal | null; kcal: number | null; prot: number | null }>(8).map((x) => ({ date: x.date, meal: x.meal, kcal: x.kcal ?? 0, prot: x.prot ?? 0 })),
    bebida: rows<{ date: string; kcal: number | null }>(9).map((x) => ({ date: x.date, kcal: x.kcal ?? 0 })),
    naoComi: rows(10),
    recordeAntes: rows(11),
    primeiro: rows<{ d: string | null }>(12)[0]?.d ?? null,
    comecoCorpo: { peso: ponto(13), braco: ponto(14), cintura: ponto(15), ombro: ponto(16) },
    regrasMedias: regras,
  };
}

export function registerEvolucao(on: (method: string, path: string, h: Handler) => void) {
  on("GET", "/api/evolucao", async (req, env, _p, u) => {
    const sp = new URL(req.url).searchParams;
    return json({ evolucao: await getEvolucao(env, u.id, mes(sp.get("de"), "de"), mes(sp.get("ate"), "ate")) });
  });
}
