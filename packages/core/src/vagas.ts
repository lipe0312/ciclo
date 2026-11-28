// #165 Vagas por fase (D3: "50 + dono"). O teto vem da tabela `fase` (abrir mais vagas = editar ou criar fase, sem deploy);
// o core só guarda a trava máxima de segurança, que muda por PR. Vaga = conta não-dono ativa + convite pendente, não vencido,
// de conta nova. Convite vencido, revogado ou usado devolve a vaga sozinho: tudo é contado por consulta, sem contador mutável.
// O Worker repete a mesma contagem em SQL dentro do batch que cria a conta (atomicidade); este arquivo é a regra.

/** Trava máxima de contas não-dono, acima de qualquer fase. Só muda por PR. */
export const TETO_SEGURANCA = 500;

/** Teto que vale agora: min(teto da fase, TETO_SEGURANCA, emergência). A var MAX_USERS virou trava de emergência que só
 *  abaixa (inteiro ≥ 0; "0" fecha a entrada). Sem a var ou com valor inválido, não há trava extra. Fase ausente ou com
 *  teto inválido = 0 (falha fechada). */
export function tetoVigente(fase: { teto: number } | null | undefined, emergencia?: string | number | null): number {
  const t = fase?.teto;
  if (typeof t !== "number" || !Number.isInteger(t) || t < 0) return 0;
  let teto = Math.min(t, TETO_SEGURANCA);
  const raw = typeof emergencia === "string" ? emergencia.trim() : emergencia;
  if (raw !== undefined && raw !== null && raw !== "") {
    const e = typeof raw === "number" ? raw : /^\d+$/.test(raw) ? Number(raw) : NaN;
    if (Number.isInteger(e) && e >= 0) teto = Math.min(teto, e);
  }
  return teto;
}

export interface ContaVaga { role: string; deletedAt?: number | null }
export interface ConviteVaga { userId: string | null; expiresAt: number; usedAt?: number | null }
/** Conta que ocupa vaga: não é o dono e está ativa. Conta antiga (sem fase) também ocupa: o teto é de custo, não de turma. */
export const contaOcupaVaga = (c: ContaVaga) => c.role !== "owner" && c.deletedAt == null;
/** Convite que reserva vaga: de conta nova (reset de acesso não), não usado e não vencido. */
export const conviteReservaVaga = (i: ConviteVaga, agora: number) => i.userId == null && i.usedAt == null && i.expiresAt > agora;

export interface VagasFase { usadas: number; teto: number; livres: number; cheio: boolean; texto: string; contas: number; pendentes: number }
/** Vagas a partir das contagens já filtradas (o Worker conta em SQL com as mesmas regras de contaOcupaVaga e conviteReservaVaga). */
export function vagasDe(contas: number, pendentes: number, teto: number): VagasFase {
  const usadas = contas + pendentes, livres = Math.max(0, teto - usadas);
  return { usadas, teto, livres, cheio: livres === 0, texto: `${usadas} de ${teto} vagas`, contas, pendentes };
}
export function vagasDaFase(o: { contas: ContaVaga[]; convitesPendentes: ConviteVaga[]; teto: number; agora: number }): VagasFase {
  return vagasDe(o.contas.filter(contaOcupaVaga).length, o.convitesPendentes.filter((i) => conviteReservaVaga(i, o.agora)).length, o.teto);
}

export interface FaseResumo { nome: string; aberta: boolean }
/** Por que não dá para convidar agora (texto do botão desabilitado) ou null. */
export function motivoSemConvite(fase: FaseResumo | null | undefined, v: Pick<VagasFase, "cheio" | "teto">): string | null {
  if (!fase) return "Nenhuma fase aberta. Abra uma fase para convidar.";
  if (!fase.aberta) return `A fase ${fase.nome} está fechada. Abra a fase para emitir convites novos; os já enviados valem até vencer.`;
  if (v.cheio) return `Sem vagas na fase ${fase.nome}: as ${v.teto} vagas estão com contas ou convites pendentes. Revogue um convite ou aumente o teto.`;
  return null;
}
/** "Fase Piloto 2027 · 13 de 50 vagas · 3 convites pendentes". */
export const textoFase = (fase: FaseResumo, v: Pick<VagasFase, "texto" | "pendentes">) =>
  `Fase ${fase.nome} · ${v.texto} · ${v.pendentes} ${v.pendentes === 1 ? "convite pendente" : "convites pendentes"}`;

