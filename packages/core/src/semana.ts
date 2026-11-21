// Semana completa planejada (#24). A semana nasce inteira na segunda: dias habituais + meta, cada dia com o treino
// montado pelo orçamento de séries (planDay). Faltas, trocas e treinos extras só reorganizam o que ainda não passou.
// Regras: 2× por músculo antes de volume; 48 h entre estímulos do mesmo músculo; nunca compensar dobrado;
// compensatório só aparece quando a regra diz (e só vira treino a pedido). Funções puras e determinísticas.

import { EQUIPMENT_BY_ID, EXERCISE_BY_ID, INTENSITIES, MUSCLES, MUSCLE_IDS, SUB_MUSCLES } from "./catalog.ts";
import type { Group, MuscleId, SubMuscleId } from "./catalog.ts";
import { creditoSubpartes, volumeSubpartes } from "./semana-volume.ts";
import type { SubSets } from "./semana-volume.ts";
import { detectarDivisao, divisaoDaSemana, escolhaDaDivisao, inicioDoCiclo } from "./divisao.ts";
import type { Divisao, DivisaoSemana } from "./divisao.ts";
import type { TreinoAtual } from "./treino-atual.ts";
import { grupoDoExercicio, grupoDoMusculo, partePrincipal } from "./treino-atual.ts";
import { cardioCounts, cardioDoseFor, placeCardio } from "./cardio.ts";
import type { CardioDose, CardioEntry, CardioPlanned } from "./cardio.ts";
import { planDay, resumirDia } from "./plan-day.ts";
import type { DayInput, DayPlan, Mode, Pain } from "./plan-day.ts";
import { weekDates } from "./checkin.ts";
import { FREQ_PADRAO, TIPO_GRUPOS, enfaseDoDia, letraDe, musculosDoTipo, rotuloDia, tiposCurtos, tiposLongos } from "./semana-variacao.ts";
import type { AlternativasDe, TipoDia } from "./semana-variacao.ts";

export const DOWS = ["seg", "ter", "qua", "qui", "sex", "sab", "dom"] as const;
export type Dow = (typeof DOWS)[number];
export type Split = "sup" | "inf" | "full";
export type Format = "tradicional" | "superserie" | "circuito";
/** Geração escolhida para um dia ("trocar a geração"). `keep` = "deixar a semana fechar assim" (sem compensatório). */
export interface DayOpts {
  split?: Split | null; focus?: MuscleId[] | null; mode?: Mode; minutes?: number;
  gymId?: string | null; format?: Format; crowded?: boolean; keep?: boolean;
  /** "Gerar outro treino" (#44), só daquele dia: aparelhos ocupados, estilo, mais leve e o músculo a adiantar. */
  ocupados?: string[]; estilo?: "livre" | "maquina"; leve?: boolean; adiantar?: MuscleId;
}
/** Pedido do "Gerar outro treino": tudo opcional. `livres` = os aparelhos que estão livres (o resto fica ocupado). */
export interface Geracao { livres?: readonly string[] | null; estilo?: "livre" | "maquina" | null; leve?: boolean; adiantar?: MuscleId | null }
export type DayKind = "treino" | "folga" | "extra";
export interface DayOverride { kind: DayKind; opts?: DayOpts }
export type Attendance = "fui" | "nao_fui" | "folga";
export type DayStatus = "feito" | "extra" | "faltou" | "folga" | "pendente" | "hoje" | "livre" | "planejado";
export type Sets = Partial<Record<MuscleId, number>>;

export interface WeekProfile {
  daysUsual: readonly string[]; daysTarget: number; minutes: number; priorities: MuscleId[];
  dayGym: Partial<Record<string, string>>; gyms: { id: string; equipment: string[] }[];
  prefs?: DayInput["prefs"]; pinned?: DayInput["pinned"]; avoid?: string[]; pains?: Pain[];
  /** objetivo do perfil (id) e o ajuste de cardio que o dono fez: a dose do cardio vem daí (#44) */
  goalId?: string | null; cardio?: Partial<CardioDose> | null;
  /** #74 "Meu treino atual" (familiares fortes e fracos), iniciante e subparte alvo por músculo: só mudam a escolha do exercício */
  familiar?: string[]; familiarFraco?: string[]; iniciante?: boolean; subAlvo?: DayInput["subAlvo"];
  /** #125 formato padrão do perfil (dynamics): "superserie" = preferir pares na geração */
  formato?: Format | null;
  /** #90 estímulos por músculo na semana pedidos pelo método (1× bro split, 2× padrão, 3× nos focos) */
  frequencia?: number | null;
  /** #82 prioridades finas (subPriorities), o "Meu treino atual" (a divisão sai dele) e a escolha Manter/Ajustar como veio
   *  do perfil (entradaTreinoAtual); a escolha só vale para a divisão em que foi feita */
  subPrioridades?: SubMuscleId[];
  treinoAtual?: TreinoAtual | null;
  divisaoEscolha?: unknown;
}
/** O que já aconteceu na semana: séries registradas por dia e presença marcada. */
export interface WeekCtx {
  weekStart: string; today: string;
  sets: Record<string, Sets>;
  attendance: Record<string, Attendance>;
}
export interface WeekInput extends WeekCtx {
  profile: WeekProfile;
  targets: Record<MuscleId, number>;                                   // já com ajuste de volume / deload
  overrides?: Record<string, DayOverride>;                             // escolhas do usuário por data
  fixed?: Record<string, { plan: DayPlan; source: "claude" | "manual" }>; // treino salvo pelo Claude ou editado à mão
  cardioLog?: CardioEntry[];                                           // cardio registrado na semana (esporte conta): abate o planejado
  prev?: WeekPlan | null;                                              // versão anterior: dias que já passaram mantêm o plano
  /** #74 séries feitas por dia e exercício (data → id → nº de séries): acha a troca forçada e repõe a subparte que faltou */
  feitos?: Record<string, Record<string, number>>;
  /** #90 anti-repetição: exercícios repetidos demais nas últimas semanas (exerciciosCansados) */
  cansados?: string[];
  /** #90 alternativas do banco da #125 (altsDoBanco), injetadas por quem gera (Worker); sem elas, a mesma subparte do catálogo */
  alternativasDe?: AlternativasDe | null;
}
export interface WeekDay {
  date: string; dow: Dow; kind: DayKind; plan: DayPlan | null; gymId: string | null;
  opts: DayOpts; source: "auto" | "voce" | "claude"; warn: string[];
  /** cardio previsto para o dia pela dose do objetivo (só dias que ainda não passaram) */
  cardio?: CardioPlanned | null;
  /** #74 subparte que entrou neste dia para repor uma troca forçada de um dia anterior, com o porquê */
  repoe?: Reposicao[];
}
export interface WeekPlan { weekStart: string; targets: Record<MuscleId, number>; days: WeekDay[] }

