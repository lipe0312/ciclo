// #88 Chaves de API próprias (BYOK), ADR-0015: cadastro, troca, desativar, apagar e o uso pelo Worker.
// - A chave só existe em claro: no corpo do POST/PUT (validada e cifrada na hora) e numa variável local de
//   `comChaveDoUsuario` durante UMA chamada ao provedor. Nunca volta ao app (só ••••últimos4 e a impressão),
//   nunca vai para log, env, cache, KV, mensagem de erro, export nem backup em claro.
// - Cadastrar, trocar, mudar e apagar pedem Face ID dos últimos 5 min (step-up, exigirFaceId).
// - Saída só para os hosts da allowlist do core (#133: + openrouter.ai e api.deepseek.com), sem seguir redirect; o corpo de erro do provedor é descartado.
// - Teto de gasto por chave (dia e mês) reservado num UPDATE atômico antes de chamar; rate limit por conta.
// - Todo SQL com bind e filtrado por user_id.
import {
  CHAVE_LIMITE_USO, CHAVE_LIMITE_VALIDAR, CHAVE_TIMEOUT_MS, ESFORCOS, MAX_CHAVES_POR_CONTA, NOME_PROVEDOR, PROVEDORES_IA, aadChave, cifrarChave,
  classificarModelo, configOpenai, decifrarChave, diaUtc, estadoConector, filtrarModelos, hostPermitido, impressaoChave, importarKek, kekAtual, lerKeks, lerListaModelos,
  mensagemErroProvedor, modeloPadrao, pedidosValidar, ultimos4, validarApelido, validarChaveFormato, validarTetos,
} from "@ciclo/core";
import type { Esforco, ProvedorIa } from "@ciclo/core";
import type { AuthUser, Env } from "./env.ts";
import { HttpError, json, oneOf, readJson } from "./http.ts";
import { exigirFaceId } from "./auth-conta.ts";
import { contarJanela } from "./limites.ts";
import { sha256Hex } from "./auth.ts";

type Handler = (req: Request, env: Env, p: Record<string, string>, u: AuthUser) => Promise<Response>;
type Row = {
  id: string; provedor: ProvedorIa; apelido: string; ultimos4: string; impressao: string; modelos_json: string; modelo: string | null;
  esforco: Esforco; teto_dia: number; teto_mes: number; criado_em: number; usado_em: number | null; ativo: number;
};
type Segredo = { ciphertext: string; iv: string; dek_cifrada: string; kek_versao: number };
const META = "id, provedor, apelido, ultimos4, impressao, modelos_json, modelo, esforco, teto_dia, teto_mes, criado_em, usado_em, ativo";

const modelosDe = (r: Row): string[] => { try { const a = JSON.parse(r.modelos_json); return Array.isArray(a) ? a.filter((x) => typeof x === "string") : []; } catch { return []; } };
/** O que o app vê: metadados e gasto. Nunca ciphertext, iv, DEK nem a chave. */
function meta(r: Row, g?: { dia: number; mes: number }) {
  return {
    id: r.id, provedor: r.provedor, nomeProvedor: NOME_PROVEDOR[r.provedor], apelido: r.apelido, mascara: `••••${r.ultimos4}`, impressao: r.impressao,
    modelos: filtrarModelos(r.provedor, modelosDe(r)).map((m) => ({ id: m.id, familia: m.familia })), modelo: r.modelo, esforco: r.esforco,
    tetoDia: r.teto_dia / 100, tetoMes: r.teto_mes / 100, gastoDia: (g?.dia ?? 0) / 1e6, gastoMes: (g?.mes ?? 0) / 1e6,
    criadoEm: r.criado_em, usadoEm: r.usado_em, ativo: !!r.ativo,
  };
}

