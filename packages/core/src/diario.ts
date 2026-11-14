// Diário (#27): cobertura (check-in + checkout), dias sem abrir, faixa de lembrete, saúde da semana e exames.
// O app e o Worker só chamam estas regras; a validação de formato da API fica no Worker (http.ts).

import { CARDIO_BY_ID } from "./catalog.ts";
import type { CardioEntry } from "./cardio.ts";

const DAY = 864e5;
const addDays = (iso: string, n: number) => new Date(Date.parse(iso + "T12:00:00Z") + n * DAY).toISOString().slice(0, 10);
const diffDays = (a: string, b: string) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / DAY);

/** Últimos `n` dias até `today` (inclusive), do mais antigo ao mais novo. Usado no calendário de 7/30 dias. */
export function lastDays(today: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addDays(today, i - n + 1));
}

// ---------- cobertura ----------
export type DiaryDayState = "completo" | "parcial" | "vazio" | "futuro";
export interface DiaryCoverage { days: { date: string; checkin: boolean; checkout: boolean; state: DiaryDayState }[]; checkins: number; checkouts: number; due: number; empty: string[] }
/**
 * Por dia: check-in (manhã) e checkout (noite). Hoje sem checkout não é buraco (o checkout é à noite).
 * `empty` = dias passados (ou hoje) sem nada registrado — o calendário marca e permite preencher depois.
 */
export function diaryCoverage(dates: string[], checkins: string[], checkouts: string[], today: string): DiaryCoverage {
  const ci = new Set(checkins), co = new Set(checkouts);
  const days = dates.map((date) => {
    const checkin = ci.has(date), checkout = co.has(date);
    let state: DiaryDayState;
    if (date > today) state = "futuro";
    else if (checkin && checkout) state = "completo";
    else if (checkin || checkout) state = "parcial";
    else state = "vazio";
    return { date, checkin, checkout, state };
  });
  const due = days.filter((d) => d.state !== "futuro");
  return { days, checkins: due.filter((d) => d.checkin).length, checkouts: due.filter((d) => d.checkout).length, due: due.length, empty: due.filter((d) => d.state === "vazio").map((d) => d.date) };
}

// ---------- dias sem abrir ----------
export const ABSENCE_DEFAULT = 2;
export const ABSENCE_MAX_DAYS = 14;
/** Volta depois de dias sem abrir: `missing` = dias entre a última abertura e hoje (exclusivos), no máx. 14; pergunta se ≥ X. */
export function absenceGap(lastOpen: string | null, today: string, threshold = ABSENCE_DEFAULT): { days: number; missing: string[]; ask: boolean } {
  if (!lastOpen || lastOpen >= today) return { days: 0, missing: [], ask: false };
  const days = diffDays(lastOpen, today);
  const n = Math.min(days - 1, ABSENCE_MAX_DAYS);
  const missing = n > 0 ? lastDays(addDays(today, -1), n) : [];
  return { days, missing, ask: missing.length >= Math.max(1, threshold) };
}

// ---------- faixa de lembrete (nunca modal) ----------
export interface DiaryReminderInput { today: string; checkinToday: boolean; checkoutYesterday: boolean; snoozedOn: string | null; absence: { from: string; to: string } | null }
export interface DiaryReminder { kind: "resumo" | "checkin" | "checkout"; text: string; cta: string; href: string }
/** O que a faixa fina do topo mostra (ou null). "Mais tarde" adia só no dia (1×). Prioridade: resumo dos dias > check-in > checkout de ontem. */
export function diaryReminder(i: DiaryReminderInput): DiaryReminder | null {
  if (i.snoozedOn === i.today) return null;
  if (i.absence) {
    const days = diffDays(i.absence.from, i.today) + 1;
    return { kind: "resumo", text: `Faz ${days} dias. Quer resumir?`, cta: "Resumir", href: "#diario/resumo" };
  }
  if (!i.checkinToday) return { kind: "checkin", text: "Fazer check-in · 10 s", cta: "Abrir", href: "#diario" };
  if (!i.checkoutYesterday) return { kind: "checkout", text: "Checkout de ontem pendente · 20 s", cta: "Abrir", href: "#diario/checkout" };
  return null;
}

