// #115 Médias de comida com refeições não registradas. Fica fora do índice do core (o JS inicial do app está no teto): a tela
// Comida e o Worker importam `@ciclo/core/comida-medias`. Puro, sem dependências.
import { MEALS, dayTotals, foodAverages } from "./comida.ts";
import type { DayTotals, DiaConta, FoodAverages, FoodEntry, Meal } from "./comida.ts";

const addDays = (iso: string, n: number) => new Date(Date.parse(iso + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);

// A premissa é que a pessoa esqueceu de registrar, não que não comeu. Dia sem nada fica fora da média (ou conta 0, se ela
// escolher); com algum registro, café/almoço/jantar que faltaram entram com a média daquela refeição (lanche e ceia não, por
// padrão). "Não comi" marcado conta 0 de verdade e nunca é completado. Sem histórico da refeição não há média: não chuta.
export const DIA_VAZIO = ["fora", "zero"] as const;
export type DiaVazio = (typeof DIA_VAZIO)[number];
export const DIA_VAZIO_NM: Record<DiaVazio, string> = { fora: "Fica fora da média", zero: "Conta como 0" };
export interface RegrasMedias { completar: Record<Meal, boolean>; diaVazio: DiaVazio }
export const REGRAS_MEDIAS_PADRAO: Readonly<RegrasMedias> = Object.freeze({ completar: Object.freeze({ cafe: true, almoco: true, lanche: false, jantar: true, ceia: false }), diaVazio: "fora" }) as RegrasMedias;
/** Hora (0-24) a partir da qual a refeição de HOJE já passou: antes disso ela não falta (ainda pode acontecer). */
export const MEAL_FIM: Record<Meal, number> = { cafe: 10, almoco: 14, lanche: 18, jantar: 22, ceia: 24 };
/** Dias de histórico para a média de cada refeição. */
export const JANELA_MEDIA_REFEICAO = 28;
export interface NaoComi { date: string; meal: Meal }
export interface MediaRefeicao { kcal: number; prot: number; dias: number }
export type MediasRefeicao = Partial<Record<Meal, MediaRefeicao>>;
export interface ContextoMedias { regras: RegrasMedias; naoComi: readonly NaoComi[]; medias: MediasRefeicao; /** hoje e a hora (0-23): refeição de hoje que ainda não passou não falta */ agora?: { date: string; hora: number } }
export interface Estimada { meal: Meal; kcal: number; prot: number }
/** `conta` = entra na média (dia com registro, ou vazio com diaVazio = "zero"); `estimadas` = completadas pela média (somadas em kcal/prot). */
export interface DiaMedia extends DiaConta {
  estimadas: Estimada[];
  naoComi: Meal[];
  /** o que foi registrado de fato */ real: { kcal: number; prot: number };
}

/** Média de cada refeição nos `dias` até `end`: soma da refeição em cada dia em que ela foi registrada ÷ esses dias. */
export function mediasPorRefeicao(entries: readonly FoodEntry[], end: string, dias = JANELA_MEDIA_REFEICAO): MediasRefeicao {
  const from = addDays(end, -(dias - 1));
  const por = new Map<Meal, Map<string, { kcal: number; prot: number }>>();
  for (const e of entries) {
    if (!e.meal || e.date < from || e.date > end) continue;
    const m = por.get(e.meal) ?? new Map(); const d = m.get(e.date) ?? { kcal: 0, prot: 0 };
    d.kcal += e.kcal ?? 0; d.prot += e.prot ?? 0; m.set(e.date, d); por.set(e.meal, m);
  }
  const out: MediasRefeicao = {};
  for (const meal of MEALS) {
    const m = por.get(meal); if (!m?.size) continue;
    const v = [...m.values()];
    out[meal] = { kcal: Math.round(v.reduce((s, x) => s + x.kcal, 0) / v.length), prot: Math.round((v.reduce((s, x) => s + x.prot, 0) / v.length) * 10) / 10, dias: v.length };
  }
  return out;
}

const passou = (meal: Meal, date: string, agora?: { date: string; hora: number }) => !agora || date < agora.date || (date === agora.date && agora.hora >= MEAL_FIM[meal]);

/** Refeições completáveis que faltam no dia (com a média, ou null sem histórico): é o "não comeu ou esqueceu?". Dia sem nada: nada falta. */
export function refeicoesACompletar(entries: readonly FoodEntry[], date: string, ctx: ContextoMedias): { meal: Meal; media: { kcal: number; prot: number } | null }[] {
  const doDia = entries.filter((e) => e.date === date);
  const nao = new Set(ctx.naoComi.filter((n) => n.date === date).map((n) => n.meal));
  if (!doDia.length && !nao.size) return [];
  return MEALS.filter((m) => ctx.regras.completar[m] && !nao.has(m) && !doDia.some((e) => e.meal === m) && passou(m, date, ctx.agora))
    .map((m) => { const x = ctx.medias[m]; return { meal: m, media: x ? { kcal: x.kcal, prot: x.prot } : null }; });
}

/** Totais do dia com as regras: o registrado + as refeições completadas pela média. */
export function diaComMedias(entries: readonly FoodEntry[], date: string, ctx: ContextoMedias): DiaMedia {
  const t = dayTotals(entries, date);
  const comeu = new Set(entries.filter((e) => e.date === date && e.meal).map((e) => e.meal!));
  const naoComi = MEALS.filter((m) => !comeu.has(m) && ctx.naoComi.some((n) => n.date === date && n.meal === m));
  const logged = t.logged || naoComi.length > 0;
  const real = { kcal: t.kcal, prot: t.prot };
  if (!logged) return { ...t, conta: ctx.regras.diaVazio === "zero", estimadas: [], naoComi: [], real };
  const estimadas = refeicoesACompletar(entries, date, ctx).flatMap((f) => (f.media ? [{ meal: f.meal, kcal: f.media.kcal, prot: f.media.prot }] : []));
  const kcal = t.kcal + estimadas.reduce((s, e) => s + e.kcal, 0), prot = t.prot + estimadas.reduce((s, e) => s + e.prot, 0);
  return { date, kcal: Math.round(kcal), prot: Math.round(prot), logged, conta: true, estimadas, naoComi, real };
}

/** Preferências vindas do app/MCP: tipos estritos (booleano por refeição, diaVazio fora|zero). Só o que veio muda; o resto fica o padrão. */
export function lerRegrasMedias(v: unknown, base: RegrasMedias = REGRAS_MEDIAS_PADRAO): { ok: true; regras: RegrasMedias } | { ok: false; erro: string } {
  if (!v || typeof v !== "object" || Array.isArray(v)) return { ok: false, erro: "preferências: objeto { completar, diaVazio }" };
  const o = v as Record<string, unknown>;
  const extra = Object.keys(o).find((k) => k !== "completar" && k !== "diaVazio");
  if (extra) return { ok: false, erro: `campo desconhecido: ${extra}` };
  if (o.completar === undefined && o.diaVazio === undefined) return { ok: false, erro: "diga completar e/ou diaVazio" };
  const completar = { ...base.completar };
  if (o.completar !== undefined) {
    if (!o.completar || typeof o.completar !== "object" || Array.isArray(o.completar)) return { ok: false, erro: "completar: objeto { refeição: true|false }" };
    for (const [k, x] of Object.entries(o.completar)) {
      if (!(MEALS as readonly string[]).includes(k)) return { ok: false, erro: `completar.${k}: refeição deve ser ${MEALS.join("|")}` };
      if (typeof x !== "boolean") return { ok: false, erro: `completar.${k}: true ou false` };
      completar[k as Meal] = x;
    }
  }
  let diaVazio = base.diaVazio;
  if (o.diaVazio !== undefined) {
    if (typeof o.diaVazio !== "string" || !(DIA_VAZIO as readonly string[]).includes(o.diaVazio)) return { ok: false, erro: `diaVazio deve ser ${DIA_VAZIO.join("|")}` };
    diaVazio = o.diaVazio as DiaVazio;
  }
  return { ok: true, regras: { completar, diaVazio } };
}

/** Leitura tolerante (banco, cache do aparelho): 0/1 ou booleano por refeição; o que não fizer sentido vira o padrão. */
export function regrasMediasDe(v: unknown): RegrasMedias {
  const o = (v && typeof v === "object" ? v : {}) as { completar?: Record<string, unknown>; diaVazio?: unknown };
  const c = o.completar && typeof o.completar === "object" ? o.completar : {};
  const completar = { ...REGRAS_MEDIAS_PADRAO.completar };
  for (const m of MEALS) { const x = c[m]; if (x === true || x === 1) completar[m] = true; else if (x === false || x === 0) completar[m] = false; }
  const diaVazio = (DIA_VAZIO as readonly unknown[]).includes(o.diaVazio) ? (o.diaVazio as DiaVazio) : REGRAS_MEDIAS_PADRAO.diaVazio;
  return { completar, diaVazio };
}

/** A média da semana (ou do mês, com `days`) com as regras da pessoa. */
export const mediasSemana = (entries: readonly FoodEntry[], end: string, targets: { kcal: number; protein: number }, days: number, ctx: ContextoMedias): FoodAverages & { days: DiaMedia[] } =>
  foodAverages(entries, end, targets, days, (d) => diaComMedias(entries, d, ctx)) as FoodAverages & { days: DiaMedia[] };