export interface CompOffer {
  date: string; muscles: MuscleId[];
  /** dos músculos em falta, os que o compensatório alcança (ganham o 2º estímulo) */
  coveredWith: MuscleId[];
  /** séries do orçamento que ficam de fora: sem compensatório, com ele e só prioridades */
  outWithout: number; outWith: number; outExpress: number; why: string;
}
export interface WeekView extends WeekPlan {
  days: (WeekDay & { status: DayStatus })[];
  misses: string[]; projected: { done: Sets; freq: Sets }; closePct: number;
  offer: CompOffer | null; extraToday: DayPlan | null;
  /** #82 a divisão da pessoa: "Seguindo a sua divisão A/B/C/D" ou a sugestão Manter / Ajustar */
  divisao?: DivisaoSemana | null;
}

/** Bônus de prioridades com a semana fechada: no máximo +4 séries por músculo na semana (requisitos §6.1). */
export const BONUS_MAX = 4;
const GROUPS: Group[] = ["sup", "inf"];
const n = (v?: number) => v ?? 0;
const sum = (s?: Sets) => Object.values(s ?? {}).reduce((a: number, b) => a + n(b), 0);
const musclesOf = (s?: Sets | null) => MUSCLE_IDS.filter((m) => n(s?.[m]) > 0);
const groupMuscles = (gs: Iterable<Group>) => { const g = new Set(gs); return MUSCLE_IDS.filter((m) => g.has(MUSCLES[m].group)); };
const splitGroups = (s: Split): Group[] => (s === "full" ? GROUPS : [s]);
const nm = (ms: MuscleId[]) => ms.map((m) => MUSCLES[m].nm.toLowerCase()).join(", ");

/** Dias de treino da semana: os habituais; se a meta pedir mais, completa com o dia mais afastado dos escolhidos. */
export function trainingDows(daysUsual: readonly string[], target: number): Dow[] {
  const set = new Set(DOWS.filter((d) => daysUsual.includes(d)));
  const idx = (d: Dow) => DOWS.indexOf(d);
  while (set.size < Math.min(7, Math.max(0, Math.round(target)))) {
    let best: Dow | null = null, bestDist = -1;
    for (const d of DOWS) {
      if (set.has(d)) continue;
      const dist = set.size ? Math.min(...[...set].map((x) => { const k = Math.abs(idx(x) - idx(d)); return Math.min(k, 7 - k); })) : 7 - idx(d);
      if (dist > bestDist) { best = d; bestDist = dist; }
    }
    set.add(best!);
  }
  return DOWS.filter((d) => set.has(d));
}

/** #113 Treinou no dia: série registrada ou "treinei" marcado (vale em qualquer dia, dentro ou fora do cadastro). */
export const treinou = (ctx: Pick<WeekCtx, "sets" | "attendance">, date: string) => sum(ctx.sets[date]) > 0 || ctx.attendance[date] === "fui";

/** Dia "fechado": já passou, tem série registrada ou presença marcada. Só dias abertos são (re)gerados. */
export function isClosed(date: string, ctx: WeekCtx): boolean {
  return date < ctx.today || sum(ctx.sets[date]) > 0 || ctx.attendance[date] != null;
}

function gymFor(p: WeekProfile, dow: Dow, wanted?: string | null): string | null {
  const has = (id?: string | null) => !!id && p.gyms.some((g) => g.id === id);
  return has(wanted) ? wanted! : has(p.dayGym[dow]) ? p.dayGym[dow]! : p.gyms[0]?.id ?? null;
}

type Run = { done: Sets; freq: Sets; sub?: SubSets };
function dayInputFor(inp: WeekInput, d: WeekDay, run: Run): DayInput {
  const p = inp.profile;
  return {
    targets: inp.targets, done: { ...run.done }, freq: { ...run.freq }, priorities: p.priorities, daysLeft: 1,
    minutes: d.opts.minutes ?? p.minutes, lastGroup: null, mode: d.opts.mode ?? "normal", focus: d.opts.focus?.length ? d.opts.focus : null,
    equipment: (p.gyms.find((g) => g.id === d.gymId)?.equipment ?? []).filter((q) => !d.opts.ocupados?.includes(q)), crowded: !!d.opts.crowded,
    prefs: p.prefs, pinned: p.pinned, avoid: p.avoid, pains: p.pains,
    estilo: d.opts.estilo ?? null, leve: !!d.opts.leve, adiantar: d.opts.adiantar ?? null,
    familiar: p.familiar, familiarFraco: p.familiarFraco, iniciante: p.iniciante, subAlvo: p.subAlvo,
    subPrioridades: p.subPrioridades, subVolume: { ...(run.sub ?? {}) }, // #82
    formato: d.opts.format ?? p.formato ?? null, // #125
    freqAlvo: freqDe(p), cansados: inp.cansados, alternativasDe: inp.alternativasDe, // #90
  };
}

/** Volume real (séries registradas) + o planejado de dias marcados "fui" sem registro ("fui e esqueci de marcar"). */
function baseline(inp: WeekInput, days: WeekDay[]): Run {
  const done: Sets = {}, freq: Sets = {}, sub: SubSets = {};
  const add = (s?: Sets | null) => { for (const m of musclesOf(s)) { done[m] = n(done[m]) + n(s![m]); freq[m] = n(freq[m]) + 1; } };
  for (const d of days) {
    if (sum(inp.sets[d.date]) > 0) { add(inp.sets[d.date]); somarSub(sub, volumeSubpartes(inp.feitos?.[d.date])); }
    else if (inp.attendance[d.date] === "fui") { add(d.plan?.perMuscle); somarSub(sub, subDoPlano(d.plan)); }
  }
  return { done, freq, sub };
}
/** #82 Volume por subparte (crédito da #74) de um plano e a soma em um acumulado. */
const subDoPlano = (p: DayPlan | null | undefined): SubSets => volumeSubpartes(Object.fromEntries((p?.items ?? []).filter((i) => !i.prehab).map((i) => [i.exerciseId, i.sets])));
function somarSub(a: SubSets, b: SubSets) { for (const [s, v] of Object.entries(b) as [SubMuscleId, number][]) a[s] = n(a[s]) + v; }

