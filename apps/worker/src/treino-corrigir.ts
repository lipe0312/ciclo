// #123 Cancelar treino, corrigir séries de um dia (mesmo já feito) no app e pelo MCP, e a presença que acompanha.
// Regras no core (corrigir-treino.ts). Todo SQL com bind e filtrado por user_id; o uid vem da autenticação.
import { MUSCLE_IDS, fmtSerie, mondayOf, planejarCorrecao, presencaAposDescartar, weekDates } from "@ciclo/core";
import type { MuscleId, PedidoCorrecao, SerieDia, Sets } from "@ciclo/core";
import type { Env } from "./env.ts";
import { HttpError, date, str } from "./http.ts";
import { parse, summarizeSession } from "./db.ts";
import { confirmar, criarPrevia } from "./mcp-previa.ts";
import { sha256Hex } from "./auth.ts";
import { S, addDays, hhmm, obj, today } from "./mcp-tipos.ts";
import type { Args, Tool } from "./mcp-tipos.ts";

/** Apaga sessões da conta com tudo o que é delas (séries, "não fiz", descanso agendado). */
const descartarStmts = (env: Env, uid: string, ids: readonly string[]) => ids.flatMap((sid) => [
  env.DB.prepare("DELETE FROM set_log WHERE user_id = ?1 AND session_id = ?2").bind(uid, sid),
  env.DB.prepare("DELETE FROM exercise_skip WHERE user_id = ?1 AND session_id = ?2").bind(uid, sid),
  env.DB.prepare("DELETE FROM rest_timer WHERE user_id = ?1 AND session_id = ?2").bind(uid, sid),
  env.DB.prepare("DELETE FROM session WHERE user_id = ?1 AND id = ?2").bind(uid, sid),
]);

/** Sem sessão no dia, a presença gravada pelo próprio treino (Terminar) some: o dia volta a pendente. "Treinei" fica. */
async function acertarPresenca(env: Env, uid: string, d: string) {
  const [att, ses] = await env.DB.batch([
    env.DB.prepare("SELECT status, source FROM attendance WHERE user_id = ?1 AND date = ?2").bind(uid, d),
    env.DB.prepare("SELECT COUNT(*) AS n FROM session WHERE user_id = ?1 AND date = ?2").bind(uid, d),
  ]);
  const p = (att.results as { status: string; source: string }[])[0];
  if (presencaAposDescartar(p, (ses.results as { n: number }[])[0]?.n ?? 0) === "apagar")
    await env.DB.prepare("DELETE FROM attendance WHERE user_id = ?1 AND date = ?2 AND status = 'fui' AND source IN ('inicio', 'fim')").bind(uid, d).run();
}

/** Resumo (volume, PRs) de uma sessão terminada é refeito depois de corrigir as séries dela. */
export async function resumirSeTerminada(env: Env, uid: string, sid: string) {
  const s = await env.DB.prepare("SELECT finished_at FROM session WHERE user_id = ?1 AND id = ?2").bind(uid, sid).first<{ finished_at: number | null }>();
  return s?.finished_at ? summarizeSession(env, uid, sid) : null;
}

/** Cancelar o treino começado (aberto, ou fechado sozinho em 2 h): sessão, séries, cronômetro e push somem; dia pendente. */
export async function cancelarSessao(env: Env, uid: string, sid: string) {
  const s = await env.DB.prepare("SELECT date FROM session WHERE user_id = ?1 AND id = ?2 AND (finished_at IS NULL OR closed_by = 'auto')").bind(uid, sid).first<{ date: string }>();
  if (!s) return { ok: true, cancelada: false };
  await env.DB.batch(descartarStmts(env, uid, [sid]));
  await acertarPresenca(env, uid, s.date);
  return { ok: true, cancelada: true, date: s.date };
}

/** Tirar um exercício registrado de uma sessão (mesmo terminada): séries, "não fiz" e o item do plano dela. */
export async function removerExercicio(env: Env, uid: string, sid: string, ex: string) {
  const s = await env.DB.prepare("SELECT plan FROM session WHERE user_id = ?1 AND id = ?2").bind(uid, sid).first<{ plan: string }>();
  if (!s) return { ok: true, removed: 0 };
  const plan = parse<{ items?: { exerciseId?: unknown }[] }>(s.plan, {});
  const items = Array.isArray(plan.items) ? plan.items.filter((i) => i?.exerciseId !== ex) : undefined;
  const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM set_log WHERE user_id = ?1 AND session_id = ?2 AND exercise_id = ?3").bind(uid, sid, ex).first<{ n: number }>();
  await env.DB.batch([ // tudo ou nada: séries, "não fiz" e o item do plano
    env.DB.prepare("DELETE FROM set_log WHERE user_id = ?1 AND session_id = ?2 AND exercise_id = ?3").bind(uid, sid, ex),
    env.DB.prepare("DELETE FROM exercise_skip WHERE user_id = ?1 AND session_id = ?2 AND exercise_id = ?3").bind(uid, sid, ex),
    ...(items ? [env.DB.prepare("UPDATE session SET plan = ?3 WHERE user_id = ?1 AND id = ?2").bind(uid, sid, JSON.stringify({ ...plan, items }))] : []),
  ]);
  const summary = await resumirSeTerminada(env, uid, sid);
  return { ok: true, removed: n?.n ?? 0, summary };
}

