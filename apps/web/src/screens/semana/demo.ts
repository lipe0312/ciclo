// Semana na demonstração (#24): o mesmo core roda no navegador com dados fictícios e as versões ficam no localStorage.
// #82 módulo à parte: só baixa no ?demo (o servidor gera a semana), então planWeek/weekView ficam fora do JS inicial.
import * as C from "@ciclo/core";
import { S, calc, monday, today } from "../../lib/store/index.ts";
import { lsGet, lsSet } from "../../lib/util.ts";
import type { Semana } from "./estado.ts";

interface Stored { plan: C.WeekPlan; overrides: Record<string, C.DayOverride>; source: string; createdAt: number; fixed?: C.WeekInput["fixed"] }
export const demo = (() => {
  const KEY = `ciclo:v1:demo:semana-versoes:${monday}`;
  const ok = { sleepH: 8, energy: 3, soreness: 0, stress: 1 } as const;
  const prog = () => C.weekProgression({
    base: C.weeklyTargets(calc().level, S.profile.priorities), prevWeeks: [{ offsets: {} }], checkinsByWeek: [[ok, ok, ok, ok]],
    pump: { ombro: [0, 1], triceps: [1, 2], biceps: [2, 2] }, freq: Object.fromEntries(C.MUSCLE_IDS.map((m) => [m, 2])),
    e1rm: [
      { exerciseId: "Cable_Rope_Overhead_Triceps_Extension", muscle: "triceps", week: 1, value: 26 }, { exerciseId: "Cable_Rope_Overhead_Triceps_Extension", muscle: "triceps", week: 0, value: 28 },
      { exerciseId: "Cable_Seated_Lateral_Raise", muscle: "ombro", week: 1, value: 7 }, { exerciseId: "Cable_Seated_Lateral_Raise", muscle: "ombro", week: 0, value: 7.6 },
    ],
  });
  const input = (overrides: Record<string, C.DayOverride>, prev: C.WeekPlan | null, fixed: C.WeekInput["fixed"] = load().at(-1)?.fixed): C.WeekInput => {
    const sets: Record<string, C.Sets> = {};
    for (const ses of S.week.sessions as { date: string; groups?: C.Group[] }[])
      for (const m of C.MUSCLE_IDS) if (ses.groups?.includes(C.MUSCLES[m].group) && S.week.done[m]) (sets[ses.date] ??= {})[m] = S.week.done[m];
    const p = calc();
    return {
      weekStart: monday, today, sets, attendance: S.week.attendance as C.WeekInput["attendance"],
      profile: { daysUsual: p.daysUsual, daysTarget: p.daysTarget, minutes: p.minutes, priorities: p.priorities, dayGym: p.dayGym,
        gyms: S.gyms.map((g) => ({ id: g.id, equipment: g.equipment })), prefs: p.prefs, pinned: p.pinned, avoid: p.avoid,
        pains: S.pains.map((x) => ({ region: x.region, intensity: x.intensity })), goalId: S.profile.goal?.id ?? null,
        ...C.entradaTreinoAtual(S.profile), formato: C.formatoDe(S.profile.dynamics) },
      targets: prog().targets, overrides, prev, cardioLog: S.week.cardio, fixed,
    };
  };
  const load = () => lsGet<Stored[]>(KEY, []);
  /** #121 o salvo dos dias substituídos sai (o algoritmo gera esses dias de novo) */
  const semSalvos = (fixed: C.WeekInput["fixed"], datas: string[]) => (fixed && datas.length ? Object.fromEntries(Object.entries(fixed).filter(([d]) => !datas.includes(d))) : fixed);
  const push = (plan: C.WeekPlan, overrides: Record<string, C.DayOverride>, source: string, fixed = load().at(-1)?.fixed) => {
    const vs = load().concat({ plan, overrides, source, createdAt: Date.now(), fixed }).slice(-20);
    lsSet(KEY, vs); return vs;
  };
  /** Dia gerado pelo app (o mesmo gerador do servidor), com "revisão da IA pendente". */
  // #108 o gerador (e a régua de #65) só carrega no toque do "Gerar treino": fora do JS inicial
  const diaGerado = async (date: string): Promise<C.DayPlan | null> => {
    const G = await import("@ciclo/core/treino-gerado");
    const p = calc(), dow = C.DOWS[(new Date(date + "T12:00:00Z").getUTCDay() + 6) % 7];
    const gym = S.gyms.find((g) => g.id === p.dayGym?.[dow]) ?? S.gyms[0];
    const g = G.gerarTreinoDia({ sexo: S.profile.sex ?? null, nivel: p.level, prioridades: p.priorities, equipamentos: gym?.equipment ?? [], dias: p.daysUsual, diasMeta: p.daysTarget,
      minutos: p.minutes, dores: S.pains.map((x) => ({ region: x.region, intensity: x.intensity })), evitar: p.avoid, prefs: p.prefs, pinned: p.pinned }, dow);
    return g ? G.planoDoDiaGerado(g.dia, "pendente") : null;
  };
  /** #108 demonstração: o 1º dia de folga depois de hoje já vem com um treino gerado, revisão da IA pendente. */
  const semear = async () => {
    if (load().length) return;
    const base = C.planWeek(input({}, null, undefined));
    const sab = base.days.find((d) => d.kind === "folga" && d.date > today)?.date;
    const plan = sab ? await diaGerado(sab) : null;
    if (load().length) return;
    const fixed = sab && plan ? { [sab]: { plan, source: "claude" as const } } : undefined;
    push(fixed ? C.planWeek(input({}, null, fixed)) : base, {}, "auto", fixed);
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
      let fixed = c.fixed;
      if (b.action !== "falta") {
        const r = C.applyDayAction(c.plan, c.overrides, { type: b.action, date, opts: b.opts ?? {}, geracao: b.opts ?? {}, to: b.to } as C.DayAction, input(c.overrides, c.plan));
        if ("error" in r) throw Object.assign(new Error(r.error), { status: 409 });
        ov = r.overrides;
        // #121 gerar o dia de novo substitui o treino salvo nele (como no servidor)
        if (b.action === "gerar" || b.action === "outro") fixed = semSalvos(fixed, C.salvosSubstituidos({ tipo: "dia", date }, fixed ?? {}, input(ov, c.plan), { manual: true }));
      }
      push(C.planWeek(input(ov, c.plan, fixed)), ov, b.action === "falta" ? "falta" : "ajuste", fixed);
      return { week: ver() };
    },
    semear,
    async gerarTreino(date: string) {
      const c = cur(), plan = await diaGerado(date);
      if (!plan) throw Object.assign(new Error("Não deu para montar um treino válido"), { status: 409 });
      const fixed = { ...(c.fixed ?? {}), [date]: { plan, source: "claude" as const } };
      push(C.planWeek(input(c.overrides, c.plan, fixed)), c.overrides, "ajuste", fixed);
      return { week: ver() };
    },
    empurrar(apply: boolean) {
      const c = cur();
      const r = C.empurrarTreinos(input(c.overrides, c.plan, c.fixed), c.plan);
      if ("error" in r) throw Object.assign(new Error(r.error), { status: 409 });
      if (apply) push(r.plan, r.overrides, "ajuste", r.fixed);
      return { moves: r.moves, diff: r.diff, week: apply ? ver() : null };
    },
    regenerar(reset: boolean, apply: boolean) {
      const c = cur();
      const ov = reset ? Object.fromEntries(Object.entries(c.overrides).filter(([d]) => d < today)) : c.overrides;
      const fixed = semSalvos(c.fixed, C.salvosSubstituidos({ tipo: "semana" }, c.fixed ?? {}, input(ov, c.plan), { manual: reset }));
      const plan = C.planWeek(input(ov, c.plan, fixed));
      const diff = C.diffWeeks(c.plan, plan);
      if (apply) push(plan, ov, "regenerar", fixed);
      return { diff, week: apply ? ver() : null };
    },
  };
})();
