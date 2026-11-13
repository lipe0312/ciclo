// #45 Método a serviço do objetivo: os números de cada objetivo do perfil (volume, frequência, reps, RIR, deload,
// cardio, comida, cintura). O doc (docs/metodo/) explica e cita a fonte; aqui o core decide. Nada de número de método
// fora desta tabela: trocar o objetivo do perfil troca os parâmetros. TS puro, sem dependências.

import { MUSCLE_IDS, MUSCLES } from "./catalog.ts";
import type { MuscleId } from "./catalog.ts";
import type { Intensity } from "./catalog.ts";
import { DEFAULT_PROFILE, GOAL_IDS } from "./perfil.ts";

export type GoalId = (typeof GOAL_IDS)[number];
export type KcalModo = "superavit" | "deficit" | "manutencao";

export interface Metodo {
  nome: string;
  /** séries por músculo por semana: músculo não prioritário (manter) e faixa dos prioritários */
  volume: { manter: number; prioridade: [number, number] };
  /** estímulos por músculo por semana antes de bater volume */
  frequenciaMin: number;
  reps: [number, number];
  /** repetições sobrando no fim da série */
  rir: [number, number];
  /** semanas de carga antes de 1 de deload */
  semanasDeCarga: number;
  cardio: { minSemana: [number, number]; intensidade: Intensity; horasLongeDePerna: number; esportesContam: boolean };
  comida: { proteinaGkg: number; kcal: KcalModo; /** ritmo do peso em kg/semana (negativo = perder) */ kgSemana: number; alcoolDosesSemanaMax: number };
  /** subida máxima da cintura em 4 semanas antes de cortar 150 kcal (0 = não pode subir) */
  cinturaMaxSubida4semCm: number;
  /** entrada gradual: nas primeiras `semanas` o volume semanal fica em `fator` (1 = sem rampa) */
  rampa: { semanas: number; fator: number };
  /** chaves das fontes em docs/metodo/README.md */
  fontes: string[];
}
const SEM_RAMPA = { semanas: 0, fator: 1 };