const kekDe = async (env: Env, versao?: number) => {
  const ks = lerKeks(env as unknown as Record<string, unknown>);
  const k = versao ? (ks.has(versao) ? { versao, b64: ks.get(versao)! } : null) : kekAtual(ks);
  return k ? { versao: k.versao, b64: k.b64, kek: await importarKek(k.b64) } : null;
};
const evento = (env: Env, uid: string, chaveId: string, tipo: string, codigo: string | null = null) =>
  env.DB.prepare("INSERT INTO chave_ia_evento (user_id, chave_id, tipo, codigo, criado_em) VALUES (?1, ?2, ?3, ?4, ?5)").bind(uid, chaveId, tipo, codigo, Date.now());
const limiteConta = async (env: Env, uid: string, tipo: "validar" | "uso") =>
  contarJanela(env, `chave_${tipo}:${(await sha256Hex(`chave:${uid}`)).slice(0, 32)}`, tipo === "validar" ? CHAVE_LIMITE_VALIDAR : CHAVE_LIMITE_USO);

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
const corpoChave = async (req: Request) => readJson<Record<string, unknown>>(req, 4 * 1024);

export function registerChaves(on: (method: string, path: string, h: Handler) => void) {
  on("GET", "/api/account/chaves", async (_req, env, _p, u) => {
    const { results } = await env.DB.prepare(`SELECT ${META} FROM chave_ia WHERE user_id = ?1 ORDER BY criado_em`).bind(u.id).all<Row>();
    const g = await gastos(env, u.id);
    return json({
      chaves: results.map((r) => meta(r, g.get(r.id))), max: MAX_CHAVES_POR_CONTA, cofre: !!kekAtual(lerKeks(env as unknown as Record<string, unknown>)),
      provedores: PROVEDORES_IA.map((id) => ({ id, nome: NOME_PROVEDOR[id] })), padraoServidor: { openai: configOpenai(env).ligado },
    });
  });

  // #133 Sua IA: o mínimo para o aviso e o status (estadoIA no core): conexão MCP (ativa, pendente, expirada) e quais
  // provedores têm chave ativa. Nada de segredo, só da conta da sessão.
  on("GET", "/api/account/ia", async (_req, env, _p, u) => {
    const [toks, ks] = await Promise.all([
      env.DB.prepare("SELECT created_at AS createdAt, last_used_at AS lastUsedAt, revoked_at AS revokedAt FROM mcp_token WHERE user_id = ?1 AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 50")
        .bind(u.id).all<{ createdAt: number; lastUsedAt: number | null; revokedAt: number | null }>(),
      env.DB.prepare("SELECT provedor, MAX(ativo) AS ativo FROM chave_ia WHERE user_id = ?1 GROUP BY provedor").bind(u.id).all<{ provedor: ProvedorIa; ativo: number }>(),
    ]);
    return json({ conector: estadoConector(toks.results, Date.now()), chaves: ks.results.map((k) => ({ provedor: k.provedor, ativo: !!k.ativo })) });
  });

  on("POST", "/api/account/chaves", async (req, env, _p, u) => {
    exigirFaceId(u);
    const b = await corpoChave(req);
    const k = await kekDe(env);
    if (!k) throw new HttpError(503, "O cofre de chaves não está ligado neste servidor.", "cofre_desligado");
    const provedor = oneOf(b.provedor, "provedor", PROVEDORES_IA);
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
    const ins = await env.DB.prepare(`INSERT INTO chave_ia (id, user_id, provedor, apelido, ultimos4, impressao, ciphertext, iv, dek_cifrada, kek_versao, modelos_json, modelo, esforco, teto_dia, teto_mes, criado_em, ativo)
        SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 'medio', ?13, ?14, ?15, 1 WHERE (SELECT COUNT(*) FROM chave_ia WHERE user_id = ?2) < ?16 RETURNING id`)
      .bind(id, u.id, provedor, ap.valor, ultimos4(f.chave), await impressaoChave(k.b64, u.id, f.chave), e.ciphertext, e.iv, e.dekCifrada, e.kekVersao,
        JSON.stringify(modelos), modeloPadrao(provedor, modelos), tt.dia, tt.mes, now, MAX_CHAVES_POR_CONTA).first<{ id: string }>();
    if (!ins) throw new HttpError(409, `até ${MAX_CHAVES_POR_CONTA} chaves por conta`, "limite_chaves");
    await env.DB.batch([evento(env, u.id, id, "criada"), evento(env, u.id, id, "validada")]);
    return json({ chave: meta(await linha(env, u.id, id)) }, 201);
  });

  // Trocar: chave nova do MESMO provedor, validada de novo; DEK e IV novos (o envelope antigo é sobrescrito).
  on("PUT", "/api/account/chaves/:id/segredo", async (req, env, p, u) => {
    exigirFaceId(u);
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
    return json({ chave: meta(await linha(env, u.id, r.id)) });
  });

  // Apelido, ativo, modelo, esforço e tetos. O modelo tem de estar na lista que a própria chave acessa.
  on("PATCH", "/api/account/chaves/:id", async (req, env, p, u) => {
    exigirFaceId(u);
    const b = await readJson<Record<string, unknown>>(req, 2 * 1024);
    const r = await linha(env, u.id, p.id);
    const has = (k: string) => Object.prototype.hasOwnProperty.call(b, k);
    let apelido = r.apelido, modelo = r.modelo, esforco = r.esforco, dia = r.teto_dia, mes = r.teto_mes, ativo = r.ativo;
    if (has("apelido")) { const a = validarApelido(b.apelido); if (!a.ok) throw new HttpError(400, a.erro); apelido = a.valor; }
    if (has("modelo")) {
      if (typeof b.modelo !== "string" || !classificarModelo(r.provedor, b.modelo) || !modelosDe(r).includes(b.modelo)) throw new HttpError(400, "modelo fora da lista desta chave");
      modelo = b.modelo;
    }
    if (has("esforco")) esforco = oneOf(b.esforco, "esforco", ESFORCOS);
    if (has("tetoDia") || has("tetoMes")) {
      const t = validarTetos(has("tetoDia") ? b.tetoDia : r.teto_dia / 100, has("tetoMes") ? b.tetoMes : r.teto_mes / 100);
      if (!t.ok) throw new HttpError(400, t.erro);
      dia = t.dia; mes = t.mes;
    }
    if (has("ativo")) { if (typeof b.ativo !== "boolean") throw new HttpError(400, "ativo deve ser true|false"); ativo = b.ativo ? 1 : 0; }
    await env.DB.batch([
      env.DB.prepare("UPDATE chave_ia SET apelido = ?3, modelo = ?4, esforco = ?5, teto_dia = ?6, teto_mes = ?7, ativo = ?8 WHERE id = ?1 AND user_id = ?2")
        .bind(r.id, u.id, apelido, modelo, esforco, dia, mes, ativo),
      ...(ativo !== r.ativo ? [evento(env, u.id, r.id, ativo ? "ativada" : "desativada")] : []),
    ]);
    return json({ chave: meta(await linha(env, u.id, r.id)) });
  });

  // Apagar: sobrescreve o envelope e remove a linha na mesma transação; fica só o evento "apagada" (sem segredo).
  on("DELETE", "/api/account/chaves/:id", async (_req, env, p, u) => {
    exigirFaceId(u);
    const r = await linha(env, u.id, p.id);
    await env.DB.batch([
      env.DB.prepare("UPDATE chave_ia SET ciphertext = '', iv = '', dek_cifrada = '' WHERE id = ?1 AND user_id = ?2").bind(r.id, u.id),
      env.DB.prepare("DELETE FROM chave_ia WHERE id = ?1 AND user_id = ?2").bind(r.id, u.id),
      evento(env, u.id, r.id, "apagada"),
    ]);
    return json({ ok: true });
  });
}