/** Músculos que o dia anterior estimulou (registrado ou planejado). */
function prevMuscles(inp: WeekInput, days: WeekDay[], i: number): MuscleId[] {
  const d = days[i - 1];
  if (!d) return [];
  if (sum(inp.sets[d.date]) > 0) return musclesOf(inp.sets[d.date]);
  if (isClosed(d.date, inp) && inp.attendance[d.date] !== "fui") return [];
  return d.kind === "folga" ? [] : musclesOf(d.plan?.perMuscle);
}

/** #90 Exercícios de um dia anterior: os feitos (se registrados) ou os do plano. */
const feitosOuPlano = (inp: WeekInput, d: WeekDay) => {
  const f = Object.keys(inp.feitos?.[d.date] ?? {}).filter((id) => n(inp.feitos![d.date][id]) > 0);
  return f.length ? f : (d.plan?.items ?? []).map((it) => it.exerciseId);
};
/** #90 Estímulos por músculo pedidos pelo método do perfil: 1, 2 (padrão) ou 3 (nos focos). */
const freqDe = (p: WeekProfile) => (p.frequencia === 1 || p.frequencia === 3 ? p.frequencia : FREQ_PADRAO);
/** Tipo de um plano já feito ou salvo (os antigos, sem `tipo`, pelos grupos). */
const tipoDoPlano = (p: DayPlan | null | undefined): TipoDia | null => p ? p.tipo ?? (p.groups.length === 2 ? "full" : p.groups[0] ?? null) : null;

/** 1ª passada: o tipo de cada dia aberto (#90). Semana curta (≤ 3 treinos) tem desenho fixo pelo método (corpo inteiro A/B/C;
 *  com 1×, superior/inferior ou empurrar/puxar/pernas); com 4+ dias, escolhe o tipo com menos estímulos (depois o que tem
 *  prioridade, depois o maior déficit), sem repetir músculo de ontem: superior/inferior, ou empurrar/puxar/pernas com 6+ dias. */
function decideSplits(inp: WeekInput, days: WeekDay[], open: Set<string>) {
  const out = new Map<string, Group[]>();
  const split = new Map<string, Split | null>();
  const tipo = new Map<string, TipoDia>();
  const freq: Sets = { ...baseline(inp, days).freq };
  const training = days.filter((d) => d.kind === "treino");
  const f = freqDe(inp.profile);
  // #82 a divisão da pessoa (compatível, ou "Manter"): cada dia de treino é o próximo treino dela, na ordem
  const dv = divisaoSeguida(inp);
  const divDia = new Map<string, number>();
  const curtos = tiposCurtos(training.length, f);
  // a semana não muda de desenho no meio (falta, empurrar): os dias que já passaram dizem se é superior/inferior ou empurrar/puxar/pernas
  const passados = days.filter((d) => !open.has(d.date) && d.kind !== "folga").map((d) => tipoDoPlano(d.plan));
  const ppl: TipoDia[] = ["push", "pull", "legs"];
  const longos = passados.some((t) => t && ppl.includes(t)) ? ppl : passados.some((t) => t === "sup" || t === "inf") ? ["sup", "inf"] as TipoDia[] : tiposLongos(training.length, f);
  const prios = inp.profile.priorities;
  const alvo = (m: MuscleId) => n(inp.targets[m]) > 0;
  let prev: MuscleId[] = [];
  days.forEach((d, i) => {
    if (!open.has(d.date)) { prev = prevMuscles(inp, days, i + 1); return; }
    let gs: Group[] = [], sp: Split | null = null, t: TipoDia | null = null;
    const fx = inp.fixed?.[d.date];
    if (fx) gs = fx.plan.groups;
    else if (d.kind === "extra") gs = [];
    else if (d.opts.mode === "compensatorio" || d.opts.mode === "expresso") gs = GROUPS;
    else if (d.opts.focus?.length) gs = [...new Set(d.opts.focus.map((m) => MUSCLES[m].group))];
    else if (d.opts.split) t = d.opts.split;
    else if (dv) {
      const k = (dv.inicio + training.indexOf(d)) % dv.d.dias;
      divDia.set(d.date, k);
      const ms = dv.d.musculos[k];
      gs = GROUPS.filter((g) => ms.some((m) => MUSCLES[m].group === g));
      for (const m of ms) if (alvo(m)) freq[m] = n(freq[m]) + 1;
      out.set(d.date, gs); split.set(d.date, gs.length === 2 ? "full" : gs[0] ?? null);
      prev = ms;
      return;
    }
    else if (curtos) t = curtos[training.indexOf(d)] ?? "full";
    else {
      const need = (x: TipoDia) => {
        const ms = musculosDoTipo(x).filter(alvo);
        return { min: Math.min(...ms.map((m) => n(freq[m]))), prio: Math.min(99, ...ms.filter((m) => prios.includes(m)).map((m) => prios.indexOf(m))), tgt: ms.filter((m) => n(freq[m]) < f).reduce((a, m) => a + n(inp.targets[m]), 0) };
      };
      let cand = longos.filter((x) => !musculosDoTipo(x).some((m) => prev.includes(m)));
      if (!cand.length) cand = [...longos];
      cand.sort((a, b) => need(a).min - need(b).min || need(a).prio - need(b).prio || need(b).tgt - need(a).tgt);
      t = cand[0];
    }
    if (t) { gs = TIPO_GRUPOS[t]; sp = gs.length === 2 ? "full" : gs[0]; tipo.set(d.date, t); }
    const ms = t ? musculosDoTipo(t) : groupMuscles(gs);
    for (const m of ms) if (alvo(m)) freq[m] = n(freq[m]) + 1;
    out.set(d.date, gs); split.set(d.date, sp);
    prev = ms;
  });
  return { groups: out, split, tipo, divDia, divisao: dv?.d ?? null };
}

