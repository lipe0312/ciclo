// #89 Chat responde com a chave da pessoa: laço de tool-calling com as MESMAS ferramentas do MCP (mesmo inputSchema validado
// antes do run, mesmo handler, mesma conta), propostas (Aprovar / Corrigir / Pedir alteração; nada grava antes) e as rotinas
// do Cron Trigger. A chave só existe dentro do callback de comChaveDoUsuario (cofre, teto e rate limit da #88): vai só no
// cabeçalho da chamada ao provedor; o modelo nunca a recebe e não há ferramenta de chave ou limite. Texto do usuário,
// anexos e retorno das ferramentas vão marcados como dado. Todo SQL com bind e filtrado por user_id; log sem dado pessoal.
import {
  CHAT_IA, FERRAMENTAS_PROPOSTA, NOME_ROTINA, ROTINAS_CHAT, fixarDataProposta, SISTEMA_CHAT, contextoDoChat, custoEstimadoChat, ferramentaDoChat, lerResposta,
  limparArgsProposta, montarPedido, motivoChat, pedeAChave, resultadoDeFerramenta, rotinaDevida, schemaDaProposta, textoDaRotina, turnoDoDono, validarRotina,
} from "@ciclo/core/cerebro-chat";
import type { Chamada, FerramentaChat, MotivoChat, RotinaChat, Turno } from "@ciclo/core/cerebro-chat";
import { PROVEDORES_IA, aparelhosFaltando, classify, custoIaUsd, hydrate, pedidoDaAcao, validarSchema, validateItems } from "@ciclo/core";
import type { CompactItem, ProvedorIa, Schema } from "@ciclo/core";
import type { Env } from "./env.ts";
import type { Handler } from "./comida.ts";
import { HttpError, id, json, oneOf, readJson, str } from "./http.ts";
import { EMPTY_MSG, buildDayInput, listGyms } from "./db.ts";
import { TOOLS, saveCompact } from "./mcp.ts";
import type { Tool } from "./mcp-tipos.ts";
import { today } from "./mcp-tipos.ts";
import { ciclo_contexto } from "./mcp-contexto.ts";
import { lerTreinoDoDia } from "./semana.ts";
import { mapaPersonalizados } from "./exercicio-personalizado.ts";
import { chamarProvedor, comChaveDoUsuario } from "./chaves.ts";
import { subirVersao } from "./versao.ts";

// ---------- ferramentas (as do MCP, pelo papel no Chat) ----------
// preguiçoso: mcp.ts importa (via mcp-chat.ts) este arquivo, então TOOLS só existe depois de carregar tudo
let cache: { porNome: Map<string, Tool>; lista: FerramentaChat[] } | null = null;
function doChat() {
  if (cache) return cache;
  const noChat = TOOLS.filter((t) => !t.oculta && ferramentaDoChat(t.name, !!t.readOnly) !== "fora");
  cache = {
    porNome: new Map(noChat.map((t) => [t.name, t] as const)),
    // o que o modelo vê: nome, descrição e schema do MCP (nas de proposta, sem simular/confirmar)
    lista: noChat.map((t) => ({ name: t.name, description: t.description, inputSchema: ferramentaDoChat(t.name, !!t.readOnly) === "propor" ? schemaDaProposta(t.inputSchema) : t.inputSchema })),
  };
  return cache;
}
const POR_NOME = { get: (n: string) => doChat().porNome.get(n) };
/** As ferramentas do Chat: as do MCP pelo papel no Chat (leitura e proposta). */
export const ferramentasChat = () => doChat().lista;

// ---------- prévia de cada proposta (nada grava) ----------
type Previa = { tipo: "treino"; data: string; nome?: string; antes: string[]; depois: string[]; avisos: string[] }
  | { tipo: "comida"; data: string; nDias: number; refeicoes: { refeicao: string; resumo: string; kcal: number; proteina: number }[]; totalDoDiaDepois: unknown; duvidas: string[]; escolha: boolean };
