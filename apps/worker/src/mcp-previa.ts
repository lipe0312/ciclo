// #81 Prévia de uso único das escritas pelo MCP: simular → token (15 min, preso à conta) → confirmar.
// O token só existe como SHA-256. Toda busca filtra user_id: token de outra conta é igual a token inexistente.
// Confirmar duas vezes devolve o resultado guardado, sem gravar de novo (idempotente). Regras puras no core (estadoPrevia).
import { PREVIA_MS, estadoPrevia } from "@ciclo/core";
import type { PreviaTipo } from "@ciclo/core";
import type { Env } from "./env.ts";
import { HttpError } from "./http.ts";
import { sha256Hex } from "./auth.ts";

const TOKEN_RE = /^prv_[0-9a-f]{32}$/;
const rnd = (n: number) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, "0")).join("");
/** Prévias ficam 1 dia depois de vencer (a confirmação repetida ainda acha o resultado) e o cron apaga. */
const GUARDA_MS = 86_400_000;

export async function criarPrevia(env: Env, uid: string, kind: PreviaTipo, payload: unknown, now = Date.now()): Promise<string> {
  const token = `prv_${rnd(16)}`;
  await env.DB.prepare("INSERT INTO mcp_previa (user_id, token_hash, kind, payload, created_at, expires_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)")
    .bind(uid, await sha256Hex(token), kind, JSON.stringify(payload), now, now + PREVIA_MS).run();
  return token;
}

type Lida<T> = { hash: string; payload: T };
/** Lê a prévia sem consumir. Já confirmada → `{ repetida }` com o resultado guardado. Vencida, inexistente ou de outra conta → erro claro. */
export async function lerPrevia<T>(env: Env, uid: string, kind: PreviaTipo, token: unknown, now = Date.now()): Promise<Lida<T> | { repetida: unknown }> {
  if (typeof token !== "string" || !TOKEN_RE.test(token)) throw new HttpError(400, "confirmar: token da prévia inválido (use o `token` devolvido pela simulação)");
  const hash = await sha256Hex(token);
  const row = await env.DB.prepare("SELECT kind, payload, expires_at, used_at, result FROM mcp_previa WHERE user_id = ?1 AND token_hash = ?2").bind(uid, hash)
    .first<{ kind: string; payload: string; expires_at: number; used_at: number | null; result: string | null }>();
  const st = estadoPrevia(row && row.kind === kind ? { expiresAt: row.expires_at, usedAt: row.used_at } : null, now);
  if (st === "inexistente") throw new HttpError(404, "prévia não encontrada (de outra ferramenta, de outra conta ou inválida): simule de novo");
  if (st === "usada") return { repetida: { ...(row!.result ? JSON.parse(row!.result) : {}), jaConfirmado: true } };
  if (st === "expirada") throw new HttpError(410, "a prévia expirou (vale 15 min): simule de novo e mostre o resumo atualizado");
  return { hash, payload: JSON.parse(row!.payload) as T };
}

/** Marca como usada (atômico: só uma confirmação passa). false = outra confirmação chegou antes. */
export async function consumirPrevia(env: Env, uid: string, hash: string, now = Date.now()): Promise<boolean> {
  const r = await env.DB.prepare("UPDATE mcp_previa SET used_at = ?3 WHERE user_id = ?1 AND token_hash = ?2 AND used_at IS NULL AND expires_at > ?3").bind(uid, hash, now).run();
  return r.meta.changes > 0;
}
export async function concluirPrevia(env: Env, uid: string, hash: string, result: unknown) {
  await env.DB.prepare("UPDATE mcp_previa SET result = ?3 WHERE user_id = ?1 AND token_hash = ?2").bind(uid, hash, JSON.stringify(result).slice(0, 32000)).run();
}
/** A gravação falhou depois de consumir: a prévia volta a valer (a pessoa não perde o "sim"). */
export async function liberarPrevia(env: Env, uid: string, hash: string) {
  await env.DB.prepare("UPDATE mcp_previa SET used_at = NULL WHERE user_id = ?1 AND token_hash = ?2 AND result IS NULL").bind(uid, hash).run();
}

/** Confirma uma prévia: lê, consome uma vez, aplica e guarda o resultado. Repetir devolve o mesmo resultado. */
export async function confirmar<T, R>(env: Env, uid: string, kind: PreviaTipo, token: unknown, aplicar: (payload: T) => Promise<R>, antes?: (payload: T) => Promise<void> | void): Promise<R | unknown> {
  const p = await lerPrevia<T>(env, uid, kind, token);
  if ("repetida" in p) return p.repetida;
  if (antes) await antes(p.payload); // checagens que não devem gastar o token (ex.: falta escolher complementar/substituir)
  if (!(await consumirPrevia(env, uid, p.hash))) {
    const again = await lerPrevia<T>(env, uid, kind, token);
    if ("repetida" in again) return again.repetida;
    throw new HttpError(409, "a prévia está sendo confirmada agora; tente de novo em instantes");
  }
  try {
    const out = await aplicar(p.payload);
    await concluirPrevia(env, uid, p.hash, out);
    return out;
  } catch (e) { await liberarPrevia(env, uid, p.hash); throw e; }
}

export async function purgePrevias(env: Env, now = Date.now()) {
  await env.DB.prepare("DELETE FROM mcp_previa WHERE expires_at < ?1").bind(now - GUARDA_MS).run();
}