// ---------- uso (o cérebro da caixa hoje; o Chat interno e as rotinas na #89) ----------
/** Há chave ativa deste provedor na conta? (sem decifrar nada) */
export async function temChaveAtiva(env: Env, uid: string, provedor: ProvedorIa): Promise<boolean> {
  return !!(await env.DB.prepare("SELECT 1 FROM chave_ia WHERE user_id = ?1 AND provedor = ?2 AND ativo = 1 LIMIT 1").bind(uid, provedor).first());
}

export interface UsoChave { chave: string; modelo: string; esforco: Esforco }
export type ResultadoUso<T> = { ok: true; valor: T } | { ok: false; motivo: "sem_chave" | "limite" | "teto" | "cofre" | "falhou" };

/** Usa a chave ativa da pessoa numa chamada: rate limit da conta → reserva do pior caso no teto do dia e do mês (UPDATE
 *  atômico) → decifra (só aqui, numa variável local) → `f` chama o provedor → acerta o gasto pelo uso real (sem uso
 *  real, fica a estimativa). `f` recebe a chave e não pode devolvê-la: o resultado é o que `f` monta da resposta.
 *  Se o uso real passar da estimativa, o teto pode estourar em no máximo ESTA chamada: o gasto fica ≥ teto e a
 *  reserva da próxima já não cabe (bloqueada). */