export const METODOS: Record<GoalId, Metodo> = {
  bracos_ombros: {
    nome: "Braços e ombros maiores mantendo a cintura",
    volume: { manter: 6, prioridade: [14, 20] }, frequenciaMin: 2, reps: [6, 15], rir: [1, 3], semanasDeCarga: 4,
    cardio: { minSemana: [90, 150], intensidade: "zona2", horasLongeDePerna: 6, esportesContam: true },
    comida: { proteinaGkg: 1.8, kcal: "superavit", kgSemana: 0.25, alcoolDosesSemanaMax: 4 },
    cinturaMaxSubida4semCm: 1,
    rampa: SEM_RAMPA,
    fontes: ["schoenfeld2016", "schoenfeld2017", "pelland2024", "refalo2023", "maeo2023", "morton2018", "iraki2019", "wilson2012", "robineau2016", "bickel2011", "parr2014", "shapeV"],
  },
  massa_geral: {
    nome: "Ganhar massa no corpo todo",
    volume: { manter: 10, prioridade: [12, 20] }, frequenciaMin: 2, reps: [6, 15], rir: [1, 3], semanasDeCarga: 4,
    cardio: { minSemana: [60, 150], intensidade: "zona2", horasLongeDePerna: 6, esportesContam: true },
    comida: { proteinaGkg: 1.8, kcal: "superavit", kgSemana: 0.35, alcoolDosesSemanaMax: 4 },
    cinturaMaxSubida4semCm: 2,
    rampa: SEM_RAMPA,
    fontes: ["schoenfeld2016", "schoenfeld2017", "pelland2024", "morton2018", "iraki2019"],
  },
  definir: {
    nome: "Perder gordura mantendo músculo",
    volume: { manter: 8, prioridade: [10, 16] }, frequenciaMin: 2, reps: [6, 15], rir: [1, 3], semanasDeCarga: 4,
    cardio: { minSemana: [150, 300], intensidade: "moderado", horasLongeDePerna: 6, esportesContam: true },
    comida: { proteinaGkg: 2.2, kcal: "deficit", kgSemana: -0.5, alcoolDosesSemanaMax: 2 },
    cinturaMaxSubida4semCm: 0,
    rampa: SEM_RAMPA,
    fontes: ["helms2014", "morton2018", "who2020", "wilson2012", "bickel2011"],
  },
  recompor: {
    nome: "Recompor (ganhar músculo e perder gordura devagar)",
    volume: { manter: 8, prioridade: [12, 18] }, frequenciaMin: 2, reps: [6, 15], rir: [1, 3], semanasDeCarga: 4,
    cardio: { minSemana: [120, 200], intensidade: "zona2", horasLongeDePerna: 6, esportesContam: true },
    comida: { proteinaGkg: 2.0, kcal: "manutencao", kgSemana: 0, alcoolDosesSemanaMax: 2 },
    cinturaMaxSubida4semCm: 0,
    rampa: SEM_RAMPA,
    fontes: ["schoenfeld2017", "morton2018", "helms2014", "who2020"],
  },
  forca: {
    nome: "Ficar mais forte",
    volume: { manter: 6, prioridade: [8, 14] }, frequenciaMin: 2, reps: [3, 6], rir: [2, 4], semanasDeCarga: 4,
    cardio: { minSemana: [60, 120], intensidade: "zona2", horasLongeDePerna: 6, esportesContam: true },
    comida: { proteinaGkg: 1.6, kcal: "manutencao", kgSemana: 0.1, alcoolDosesSemanaMax: 4 },
    cinturaMaxSubida4semCm: 2,
    rampa: SEM_RAMPA,
    fontes: ["schoenfeld2017carga", "pelland2024", "morton2018", "wilson2012"],
  },
  constancia: {
    nome: "Criar constância",
    volume: { manter: 6, prioridade: [8, 12] }, frequenciaMin: 2, reps: [8, 15], rir: [2, 4], semanasDeCarga: 4,
    cardio: { minSemana: [150, 300], intensidade: "zona2", horasLongeDePerna: 6, esportesContam: true },
    comida: { proteinaGkg: 1.6, kcal: "manutencao", kgSemana: 0, alcoolDosesSemanaMax: 4 },
    cinturaMaxSubida4semCm: 1,
    rampa: SEM_RAMPA,
    fontes: ["who2020", "schoenfeld2016", "morton2018"],
  },
  shape_v: {
    nome: "Shape em V: ombros e costas largos, cintura fina",
    volume: { manter: 6, prioridade: [14, 20] }, frequenciaMin: 2, reps: [6, 15], rir: [1, 3], semanasDeCarga: 4,
    cardio: { minSemana: [90, 150], intensidade: "zona2", horasLongeDePerna: 6, esportesContam: true },
    comida: { proteinaGkg: 1.8, kcal: "manutencao", kgSemana: 0, alcoolDosesSemanaMax: 3 },
    cinturaMaxSubida4semCm: 0,
    rampa: SEM_RAMPA,
    fontes: ["schoenfeld2016", "schoenfeld2017", "pelland2024", "bickel2011", "shapeV"],
  },
  perder_barriga: {
    nome: "Perder barriga mantendo músculo",
    volume: { manter: 8, prioridade: [10, 16] }, frequenciaMin: 2, reps: [6, 15], rir: [1, 3], semanasDeCarga: 4,
    cardio: { minSemana: [150, 300], intensidade: "moderado", horasLongeDePerna: 6, esportesContam: true },
    comida: { proteinaGkg: 2.2, kcal: "deficit", kgSemana: -0.4, alcoolDosesSemanaMax: 2 },
    cinturaMaxSubida4semCm: 0,
    rampa: SEM_RAMPA,
    fontes: ["helms2014", "morton2018", "who2020", "wilson2012", "bickel2011"],
  },
  saude: {
    nome: "Saúde e disposição",
    volume: { manter: 6, prioridade: [8, 12] }, frequenciaMin: 2, reps: [8, 15], rir: [2, 4], semanasDeCarga: 4,
    cardio: { minSemana: [150, 300], intensidade: "zona2", horasLongeDePerna: 6, esportesContam: true },
    comida: { proteinaGkg: 1.6, kcal: "manutencao", kgSemana: 0, alcoolDosesSemanaMax: 2 },
    cinturaMaxSubida4semCm: 1,
    rampa: SEM_RAMPA,
    fontes: ["who2020", "schoenfeld2016", "morton2018"],
  },
  retorno: {
    nome: "Voltar a treinar depois de parada",
    volume: { manter: 6, prioridade: [8, 12] }, frequenciaMin: 2, reps: [8, 15], rir: [3, 5], semanasDeCarga: 4,
    cardio: { minSemana: [90, 180], intensidade: "zona2", horasLongeDePerna: 6, esportesContam: true },
    comida: { proteinaGkg: 1.6, kcal: "manutencao", kgSemana: 0, alcoolDosesSemanaMax: 3 },
    cinturaMaxSubida4semCm: 1,
    rampa: { semanas: 2, fator: 0.6 },
    fontes: ["who2020", "schoenfeld2016", "bickel2011"],
  },
};

