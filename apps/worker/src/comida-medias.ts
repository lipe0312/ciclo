// #115 Médias de comida com refeições não registradas: as regras da pessoa (Comida > Configurações de métricas) e as marcas
// de "não comi". A conta é do core (diaComMedias/foodAverages); aqui só leitura e gravação. Todo SQL com bind e filtrado
// por user_id; entrada validada (core lerRegrasMedias + http.ts). Nada de dado da pessoa em log.
import { MEALS, dentroDoLimite } from "@ciclo/core";
import type { FoodEntry, Meal } from "@ciclo/core";
import { JANELA_MEDIA_REFEICAO, lerRegrasMedias, mediasPorRefeicao, regrasMediasDe } from "@ciclo/core/comida-medias";
import type { ContextoMedias, NaoComi, RegrasMedias } from "@ciclo/core/comida-medias";
import type { Env } from "./env.ts";
import { HttpError, date, oneOf } from "./http.ts";
import { addDays, horaSP, today } from "./mcp-tipos.ts";

export async function regrasMedias(env: Env, uid: string): Promise<RegrasMedias> {
  const r = await env.DB.prepare("SELECT comida_medias AS v FROM ui_pref WHERE user_id = ?1").bind(uid).first<{ v: string | null }>();
  let o: unknown = null;
  try { o = r?.v ? JSON.parse(r.v) : null; } catch { /* fica o padrão */ }
  return regrasMediasDe(o);
}

/** Muda só o que veio (completar por refeição e/ou diaVazio). Tipo ou valor errado → 400 com o campo. */
export async function salvarRegrasMedias(env: Env, uid: string, body: unknown, now = Date.now()): Promise<RegrasMedias> {
  const r = lerRegrasMedias(body, await regrasMedias(env, uid));
  if (!r.ok) throw new HttpError(400, r.erro);
  await env.DB.prepare(`INSERT INTO ui_pref (user_id, comida_medias, updated_at) VALUES (?1, ?2, ?3)
    ON CONFLICT(user_id) DO UPDATE SET comida_medias = excluded.comida_medias, updated_at = excluded.updated_at`).bind(uid, JSON.stringify(r.regras), now).run();
  return r.regras;
}

export async function naoComiDe(env: Env, uid: string, from: string, to: string): Promise<NaoComi[]> {
  const { results } = await env.DB.prepare("SELECT date, meal FROM food_nao_comi WHERE user_id = ?1 AND date BETWEEN ?2 AND ?3 ORDER BY date, meal LIMIT 400")
    .bind(uid, from, to).all<{ date: string; meal: Meal }>();
  return results.map((r) => ({ date: r.date, meal: r.meal }));
}

/** Data e refeição validadas: até 30 dias atrás, nunca no futuro (o mesmo limite do registro). */
export function naoComiIn(d: unknown, m: unknown, campo = ""): NaoComi {
  const data = date(d, `${campo}date`), meal = oneOf(m, `${campo}meal`, MEALS);
  if (!dentroDoLimite(data, today())) throw new HttpError(400, `${campo}date: de até 30 dias atrás até hoje`);
  return { date: data, meal };
}
export const marcarNaoComi = (env: Env, uid: string, n: NaoComi, via: "mcp" | null = null, now = Date.now()) =>
  env.DB.prepare("INSERT INTO food_nao_comi (user_id, date, meal, via, created_at) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(user_id, date, meal) DO NOTHING")
    .bind(uid, n.date, n.meal, via, now);
export const desmarcarNaoComi = (env: Env, uid: string, n: NaoComi) =>
  env.DB.prepare("DELETE FROM food_nao_comi WHERE user_id = ?1 AND date = ?2 AND meal = ?3").bind(uid, n.date, n.meal);

/** Tudo o que o core precisa para a conta de um dia/semana até `d`: regras, "não comi" e a média de cada refeição (28 dias). */
export async function contextoMedias(env: Env, uid: string, d: string): Promise<{ ctx: ContextoMedias; historico: FoodEntry[] }> {
  const from = addDays(d, -(JANELA_MEDIA_REFEICAO - 1));
  const [regras, naoComi, food] = await Promise.all([
    regrasMedias(env, uid), naoComiDe(env, uid, from, d),
    env.DB.prepare("SELECT date, meal, kcal, protein FROM food_log WHERE user_id = ?1 AND date BETWEEN ?2 AND ?3 LIMIT 1500").bind(uid, from, d)
      .all<{ date: string; meal: Meal | null; kcal: number | null; protein: number | null }>(),
  ]);
  const historico: FoodEntry[] = food.results.map((f) => ({ date: f.date, meal: f.meal, kcal: f.kcal, prot: f.protein }));
  return { ctx: { regras, naoComi, medias: mediasPorRefeicao(historico, d), agora: { date: today(), hora: horaSP() } }, historico };
}