/** #82 Dias de treino da semana pelo perfil (referência da divisão, como em trainingDows). */
const diasDaSemana = (p: WeekProfile) => trainingDows(p.daysUsual, p.daysTarget).length;
/** #82 A divisão que a semana segue: compatível com os dias e a frequência do método, ou incompatível com "Manter". */
function divisaoSeguida(inp: WeekInput): { d: Divisao; inicio: number } | null {
  const p = inp.profile, d = detectarDivisao(p.treinoAtual);
  return d && divisaoInfo(p, d)?.seguindo ? { d, inicio: inicioDoCiclo(d, diasDaSemana(p), inp.weekStart) } : null;
}
const divisaoInfo = (p: WeekProfile, d = detectarDivisao(p.treinoAtual)): DivisaoSemana | null =>
  divisaoDaSemana(d, diasDaSemana(p), escolhaDaDivisao(d, p.divisaoEscolha), freqDe(p));

/** #90 3× nos focos: o foco que não chega à frequência do método entra (2 séries) num dia de outro tipo, sem dia vizinho dele (48 h). */
function extrasDosFocos(inp: WeekInput, days: WeekDay[], open: Set<string>, tipo: Map<string, TipoDia>, groups: Map<string, Group[]>) {
  const out = new Map<string, MuscleId[]>();
  const f = freqDe(inp.profile);
  if (f < 3) return out;
  const treina = (i: number, m: MuscleId) => {
    const d = days[i];
    if (!d) return false;
    const t = tipo.get(d.date);
    if (t) return musculosDoTipo(t).includes(m) || !!out.get(d.date)?.includes(m);
    if (open.has(d.date)) return groupMuscles(groups.get(d.date) ?? []).includes(m);
    return prevMuscles(inp, days, i + 1).includes(m);
  };
  for (const m of inp.profile.priorities) {
    let tem = days.filter((_, i) => treina(i, m)).length;
    days.forEach((d, i) => {
      if (tem >= f || !tipo.has(d.date) || inp.fixed?.[d.date] || treina(i, m) || treina(i - 1, m) || treina(i + 1, m)) return;
      out.set(d.date, [...(out.get(d.date) ?? []), m]); tem++;
    });
  }
  return out;
}

/** #98 Plano salvo à mão ou pelo Chat: o resumo (perMuscle, séries, minutos) sai dos itens, nunca do plano antigo. */
const fixedPlan = (inp: WeekInput, date: string): DayPlan | null => { const p = inp.fixed?.[date]?.plan; return p ? resumirDia(p) : null; };

/** Gera a semana: dias fechados mantêm o plano; os abertos são montados em ordem, cada um sabendo o que os anteriores fazem. */
export function planWeek(inp: WeekInput): WeekPlan {
  // 1ª abertura depois da segunda: os dias que já passaram recebem o plano "de segunda de manhã" (para ver e cobrar a falta)
  if (!inp.prev && inp.today > inp.weekStart) inp = { ...inp, prev: planWeek({ ...inp, today: inp.weekStart, sets: {}, attendance: {}, prev: null }) };
  // #113 os dias cadastrados são só referência para distribuir a semana, nunca bloqueio
  const base = new Set<string>(trainingDows(inp.profile.daysUsual, inp.profile.daysTarget));
  const days: WeekDay[] = weekDates(inp.weekStart).map((date, i) => {
    const dow = DOWS[i], ov = inp.overrides?.[date], fx = inp.fixed?.[date];
    // #108/#113 treino salvo (Chat/MCP/gerado/à mão) em qualquer dia vira dia de treino com esse plano; antes ficava folga e sumia
    let kind: DayKind = ov?.kind ?? (base.has(dow) || fx ? "treino" : "folga");
    // #113 treinou (série registrada ou "treinei") num dia fora do cadastro: é dia de treino feito, conta presença e volume
    if (kind === "folga" && treinou(inp, date)) kind = "treino";
    const opts: DayOpts = { ...(ov?.opts ?? {}) };
    return { date, dow, kind, plan: null, gymId: gymFor(inp.profile, dow, opts.gymId), opts, source: fx ? (fx.source === "claude" ? "claude" : "voce") : ov ? "voce" : "auto", warn: [] };
  });
  for (const d of days) if (isClosed(d.date, inp)) d.plan = fixedPlan(inp, d.date) ?? inp.prev?.days.find((x) => x.date === d.date)?.plan ?? null;
  // #113 "treinei" sem série registrada num dia sem plano: credita o treino extra que o dia teria (só o que faltava, sem dobrar)
  days.forEach((d, i) => {
    if (d.plan || inp.attendance[d.date] !== "fui" || sum(inp.sets[d.date]) > 0) return;
    d.plan = extraSession({ ...dayInputFor(inp, d, baseline(inp, days.slice(0, i))), blocked: prevMuscles(inp, days, i) });
  });

  const open = new Set(days.filter((d) => !isClosed(d.date, inp) && d.kind !== "folga").map((d) => d.date));
  const { groups, split, tipo, divDia, divisao } = decideSplits(inp, days, open);
  const extras = extrasDosFocos(inp, days, open, tipo, groups);
  const doDiv = (x: WeekDay) => { const k = divDia.get(x.date); return divisao && k != null ? divisao.musculos[k] : null; };
  const musculosDoDia = (x: WeekDay) => { const t = tipo.get(x.date); return t ? [...musculosDoTipo(t), ...(extras.get(x.date) ?? [])] : doDiv(x) ?? groupMuscles(groups.get(x.date) ?? []); };
  const run = baseline(inp, days);
  const openDays = days.filter((d) => open.has(d.date));
  const repor = reposicoes(inp, days, openDays, groups);
  openDays.forEach((d, k) => {
    const i = days.indexOf(d);
    const fx = inp.fixed?.[d.date];
    let plan: DayPlan;
    if (fx) plan = fixedPlan(inp, d.date)!;
    else if (d.kind === "extra") {
      const next = days[i + 1] && open.has(days[i + 1].date) ? groupMuscles(groups.get(days[i + 1].date) ?? []) : [];
      plan = extraSession({ ...dayInputFor(inp, d, run), blocked: [...new Set([...prevMuscles(inp, days, i), ...next])] });
    } else {
      const rest = openDays.slice(k).filter((x) => x.kind === "treino" && !inp.fixed?.[x.date]);
      const groupDaysLeft = Object.fromEntries(GROUPS.map((g) => [g, Math.max(1, rest.filter((x) => groups.get(x.date)?.includes(g)).length)]));
      const diasMusculo = Object.fromEntries(MUSCLE_IDS.map((m) => [m, Math.max(1, rest.filter((x) => musculosDoDia(x).includes(m)).length)]));
      const rp = repor.get(d.date);
      // #90 variação: a letra é a ordem do dia entre os do mesmo tipo; varia dos exercícios dos anteriores (feitos, salvos ou gerados)
      const t = tipo.get(d.date);
      // (dia que passou sem treino não conta: a semana se reorganiza a partir do que foi feito)
      const antes = t ? days.slice(0, i).filter((x) => x.plan && (open.has(x.date) || treinou(inp, x.date)) && (tipo.get(x.date) ?? tipoDoPlano(x.plan)) === t) : [];
      const dm = doDiv(d);
      plan = planDay({ ...dayInputFor(inp, d, run), daysLeft: Math.max(1, rest.length), split: split.get(d.date) ?? null, groupDaysLeft, diasMusculo,
        ...(dm ? { musculos: dm } : {}),
        ...(t ? { tipo: t, letra: letraDe(antes.length), enfase: enfaseDoDia(t, antes.length, inp.profile.priorities), musculos: musculosDoTipo(t),
          extras: extras.get(d.date) ?? [], variarDe: [...new Set(antes.flatMap((x) => feitosOuPlano(inp, x)))] } : {}),
        ...(rp ? { repor: Object.fromEntries(rp.map((x) => [x.m, { sub: x.troca.parte, sets: x.sets }])) } : {}) });
      // #82 o nome do dia é texto do sistema pela letra da divisão ("Treino A · ombros e tríceps"); o nome digitado pela
      // pessoa nunca entra no plano (sairia sem marcação de dado do usuário no MCP)
      if (dm && divisao) { const k = divDia.get(d.date)!; plan = { ...plan, name: rotuloDia(`Treino ${letraDe(k)}`, plan.perMuscle),
        why: [`Seguindo a sua divisão ${divisao.letras}: hoje é o treino ${letraDe(k)}. O app só ajusta volume e exercícios.`, ...plan.why.slice(1)] }; }
      if (rp) {
        const feitas = rp.filter((x) => plan.items.some((i) => partePrincipal(EXERCISE_BY_ID[i.exerciseId] ?? {}) === x.troca.parte));
        if (feitas.length) {
          d.repoe = feitas.map((x) => ({ parte: x.troca.parte, troca: x.troca, texto: motivoReposicao(x.troca, d.date) }));
          plan = { ...plan, why: [...d.repoe.map((r) => r.texto), ...plan.why] };
        }
      }
    }
    d.plan = plan;
    for (const m of musclesOf(plan.perMuscle)) { run.done[m] = n(run.done[m]) + n(plan.perMuscle[m]); run.freq[m] = n(run.freq[m]) + 1; }
    somarSub(run.sub ??= {}, subDoPlano(plan));
    const clash = prevMuscles(inp, days, i).filter((m) => n(plan.perMuscle[m]) > 0);
    if (clash.length) d.warn.push(`Menos de 48 h para ${nm(clash)}: treinou na véspera.`);
  });
  planCardioWeek(inp, days);
  return { weekStart: inp.weekStart, targets: inp.targets, days };
}