/** Fator do volume semanal hoje: o da rampa do objetivo enquanto `goal.since` está nas primeiras semanas; senão 1. */
export function fatorRampa(profile: Record<string, any>, hoje: string): number {
  const { semanas, fator } = METODOS[goalOf(profile ?? {})].rampa;
  const since = profile?.goal?.since;
  if (!semanas || typeof since !== "string" || typeof hoje !== "string") return 1;
  const dias = (Date.parse(hoje + "T12:00:00Z") - Date.parse(since + "T12:00:00Z")) / 864e5;
  return Number.isFinite(dias) && dias >= 0 && dias < semanas * 7 ? fator : 1;
}

const isGoal = (g: unknown): g is GoalId => typeof g === "string" && (GOAL_IDS as readonly string[]).includes(g);
const goalOf = (p: Record<string, any>): GoalId => (isGoal(p?.goal?.id) ? p.goal.id : (DEFAULT_PROFILE.goal.id as GoalId));

/** Tabela do objetivo; desconhecido → objetivo padrão do perfil. */
export function metodoDoObjetivo(goalId: unknown): Metodo {
  return METODOS[isGoal(goalId) ? goalId : (DEFAULT_PROFILE.goal.id as GoalId)];
}

export interface ParametrosMetodo {
  objetivo: GoalId;
  volume: Record<MuscleId, [number, number]>;
  frequenciaMin: number; reps: [number, number]; rir: [number, number]; semanasDeCarga: number;
  cardioMin: [number, number]; cardioIntensidade: Intensity;
  proteinaG: number; kcal: KcalModo; kgSemana: number; alcoolDosesSemanaMax: number; cinturaMaxSubida4semCm: number;
}

