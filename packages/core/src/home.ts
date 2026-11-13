// Home de evolução (#29): tendência, ritmo das metas, séries semanais dos painéis e "o que você não está registrando".
// Tudo puro: o Worker manda linhas já agregadas por dia (HomeRaw) e o app (ou a demonstração) recebe números prontos.

import { EXERCISES, EXERCISE_BY_ID, MUSCLE_IDS } from "./catalog.ts";
import type { MuscleId } from "./catalog.ts";
import { mondayOf } from "./checkin.ts";
import { foodAverages } from "./comida.ts";
import { DEFAULT_PROFILE } from "./perfil.ts";
import type { FoodAverages } from "./comida.ts";

const DAY = 864e5;
const addDays = (iso: string, n: number) => new Date(Date.parse(iso + "T12:00:00Z") + n * DAY).toISOString().slice(0, 10);
const diffDays = (a: string, b: string) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / DAY);
const r2 = (n: number) => Math.round(n * 100) / 100;
const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/** `n` segundas-feiras seguidas, a última é a da semana de `hoje` (da mais antiga à mais nova). */
export function semanasAte(hoje: string, n: number): string[] {
  const m = mondayOf(hoje);
  return Array.from({ length: n }, (_, i) => addDays(m, (i - n + 1) * 7));
}
const semanaIdx = (semanas: readonly string[], date: string): number => {
  const i = Math.floor(diffDays(semanas[0], date) / 7);
  return i >= 0 && i < semanas.length ? i : -1;
};

// ---------- tendência ----------
export interface Ponto { date: string; value: number }
export type Sentido = "sobe" | "desce" | "estavel" | "sem_dados";
export interface Tendencia { perWeek: number | null; sentido: Sentido; n: number }

/** Reta dos mínimos quadrados sobre os pontos, em unidade por semana. Precisa de ≥ 2 pontos espalhados por ≥ 7 dias.
 *  `eps` = variação por semana abaixo da qual a série conta como estável (ruído da medida). */
export function trend(points: readonly Ponto[], eps = 0.05): Tendencia {
  const p = points.filter((x) => finite(x.value) && /^\d{4}-\d{2}-\d{2}$/.test(x.date)).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (p.length < 2 || diffDays(p[0].date, p[p.length - 1].date) < 7) return { perWeek: null, sentido: "sem_dados", n: p.length };
  const xs = p.map((x) => diffDays(p[0].date, x.date)), ys = p.map((x) => x.value);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
  const den = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  const perWeek = r2((den ? xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / den : 0) * 7);
  return { perWeek, sentido: Math.abs(perWeek) < eps ? "estavel" : perWeek > 0 ? "sobe" : "desce", n: p.length };
}

// ---------- ritmo das metas ----------
export type Ritmo = "no_ritmo" | "atras" | "a_frente" | "sem_dados";
export interface MetaInput {
  inicio: number | null; atual: number | null;
  /** mudança desejada no horizonte (ex.: +1,5 cm); 0 = só manter */
  alvo: number;
  horizonte: number;
  /** semana atual da meta (1 = primeira) */
  semana: number;
  /** meta de manter: quanto a medida pode subir sem sair do ritmo */
  tolerancia?: number;
}
export interface MetaRitmo { feito: number | null; esperado: number; pct: number | null; ritmo: Ritmo }

/** O ganho esperado cresce em linha reta até o horizonte. Meta de manter (alvo 0) só sai do ritmo se passar da tolerância. */
export function ritmoMeta(m: MetaInput): MetaRitmo {
  const sem = Math.max(0, Math.min(m.semana, m.horizonte));
  const esperado = r2(m.horizonte > 0 ? (m.alvo * sem) / m.horizonte : 0);
  if (!finite(m.inicio) || !finite(m.atual)) return { feito: null, esperado, pct: null, ritmo: "sem_dados" };
  const feito = Math.round((m.atual - m.inicio) * 1000) / 1000;
  if (m.alvo === 0) return { feito, esperado: 0, pct: null, ritmo: feito > (m.tolerancia ?? 1) ? "atras" : "no_ritmo" };
  const faixa = Math.max(Math.abs(m.alvo) * 0.2, 0.1);
  const dif = (feito - esperado) * Math.sign(m.alvo);
  return { feito, esperado, pct: Math.round((feito / m.alvo) * 100), ritmo: dif > faixa ? "a_frente" : dif < -faixa ? "atras" : "no_ritmo" };
}