// ---------- #74 troca forçada: credita pelo exercício feito e repõe a subparte que faltou ----------
export interface Troca {
  date: string; planejado: string; feito: string;
  /** subparte principal do planejado que o feito não trabalha (ex.: ombro_post) */
  parte: SubMuscleId;
  /** séries planejadas que ficaram sem crédito nessa subparte */
  falta: number;
}
export interface Reposicao { parte: SubMuscleId; troca: Troca; texto: string }

/** Trocas do dia: exercício planejado não feito + exercício feito fora do plano no mesmo grupo grande (ombro, peito…),
 *  quando o feito não tem a mesma subparte principal. O crédito vem das subpartes reais do feito (eficiência). */
export function trocasDoDia(plan: DayPlan | null | undefined, feitos: Record<string, number> | undefined, date: string): Troca[] {
  if (!plan?.items?.length || !feitos) return [];
  const planejados = plan.items.filter((i) => !i.prehab);
  const ids = new Set(planejados.map((i) => i.exerciseId));
  const extras = Object.keys(feitos).filter((id) => n(feitos[id]) > 0 && !ids.has(id) && EXERCISE_BY_ID[id]);
  const usados = new Set<string>(), out: Troca[] = [];
  for (const p of planejados) {
    if (n(feitos[p.exerciseId]) > 0) continue;
    const pe = EXERCISE_BY_ID[p.exerciseId], parte = pe ? partePrincipal(pe) : null;
    if (!pe || !parte) continue;
    const g = grupoDoMusculo(p.muscle);
    const feito = extras.find((id) => !usados.has(id) && grupoDoExercicio(EXERCISE_BY_ID[id]) === g);
    if (!feito) continue; // pulou sem trocar: o orçamento da semana já cobra
    usados.add(feito);
    if (partePrincipal(EXERCISE_BY_ID[feito]) === parte) continue; // trocou na mesma parte: nada falta
    const falta = Math.ceil(p.sets - n(creditoSubpartes(feito, n(feitos[feito]))[parte]));
    if (falta > 0) out.push({ date, planejado: p.exerciseId, feito, parte, falta });
  }
  return out;
}

const DIA_NM: Record<Dow, string> = { seg: "na segunda", ter: "na terça", qua: "na quarta", qui: "na quinta", sex: "na sexta", sab: "no sábado", dom: "no domingo" };
const dowOf = (iso: string): Dow => DOWS[(new Date(iso + "T12:00:00Z").getUTCDay() + 6) % 7];
const exNm = (id: string) => { const x = EXERCISE_BY_ID[id]?.nm ?? id; return x.charAt(0).toLowerCase() + x.slice(1); };
/** O porquê, em uma frase (Semana, Treino e, depois, o Hoje): "Ombro posterior entrou na quinta: na terça você trocou … por …". */
export function motivoReposicao(t: Troca, diaRepoe: string): string {
  const quando = DIA_NM[dowOf(diaRepoe)], antes = DIA_NM[dowOf(t.date)];
  return `${SUB_MUSCLES[t.parte].nm} entrou ${quando}: ${antes} você trocou ${exNm(t.planejado)} por ${exNm(t.feito)}.`;
}

