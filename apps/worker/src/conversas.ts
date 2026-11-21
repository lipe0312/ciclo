// #134 Histórico do Chat: conversas por conta (lista, abrir, nova, mensagem, apagar). Todo SQL com bind e filtrado por
// user_id; a regra (texto, título, limites) vive no core. Apagar apaga mesmo (mensagens juntas); nada de texto em log.
import { CHAT, tituloConversa, validarMensagem } from "@ciclo/core/chat";
import type { Env } from "./env.ts";
import type { Handler } from "./comida.ts";
import { HttpError, id, json, oneOf, readJson, str } from "./http.ts";

const ID = /^[A-Za-z0-9_-]{8,64}$/;
const idConversa = (v: unknown) => { if (typeof v !== "string" || !ID.test(v)) throw new HttpError(404, "conversa não encontrada"); return v; };
type Conversa = { id: string; titulo: string; created_at: number; updated_at: number };
type Msg = { id: string; papel: string; texto: string; pedido_id: string | null; created_at: number };
const outC = (r: Conversa) => ({ id: r.id, titulo: r.titulo, criadaEm: r.created_at, atualizadaEm: r.updated_at });
const outM = (r: Msg) => ({ id: r.id, papel: r.papel, texto: r.texto, pedidoId: r.pedido_id, criadaEm: r.created_at });

const lerConversa = (env: Env, uid: string, cid: string) =>
  env.DB.prepare("SELECT id, titulo, created_at, updated_at FROM conversa WHERE user_id = ?1 AND id = ?2").bind(uid, cid).first<Conversa>();

/** Cria a conversa com o título da 1ª mensagem; acima do teto, a mais antiga da conta sai (com as mensagens). */
async function criar(env: Env, uid: string, texto: string): Promise<Conversa> {
  const now = Date.now(), cid = id(), titulo = tituloConversa(texto);
  await env.DB.batch([
    env.DB.prepare("INSERT INTO conversa (user_id, id, titulo, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?4)").bind(uid, cid, titulo, now),
    env.DB.prepare(`DELETE FROM conversa WHERE user_id = ?1 AND id IN
      (SELECT id FROM conversa WHERE user_id = ?1 ORDER BY updated_at DESC, created_at DESC LIMIT -1 OFFSET ?2)`).bind(uid, CHAT.conversasMax),
  ]);
  return { id: cid, titulo, created_at: now, updated_at: now };
}

export function registerConversas(on: (m: string, p: string, h: Handler) => void) {
  on("GET", "/api/conversas", async (_req, env, _p, u) => {
    const { results } = await env.DB.prepare("SELECT id, titulo, created_at, updated_at FROM conversa WHERE user_id = ?1 ORDER BY updated_at DESC LIMIT ?2")
      .bind(u.id, CHAT.conversasMax).all<Conversa>();
    return json({ conversas: results.map(outC) });
  });

  on("GET", "/api/conversas/:id", async (_req, env, p, u) => {
    const cid = idConversa(p.id);
    const c = await lerConversa(env, u.id, cid);
    if (!c) throw new HttpError(404, "conversa não encontrada");
    const { results } = await env.DB.prepare("SELECT id, papel, texto, pedido_id, created_at FROM conversa_msg WHERE user_id = ?1 AND conversa_id = ?2 ORDER BY created_at, id LIMIT ?3")
      .bind(u.id, cid, CHAT.mensagensMax).all<Msg>();
    return json({ conversa: outC(c), mensagens: results.map(outM) });
  });

  /** Uma mensagem. Sem `conversaId` (ou "nova"), abre uma conversa nova com ela. O pedido da rotina (inbox) tem de ser desta conta. */
  on("POST", "/api/conversas/mensagens", async (req, env, _p, u) => {
    const b = await readJson<Record<string, unknown>>(req, 32 * 1024);
    const v = validarMensagem(b.texto);
    if (!v.ok) throw new HttpError(400, v.erro);
    const papel = b.papel == null ? "usuario" : oneOf(b.papel, "papel", ["usuario", "aviso"] as const); // "ia" só o servidor grava (#89)
    const pedidoId = str(b.pedidoId, "pedidoId", 64, false);
    if (pedidoId && !(await env.DB.prepare("SELECT 1 AS x FROM inbox WHERE user_id = ?1 AND id = ?2").bind(u.id, pedidoId).first())) throw new HttpError(404, "pedido não encontrado");
    let c: Conversa | null;
    if (b.conversaId == null || b.conversaId === "nova") c = await criar(env, u.id, v.texto);
    else { c = await lerConversa(env, u.id, idConversa(b.conversaId)); if (!c) throw new HttpError(404, "conversa não encontrada"); }
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM conversa_msg WHERE user_id = ?1 AND conversa_id = ?2").bind(u.id, c.id).first<{ n: number }>();
    if ((n?.n ?? 0) >= CHAT.mensagensMax) throw new HttpError(409, "conversa cheia: comece uma nova");
    const now = Math.max(Date.now(), c.updated_at), mid = id();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO conversa_msg (user_id, conversa_id, id, papel, texto, pedido_id, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)").bind(u.id, c.id, mid, papel, v.texto, pedidoId, now),
      env.DB.prepare("UPDATE conversa SET updated_at = ?3 WHERE user_id = ?1 AND id = ?2").bind(u.id, c.id, now),
    ]);
    return json({ conversa: outC({ ...c, updated_at: now }), mensagem: outM({ id: mid, papel, texto: v.texto, pedido_id: pedidoId, created_at: now }) }, 201);
  });

  /** Apagar apaga mesmo: a conversa e as mensagens (só desta conta). */
  on("DELETE", "/api/conversas/:id", async (_req, env, p, u) => {
    const cid = idConversa(p.id);
    const [, r] = await env.DB.batch([
      env.DB.prepare("DELETE FROM conversa_msg WHERE user_id = ?1 AND conversa_id = ?2").bind(u.id, cid),
      env.DB.prepare("DELETE FROM conversa WHERE user_id = ?1 AND id = ?2 RETURNING id").bind(u.id, cid),
    ]);
    if (!r.results.length) throw new HttpError(404, "conversa não encontrada");
    return json({ ok: true });
  });
}