/** Aderência (% de dias treinados ou de músculos com 2×) contra a meta, com 10 pontos de folga. */
export function ritmoAderencia(pct: number | null, meta: number): Ritmo {
  if (!finite(pct)) return "sem_dados";
  return pct >= meta + 10 ? "a_frente" : pct >= meta - 10 ? "no_ritmo" : "atras";
}
export const RITMO_TXT: Record<Ritmo, string> = { no_ritmo: "no ritmo", atras: "atrás", a_frente: "à frente", sem_dados: "sem dados" };

// ---------- séries dos painéis ----------
/** Linhas agregadas pelo Worker (uma por dia/músculo/exercício). Nenhum texto livre do dono entra aqui. */
export interface HomeRaw {
  sets: { date: string; muscle: string; n: number }[];
  e1rm: { date: string; exerciseId: string; e1rm: number }[];
  /** dias com sessão de treino */
  sessoes: string[];
  /** dias marcados como "fui" */
  presenca: string[];
  cardio: { date: string; minutes: number }[];
  pesos: { date: string; kg: number }[];
  medidas: { date: string; braco: number | null; cintura: number | null }[];
  /** totais por dia (últimos 28 dias) */
  comida: { date: string; kcal: number; prot: number }[];
  checkins: string[];
  checkouts: string[];
  /** última medida / peso de qualquer época (a janela dos painéis pode não alcançar) */
  ultimaMedida?: string | null; ultimoPeso?: string | null;
}

export interface ExercicioChave { exerciseId: string; muscle: MuscleId; serie: (number | null)[]; atual: number; delta: number }
export interface HomeSeries {
  semanas: string[];
  volume: Partial<Record<MuscleId, number[]>>;
  e1rm: ExercicioChave[];
  peso: { serie: (number | null)[]; trend: Tendencia; ultimo: number | null; primeiro: number | null };
  braco: Ponto[]; cintura: Ponto[];
  presenca: { semana: number[]; aderencia: number[]; meta: number };
  cardio: number[];
  /** % de músculos treinados em ≥ 2 dias na semana */
  freq2: number[];
}
export interface HomeOpts { hoje: string; prioridades: readonly string[]; diasMeta: number; semanas?: number; chave?: number }

/** Semanas calculadas (as metas usam 12; os painéis mostram as últimas 8). */
export const HOME_SEMANAS = 12;
export const PAINEL_SEMANAS = 8;

