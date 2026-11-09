// Estado global do app (mutável, como no app.js do M0) + re-render por assinatura.
// Telas leem `S` direto e chamam `commit()` depois de mudar algo. Campos novos do /api/state são tolerados.
import { useEffect, useState } from "preact/hooks";
import * as C from "@ciclo/core";
import { SERVER, api } from "../api/index.ts";
import { addDays, clone, isoDate, lsGet, lsSet } from "../util.ts";

export { C };
export const realToday = isoDate();
export const today = SERVER ? realToday : addDays(C.mondayOf(realToday), 3); // demo: "quinta" fictícia
export const monday = C.mondayOf(today);
export const dates = C.weekDates(monday);

export const DEFAULT_PROFILE = {
  sex: "m", age: 24, heightCm: 175, weightKg: 72, bodyType: "magro", fatWhere: ["barriga"] as string[], level: 1 as 0 | 1 | 2 | 3,
  goal: { id: "bracos_ombros", statement: "Braços e ombros maiores mantendo a cintura", horizonWeeks: 12, metrics: { bracoCm: 1.5, cinturaCm: 0, pesoKg: 1.5, aderenciaPct: 80 } },
  priorities: ["ombro", "biceps", "triceps"] as C.MuscleId[], remembered: [] as C.Remembered[], calibrate: true,
  daysUsual: ["seg", "ter", "qui", "sex"], daysTarget: 4, minutes: 60, weekStart: "seg", flexWeek: true, hour: "noite",
  prefs: {} as Record<string, any>, pinned: {} as Record<string, string>, avoid: [] as string[], dynamics: "tradicional", crowdedStrategy: "halteres",
  mobility: { squat: true, overhead: true },
  dayGym: { seg: "acad1", ter: "acad1", qua: "acad2", qui: "acad1", sex: "acad2", sab: "casa", dom: "casa" } as Record<string, string>,
  diet: { mode: "leve", typical: "", restrictions: [] as string[], supplements: ["whey"], kcal: 2650, protein: 139 },
  autonomy: "carga_sozinho", tone: "direto", reviewTime: "dom20",
  tiers: { Hoje: "haiku", Treino: "sonnet", Corpo: "opus", Comida: "haiku", Plano: "opus" } as Record<string, string>,
  /** prioridades por subdivisão (mapa de músculos); opcional */
  subPriorities: [] as C.SubMuscleId[],
};
export type Profile = typeof DEFAULT_PROFILE;
export interface Gym { id: string; name: string; equipment: string[]; busyHours: string[] }
export const DEFAULT_GYMS: Gym[] = [
  { id: "acad1", name: "Academia 1", equipment: C.EQUIPMENT.map((e) => e.id).filter((e) => !["hack", "kettle", "scott", "roscamaq", "tricmaq", "pantsent"].includes(e)), busyHours: ["18-20"] },
  { id: "acad2", name: "Academia 2", equipment: ["halteres", "banco", "polia", "puxador", "legpress", "extensora", "flexora", "barrafixa"], busyHours: [] },
  { id: "casa", name: "Casa", equipment: ["halteres", "elastico", "barrafixa"], busyHours: [] },
];

export const S = {
  profile: clone(DEFAULT_PROFILE), gyms: clone(DEFAULT_GYMS),
  week: { done: {} as Record<string, number>, freq: {} as Record<string, number>, attendance: {} as Record<string, string>, checkins: {} as Record<string, any>, sessions: [] as any[] },
  pains: [] as any[], inbox: [] as any[], food: [] as any[], media: {} as Record<string, any>, history: {} as Record<string, C.SetLog[]>, measures: [] as any[], edits: [] as any[],
  features: { ai: false, media: false } as Record<string, boolean>,
  /** campos de outras frentes (contas multiusuário); opcionais */
  account: null as any, onboarding: null as any,
  plan: null as C.DayPlan | null, session: null as any,
  ui: {
    daysLeft: 1, minutes: 60, gymId: null as string | null, focus: [] as C.MuscleId[], crowded: false, mode: "normal" as C.Mode, format: "tradicional",
    swapsToday: {} as Record<string, string>, locked: false, planSource: undefined as string | undefined, minutesSet: false,
    ckDate: today, ckDraft: null as any, perfilSec: null as string | null, cat: "todos", gymTab: "acad1", bodyView: "frente", promptCat: "Hoje",
    tierOverride: null as string | null, inboxDraft: "", foodDraft: "", editDraft: null as any, fb: null as any,
  },
};
export type State = typeof S;

// ---------- re-render ----------
const subs = new Set<() => void>();
export function commit() { saveLocal(); subs.forEach((f) => f()); }
export function useStore() {
  const [, set] = useState(0);
  useEffect(() => { const f = () => set((x) => x + 1); subs.add(f); return () => { subs.delete(f); }; }, []);
  return S;
}