/** Em que dia aberto cada troca é reposta: o 1º dia de treino depois dela que já treina o grupo do músculo (sem dia fixado à mão). */
function reposicoes(inp: WeekInput, days: WeekDay[], openDays: WeekDay[], groups: Map<string, Group[]>) {
  const out = new Map<string, { m: MuscleId; sets: number; troca: Troca }[]>();
  if (!inp.feitos) return out;
  const trocas = days.filter((d) => isClosed(d.date, inp)).flatMap((d) => trocasDoDia(d.plan, inp.feitos?.[d.date], d.date));
  for (const t of trocas) {
    const m = SUB_MUSCLES[t.parte].muscle, g = MUSCLES[m].group;
    const dia = openDays.find((d) => d.date > t.date && d.kind === "treino" && !inp.fixed?.[d.date] && (groups.get(d.date) ?? []).includes(g));
    if (!dia) continue;
    const lista = out.get(dia.date) ?? [];
    const ja = lista.find((x) => x.m === m);
    if (ja) ja.sets += t.falta; else lista.push({ m, sets: t.falta, troca: t });
    out.set(dia.date, lista);
  }
  return out;
}

/** Cardio da semana (#44): a dose vem do objetivo do perfil; o que já foi registrado (futsal conta) abate;
 *  o resto cai em dia que ainda não passou, fora do dia de perna, de preferência na folga. */
function planCardioWeek(inp: WeekInput, days: WeekDay[]) {
  const dose = cardioDoseFor(inp.profile.goalId, inp.profile.cardio);
  const dates = days.map((d) => d.date);
  const feitas = (inp.cardioLog ?? []).filter((e) => dates.includes(e.date) && cardioCounts(e)).length;
  const falta = Math.max(0, dose.sessions - feitas);
  const cand = days.map((d, idx) => ({ d, idx })).filter(({ d }) => !isClosed(d.date, inp) && d.kind !== "extra" && !(d.kind === "treino" && d.plan?.groups.includes("inf")))
    .map(({ d, idx }) => ({ date: d.date, idx, folga: d.kind === "folga" }));
  const onde = new Set(placeCardio(cand, falta));
  for (const d of days) {
    d.cardio = onde.has(d.date) ? {
      type: dose.type, minutes: dose.minutes, intensity: dose.intensity,
      why: `Cardio ${dose.sessions}× por semana${feitas ? ` (${feitas} já feito${feitas > 1 ? "s" : ""})` : ""}, ${INTENSITIES[dose.intensity].nm.toLowerCase()}: ajuda a cintura sem pesar na recuperação do treino de força.`,
    } : null;
  }
}

/** "Ontem era Superior B. Não deu?" → resposta grava a presença e reorganiza o resto da semana. */
export function replanAfterMiss(inp: WeekInput, date: string, answer: Attendance): WeekPlan {
  return planWeek({ ...inp, attendance: { ...inp.attendance, [date]: answer } });
}

export function dayStatus(d: WeekDay, ctx: WeekCtx): DayStatus {
  const att = ctx.attendance[d.date];
  if (sum(ctx.sets[d.date]) > 0 || att === "fui") return d.kind === "treino" ? "feito" : "extra";
  if (att === "nao_fui") return "faltou";
  if (att === "folga") return "folga";
  if (d.date < ctx.today) return d.kind === "treino" ? "pendente" : "folga";
  if (d.kind === "folga") return d.date === ctx.today ? "livre" : "folga";
  return d.date === ctx.today ? "hoje" : "planejado";
}

export interface ExtraInput extends Omit<DayInput, "daysLeft" | "lastGroup" | "mode" | "focus"> {
  /** músculos com estímulo há < 48 h (véspera) ou planejados para o dia seguinte */
  blocked: MuscleId[];
}
/** Treino num dia não planejado: monta pelo que falta no orçamento sem passar dele (nunca dobra) e sem tocar em
 *  músculo em recuperação. Semana fechada → bônus curto só das prioridades (máx. +4 séries por músculo na semana). */
export function extraSession(inp: ExtraInput): DayPlan {
  const blocked = new Set(inp.blocked);
  const deficit = (m: MuscleId) => Math.max(0, n(inp.targets[m]) - n(inp.done[m]));
  const base = { ...inp, daysLeft: 1, lastGroup: null, mode: "normal" as Mode, focus: null, exclude: [...blocked] };
  const gs = GROUPS.filter((g) => groupMuscles([g]).some((m) => !blocked.has(m) && deficit(m) > 0));
  const rest = blocked.size ? `Fora por recuperação (48 h): ${nm([...blocked])}.` : null;
  if (gs.length) {
    const p = planDay({ ...base, split: gs.length === 2 ? "full" : gs[0], maxPerMuscle: Object.fromEntries(MUSCLE_IDS.map((m) => [m, deficit(m)])) });
    if (p.items.length) return { ...p, name: `Extra · ${p.name}`, suggestCompensatory: false, why: ["Treino extra: só o que ainda falta no orçamento da semana, sem passar dele.", ...(rest ? [rest] : []), ...p.why.slice(1)] };
  }
  const left = (m: MuscleId) => Math.max(0, BONUS_MAX - Math.max(0, n(inp.done[m]) - n(inp.targets[m])));
  const pr = inp.priorities.filter((m) => !blocked.has(m) && left(m) > 0);
  if (!pr.length) {
    const p = planDay({ ...base, split: "full", maxPerMuscle: Object.fromEntries(MUSCLE_IDS.map((m) => [m, 0])) });
    return { ...p, name: "Extra · descanso", suggestCompensatory: false, why: ["Nada que valha hoje: o que falta está em recuperação ou a semana já fechou com bônus. Descanso também é treino.", ...(rest ? [rest] : [])] };
  }
  const tg = Object.fromEntries(MUSCLE_IDS.map((m) => [m, pr.includes(m) ? n(inp.done[m]) + Math.min(3, left(m)) : 0])) as Record<MuscleId, number>;
  const pg = [...new Set(pr.map((m) => MUSCLES[m].group))];
  const p = planDay({ ...base, targets: tg, freq: Object.fromEntries(MUSCLE_IDS.map((m) => [m, 2])), minutes: Math.min(inp.minutes, 30),
    split: pg.length === 2 ? "full" : pg[0], maxPerMuscle: Object.fromEntries(MUSCLE_IDS.map((m) => [m, pr.includes(m) ? Math.min(3, left(m)) : 0])) });
  return { ...p, name: "Extra · bônus de prioridades", suggestCompensatory: false,
    why: [`Semana fechada: bônus curto de ${nm(pr)} (até +${BONUS_MAX} séries por músculo na semana).`, ...(rest ? [rest] : [])] };
}

