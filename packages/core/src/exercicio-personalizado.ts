// #107 Exercício personalizado por conta: a exceção controlada à regra "IDs só do catálogo". A IA só cria depois de
// buscar no catálogo sem achar. Nome e descrição são dado do usuário (nunca instrução). O vídeo é só link do YouTube,
// normalizado aqui e mostrado como link externo (sem iframe: a CSP não muda).
import { EQUIPMENT_BY_ID, MUSCLES } from "./catalog.ts";
import type { Kind, MuscleId } from "./catalog.ts";

export const LIMITE_PERSONALIZADOS = 200;
export const PREFIXO_PERSONALIZADO = "cus_";
export const NOME_PERSONALIZADO_MAX = 80;
export const DESCRICAO_PERSONALIZADO_MAX = 600;
const ID_RE = /^cus_[a-z0-9]{8,32}$/;
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

export type CriadoPor = "ia" | "usuario";
export interface ExercicioPersonalizado {
  id: string; nome: string; musculo: MuscleId; aparelho: string | null;
  descricao: string; videoUrl: string | null; criadoPor: CriadoPor;
}
export type CamposPersonalizado = Omit<ExercicioPersonalizado, "id" | "criadoPor">;

export const ehIdPersonalizado = (id: unknown): id is string => typeof id === "string" && ID_RE.test(id);

/** `cus_` + 12 caracteres [a-z0-9] aleatórios (crypto do runtime: Worker, navegador e Node). */
export function novoIdPersonalizado(): string {
  const abc = "abcdefghijklmnopqrstuvwxyz0123456789", b = crypto.getRandomValues(new Uint8Array(12));
  return PREFIXO_PERSONALIZADO + Array.from(b, (x) => abc[x % abc.length]).join("");
}

/** Link do YouTube aceito só em https, nos hosts oficiais e nos formatos watch?v=, youtu.be/ e /shorts/.
 *  Devolve o link canônico `https://www.youtube.com/watch?v=ID` ou null. */
export function normalizarYoutube(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s || s.length > 300) return null;
  let u: URL;
  try { u = new URL(s); } catch { return null; }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
  const host = u.hostname.toLowerCase(), parts = u.pathname.split("/").filter(Boolean);
  let vid: string | null = null;
  if (host === "youtu.be") vid = parts.length === 1 ? parts[0] : null;
  else if (host === "www.youtube.com" || host === "youtube.com" || host === "m.youtube.com") {
    if (parts.length === 1 && parts[0] === "watch") vid = u.searchParams.get("v");
    else if (parts.length === 2 && parts[0] === "shorts") vid = parts[1];
  }
  return vid && VIDEO_ID_RE.test(vid) ? `https://www.youtube.com/watch?v=${vid}` : null;
}

/** Aparelhos aceitos: os do enum, sem cardio. */
export const aparelhoValido = (a: unknown): a is string => typeof a === "string" && !!EQUIPMENT_BY_ID[a] && EQUIPMENT_BY_ID[a].cat !== "cardio";

/** Tipo do item no treino a partir do aparelho (sem aparelho = peso do corpo). */
export function tipoPersonalizado(aparelho: string | null): Kind {
  if (!aparelho) return "corpo";
  const cat = EQUIPMENT_BY_ID[aparelho]?.cat;
  return cat === "cabos" ? "cabo" : cat === "maquinas" ? "maquina" : "livre";
}

const texto = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : v);

/** Valida e normaliza os campos. `parcial` (edição): só confere o que veio. videoUrl "" ou null apaga o vídeo. */
export function validarExercicioPersonalizado(raw: unknown, parcial?: false): { ok: true; value: CamposPersonalizado } | { ok: false; errors: string[] };
export function validarExercicioPersonalizado(raw: unknown, parcial: true): { ok: true; value: Partial<CamposPersonalizado> } | { ok: false; errors: string[] };
export function validarExercicioPersonalizado(raw: unknown, parcial = false): { ok: true; value: Partial<CamposPersonalizado> } | { ok: false; errors: string[] } {
  const o = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const errors: string[] = [], value: Partial<CamposPersonalizado> = {};
  const tem = (k: string) => !parcial || k in o;
  if (tem("nome")) {
    const n = texto(o.nome);
    if (typeof n !== "string" || n.length < 2 || n.length > NOME_PERSONALIZADO_MAX) errors.push(`nome: de 2 a ${NOME_PERSONALIZADO_MAX} caracteres`);
    else value.nome = n;
  }
  if (tem("musculo")) {
    if (typeof o.musculo !== "string" || !(o.musculo in MUSCLES)) errors.push(`musculo: use um de ${Object.keys(MUSCLES).join(", ")}`);
    else value.musculo = o.musculo as MuscleId;
  }
  if (tem("aparelho")) {
    if (o.aparelho == null || o.aparelho === "") value.aparelho = null;
    else if (!aparelhoValido(o.aparelho)) errors.push("aparelho: use um ID de aparelho do Ciclo (ou nenhum, para peso do corpo)");
    else value.aparelho = o.aparelho;
  }
  if (tem("descricao")) {
    const d = typeof o.descricao === "string" ? o.descricao.trim() : o.descricao;
    if (typeof d !== "string" || d.length < 1 || d.length > DESCRICAO_PERSONALIZADO_MAX) errors.push(`descricao: de 1 a ${DESCRICAO_PERSONALIZADO_MAX} caracteres`);
    else value.descricao = d;
  }
  if (tem("videoUrl")) {
    if (o.videoUrl == null || o.videoUrl === "") value.videoUrl = null;
    else {
      const url = normalizarYoutube(o.videoUrl);
      if (!url) errors.push("videoUrl: só link do YouTube (https://www.youtube.com/watch?v=…, https://youtu.be/… ou /shorts/…)");
      else value.videoUrl = url;
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true, value };
}