// ---- validação das rotas do dono (POST/PATCH /api/account/fases) ----
const dataValida = (v: unknown): v is string => {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};
const nomeFase = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  // eslint-disable-next-line no-control-regex
  const n = v.replace(/[\u0000-\u001f\u007f]/g, "").trim().replace(/\s+/g, " ");
  return n.length >= 1 && n.length <= 40 ? n : null;
};
/** id da fase a partir do nome: minúsculas, sem acento, só [a-z0-9-], até 40. null = nome sem letra ou número. */
export function faseId(nome: string): string | null {
  const s = nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "");
  return s || null;
}

export interface FaseNova { nome: string; teto: number; inicio: string; fimTestes: string | null; aberta: boolean }
export type FaseEdicao = Partial<Pick<FaseNova, "teto" | "fimTestes" | "aberta">>;
/** "criar": nome e teto obrigatórios (início = hoje se não vier). "editar": só teto, fimTestes e aberta, ao menos um.
 *  Teto inteiro de 1 a TETO_SEGURANCA; datas AAAA-MM-DD reais; fim da fase de testes não antes do início. */
export function validarFase(b: Record<string, unknown>, modo: "criar", ctx: { hoje: string }): { ok: boolean; valor: FaseNova; erros: string[] };
export function validarFase(b: Record<string, unknown>, modo: "editar", ctx: { hoje: string; inicio: string }): { ok: boolean; valor: FaseEdicao; erros: string[] };
export function validarFase(b: Record<string, unknown>, modo: "criar" | "editar", ctx: { hoje: string; inicio?: string }): { ok: boolean; valor: FaseNova & FaseEdicao; erros: string[] } {
  const erros: string[] = [], v: Record<string, unknown> = {};
  const tem = (k: string) => Object.prototype.hasOwnProperty.call(b, k) && b[k] !== undefined;
  if (modo === "criar") {
    const n = nomeFase(b.nome);
    if (n && faseId(n)) v.nome = n; else erros.push("nome da fase de 1 a 40 caracteres");
  }
  if (tem("teto") || modo === "criar") {
    const t = b.teto;
    if (typeof t === "number" && Number.isInteger(t) && t >= 1 && t <= TETO_SEGURANCA) v.teto = t;
    else erros.push(`teto inteiro de 1 a ${TETO_SEGURANCA}`);
  }
  let inicio = ctx.inicio ?? ctx.hoje;
  if (modo === "criar") {
    if (tem("inicio")) { if (dataValida(b.inicio)) inicio = b.inicio; else erros.push("início deve ser uma data AAAA-MM-DD"); }
    v.inicio = inicio;
  }
  if (tem("fimTestes")) {
    const f = b.fimTestes;
    if (f === null || f === "") v.fimTestes = null;
    else if (!dataValida(f)) erros.push("fim da fase de testes deve ser uma data AAAA-MM-DD");
    else if (f < inicio) erros.push("o fim da fase de testes não pode ser antes do início");
    else v.fimTestes = f;
  } else if (modo === "criar") v.fimTestes = null;
  if (tem("aberta")) { if (typeof b.aberta === "boolean") v.aberta = b.aberta; else erros.push("aberta deve ser verdadeiro ou falso"); }
  else if (modo === "criar") v.aberta = true;
  if (modo === "editar" && !erros.length && !Object.keys(v).length) erros.push("nada para mudar (teto, fimTestes ou aberta)");
  return { ok: !erros.length, valor: v as unknown as FaseNova, erros };
}
