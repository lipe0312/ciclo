// #88 Chaves de API próprias (BYOK), ADR-0015: cadastro, troca, desativar, apagar e o uso pelo Worker.
// - A chave só existe em claro: no corpo do POST/PUT (validada e cifrada na hora) e numa variável local de
//   `comChaveDoUsuario` durante UMA chamada ao provedor. Nunca volta ao app (só ••••últimos4 e a impressão),
//   nunca vai para log, env, cache, KV, mensagem de erro, export nem backup em claro. Não existe "revelar" (#138,
//   decisão do dono de 22/11: o padrão de OpenAI, Anthropic, GitHub e Stripe é mostrar o segredo só na criação).
// - #138 Prova assimétrica (provaExigida no core): baixar teto, desativar, cancelar subida e apagar valem com a sessão
//   normal (reduzir risco nunca pede prova); subir teto, ativar e trocar o segredo pedem Face ID dos últimos 60 s;
//   cadastrar e ajustes (apelido, modelo, esforço) seguem com os 5 min da #88.
// - #138 Subida de teto fica pendente 24 h (banco/cartão: aumento de limite com prazo); uma baixa cancela a pendente.
// - Saída só para os hosts da allowlist do core (#133: + openrouter.ai e api.deepseek.com), sem seguir redirect; o corpo de erro do provedor é descartado.
// - Teto de gasto por chave (dia e mês) E da conta (soma das chaves, #138) reservados num único UPDATE atômico antes de
//   chamar; disjuntor de velocidade (#138) pausa a chave e só o Face ID reativa; rate limit por conta.
// - A IA (MCP e Chat) não tem ferramenta para nada disto: só as rotas /api/account, atrás da sessão (teste de paridade).
// - Todo SQL com bind e filtrado por user_id. Nada de segredo ou dado pessoal em log.
import {
  CHAVE_LIMITE_USO, CHAVE_LIMITE_VALIDAR, CHAVE_REAUTH_LIMITE_MS, CHAVE_TETO_CONTA_CENT, CHAVE_TIMEOUT_MS, DISJUNTOR, ESFORCOS, MAX_CHAVES_POR_CONTA, MOTIVO_PAUSA,
  NOME_PROVEDOR, PROVEDORES_IA, aadChave, alertaConsumo, aplicarPendente, cabeNoTetoConta, chaveGratis, cifrarChave, classificarModelo, configOpenai, decifrarChave,
  diaUtc, disjuntor, estadoConector, filtrarModelos, hostPermitido, impressaoChave, importarKek, kekAtual, lerKeks, lerListaModelos, mensagemErroProvedor,
  modeloPadrao, pedidosValidar, planejarTetos, provaExigida, textoAlertaConsumo, ultimos4, validarApelido, validarChaveFormato, validarTetos,
} from "@ciclo/core";
import type { Esforco, MotivoPausa, ProvaChave, ProvedorIa, SubidaPendente } from "@ciclo/core";
import type { AuthUser, Env } from "./env.ts";
import { HttpError, json, oneOf, readJson } from "./http.ts";
import { exigirFaceId } from "./auth-conta.ts";
import { contarJanela } from "./limites.ts";
import { sha256Hex } from "./auth.ts";

type Handler = (req: Request, env: Env, p: Record<string, string>, u: AuthUser) => Promise<Response>;
type Row = {
  id: string; provedor: ProvedorIa; apelido: string; ultimos4: string; impressao: string; modelos_json: string; modelo: string | null;
  esforco: Esforco; teto_dia: number; teto_mes: number; criado_em: number; usado_em: number | null; ativo: number;
  teto_dia_pend: number | null; teto_mes_pend: number | null; pend_vale_em: number | null; pausada_em: number | null; pausa_motivo: MotivoPausa | null; aviso_gratis_em: number | null;
};
type Segredo = { ciphertext: string; iv: string; dek_cifrada: string; kek_versao: number };
type Evento = { tipo: string; codigo: string | null; em: number };
const META = `id, provedor, apelido, ultimos4, impressao, modelos_json, modelo, esforco, teto_dia, teto_mes, criado_em, usado_em, ativo,
  teto_dia_pend, teto_mes_pend, pend_vale_em, pausada_em, pausa_motivo, aviso_gratis_em`;
const HISTORICO_POR_CHAVE = 8;

const modelosDe = (r: Row): string[] => { try { const a = JSON.parse(r.modelos_json); return Array.isArray(a) ? a.filter((x) => typeof x === "string") : []; } catch { return []; } };
const pendDe = (r: Row): SubidaPendente | null =>
  r.pend_vale_em != null && r.teto_dia_pend != null && r.teto_mes_pend != null ? { dia: r.teto_dia_pend, mes: r.teto_mes_pend, valeEm: r.pend_vale_em } : null;
