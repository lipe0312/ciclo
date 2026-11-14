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

/** O perfil padrão e a validação vivem no core (o servidor usa a mesma regra). */
export const DEFAULT_PROFILE = C.DEFAULT_PROFILE;
export type Profile = typeof DEFAULT_PROFILE;
export interface Gym { id: string; name: string; equipment: string[]; busyHours: string[]; kind?: C.PlaceKind; address?: string | null; lat?: number | null; lng?: number | null }
/** Foto/vídeo da regulagem de um aparelho de um lugar (#26). `url` só existe depois de enviada (ou no demo, em memória). */
export interface GymMedia { id: string; kind: "foto" | "video"; equipmentId: string; gymId: string; note: string | null; url?: string }
export const DEFAULT_GYMS: Gym[] = [
  { id: "acad1", name: "Academia 1", kind: "academia", equipment: C.EQUIPMENT.map((e) => e.id).filter((e) => !["hack", "kettle", "scott", "roscamaq", "tricmaq", "pantsent"].includes(e)), busyHours: ["18-20"] },
  { id: "acad2", name: "Academia 2", kind: "academia", equipment: ["halteres", "banco", "polia", "puxador", "legpress", "extensora", "flexora", "barrafixa"], busyHours: [] },
  { id: "casa", name: "Casa", kind: "casa", equipment: ["halteres", "elastico", "barrafixa"], busyHours: [] },
];