const linhaItem = (i: { nm: string; sets: number; reps: number[] }) => `${i.nm} ${i.sets}×${i.reps.join("–")}`;

/** Treino do dia: as mesmas checagens do saveCompact (academia da conta, aparelho, hidratação, validador), sem gravar. */
async function previaTreino(env: Env, uid: string, a: Record<string, unknown>): Promise<{ ok: true; previa: Previa } | { ok: false; problemas: string[] }> {
  const d = typeof a.date === "string" ? a.date : today();
  const gymId = typeof a.gymId === "string" ? a.gymId : undefined;
  if (gymId && !(await listGyms(env, uid)).some((g) => g.id === gymId)) return { ok: false, problemas: ["gymId: academia não encontrada nesta conta"] };
  const bi = await buildDayInput(env, uid, { date: d, daysLeft: typeof a.daysLeft === "number" ? a.daysLeft : 2, gymId });
  if (bi.empty) return { ok: false, problemas: [EMPTY_MSG[bi.empty]] };
  const itens = a.itens as CompactItem[];
  const falta = aparelhosFaltando(itens.map((i) => String(i?.id ?? "")), bi.input.equipment);
  if (falta.length) return { ok: false, problemas: falta.map((f) => `${f.id}: a academia não tem ${f.faltam.join(", ")} (troque com ciclo_treino_trocar)`) };
  const { items, issues } = hydrate(itens, bi.input, await mapaPersonalizados(env, uid, itens.map((i) => i?.id)));
  const todos = [...issues, ...validateItems(items, bi.input)];
  if (todos.some((i) => i.severity === "erro")) return { ok: false, problemas: todos.filter((i) => i.severity === "erro").map((i) => i.msg) };
  const atual = await lerTreinoDoDia(env, uid, d, today());
  return { ok: true, previa: { tipo: "treino", data: d, nome: typeof a.nome === "string" ? a.nome.slice(0, 80) : undefined, antes: (atual?.plan?.items ?? []).map(linhaItem), depois: items.map(linhaItem), avisos: todos.map((i) => i.msg).slice(0, 4) } };
}

/** Comida: a própria ferramenta do MCP com simular:true (só prévia, a preferência de aprovação não pula). */
async function previaComida(env: Env, uid: string, t: Tool, a: Record<string, unknown>): Promise<{ ok: true; previa: Previa } | { ok: false; problemas: string[] }> {
  const o = await t.run({ ...a, simular: true }, env, uid) as Record<string, any>;
  if (o?.previa !== true) return { ok: false, problemas: ["não deu para montar a prévia"] };
  const dias = Array.isArray(o.dias) ? o.dias : [o];
  const refeicoes = dias.flatMap((x: any) => (x.refeicoes ?? []).map((r: any) => ({ refeicao: String(r.refeicao), resumo: String(r.resumo ?? "").slice(0, 300), kcal: Math.round(Number(r.kcal) || 0), proteina: Math.round(Number(r.proteina) || 0) })));
  return { ok: true, previa: { tipo: "comida", data: String(dias[0]?.data ?? today()), nDias: dias.length, refeicoes, totalDoDiaDepois: dias[0]?.totalDoDiaDepois ?? null, duvidas: (o.duvidas ?? []).slice(0, 2).map(String), escolha: !!o.escolha } };
}

async function montarPrevia(env: Env, uid: string, nome: string, args: Record<string, unknown>) {
  const t = POR_NOME.get(nome);
  if (!t || !FERRAMENTAS_PROPOSTA.includes(nome)) return { ok: false as const, problemas: ["ferramenta indisponível no Chat"] };
  const erros = validarSchema(t.inputSchema as Schema, args);
  if (erros.length) return { ok: false as const, problemas: erros };
  try { return nome === "ciclo_salvar_treino_do_dia" ? await previaTreino(env, uid, args) : await previaComida(env, uid, t, args); }
  catch (e) { return { ok: false as const, problemas: [e instanceof HttpError ? e.message : "erro ao montar a prévia"] }; }
}

