// Servidor MCP remoto mínimo (Streamable HTTP, respostas JSON, sem estado) — zero dependências.
// Usado como "connector personalizado" no claude.ai / Desktop / app do celular e, via apps/mcp-local, no Claude Code.
// Princípio de custo: ferramentas devolvem JSON COMPACTO; o Claude manda só IDs/números e o core valida e hidrata.
import { EQUIPMENT, EXERCISES, MUSCLES, MUSCLE_IDS, PAIN_REGIONS, hydrate, planDay, readiness, validateItems } from "@ciclo/core";
import type { CompactItem, Mode, MuscleId } from "@ciclo/core";
import type { Env } from "./env.ts";
import { buildDayInput, closeStaleSessions, getProfile, listGyms, upsertPain, weekState } from "./db.ts";
import { HttpError, date, id, int, json, oneOf, str } from "./http.ts";

type Args = Record<string, unknown>;
interface Tool { name: string; description: string; inputSchema: Record<string, unknown>; readOnly?: boolean; run: (a: Args, env: Env) => Promise<unknown> }

const S = {
  date: { type: "string", description: "YYYY-MM-DD (fuso America/Sao_Paulo)" },
  muscles: { type: "array", items: { type: "string", enum: MUSCLE_IDS } },
  compactItems: {
    type: "array", maxItems: 16, description: "Itens compactos: só IDs do catálogo e números.",
    items: { type: "object", required: ["id", "sets"], properties: { id: { type: "string" }, sets: { type: "integer", minimum: 1, maximum: 8 }, reps: { type: "array", items: { type: "integer" }, minItems: 2, maxItems: 2 }, nm: { type: "string", description: "só para exercício fora do catálogo" }, muscle: { type: "string", enum: MUSCLE_IDS } } },
  },
};
const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required, additionalProperties: false });
const today = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10); // America/Sao_Paulo (UTC−3)