export const S = {
  profile: clone(DEFAULT_PROFILE), gyms: clone(DEFAULT_GYMS),
  week: { done: {} as Record<string, number>, freq: {} as Record<string, number>, attendance: {} as Record<string, string>, checkins: {} as Record<string, any>, sessions: [] as any[],
    /** cardio da semana (resumo: C.cardioWeekSummary) */ cardio: [] as C.CardioEntry[] },
  pains: [] as any[], inbox: [] as any[], food: [] as any[], media: {} as Record<string, any>, gymMedia: [] as GymMedia[], history: {} as Record<string, C.SetLog[]>,
  /** últimas sessões de cada exercício (mais recente primeiro): médias, "última vez" e melhor marca do modo treino */
  past: {} as Record<string, C.SetLog[][]>, measures: [] as any[], edits: [] as any[],
  features: { ai: false, media: false } as Record<string, boolean>,
  /** campos de outras frentes (contas multiusuário); opcionais */
  account: null as any, onboarding: null as any,
  plan: null as C.DayPlan | null, session: null as any,
  ui: {
    daysLeft: 1, minutes: 60, gymId: null as string | null, focus: [] as C.MuscleId[], crowded: false, mode: "normal" as C.Mode, format: "tradicional",
    swapsToday: {} as Record<string, string>, locked: false, planSource: undefined as string | undefined, minutesSet: false,
    ckDate: today, ckDraft: null as any, perfilSec: null as string | null, cat: "todos", gymTab: "acad1", bodyView: "frente", promptCat: "Hoje",
    tierOverride: null as string | null, planFp: null as string | null, inboxDraft: "", foodDraft: "", editDraft: null as any, fb: null as any,
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
  const keep: Record<string, unknown> = { ui: { ...S.ui, perfilSec: null }, session: S.session, plan: S.ui.locked ? S.plan : null, past: S.past };
  if (!SERVER) Object.assign(keep, { profile: S.profile, gyms: S.gyms, week: S.week, pains: S.pains, inbox: S.inbox, food: S.food, media: S.media, measures: S.measures, edits: S.edits, history: S.history });
  lsSet(key(), keep);
}
export function loadLocal() {
  const v = lsGet<Record<string, any> | null>(key(), null);
  if (!v) return false;
  for (const k of Object.keys(v)) if (v[k] != null) (S as any)[k] = k === "ui" ? { ...S.ui, ...v.ui } : k === "profile" ? { ...clone(DEFAULT_PROFILE), ...v.profile } : v[k];
  S.week.cardio ??= []; // cópias salvas antes do cardio não têm o campo
  return true;
}

// ---------- servidor ----------
export async function loadServer() {
  const st = await api("GET", `/api/state?date=${today}`);
  // #62: conta nova = vazia. Sem perfil salvo, nada vem marcado (objetivo, prioridades, dias, lugares) e não há academia de exemplo.
  const vazio = !st.profile || !Object.keys(st.profile).length;
  S.profile = { ...(vazio ? C.perfilContaNova(st.account ?? {}, today) : clone(DEFAULT_PROFILE)), ...(st.profile ?? {}) };
  S.gyms = st.gyms ?? [];
  S.features = st.features ?? S.features;
  S.account = st.account ?? null; S.onboarding = st.onboarding ?? null;
  const w = st.week ?? {};
  S.week = {
    done: w.done ?? {}, freq: w.freq ?? {},
    attendance: Object.fromEntries((w.attendance ?? []).map((a: any) => [a.date, a.status])),
    checkins: Object.fromEntries((w.checkins ?? []).map((c: any) => [c.date, { sleepH: c.sleep_h, energy: c.energy, soreness: c.soreness, stress: c.stress, food: c.food, weightKg: c.weight_kg }])),
    sessions: w.sessions ?? [], cardio: w.cardio ?? [],
  };
  S.pains = w.pains ?? []; S.inbox = w.inbox ?? [];
  S.history = st.history ?? {};
  S.media = Object.fromEntries((st.media ?? []).filter((m: any) => m.exercise_id && !m.gym_id).map((m: any) => [m.exercise_id, { kind: m.kind, note: m.note, url: `/api/media/${m.id}` }]));
  S.gymMedia = (st.media ?? []).filter((m: any) => m.gym_id && m.equipment_id).map((m: any) => ({ id: m.id, kind: m.kind, equipmentId: m.equipment_id, gymId: m.gym_id, note: m.note, url: `/api/media/${m.id}` }));
  S.measures = st.measures ?? [];
  if (st.dayPlan && !S.ui.locked) { S.plan = st.dayPlan.plan; S.ui.locked = st.dayPlan.source !== "core"; S.ui.planSource = st.dayPlan.source; S.ui.planFp = st.dayPlan.profileFp ?? null; }
  const open = S.week.sessions.find((s: any) => s.date === today && !s.finished_at);
  if (open) await restoreSession(open.id);
}

/** Sessão aberta no servidor → estado local. Sem cópia local (outro aparelho/dados limpos) monta tudo do servidor; com cópia, só completa
 *  o que faltar (o que está no aparelho e ainda não foi concluído vence; o descanso local também). */
async function restoreSession(id: string) {
  let r: any = null;
  try { r = await api("GET", `/api/sessions/${encodeURIComponent(id)}`); } catch { /* offline: segue com a cópia local */ }
  const local = S.session && S.session.id === id ? S.session : null;
  if (!r) { if (!local) S.session = null; return; }
  if (r.finishedAt) { if (local && !local.finishedAt) { local.finishedAt = r.finishedAt; local.closedBy = r.closedBy ?? "auto"; local.rest = null; } return; }
  const logs = C.mergeSessionSets(local?.logs ?? {}, r.sets ?? []);
  const skipped = { ...Object.fromEntries((r.skips ?? []).map((k: any) => [k.exerciseId, k.reason])), ...(local?.skipped ?? {}) };
  const rest = local?.rest ?? (r.rest && r.rest.until > Date.now() ? { until: r.rest.until, fired: false } : null);
  S.session = { ...(local ?? {}), id, date: r.date, startedAt: r.startedAt, finishedAt: null, plan: local?.plan ?? r.plan, logs, skipped, rest, gymId: r.gymId ?? local?.gymId, format: local?.format ?? S.ui.format, cur: local?.cur ?? 0 };
}

// dados fictícios da demonstração (seg Superior A, ter Inferior A; qua era treino e ficou sem resposta → aviso de falta)
export function seedDemo() {
  S.profile.daysUsual = ["seg", "ter", "qua", "qui", "sex"]; S.profile.daysTarget = 5;
  S.week.done = { peito: 6, costas: 7, ombro: 6, post: 2, biceps: 5, triceps: 4, quad: 6, isquio: 4, gluteo: 3, pant: 3, core: 2 };
  S.week.freq = Object.fromEntries(C.MUSCLE_IDS.map((m) => [m, 1]));
  S.week.attendance = { [dates[0]]: "fui", [dates[1]]: "fui" };
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
  S.gymMedia = [
    { id: "dm1", kind: "video", equipmentId: "polia", gymId: "acad1", note: "Polia da esquerda, corda curta, pino 4" },
    { id: "dm2", kind: "foto", equipmentId: "legpress", gymId: "acad1", note: "Banco no furo 3 · pés no meio da plataforma" },
  ];
  S.week.cardio = [
    { id: "c1", date: dates[0], type: "Running_Treadmill", minutes: 25, intensity: "zona2", distanceKm: 3.4 },
    { id: "c2", date: dates[1], type: "Bicycling_Stationary", minutes: 20, intensity: "moderado", distanceKm: null },
  ];
  S.past = {
    Incline_Dumbbell_Curl: [[{ kg: 12, reps: 12 }, { kg: 12, reps: 11 }, { kg: 12, reps: 10 }], [{ kg: 10, reps: 12 }, { kg: 10, reps: 12 }, { kg: 10, reps: 11 }], [{ kg: 10, reps: 10 }, { kg: 10, reps: 10 }, { kg: 10, reps: 9 }]],
    Cable_Seated_Lateral_Raise: [[{ kg: 5, reps: 16 }, { kg: 5, reps: 15 }, { kg: 5, reps: 14 }], [{ kg: 5, reps: 14 }, { kg: 5, reps: 13 }, { kg: 5, reps: 12 }]],
    Incline_Dumbbell_Press: [[{ kg: 24, reps: 10 }, { kg: 24, reps: 9 }], [{ kg: 22, reps: 10 }, { kg: 22, reps: 10 }]],
  };
  S.measures = [{ date: addDays(monday, -28), braco: 33.0, cintura: 79.0 }, { date: addDays(monday, -14), braco: 33.3, cintura: 79.1 }, { date: dates[0], braco: 33.6, cintura: 79.2 }];
  S.inbox = [{ id: "d1", created_at: Date.now() - 864e5, text: "Leg press estava ocupado na terça, troquei pelo Smith.", action: "trocar_exercicio", tier: "haiku", status: "aplicado",
    response: "Anotado. Deixei o Smith como 1ª alternativa quando o leg press estiver cheio (terças 19h)." }];
}