// ---------- MCP: ciclo_treino_corrigir (prévia → confirmar) ----------
type SesRow = { id: string; started_at: number; finished_at: number | null };
async function lerDia(env: Env, uid: string, d: string) {
  const days = weekDates(mondayOf(d));
  const [ses, sets, sem] = await env.DB.batch([
    env.DB.prepare("SELECT id, started_at, finished_at FROM session WHERE user_id = ?1 AND date = ?2 ORDER BY started_at, id").bind(uid, d),
    env.DB.prepare(`SELECT l.session_id AS sessao, l.exercise_id AS exercicio, l.set_no AS serie, l.muscle AS musculo, l.kg, l.reps, l.segundos, l.rir, s.started_at AS inicio
      FROM set_log l JOIN session s ON s.user_id = l.user_id AND s.id = l.session_id WHERE l.user_id = ?1 AND s.date = ?2 ORDER BY s.started_at, l.exercise_id, l.set_no`).bind(uid, d),
    env.DB.prepare(`SELECT l.muscle AS m, COUNT(*) AS n FROM set_log l JOIN session s ON s.user_id = l.user_id AND s.id = l.session_id
      WHERE l.user_id = ?1 AND s.date BETWEEN ?2 AND ?3 GROUP BY l.muscle`).bind(uid, days[0], days[6]),
  ]);
  const semana: Sets = {};
  for (const r of sem.results as { m: MuscleId; n: number }[]) if (MUSCLE_IDS.includes(r.m)) semana[r.m] = r.n;
  const sessoes = ses.results as SesRow[], series = sets.results as SerieDia[];
  // o que a prévia mostrou: qualquer série nova, apagada ou mudada depois dela invalida o token
  // só o SHA-256 vai na prévia (cabe no limite do payload, por maior que seja o dia)
  const assinatura = await sha256Hex(JSON.stringify([sessoes.map((s) => s.id), series.map((s) => [s.sessao, s.exercicio, s.serie, s.kg, s.reps, s.segundos, s.rir])]));
  return { sessoes, series, semana, assinatura };
}

/** O dia como o MCP vê: sessões (id, hora, séries, terminada) e as séries numeradas por exercício (numeração do dia). */
function diaCompacto(dia: Awaited<ReturnType<typeof lerDia>>) {
  const porEx: Record<string, string[]> = {};
  const ordem = new Map(dia.sessoes.map((s, i) => [s.id, i]));
  for (const s of [...dia.series].sort((a, b) => (ordem.get(a.sessao) ?? 0) - (ordem.get(b.sessao) ?? 0) || a.serie - b.serie)) {
    const l = (porEx[s.exercicio] ??= []);
    l.push(`${l.length + 1}: ${fmtSerie({ kg: s.kg ?? 0, reps: s.reps ?? 0, segundos: s.segundos })}${dia.sessoes.length > 1 ? ` (sessão ${(ordem.get(s.sessao) ?? 0) + 1})` : ""}`);
  }
  return {
    sessoes: dia.sessoes.map((s, i) => ({ n: i + 1, id: s.id, inicio: hhmm(s.started_at), series: dia.series.filter((x) => x.sessao === s.id).length, terminada: !!s.finished_at })),
    series: porEx,
  };
}

interface PayloadCorrigir { date: string; pedido: PedidoCorrecao; assinatura: string }
const pedidoDe = (a: Args): PedidoCorrecao => ({
  apagar: a.apagar as PedidoCorrecao["apagar"], corrigir: a.corrigir as PedidoCorrecao["corrigir"],
  descartarSessao: str(a.descartarSessao, "descartarSessao", 40, false) ?? undefined, mesclar: a.mesclar === true || undefined,
});
const temPedido = (p: PedidoCorrecao) => !!(p.apagar?.length || p.corrigir?.length || p.descartarSessao || p.mesclar);