export interface PropostaOut { id: string; ferramenta: string; args: Record<string, unknown>; previa: Previa; status: string; resultado?: unknown; criadoEm: number }
/** O teto de args e previa na 0029 (CHECK length ≤ 16000): acima disso, recusa antes de gravar. */
const JSON_MAX = 16_000;
const cabe = (v: unknown) => JSON.stringify(v ?? null).length <= JSON_MAX;
type PropostaRow = { id: string; conversa_id: string | null; pedido_id: string | null; ferramenta: string; args: string; previa: string; status: string; resultado: string | null; criado_em: number };
const parse = (s: string | null) => { try { return s ? JSON.parse(s) : null; } catch { return null; } };
const outP = (r: PropostaRow): PropostaOut => ({ id: r.id, ferramenta: r.ferramenta, args: parse(r.args) ?? {}, previa: parse(r.previa), status: r.status, resultado: parse(r.resultado) ?? undefined, criadoEm: r.criado_em });

// ---------- o laço ----------
export type Origem = { conversaId?: string | null; pedidoId?: string | null };
export type RespostaChat = { ok: true; texto: string; propostas: PropostaOut[] } | { ok: false; motivo: MotivoChat; texto: string };

async function rodarLeitura(env: Env, uid: string, t: Tool, args: Record<string, unknown>): Promise<string> {
  const erros = validarSchema(t.inputSchema as Schema, args);
  if (erros.length) return resultadoDeFerramenta({ erro: `entrada inválida: ${erros.join("; ")}` });
  try { return resultadoDeFerramenta(await t.run(args, env, uid)); }
  catch (e) { return resultadoDeFerramenta({ erro: e instanceof HttpError ? e.message : "erro interno" }); }
}

/**
 * Responde uma mensagem com a chave ativa do provedor. Leituras rodam (mesma validação e handler do MCP); escrita vira
 * proposta gravada em chat_proposta (o domínio não muda). Cada rodada passa pelo teto e rate limit do cofre.
 */
export async function responderComChave(env: Env, uid: string, provedor: ProvedorIa, texto: string, hoje: string, origem: Origem,
  historico: readonly { papel: string; texto: string }[] = []): Promise<RespostaChat> {
  if (pedeAChave(texto)) return { ok: true, texto: motivoChat("chave_pedida"), propostas: [] };
  const pedido = pedidoDaAcao(classify(texto).action) ?? "resumo";
  const fatia = await ciclo_contexto({ pedido, date: hoje }, env, uid, hoje).catch(() => null);
  const turnos: Turno[] = [{ papel: "usuario", texto: turnoDoDono(texto, contextoDoChat(fatia), hoje, historico) }];
  const propostas: PropostaOut[] = [];
  let final = "";
  for (let rodada = 0; rodada < CHAT_IA.rodadasMax; rodada++) {
    const r = await comChaveDoUsuario(env, uid, provedor, (modelo) => custoEstimadoChat(provedor, modelo, turnos), async (k) => {
      const ped = montarPedido(provedor, { chave: k.chave, modelo: k.modelo, esforco: k.esforco, sistema: SISTEMA_CHAT, turnos, ferramentas: ferramentasChat() });
      const res = await chamarProvedor(ped.url, { method: "POST", headers: ped.headers, body: JSON.stringify(ped.body) });
      if (!res.ok) return null;
      const resp = lerResposta(provedor, res.json);
      if (!resp) return null;
      return { valor: resp, usdReal: custoIaUsd(provedor, k.modelo, resp.uso.in, resp.uso.out), tokensIn: resp.uso.in, tokensOut: resp.uso.out };
    });
    if (!r.ok) {
      if (!propostas.length) return { ok: false, motivo: r.motivo, texto: motivoChat(r.motivo) };
      break; // já há proposta: mostra o que deu (o motivo vai no texto)
    }
    const resp = r.valor;
    final = resp.texto || final;
    if (!resp.chamadas.length) break;
    const resultados: { id: string; nome: string; conteudo: string }[] = [];
    for (const c of resp.chamadas) resultados.push({ id: c.id, nome: c.nome, conteudo: await executar(env, uid, c, origem, propostas) });
    turnos.push({ papel: "ia", texto: resp.texto, chamadas: resp.chamadas, bruto: resp.bruto }, { papel: "ferramenta", resultados });
  }
  const saida = (final || (propostas.length ? "Montei a proposta abaixo: confira antes de aprovar." : motivoChat("falhou"))).slice(0, CHAT_IA.textoMax);
  return { ok: true, texto: saida, propostas };
}