/** Oferta do compensatório: só quando sobra 1 treino na semana e algum músculo fica com < 2 estímulos sem dia que o cubra. */
export function compensatoryOffer(inp: WeekInput, plan: WeekPlan): CompOffer | null {
  const open = plan.days.filter((d) => !isClosed(d.date, inp) && d.kind !== "folga");
  if (open.length !== 1) return null;
  const last = open[0];
  if (!last.plan || last.opts.keep || inp.fixed?.[last.date] || (last.opts.mode && last.opts.mode !== "normal") || last.kind === "extra") return null;
  const run = baseline(inp, plan.days);
  const muscles = MUSCLE_IDS.filter((m) => n(inp.targets[m]) > 0 && n(run.freq[m]) < 2 && !n(last.plan!.perMuscle[m]));
  if (!muscles.length) return null;
  const out = (pm: Sets) => MUSCLE_IDS.reduce((a, m) => a + Math.max(0, n(inp.targets[m]) - n(run.done[m]) - n(pm[m])), 0);
  const di = { ...dayInputFor(inp, last, run), daysLeft: 1 };
  const comp = planDay({ ...di, mode: "compensatorio" }).perMuscle;
  return {
    date: last.date, muscles, coveredWith: muscles.filter((m) => n(comp[m]) > 0),
    outWithout: out(last.plan.perMuscle), outWith: out(comp), outExpress: out(planDay({ ...di, mode: "expresso" }).perMuscle),
    why: `Sobrou só 1 treino e ${nm(muscles)} ficaria${muscles.length > 1 ? "m" : ""} com menos de 2 estímulos, sem outro dia que cubra. O compensatório junta os dois grupos numa sessão. Se preferir, a semana fecha assim e a próxima não dobra.`,
  };
}

/** Semana pronta para mostrar: status de cada dia, faltas sem resposta, projeção, compensatório e extra de hoje. */
export function weekView(inp: WeekInput, plan: WeekPlan): WeekView {
  const days = plan.days.map((d) => ({ ...d, status: dayStatus(d, inp) }));
  planCardioWeek(inp, days); // o cardio registrado depois de gerar a semana (futsal) abate sem precisar regerar
  const run = baseline(inp, plan.days);
  for (const d of plan.days) if (!isClosed(d.date, inp) && d.kind !== "folga" && d.plan)
    for (const m of musclesOf(d.plan.perMuscle)) { run.done[m] = n(run.done[m]) + n(d.plan.perMuscle[m]); run.freq[m] = n(run.freq[m]) + 1; }
  let tgt = 0, proj = 0;
  for (const m of MUSCLE_IDS) { tgt += n(inp.targets[m]); proj += Math.min(n(inp.targets[m]), n(run.done[m])); }
  const ti = days.findIndex((d) => d.date === inp.today);
  let extraToday: DayPlan | null = null;
  if (ti >= 0 && days[ti].status === "livre") {
    const next = days[ti + 1] && !isClosed(days[ti + 1].date, inp) && days[ti + 1].kind !== "folga" ? groupMuscles(days[ti + 1].plan?.groups ?? []) : [];
    extraToday = extraSession({ ...dayInputFor(inp, days[ti], baseline(inp, plan.days)), blocked: [...new Set([...prevMuscles(inp, plan.days, ti), ...next])] });
  }
  return {
    ...plan, days, misses: days.filter((d) => d.status === "pendente").map((d) => d.date),
    projected: run, closePct: tgt ? Math.round((proj / tgt) * 100) : 0,
    offer: compensatoryOffer(inp, plan), extraToday,
    divisao: divisaoInfo(inp.profile),
  };
}

// ---------- ações do usuário num dia (viram overrides) ----------
export type DayAction =
  | { type: "gerar"; date: string; opts: DayOpts }
  | { type: "outro"; date: string; geracao: { ocupados?: string[]; estilo?: "livre" | "maquina" | null; leve?: boolean; adiantar?: MuscleId | null } }
  | { type: "mover"; date: string; to: string }
  | { type: "trocar"; date: string; to: string }
  | { type: "folga" | "treino" | "extra" | "manter"; date: string };

/** Aplica uma ação sobre as escolhas da semana. Dia que já passou (ou já tem treino registrado) não muda. */
export function applyDayAction(plan: WeekPlan, overrides: Record<string, DayOverride>, a: DayAction, ctx: WeekCtx): { overrides: Record<string, DayOverride> } | { error: string } {
  const day = (date: string) => plan.days.find((d) => d.date === date);
  const d = day(a.date);
  if (!d) return { error: "dia fora da semana" };
  if (isClosed(d.date, ctx)) return { error: "esse dia já passou ou já tem treino registrado" };
  const o = { ...overrides };
  const cur = (x: WeekDay): DayOverride => ({ kind: x.kind, opts: { ...x.opts } });
  switch (a.type) {
    case "gerar": o[d.date] = { kind: d.kind === "folga" ? "treino" : d.kind, opts: { ...a.opts } }; break;
    case "outro": {
      // mantém divisão, foco, duração e academia do dia; troca só as 4 escolhas do "gerar outro" (vazio = limpa)
      const { ocupados: _o, estilo: _e, leve: _l, adiantar: _a, ...resto } = d.opts, g = a.geracao;
      const opts: DayOpts = { ...resto };
      if (g.ocupados?.length) opts.ocupados = [...g.ocupados];
      if (g.estilo) opts.estilo = g.estilo;
      if (g.leve) opts.leve = true;
      if (g.adiantar) opts.adiantar = g.adiantar;
      o[d.date] = { kind: d.kind === "folga" ? "treino" : d.kind, opts }; break;
    }
    case "folga": o[d.date] = { kind: "folga" }; break;
    case "treino": o[d.date] = { kind: "treino", opts: {} }; break;
    case "extra":
      if (d.kind !== "folga") return { error: "esse dia já tem treino planejado" };
      o[d.date] = { kind: "extra" }; break;
    case "manter": o[d.date] = { ...cur(d), opts: { ...d.opts, keep: true, mode: "normal" } }; break;
    case "mover": case "trocar": {
      const t = day(a.to);
      if (!t || t.date === d.date) return { error: "escolha outro dia da semana" };
      if (isClosed(t.date, ctx)) return { error: "o dia de destino já passou" };
      if (a.type === "mover") {
        if (d.kind === "folga") return { error: "não há treino nesse dia para mover" };
        if (t.kind !== "folga") return { error: "o dia de destino já tem treino; use trocar" };
        o[t.date] = cur(d); o[d.date] = { kind: "folga" };
      } else { o[t.date] = cur(d); o[d.date] = cur(t); }
      break;
    }
  }
  return { overrides: o };
}

