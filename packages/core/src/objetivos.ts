// Os objetivos que o usuário escolhe no quiz e no Perfil: nome, frase "o que muda no seu treino" e metas iniciais.
// Prioridades vêm de `goalPreset` (perfil.ts) e volume/cardio/comida da tabela `METODOS` (contexto-metodo.ts). TS puro.

import { GOAL_IDS } from "./perfil.ts";
import type { ProfileData } from "./perfil.ts";

type GoalId = (typeof GOAL_IDS)[number];
export interface GoalInfo {
  nm: string; desc: string;
  /** vira `goal.statement` (até 140 letras) */
  statement: string;
  /** "o que muda no seu treino", numa frase */
  muda: string;
}
export const GOAL_INFO: Record<GoalId, GoalInfo> = {
  bracos_ombros: { nm: "Braços e ombros maiores", desc: "mantendo a cintura", statement: "Braços e ombros maiores mantendo a cintura",
    muda: "Mais séries de ombro lateral, bíceps e tríceps; o resto fica em manutenção e a cintura é vigiada." },
  massa_geral: { nm: "Ganhar massa no geral", desc: "corpo todo, sem foco", statement: "Ganhar massa no corpo todo",
    muda: "Volume bom em todos os músculos, superávit leve de calorias e foco nos movimentos básicos." },
  definir: { nm: "Perder gordura", desc: "mantendo o músculo", statement: "Perder gordura mantendo o músculo",
    muda: "Treino de força mantido para proteger o músculo, mais cardio e proteína alta com déficit leve." },
  recompor: { nm: "Recompor", desc: "trocar gordura por músculo", statement: "Recompor: menos cintura, mais braço e ombro",
    muda: "Força e volume nos prioritários com calorias de manutenção: a cintura cai devagar enquanto o músculo sobe." },
  forca: { nm: "Ficar mais forte", desc: "cargas maiores nos básicos", statement: "Ficar mais forte nos básicos",
    muda: "Séries mais pesadas, de 3 a 6 repetições, com mais descanso e foco nos exercícios básicos." },
  constancia: { nm: "Constância", desc: "treinar 2×/músculo sem falhar", statement: "Treinar toda semana com 2× por músculo",
    muda: "Treino curto e simples, sem foco, para você não faltar: o que conta é cada músculo 2× por semana." },
  shape_v: { nm: "Shape em V", desc: "ombro e costas largos, cintura fina", statement: "Shape em V: ombros e costas largos, cintura fina",
    muda: "Mais séries de ombro e costas (largura), calorias de manutenção e a cintura sob vigilância." },
  perder_barriga: { nm: "Perder barriga", desc: "mantendo o músculo", statement: "Perder barriga mantendo o músculo",
    muda: "Força nos grandes músculos (pernas, costas, peito), cardio regular e déficit leve; abdominal não vira o foco." },
  saude: { nm: "Saúde e disposição", desc: "constância, cardio e força básica", statement: "Mais saúde e disposição: constância, cardio e força básica",
    muda: "Treino moderado 2× por músculo, cardio da recomendação da OMS e sem pressa de carga." },
  retorno: { nm: "Voltar a treinar", desc: "depois de um tempo parado", statement: "Voltar a treinar depois de um tempo parado",
    muda: "Nas 2 primeiras semanas o volume fica em 60% e sem ir à falha; depois o treino sobe aos poucos." },
};

/** Metas iniciais ao escolher o objetivo (o usuário ajusta no Perfil). Mesmos limites do schema do perfil. */
const METAS: Record<GoalId, { horizonWeeks: 8 | 12 | 16; metrics: ProfileData["goal"]["metrics"] }> = {
  bracos_ombros:  { horizonWeeks: 12, metrics: { bracoCm: 1.5, cinturaCm: 0, pesoKg: 1.5, aderenciaPct: 80 } },
  massa_geral:    { horizonWeeks: 12, metrics: { bracoCm: 1.5, cinturaCm: 1, pesoKg: 3, aderenciaPct: 80 } },
  definir:        { horizonWeeks: 12, metrics: { bracoCm: 0, cinturaCm: -3, pesoKg: -4, aderenciaPct: 80 } },
  recompor:       { horizonWeeks: 16, metrics: { bracoCm: 1, cinturaCm: -2, pesoKg: 0, aderenciaPct: 80 } },
  forca:          { horizonWeeks: 12, metrics: { bracoCm: 1, cinturaCm: 0, pesoKg: 1, aderenciaPct: 80 } },
  constancia:     { horizonWeeks: 12, metrics: { bracoCm: 0, cinturaCm: 0, pesoKg: 0, aderenciaPct: 90 } },
  shape_v:        { horizonWeeks: 16, metrics: { bracoCm: 1.5, cinturaCm: -2, pesoKg: 0, aderenciaPct: 80 } },
  perder_barriga: { horizonWeeks: 16, metrics: { bracoCm: 0, cinturaCm: -4, pesoKg: -5, aderenciaPct: 80 } },
  saude:          { horizonWeeks: 12, metrics: { bracoCm: 0, cinturaCm: -1, pesoKg: 0, aderenciaPct: 90 } },
  retorno:        { horizonWeeks: 12, metrics: { bracoCm: 0.5, cinturaCm: 0, pesoKg: 0.5, aderenciaPct: 90 } },
};

/** O que gravar em `profile.goal` ao escolher o objetivo (sem `since`: quem escolhe põe a data de hoje). */
export function goalDefaults(id: string): { id: GoalId; statement: string; horizonWeeks: 8 | 12 | 16; metrics: ProfileData["goal"]["metrics"] } {
  const g = ((GOAL_IDS as readonly string[]).includes(id) ? id : "bracos_ombros") as GoalId;
  return { id: g, statement: GOAL_INFO[g].statement, horizonWeeks: METAS[g].horizonWeeks, metrics: { ...METAS[g].metrics } };
}
