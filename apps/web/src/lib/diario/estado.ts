// Estado do Diário (#27): check-ins e checkouts de 35 dias, lembrete (dias sem abrir, "mais tarde") e exames.
// Servidor: /api/diario + /api/diario/abrir. Demonstração: dados fictícios guardados só neste navegador.
import { C, S, commit, dates, today } from "../store/index.ts";
import { SERVER, api, send } from "../api/index.ts";
import { addDays, lsGet, lsSet, uid } from "../util.ts";

export interface CheckoutCardio { type?: string; minutes?: number; steps?: number; intensity?: C.Intensity }
export interface Checkout {
  date: string; trained: boolean | null; cardio: CheckoutCardio | null; waterMl: number | null; alcohol: number | null;
  smoke: boolean | null; smokeQty: number | null; caffeineLate: boolean | null; mood: number | null; sleptWell: boolean | null; note: string | null; source?: string;
}
export interface Lembrete { lastOpen: string | null; snoozedOn: string | null; absenceDays: number; absence: { from: string; to: string } | null }
export interface Marcador { nome: string; valor: string | number; unidade?: string; referencia?: string; status: "dentro" | "fora" | "sem_referencia" }
export interface Exame { id: string; label: string; createdAt: number; expiresAt: number; analyzedAt: number | null; status: "pendente" | "analisado" | "expirado"; summary: { data?: string; marcadores: Marcador[]; mudancas: string[]; aviso: string } | null; hasText: boolean }
export type CheckinVals = { sleepH: number; energy: number; soreness: number; stress: number; food: number; weightKg?: number | null };

export const DIAS = 35;
export const yesterday = addDays(today, -1);
export const D = {
  loaded: false, failed: false,
  checkins: {} as Record<string, CheckinVals>, checkouts: {} as Record<string, Checkout>,
  reminder: { lastOpen: null, snoozedOn: null, absenceDays: 2, absence: null } as Lembrete,
  exams: [] as Exame[],
  /** dia aberto nos cartões de check-in/checkout (o calendário troca) */
  sel: today,
};

export const emptyCheckout = (date: string): Checkout => ({ date, trained: null, cardio: null, waterMl: null, alcohol: null, smoke: null, smokeQty: null, caffeineLate: null, mood: null, sleptWell: null, note: null });
/** check-in do dia: a semana do /api/state manda; o resto vem do Diário. */
export const checkinOf = (d: string): CheckinVals | undefined => S.week.checkins[d] ?? D.checkins[d];

// ---------- demonstração ----------
const LK = "ciclo:v1:demo:diario";
function saveDemo() { if (!SERVER) lsSet(LK, { checkins: D.checkins, checkouts: D.checkouts, reminder: D.reminder, exams: D.exams }); }
function seedDemo() {
  const co = (date: string, o: Partial<Checkout>): Checkout => ({ ...emptyCheckout(date), source: "app", ...o });
  D.checkouts = {
    [dates[0]]: co(dates[0], { trained: true, waterMl: 2500, alcohol: 0, smoke: false, caffeineLate: false, mood: 4, cardio: { type: "Running_Treadmill", minutes: 25 } }),
    [dates[1]]: co(dates[1], { trained: true, waterMl: 2000, alcohol: 2, smoke: false, caffeineLate: true, mood: 3 }),
    [addDays(dates[0], -2)]: co(addDays(dates[0], -2), { trained: false, alcohol: 3, waterMl: 1500, mood: 3, note: "Churrasco de domingo (fictício)", source: "claude" }),
  };
  for (let i = 3; i < 20; i += 2) { const d = addDays(dates[0], -i); D.checkins[d] = { sleepH: 7, energy: 2, soreness: 1, stress: 2, food: 0 }; if (i % 4 === 1) D.checkouts[d] = co(d, { trained: i % 3 === 0, alcohol: i % 5 === 0 ? 2 : 0, waterMl: 2000, mood: 4 }); }
  D.exams = [{ id: "ex-demo", label: "Exame de sangue (fictício)", createdAt: Date.now() - 3 * 864e5, expiresAt: Date.now() + 4 * 864e5, analyzedAt: Date.now() - 2 * 864e5, status: "analisado", hasText: false,
    summary: { data: addDays(today, -10), marcadores: [
      { nome: "Vitamina D", valor: 22, unidade: "ng/mL", referencia: "30–100", status: "fora" },
      { nome: "Ferritina", valor: 140, unidade: "ng/mL", referencia: "30–400", status: "dentro" },
      { nome: "Glicemia de jejum", valor: 88, unidade: "mg/dL", referencia: "70–99", status: "dentro" },
      { nome: "TSH", valor: 2.1, unidade: "mUI/L", referencia: "0,4–4,0", status: "dentro" }],
      mudancas: ["Vitamina D baixa: 15 min de sol por dia e conversar com o médico sobre suplementar."], aviso: C.EXAM_AVISO } }];
}