const codTetos = (t: { dia: number; mes: number }) => `d${t.dia}m${t.mes}`;
/** O que o app vê: metadados, gasto, pendência, pausa e a trilha. Nunca ciphertext, iv, DEK nem a chave. */
function meta(r: Row, g?: { dia: number; mes: number }, historico: Evento[] = []) {
  const pend = pendDe(r);
  return {
    id: r.id, provedor: r.provedor, nomeProvedor: NOME_PROVEDOR[r.provedor], apelido: r.apelido, mascara: `••••${r.ultimos4}`, impressao: r.impressao,
    modelos: filtrarModelos(r.provedor, modelosDe(r)).map((m) => ({ id: m.id, familia: m.familia })), modelo: r.modelo, esforco: r.esforco,
    tetoDia: r.teto_dia / 100, tetoMes: r.teto_mes / 100, gastoDia: (g?.dia ?? 0) / 1e6, gastoMes: (g?.mes ?? 0) / 1e6,
    criadoEm: r.criado_em, usadoEm: r.usado_em, ativo: !!r.ativo,
    pendente: pend ? { tetoDia: pend.dia / 100, tetoMes: pend.mes / 100, valeEm: pend.valeEm } : null,
    pausada: r.pausada_em != null ? { em: r.pausada_em, motivo: r.pausa_motivo, texto: r.pausa_motivo ? MOTIVO_PAUSA[r.pausa_motivo] : "pausada" } : null,
    alerta: alertaConsumo({ gastoDiaMicro: g?.dia ?? 0, gastoMesMicro: g?.mes ?? 0, tetoDiaCent: r.teto_dia, tetoMesCent: r.teto_mes }),
    gratisAceitoEm: r.aviso_gratis_em, historico,
  };
}

const kekDe = async (env: Env, versao?: number) => {
  const ks = lerKeks(env as unknown as Record<string, unknown>);
  const k = versao ? (ks.has(versao) ? { versao, b64: ks.get(versao)! } : null) : kekAtual(ks);
  return k ? { versao: k.versao, b64: k.b64, kek: await importarKek(k.b64) } : null;
};
const evento = (env: Env, uid: string, chaveId: string, tipo: string, codigo: string | null = null, now = Date.now()) =>
  env.DB.prepare("INSERT INTO chave_ia_evento (user_id, chave_id, tipo, codigo, criado_em) VALUES (?1, ?2, ?3, ?4, ?5)").bind(uid, chaveId, tipo, codigo, now);
/** Evento só se o comando anterior do lote mudou uma linha (corrida entre duas leituras não grava duas vezes). */
const eventoSeMudou = (env: Env, uid: string, chaveId: string, tipo: string, codigo: string | null, now: number) =>
  env.DB.prepare("INSERT INTO chave_ia_evento (user_id, chave_id, tipo, codigo, criado_em) SELECT ?1, ?2, ?3, ?4, ?5 WHERE changes() > 0").bind(uid, chaveId, tipo, codigo, now);
const limiteConta = async (env: Env, uid: string, tipo: "validar" | "uso", now = Date.now()) =>
  contarJanela(env, `chave_${tipo}:${(await sha256Hex(`chave:${uid}`)).slice(0, 32)}`, tipo === "validar" ? CHAVE_LIMITE_VALIDAR : CHAVE_LIMITE_USO, now);
/** Prova pedida pela mudança (provaExigida no core): sessão, Face ID de 5 min ou de 60 s. */
function exigirProva(u: AuthUser, p: ProvaChave, now = Date.now()) {
  if (p === "faceid") exigirFaceId(u, now);
  else if (p === "faceid60") exigirFaceId(u, now, CHAVE_REAUTH_LIMITE_MS);
}

/** fetch só para host da allowlist, sem seguir redirect (cabeçalho com a chave não sai do host) e com prazo.
 *  Erro do provedor: o corpo é descartado sem ler; volta só o código. */
export async function chamarProvedor(url: string, init: RequestInit): Promise<{ ok: true; json: unknown } | { ok: false; status: number }> {
  if (!hostPermitido(url)) return { ok: false, status: 0 };
  try {
    const r = await fetch(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(CHAVE_TIMEOUT_MS) });
    if (!r.ok) { await r.body?.cancel().catch(() => {}); return { ok: false, status: r.status || 0 }; }
    return { ok: true, json: await r.json().catch(() => null) };
  } catch { return { ok: false, status: 0 }; }
}