/** Uma chamada de ferramenta do modelo. Nunca grava no domínio: leitura devolve o resultado; escrita vira proposta. */
async function executar(env: Env, uid: string, c: Chamada, origem: Origem, propostas: PropostaOut[]): Promise<string> {
  const t = POR_NOME.get(c.nome);
  const papel = t ? ferramentaDoChat(t.name, !!t.readOnly) : "fora";
  if (!t || papel === "fora") return resultadoDeFerramenta({ erro: "ferramenta indisponível no Chat" });
  if (papel === "ler") return rodarLeitura(env, uid, t, c.args);
  if (propostas.length >= CHAT_IA.propostasMax) return resultadoDeFerramenta({ erro: `no máximo ${CHAT_IA.propostasMax} propostas por resposta` });
  const pedidos = limparArgsProposta(c.args);
  const p = await montarPrevia(env, uid, t.name, pedidos);
  if (!p.ok) return resultadoDeFerramenta({ proposta: false, problemas: p.problemas, proximoPasso: "corrija e chame de novo (nada foi gravado)" });
  // aprovar noutro dia grava exatamente o dia que a prévia mostrou (sem recalcular "hoje"/"ontem")
  const args = fixarDataProposta(t.name, pedidos, p.previa, today());
  if (!cabe(args) || !cabe(p.previa)) return resultadoDeFerramenta({ proposta: false, problemas: ["proposta grande demais"], proximoPasso: "mande menos itens" });
  const pid = id(), now = Date.now();
  await env.DB.prepare("INSERT INTO chat_proposta (user_id, id, conversa_id, pedido_id, ferramenta, args, previa, status, criado_em) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'pendente', ?8)")
    .bind(uid, pid, origem.conversaId ?? null, origem.pedidoId ?? null, t.name, JSON.stringify(args), JSON.stringify(p.previa), now).run();
  propostas.push({ id: pid, ferramenta: t.name, args, previa: p.previa, status: "pendente", criadoEm: now });
  return resultadoDeFerramenta({ proposta: true, gravado: false, previa: p.previa, proximoPasso: "o app mostra a prévia com Aprovar, Corrigir e Pedir alteração; diga em 1 frase o que muda e não diga que gravou" });
}

// ---------- aprovar / corrigir / pedir alteração ----------
const ID = /^[A-Za-z0-9_-]{8,64}$/;
const idOk = (v: unknown, what: string) => { if (typeof v !== "string" || !ID.test(v)) throw new HttpError(404, `${what} não encontrada`); return v; };
/** Volta a proposta de 'aplicando' para 'pendente' (a gravação falhou ou a alteração não gerou proposta nova). */
const soltar = (env: Env, uid: string, pid: string) =>
  env.DB.prepare("UPDATE chat_proposta SET status = 'pendente' WHERE user_id = ?1 AND id = ?2 AND status = 'aplicando'").bind(uid, pid).run();
/** O resultado guardado é só registro: JSON válido e dentro do teto (senão, só o essencial). */
const resultadoCurto = (out: unknown) => { const t = JSON.stringify(out ?? null); return t.length <= JSON_MAX ? t : JSON.stringify({ gravado: true }); };
const lerProposta = (env: Env, uid: string, pid: string) =>
  env.DB.prepare("SELECT id, conversa_id, pedido_id, ferramenta, args, previa, status, resultado, criado_em FROM chat_proposta WHERE user_id = ?1 AND id = ?2").bind(uid, pid).first<PropostaRow>();