// ---------- persistência local ----------
const LS = "ciclo:v1";
const key = () => LS + (SERVER ? ":srv" : ":demo") + ":" + today;
export function saveLocal() {
  const keep: Record<string, unknown> = { ui: { ...S.ui, perfilSec: null }, session: S.session, plan: S.ui.locked ? S.plan : null };
  if (!SERVER) Object.assign(keep, { profile: S.profile, gyms: S.gyms, week: S.week, pains: S.pains, inbox: S.inbox, food: S.food, media: S.media, measures: S.measures, edits: S.edits, history: S.history });
  lsSet(key(), keep);
}
export function loadLocal() {
  const v = lsGet<Record<string, any> | null>(key(), null);
  if (!v) return false;
  for (const k of Object.keys(v)) if (v[k] != null) (S as any)[k] = k === "ui" ? { ...S.ui, ...v.ui } : k === "profile" ? { ...DEFAULT_PROFILE, ...v.profile } : v[k];
  return true;
}

// ---------- servidor ----------
export async function loadServer() {
  const st = await api("GET", `/api/state?date=${today}`);
  S.profile = { ...DEFAULT_PROFILE, ...(st.profile ?? {}) };
  S.gyms = st.gyms?.length ? st.gyms : S.gyms;
  S.features = st.features ?? S.features;
  S.account = st.account ?? null; S.onboarding = st.onboarding ?? null;
  const w = st.week ?? {};
  S.week = {
    done: w.done ?? {}, freq: w.freq ?? {},
    attendance: Object.fromEntries((w.attendance ?? []).map((a: any) => [a.date, a.status])),
    checkins: Object.fromEntries((w.checkins ?? []).map((c: any) => [c.date, { sleepH: c.sleep_h, energy: c.energy, soreness: c.soreness, stress: c.stress, food: c.food, weightKg: c.weight_kg }])),
    sessions: w.sessions ?? [],
  };
  S.pains = w.pains ?? []; S.inbox = w.inbox ?? [];
  S.history = st.history ?? {};
  S.media = Object.fromEntries((st.media ?? []).filter((m: any) => m.exercise_id).map((m: any) => [m.exercise_id, { kind: m.kind, note: m.note, url: `/api/media/${m.id}` }]));
  S.measures = st.measures ?? [];
  if (st.dayPlan && !S.ui.locked) { S.plan = st.dayPlan.plan; S.ui.locked = st.dayPlan.source !== "core"; S.ui.planSource = st.dayPlan.source; }
  const open = S.week.sessions.find((s: any) => s.date === today && !s.finished_at);
  if (open && (!S.session || S.session.id !== open.id)) S.session = { id: open.id, date: today, startedAt: open.started_at, plan: S.plan, logs: {}, skipped: {}, rest: null };
}

// dados fictícios da demonstração (seg Superior A, ter Inferior A, qua faltou)
export function seedDemo() {
  S.week.done = { peito: 6, costas: 7, ombro: 6, post: 2, biceps: 5, triceps: 4, quad: 6, isquio: 4, gluteo: 3, pant: 3, core: 2 };
  S.week.freq = Object.fromEntries(C.MUSCLE_IDS.map((m) => [m, 1]));
  S.week.attendance = { [dates[0]]: "fui", [dates[1]]: "fui", [dates[2]]: "nao_fui" };
  S.week.sessions = [{ date: dates[0], name: "Sup. A", groups: ["sup"] }, { date: dates[1], name: "Inf. A", groups: ["inf"] }];
  S.week.checkins = {
    [dates[0]]: { sleepH: 7, energy: 3, soreness: 0, stress: 2, food: 0, weightKg: 72.4 },
    [dates[1]]: { sleepH: 6, energy: 2, soreness: 1, stress: 2, food: 1, weightKg: 72.6 },
  };
  S.history = {
    Incline_Dumbbell_Curl: [{ kg: 12, reps: 12 }, { kg: 12, reps: 11 }, { kg: 12, reps: 10 }],
    Cable_Seated_Lateral_Raise: [{ kg: 5, reps: 16 }, { kg: 5, reps: 15 }, { kg: 5, reps: 14 }],
    Cable_Rope_Overhead_Triceps_Extension: [{ kg: 20, reps: 15 }, { kg: 20, reps: 15 }, { kg: 20, reps: 15 }],
    Incline_Dumbbell_Press: [{ kg: 24, reps: 10 }, { kg: 24, reps: 9 }],
    "Wide-Grip_Lat_Pulldown": [{ kg: 55, reps: 10 }, { kg: 55, reps: 9 }],
  };
  S.media = {
    Cable_Rope_Overhead_Triceps_Extension: { kind: "video", note: "Polia da esquerda, corda curta, pino 4", dur: "0:12" },
    Leg_Press: { kind: "foto", note: "Banco no furo 3 · pés no meio da plataforma" },
  };
  S.measures = [{ date: addDays(monday, -28), braco: 33.0, cintura: 79.0 }, { date: addDays(monday, -14), braco: 33.3, cintura: 79.1 }, { date: dates[0], braco: 33.6, cintura: 79.2 }];
  S.inbox = [{ id: "d1", created_at: Date.now() - 864e5, text: "Leg press estava ocupado na terça, troquei pelo Smith.", action: "trocar_exercicio", tier: "haiku", status: "aplicado",
    response: "Anotado. Deixei o Smith como 1ª alternativa quando o leg press estiver cheio (terças 19h)." }];
}
