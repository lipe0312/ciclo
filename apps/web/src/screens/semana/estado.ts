// Estado da semana planejada (#24). Servidor: /api/week (versões no D1). Demonstração: o mesmo core roda no navegador
// com dados fictícios e as versões ficam no localStorage. Hoje lê daqui o treino do dia e os dias que restam.
import * as C from "@ciclo/core";
import { S, commit, monday, today } from "../../lib/store/index.ts";
import { SERVER, api } from "../../lib/api/index.ts";
import { toast } from "../../lib/ui/index.tsx";
import { lsGet, lsSet } from "../../lib/util.ts";

export interface Versao { version: number; source: string; createdAt: number }
export type Dia = C.WeekDay & { status: C.DayStatus };
export interface Semana extends Omit<C.WeekView, "days"> {
  days: Dia[]; version: number; versions: Versao[];
  progression: { changes: C.VolumeChange[]; deload: { on: boolean; reason: string | null } };
}

const CACHE = `ciclo:v1:${SERVER ? "srv" : "demo"}:semana:${monday}`;
let semana: Semana | null = lsGet<Semana | null>(CACHE, null);
let vazio: string | null = null;
let carregando: Promise<void> | null = null;
export const getSemana = () => semana;
export const getVazio = () => vazio;
export const diaDe = (date: string) => semana?.days.find((d) => d.date === date) ?? null;

function set(s: Semana | null) {
  semana = s; if (s) lsSet(CACHE, s);
  sincronizarHoje(); commit();
}

/** Carrega uma vez por abertura do app (Hoje e Semana chamam). */
export function garantirSemana(force = false): Promise<void> {
  if (carregando && !force) return carregando;
  carregando = (async () => {
    await Promise.resolve(); // o efeito da tela roda antes de a casca assinar o commit
    try {
      if (!SERVER) return set(demo.ver());
      const r = await api<{ week: Semana | null; message?: string }>("GET", `/api/week?date=${today}`);
      vazio = r.week ? null : r.message ?? "Complete os Primeiros passos.";
      set(r.week);
    } catch (e) {
      if (!SERVER) { console.error("semana (demo)", e instanceof Error ? e.message : e); return; }
      if (!semana) toast("Sem conexão: a semana aparece quando voltar o sinal");
    }
  })();
  return carregando;
}

async function rodar(f: () => Promise<{ week: Semana | null }>, ok: string) {
  try { const r = await f(); if (r.week) set(r.week); toast(ok); return true; }
  catch (e: any) { toast(e?.status ? e.message : "Sem conexão: tente de novo com sinal"); return false; }
}

/** Ação num dia: gerar (trocar geração), mover, trocar, folga, treino, extra, manter (sem compensatório) ou falta. */
export const acaoDia = (date: string, body: { action: string; opts?: C.DayOpts; to?: string; resposta?: string }, ok = "Semana reorganizada") =>
  rodar(() => (SERVER ? api("POST", `/api/week/day/${date}`, { ...body, today }) : Promise.resolve(demo.acao(date, body))), ok);

export async function previaRegenerar(reset: boolean): Promise<C.DayDiff[] | null> {
  try { return SERVER ? (await api<{ diff: C.DayDiff[] }>("POST", "/api/week/regenerate", { date: today, reset })).diff : demo.regenerar(reset, false).diff; }
  catch (e: any) { toast(e?.status ? e.message : "Sem conexão"); return null; }
}
export const regenerar = (reset: boolean) =>
  rodar(() => (SERVER ? api("POST", "/api/week/regenerate", { date: today, reset, apply: true }) : Promise.resolve(demo.regenerar(reset, true))), "Semana regenerada");
export const desfazer = (version: number) =>
  rodar(() => (SERVER ? api("PUT", "/api/week", { date: today, version }) : Promise.resolve(demo.desfazer(version))), "Versão restaurada");

/** Hoje: dias que restam vêm da semana; o treino de hoje é o da semana (ou o extra), salvo se o Claude/você já fixou outro. */
export function sincronizarHoje() {
  const s = semana; if (!s) return;
  const d = s.days.find((x) => x.date === today); if (!d) return;
  S.ui.daysLeft = Math.max(1, s.days.filter((x) => x.date >= today && (x.status === "hoje" || x.status === "planejado")).length);
  const ui = S.ui as typeof S.ui & { semanaV?: string };
  const key = `${s.weekStart}:${s.version}`;
  if (ui.semanaV === key) return;
  ui.semanaV = key;
  if ((S.session && !S.session.finishedAt) || (S.ui.locked && S.ui.planSource !== "semana")) return;
  const plan = d.status === "hoje" ? d.plan : d.status === "livre" ? s.extraToday : null;
  if (!plan?.items.length) return;
  S.plan = plan; S.ui.locked = true; S.ui.planSource = "semana";
  if (d.gymId && S.gyms.some((g) => g.id === d.gymId)) S.ui.gymId = d.gymId;
  if (d.opts.minutes) S.ui.minutes = d.opts.minutes;
  if (d.opts.format) S.ui.format = d.opts.format;
}

