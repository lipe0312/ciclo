// Diário 2.0 (#42): recap do período ausente (fim de semana / semana / mês), álcool → kcal, refeições que faltaram,
// tela de confirmação, o que a faixa do topo mostra ao entrar e o "vai treinar hoje?". TS puro, sem dependências.

import type { Meal } from "./comida.ts";

const DAY = 864e5;
const addDays = (iso: string, n: number) => new Date(Date.parse(iso + "T12:00:00Z") + n * DAY).toISOString().slice(0, 10);
const diffDays = (a: string, b: string) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / DAY);
/** 0 = segunda … 6 = domingo */
const dowOf = (iso: string) => (new Date(iso + "T12:00:00Z").getUTCDay() + 6) % 7;
const mondayOfIso = (iso: string) => addDays(iso, -dowOf(iso));

// ---------- relógio local ----------
export const RECAP_TZ = "America/Bahia";
/** O dia do diário vira às 07:00: abrir de madrugada ainda conta como o dia anterior. */
export const DIA_COMECA_H = 7;
/** Sexta a partir das 19:00 já é fim de semana. */
export const FDS_COMECA_H = 19;

function local(agora: number, tz: string): { date: string; hour: number } {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date(agora)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}
/** Dia do diário no fuso: antes das 07:00 ainda é o dia anterior. */
export function diaDoDiario(agora: number, tz = RECAP_TZ): string {
  const l = local(agora, tz);
  return l.hour < DIA_COMECA_H ? addDays(l.date, -1) : l.date;
}
/** Hora local (0–23) no fuso. */
export const horaLocal = (agora: number, tz = RECAP_TZ) => local(agora, tz).hour;
/** Sexta 19:00 até domingo 23:59 (no fuso). */
export function emFimDeSemana(agora: number, tz = RECAP_TZ): boolean {
  const l = local(agora, tz), d = dowOf(l.date);
  return d === 5 || d === 6 || (d === 4 && l.hour >= FDS_COMECA_H);
}

// ---------- janela do recap ----------
export type RecapKind = "fds" | "semana" | "mes";
export interface RecapPeriodo { kind: RecapKind; from: string; to: string }
export const RECAP_SEMANA_MAX = 14;
export const RECAP_MES_DIAS = 30;
export const RECAP_MES_APOS = 21;

/** Dias do período (inclusive). */
export function recapDias(p: { from: string; to: string }): string[] {
  const n = diffDays(p.from, p.to) + 1;
  return n > 0 ? Array.from({ length: Math.min(n, RECAP_MES_DIAS) }, (_, i) => addDays(p.from, i)) : [];
}
/** fds = sexta a domingo; até 14 dias = semana; mais que isso = mês. */
export function recapKindOf(from: string, to: string): RecapKind {
  const n = diffDays(from, to) + 1;
  if (n > RECAP_SEMANA_MAX) return "mes";
  if (n === 3 && dowOf(from) === 4) return "fds";
  return "semana";
}

/**
 * Qual review mostrar ao abrir. `ultimoAcesso` = dia do diário da última abertura (antes desta).
 * - fim de semana (sex 19:00 → dom 23:59) sem recap e a última abertura foi a partir de sexta → "fds" (a partir de segunda 07:00,
 *   mesmo que tenha aberto no fds);
 * - 2 dias ou mais sem abrir → "semana" (no máx. 14 dias; os dias do fds corrente esperam o recap de segunda);
 * - mais de 3 semanas → "mes" (últimos 30 dias, médias).
 */
export function reviewWindow(ultimoAcesso: string | null, agora: number, tz = RECAP_TZ): { kind: RecapKind | "nada"; from: string | null; to: string | null; hoje: string } {
  const hoje = diaDoDiario(agora, tz);
  const nada = { kind: "nada" as const, from: null, to: null, hoje };
  if (!ultimoAcesso || ultimoAcesso >= hoje) return nada;
  const gap = diffDays(ultimoAcesso, hoje), ontem = addDays(hoje, -1);
  if (gap > RECAP_MES_APOS) {
    const from = [addDays(ultimoAcesso, 1), addDays(hoje, -RECAP_MES_DIAS)].sort()[1];
    return { kind: "mes", from, to: ontem, hoje };
  }
  const mon = mondayOfIso(hoje), sex = addDays(mon, -3);
  if (ultimoAcesso < mon && ultimoAcesso >= sex) return { kind: "fds", from: sex, to: addDays(mon, -1), hoje };
  if (gap < 2) return nada;
  let to = ontem;
  const d = dowOf(hoje);
  if (d >= 5) to = [to, addDays(mon, 3)].sort()[0]; // sábado/domingo: o fds corrente vira recap na segunda
  const from = [addDays(ultimoAcesso, 1), addDays(to, -(RECAP_SEMANA_MAX - 1))].sort()[1];
  if (from > to) return nada;
  return { kind: "semana", from, to, hoje };
}

