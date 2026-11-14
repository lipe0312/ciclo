// #66 Interface Cerebro: o mesmo cérebro para as duas interfaces (o conector no Claude e a aba Chat do app).
// Provedores: regra (grátis, padrão), claude-assinatura (conector + rotina na nuvem; o pedido fica na fila) e
// openai-api (OPCIONAL: só com OPENAI_API_KEY + OPENAI_MAX_USD, só gerar/ajustar treino, teto mensal contado no D1,
// `fetch` direto, sem SDK). Toda saída de IA passa pelo validador do core (hydrate + validateItems via saveCompact);
// fora das regras, é descartada e o pedido segue para o Claude. Todo SQL com bind e por user_id; nada de dado em log.
import {
  OPENAI_MAX_SAIDA, cabeNoTeto, configOpenai, custoUsd, escolherCerebro, estimarTokens, estimativaPiorUsd, intencaoRegra, lerSaidaOpenai,
  mensagensOpenai, mesUtc, parsePlanoSalvo, planDay, respostaTreinoHoje,
} from "@ciclo/core";
import type { Action, ProvedorId } from "@ciclo/core";
import type { Env } from "./env.ts";
import { buildDayInput, getProfile, weekState } from "./db.ts";
import { ciclo_contexto } from "./mcp-contexto.ts";
import { saveCompact } from "./mcp.ts";

export interface PedidoCaixa { id: string; texto: string; acao: Action; hoje: string }
export interface RespostaCerebro { response: string; change: unknown; cerebro: ProvedorId }
export interface Cerebro { id: ProvedorId; responder(env: Env, uid: string, p: PedidoCaixa): Promise<RespostaCerebro | null> }

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_TIMEOUT_MS = 20_000;

/** Dias que faltam na semana (meta de dias − treinos já feitos), de 1 a 7. */
async function diasRestantes(env: Env, uid: string, hoje: string) {
  const [profile, week] = await Promise.all([getProfile(env, uid), weekState(env, uid, hoje)]);
  const meta = Number((profile as { daysTarget?: number } | null)?.daysTarget) || 4;
  return Math.max(1, Math.min(7, meta - week.sessions.length));
}

/** Treino do dia: o salvo (Claude, manual ou regra) ou o calculado pela semana flexível. */
async function treinoDoDia(env: Env, uid: string, hoje: string) {
  const row = await env.DB.prepare("SELECT plan FROM day_plan WHERE user_id = ?1 AND date = ?2").bind(uid, hoje).first<{ plan: string }>();
  const salvo = row ? parsePlanoSalvo(row.plan) : null;
  if (salvo) return salvo;
  const bi = await buildDayInput(env, uid, { date: hoje, daysLeft: await diasRestantes(env, uid, hoje) });
  return bi.empty ? null : planDay(bi.input);
}

export const regra: Cerebro = {
  id: "regra",
  async responder(env, uid, p) {
    if (intencaoRegra(p.texto) !== "treino_hoje") return null;
    return { response: respostaTreinoHoje(await treinoDoDia(env, uid, p.hoje)), change: null, cerebro: "regra" };
  },
};

/** A assinatura do Claude não responde na hora: o pedido fica na fila para a rotina na nuvem ou o conector (ciclo_chat_pendentes). */
export const claudeAssinatura: Cerebro = { id: "claude-assinatura", responder: async () => null };

const PEDIDO_DA_ACAO: Partial<Record<Action, "trocar" | "tempo" | "gerar">> = {
  trocar_exercicio: "trocar", academia_cheia: "trocar", trocar_academia: "trocar", pouco_tempo: "tempo", nao_gostei: "tempo",
  foco_musculo: "gerar", compensatorio: "gerar", novo_bloco: "gerar",
};

export const openaiApi: Cerebro = {
  id: "openai-api",
  async responder(env, uid, p) {
    const cfg = configOpenai(env);
    if (!cfg.ligado) return null;
    const mes = mesUtc(Date.now());
    const gasto = ((await env.DB.prepare("SELECT usd_micro FROM cerebro_gasto WHERE mes = ?1").bind(mes).first<{ usd_micro: number }>())?.usd_micro ?? 0) / 1e6;
    // contexto: a fatia do pedido (a mesma do conector) + o treino base calculado pela regra, com IDs e alternativas
    const daysLeft = await diasRestantes(env, uid, p.hoje);
    const bi = await buildDayInput(env, uid, { date: p.hoje, daysLeft });
    if (bi.empty) return null;
    const base = planDay(bi.input);
    const fatia = await ciclo_contexto({ pedido: PEDIDO_DA_ACAO[p.acao] ?? "gerar", date: p.hoje }, env, uid, p.hoje);
    const contexto = { fatia, base: base.items.map((i) => ({ id: i.exerciseId, nm: i.nm, sets: i.sets, reps: i.reps, alts: i.alts })) };
    const messages = mensagensOpenai({ texto: p.texto, acao: p.acao }, contexto);
    if (!cabeNoTeto(gasto, cfg.maxUsd, estimativaPiorUsd(cfg.modelo, estimarTokens(JSON.stringify(messages)), OPENAI_MAX_SAIDA))) return null;
    let content: unknown = null;
    try {
      const r = await fetch(OPENAI_URL, {
        method: "POST", signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
        headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: cfg.modelo, messages, response_format: { type: "json_object" }, max_completion_tokens: OPENAI_MAX_SAIDA, temperature: 0.3 }),
      });
      const j = (await r.json().catch(() => null)) as { choices?: { message?: { content?: unknown } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } } | null;
      // conta o gasto mesmo se a saída for descartada (a API cobrou)
      if (j?.usage) {
        await env.DB.prepare("INSERT INTO cerebro_gasto (mes, usd_micro, chamadas) VALUES (?1, ?2, 1) ON CONFLICT(mes) DO UPDATE SET usd_micro = usd_micro + ?2, chamadas = chamadas + 1")
          .bind(mes, Math.ceil(custoUsd(cfg.modelo, j.usage) * 1e6)).run();
      }
      if (!r.ok) return null;
      content = j?.choices?.[0]?.message?.content ?? null;
    } catch { return null; } // rede, tempo esgotado: o pedido segue para o Claude
    const saida = lerSaidaOpenai(content);
    if (!saida.ok) return null;
    const change = await saveCompact(env, uid, { itens: saida.value.itens, motivo: saida.value.resposta, date: p.hoje, daysLeft }) as { salvo?: boolean };
    if (!change.salvo) return null; // fora das regras do validador: descartada, fica a versão determinística
    return { response: saida.value.resposta, change, cerebro: "openai-api" };
  },
};

const POR_ID: Record<ProvedorId, Cerebro> = { regra, "claude-assinatura": claudeAssinatura, "openai-api": openaiApi };

/** Tenta os provedores na ordem do core. null = ficou na fila para o Claude (rotina/conector). */
export async function responderNaCaixa(env: Env, uid: string, p: PedidoCaixa): Promise<RespostaCerebro | null> {
  for (const id of escolherCerebro({ acao: p.acao, texto: p.texto, openai: configOpenai(env) })) {
    const r = await POR_ID[id].responder(env, uid, p).catch(() => null);
    if (r) {
      await env.DB.prepare("UPDATE inbox SET status = 'respondido', response = ?3, change = ?4, answered_at = ?5, cerebro = ?6 WHERE id = ?1 AND user_id = ?2 AND status = 'pendente'")
        .bind(p.id, uid, r.response, r.change ? JSON.stringify(r.change) : null, Date.now(), r.cerebro).run();
      return r;
    }
  }
  return null;
}
