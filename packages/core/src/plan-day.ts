// Semana flexível: a semana é um orçamento de séries por músculo.
// planDay monta a sessão de HOJE a partir do que falta, dos dias restantes, do tempo,
// da academia ativa, das preferências e do mapa de dor. Função pura e determinística.

import { EXERCISES, EXERCISE_BY_ID, EQUIPMENT_BY_ID, MUSCLES, MUSCLE_IDS, REGION_BY_ID } from "./catalog.ts";
import type { Exercise, Group, Joint, Kind, MuscleId } from "./catalog.ts";

export type Mode = "normal" | "compensatorio" | "expresso";
export type Pref = "livre" | "maquina" | "cabo" | "tanto_faz";
export interface Pain { region: string; intensity: 1 | 2 | 3 }

export interface DayInput {
  targets: Partial<Record<MuscleId, number>>;   // alvo semanal (séries)
  done: Partial<Record<MuscleId, number>>;      // feito na semana
  freq: Partial<Record<MuscleId, number>>;      // nº de sessões que já pegaram o músculo
  priorities: MuscleId[];                       // ordem importa
  daysLeft: number;                             // contando hoje
  minutes: number;
  lastGroup: Group | "full" | null;
  mode: Mode;                                   // compensatório/expresso só quando pedido
  focus?: MuscleId[] | null;                    // "hoje quero ombro"
  equipment: string[];                          // da academia ativa
  crowded?: boolean;                            // academia cheia
  prefs?: Partial<Record<MuscleId, Pref>>;
  pains?: Pain[];
  pinned?: Partial<Record<MuscleId, string>>;   // exercício preferido (troca "sempre")
  avoid?: string[];                             // exercícios que não quer
  /** Semana planejada (#24): divisão fixa do dia, dias restantes por grupo, músculos fora (48 h) e teto por músculo. */
  split?: "sup" | "inf" | "full" | null;
  groupDaysLeft?: Partial<Record<Group, number>>;
  exclude?: MuscleId[];
  maxPerMuscle?: Partial<Record<MuscleId, number>>;
  /** "Gerar outro treino" (#44): estilo do dia (peso livre ou máquina), mais leve hoje e o músculo a adiantar. */
  estilo?: "livre" | "maquina" | null;
  leve?: boolean;
  adiantar?: MuscleId | null;
}

export interface PlanItem {
  exerciseId: string; nm: string; muscle: MuscleId; kind: Kind;
  sets: number; reps: [number, number]; rest: number; alts: string[];
  prehab?: boolean; manual?: boolean;
  /** repetições em reserva pedidas (só no "mais leve hoje": 3); sem o campo vale o padrão de sobrar 1–2 */
  rir?: number;
}
export interface DayPlan {
  name: string; mode: Mode; groups: Group[]; items: PlanItem[]; prehab: PlanItem[];
  why: string[]; dropped: MuscleId[]; missing: { muscle: MuscleId; reason: "aparelho" | "dor" }[];
  cap: number; setsTotal: number; estMinutes: number; weekClosePct: number;
  suggestCompensatory: boolean; perMuscle: Partial<Record<MuscleId, number>>;
  /** gerado como "mais leve hoje" */
  leve?: boolean;
}

const MIN_PER_SET = 3;
/** Repetições em reserva no "mais leve hoje" (o normal é sobrar 1–2). */
export const LEVE_RIR = 3;
/** Fortalecimento por região (ordem = preferência). Não é tratamento: dor persistente → profissional. */
export const PREHAB: Partial<Record<Joint, string[]>> = {
  escapula: ["Face_Pull", "Band_Pull_Apart", "Scapular_Pull-Up", "Dumbbell_Scaption"],
  ombro: ["External_Rotation_with_Band", "Face_Pull", "Band_Pull_Apart"],
  cervical: ["Face_Pull", "Band_Pull_Apart"],
  lombar: ["Dead_Bug", "Butt_Lift_Bridge", "Plank"],
  quadril: ["Butt_Lift_Bridge", "Dead_Bug"],
  joelho: ["Butt_Lift_Bridge"],
};
const n = (v: number | undefined) => v ?? 0;

/** Exercício é permitido com estas dores? intensidade 3 bloqueia qualquer estresse; 1 só o alto. */
export function painBlocks(ex: Exercise, pains: Pain[]): boolean {
  for (const p of pains) {
    const j = REGION_BY_ID[p.region]?.joint as Joint | undefined;
    if (!j) continue;
    const s = ex.joints[j] ?? 0;
    if (s > 0 && s >= 4 - p.intensity) return true;
  }
  return false;
}