// ---------- checkout ----------
export const CHECKOUT_LIMITS = { alcohol: 30, smokeQty: 100, waterMl: 10000, steps: 100000, mood: 5, note: 1000 } as const;
export interface CheckoutCardio { type?: string | null; minutes?: number | null; steps?: number | null; intensity?: "zona2" | "moderado" | "intervalado" | null }
/** Cardio informado no checkout → registro de cardio da semana (id fixo por dia, para regravar sem duplicar). Só passos: null. */
export function checkoutCardioEntry(date: string, c: CheckoutCardio | null | undefined): CardioEntry | null {
  if (!c || !c.type || !CARDIO_BY_ID[c.type] || !c.minutes || c.minutes < 1) return null;
  return { id: `ck-${date}`, date, type: c.type, minutes: Math.round(c.minutes), intensity: c.intensity ?? "moderado", distanceKm: null };
}

// ---------- saúde da semana ----------
export interface CheckoutLite { date: string; alcohol: number | null; smoke: boolean | null; smokeQty: number | null; caffeineLate: boolean | null; waterMl: number | null; cardioMin: number | null; steps: number | null; mood: number | null }
export interface HealthWeek {
  checkouts: number; sleepNights: number; sleepAvg: number | null;
  alcoholNights: number; alcoholUnits: number; smokeDays: number; smokeQty: number; caffeineLateDays: number;
  waterAvgMl: number | null; cardioMin: number; stepsAvg: number | null; moodAvg: number | null;
}
const avg = (xs: number[], d = 1) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10 ** d) / 10 ** d : null);
/** Médias da semana (sono do check-in; álcool, fumo, cafeína, água e humor do checkout). `cardioMin` vem do resumo de cardio da semana (que já soma o do checkout). */
export function healthWeek(dates: string[], checkins: { date: string; sleepH: number }[], checkouts: CheckoutLite[], cardioMin: number): HealthWeek {
  const inW = new Set(dates);
  const ci = checkins.filter((c) => inW.has(c.date)), co = checkouts.filter((c) => inW.has(c.date));
  const n = (v: number | null | undefined): v is number => typeof v === "number";
  return {
    checkouts: co.length, sleepNights: ci.length, sleepAvg: avg(ci.map((c) => c.sleepH)),
    alcoholNights: co.filter((c) => (c.alcohol ?? 0) > 0).length, alcoholUnits: co.reduce((s, c) => s + (c.alcohol ?? 0), 0),
    smokeDays: co.filter((c) => c.smoke).length, smokeQty: co.reduce((s, c) => s + (c.smoke ? c.smokeQty ?? 0 : 0), 0),
    caffeineLateDays: co.filter((c) => c.caffeineLate).length,
    waterAvgMl: avg(co.map((c) => c.waterMl).filter(n), 0), cardioMin,
    stepsAvg: avg(co.map((c) => c.steps).filter(n), 0), moodAvg: avg(co.map((c) => c.mood).filter(n)),
  };
}
/** Regra de "manutenção por saúde": 3+ noites com álcool ou sono médio < 6 h (com ≥ 3 noites registradas). Só sugere. */
export function healthMaintenance(h: HealthWeek): { suggest: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (h.alcoholNights >= 3) reasons.push(`${h.alcoholNights} noites com álcool`);
  if (h.sleepNights >= 3 && h.sleepAvg != null && h.sleepAvg < 6) reasons.push(`sono médio de ${String(h.sleepAvg).replace(".", ",")} h`);
  return { suggest: reasons.length > 0, reasons };
}
/** Uma linha para o resumo de contexto do Claude e para a revisão. */
export function healthText(h: HealthWeek, m: { suggest: boolean; reasons: string[] }): string {
  if (!h.checkouts && !h.sleepNights) return "Saúde da semana: sem checkout nem check-in ainda.";
  const parts = [
    h.sleepAvg != null ? `sono ${String(h.sleepAvg).replace(".", ",")} h (${h.sleepNights} noites)` : "sono sem registro",
    `álcool ${h.alcoholNights} noites (${h.alcoholUnits} doses)`,
    `fumo ${h.smokeDays} dias${h.smokeQty ? ` (${h.smokeQty})` : ""}`,
    `cardio ${h.cardioMin} min`,
  ];
  if (h.caffeineLateDays) parts.push(`cafeína depois das 16h ${h.caffeineLateDays} dias`);
  if (h.waterAvgMl != null) parts.push(`água ${h.waterAvgMl} ml/dia`);
  const tail = m.suggest ? ` → semana de manutenção sugerida (${m.reasons.join(", ")}).` : ".";
  return `Saúde da semana (${h.checkouts} checkouts): ${parts.join(" · ")}${tail}`;
}