/** Valida a chave com a chamada barata (listar modelos). Falhou → HttpError com mensagem fixa (nunca o corpo). */
async function validarNoProvedor(env: Env, uid: string, chaveId: string, provedor: ProvedorIa, chave: string): Promise<string[]> {
  // #133 OpenRouter: 1º o endpoint da chave (autentica), depois a lista de modelos; nos outros, a lista já autentica
  let r: Awaited<ReturnType<typeof chamarProvedor>> = { ok: false, status: 0 };
  for (const ped of pedidosValidar(provedor, chave)) {
    r = await chamarProvedor(ped.url, { method: "GET", headers: ped.headers });
    if (!r.ok) break;
  }
  if (!r.ok) {
    const e = mensagemErroProvedor(r.status);
    await evento(env, uid, chaveId, "falhou", `${e.code}:${r.status}`).run();
    throw new HttpError(422, e.msg, e.code);
  }
  const modelos = filtrarModelos(provedor, lerListaModelos(provedor, r.json)).map((m) => m.id);
  if (!modelos.length) {
    await evento(env, uid, chaveId, "falhou", "sem_modelo").run();
    throw new HttpError(422, "A chave funciona, mas não acessa nenhum modelo de texto que o app usa.", "sem_modelo");
  }
  return modelos;
}

/** #138 Aplica as subidas pendentes cujo prazo de 24 h passou (na leitura e no uso; regra em aplicarPendente no core). */
async function aplicarPendentes(env: Env, uid: string, now: number) {
  const { results } = await env.DB.prepare(`SELECT ${META} FROM chave_ia WHERE user_id = ?1 AND pend_vale_em IS NOT NULL AND pend_vale_em <= ?2`).bind(uid, now).all<Row>();
  if (!results.length) return;
  await env.DB.batch(results.flatMap((r) => {
    const a = aplicarPendente({ dia: r.teto_dia, mes: r.teto_mes }, pendDe(r), now);
    if (a.pendente) return [];
    return [
      env.DB.prepare(`UPDATE chave_ia SET teto_dia = ?3, teto_mes = ?4, teto_dia_pend = NULL, teto_mes_pend = NULL, pend_vale_em = NULL
        WHERE id = ?1 AND user_id = ?2 AND pend_vale_em = ?5`).bind(r.id, uid, a.tetos.dia, a.tetos.mes, r.pend_vale_em),
      eventoSeMudou(env, uid, r.id, a.aplicou ? "subida_aplicada" : "subida_cancelada", a.aplicou ? codTetos(a.tetos) : "invalida", now),
    ];
  }));
}

async function linha(env: Env, uid: string, id: string) {
  const r = await env.DB.prepare(`SELECT ${META} FROM chave_ia WHERE id = ?1 AND user_id = ?2`).bind(id, uid).first<Row>();
  if (!r) throw new HttpError(404, "chave não encontrada");
  return r;
}
async function gastos(env: Env, uid: string, now = Date.now()) {
  const dia = diaUtc(now), mes = dia.slice(0, 8) + "01";
  const { results } = await env.DB.prepare(`SELECT chave_id, SUM(CASE WHEN dia = ?2 THEN usd_micro ELSE 0 END) AS dia, SUM(usd_micro) AS mes
    FROM chave_ia_uso WHERE user_id = ?1 AND dia >= ?3 GROUP BY chave_id`).bind(uid, dia, mes).all<{ chave_id: string; dia: number; mes: number }>();
  return new Map(results.map((g) => [g.chave_id, g]));
}
/** Trilha de cada chave (os mais recentes primeiro), sem segredo: tipo, código curto e data. */
async function historicos(env: Env, uid: string, ids: string[]) {
  const m = new Map<string, Evento[]>();
  if (!ids.length) return m;
  // os N mais recentes POR chave (eventos "teto" de uma chave não empurram a pausa ou a subida de outra para fora)
  const { results } = await env.DB.prepare(`SELECT chave_id, tipo, codigo, criado_em FROM (
      SELECT chave_id, tipo, codigo, criado_em, id, ROW_NUMBER() OVER (PARTITION BY chave_id ORDER BY id DESC) AS n
      FROM chave_ia_evento WHERE user_id = ?1 AND chave_id IN (SELECT value FROM json_each(?2))) WHERE n <= ?3 ORDER BY id DESC`)
    .bind(uid, JSON.stringify(ids), HISTORICO_POR_CHAVE).all<{ chave_id: string; tipo: string; codigo: string | null; criado_em: number }>();
  for (const e of results) {
    const l = m.get(e.chave_id) ?? [];
    if (l.length < HISTORICO_POR_CHAVE) l.push({ tipo: e.tipo, codigo: e.codigo, em: e.criado_em });
    m.set(e.chave_id, l);
  }
  return m;
}
async function metaCompleta(env: Env, uid: string, id: string, now = Date.now()) {
  const r = await linha(env, uid, id);
  const [g, h] = await Promise.all([gastos(env, uid, now), historicos(env, uid, [id])]);
  return meta(r, g.get(id), h.get(id));
}
const corpoChave = async (req: Request) => readJson<Record<string, unknown>>(req, 4 * 1024);

