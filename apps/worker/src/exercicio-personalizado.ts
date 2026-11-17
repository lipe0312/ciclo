// #107 Exercício personalizado por conta (tabela exercicio_personalizado). Toda query filtra user_id e usa bind.
// A regra (validação, URL do YouTube, ID cus_, limite) vive no core; aqui só a persistência e as rotas do app.
import { LIMITE_PERSONALIZADOS, ehIdPersonalizado, novoIdPersonalizado, validarExercicioPersonalizado } from "@ciclo/core";
import type { CriadoPor, ExercicioPersonalizado, MuscleId } from "@ciclo/core";
import type { AuthUser, Env } from "./env.ts";
import { HttpError, json, readJson } from "./http.ts";

type Row = { id: string; nome: string; musculo: string; aparelho: string | null; descricao: string; video_url: string | null; criado_por: CriadoPor };
const COLS = "id, nome, musculo, aparelho, descricao, video_url, criado_por";
const out = (r: Row): ExercicioPersonalizado => ({ id: r.id, nome: r.nome, musculo: r.musculo as MuscleId, aparelho: r.aparelho, descricao: r.descricao, videoUrl: r.video_url, criadoPor: r.criado_por });

const mesmoNome = (env: Env, uid: string, musculo: string, nome: string) =>
  env.DB.prepare(`SELECT ${COLS} FROM exercicio_personalizado WHERE user_id = ?1 AND musculo = ?2 AND nome = ?3 COLLATE NOCASE`).bind(uid, musculo, nome).first<Row>();

export async function listarPersonalizados(env: Env, uid: string): Promise<ExercicioPersonalizado[]> {
  const { results } = await env.DB.prepare(`SELECT ${COLS} FROM exercicio_personalizado WHERE user_id = ?1 ORDER BY nome LIMIT ?2`).bind(uid, LIMITE_PERSONALIZADOS).all<Row>();
  return results.map(out);
}

/** Mapa id → exercício DESTA conta, para hidratar itens `cus_` (o de outra conta nunca entra). */
export async function mapaPersonalizados(env: Env, uid: string, ids: readonly unknown[]): Promise<Record<string, ExercicioPersonalizado>> {
  const pedidos = [...new Set(ids.filter(ehIdPersonalizado))].slice(0, 20);
  if (!pedidos.length) return {};
  const marcas = pedidos.map((_, i) => `?${i + 2}`).join(", ");
  const { results } = await env.DB.prepare(`SELECT ${COLS} FROM exercicio_personalizado WHERE user_id = ?1 AND id IN (${marcas})`).bind(uid, ...pedidos).all<Row>();
  return Object.fromEntries(results.map((r) => [r.id, out(r)]));
}

export async function lerPersonalizado(env: Env, uid: string, id: string): Promise<ExercicioPersonalizado | null> {
  if (!ehIdPersonalizado(id)) return null;
  const r = await env.DB.prepare(`SELECT ${COLS} FROM exercicio_personalizado WHERE user_id = ?1 AND id = ?2`).bind(uid, id).first<Row>();
  return r ? out(r) : null;
}

/** Cria (até 200 por conta, checado no próprio INSERT). Mesmo nome e músculo já existentes → devolve o que existe. */
export async function criarPersonalizado(env: Env, uid: string, raw: unknown, por: CriadoPor): Promise<{ exercicio: ExercicioPersonalizado; criado: boolean }> {
  const v = validarExercicioPersonalizado(raw);
  if (!v.ok) throw new HttpError(400, v.errors.join("; "));
  const x = v.value;
  const id = novoIdPersonalizado(), now = Date.now();
  const r = await env.DB.prepare(`INSERT INTO exercicio_personalizado (user_id, id, nome, musculo, aparelho, descricao, video_url, criado_por, created_at, updated_at)
    SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9 WHERE (SELECT COUNT(*) FROM exercicio_personalizado WHERE user_id = ?1) < ?10
    ON CONFLICT DO NOTHING`)
    .bind(uid, id, x.nome, x.musculo, x.aparelho, x.descricao, x.videoUrl, por, now, LIMITE_PERSONALIZADOS).run();
  if (!r.meta.changes) {
    // conflito no índice único (mesmo nome no músculo, inclusive em corrida): devolve o que já existe
    const igual = await mesmoNome(env, uid, x.musculo, x.nome);
    if (igual) return { exercicio: out(igual), criado: false };
    throw new HttpError(409, `limite de ${LIMITE_PERSONALIZADOS} exercícios personalizados nesta conta: apague algum no app antes de criar outro`, "limite");
  }
  return { exercicio: { id, ...x, criadoPor: por }, criado: true };
}

export async function editarPersonalizado(env: Env, uid: string, id: string, raw: unknown): Promise<ExercicioPersonalizado> {
  const atual = await lerPersonalizado(env, uid, id);
  if (!atual) throw new HttpError(404, "exercício não encontrado");
  const v = validarExercicioPersonalizado(raw, true);
  if (!v.ok) throw new HttpError(400, v.errors.join("; "));
  const x = { ...atual, ...v.value };
  const outro = await mesmoNome(env, uid, x.musculo, x.nome);
  if (outro && outro.id !== id) throw new HttpError(409, "já existe um exercício personalizado com esse nome nesse músculo", "duplicado");
  await env.DB.prepare("UPDATE exercicio_personalizado SET nome = ?3, musculo = ?4, aparelho = ?5, descricao = ?6, video_url = ?7, updated_at = ?8 WHERE user_id = ?1 AND id = ?2")
    .bind(uid, id, x.nome, x.musculo, x.aparelho, x.descricao, x.videoUrl, Date.now()).run();
  return x;
}

type Handler = (req: Request, env: Env, p: Record<string, string>, u: AuthUser) => Promise<Response>;
export function registerPersonalizados(on: (method: string, path: string, h: Handler) => void) {
  on("GET", "/api/exercicios-personalizados", async (_req, env, _p, u) => json({ exercicios: await listarPersonalizados(env, u.id), limite: LIMITE_PERSONALIZADOS }));
  on("PATCH", "/api/exercicios-personalizados/:id", async (req, env, p, u) => {
    const b = await readJson(req, 4 * 1024);
    return json({ exercicio: await editarPersonalizado(env, u.id, p.id, b) });
  });
  // Apagar não mexe em treino já feito (o set_log guarda o ID e o músculo); o plano do dia que ainda o tiver mostra o nome salvo nele.
  on("DELETE", "/api/exercicios-personalizados/:id", async (_req, env, p, u) => {
    if (!ehIdPersonalizado(p.id)) throw new HttpError(404, "exercício não encontrado");
    const r = await env.DB.prepare("DELETE FROM exercicio_personalizado WHERE user_id = ?1 AND id = ?2").bind(u.id, p.id).run();
    if (!r.meta.changes) throw new HttpError(404, "exercício não encontrado");
    return json({ ok: true });
  });
}