/** Grava de verdade, pelo mesmo caminho validado do MCP. Comida: prévia nova + confirmar (uso único). */
async function aplicar(env: Env, uid: string, ferramenta: string, args: Record<string, unknown>): Promise<unknown> {
  const t = POR_NOME.get(ferramenta);
  if (!t) throw new HttpError(400, "ferramenta indisponível");
  const erros = validarSchema(t.inputSchema as Schema, args);
  if (erros.length) throw new HttpError(400, `entrada inválida: ${erros.join("; ")}`);
  if (ferramenta === "ciclo_salvar_treino_do_dia") {
    const r = await saveCompact(env, uid, { ...args, motivo: typeof args.motivo === "string" && args.motivo ? args.motivo : "proposta do Chat aprovada" }) as { salvo?: boolean; motivo?: string; problemas?: { msg: string; severity: string }[] };
    if (!r.salvo) throw new HttpError(409, r.motivo ?? r.problemas?.filter((p) => p.severity === "erro").map((p) => p.msg).join("; ") ?? "o treino não passou na validação");
    return r;
  }
  const prev = await t.run({ ...args, simular: true }, env, uid) as { token?: string };
  if (!prev?.token) throw new HttpError(409, "não deu para montar a prévia de novo");
  return t.run({ confirmar: prev.token, ...(typeof args.modo === "string" && args.modo !== "auto" ? { modo: args.modo } : {}) }, env, uid);
}