const TOOLS: Tool[] = [
  {
    name: "ciclo_estado", readOnly: true,
    description: "Resumo da semana: volume feito × alvo por músculo, frequência, presença, check-ins (com prontidão), dores ativas, pedidos pendentes. Use primeiro.",
    inputSchema: obj({ date: S.date }),
    run: async (a, env) => {
      await closeStaleSessions(env);
      const d = a.date ? date(a.date) : today();
      const [w, profile] = await Promise.all([weekState(env, d), getProfile(env)]);
      return {
        semana: w.monday, prioridades: profile.priorities, objetivo: (profile.goal as { statement?: string })?.statement,
        volume: Object.fromEntries(MUSCLE_IDS.map((m) => [m, `${w.done[m] ?? 0} séries · ${w.freq[m] ?? 0}×`])),
        presenca: w.attendance, sessoes: w.sessions.map((s) => ({ date: s.date, nome: s.name, fechado: s.closed_by ?? "aberta" })),
        checkins: (w.checkins as { date: string; sleep_h: 5 | 6 | 7 | 8 | 9; energy: 1 | 2 | 3; soreness: 0 | 1 | 2; stress: 1 | 2 | 3; food: number; weight_kg: number }[])
          .map((c) => ({ date: c.date, sono: c.sleep_h, energia: c.energy, dor: c.soreness, estresse: c.stress, comida: c.food, peso: c.weight_kg, prontidao: readiness({ sleepH: c.sleep_h, energy: c.energy, soreness: c.soreness, stress: c.stress }).label })),
        dores: w.pains.map((p) => ({ id: p.id, regiao: p.region, intensidade: p.intensity, contexto: p.context })),
        pedidos_pendentes: w.inbox.filter((i) => i.status === "pendente").map((i) => ({ id: i.id, texto: i.text, acao: i.action, modelo: i.tier })),
      };
    },
  },
  {
    name: "ciclo_catalogo", readOnly: true,
    description: "Exercícios disponíveis (ID, nome, tipo) para um músculo na academia indicada. Use antes de propor trocas.",
    inputSchema: obj({ muscle: { type: "string", enum: MUSCLE_IDS }, gymId: { type: "string" } }, ["muscle"]),
    run: async (a, env) => {
      const m = oneOf(a.muscle, "muscle", MUSCLE_IDS);
      const gyms = await listGyms(env);
      const eq = new Set((gyms.find((g) => g.id === a.gymId) ?? gyms[0])?.equipment ?? []);
      return EXERCISES.filter((e) => e.m === m).map((e) => ({ id: e.id, nm: e.nm, tipo: e.kind, ok: e.eq.every((q) => eq.has(q)), alongado: !!e.stretch }));
    },
  },
  {
    name: "ciclo_planejar_dia", readOnly: true,
    description: "Calcula (não salva) o treino de hoje pela semana flexível. modo 'compensatorio' só se o usuário pedir.",
    inputSchema: obj({ date: S.date, daysLeft: { type: "integer", minimum: 1, maximum: 7 }, minutes: { type: "integer" }, mode: { type: "string", enum: ["normal", "compensatorio", "expresso"] }, focus: S.muscles, gymId: { type: "string" }, crowded: { type: "boolean" } }, ["daysLeft"]),
    run: async (a, env) => {
      const { input, gymId } = await buildDayInput(env, {
        date: a.date ? date(a.date) : today(), daysLeft: int(a.daysLeft, "daysLeft", 1, 7)!, minutes: int(a.minutes, "minutes", 15, 150, false) ?? undefined,
        mode: (a.mode as Mode) ?? "normal", focus: (a.focus as MuscleId[]) ?? undefined, gymId: (a.gymId as string) ?? undefined, crowded: !!a.crowded,
      });
      const p = planDay(input);
      return { academia: gymId, nome: p.name, porque: p.why, itens: p.items.map((i) => ({ id: i.exerciseId, nm: i.nm, sets: i.sets, reps: i.reps, alts: i.alts })), aquecimento: p.prehab.map((i) => i.exerciseId), fechaSemana: `${p.weekClosePct}%`, sugerirCompensatorio: p.suggestCompensatory };
    },
  },
  {
    name: "ciclo_salvar_treino_do_dia",
    description: "Salva o treino de um dia a partir de itens compactos. O servidor valida (aparelho, dor, tempo, prioridades) e recusa se houver erro.",
    inputSchema: obj({ date: S.date, gymId: { type: "string" }, daysLeft: { type: "integer" }, nome: { type: "string" }, motivo: { type: "string" }, itens: S.compactItems }, ["itens", "motivo"]),
    run: async (a, env) => saveCompact(env, a),
  },
  {
    name: "ciclo_responder_pedido",
    description: "Responde um pedido da caixa (o app mostra a resposta). Se 'itens' vier, vira o treino do dia após validação.",
    inputSchema: obj({ id: { type: "string" }, resposta: { type: "string", maxLength: 1200 }, date: S.date, daysLeft: { type: "integer" }, gymId: { type: "string" }, itens: S.compactItems, motivo: { type: "string" } }, ["id", "resposta"]),
    run: async (a, env) => {
      let change: unknown = null;
      if (Array.isArray(a.itens) && a.itens.length) change = await saveCompact(env, { ...a, motivo: a.motivo ?? a.resposta });
      await env.DB.prepare("UPDATE inbox SET status = 'respondido', response = ?2, change = ?3, answered_at = ?4 WHERE id = ?1")
        .bind(str(a.id, "id", 60), str(a.resposta, "resposta", 1200), change ? JSON.stringify(change) : null, Date.now()).run();
      return { ok: true, change };
    },
  },
  {
    name: "ciclo_marcar_presenca",
    description: "Marca fui / nao_fui / folga num dia (o app já marca 'fui' sozinho quando o treino é iniciado).",
    inputSchema: obj({ date: S.date, status: { type: "string", enum: ["fui", "nao_fui", "folga"] }, motivo: { type: "string" } }, ["date", "status"]),
    run: async (a, env) => {
      await env.DB.prepare("INSERT INTO attendance (date, status, reason, source, updated_at) VALUES (?1, ?2, ?3, 'claude', ?4) ON CONFLICT(date) DO UPDATE SET status=?2, reason=?3, source='claude', updated_at=?4")
        .bind(date(a.date), oneOf(a.status, "status", ["fui", "nao_fui", "folga"] as const), str(a.motivo, "motivo", 200, false), Date.now()).run();
      return { ok: true };
    },
  },
  {
    name: "ciclo_registrar_dor",
    description: `Registra dor no mapa. Regiões: ${PAIN_REGIONS.map((r) => r.id).join(", ")}. Intensidade 1 leve, 2 média, 3 forte. Dor forte/persistente: recomendar profissional.`,
    inputSchema: obj({ region: { type: "string", enum: PAIN_REGIONS.map((r) => r.id) }, intensity: { type: "integer", minimum: 1, maximum: 3 }, kind: { type: "string" }, context: { type: "string" } }, ["region", "intensity"]),
    run: async (a, env) => upsertPain(env, a),
  },
  {
    name: "ciclo_registrar_comida",
    description: "Registra o que a pessoa comeu (texto livre + sua estimativa de kcal/proteína com a tabela TACO). Aproximado é ok.",
    inputSchema: obj({ date: S.date, texto: { type: "string" }, kcal: { type: "number" }, proteina: { type: "number" }, confianca: { type: "string", enum: ["alta", "media", "baixa"] } }, ["texto"]),
    run: async (a, env) => {
      await env.DB.prepare("INSERT INTO food_log (id, date, raw_text, kcal, protein, confidence, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)")
        .bind(id(), a.date ? date(a.date) : today(), str(a.texto, "texto", 2000), a.kcal ?? null, a.proteina ?? null, (a.confianca as string) ?? "media", Date.now()).run();
      return { ok: true };
    },
  },
  {
    name: "ciclo_revisar_edicoes", readOnly: true,
    description: "Edições manuais do usuário aguardando revisão (ele pode conhecer melhor o exercício; revise com respeito e só aponte riscos).",
    inputSchema: obj({}),
    run: async (_a, env) => (await env.DB.prepare("SELECT id, date, edit, issues FROM plan_edit WHERE review = 'pendente' ORDER BY created_at DESC LIMIT 20").all()).results,
  },
  {
    name: "ciclo_concluir_revisao",
    description: "Conclui a revisão de uma edição manual: ok ou ajustar, com nota curta.",
    inputSchema: obj({ id: { type: "string" }, review: { type: "string", enum: ["ok", "ajustar"] }, nota: { type: "string" } }, ["id", "review"]),
    run: async (a, env) => {
      await env.DB.prepare("UPDATE plan_edit SET review = ?2, review_note = ?3 WHERE id = ?1").bind(str(a.id, "id", 60), oneOf(a.review, "review", ["ok", "ajustar"] as const), str(a.nota, "nota", 500, false)).run();
      return { ok: true };
    },
  },
];