// ---------- exames ----------
export const EXAM_MAX_PDF_BYTES = 5 * 1024 * 1024;
export const EXAM_MAX_TEXT = 60_000;
export const EXAM_TTL_MS = 7 * DAY;
export const EXAM_AVISO = "Resumo do Chat a partir do seu laudo: não é diagnóstico. Converse com seu médico antes de mudar suplemento ou remédio.";
export const examExpiresAt = (createdAt: number) => createdAt + EXAM_TTL_MS;
/** O PDF é lido no aparelho: só PDF e até 5 MB. Devolve a mensagem de erro ou null. */
export function checkExamFile(f: { size: number; type: string }): string | null {
  if (f.type !== "application/pdf") return "Envie um PDF (ou cole o texto do laudo).";
  if (!f.size) return "Arquivo vazio.";
  if (f.size > EXAM_MAX_PDF_BYTES) return "PDF de até 5 MB.";
  return null;
}

export interface ExamMarker { nome: string; valor: string | number; unidade?: string; referencia?: string; status: "dentro" | "fora" | "sem_referencia" }
export interface ExamSummary { data?: string; marcadores: ExamMarker[]; mudancas: string[]; aviso: string }
const STATUS = ["dentro", "fora", "sem_referencia"] as const;
const isIso = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const optStr = (v: unknown, max: number) => v == null || v === "" ? undefined : typeof v === "string" && v.length <= max ? v : null;
/** Resumo estruturado do exame (o que fica guardado depois que o texto bruto é apagado). Tudo validado; qualquer erro recusa. */
export function checkExamSummary(x: unknown): { ok: true; value: ExamSummary } | { ok: false; errors: string[] } {
  if (!x || typeof x !== "object" || Array.isArray(x)) return { ok: false, errors: ["resumo inválido"] };
  const r = x as Record<string, unknown>, errors: string[] = [];
  if (r.data != null && !isIso(r.data)) errors.push("data deve ser YYYY-MM-DD");
  const ms = r.marcadores;
  if (!Array.isArray(ms) || !ms.length) errors.push("marcadores: ao menos 1");
  else if (ms.length > 40) errors.push("marcadores: até 40");
  const marcadores: ExamMarker[] = [];
  if (Array.isArray(ms) && ms.length <= 40) ms.forEach((m, i) => {
    const o = (m && typeof m === "object" ? m : {}) as Record<string, unknown>;
    const nome = typeof o.nome === "string" ? o.nome.trim() : "";
    if (!nome || nome.length > 60) errors.push(`marcadores[${i}].nome inválido`);
    const valor = typeof o.valor === "number" && Number.isFinite(o.valor) ? o.valor : typeof o.valor === "string" && o.valor.length <= 30 ? o.valor : null;
    if (valor == null) errors.push(`marcadores[${i}].valor inválido`);
    const unidade = optStr(o.unidade, 20), referencia = optStr(o.referencia, 60);
    if (unidade === null) errors.push(`marcadores[${i}].unidade inválida`);
    if (referencia === null) errors.push(`marcadores[${i}].referencia inválida`);
    if (!STATUS.includes(o.status as never)) errors.push(`marcadores[${i}].status deve ser ${STATUS.join("|")}`);
    marcadores.push({ nome, valor: valor ?? "", ...(unidade ? { unidade } : {}), ...(referencia ? { referencia } : {}), status: o.status as ExamMarker["status"] });
  });
  const mu = r.mudancas ?? [];
  if (!Array.isArray(mu) || mu.length > 5 || !mu.every((s) => typeof s === "string" && s.length > 0 && s.length <= 300)) errors.push("mudancas: até 5 frases de até 300 caracteres");
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { ...(r.data ? { data: r.data as string } : {}), marcadores, mudancas: mu as string[], aviso: EXAM_AVISO } };
}