// ---------- demonstração: mesmo core, dados fictícios, versões no navegador ----------
interface Stored { plan: C.WeekPlan; overrides: Record<string, C.DayOverride>; source: string; createdAt: number }
const demo = (() => {
  const KEY = `ciclo:v1:demo:semana-versoes:${monday}`;
  const ok = { sleepH: 8, energy: 3, soreness: 0, stress: 1 } as const;
  const prog = () => C.weekProgression({
    base: C.weeklyTargets(S.profile.level, S.profile.priorities), prevWeeks: [{ offsets: {} }], checkinsByWeek: [[ok, ok, ok, ok]],
    pump: { ombro: [0, 1], triceps: [1, 2], biceps: [2, 2] }, freq: Object.fromEntries(C.MUSCLE_IDS.map((m) => [m, 2])),
    e1rm: [
      { exerciseId: "Cable_Rope_Overhead_Triceps_Extension", muscle: "triceps", week: 1, value: 26 }, { exerciseId: "Cable_Rope_Overhead_Triceps_Extension", muscle: "triceps", week: 0, value: 28 },
      { exerciseId: "Cable_Seated_Lateral_Raise", muscle: "ombro", week: 1, value: 7 }, { exerciseId: "Cable_Seated_Lateral_Raise", muscle: "ombro", week: 0, value: 7.6 },
    ],
  });
  const input = (overrides: Record<string, C.DayOverride>, prev: C.WeekPlan | null): C.WeekInput => {
    const sets: Record<string, C.Sets> = {};
    for (const ses of S.week.sessions as { date: string; groups?: C.Group[] }[])
      for (const m of C.MUSCLE_IDS) if (ses.groups?.includes(C.MUSCLES[m].group) && S.week.done[m]) (sets[ses.date] ??= {})[m] = S.week.done[m];
    const p = S.profile;
    return {
      weekStart: monday, today, sets, attendance: S.week.attendance as C.WeekInput["attendance"],
      profile: { daysUsual: p.daysUsual, daysTarget: p.daysTarget, minutes: p.minutes, priorities: p.priorities, dayGym: p.dayGym,
        gyms: S.gyms.map((g) => ({ id: g.id, equipment: g.equipment })), prefs: p.prefs, pinned: p.pinned, avoid: p.avoid,
        pains: S.pains.map((x) => ({ region: x.region, intensity: x.intensity })), goalId: S.profile.goal?.id ?? null },
      targets: prog().targets, overrides, prev, cardioLog: S.week.cardio,
    };
  };
  const load = () => lsGet<Stored[]>(KEY, []);
  const push = (plan: C.WeekPlan, overrides: Record<string, C.DayOverride>, source: string) => {
    const vs = load().concat({ plan, overrides, source, createdAt: Date.now() }).slice(-20);
    lsSet(KEY, vs); return vs;
  };
  const ver = (): Semana => {
    let vs = load();
    if (!vs.length) vs = push(C.planWeek(input({}, null)), {}, "auto");
    const cur = vs[vs.length - 1];
    const v = C.weekView(input(cur.overrides, null), cur.plan);
    const p = prog();
    return { ...v, version: vs.length, versions: vs.map((x, i) => ({ version: i + 1, source: x.source, createdAt: x.createdAt })).reverse(), progression: { changes: p.changes, deload: p.deload } };
  };
  const cur = () => { if (!load().length) ver(); const vs = load(); return vs[vs.length - 1]; };
  return {
    ver,
    acao(date: string, b: { action: string; opts?: C.DayOpts; to?: string; resposta?: string }) {
      const c = cur();
      let ov = c.overrides;
      if (b.action === "falta") { S.week.attendance[date] = b.resposta!; }
      else {
        const r = C.applyDayAction(c.plan, c.overrides, { type: b.action, date, opts: b.opts ?? {}, geracao: b.opts ?? {}, to: b.to } as C.DayAction, input(c.overrides, c.plan));
        if ("error" in r) throw Object.assign(new Error(r.error), { status: 409 });
        ov = r.overrides;
      }
      push(C.planWeek(input(ov, c.plan)), ov, b.action === "falta" ? "falta" : "ajuste");
      return { week: ver() };
    },
    regenerar(reset: boolean, apply: boolean) {
      const c = cur();
      const ov = reset ? Object.fromEntries(Object.entries(c.overrides).filter(([d]) => d < today)) : c.overrides;
      const plan = C.planWeek(input(ov, c.plan));
      const diff = C.diffWeeks(c.plan, plan);
      if (apply) push(plan, ov, "regenerar");
      return { diff, week: apply ? ver() : null };
    },
    desfazer(version: number) {
      const vs = load(), x = vs[version - 1];
      if (!x) throw Object.assign(new Error("versão não encontrada"), { status: 404 });
      push(x.plan, x.overrides, "desfazer");
      return { week: ver() };
    },
  };
})();
