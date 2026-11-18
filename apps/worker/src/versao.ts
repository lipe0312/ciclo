// #114 Versão da conta: contador barato (1 linha por conta) que sobe a cada escrita feita pelo app ou pelo Claude (MCP).
// O app confere essa versão e, se mudou, busca os dados de novo. Sem dado pessoal: só um número.
import type { Env } from "./env.ts";

/** Versão atual da conta (0 = nunca houve escrita). Sempre filtrada por user_id. */
export async function versaoDaConta(env: Env, uid: string): Promise<number> {
  return (await env.DB.prepare("SELECT versao FROM conta_versao WHERE user_id = ?1").bind(uid).first<number>("versao")) ?? 0;
}

/** +1 na versão da conta. Nunca falha a requisição que escreveu (a escrita já aconteceu): o erro só é registrado, sem dado pessoal. */
export async function subirVersao(env: Env, uid: string): Promise<void> {
  try {
    await env.DB.prepare("INSERT INTO conta_versao (user_id, versao) VALUES (?1, 1) ON CONFLICT(user_id) DO UPDATE SET versao = versao + 1").bind(uid).run();
  } catch (e) { console.error("versao", e instanceof Error ? e.message : "erro"); }
}

/** O resultado de uma ferramenta do MCP gravou de verdade? Prévia (simular), conflito/problema (`salvo:false`), confirmação repetida,
 *  retorno `isError` e `ciclo_chat_pendentes` sem pedido (só renova o heartbeat) NÃO sobem a versão: o app não tem o que atualizar. */
export function gravou(nome: string, out: unknown): boolean {
  const o = (out && typeof out === "object" ? out : {}) as { previa?: unknown; salvo?: unknown; jaConfirmado?: unknown; isError?: unknown; pendentes?: unknown[] };
  if (o.previa === true || o.salvo === false || o.jaConfirmado === true || o.isError === true) return false;
  if (nome === "ciclo_chat_pendentes") return !!o.pendentes?.length;
  return true;
}

/** Sobe a versão sem atrasar a resposta quando há `ctx` (waitUntil); sem ctx (testes) espera terminar. */
export function subirVersaoDepois(env: Env, uid: string, ctx?: { waitUntil(p: Promise<unknown>): void }): Promise<void> {
  const p = subirVersao(env, uid);
  if (!ctx) return p;
  ctx.waitUntil(p);
  return Promise.resolve();
}