export function registerChaves(on: (method: string, path: string, h: Handler) => void) {
  on("GET", "/api/account/chaves", async (_req, env, _p, u) => {
    const now = Date.now();
    await aplicarPendentes(env, u.id, now);
    const { results } = await env.DB.prepare(`SELECT ${META} FROM chave_ia WHERE user_id = ?1 ORDER BY criado_em`).bind(u.id).all<Row>();
    const [g, h] = await Promise.all([gastos(env, u.id, now), historicos(env, u.id, results.map((r) => r.id))]);
    return json({
      chaves: results.map((r) => meta(r, g.get(r.id), h.get(r.id))), max: MAX_CHAVES_POR_CONTA, cofre: !!kekAtual(lerKeks(env as unknown as Record<string, unknown>)),
      provedores: PROVEDORES_IA.map((id) => ({ id, nome: NOME_PROVEDOR[id] })), padraoServidor: { openai: configOpenai(env).ligado },
      tetoConta: CHAVE_TETO_CONTA_CENT.mes / 100,
    });
  });

  // #133 Sua IA: o mínimo para o aviso e o status (estadoIA no core): conexão MCP (ativa, pendente, expirada) e quais
  // provedores têm chave ativa. #138 + o aviso de consumo (≥ 80% do teto) para o Hoje. Nada de segredo, só da conta da sessão.
  on("GET", "/api/account/ia", async (_req, env, _p, u) => {
    const now = Date.now();
    await aplicarPendentes(env, u.id, now);
    const [toks, ks, g] = await Promise.all([
      env.DB.prepare("SELECT created_at AS createdAt, last_used_at AS lastUsedAt, revoked_at AS revokedAt FROM mcp_token WHERE user_id = ?1 AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 50")
        .bind(u.id).all<{ createdAt: number; lastUsedAt: number | null; revokedAt: number | null }>(),
      env.DB.prepare("SELECT id, provedor, apelido, ativo, teto_dia, teto_mes FROM chave_ia WHERE user_id = ?1 ORDER BY criado_em")
        .bind(u.id).all<{ id: string; provedor: ProvedorIa; apelido: string; ativo: number; teto_dia: number; teto_mes: number }>(),
      gastos(env, u.id, now),
    ]);
    const porProvedor = new Map<ProvedorIa, boolean>();
    for (const k of ks.results) porProvedor.set(k.provedor, (porProvedor.get(k.provedor) ?? false) || !!k.ativo);
    const consumo = ks.results.filter((k) => k.ativo).flatMap((k) => {
      const a = alertaConsumo({ gastoDiaMicro: g.get(k.id)?.dia ?? 0, gastoMesMicro: g.get(k.id)?.mes ?? 0, tetoDiaCent: k.teto_dia, tetoMesCent: k.teto_mes });
      return a ? [{ id: k.id, texto: textoAlertaConsumo(k.apelido, a), pct: a.pct }] : [];
    });
    return json({ conector: estadoConector(toks.results, now), chaves: [...porProvedor].map(([provedor, ativo]) => ({ provedor, ativo })), consumo });
  });

  on("POST", "/api/account/chaves", async (req, env, _p, u) => {
    exigirProva(u, provaExigida({ cadastra: true }));
    const b = await corpoChave(req);
    const k = await kekDe(env);
    if (!k) throw new HttpError(503, "O cofre de chaves não está ligado neste servidor.", "cofre_desligado");
    const provedor = oneOf(b.provedor, "provedor", PROVEDORES_IA);
    // #138 o "Entendi" do aviso de chave grátis vale no servidor: sem ele, nem chega ao provedor
    const gratis = chaveGratis(provedor);
    if (gratis && b.aceiteAvisoGratis !== true) throw new HttpError(400, "Leia o aviso da chave grátis e toque em Entendi.", "aceite_gratis");
    const ap = validarApelido(b.apelido ?? NOME_PROVEDOR[provedor]);
    if (!ap.ok) throw new HttpError(400, ap.erro);
    const tt = validarTetos(b.tetoDia, b.tetoMes);
    if (!tt.ok) throw new HttpError(400, tt.erro);
    const f = validarChaveFormato(provedor, b.chave);
    if (!f.ok) throw new HttpError(400, f.erro);
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM chave_ia WHERE user_id = ?1").bind(u.id).first<{ n: number }>();
    if ((n?.n ?? 0) >= MAX_CHAVES_POR_CONTA) throw new HttpError(409, `até ${MAX_CHAVES_POR_CONTA} chaves por conta`, "limite_chaves");
    const wait = await limiteConta(env, u.id, "validar");
    if (wait) return json({ error: "muitas validações de chave; tente de novo mais tarde" }, 429, { "Retry-After": String(wait) });
    const id = crypto.randomUUID();
    const modelos = await validarNoProvedor(env, u.id, id, provedor, f.chave);
    const e = await cifrarChave(k.kek, k.versao, aadChave(u.id, provedor, id), f.chave);
    const now = Date.now();
    // o teto de chaves é conferido no próprio INSERT (corrida entre dois cadastros); sem linha, sem evento
    const ins = await env.DB.prepare(`INSERT INTO chave_ia (id, user_id, provedor, apelido, ultimos4, impressao, ciphertext, iv, dek_cifrada, kek_versao, modelos_json, modelo, esforco, teto_dia, teto_mes, criado_em, ativo, aviso_gratis_em)
        SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 'medio', ?13, ?14, ?15, 1, ?17 WHERE (SELECT COUNT(*) FROM chave_ia WHERE user_id = ?2) < ?16 RETURNING id`)
      .bind(id, u.id, provedor, ap.valor, ultimos4(f.chave), await impressaoChave(k.b64, u.id, f.chave), e.ciphertext, e.iv, e.dekCifrada, e.kekVersao,
        JSON.stringify(modelos), modeloPadrao(provedor, modelos), tt.dia, tt.mes, now, MAX_CHAVES_POR_CONTA, gratis ? now : null).first<{ id: string }>();
    if (!ins) throw new HttpError(409, `até ${MAX_CHAVES_POR_CONTA} chaves por conta`, "limite_chaves");
    await env.DB.batch([evento(env, u.id, id, "criada", null, now), evento(env, u.id, id, "validada", null, now), ...(gratis ? [evento(env, u.id, id, "aviso_aceito", provedor, now)] : [])]);
    return json({ chave: await metaCompleta(env, u.id, id, now) }, 201);
  });

  // Trocar: chave nova do MESMO provedor, validada de novo; DEK e IV novos (o envelope antigo é sobrescrito).
  // #138 aumenta risco (um segredo novo passa a gastar): Face ID dos últimos 60 s.
  on("PUT", "/api/account/chaves/:id/segredo", async (req, env, p, u) => {
    exigirProva(u, provaExigida({ trocaSegredo: true }));
    const b = await corpoChave(req);
    const r = await linha(env, u.id, p.id);
    const k = await kekDe(env);
    if (!k) throw new HttpError(503, "O cofre de chaves não está ligado neste servidor.", "cofre_desligado");
    const f = validarChaveFormato(r.provedor, b.chave);
    if (!f.ok) throw new HttpError(400, f.erro);
    const wait = await limiteConta(env, u.id, "validar");
    if (wait) return json({ error: "muitas validações de chave; tente de novo mais tarde" }, 429, { "Retry-After": String(wait) });
    const modelos = await validarNoProvedor(env, u.id, r.id, r.provedor, f.chave);
    const e = await cifrarChave(k.kek, k.versao, aadChave(u.id, r.provedor, r.id), f.chave);
    const modelo = r.modelo && modelos.includes(r.modelo) ? r.modelo : modeloPadrao(r.provedor, modelos);
    await env.DB.batch([
      env.DB.prepare(`UPDATE chave_ia SET ciphertext = ?3, iv = ?4, dek_cifrada = ?5, kek_versao = ?6, ultimos4 = ?7, impressao = ?8, modelos_json = ?9, modelo = ?10
        WHERE id = ?1 AND user_id = ?2`).bind(r.id, u.id, e.ciphertext, e.iv, e.dekCifrada, e.kekVersao, ultimos4(f.chave), await impressaoChave(k.b64, u.id, f.chave), JSON.stringify(modelos), modelo),
      evento(env, u.id, r.id, "trocada"), evento(env, u.id, r.id, "validada"),
    ]);
    return json({ chave: await metaCompleta(env, u.id, r.id) });
  });

  // Apelido, ativo, modelo, esforço e tetos. O modelo tem de estar na lista que a própria chave acessa.
  // #138 a prova depende do que muda (provaExigida): baixar/desativar = sessão; subir/ativar/reativar = Face ID de 60 s.
  on("PATCH", "/api/account/chaves/:id", async (req, env, p, u) => {
    const now = Date.now();
    const b = await readJson<Record<string, unknown>>(req, 2 * 1024);
    await aplicarPendentes(env, u.id, now);
    const r = await linha(env, u.id, p.id);
    const has = (k: string) => Object.prototype.hasOwnProperty.call(b, k);
    let apelido = r.apelido, modelo = r.modelo, esforco = r.esforco, ativo = r.ativo;
    if (has("apelido")) { const a = validarApelido(b.apelido); if (!a.ok) throw new HttpError(400, a.erro); apelido = a.valor; }
    if (has("modelo")) {
      if (typeof b.modelo !== "string" || !classificarModelo(r.provedor, b.modelo) || !modelosDe(r).includes(b.modelo)) throw new HttpError(400, "modelo fora da lista desta chave");
      modelo = b.modelo;
    }
    if (has("esforco")) esforco = oneOf(b.esforco, "esforco", ESFORCOS);
    let plano: ReturnType<typeof planejarTetos> | null = null;
    if (has("tetoDia") || has("tetoMes")) {
      const t = validarTetos(has("tetoDia") ? b.tetoDia : r.teto_dia / 100, has("tetoMes") ? b.tetoMes : r.teto_mes / 100);
      if (!t.ok) throw new HttpError(400, t.erro);
      plano = planejarTetos({ dia: r.teto_dia, mes: r.teto_mes }, { dia: t.dia, mes: t.mes }, pendDe(r), now);
    }
    if (has("ativo")) { if (typeof b.ativo !== "boolean") throw new HttpError(400, "ativo deve ser true|false"); ativo = b.ativo ? 1 : 0; }
    const reativa = b.ativo === true && r.pausada_em != null;
    const ativa = b.ativo === true && (!r.ativo || reativa);
    exigirProva(u, provaExigida({ ativa, sobeTeto: !!plano?.sobe, ajuste: has("apelido") || has("modelo") || has("esforco") }), now);
    const tetos = plano?.agora ?? { dia: r.teto_dia, mes: r.teto_mes };
    const pend = plano ? plano.pendente : pendDe(r);
    // eventos só se o UPDATE gravou (cada um confere o changes() do anterior: a cadeia para no 1º que não gravou)
    const ev: ReturnType<typeof eventoSeMudou>[] = [];
    const ev1 = (tipo: string, codigo: string | null) => ev.push(eventoSeMudou(env, u.id, r.id, tipo, codigo, now));
    if (ativo !== r.ativo) ev1(ativo ? "ativada" : "desativada", null);
    if (reativa) ev1("reativada", r.pausa_motivo);
    if (plano?.baixa) ev1("teto_baixado", codTetos(plano.agora));
    if (plano && (plano.anterior === "cancelada" || plano.anterior === "substituida")) ev1("subida_cancelada", plano.anterior === "cancelada" ? "baixa" : "substituida");
    if (plano?.sobe && plano.pendente) ev1("subida_pedida", codTetos(plano.pendente));
    // #138 controle otimista: a prova foi decidida sobre a linha lida; o UPDATE só grava se ela ainda é a mesma. Uma baixa,
    // desativação, pausa ou cancelamento de subida no meio → 409 (nada é desfeito; o app recarrega e a pessoa repete).
    const [up] = await env.DB.batch([
      env.DB.prepare(`UPDATE chave_ia SET apelido = ?3, modelo = ?4, esforco = ?5, teto_dia = ?6, teto_mes = ?7, ativo = ?8,
          teto_dia_pend = ?9, teto_mes_pend = ?10, pend_vale_em = ?11, pausada_em = CASE WHEN ?12 THEN NULL ELSE pausada_em END, pausa_motivo = CASE WHEN ?12 THEN NULL ELSE pausa_motivo END
        WHERE id = ?1 AND user_id = ?2 AND apelido = ?13 AND modelo IS ?14 AND esforco = ?15 AND teto_dia = ?16 AND teto_mes = ?17 AND ativo = ?18
          AND teto_dia_pend IS ?19 AND teto_mes_pend IS ?20 AND pend_vale_em IS ?21 AND pausada_em IS ?22 RETURNING id`)
        .bind(r.id, u.id, apelido, modelo, esforco, tetos.dia, tetos.mes, ativo, pend?.dia ?? null, pend?.mes ?? null, pend?.valeEm ?? null, reativa ? 1 : 0,
          r.apelido, r.modelo, r.esforco, r.teto_dia, r.teto_mes, r.ativo, r.teto_dia_pend, r.teto_mes_pend, r.pend_vale_em, r.pausada_em),
      ...ev,
    ]);
    if (!up.results?.length) throw new HttpError(409, "A chave mudou enquanto você editava. Confira e tente de novo.", "mudou");
    return json({ chave: await metaCompleta(env, u.id, r.id, now) });
  });

  // #138 Cancelar a subida pendente: reduz risco, vale com a sessão normal.
  on("DELETE", "/api/account/chaves/:id/subida", async (_req, env, p, u) => {
    const now = Date.now();
    await aplicarPendentes(env, u.id, now);
    const r = await linha(env, u.id, p.id);
    await env.DB.batch([
      env.DB.prepare("UPDATE chave_ia SET teto_dia_pend = NULL, teto_mes_pend = NULL, pend_vale_em = NULL WHERE id = ?1 AND user_id = ?2 AND pend_vale_em IS NOT NULL").bind(r.id, u.id),
      eventoSeMudou(env, u.id, r.id, "subida_cancelada", "pedido", now),
    ]);
    return json({ chave: await metaCompleta(env, u.id, r.id, now) });
  });

  // Apagar: sobrescreve o envelope e remove a linha na mesma transação; fica só o evento "apagada" (sem segredo).
  // #138 reduz risco: vale com a sessão normal (o gasto da conta continua contando no teto global).
  on("DELETE", "/api/account/chaves/:id", async (_req, env, p, u) => {
    exigirProva(u, provaExigida({}));
    const r = await linha(env, u.id, p.id);
    await env.DB.batch([
      env.DB.prepare("UPDATE chave_ia SET ciphertext = '', iv = '', dek_cifrada = '' WHERE id = ?1 AND user_id = ?2").bind(r.id, u.id),
      env.DB.prepare("DELETE FROM chave_ia WHERE id = ?1 AND user_id = ?2").bind(r.id, u.id),
      env.DB.prepare("DELETE FROM chave_ia_chamada WHERE user_id = ?1 AND chave_id = ?2").bind(u.id, r.id),
      evento(env, u.id, r.id, "apagada"),
    ]);
    return json({ ok: true });
  });
}