async function aplicar(env: Env, uid: string, p: PayloadCorrigir) {
  const dia = await lerDia(env, uid, p.date);
  if (dia.assinatura !== p.assinatura) throw new HttpError(409, "o dia mudou desde a prévia: simule de novo e mostre a prévia atualizada");
  const plano = planejarCorrecao({ series: dia.series, sessoes: dia.sessoes.map((s) => ({ id: s.id, inicio: s.started_at })), semana: dia.semana }, p.pedido);
  if ("erro" in plano) throw new HttpError(409, plano.erro);
  const k = (x: { sessao: string; exercicio: string; serie: number }) => [uid, x.sessao, x.exercicio, x.serie] as const;
  const W = "WHERE user_id = ?1 AND session_id = ?2 AND exercise_id = ?3 AND set_no = ?4";
  await env.DB.batch([
    ...plano.apagar.map((x) => env.DB.prepare(`DELETE FROM set_log ${W}`).bind(...k(x))),
    ...plano.corrigir.map((x) => env.DB.prepare(`UPDATE set_log SET kg = ?5, reps = ?6, segundos = ?7, rir = ?8 ${W}`).bind(...k(x), x.kg, x.reps, x.segundos, x.rir)),
    ...plano.mover.map((x) => env.DB.prepare(`UPDATE set_log SET session_id = ?5, set_no = ?6 ${W}`).bind(...k(x), x.para, x.paraSerie)),
    ...descartarStmts(env, uid, plano.descartar),
  ]);
  await acertarPresenca(env, uid, p.date);
  const tocadas = new Set([...plano.apagar, ...plano.corrigir].map((x) => x.sessao).concat(plano.mover.map((x) => x.para)));
  for (const sid of tocadas) if (!plano.descartar.includes(sid)) await resumirSeTerminada(env, uid, sid);
  return { corrigido: true, date: p.date, mudancas: plano.linhas, volumeSemana: plano.volume };
}

async function treinoCorrigir(a: Args, env: Env, uid: string) {
  if (a.confirmar != null) return confirmar<PayloadCorrigir, unknown>(env, uid, "treino_corrigir", a.confirmar, (p) => aplicar(env, uid, p));
  const d = date(a.date);
  if (d > today() || d < addDays(today(), -7)) throw new HttpError(400, "date: de até 7 dias atrás até hoje");
  const dia = await lerDia(env, uid, d), pedido = pedidoDe(a);
  if (!temPedido(pedido)) return { date: d, ...diaCompacto(dia), proximoPasso: "Diga o que corrigir (apagar, corrigir, descartarSessao ou mesclar) usando a numeração acima." };
  const plano = planejarCorrecao({ series: dia.series, sessoes: dia.sessoes.map((s) => ({ id: s.id, inicio: s.started_at })), semana: dia.semana }, pedido);
  if ("erro" in plano) throw new HttpError(400, plano.erro);
  const token = await criarPrevia(env, uid, "treino_corrigir", { date: d, pedido, assinatura: dia.assinatura } satisfies PayloadCorrigir);
  return {
    previa: true, token, expiraEmMin: 15, date: d, mudancas: plano.linhas, volumeSemana: plano.volume,
    proximoPasso: "Mostre as mudanças e o volume (antes → depois) e só com o sim chame de novo com confirmar:<token>.",
  };
}

const SERIE = { type: "integer", minimum: 1, maximum: 60 };
export const TOOLS_CORRIGIR: Tool[] = [{
  name: "ciclo_treino_corrigir",
  description: "Corrige o treino registrado num dia (padrão: lê; até 7 dias atrás), mesmo já feito: apagar séries ou o exercício inteiro, corrigir uma série (kg, reps ou segundos, RIR), descartar uma sessão duplicada do dia ou mesclar as sessões do dia na 1ª. Só date → lista as sessões e as séries numeradas do dia (numeração do dia, por exercício). Com mudança → sempre prévia (o que muda + volume da semana antes → depois) e token; só grava com confirmar:<token>. Escreve.",
  inputSchema: obj({
    date: S.date,
    apagar: { type: "array", maxItems: 20, items: { type: "object", required: ["exercicioId"], additionalProperties: false, properties: { exercicioId: { type: "string", pattern: "^[A-Za-z0-9_.-]{1,80}$" }, series: { type: "array", minItems: 1, maxItems: 24, items: SERIE } } }, description: "sem series = o exercício inteiro sai do dia" },
    corrigir: { type: "array", maxItems: 20, items: { type: "object", required: ["exercicioId", "serie"], additionalProperties: false, properties: { exercicioId: { type: "string", pattern: "^[A-Za-z0-9_.-]{1,80}$" }, serie: SERIE, kg: { type: "number", minimum: 0, maximum: 600 }, reps: { type: "integer", minimum: 0, maximum: 100 }, segundos: { type: "integer", minimum: 1, maximum: 3600 }, rir: { type: "integer", minimum: 0, maximum: 6 } } } },
    descartarSessao: { type: "string", maxLength: 40, description: "id da sessão (da lista do dia) a descartar com as séries dela" },
    mesclar: { type: "boolean", description: "junta as sessões do dia na mais antiga (o volume não muda)" },
    confirmar: S.confirmar,
  }),
  run: treinoCorrigir,
}];