export function candidates(m: MuscleId, inp: Pick<DayInput, "equipment" | "crowded" | "prefs" | "pains" | "pinned" | "avoid" | "estilo">): { ex: Exercise; score: number; blockedByPain: boolean }[] {
  const eq = new Set(inp.equipment);
  const pref = inp.prefs?.[m];
  const out: { ex: Exercise; score: number; blockedByPain: boolean }[] = [];
  EXERCISES.forEach((ex, idx) => {
    if (ex.m !== m || ex.id === "Scapular_Pull-Up" || ex.planOff) return; // só aquecimento / acessório
    if (!ex.eq.every((q) => eq.has(q))) return;
    if (inp.avoid?.includes(ex.id)) return;
    const blockedByPain = painBlocks(ex, inp.pains ?? []);
    let score = 10 - idx * 0.01; // ordem do catálogo desempata
    if (inp.pinned?.[m] === ex.id) score += 5;
    if (pref && pref !== "tanto_faz") score += ex.kind === pref ? 2 : -1;
    if (inp.estilo) score += ex.kind === inp.estilo ? 3 : -2; // o pedido do dia vale mais que a preferência do perfil
    if (ex.stretch) score += 1;
    if (inp.crowded) score -= 1.5 * ex.eq.reduce((s, q) => s + (EQUIPMENT_BY_ID[q]?.busy ?? 0), 0);
    if (ex.prehab) score -= 1.5; // prehab não é a 1ª escolha para hipertrofia
    out.push({ ex, score, blockedByPain });
  });
  return out.sort((a, b) => b.score - a.score);
}