// ---------- uso (o cérebro da caixa hoje; o Chat interno e as rotinas na #89) ----------
/** Há chave ativa deste provedor na conta? (sem decifrar nada). Pausada conta como ativa: o pedido não cai no padrão do servidor. */
export async function temChaveAtiva(env: Env, uid: string, provedor: ProvedorIa): Promise<boolean> {
  return !!(await env.DB.prepare("SELECT 1 FROM chave_ia WHERE user_id = ?1 AND provedor = ?2 AND ativo = 1 LIMIT 1").bind(uid, provedor).first());
}

export interface UsoChave { chave: string; modelo: string; esforco: Esforco }
export type ResultadoUso<T> = { ok: true; valor: T } | { ok: false; motivo: "sem_chave" | "limite" | "teto" | "cofre" | "falhou" | "pausada" };

/** Usa a chave ativa da pessoa numa chamada: subida pendente vencida → rate limit da conta → disjuntor (#138) →
 *  reserva do pior caso no teto do dia e do mês da chave E da conta (#138), num UPDATE atômico → decifra (só aqui, numa
 *  variável local) → `f` chama o provedor → acerta o gasto pelo uso real (sem uso real, fica a estimativa). `f` recebe a
 *  chave e não pode devolvê-la: o resultado é o que `f` monta da resposta. Se o uso real passar da estimativa, o teto
 *  pode estourar em no máximo ESTA chamada: o gasto fica ≥ teto e a reserva da próxima já não cabe (bloqueada). */
