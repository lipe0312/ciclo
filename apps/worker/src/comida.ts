// Comida 2.0 (#28): registros (editar/apagar), refeições salvas, calorias adaptativas e transcrição de voz.
// Todo SQL com bind e filtrado por user_id; entrada validada com http.ts. Nada de texto do usuário em log.
import { MEALS, PACES, adaptiveTarget, estimateFood } from "@ciclo/core";
import type { Meal, Pace } from "@ciclo/core";
import type { AuthUser, Env } from "./env.ts";
import { HttpError, date, id, json, num, oneOf, readJson, str } from "./http.ts";
import { getProfile, saveProfile } from "./db.ts";

export type Handler = (req: Request, env: Env, p: Record<string, string>, u: AuthUser) => Promise<Response>;
export const MAX_AUDIO = 4 * 1024 * 1024;
const MAX_TEMPLATES = 20;
const WINDOW_DAYS = 62;

const addDays = (iso: string, n: number) => new Date(Date.parse(iso + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const diffDays = (a: string, b: string) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 864e5);
const mealOrNull = (v: unknown): Meal | null => (v == null || v === "" ? null : oneOf(v, "meal", MEALS));

interface FoodRow { id: string; date: string; raw_text: string; meal: Meal | null; kcal: number | null; protein: number | null; kcal_est: number | null; protein_est: number | null; source: "local" | "claude"; confidence: string | null; created_at: number }
export const foodOut = (r: FoodRow) => ({ id: r.id, date: r.date, text: r.raw_text, meal: r.meal, kcal: r.kcal, prot: r.protein, kcalEst: r.kcal_est, protEst: r.protein_est, source: r.source, confidence: r.confidence, createdAt: r.created_at });
export const FOOD_COLS = "id, date, raw_text, meal, kcal, protein, kcal_est, protein_est, source, confidence, created_at";

/** Lê o corpo com teto de bytes, mesmo sem Content-Length (chunked). */
async function readLimited(req: Request, max: number): Promise<Uint8Array> {
  const reader = req.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) { await reader.cancel().catch(() => {}); throw new HttpError(413, "áudio grande demais (máx. 4 MB, ~2 min)", "audio_grande"); }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.byteLength; }
  return out;
}