export async function comChaveDoUsuario<T>(
  env: Env, uid: string, provedor: ProvedorIa, estimarUsd: (modelo: string) => number,
  f: (k: UsoChave) => Promise<{ valor: T; usdReal?: number | null; tokensIn?: number; tokensOut?: number } | null>,
  now = Date.now(),
): Promise<ResultadoUso<T>> {
  const r = await env.DB.prepare(`SELECT ${META}, ciphertext, iv, dek_cifrada, kek_versao FROM chave_ia WHERE user_id = ?1 AND provedor = ?2 AND ativo = 1
    ORDER BY COALESCE(usado_em, criado_em) DESC LIMIT 1`).bind(uid, provedor).first<Row & Segredo>();
  if (!r) return { ok: false, motivo: "sem_chave" };
  const modelo = r.modelo && classificarModelo(provedor, r.modelo) ? r.modelo : modeloPadrao(provedor, modelosDe(r));
  if (!modelo) return { ok: false, motivo: "sem_chave" };
  if (await limiteConta(env, uid, "uso")) return { ok: false, motivo: "limite" };
  const k = await kekDe(env, r.kek_versao); // sem a KEK desta versão: nem reserva o teto
  if (!k) return { ok: false, motivo: "cofre" };
  const dia = diaUtc(now), mesIni = dia.slice(0, 8) + "01";
  const est = Math.max(1, Math.ceil(estimarUsd(modelo) * 1e6));
  const [, reserva] = await env.DB.batch([
    env.DB.prepare("INSERT INTO chave_ia_uso (user_id, chave_id, dia) VALUES (?1, ?2, ?3) ON CONFLICT DO NOTHING").bind(uid, r.id, dia),
    env.DB.prepare(`UPDATE chave_ia_uso SET usd_micro = usd_micro + ?4, chamadas = chamadas + 1 WHERE user_id = ?1 AND chave_id = ?2 AND dia = ?3
      AND usd_micro + ?4 <= (SELECT teto_dia FROM chave_ia WHERE id = ?2 AND user_id = ?1) * 10000
      AND (SELECT COALESCE(SUM(usd_micro), 0) FROM chave_ia_uso WHERE user_id = ?1 AND chave_id = ?2 AND dia >= ?5 AND dia <= ?3) + ?4
        <= (SELECT teto_mes FROM chave_ia WHERE id = ?2 AND user_id = ?1) * 10000
      RETURNING usd_micro`).bind(uid, r.id, dia, est, mesIni),
  ]);
  if (!reserva.results?.length) { await evento(env, uid, r.id, "teto").run(); return { ok: false, motivo: "teto" }; }
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
    ...(out ? [] : [evento(env, uid, r.id, "falhou", "chamada")]),
  ]);
  return out ? { ok: true, valor: out.valor } : { ok: false, motivo: "falhou" };
}