export async function comChaveDoUsuario<T>(
  env: Env, uid: string, provedor: ProvedorIa, estimarUsd: (modelo: string) => number,
  f: (k: UsoChave) => Promise<{ valor: T; usdReal?: number | null; tokensIn?: number; tokensOut?: number } | null>,
  now = Date.now(),
): Promise<ResultadoUso<T>> {
  await aplicarPendentes(env, uid, now);
  // pausada só é escolhida se não houver outra ativa do mesmo provedor
  const r = await env.DB.prepare(`SELECT ${META}, ciphertext, iv, dek_cifrada, kek_versao FROM chave_ia WHERE user_id = ?1 AND provedor = ?2 AND ativo = 1
    ORDER BY (pausada_em IS NOT NULL), COALESCE(usado_em, criado_em) DESC LIMIT 1`).bind(uid, provedor).first<Row & Segredo>();
  if (!r) return { ok: false, motivo: "sem_chave" };
  if (r.pausada_em != null) return { ok: false, motivo: "pausada" };
  const modelo = r.modelo && classificarModelo(provedor, r.modelo) ? r.modelo : modeloPadrao(provedor, modelosDe(r));
  if (!modelo) return { ok: false, motivo: "sem_chave" };
  if (await limiteConta(env, uid, "uso", now)) return { ok: false, motivo: "limite" };
  const k = await kekDe(env, r.kek_versao); // sem a KEK desta versão: nem reserva o teto
  if (!k) return { ok: false, motivo: "cofre" };
  // #138 disjuntor: o que esta chave gastou e chamou nos últimos 10 min (antifraude de velocidade)
  const desde = now - DISJUNTOR.janelaMs;
  const jan = await env.DB.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(usd_micro), 0) AS g FROM chave_ia_chamada WHERE user_id = ?1 AND chave_id = ?2 AND em > ?3")
    .bind(uid, r.id, desde).first<{ n: number; g: number }>();
  const pausa = disjuntor({ gastoJanelaMicro: jan?.g ?? 0, chamadasJanela: jan?.n ?? 0, tetoDiaCent: r.teto_dia });
  if (pausa) {
    await env.DB.batch([
      env.DB.prepare("UPDATE chave_ia SET pausada_em = ?3, pausa_motivo = ?4 WHERE id = ?1 AND user_id = ?2 AND pausada_em IS NULL").bind(r.id, uid, now, pausa),
      eventoSeMudou(env, uid, r.id, "pausada", pausa, now),
    ]);
    return { ok: false, motivo: "pausada" };
  }
  const dia = diaUtc(now), mesIni = dia.slice(0, 8) + "01";
  const est = Math.max(1, Math.ceil(estimarUsd(modelo) * 1e6));
  const [, reserva] = await env.DB.batch([
    env.DB.prepare("INSERT INTO chave_ia_uso (user_id, chave_id, dia) VALUES (?1, ?2, ?3) ON CONFLICT DO NOTHING").bind(uid, r.id, dia),
    // teto da chave (dia e mês) E teto global da conta (soma de todas as chaves, inclusive as apagadas), no mesmo UPDATE
    env.DB.prepare(`UPDATE chave_ia_uso SET usd_micro = usd_micro + ?4, chamadas = chamadas + 1 WHERE user_id = ?1 AND chave_id = ?2 AND dia = ?3
      AND usd_micro + ?4 <= (SELECT teto_dia FROM chave_ia WHERE id = ?2 AND user_id = ?1) * 10000
      AND (SELECT COALESCE(SUM(usd_micro), 0) FROM chave_ia_uso WHERE user_id = ?1 AND chave_id = ?2 AND dia >= ?5 AND dia <= ?3) + ?4
        <= (SELECT teto_mes FROM chave_ia WHERE id = ?2 AND user_id = ?1) * 10000
      AND (SELECT COALESCE(SUM(usd_micro), 0) FROM chave_ia_uso WHERE user_id = ?1 AND dia = ?3) + ?4 <= ?6
      AND (SELECT COALESCE(SUM(usd_micro), 0) FROM chave_ia_uso WHERE user_id = ?1 AND dia >= ?5 AND dia <= ?3) + ?4 <= ?7
      RETURNING usd_micro`).bind(uid, r.id, dia, est, mesIni, CHAVE_TETO_CONTA_CENT.dia * 10_000, CHAVE_TETO_CONTA_CENT.mes * 10_000),
  ]);
  if (!reserva.results?.length) {
    // qual teto barrou (só para a trilha): o da conta ou o da chave
    const c = await env.DB.prepare("SELECT COALESCE(SUM(CASE WHEN dia = ?2 THEN usd_micro ELSE 0 END), 0) AS d, COALESCE(SUM(usd_micro), 0) AS m FROM chave_ia_uso WHERE user_id = ?1 AND dia >= ?3 AND dia <= ?2")
      .bind(uid, dia, mesIni).first<{ d: number; m: number }>();
    const conta = !cabeNoTetoConta({ gastoDiaMicro: c?.d ?? 0, gastoMesMicro: c?.m ?? 0, estMicro: est });
    await evento(env, uid, r.id, "teto", conta ? "conta" : "chave", now).run();
    return { ok: false, motivo: "teto" };
  }
  const [, marca] = await env.DB.batch([
    env.DB.prepare("DELETE FROM chave_ia_chamada WHERE user_id = ?1 AND chave_id = ?2 AND em <= ?3").bind(uid, r.id, desde),
    env.DB.prepare("INSERT INTO chave_ia_chamada (user_id, chave_id, em, usd_micro) VALUES (?1, ?2, ?3, ?4) RETURNING id").bind(uid, r.id, now, est),
  ]);
  const chamadaId = (marca.results?.[0] as { id?: number } | undefined)?.id ?? null;
  let out: Awaited<ReturnType<typeof f>> = null;
  try {
    const chave = await decifrarChave(k.kek, { ciphertext: r.ciphertext, iv: r.iv, dekCifrada: r.dek_cifrada, kekVersao: r.kek_versao }, aadChave(uid, provedor, r.id));
    out = await f({ chave, modelo, esforco: r.esforco });
  } catch { out = null; }
  const real = out?.usdReal != null && out.usdReal >= 0 ? Math.ceil(out.usdReal * 1e6) : est;
  await env.DB.batch([
    env.DB.prepare(`UPDATE chave_ia_uso SET usd_micro = MAX(0, usd_micro - ?4 + ?5), tokens_in = tokens_in + ?6, tokens_out = tokens_out + ?7
      WHERE user_id = ?1 AND chave_id = ?2 AND dia = ?3`).bind(uid, r.id, dia, est, real, Math.max(0, out?.tokensIn ?? 0), Math.max(0, out?.tokensOut ?? 0)),
    env.DB.prepare("UPDATE chave_ia SET usado_em = ?3 WHERE id = ?1 AND user_id = ?2").bind(r.id, uid, now),
    env.DB.prepare("UPDATE chave_ia_chamada SET usd_micro = ?3 WHERE id = ?1 AND user_id = ?2").bind(chamadaId, uid, real),
    ...(out ? [] : [evento(env, uid, r.id, "falhou", "chamada", now)]),
  ]);
  return out ? { ok: true, valor: out.valor } : { ok: false, motivo: "falhou" };
}