export function homeSeries(raw: HomeRaw, o: HomeOpts): HomeSeries {
  const n = o.semanas ?? HOME_SEMANAS, semanas = semanasAte(o.hoje, n);
  const zeros = () => Array.from({ length: n }, () => 0);

  const volume: HomeSeries["volume"] = {};
  const pri = MUSCLE_IDS.filter((m) => o.prioridades.includes(m));
  for (const m of pri) volume[m] = zeros();
  const diasPorMusculo: Map<string, Set<string>>[] = Array.from({ length: n }, () => new Map());
  for (const r of raw.sets) {
    const i = semanaIdx(semanas, r.date);
    if (i < 0 || !finite(r.n) || r.n <= 0) continue;
    if (volume[r.muscle as MuscleId]) volume[r.muscle as MuscleId]![i] += r.n;
    const set = diasPorMusculo[i].get(r.muscle) ?? new Set<string>();
    set.add(r.date); diasPorMusculo[i].set(r.muscle, set);
  }
  const freq2 = diasPorMusculo.map((mp) => Math.round(([...mp.values()].filter((s) => s.size >= 2).length / MUSCLE_IDS.length) * 100));

  // e1RM por semana (máximo); só entra exercício medido em ≥ 2 semanas. Prioritários primeiro, depois quem tem mais semanas.
  const porEx = new Map<string, (number | null)[]>();
  for (const r of raw.e1rm) {
    const i = semanaIdx(semanas, r.date);
    if (i < 0 || !finite(r.e1rm) || r.e1rm <= 0 || !EXERCISE_BY_ID[r.exerciseId]) continue;
    const s = porEx.get(r.exerciseId) ?? Array.from({ length: n }, () => null as number | null);
    s[i] = Math.max(s[i] ?? 0, r.e1rm); porEx.set(r.exerciseId, s);
  }
  const chaves: ExercicioChave[] = [];
  for (const [exerciseId, serie] of porEx) {
    const vals = serie.filter(finite);
    if (vals.length < 2) continue;
    chaves.push({ exerciseId, muscle: EXERCISE_BY_ID[exerciseId].m, serie: serie.map((v) => (v == null ? null : r2(v))), atual: r2(vals[vals.length - 1]), delta: r2(vals[vals.length - 1] - vals[0]) });
  }
  const pesoPri = (e: ExercicioChave) => (o.prioridades.includes(e.muscle) ? 0 : 1);
  chaves.sort((a, b) => pesoPri(a) - pesoPri(b) || b.serie.filter(finite).length - a.serie.filter(finite).length || (a.exerciseId < b.exerciseId ? -1 : 1));

  // presença = sessões ∪ "fui" no mesmo dia; aderência contra a meta de dias da semana
  const dias7 = Array.from({ length: n }, () => new Set<string>());
  for (const d of [...raw.sessoes, ...raw.presenca]) { const i = semanaIdx(semanas, d); if (i >= 0) dias7[i].add(d); }
  const presenca = dias7.map((s) => s.size);
  const meta = Math.max(1, o.diasMeta);
  const aderencia = presenca.map((p) => Math.min(100, Math.round((p / meta) * 100)));

  const cardio = zeros();
  for (const c of raw.cardio) { const i = semanaIdx(semanas, c.date); if (i >= 0 && finite(c.minutes)) cardio[i] += c.minutes; }

  const pesoSem: { s: number; c: number }[] = Array.from({ length: n }, () => ({ s: 0, c: 0 }));
  for (const p of raw.pesos) { const i = semanaIdx(semanas, p.date); if (i >= 0 && finite(p.kg)) { pesoSem[i].s += p.kg; pesoSem[i].c++; } }
  const pesosOrd = raw.pesos.filter((p) => finite(p.kg)).sort((a, b) => (a.date < b.date ? -1 : 1));

  const pts = (f: (m: HomeRaw["medidas"][number]) => number | null): Ponto[] =>
    raw.medidas.map((m) => ({ date: m.date, value: f(m) })).filter((p): p is Ponto => finite(p.value)).sort((a, b) => (a.date < b.date ? -1 : 1));

  return {
    semanas, volume, e1rm: chaves.slice(0, o.chave ?? 3), freq2,
    peso: {
      serie: pesoSem.map((x) => (x.c ? r2(x.s / x.c) : null)),
      trend: trend(pesosOrd.map((p) => ({ date: p.date, value: p.kg }))),
      ultimo: pesosOrd.length ? pesosOrd[pesosOrd.length - 1].kg : null, primeiro: pesosOrd.length ? pesosOrd[0].kg : null,
    },
    braco: pts((m) => m.braco), cintura: pts((m) => m.cintura),
    presenca: { semana: presenca, aderencia, meta }, cardio,
  };
}

/** Conta sem nenhum dado de evolução (nenhuma série, peso, medida, comida ou check-in). */
export function homeVazio(raw: HomeRaw): boolean {
  return !raw.sets.length && !raw.sessoes.length && !raw.presenca.length && !raw.cardio.length && !raw.pesos.length && !raw.medidas.length
    && !raw.comida.length && !raw.checkins.length && !raw.checkouts.length;
}

// ---------- o que você não está registrando ----------
export interface Registros {
  ultimaMedida: string | null; ultimoPeso: string | null;
  /** dias com comida / check-in nos últimos `diasDevidos` dias (7; menos numa conta de poucos dias) */
  diasComida: number; diasCheckin: number; diasDevidos: number;
  aparelhosSemMidia: number; cargasPreenchidas: boolean;
}
export type GapId = "medidas" | "peso" | "comida" | "checkin" | "midia" | "cargas";
export interface Gap { id: GapId; texto: string; impacto: number; cta: string; href: string }
export const GAPS_MAX = 5;

/** Peso de cada lacuna no objetivo (braço e cintura vêm das medidas; comida e peso sustentam a meta de calorias). */
const BASE: Record<GapId, number> = { medidas: 100, comida: 85, peso: 70, cargas: 40, checkin: 50, midia: 30 };
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** Lacunas de registro, da de maior impacto para a de menor (máx. 5). Impacto = peso da lacuna × gravidade (0 a 1). */
export function gaps(r: Registros, hoje: string): Gap[] {
  const out: Gap[] = [];
  const add = (id: GapId, gravidade: number, texto: string, cta: string, href: string) =>
    out.push({ id, texto, impacto: Math.round(BASE[id] * clamp01(gravidade)), cta, href });

  const dm = r.ultimaMedida ? diffDays(r.ultimaMedida, hoje) : 99;
  if (dm >= 15) add("medidas", dm / 30, r.ultimaMedida ? `medidas há ${dm} dias` : "nenhuma medida ainda", "Medir agora", "#corpo");
  const dp = r.ultimoPeso ? diffDays(r.ultimoPeso, hoje) : 99;
  if (dp >= 7) add("peso", dp / 14, r.ultimoPeso ? `peso há ${dp} dias` : "nenhum peso ainda", "Pesar hoje", "#diario");
  const dev = Math.max(0, r.diasDevidos);
  if (dev > 0 && r.diasComida / dev < 0.7) add("comida", 1 - r.diasComida / dev, `comida em ${r.diasComida} de ${dev} ${dev === 1 ? "dia" : "dias"}`, "Registrar comida", "#comida");
  if (dev > 0 && r.diasCheckin / dev < 0.7) add("checkin", 1 - r.diasCheckin / dev, `check-in em ${r.diasCheckin} de ${dev}`, "Fazer check-in", "#diario");
  if (r.aparelhosSemMidia > 0) add("midia", r.aparelhosSemMidia / 5, `${r.aparelhosSemMidia} ${r.aparelhosSemMidia === 1 ? "aparelho sem mídia" : "aparelhos sem mídia"}`, "Anexar mídia", "#academias");
  if (!r.cargasPreenchidas) add("cargas", 1, "Perfil: cargas lembradas não preenchidas", "Preencher", "#perfil/experiencia");

  return out.sort((a, b) => b.impacto - a.impacto || (a.id < b.id ? -1 : 1)).slice(0, GAPS_MAX);
}