export function registerComida(on: (method: string, path: string, h: Handler) => void) {
  // ---- registros ----
  on("GET", "/api/food", async (req, env, _p, u) => {
    const q = new URL(req.url).searchParams;
    const from = date(q.get("from"), "from"), to = date(q.get("to"), "to");
    if (to < from || diffDays(from, to) > WINDOW_DAYS) throw new HttpError(400, `período inválido (máx. ${WINDOW_DAYS} dias)`);
    const { results } = await env.DB.prepare(`SELECT ${FOOD_COLS} FROM food_log WHERE user_id = ?1 AND date BETWEEN ?2 AND ?3 ORDER BY date, created_at LIMIT 600`)
      .bind(u.id, from, to).all<FoodRow>();
    return json({ entries: results.map(foodOut) });
  });

  on("POST", "/api/food", async (req, env, _p, u) => {
    const b = await readJson<Record<string, unknown>>(req);
    const fid = id(), text = str(b.text, "text", 2000)!, d = date(b.date), meal = mealOrNull(b.meal);
    const given = { kcal: num(b.kcal, "kcal", 0, 20000, false), prot: num(b.protein, "protein", 0, 1000, false) };
    const est = estimateFood(text);
    const kcal = given.kcal ?? (est.kcal || null), prot = given.prot ?? (est.prot || null);
    await env.DB.batch([
      env.DB.prepare("INSERT INTO food_log (user_id, id, date, raw_text, meal, kcal, protein, kcal_est, protein_est, source, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'local', ?10)")
        .bind(u.id, fid, d, text, meal, kcal, prot, est.kcal || null, est.prot || null, Date.now()),
      env.DB.prepare("INSERT INTO inbox (user_id, id, created_at, text, action, tier) VALUES (?4, ?1, ?2, ?3, 'registrar_comida', 'haiku')").bind(id(), Date.now(), `[comida ${d}] ${text}`, u.id),
    ]);
    return json({ id: fid, meal, kcal, prot }, 201);
  });

  on("PUT", "/api/food/:id", async (req, env, p, u) => {
    const b = await readJson<Record<string, unknown>>(req);
    const cur = await env.DB.prepare(`SELECT ${FOOD_COLS} FROM food_log WHERE user_id = ?1 AND id = ?2`).bind(u.id, p.id).first<FoodRow>();
    if (!cur) throw new HttpError(404, "registro não encontrado");
    const text = b.text === undefined ? cur.raw_text : str(b.text, "text", 2000)!;
    const meal = b.meal === undefined ? cur.meal : mealOrNull(b.meal);
    const kcalIn = num(b.kcal, "kcal", 0, 20000, false), protIn = num(b.protein, "protein", 0, 1000, false);
    let { kcal, protein, kcal_est, protein_est, source, confidence } = cur;
    if (kcalIn != null || protIn != null) { kcal = kcalIn ?? kcal; protein = protIn ?? protein; source = "local"; confidence = null; } // ajuste manual do dono
    else if (text !== cur.raw_text) {
      const est = estimateFood(text);
      kcal = kcal_est = est.kcal || null; protein = protein_est = est.prot || null; source = "local"; confidence = null;
    }
    await env.DB.prepare("UPDATE food_log SET raw_text = ?3, meal = ?4, kcal = ?5, protein = ?6, kcal_est = ?7, protein_est = ?8, source = ?9, confidence = ?10 WHERE user_id = ?1 AND id = ?2")
      .bind(u.id, p.id, text, meal, kcal, protein, kcal_est, protein_est, source, confidence).run();
    return json({ ok: true, kcal, prot: protein, source });
  });

  on("DELETE", "/api/food/:id", async (_req, env, p, u) => {
    const r = await env.DB.prepare("DELETE FROM food_log WHERE user_id = ?1 AND id = ?2").bind(u.id, p.id).run();
    if (!r.meta.changes) throw new HttpError(404, "registro não encontrado");
    return json({ ok: true });
  });

  // ---- refeições salvas ----
  on("POST", "/api/meal-templates", async (req, env, _p, u) => {
    const b = await readJson<Record<string, unknown>>(req);
    const name = str(b.name, "name", 40)!, text = str(b.text, "text", 2000)!, meal = mealOrNull(b.meal);
    const est = estimateFood(text);
    const kcal = num(b.kcal, "kcal", 0, 20000, false) ?? (est.kcal || null), prot = num(b.protein, "protein", 0, 1000, false) ?? (est.prot || null);
    const tid = id();
    // o teto de 20 é checado no mesmo comando (atômico)
    const r = await env.DB.prepare(`INSERT INTO meal_template (user_id, id, name, meal, text, kcal, protein, created_at)
      SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8 WHERE (SELECT COUNT(*) FROM meal_template WHERE user_id = ?1) < ?9`)
      .bind(u.id, tid, name, meal, text, kcal, prot, Date.now(), MAX_TEMPLATES).run();
    if (!r.meta.changes) throw new HttpError(409, `até ${MAX_TEMPLATES} refeições salvas`);
    return json({ id: tid }, 201);
  });
  on("DELETE", "/api/meal-templates/:id", async (_req, env, p, u) => {
    const r = await env.DB.prepare("DELETE FROM meal_template WHERE user_id = ?1 AND id = ?2").bind(u.id, p.id).run();
    if (!r.meta.changes) throw new HttpError(404, "refeição não encontrada");
    return json({ ok: true });
  });

  // ---- metas e calorias adaptativas ----
  on("GET", "/api/diet", async (req, env, _p, u) => {
    const today = date(new URL(req.url).searchParams.get("date"), "date");
    const [tpl, hist, w] = await Promise.all([
      env.DB.prepare("SELECT id, name, meal, text, kcal, protein FROM meal_template WHERE user_id = ?1 ORDER BY created_at LIMIT 20").bind(u.id).all<{ id: string; name: string; meal: Meal | null; text: string; kcal: number | null; protein: number | null }>(),
      env.DB.prepare("SELECT date, kcal_before, kcal_after, adjust, tdee, trend_kg_week, code, reason FROM diet_target_history WHERE user_id = ?1 ORDER BY date DESC, created_at DESC LIMIT 8").bind(u.id)
        .all<{ date: string; kcal_before: number; kcal_after: number; adjust: number; tdee: number | null; trend_kg_week: number | null; code: string; reason: string }>(),
      env.DB.prepare("SELECT date, weight_kg FROM checkin WHERE user_id = ?1 AND weight_kg IS NOT NULL AND date BETWEEN ?2 AND ?3 ORDER BY date").bind(u.id, addDays(today, -60), today).all<{ date: string; weight_kg: number }>(),
    ]);
    return json({
      templates: tpl.results.map((t) => ({ id: t.id, name: t.name, meal: t.meal, text: t.text, kcal: t.kcal, prot: t.protein })),
      history: hist.results.map((h) => ({ date: h.date, before: h.kcal_before, after: h.kcal_after, adjust: h.adjust, tdee: h.tdee, trendKgWeek: h.trend_kg_week, code: h.code, reason: h.reason })),
      weights: w.results.map((x) => ({ date: x.date, kg: x.weight_kg })),
    });
  });

  // Revisão semanal da meta de calorias: no máximo uma por 7 dias; sem dados suficientes não grava nada.
  on("POST", "/api/diet/adapt", async (req, env, _p, u) => {
    const b = await readJson<Record<string, unknown>>(req, 2 * 1024);
    const today = date(b.date), end = addDays(today, -1);
    const profile = await getProfile(env, u.id);
    if (!profile) return json({ changed: false, code: "sem_perfil", reason: "Faça os Primeiros passos para a meta de calorias poder se ajustar." });
    const diet = (profile.diet ?? {}) as { kcal?: number; pace?: string };
    const current = typeof diet.kcal === "number" ? diet.kcal : 2650;
    const pace: Pace = PACES.includes(diet.pace as Pace) ? (diet.pace as Pace) : "moderado";
    const last = await env.DB.prepare("SELECT date FROM diet_target_history WHERE user_id = ?1 ORDER BY date DESC LIMIT 1").bind(u.id).first<{ date: string }>();
    if (last && diffDays(last.date, today) < 7) return json({ changed: false, code: "recente", kcal: current, reason: `Última revisão em ${last.date}. A próxima é a partir de ${addDays(last.date, 7)}.` });

    const [food, w, waist] = await Promise.all([
      env.DB.prepare("SELECT date, SUM(COALESCE(kcal, 0)) AS kcal FROM food_log WHERE user_id = ?1 AND date BETWEEN ?2 AND ?3 GROUP BY date").bind(u.id, addDays(end, -20), end).all<{ date: string; kcal: number }>(),
      env.DB.prepare("SELECT date, weight_kg FROM checkin WHERE user_id = ?1 AND weight_kg IS NOT NULL AND date BETWEEN ?2 AND ?3 ORDER BY date").bind(u.id, addDays(end, -90), end).all<{ date: string; weight_kg: number }>(),
      env.DB.prepare("SELECT date, waist_cm FROM measurement WHERE user_id = ?1 AND waist_cm IS NOT NULL AND date <= ?2 ORDER BY date DESC LIMIT 12").bind(u.id, end).all<{ date: string; waist_cm: number }>(),
    ]);
    const wl = waist.results; // mais recente primeiro
    const ref = wl.find((x) => wl[0] && diffDays(x.date, wl[0].date) >= 24 && diffDays(x.date, wl[0].date) <= 35);
    const waistDelta = wl[0] && ref ? Math.round((wl[0].waist_cm - ref.waist_cm) * 10) / 10 : null;
    const r = adaptiveTarget({ weights: w.results.map((x) => ({ date: x.date, kg: x.weight_kg })), intake: food.results, currentKcal: current, pace, end, waistDeltaCm4w: waistDelta });
    if (r.code === "sem_dados") return json({ changed: false, code: r.code, kcal: current, reason: r.reason });

    // a trava de 7 dias é checada de novo no mesmo comando (dois aparelhos abrindo ao mesmo tempo ajustam uma vez só)
    const ins = await env.DB.prepare(`INSERT INTO diet_target_history (user_id, id, date, kcal_before, kcal_after, adjust, tdee, trend_kg_week, code, reason, created_at)
      SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11 WHERE NOT EXISTS (SELECT 1 FROM diet_target_history WHERE user_id = ?1 AND date > ?12)`)
      .bind(u.id, id(), today, current, r.kcal, r.adjust, r.tdee, r.trendKgWeek, r.code, r.reason, Date.now(), addDays(today, -7)).run();
    if (!ins.meta.changes) return json({ changed: false, code: "recente", kcal: current, reason: "A meta já foi revisada há pouco." });
    if (r.adjust !== 0) await saveProfile(env, u.id, { diet: { kcal: r.kcal } }, "merge");
    return json({ changed: r.adjust !== 0, code: r.code, adjust: r.adjust, kcal: r.kcal, faixa: r.faixa, tdee: r.tdee, trendKgWeek: r.trendKgWeek, reason: r.reason });
  });

  // ---- voz: Whisper (Workers AI). Erros tipados: o app mostra o motivo e cai para o navegador. ----
  on("POST", "/api/transcribe", async (req, env) => {
    const len = Number(req.headers.get("Content-Length") ?? "0");
    if (len > MAX_AUDIO) throw new HttpError(413, "áudio grande demais (máx. 4 MB, ~2 min)", "audio_grande");
    if (!env.AI) throw new HttpError(501, "transcrição no servidor desativada", "sem_servidor");
    const mime = (req.headers.get("Content-Type") ?? "").split(";")[0].trim().toLowerCase();
    if (!mime.startsWith("audio/") && mime !== "video/webm" && mime !== "video/mp4") throw new HttpError(415, "use áudio (webm, mp4, ogg, wav)", "tipo_invalido");
    const buf = await readLimited(req, MAX_AUDIO);
    if (!buf.byteLength) throw new HttpError(400, "áudio vazio", "audio_vazio");
    let bin = "";
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    let text = "";
    try {
      const out = (await env.AI.run("@cf/openai/whisper-large-v3-turbo", { audio: btoa(bin), language: "pt", task: "transcribe" })) as { text?: string };
      text = (out.text ?? "").trim();
    } catch (e) {
      console.error("transcribe", e instanceof Error ? e.name : "erro"); // sem o conteúdo do áudio nem do texto
      throw new HttpError(502, "a transcrição falhou no servidor", "falha_modelo");
    }
    return json({ text, engine: "whisper" });
  });
}