async function saveCompact(env: Env, a: Args) {
  const d = a.date ? date(a.date) : today();
  const { input, gymId } = await buildDayInput(env, { date: d, daysLeft: int(a.daysLeft, "daysLeft", 1, 7, false) ?? 2, gymId: (a.gymId as string) ?? undefined });
  const { items, issues } = hydrate(a.itens as CompactItem[], input);
  const all = [...issues, ...validateItems(items, input)];
  if (all.some((i) => i.severity === "erro")) return { salvo: false, problemas: all };
  const setsTotal = items.reduce((s, i) => s + i.sets, 0);
  const base = planDay(input);
  const plan = { ...base, name: str(a.nome, "nome", 80, false) ?? base.name, items, setsTotal, estMinutes: setsTotal * 3, why: [str(a.motivo, "motivo", 600)!] };
  await env.DB.prepare("INSERT INTO day_plan (date, gym_id, plan, source, created_at) VALUES (?1, ?2, ?3, 'claude', ?4) ON CONFLICT(date) DO UPDATE SET gym_id=?2, plan=?3, source='claude', created_at=?4")
    .bind(d, gymId, JSON.stringify(plan), Date.now()).run();
  return { salvo: true, date: d, avisos: all, itens: items.map((i) => `${i.nm} ${i.sets}×${i.reps.join("–")}`) };
}