// ---------- aparelhos sem mídia ----------
/** Aparelhos (por lugar que não é a casa) usados pelos exercícios dos músculos prioritários e sem foto/vídeo da regulagem. */
export function aparelhosSemMidia(
  gyms: readonly { id: string; kind?: string | null; equipment: readonly string[] }[],
  midias: readonly { gymId: string; equipmentId: string }[],
  prioridades: readonly string[],
): number {
  if (!prioridades.length) return 0;
  const usados = new Set(EXERCISES.filter((e) => prioridades.includes(e.m) && !e.planOff).flatMap((e) => e.eq));
  const tem = new Set(midias.map((m) => `${m.gymId}|${m.equipmentId}`));
  let n = 0;
  for (const g of gyms) if (g.kind !== "casa") for (const q of g.equipment) if (usados.has(q) && !tem.has(`${g.id}|${q}`)) n++;
  return n;
}

// ---------- a Home inteira ----------
export interface HomeCtx {
  hoje: string; prioridades: readonly string[]; diasMeta: number;
  meta: { horizonWeeks: number; bracoCm: number; cinturaCm: number; pesoKg: number; aderenciaPct: number };
  dieta: { kcal: number; protein: number };
  /** dias que dá para cobrar de registro (7; menos numa conta com poucos dias) */
  diasDevidos: number; aparelhosSemMidia: number; cargasPreenchidas: boolean;
}
export interface MetaCard {
  id: "braco" | "cintura" | "peso" | "freq"; nome: string; unidade: string;
  inicio: number | null; atual: number | null; feito: number | null; alvo: number; esperado: number; pct: number | null;
  ritmo: Ritmo; serie: number[]; semana: number;
}
export interface HomeView {
  vazio: boolean; series: HomeSeries; metas: MetaCard[];
  comida: { hoje: { kcal: number; prot: number; logged: boolean }; media: FoodAverages; avgKcal: number | null; avgProt: number | null; kcalPct: number | null; protPct: number | null; daysLogged: number; metaKcal: number; metaProt: number };
  gaps: Gap[];
}

const semanaDa = (inicio: string | null, hoje: string) => (inicio ? Math.max(1, Math.floor(diffDays(inicio, hoje) / 7) + 1) : 1);