/** Um review por vez: o pendente e o novo viram um período só (no máx. 30 dias, terminando no mais recente). */
export function mergeRecap(pend: { from: string; to: string } | null, novo: { from: string; to: string } | null): RecapPeriodo | null {
  if (!pend && !novo) return null;
  const a = pend ?? novo!, b = novo ?? pend!;
  const to = a.to > b.to ? a.to : b.to;
  let from = a.from < b.from ? a.from : b.from;
  const min = addDays(to, -(RECAP_MES_DIAS - 1));
  if (from < min) from = min;
  return { kind: recapKindOf(from, to), from, to };
}

// ---------- álcool → kcal ----------
export const ALCOOL_KCAL = { cerveja: 150, vinho: 125, destilado: 100 } as const;
export type Bebida = keyof typeof ALCOOL_KCAL;
export type Doses = Partial<Record<Bebida, number>>;
export const BEBIDAS = Object.keys(ALCOOL_KCAL) as Bebida[];
const BEB_NM: Record<Bebida, [string, string]> = { cerveja: ["cerveja (lata)", "cervejas (lata)"], vinho: ["taça de vinho", "taças de vinho"], destilado: ["dose de destilado", "doses de destilado"] };
const qtd = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : 0);
/** Cerveja lata 350 ml ≈ 150 kcal, taça de vinho ≈ 125, dose de destilado ≈ 100. */
export const alcoolKcal = (d: Doses) => BEBIDAS.reduce((s, b) => s + qtd(d[b]) * ALCOOL_KCAL[b], 0);
export const totalDoses = (d: Doses) => BEBIDAS.reduce((s, b) => s + qtd(d[b]), 0);
/** Texto do registro na Comida ("Bebida: …"): é o que marca o registro como bebida. */
export function bebidaTexto(d: Doses): string {
  return "Bebida: " + BEBIDAS.filter((b) => qtd(d[b])).map((b) => `${qtd(d[b])} ${BEB_NM[b][qtd(d[b]) === 1 ? 0 : 1]}`).join(", ");
}

// ---------- refeições que faltaram ----------
export const REFEICOES_RECAP: readonly Meal[] = ["cafe", "almoco", "lanche", "jantar"];
const REF_PADRAO: Record<Meal, number> = { cafe: 400, almoco: 700, lanche: 300, jantar: 650, ceia: 200 };
const REF_NM: Record<Meal, string> = { cafe: "sem café registrado", almoco: "sem almoço registrado", lanche: "sem lanche registrado", jantar: "sem janta registrada", ceia: "sem ceia registrada" };
/** No recap do fds a sexta só conta a janta (o fds começa às 19:00). */
function refeicoesDoDia(date: string, p: RecapPeriodo): readonly Meal[] {
  return p.kind === "fds" && date === p.from ? ["jantar"] : REFEICOES_RECAP;
}
/** Refeições sem registro no período, por dia (registro sem refeição não cobre nenhuma). */
export function refeicoesFaltando(p: RecapPeriodo, registros: readonly { date: string; meal?: Meal | null }[]): { date: string; meals: Meal[] }[] {
  const tem = new Set(registros.filter((r) => r.meal).map((r) => `${r.date}|${r.meal}`));
  return recapDias(p).map((date) => ({ date, meals: refeicoesDoDia(date, p).filter((m) => !tem.has(`${date}|${m}`)) })).filter((d) => d.meals.length);
}
/** "Não lembro": estimativa = média dessa refeição no histórico (ou um padrão). Nunca zero, para o painel não mentir. */
export function estimativaRefeicao(meal: Meal, historico: readonly { meal?: Meal | null; kcal: number | null }[]): number {
  const xs = historico.filter((h) => h.meal === meal && typeof h.kcal === "number" && h.kcal > 0).map((h) => h.kcal as number);
  return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : REF_PADRAO[meal];
}

// ---------- modo e conteúdo do recap ----------
export type RecapModo = "confirmar" | "completo" | "mes";
/** Todos os dias com algum registro → só confirmar; algum dia em branco → recap completo; mês → curto. */
export function recapModo(p: RecapPeriodo, dias: readonly { date: string; checkin: boolean; checkout: boolean }[]): RecapModo {
  if (p.kind === "mes") return "mes";
  const ok = new Set(dias.filter((d) => d.checkin || d.checkout).map((d) => d.date));
  return recapDias(p).every((d) => ok.has(d)) ? "confirmar" : "completo";
}

const DIA_NM = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
export interface RecapCheckout { date: string; alcohol: number | null; trained: boolean | null; cardioMin?: number | null; cardioType?: string | null }
export interface RecapLinha { date: string; label: string; texto: string; lacunas: string[] }
const fmt1 = (v: number) => String(Math.round(v * 10) / 10).replace(".", ",");
/** Uma linha por dia para a tela de confirmação ("Sexta à noite: 3 doses · Sábado: dormiu 6 h …"), com as lacunas de comida. */
export function recapLinhas(p: RecapPeriodo, x: { checkins: readonly { date: string; sleepH: number }[]; checkouts: readonly RecapCheckout[]; faltando: readonly { date: string; meals: Meal[] }[] }): RecapLinha[] {
  return recapDias(p).map((date) => {
    const ci = x.checkins.find((c) => c.date === date), co = x.checkouts.find((c) => c.date === date);
    const parts: string[] = [];
    if (co?.alcohol) parts.push(`${co.alcohol} dose${co.alcohol > 1 ? "s" : ""}`);
    if (ci) parts.push(`dormiu ${fmt1(ci.sleepH)} h`);
    if (co?.trained) parts.push("treinou");
    if (co?.cardioMin) parts.push(`cardio ${co.cardioMin} min${co.cardioType ? ` (${co.cardioType})` : ""}`);
    const label = p.kind === "fds" && date === p.from ? "Sexta à noite" : DIA_NM[dowOf(date)];
    const lacunas = (x.faltando.find((f) => f.date === date)?.meals ?? []).map((m) => REF_NM[m]);
    return { date, label, texto: parts.join(" · ") || "sem registro", lacunas };
  });
}