export function registerChatIa(on: (m: string, p: string, h: Handler) => void) {
  /** Responde a última mensagem da pessoa na conversa (gravada antes por POST /api/conversas/mensagens) com a chave escolhida. */
  on("POST", "/api/chat/responder", async (req, env, _p, u) => {
    const b = await readJson<Record<string, unknown>>(req, 4 * 1024);
    const cid = idOk(b.conversaId, "conversa");
    const provedor = oneOf(b.provedor, "provedor", PROVEDORES_IA);
    const { results } = await env.DB.prepare("SELECT papel, texto FROM conversa_msg WHERE user_id = ?1 AND conversa_id = ?2 ORDER BY created_at DESC, id DESC LIMIT ?3")
      .bind(u.id, cid, CHAT_IA.historicoMax + 1).all<{ papel: string; texto: string }>();
    if (!results.length) throw new HttpError(404, "conversa não encontrada");
    const [ultima, ...antes] = results;
    if (ultima.papel !== "usuario") throw new HttpError(409, "a última mensagem já foi respondida");
    const r = await responderComChave(env, u.id, provedor, ultima.texto, today(), { conversaId: cid }, antes.reverse().filter((m) => m.papel !== "aviso"));
    const mid = id(), now = Date.now();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO conversa_msg (user_id, conversa_id, id, papel, texto, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)").bind(u.id, cid, mid, r.ok ? "ia" : "aviso", r.texto, now),
      env.DB.prepare("UPDATE conversa SET updated_at = ?3 WHERE user_id = ?1 AND id = ?2").bind(u.id, cid, now),
    ]);
    return json({ mensagem: { id: mid, papel: r.ok ? "ia" : "aviso", texto: r.texto, criadaEm: now }, propostas: r.ok ? r.propostas : [], motivo: r.ok ? undefined : r.motivo });
  });

  on("GET", "/api/chat/propostas", async (req, env, _p, u) => {
    const cid = new URL(req.url).searchParams.get("conversaId");
    const { results } = await env.DB.prepare("SELECT id, conversa_id, pedido_id, ferramenta, args, previa, status, resultado, criado_em FROM chat_proposta WHERE user_id = ?1 AND (?2 IS NULL OR conversa_id = ?2) ORDER BY criado_em DESC LIMIT 50")
      .bind(u.id, cid && ID.test(cid) ? cid : null).all<PropostaRow>();
    return json({ propostas: results.map(outP) });
  });

  /** Aprovar (com `args` = Corrigir: a edição do card, validada de novo). Só uma aprovação passa (UPDATE atômico). */
  on("POST", "/api/chat/propostas/:id/aprovar", async (req, env, p, u) => {
    const b = await readJson<Record<string, unknown>>(req, JSON_MAX + 512);
    const pid = idOk(p.id, "proposta");
    const atual = await lerProposta(env, u.id, pid);
    if (!atual) throw new HttpError(404, "proposta não encontrada");
    const previa = parse(atual.previa) as { data?: string } | null;
    let args = b.args != null ? limparArgsProposta(b.args) : parse(atual.args) ?? {};
    // Corrigir não muda o dia mostrado na prévia: treino sempre no dia da prévia; comida sem data explícita, idem
    if (b.args != null && typeof previa?.data === "string") {
      if (atual.ferramenta === "ciclo_salvar_treino_do_dia") args = { ...args, date: previa.data };
      else if (args.data == null && args.dias == null) args = { ...args, data: previa.data };
    }
    if (!cabe(args)) throw new HttpError(413, "correção grande demais");
    const trava = await env.DB.prepare("UPDATE chat_proposta SET status = 'aplicando' WHERE user_id = ?1 AND id = ?2 AND status = 'pendente' RETURNING id").bind(u.id, pid).first();
    if (!trava) throw new HttpError(409, `esta proposta já foi ${atual.status === "aprovada" ? "aprovada" : "resolvida"}`);
    let out: unknown;
    try { out = await aplicar(env, u.id, atual.ferramenta, args); }
    catch (e) {
      await soltar(env, u.id, pid);
      throw e instanceof HttpError ? e : new HttpError(500, "não deu para aplicar agora");
    }
    const now = Date.now();
    // gravou: a proposta sai de 'aplicando' mesmo se o resultado não couber (o resultado é só registro)
    await env.DB.batch([
      env.DB.prepare("UPDATE chat_proposta SET status = 'aprovada', args = ?3, resultado = ?4, resolvido_em = ?5 WHERE user_id = ?1 AND id = ?2").bind(u.id, pid, JSON.stringify(args), resultadoCurto(out), now),
      // a proposta de um pedido da rotina aplica o pedido (sai da faixa)
      env.DB.prepare("UPDATE inbox SET status = 'aplicado' WHERE user_id = ?1 AND id = ?2").bind(u.id, atual.pedido_id ?? ""),
    ]);
    await subirVersao(env, u.id); // #114 o app aberto atualiza
    return json({ proposta: outP({ ...atual, args: JSON.stringify(args), status: "aprovada", resultado: JSON.stringify(out ?? null) }) });
  });

  on("POST", "/api/chat/propostas/:id/descartar", async (_req, env, p, u) => {
    const pid = idOk(p.id, "proposta");
    const r = await env.DB.prepare("UPDATE chat_proposta SET status = 'descartada', resolvido_em = ?3 WHERE user_id = ?1 AND id = ?2 AND status = 'pendente' RETURNING id").bind(u.id, pid, Date.now()).first();
    if (!r) throw new HttpError(404, "proposta não encontrada ou já resolvida");
    return json({ ok: true });
  });

  /** Pedir alteração: o texto volta ao modelo com a proposta anterior (como dado); a anterior sai e a nova vem como proposta. */
  on("POST", "/api/chat/propostas/:id/alterar", async (req, env, p, u) => {
    const b = await readJson<Record<string, unknown>>(req, 4 * 1024);
    const pid = idOk(p.id, "proposta");
    const pedido = str(b.texto, "texto", 1000)!.trim();
    if (!pedido) throw new HttpError(400, "diga o que mudar");
    const provedor = oneOf(b.provedor, "provedor", PROVEDORES_IA);
    const atual = await lerProposta(env, u.id, pid);
    if (!atual) throw new HttpError(404, "proposta não encontrada");
    // trava (atômico): duas alterações ou alterar + aprovar juntos → só uma passa
    const trava = await env.DB.prepare("UPDATE chat_proposta SET status = 'aplicando' WHERE user_id = ?1 AND id = ?2 AND status = 'pendente' RETURNING id").bind(u.id, pid).first();
    if (!trava) throw new HttpError(409, "esta proposta já foi resolvida");
    const texto = `Pedido de alteração da proposta (${atual.ferramenta}): ${pedido}`;
    const anterior = [{ papel: "ia", texto: `Proposta anterior (${atual.ferramenta}): ${atual.args}` }];
    let r: RespostaChat;
    try { r = await responderComChave(env, u.id, provedor, texto, today(), { conversaId: atual.conversa_id, pedidoId: atual.pedido_id }, anterior); }
    catch (e) { await soltar(env, u.id, pid); throw e instanceof HttpError ? e : new HttpError(500, "não deu para pedir a alteração agora"); }
    // só sai ('alterada') quando a nova proposta existe; senão a anterior continua valendo
    if (r.ok && r.propostas.length) await env.DB.prepare("UPDATE chat_proposta SET status = 'alterada', resolvido_em = ?3 WHERE user_id = ?1 AND id = ?2 AND status = 'aplicando'").bind(u.id, pid, Date.now()).run();
    else await soltar(env, u.id, pid);
    if (atual.conversa_id) {
      const now = Date.now();
      await env.DB.batch([
        env.DB.prepare("INSERT INTO conversa_msg (user_id, conversa_id, id, papel, texto, created_at) SELECT ?1, ?2, ?3, 'usuario', ?4, ?5 WHERE EXISTS (SELECT 1 FROM conversa WHERE user_id = ?1 AND id = ?2)").bind(u.id, atual.conversa_id, id(), texto.slice(0, 4000), now),
        env.DB.prepare("INSERT INTO conversa_msg (user_id, conversa_id, id, papel, texto, created_at) SELECT ?1, ?2, ?3, ?4, ?5, ?6 WHERE EXISTS (SELECT 1 FROM conversa WHERE user_id = ?1 AND id = ?2)").bind(u.id, atual.conversa_id, id(), r.ok ? "ia" : "aviso", r.texto, now + 1),
      ]);
    }
    return json({ mensagem: { id: id(), papel: r.ok ? "ia" : "aviso", texto: r.texto, criadaEm: Date.now() }, propostas: r.ok ? r.propostas : [], motivo: r.ok ? undefined : r.motivo, anterior: r.ok && r.propostas.length ? "alterada" : "pendente" });
  });

  // ---- rotinas ----
  on("GET", "/api/chat/rotinas", async (_req, env, _p, u) => {
    const { results } = await env.DB.prepare("SELECT rotina, ligada, hora, provedor, ultima_dia FROM rotina_chat WHERE user_id = ?1").bind(u.id).all<{ rotina: RotinaChat; ligada: number; hora: number; provedor: ProvedorIa; ultima_dia: string | null }>();
    return json({ rotinas: ROTINAS_CHAT.map((r) => { const x = results.find((y) => y.rotina === r); return { rotina: r, nome: NOME_ROTINA[r], ligada: !!x?.ligada, hora: x?.hora ?? 9, provedor: x?.provedor ?? null, ultimaDia: x?.ultima_dia ?? null }; }) });
  });
  on("PUT", "/api/chat/rotinas/:rotina", async (req, env, p, u) => {
    const rotina = oneOf(p.rotina, "rotina", ROTINAS_CHAT);
    const v = validarRotina(await readJson(req, 1024));
    if (!v.ok) throw new HttpError(400, v.erro);
    await env.DB.prepare(`INSERT INTO rotina_chat (user_id, rotina, ligada, hora, provedor, atualizado_em) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
      ON CONFLICT(user_id, rotina) DO UPDATE SET ligada = ?3, hora = ?4, provedor = ?5, atualizado_em = ?6`).bind(u.id, rotina, v.valor.ligada ? 1 : 0, v.valor.hora, v.valor.provedor, Date.now()).run();
    return json({ rotina, ...v.valor });
  });
}

