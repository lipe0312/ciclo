// #108 "Gerar treino" num dia sem treino e a revisão assíncrona pela IA (caixa `revisar_treino` ou MCP ciclo_revisar_treino).
// A regra fica no core (treino-gerado.ts). Todo SQL com bind e filtrado por user_id; o uid vem da autenticação.
// Sem chave de API: a revisão roda pela rotina/vigia ou pelo Claude conectado. Com a chave própria (#88/#89), pode rodar na hora.
import {
  ACAO_REVISAR_TREINO, DOWS, dataDoPedidoRevisao, gerarTreinoDia, mondayOf, pedidoRevisaoTreino, planoDoDiaGerado, revisarTreinoDia, weekDates,
} from "@ciclo/core";
import type { DayPlan, Dow, PerfilGerador, TreinoGerado } from "@ciclo/core";
import type { Env } from "./env.ts";
import { EMPTY_MSG, buildDayInput, getProfile, parse } from "./db.ts";
import { HttpError, date, id } from "./http.ts";
import { today as hojeSP } from "./mcp-tipos.ts";
import { aplicarNaSemana, getWeek } from "./semana.ts";
import { validarEntradaGerador } from "./gerador.ts";

const dowDe = (d: string) => DOWS[(new Date(d + "T12:00:00Z").getUTCDay() + 6) % 7] as Dow;

/** Entrada do gerador a partir do perfil, da academia do dia, das dores abertas e das preferências. */
async function gerado(env: Env, uid: string, d: string): Promise<{ g: TreinoGerado | null; gymId: string | null }> {
  const [profile, bi] = await Promise.all([getProfile(env, uid), buildDayInput(env, uid, { date: d, daysLeft: 1 })]);
  if (!profile || bi.empty) throw new HttpError(409, EMPTY_MSG[bi.empty ?? "sem_perfil"]);
  // #105 entrada validada (nível, minutos, dias, dores, saúde) antes de gerar: fora das faixas → 400
  const e = validarEntradaGerador({ sex: profile.sex, level: profile.level, minutes: bi.input.minutes, daysUsual: profile.daysUsual, daysTarget: profile.daysTarget, pains: bi.input.pains, saude: profile.saude });
  const p: PerfilGerador = {
    sexo: e.sexo, nivel: e.nivel, prioridades: bi.input.priorities, equipamentos: bi.input.equipment, dias: e.dias, diasMeta: e.diasMeta, minutos: e.minutos,
    dores: e.dores, evitar: bi.input.avoid, prefs: bi.input.prefs, pinned: bi.input.pinned, familiar: bi.input.familiar, saude: e.saude,
  };
  return { g: gerarTreinoDia(p, dowDe(d)), gymId: bi.gymId };
}

const salvar = (env: Env, uid: string, d: string, gymId: string | null, plan: DayPlan) =>
  env.DB.prepare("INSERT INTO day_plan (user_id, date, gym_id, plan, source, created_at) VALUES (?1, ?2, ?3, ?4, 'claude', ?5) ON CONFLICT(user_id, date) DO UPDATE SET gym_id = ?3, plan = ?4, source = 'claude', created_at = ?5")
    .bind(uid, d, gymId, JSON.stringify(plan), Date.now());

/** "Gerar treino" (só por toque, nunca ao abrir a tela): dia desta semana, de hoje em diante, sem treino salvo nem feito. */
export async function gerarTreinoDoDia(env: Env, uid: string, dia: string, hoje: string) {
  const d = date(dia), t = date(hoje, "today");
  // o `today` vem do aparelho: aceita só ±1 dia do relógio do servidor (fuso de São Paulo)
  if (Math.abs(Date.parse(t) - Date.parse(hojeSP())) > 864e5) throw new HttpError(400, "today: data do aparelho fora do dia atual");
  if (d < t || !weekDates(mondayOf(t)).includes(d)) throw new HttpError(400, "Gerar treino só para dias desta semana, de hoje em diante");
  // sem treino = folga na semana (nem planejado, nem salvo pelo Chat/à mão, nem feito)
  const w = await getWeek(env, uid, t);
  const dw = w.week?.days.find((x) => x.date === d);
  if (!w.week) throw new HttpError(409, w.message ?? EMPTY_MSG.sem_perfil);
  if (!dw || dw.kind !== "folga" || (dw.status !== "livre" && dw.status !== "folga")) throw new HttpError(409, "Esse dia já tem treino: abra pelo Ver");
  const { g, gymId } = await gerado(env, uid, d);
  if (!g) throw new HttpError(409, "Não deu para montar um treino válido com o perfil e a academia de hoje");
  const pedido = pedidoRevisaoTreino(d, g);
  await env.DB.batch([
    salvar(env, uid, d, gymId, planoDoDiaGerado(g.dia, "pendente")),
    env.DB.prepare("INSERT INTO inbox (user_id, id, created_at, text, action, tier) VALUES (?1, ?2, ?3, ?4, ?5, ?6)").bind(uid, id(), Date.now(), pedido.texto, ACAO_REVISAR_TREINO, pedido.tier),
  ]);
  await aplicarNaSemana(env, uid, t);
  return getWeek(env, uid, t);
}