export function homeView(raw: HomeRaw, c: HomeCtx): HomeView {
  const series = homeSeries(raw, { hoje: c.hoje, prioridades: c.prioridades, diasMeta: c.diasMeta, semanas: HOME_SEMANAS });
  const h = c.meta.horizonWeeks;

  const med = (pts: Ponto[], alvo: number, id: "braco" | "cintura", nome: string): MetaCard => {
    const ini = pts[0] ?? null, at = pts[pts.length - 1] ?? null, semana = semanaDa(ini?.date ?? null, c.hoje);
    const r = ritmoMeta({ inicio: ini?.value ?? null, atual: at?.value ?? null, alvo, horizonte: h, semana, tolerancia: 1 });
    return { id, nome, unidade: "cm", inicio: ini?.value ?? null, atual: at?.value ?? null, feito: r.feito, alvo, esperado: r.esperado, pct: r.pct, ritmo: r.ritmo, serie: pts.map((p) => p.value), semana: Math.min(semana, h) };
  };
  const pesoPts = series.peso.serie.filter(finite);
  const pesoIni = raw.pesos.length ? raw.pesos.map((p) => p.date).sort()[0] : null;
  const pesoR = ritmoMeta({ inicio: series.peso.primeiro, atual: series.peso.ultimo, alvo: c.meta.pesoKg, horizonte: h, semana: semanaDa(pesoIni, c.hoje) });
  // frequência 2×: média das últimas 4 semanas fechadas (a atual ainda está no meio) contra a meta de aderência
  const fechadas = series.freq2.slice(-5, -1), freq = fechadas.length ? Math.round(fechadas.reduce((a, b) => a + b, 0) / fechadas.length) : null;
  const metas: MetaCard[] = [
    med(series.braco, c.meta.bracoCm, "braco", "Braço"),
    med(series.cintura, c.meta.cinturaCm, "cintura", "Cintura"),
    { id: "peso", nome: "Peso", unidade: "kg", inicio: series.peso.primeiro, atual: series.peso.ultimo, feito: pesoR.feito, alvo: c.meta.pesoKg, esperado: pesoR.esperado, pct: pesoR.pct, ritmo: pesoR.ritmo, serie: pesoPts, semana: Math.min(semanaDa(pesoIni, c.hoje), h) },
    { id: "freq", nome: "Frequência 2×", unidade: "%", inicio: null, atual: freq, feito: null, alvo: c.meta.aderenciaPct, esperado: c.meta.aderenciaPct, pct: freq, ritmo: ritmoAderencia(freq, c.meta.aderenciaPct), serie: series.freq2, semana: 0 },
  ];

  const media = foodAverages(raw.comida.map((x) => ({ date: x.date, kcal: x.kcal, prot: x.prot })), c.hoje, { kcal: c.dieta.kcal, protein: c.dieta.protein }, 7);
  const hoje = media.days[media.days.length - 1];

  const dev = Math.max(0, Math.min(c.diasDevidos, 7)), desde = addDays(c.hoje, -(dev - 1));
  const noPeriodo = (ds: Iterable<string>) => new Set([...ds].filter((d) => d >= desde && d <= c.hoje)).size;
  const ultima = (ds: (string | null | undefined)[]) => ds.filter((d): d is string => !!d).sort().pop() ?? null;
  const reg: Registros = {
    ultimaMedida: ultima([raw.ultimaMedida, ...raw.medidas.map((m) => m.date)]), ultimoPeso: ultima([raw.ultimoPeso, ...raw.pesos.map((p) => p.date)]),
    diasComida: noPeriodo(raw.comida.map((x) => x.date)), diasCheckin: noPeriodo(raw.checkins), diasDevidos: dev,
    aparelhosSemMidia: c.aparelhosSemMidia, cargasPreenchidas: c.cargasPreenchidas,
  };
  return {
    vazio: homeVazio(raw), series, metas,
    comida: { hoje: { kcal: hoje.kcal, prot: hoje.prot, logged: hoje.logged }, media, avgKcal: media.avgKcal, avgProt: media.avgProt, kcalPct: media.kcalPct, protPct: media.protPct, daysLogged: media.daysLogged, metaKcal: c.dieta.kcal, metaProt: c.dieta.protein },
    gaps: gaps(reg, c.hoje),
  };
}

/** Parte do contexto que vem do perfil (qualquer perfil, mesmo parcial ou antigo): o que falta cai no padrão. */
export function ctxDoPerfil(p: Record<string, any> | null | undefined): Pick<HomeCtx, "prioridades" | "diasMeta" | "meta" | "dieta" | "cargasPreenchidas"> {
  const d = DEFAULT_PROFILE, g = p?.goal?.metrics ?? {}, num = (v: unknown, f: number) => (finite(v) ? v : f);
  return {
    prioridades: Array.isArray(p?.priorities) ? p!.priorities.filter((x: unknown) => typeof x === "string") : d.priorities,
    diasMeta: Math.max(1, Math.min(7, Math.round(num(p?.daysTarget, d.daysTarget)))),
    meta: {
      horizonWeeks: Math.max(1, Math.round(num(p?.goal?.horizonWeeks, d.goal.horizonWeeks))), bracoCm: num(g.bracoCm, d.goal.metrics.bracoCm),
      cinturaCm: num(g.cinturaCm, d.goal.metrics.cinturaCm), pesoKg: num(g.pesoKg, d.goal.metrics.pesoKg), aderenciaPct: num(g.aderenciaPct, d.goal.metrics.aderenciaPct),
    },
    dieta: { kcal: num(p?.diet?.kcal, d.diet.kcal), protein: num(p?.diet?.protein, d.diet.protein) },
    cargasPreenchidas: Array.isArray(p?.remembered) && p!.remembered.length > 0,
  };
}