// ---------- diff entre duas versões ----------
export interface DayDiff { date: string; before: string; after: string; lines: string[] }
const label = (d?: WeekDay) => (!d || d.kind === "folga" || !d.plan ? "folga" : `${d.plan.name} · ${d.plan.setsTotal} séries`);
/** O que muda de uma versão para outra (só os dias com diferença). */
export function diffWeeks(a: WeekPlan, b: WeekPlan): DayDiff[] {
  const out: DayDiff[] = [];
  for (const db of b.days) {
    const da = a.days.find((x) => x.date === db.date);
    const ia = new Map((da?.kind !== "folga" ? da?.plan?.items ?? [] : []).map((i) => [i.exerciseId, i]));
    const ib = new Map((db.kind !== "folga" ? db.plan?.items ?? [] : []).map((i) => [i.exerciseId, i]));
    const lines: string[] = [];
    for (const [id, i] of ia) if (!ib.has(id)) lines.push(`− ${i.nm} (${i.sets})`);
    for (const [id, i] of ib) { const x = ia.get(id); if (!x) lines.push(`+ ${i.nm} (${i.sets})`); else if (x.sets !== i.sets) lines.push(`${i.nm}: ${x.sets} → ${i.sets} séries`); }
    const before = label(da), after = label(db);
    if (lines.length || before !== after) out.push({ date: db.date, before, after, lines });
  }
  return out;
}

// ---------- #113 empurrar treino ----------
export interface Empurrao {
  /** escolhas novas da semana (dias de hoje em diante) */
  overrides: Record<string, DayOverride>;
  /** treinos salvos (Chat, gerado, à mão) já nas datas novas */
  fixed: NonNullable<WeekInput["fixed"]>;
  /** treinos que andam um dia: de → para; para null = passou do domingo e volta para o orçamento */
  moves: { de: string; para: string | null; nome: string }[];
  /** treinos salvos que mudam de data (o servidor move a linha do dia); para null = sai da semana */
  fixos: { de: string; para: string | null }[];
  plan: WeekPlan; diff: DayDiff[];
}
/** "Hoje não dá": os dias de hoje em diante que ainda não fecharam andam um dia (o 1º vira folga). Dia feito ou
 *  marcado não se move. O treino que passa do domingo sai da semana e o orçamento se redistribui nos dias que ficam. */
export function empurrarTreinos(inp: WeekInput, plan: WeekPlan): Empurrao | { error: string } {
  const abertos = plan.days.filter((d) => d.date >= inp.today && !isClosed(d.date, inp));
  if (!abertos.some((d) => d.kind !== "folga")) return { error: "não há treino de hoje em diante para empurrar" };
  const overrides = { ...(inp.overrides ?? {}) }, fixed = { ...(inp.fixed ?? {}) };
  const moves: Empurrao["moves"] = [], fixos: Empurrao["fixos"] = [];
  for (let k = abertos.length - 1; k >= 0; k--) {
    const d = abertos[k], para = abertos[k + 1]?.date ?? null;
    if (para) overrides[para] = { kind: d.kind, opts: { ...d.opts } };
    // de trás para a frente: o salvo do dia seguinte já andou, então a data de destino está livre
    if (fixed[d.date]) { fixos.unshift({ de: d.date, para }); if (para) fixed[para] = fixed[d.date]; delete fixed[d.date]; }
    if (d.kind !== "folga") moves.unshift({ de: d.date, para, nome: d.plan?.name ?? "Treino" });
  }
  overrides[abertos[0].date] = { kind: "folga" };
  const novo = planWeek({ ...inp, overrides, fixed, prev: plan });
  return { overrides, fixed, moves, fixos, plan: novo, diff: diffWeeks(plan, novo) };
}

// ---------- gerar outro treino (#44) ----------
/** Gera de novo UM dia (aparelhos livres, estilo, mais leve, adiantar) e reorganiza o resto pelo orçamento de séries.
 *  Devolve a semana nova e as escolhas (= a versão nova); desfazer é voltar às escolhas anteriores. */
export function regenerarDia(plan: WeekPlan, inp: WeekInput, date: string, g: Geracao): { overrides: Record<string, DayOverride>; plan: WeekPlan } | { error: string } {
  const d = plan.days.find((x) => x.date === date);
  if (!d) return { error: "dia fora da semana" };
  let ocupados: string[] = [];
  if (g.livres) {
    if (!g.livres.every((q) => EQUIPMENT_BY_ID[q])) return { error: "livres: aparelho desconhecido" };
    ocupados = (inp.profile.gyms.find((x) => x.id === d.gymId)?.equipment ?? []).filter((q) => !g.livres!.includes(q));
  }
  const r = applyDayAction(plan, inp.overrides ?? {}, { type: "outro", date, geracao: { ocupados, estilo: g.estilo, leve: g.leve, adiantar: g.adiantar } }, inp);
  if ("error" in r) return r;
  return { overrides: r.overrides, plan: planWeek({ ...inp, overrides: r.overrides, prev: plan }) };
}

/** Músculo "mais atrás" na semana para adiantar hoje: dos que estão no treino de hoje, o de maior falta no orçamento
 *  (depois do que a semana já planeja); empate → o das prioridades. Sem falta nenhuma → null. */
export function sugerirAdiantar(view: Pick<WeekView, "targets" | "projected">, hoje: DayPlan, priorities: readonly MuscleId[]): MuscleId | null {
  const falta = (m: MuscleId) => n(view.targets[m]) - n(view.projected.done[m]);
  const doDia = MUSCLE_IDS.filter((m) => n(hoje.perMuscle[m]) > 0 && falta(m) > 0);
  const rank = (m: MuscleId) => (priorities.includes(m) ? priorities.indexOf(m) : 99);
  return doDia.sort((a, b) => falta(b) - falta(a) || rank(a) - rank(b))[0] ?? null;
}