const INSTRUCTIONS = `Você é o treinador do app Ciclo (pt-BR, direto). Regras: 1) chame ciclo_estado antes de decidir; 2) nunca invente exercício: use IDs de ciclo_catalogo; 3) mande itens compactos (id + sets) — o servidor valida e hidrata; 4) semana flexível: 2× por músculo antes de bater volume, nunca compensar dobrado; 5) compensatório só se pedido; 6) edição manual do usuário é respeitada — revise apontando só riscos; 7) dor forte ou persistente: sugira profissional. Músculos: ${MUSCLE_IDS.map((m) => `${m}=${MUSCLES[m].nm}`).join(", ")}. Aparelhos: ${EQUIPMENT.map((e) => e.id).join(", ")}.`;

type Rpc = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Record<string, unknown> };
const ok = (rid: Rpc["id"], result: unknown) => ({ jsonrpc: "2.0", id: rid ?? null, result });
const err = (rid: Rpc["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: rid ?? null, error: { code, message } });

async function dispatch(m: Rpc, env: Env): Promise<unknown | null> {
  switch (m.method) {
    case "initialize": {
      const v = String(m.params?.protocolVersion ?? "");
      return ok(m.id, {
        protocolVersion: /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "2025-06-18",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "ciclo", version: env.APP_VERSION },
        instructions: INSTRUCTIONS,
      });
    }
    case "ping": return ok(m.id, {});
    case "tools/list":
      return ok(m.id, { tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema, annotations: { readOnlyHint: !!t.readOnly, destructiveHint: false } })) });
    case "tools/call": {
      const t = TOOLS.find((x) => x.name === m.params?.name);
      if (!t) return err(m.id, -32602, "ferramenta desconhecida");
      try {
        const out = await t.run((m.params?.arguments ?? {}) as Args, env);
        return ok(m.id, { content: [{ type: "text", text: JSON.stringify(out) }] });
      } catch (e) {
        const msg = e instanceof HttpError ? e.message : "erro interno";
        if (!(e instanceof HttpError)) console.error("mcp", t.name, e instanceof Error ? e.message : "erro");
        return ok(m.id, { isError: true, content: [{ type: "text", text: msg }] });
      }
    }
    default:
      if (m.method.startsWith("notifications/")) return null;
      return err(m.id, -32601, "método não suportado");
  }
}

export async function handleMcp(req: Request, env: Env): Promise<Response> {
  if (req.method !== "POST") return json(err(null, -32000, "use POST"), 405, { Allow: "POST" });
  const len = Number(req.headers.get("Content-Length") ?? "0");
  if (len > 128 * 1024) return json(err(null, -32600, "requisição grande demais"), 413);
  let body: Rpc | Rpc[];
  try { body = JSON.parse(await req.text()); } catch { return json(err(null, -32700, "JSON inválido"), 400); }
  const batch = Array.isArray(body) ? body.slice(0, 20) : [body];
  const out = (await Promise.all(batch.map((m) => dispatch(m, env)))).filter((x) => x !== null);
  if (!out.length) return new Response(null, { status: 202 });
  return json(Array.isArray(body) ? out : out[0]);
}

export const toolNames = TOOLS.map((t) => t.name);