/** Recap do mês: médias (não dia a dia). */
export function recapMes(p: RecapPeriodo, x: { checkins: readonly { date: string; sleepH: number }[]; checkouts: readonly { date: string; alcohol: number | null; trained: boolean | null }[]; treinos: number }) {
  const dias = recapDias(p), inP = new Set(dias), semanas = dias.length / 7;
  const ci = x.checkins.filter((c) => inP.has(c.date)), co = x.checkouts.filter((c) => inP.has(c.date));
  const r1 = (v: number) => Math.round(v * 10) / 10;
  return {
    dias: dias.length,
    sonoMedio: ci.length ? r1(ci.reduce((s, c) => s + c.sleepH, 0) / ci.length) : null,
    dosesSemana: semanas ? r1(co.reduce((s, c) => s + (c.alcohol ?? 0), 0) / semanas) : 0,
    treinosSemana: semanas ? r1(x.treinos / semanas) : 0,
    diasRegistrados: new Set([...ci.map((c) => c.date), ...co.map((c) => c.date)]).size,
  };
}

// ---------- entrada do dia (a faixa do topo: uma coisa por vez, nunca modal) ----------
export interface EntradaInput {
  /** dia do diário (vira às 07:00) e hora local */
  hoje: string; hora: number;
  recap: RecapPeriodo | null; snoozedOn: string | null;
  /** dia sem treino marcado na semana; resposta do "vai treinar hoje?" ("sim" | "nao" | null) */
  diaSemTreino: boolean; respostaTreino: string | null; treinouHoje: boolean;
  checkinHoje: boolean; checkoutOntem: boolean; checkoutHoje: boolean;
}
export interface Entrada { kind: "recap" | "treinar" | "checkin" | "checkout"; text: string; cta: string; href: string }
const RECAP_TXT: Record<RecapKind, string> = { fds: "Como foi o fim de semana?", semana: "Como foi a semana?", mes: "Resumo do mês · 1 min" };
/** Ordem: recap pendente > "vai treinar hoje?" (dia sem treino) > check-in (manhã) / checkout (noite) > checkout de ontem. "Mais tarde" some até amanhã 07:00. */
export function entradaDoDia(i: EntradaInput): Entrada | null {
  if (i.snoozedOn === i.hoje) return null;
  if (i.recap) return { kind: "recap", text: RECAP_TXT[i.recap.kind], cta: "Abrir", href: "#diario/resumo" };
  if (i.diaSemTreino && !i.respostaTreino && !i.treinouHoje) return { kind: "treinar", text: "Vai treinar hoje?", cta: "Sim", href: "#diario/treinar" };
  if (i.hora >= FDS_COMECA_H) return i.checkoutHoje ? null : { kind: "checkout", text: "Checkout de hoje · 20 s", cta: "Abrir", href: `#diario/checkout/${i.hoje}` };
  if (!i.checkinHoje) return { kind: "checkin", text: "Fazer check-in · 10 s", cta: "Abrir", href: "#diario" };
  if (!i.checkoutOntem) return { kind: "checkout", text: "Checkout de ontem pendente · 20 s", cta: "Abrir", href: `#diario/checkout/${addDays(i.hoje, -1)}` };
  return null;
}

// ---------- "vai treinar hoje?" ----------
type Num = Partial<Record<string, number>>;
/** Entre os treinos que ainda vêm na semana, o que mais cobre músculos abaixo de 2 estímulos (desempate: prioridades, depois o mais cedo). */
export function sugerirTreinoHoje<D extends { date: string; name: string; perMuscle: Num }>(dias: readonly D[], freq: Num, targets: Num, priorities: readonly string[]): (D & { cobre: string[] }) | null {
  const abaixo = (m: string) => (targets[m] ?? 0) > 0 && (freq[m] ?? 0) < 2;
  let best: (D & { cobre: string[] }) | null = null, bestScore = [0, 0];
  for (const d of [...dias].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    const cobre = Object.keys(d.perMuscle).filter((m) => (d.perMuscle[m] ?? 0) > 0 && abaixo(m));
    const score = [cobre.length, cobre.filter((m) => priorities.includes(m)).length];
    if (score[0] > bestScore[0] || (score[0] === bestScore[0] && score[1] > bestScore[1])) { best = { ...d, cobre }; bestScore = score; }
  }
  return best;
}
