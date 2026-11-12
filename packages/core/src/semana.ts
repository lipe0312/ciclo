// Semana completa planejada (#24). A semana nasce inteira na segunda: dias habituais + meta, cada dia com o treino
// montado pelo orçamento de séries (planDay). Faltas, trocas e treinos extras só reorganizam o que ainda não passou.
// Regras: 2× por músculo antes de volume; 48 h entre estímulos do mesmo músculo; nunca compensar dobrado;
// compensatório só aparece quando a regra diz (e só vira treino a pedido). Funções puras e determinísticas.

import { EQUIPMENT_BY_ID, INTENSITIES, MUSCLES, MUSCLE_IDS } from "./catalog.ts";
import type { Group, MuscleId } from "./catalog.ts";
import { cardioCounts, cardioDoseFor, placeCardio } from "./cardio.ts";
import type { CardioDose, CardioEntry, CardioPlanned } from "./cardio.ts";
import { planDay } from "./plan-day.ts";
import type { DayInput, DayPlan, Mode, Pain } from "./plan-day.ts";
import { weekDates } from "./checkin.ts";

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
}
export interface WeekDay {
  date: string; dow: Dow; kind: DayKind; plan: DayPlan | null; gymId: string | null;
  opts: DayOpts; source: "auto" | "voce" | "claude"; warn: string[];
  /** cardio previsto para o dia pela dose do objetivo (só dias que ainda não passaram) */
  cardio?: CardioPlanned | null;
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

/** Dia "fechado": já passou, tem série registrada ou presença marcada. Só dias abertos são (re)gerados. */
export function isClosed(date: string, ctx: WeekCtx): boolean {
  return date < ctx.today || sum(ctx.sets[date]) > 0 || ctx.attendance[date] != null;
}

function gymFor(p: WeekProfile, dow: Dow, wanted?: string | null): string | null {
  const has = (id?: string | null) => !!id && p.gyms.some((g) => g.id === id);
  return has(wanted) ? wanted! : has(p.dayGym[dow]) ? p.dayGym[dow]! : p.gyms[0]?.id ?? null;
}

function dayInputFor(inp: WeekInput, d: WeekDay, run: { done: Sets; freq: Sets }): DayInput {
  const p = inp.profile;
  return {
    targets: inp.targets, done: { ...run.done }, freq: { ...run.freq }, priorities: p.priorities, daysLeft: 1,
    minutes: d.opts.minutes ?? p.minutes, lastGroup: null, mode: d.opts.mode ?? "normal", focus: d.opts.focus?.length ? d.opts.focus : null,
    equipment: (p.gyms.find((g) => g.id === d.gymId)?.equipment ?? []).filter((q) => !d.opts.ocupados?.includes(q)), crowded: !!d.opts.crowded,
    prefs: p.prefs, pinned: p.pinned, avoid: p.avoid, pains: p.pains,
    estilo: d.opts.estilo ?? null, leve: !!d.opts.leve, adiantar: d.opts.adiantar ?? null,
  };
}

/** Volume real (séries registradas) + o planejado de dias marcados "fui" sem registro ("fui e esqueci de marcar"). */
function baseline(inp: WeekInput, days: WeekDay[]) {
  const done: Sets = {}, freq: Sets = {};
  const add = (s?: Sets | null) => { for (const m of musclesOf(s)) { done[m] = n(done[m]) + n(s![m]); freq[m] = n(freq[m]) + 1; } };
  for (const d of days) {
    if (sum(inp.sets[d.date]) > 0) add(inp.sets[d.date]);
    else if (inp.attendance[d.date] === "fui") add(d.plan?.perMuscle);
  }
  return { done, freq };
}

/** Músculos que o dia anterior estimulou (registrado ou planejado). */
function prevMuscles(inp: WeekInput, days: WeekDay[], i: number): MuscleId[] {
  const d = days[i - 1];
  if (!d) return [];
  if (sum(inp.sets[d.date]) > 0) return musclesOf(inp.sets[d.date]);
  if (isClosed(d.date, inp) && inp.attendance[d.date] !== "fui") return [];
  return d.kind === "folga" ? [] : musclesOf(d.plan?.perMuscle);
}

/** 1ª passada: a divisão de cada dia aberto. Semana curta (≤ 3 treinos) tem desenho fixo para dar 2× a todo músculo;
 *  com 4+ dias, escolhe o grupo com menos estímulos (depois o maior déficit, depois o das prioridades), sem repetir o de ontem. */
function decideSplits(inp: WeekInput, days: WeekDay[], open: Set<string>) {
  const out = new Map<string, Group[]>();
  const split = new Map<string, Split | null>();
  const freq: Sets = { ...baseline(inp, days).freq };
  const training = days.filter((d) => d.kind === "treino");
  const short: Split[] | null = training.length <= 2 ? ["full", "full"] : training.length === 3 ? ["sup", "inf", "full"] : null;
  const prio0 = inp.profile.priorities[0];
  let prev: Group[] = [];
  days.forEach((d, i) => {
    if (!open.has(d.date)) {
      prev = [...new Set(prevMuscles(inp, days, i + 1).map((m) => MUSCLES[m].group))];
      return;
    }
    let gs: Group[] = [], sp: Split | null = null;
    const fx = inp.fixed?.[d.date];
    if (fx) gs = fx.plan.groups;
    else if (d.kind === "extra") gs = [];
    else if (d.opts.mode === "compensatorio" || d.opts.mode === "expresso") gs = GROUPS;
    else if (d.opts.focus?.length) gs = [...new Set(d.opts.focus.map((m) => MUSCLES[m].group))];
    else if (d.opts.split) { sp = d.opts.split; gs = splitGroups(sp); }
    else if (short) { sp = short[training.indexOf(d)] ?? "full"; gs = splitGroups(sp); }
    else {
      const need = (g: Group) => {
        const ms = groupMuscles([g]).filter((m) => n(inp.targets[m]) > 0);
        return { min: Math.min(...ms.map((m) => n(freq[m]))), tgt: ms.filter((m) => n(freq[m]) < 2).reduce((a, m) => a + n(inp.targets[m]), 0) };
      };
      let cand = GROUPS.filter((g) => !prev.includes(g));
      if (!cand.length) cand = [...GROUPS];
      cand.sort((a, b) => need(a).min - need(b).min || need(b).tgt - need(a).tgt || (MUSCLES[prio0]?.group === b ? 1 : 0) - (MUSCLES[prio0]?.group === a ? 1 : 0));
      sp = cand[0]; gs = [sp];
    }
    for (const m of groupMuscles(gs)) if (n(inp.targets[m]) > 0) freq[m] = n(freq[m]) + 1;
    out.set(d.date, gs); split.set(d.date, sp);
    prev = gs;
  });
  return { groups: out, split };
}

/** Gera a semana: dias fechados mantêm o plano; os abertos são montados em ordem, cada um sabendo o que os anteriores fazem. */
export function planWeek(inp: WeekInput): WeekPlan {
  // 1ª abertura depois da segunda: os dias que já passaram recebem o plano "de segunda de manhã" (para ver e cobrar a falta)
  if (!inp.prev && inp.today > inp.weekStart) inp = { ...inp, prev: planWeek({ ...inp, today: inp.weekStart, sets: {}, attendance: {}, prev: null }) };
  const base = new Set<string>(trainingDows(inp.profile.daysUsual, inp.profile.daysTarget));
  const days: WeekDay[] = weekDates(inp.weekStart).map((date, i) => {
    const dow = DOWS[i], ov = inp.overrides?.[date], fx = inp.fixed?.[date];
    const kind: DayKind = ov?.kind ?? (base.has(dow) ? "treino" : "folga");
    const opts: DayOpts = { ...(ov?.opts ?? {}) };
    return { date, dow, kind, plan: null, gymId: gymFor(inp.profile, dow, opts.gymId), opts, source: fx ? (fx.source === "claude" ? "claude" : "voce") : ov ? "voce" : "auto", warn: [] };
  });
  for (const d of days) if (isClosed(d.date, inp)) d.plan = inp.fixed?.[d.date]?.plan ?? inp.prev?.days.find((x) => x.date === d.date)?.plan ?? null;

  const open = new Set(days.filter((d) => !isClosed(d.date, inp) && d.kind !== "folga").map((d) => d.date));
  const { groups, split } = decideSplits(inp, days, open);
  const run = baseline(inp, days);
  const openDays = days.filter((d) => open.has(d.date));
  openDays.forEach((d, k) => {
    const i = days.indexOf(d);
    const fx = inp.fixed?.[d.date];
    let plan: DayPlan;
    if (fx) plan = fx.plan;
    else if (d.kind === "extra") {
      const next = days[i + 1] && open.has(days[i + 1].date) ? groupMuscles(groups.get(days[i + 1].date) ?? []) : [];
      plan = extraSession({ ...dayInputFor(inp, d, run), blocked: [...new Set([...prevMuscles(inp, days, i), ...next])] });
    } else {
      const rest = openDays.slice(k).filter((x) => x.kind === "treino" && !inp.fixed?.[x.date]);
      const groupDaysLeft = Object.fromEntries(GROUPS.map((g) => [g, Math.max(1, rest.filter((x) => groups.get(x.date)?.includes(g)).length)]));
      plan = planDay({ ...dayInputFor(inp, d, run), daysLeft: Math.max(1, rest.length), split: split.get(d.date) ?? null, groupDaysLeft });
    }
    d.plan = plan;
    for (const m of musclesOf(plan.perMuscle)) { run.done[m] = n(run.done[m]) + n(plan.perMuscle[m]); run.freq[m] = n(run.freq[m]) + 1; }
    const clash = prevMuscles(inp, days, i).filter((m) => n(plan.perMuscle[m]) > 0);
    if (clash.length) d.warn.push(`Menos de 48 h para ${nm(clash)}: treinou na véspera.`);
  });
  planCardioWeek(inp, days);
  return { weekStart: inp.weekStart, targets: inp.targets, days };
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