/** Os números do método já aplicados ao perfil (prioridades, peso e, com `hoje`, a rampa de volume do objetivo). */
export function parametrosDoPerfil(profile: Record<string, any>, hoje?: string): ParametrosMetodo {
  const p = { ...DEFAULT_PROFILE, ...(profile ?? {}) } as Record<string, any>;
  const objetivo = goalOf(profile ?? {});
  const m = METODOS[objetivo];
  const prios: MuscleId[] = Array.isArray(p.priorities) ? p.priorities : [];
  const f = hoje ? fatorRampa(profile ?? {}, hoje) : 1;
  const vol = (n: number) => (f === 1 ? n : Math.max(4, Math.round(n * f)));
  const volume = Object.fromEntries(MUSCLE_IDS.map((mu) => [mu, (prios.includes(mu) ? m.volume.prioridade : [m.volume.manter, m.volume.manter]).map(vol)])) as Record<MuscleId, [number, number]>;
  const kg = typeof p.weightKg === "number" && Number.isFinite(p.weightKg) ? p.weightKg : DEFAULT_PROFILE.weightKg;
  return {
    objetivo, volume, frequenciaMin: m.frequenciaMin, reps: [...m.reps], rir: [...m.rir], semanasDeCarga: m.semanasDeCarga,
    cardioMin: [...m.cardio.minSemana], cardioIntensidade: m.cardio.intensidade,
    proteinaG: Math.round(kg * m.comida.proteinaGkg), kcal: m.comida.kcal, kgSemana: m.comida.kgSemana,
    alcoolDosesSemanaMax: m.comida.alcoolDosesSemanaMax, cinturaMaxSubida4semCm: m.cinturaMaxSubida4semCm,
  };
}

const n1 = (v: number) => String(v).replace(".", ",");
const KCAL_TXT: Record<KcalModo, string> = { superavit: "superávit leve", deficit: "déficit", manutencao: "manutenção" };

/** 5–10 linhas do método do objetivo do usuário (nunca o doc inteiro). A 1ª linha é o objetivo. */
export function resumoMetodo(profile: Record<string, any>, hoje?: string): string[] {
  const par = parametrosDoPerfil(profile, hoje);
  const m = METODOS[par.objetivo];
  const prios: MuscleId[] = (Array.isArray(profile?.priorities) ? profile.priorities : DEFAULT_PROFILE.priorities).filter((x: MuscleId) => MUSCLES[x]);
  const prioTxt = prios.length ? prios.map((x) => MUSCLES[x].nm.toLowerCase()).join(", ") : "nenhuma";
  const ritmo = par.kgSemana === 0 ? "peso estável" : `${par.kgSemana > 0 ? "+" : ""}${n1(par.kgSemana)} kg/semana`;
  const rampa = m.rampa.fator < 1 && (hoje === undefined || fatorRampa(profile ?? {}, hoje) < 1)
    ? [`Retomada: nas ${m.rampa.semanas} primeiras semanas o volume fica em ${Math.round(m.rampa.fator * 100)}% da tabela e sem ir à falha; depois segue a tabela.`] : [];
  return [
    `Objetivo (${par.objetivo}): ${m.nome}. Prioridades: ${prioTxt}. O objetivo do dono manda; método é referência.`,
    `Volume: prioridades ${m.volume.prioridade[0]}–${m.volume.prioridade[1]} séries/semana; demais músculos ~${m.volume.manter} (manter).`,
    `Frequência: ${m.frequenciaMin}× por músculo antes de bater volume; nunca compensar dobrado.`,
    `Séries de ${m.reps[0]}–${m.reps[1]} reps a RIR ${m.rir[0]}–${m.rir[1]}; dupla progressão; deload após ${m.semanasDeCarga} semanas de carga.`,
    `Cardio: ${m.cardio.minSemana[0]}–${m.cardio.minSemana[1]} min/semana (${m.cardio.intensidade}), ≥ ${m.cardio.horasLongeDePerna} h longe do treino de perna; esportes contam.`,
    `Comida: proteína ~${par.proteinaG} g/dia (${n1(m.comida.proteinaGkg)} g/kg); calorias em ${KCAL_TXT[m.comida.kcal]} (${ritmo}); álcool ≤ ${m.comida.alcoolDosesSemanaMax} doses/semana.`,
    m.cinturaMaxSubida4semCm > 0
      ? `Cintura: subiu > ${n1(m.cinturaMaxSubida4semCm)} cm em 4 semanas com peso subindo rápido → −150 kcal antes de mexer no treino.`
      : `Cintura: não deve subir; se subir em 4 semanas → −150 kcal antes de mexer no treino.`,
    ...rampa,
  ];
}