// ---------- carga ----------
/** Ao abrir o app: marca a abertura (dias sem abrir) e carrega 35 dias. Erro de rede não quebra a tela. */
export async function bootDiario() {
  if (!SERVER) {
    const v = lsGet<any>(LK, null);
    if (v) Object.assign(D, { checkins: v.checkins ?? {}, checkouts: v.checkouts ?? {}, reminder: { ...D.reminder, ...(v.reminder ?? {}) }, exams: v.exams ?? [] });
    else { seedDemo(); saveDemo(); }
    D.loaded = true; commit(); return;
  }
  try { D.reminder = await api<Lembrete>("POST", "/api/diario/abrir", { today }); } catch { /* offline: segue com o que tiver */ }
  await loadDiario();
}
export async function loadDiario() {
  if (!SERVER) return;
  try {
    const r = await api<any>("GET", `/api/diario?from=${addDays(today, -(DIAS - 1))}&to=${today}`);
    D.checkins = Object.fromEntries(r.checkins.map(({ date, ...c }: any) => [date, c]));
    D.checkouts = Object.fromEntries(r.checkouts.map((c: Checkout) => [c.date, c]));
    D.reminder = r.reminder; D.exams = r.exams; D.loaded = true; D.failed = false;
  } catch { D.failed = true; }
  commit();
}

// ---------- escrita (otimista; sem rede, entra na fila do app) ----------
export function saveCheckin(date: string, v: CheckinVals) {
  D.checkins[date] = v;
  if (dates.includes(date)) S.week.checkins[date] = v;
  saveDemo(); commit();
  send("PUT", `/api/checkin/${date}`, { sleepH: v.sleepH, energy: v.energy, soreness: v.soreness, stress: v.stress, food: v.food, weightKg: v.weightKg ?? null }).catch(() => {});
}

export function saveCheckout(c: Checkout) {
  D.checkouts[c.date] = { ...c, source: "app" };
  // o cardio do checkout entra no resumo da semana (mesmo id do servidor: ck-<data>)
  const e = C.checkoutCardioEntry(c.date, c.cardio);
  S.week.cardio = S.week.cardio.filter((x) => x.id !== `ck-${c.date}`).concat(e && dates.includes(c.date) ? [e] : []);
  saveDemo(); commit();
  const { date, source: _s, ...body } = c;
  send("PUT", `/api/checkout/${date}`, body).catch(() => {});
}

export function snooze() { D.reminder = { ...D.reminder, snoozedOn: today }; saveDemo(); commit(); send("PUT", "/api/diario/lembrete", { snoozedOn: today }).catch(() => {}); }
export function dismissAbsence() { D.reminder = { ...D.reminder, absence: null }; saveDemo(); commit(); send("PUT", "/api/diario/lembrete", { dismissAbsence: true }).catch(() => {}); }

export interface DiaResumo { date: string; trained: boolean | null; alcohol: number | null; sleptWell: boolean | null; note: string }
export async function saveResumo(dias: DiaResumo[]) {
  for (const d of dias) {
    const cur = D.checkouts[d.date] ?? emptyCheckout(d.date);
    D.checkouts[d.date] = { ...cur, trained: d.trained ?? cur.trained, alcohol: d.alcohol ?? cur.alcohol, sleptWell: d.sleptWell ?? cur.sleptWell, note: d.note.trim() || cur.note, source: cur.source ?? "resumo" };
    if (d.trained != null && dates.includes(d.date) && !S.week.attendance[d.date]) S.week.attendance[d.date] = d.trained ? "fui" : "nao_fui";
  }
  D.reminder = { ...D.reminder, absence: null }; saveDemo(); commit();
  await send("POST", "/api/diario/resumo", { dias: dias.map((d) => ({ date: d.date, trained: d.trained, alcohol: d.alcohol, sleptWell: d.sleptWell, note: d.note.trim() || null })) });
}

export async function addExam(label: string, text: string) {
  const now = Date.now();
  if (!SERVER) {
    D.exams = [{ id: uid(), label: label || "Exame", createdAt: now, expiresAt: C.examExpiresAt(now), analyzedAt: null, status: "pendente", summary: null, hasText: true }, ...D.exams];
    saveDemo(); commit(); return;
  }
  await api("POST", "/api/exames", { label, text });
  await loadDiario();
}
export async function removeExam(id: string) {
  D.exams = D.exams.filter((e) => e.id !== id); saveDemo(); commit();
  await send("DELETE", `/api/exames/${encodeURIComponent(id)}`);
}