// ---------- Cron Trigger ----------
const ACAO_ROTINA: Record<Exclude<RotinaChat, "pedidos">, { acao: string; tier: string }> = { revisao: { acao: "revisao_semana", tier: "opus" }, comida: { acao: "registrar_comida", tier: "haiku" } };

/** Responde um pedido da caixa com a chave: vira "respondido" com as propostas (nunca escrita direta). */
async function responderPedido(env: Env, uid: string, provedor: ProvedorIa, pedidoId: string, texto: string, hoje: string, real: boolean): Promise<MotivoChat | null> {
  const r = await responderComChave(env, uid, provedor, texto, hoje, { pedidoId });
  // pedido real da pessoa sem resposta (teto, limite, pausada, sem chave, cofre, falha): continua pendente para o conector/rotina do Claude.
  // pedido criado pela própria rotina: no teto/limite fica a mensagem fixa (a pessoa vê por que não rodou); falha de rede: pendente
  if (!r.ok && (real || r.motivo === "falhou")) return r.motivo;
  const change = r.ok && r.propostas.length ? { propostas: r.propostas } : null;
  await env.DB.prepare("UPDATE inbox SET status = 'respondido', response = ?3, change = ?4, answered_at = ?5 WHERE user_id = ?1 AND id = ?2 AND status = 'pendente'")
    .bind(uid, pedidoId, r.texto.slice(0, 1200), change ? JSON.stringify(change) : null, Date.now()).run();
  return r.ok ? null : r.motivo;
}