/** Dias com revisão pendente (o MCP lê antes de revisar). */
export async function revisoesPendentes(env: Env, uid: string, d?: string) {
  const rows = (await env.DB.prepare("SELECT id, text, created_at FROM inbox WHERE user_id = ?1 AND action = ?2 AND status = 'pendente' ORDER BY created_at LIMIT 20")
    .bind(uid, ACAO_REVISAR_TREINO).all<{ id: string; text: string }>()).results;
  const out = [];
  for (const r of rows) {
    const dia = dataDoPedidoRevisao(r.text);
    if (!dia || (d && dia !== d)) continue;
    const row = await env.DB.prepare("SELECT plan FROM day_plan WHERE user_id = ?1 AND date = ?2").bind(uid, dia).first<{ plan: string }>();
    const plan = parse<DayPlan | null>(row?.plan, null);
    if (plan?.revisao !== "pendente") continue;
    out.push({ pedido: r.id, date: dia, motivo: "gerado pelo app (determinístico); falta a revisão da IA", itens: plan.items.map((i) => ({ id: i.exerciseId, nm: i.nm, sets: i.sets })), regras: r.text.split("\n").slice(0, 3).join(" ") });
  }
  return out;
}

/** Aplica a revisão da IA a um dia gerado. Válida → o treino revisado; inválida ou sem itens → fica o do app.
 *  Tira o selo "revisão pendente" e resolve o pedido `revisar_treino` daquele dia. */
export async function revisarTreino(env: Env, uid: string, dia: string, itens: unknown, hoje: string, resposta = "Revisão aplicada") {
  const d = date(dia);
  const row = await env.DB.prepare("SELECT plan, gym_id, source FROM day_plan WHERE user_id = ?1 AND date = ?2").bind(uid, d).first<{ plan: string; gym_id: string | null; source: string }>();
  const atual = parse<DayPlan | null>(row?.plan, null);
  // editado à mão depois de gerado: vale a escolha do dono (o selo pode ter ficado no plano editado)
  if (!atual || atual.revisao !== "pendente" || row?.source === "manual") throw new HttpError(404, "nenhum treino gerado com revisão pendente nesse dia");
  const { g } = await gerado(env, uid, d);
  const r = g ? revisarTreinoDia(g, itens) : { dia: null, fonte: "deterministica" as const, violacoes: [{ codigo: "perfil", msg: "o perfil mudou: não deu para conferir a revisão" }] };
  const plan = r.fonte === "ia" && r.dia ? planoDoDiaGerado(r.dia, "revisada") : { ...atual, revisao: "mantida" as const, why: [atual.why[0], "A IA revisou e ficou a versão do app."] };
  const change = { revisao: r.fonte === "ia" ? "revisada" : "mantida", date: d, violacoes: r.violacoes.map((v) => v.msg).slice(0, 10) };
  await env.DB.batch([
    salvar(env, uid, d, row!.gym_id, plan),
    env.DB.prepare("UPDATE inbox SET status = 'respondido', response = ?3, change = ?4, answered_at = ?5, cerebro = 'claude-assinatura' WHERE user_id = ?1 AND action = ?2 AND status = 'pendente' AND substr(text, 1, ?6) = ?7")
      .bind(uid, ACAO_REVISAR_TREINO, resposta, JSON.stringify(change), Date.now(), `[${ACAO_REVISAR_TREINO} ${d}]`.length, `[${ACAO_REVISAR_TREINO} ${d}]`),
  ]);
  await aplicarNaSemana(env, uid, mondayOf(d) === mondayOf(hoje) ? hoje : d);
  return { aplicado: r.fonte === "ia", ...change };
}