export function planDay(inp: DayInput): DayPlan {
  const why: string[] = [];
  const focus = inp.focus?.length ? inp.focus : null;
  const pains = inp.pains ?? [];
  const daysLeft = Math.max(1, Math.min(7, Math.round(inp.daysLeft)));

  // 1. grupos de hoje
  let groups: Group[];
  if (inp.mode === "compensatorio" || inp.mode === "expresso") groups = ["sup", "inf"];
  else if (focus) groups = [...new Set(focus.map((m) => MUSCLES[m].group))];
  else if (inp.split) groups = inp.split === "full" ? ["sup", "inf"] : [inp.split];
  else groups = [inp.lastGroup === "sup" ? "inf" : "sup"];

  let muscles = MUSCLE_IDS.filter((m) => groups.includes(MUSCLES[m].group) && !inp.exclude?.includes(m));
  if (inp.mode === "expresso") muscles = muscles.filter((m) => inp.priorities.includes(m) || focus?.includes(m));
  const isPrio = (m: MuscleId) => inp.priorities.includes(m) || !!focus?.includes(m);

  // dias restantes que vão treinar este grupo (contando hoje)
  const sameGroupDays = inp.mode === "normal" && groups.length === 1 && !focus ? Math.max(1, Math.ceil(daysLeft / 2)) : 1;
  const caps = inp.mode === "compensatorio" ? { p: 5, o: 3 } : inp.mode === "expresso" ? { p: 4, o: 3 } : { p: 6, o: 4 };

  // 2. séries por músculo
  type A = { m: MuscleId; sets: number; deficit: number; lvl: 0 | 1 | 2 };
  let alloc: A[] = [];
  for (const m of muscles) {
    const target = n(inp.targets[m]);
    const deficit = Math.max(0, target - n(inp.done[m]));
    const lowFreq = n(inp.freq[m]) < 2;
    const gdl = inp.mode === "normal" ? inp.groupDaysLeft?.[MUSCLES[m].group] : undefined;
    let sets = Math.ceil(deficit / Math.max(1, gdl ?? sameGroupDays));
    if (focus?.includes(m)) sets = Math.max(sets, 4);
    if (lowFreq && target > 0) sets = Math.max(sets, 2);
    sets = Math.min(sets, isPrio(m) ? caps.p : caps.o);
    // adiantar: +2 séries do que falta na semana (nunca passa do déficit, então nada dobra)
    const adiant = inp.adiantar === m && deficit > sets;
    if (adiant) sets = Math.min(deficit, sets + 2);

    const max = inp.maxPerMuscle?.[m];
    if (max != null) sets = Math.min(sets, Math.max(0, max));
    if (sets > 0) alloc.push({ m, sets, deficit, lvl: focus?.includes(m) || adiant ? 2 : inp.priorities.includes(m) ? 1 : 0 });
  }

  // 3. prehab pelas dores (reserva ~2 min por série)
  const prehab: PlanItem[] = [];
  const seenPrehab = new Set<string>();
  for (const p of [...pains].sort((a, b) => b.intensity - a.intensity)) {
    const joint = REGION_BY_ID[p.region]?.joint as Joint | undefined;
    const ex = (joint ? PREHAB[joint] ?? [] : []).map((id) => EXERCISE_BY_ID[id])
      .find((e) => e && !seenPrehab.has(e.id) && e.eq.every((q) => inp.equipment.includes(q)) && !painBlocks(e, pains));
    if (ex && prehab.length < 2) {
      seenPrehab.add(ex.id);
      prehab.push(item(ex, 2, [], { prehab: true }));
    }
  }
  if (prehab.length) why.push(`Aquecimento de fortalecimento pela dor marcada (${pains.map((p) => REGION_BY_ID[p.region]?.nm).join(", ")}).`);

  // 4. cabe no tempo?
  const prehabMin = prehab.reduce((s, i) => s + i.sets * 2, 0);
  const cap = Math.max(4, Math.floor((inp.minutes - prehabMin) / MIN_PER_SET));
  const total = () => alloc.reduce((s, a) => s + a.sets, 0);
  // corta em camadas: demais até 2 → prioridades até 3 → foco até 4; depois remove demais de menor déficit
  const floors = [2, 3, 4];
  for (let lvl = 0; lvl <= 2 && total() > cap; lvl++) {
    while (total() > cap) {
      const a = alloc.filter((x) => x.lvl === lvl && x.sets > floors[lvl]).sort((x, y) => x.deficit - y.deficit || y.sets - x.sets)[0];
      if (!a) break;
      a.sets--;
    }
  }
  const dropped: MuscleId[] = [];
  while (total() > cap) {
    const victim = alloc.filter((a) => a.lvl === 0).sort((a, b) => a.deficit - b.deficit)[0];
    if (victim) { dropped.push(victim.m); alloc = alloc.filter((a) => a !== victim); continue; }
    const shrink = alloc.filter((a) => a.sets > 2).sort((a, b) => a.lvl - b.lvl || a.deficit - b.deficit)[0];
    if (!shrink) break;
    shrink.sets--;
  }

  // mais leve: ~30% menos séries (depois do corte por tempo), sem tirar o músculo do dia: o 2× da semana continua valendo
  if (inp.leve) for (const a of alloc) a.sets = Math.max(Math.min(a.sets, 2), Math.round(a.sets * 0.7));

  // 5. ordem: foco → prioridades (na ordem) → mais cansativo primeiro
  const prioRank = (m: MuscleId) => focus?.includes(m) ? -10 + focus.indexOf(m) : inp.priorities.includes(m) ? inp.priorities.indexOf(m) : 50;
  alloc.sort((a, b) => prioRank(a.m) - prioRank(b.m));

  // 6. escolher exercícios
  const items: PlanItem[] = [];
  const missing: DayPlan["missing"] = [];
  for (const a of alloc) {
    const all = candidates(a.m, inp);
    const ok = all.filter((c) => !c.blockedByPain);
    if (!ok.length) { missing.push({ muscle: a.m, reason: all.length ? "dor" : "aparelho" }); continue; }
    const alts = (skip: string[]) => ok.filter((c) => !skip.includes(c.ex.id)).slice(0, 3).map((c) => c.ex.id);
    const first = ok[0].ex;
    if (a.sets >= 5 && ok.length > 1) {
      const second = ok.find((c) => c.ex.kind !== first.kind)?.ex ?? ok[1].ex;
      const s1 = Math.ceil(a.sets / 2);
      items.push(item(first, s1, alts([first.id, second.id])));
      items.push(item(second, a.sets - s1, alts([first.id, second.id])));
    } else items.push(item(first, a.sets, alts([first.id])));
  }
  if (inp.leve) for (const i of items) i.rir = LEVE_RIR;
  const nonPrehabItems = items.filter((i) => !i.prehab);
  nonPrehabItems.sort((a, b) => {
    const r = prioRank(a.muscle) - prioRank(b.muscle);
    return r !== 0 ? r : (EXERCISE_BY_ID[b.exerciseId]?.fat ?? 1) - (EXERCISE_BY_ID[a.exerciseId]?.fat ?? 1);
  });

  // 7. resumo
  const perMuscle: Partial<Record<MuscleId, number>> = {};
  for (const i of nonPrehabItems) perMuscle[i.muscle] = n(perMuscle[i.muscle]) + i.sets;
  let tgt = 0, proj = 0;
  for (const m of MUSCLE_IDS) { const t = n(inp.targets[m]); tgt += t; proj += Math.min(t, n(inp.done[m]) + n(perMuscle[m])); }
  const setsTotal = nonPrehabItems.reduce((s, i) => s + i.sets, 0);

  const other: Group | null = groups.length === 1 ? (groups[0] === "sup" ? "inf" : "sup") : null;
  const suggestCompensatory = inp.mode === "normal" && daysLeft === 1 && !!other &&
    MUSCLE_IDS.some((m) => MUSCLES[m].group === other && n(inp.targets[m]) > 0 && n(inp.freq[m]) < 2);

  const name = inp.mode === "compensatorio" ? "Corpo inteiro compensatório"
    : inp.mode === "expresso" ? "Expresso · só prioridades"
    : focus ? `Foco: ${focus.map((m) => MUSCLES[m].nm.toLowerCase()).join(" + ")}`
    : groups.length === 2 ? "Corpo inteiro"
    : groups[0] === "sup" ? (inp.priorities.some((m) => m === "biceps" || m === "triceps") ? "Superior · ênfase em braços" : "Superior")
    : "Inferior";

  if (inp.mode === "compensatorio") why.push(`Você pediu um treino compensatório: junta o que faltou dos dois grupos em uma sessão, prioridades primeiro.`);
  else if (inp.mode === "expresso") why.push(`Expresso: só as prioridades, para não zerar a semana num dia corrido.`);
  else if (focus) why.push(`Você escolheu focar em ${focus.map((m) => MUSCLES[m].nm.toLowerCase()).join(" e ")} hoje; o resto da semana se reorganiza.`);
  else why.push(daysLeft === 1 ? `Último dia da semana: segue o próximo treino (${name.toLowerCase()}).` : `Restam ${daysLeft} dias: hoje ${name.toLowerCase()}, o volume que falta é dividido entre os dias do mesmo grupo.`);
  if (inp.crowded) why.push("Academia cheia: preferi halteres e aparelhos que costumam estar livres.");
  if (inp.estilo) why.push(inp.estilo === "livre" ? "Você pediu mais peso livre hoje." : "Você pediu mais máquina hoje.");
  if (inp.leve) why.push(`Mais leve hoje: menos séries e sobrando ${LEVE_RIR} repetições; todo músculo continua no dia, então a semana não perde o 2×.`);
  if (inp.adiantar && alloc.some((a) => a.m === inp.adiantar)) why.push(`Adiantando ${MUSCLES[inp.adiantar].nm.toLowerCase()}: séries que seriam de outro dia, sem passar do que falta na semana.`);
  if (dropped.length) why.push(`Não coube no tempo: ${dropped.map((m) => MUSCLES[m].nm).join(", ")}.`);
  if (missing.length) why.push(`Sem opção hoje: ${missing.map((x) => `${MUSCLES[x.muscle].nm} (${x.reason})`).join(", ")}.`);
  if (suggestCompensatory) why.push("Sobrou só hoje e o outro grupo ainda não teve 2×: dá para pedir um compensatório.");

  return {
    name, mode: inp.mode, groups, items: nonPrehabItems, prehab, why, dropped, missing, cap,
    setsTotal, estMinutes: setsTotal * MIN_PER_SET + prehabMin, ...(inp.leve ? { leve: true } : {}),
    weekClosePct: tgt ? Math.round((proj / tgt) * 100) : 0, suggestCompensatory, perMuscle,
  };
}

export function item(ex: Exercise, sets: number, alts: string[], extra: Partial<PlanItem> = {}): PlanItem {
  return { exerciseId: ex.id, nm: ex.nm, muscle: ex.m, kind: ex.kind, sets, reps: ex.r, rest: ex.rest, alts, ...extra };
}

/** Alvos semanais. level: 0 nunca · 1 <1 ano · 2 1–3 anos · 3 3+. Prioridades +4. Recuperação ruim −2.
 *  `fator` < 1 reduz tudo (volta de uma parada: ver fatorRampa); nunca abaixo de 4 séries. */
export function weeklyTargets(level: 0 | 1 | 2 | 3, priorities: MuscleId[], poorRecovery = false, fator = 1): Record<MuscleId, number> {
  const add = [-2, 0, 2, 4][level];
  const out = {} as Record<MuscleId, number>;
  for (const m of MUSCLE_IDS) {
    let t = MUSCLES[m].base + (MUSCLES[m].base >= 10 ? add : 0);
    if (priorities.includes(m)) t += 4;
    if (poorRecovery) t -= 2;
    out[m] = Math.max(4, fator < 1 ? Math.round(t * fator) : t);
  }
  return out;
}