/** Roda as rotinas ligadas desta hora (Brasília), no máximo `max` contas por passada, uma vez por dia cada. */
export async function rodarRotinas(env: Env, agora = Date.now(), max = 25): Promise<number> {
  const sp = new Date(agora - 3 * 3600e3), hora = sp.getUTCHours(), hoje = sp.toISOString().slice(0, 10);
  // só as que ainda não rodaram hoje: as já feitas não ocupam o lote (contas além de `max` não ficam sem vez)
  const { results } = await env.DB.prepare("SELECT user_id, rotina, hora, provedor, ultima_dia FROM rotina_chat WHERE ligada = 1 AND hora = ?1 AND (ultima_dia IS NULL OR ultima_dia < ?3) ORDER BY atualizado_em LIMIT ?2")
    .bind(hora, max, hoje).all<{ user_id: string; rotina: RotinaChat; hora: number; provedor: ProvedorIa; ultima_dia: string | null }>();
  let n = 0;
  for (const r of results) {
    const dia = rotinaDevida({ rotina: r.rotina, hora: r.hora, ultimaDia: r.ultima_dia }, agora);
    if (!dia) continue;
    // marca antes (atômico): duas passadas juntas não rodam a mesma rotina duas vezes
    const marca = await env.DB.prepare("UPDATE rotina_chat SET ultima_dia = ?3 WHERE user_id = ?1 AND rotina = ?2 AND ligada = 1 AND (ultima_dia IS NULL OR ultima_dia < ?3) RETURNING rotina").bind(r.user_id, r.rotina, dia).first();
    if (!marca) continue;
    try {
      if (r.rotina === "pedidos") {
        const { results: pend } = await env.DB.prepare("SELECT id, text FROM inbox WHERE user_id = ?1 AND status = 'pendente' ORDER BY created_at LIMIT 3").bind(r.user_id).all<{ id: string; text: string }>();
        for (const x of pend) if (await responderPedido(env, r.user_id, r.provedor, x.id, x.text, dia, true)) break; // sem resposta: para (a fila fica)
      } else {
        const a = ACAO_ROTINA[r.rotina], pid = id();
        await env.DB.prepare("INSERT INTO inbox (user_id, id, created_at, text, action, tier) VALUES (?1, ?2, ?3, ?4, ?5, ?6)").bind(r.user_id, pid, Date.now(), NOME_ROTINA[r.rotina], a.acao, a.tier).run();
        await responderPedido(env, r.user_id, r.provedor, pid, textoDaRotina(r.rotina), dia, false);
      }
      n++;
    } catch (e) { console.error("rotina", r.rotina, e instanceof Error ? e.name : "erro"); } // sem dado pessoal
  }
  return n;
}
