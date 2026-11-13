// Dados FICTÍCIOS da demonstração da Home (#29): 6 semanas de treino, medidas, peso, comida e check-ins, sempre relativas a "hoje".
// `?demo&vazio` mostra a conta nova (Home vazia e didática). Nada aqui é de gente de verdade.
import type { HomeRaw } from "@ciclo/core";
import * as C from "@ciclo/core";
import { addDays } from "../../lib/util.ts";

const vazio = /[?&]vazio\b/.test(location.search);
const LATERAL = "Cable_Seated_Lateral_Raise", ROSCA = "Incline_Dumbbell_Curl", TRICEPS = "Cable_Rope_Overhead_Triceps_Extension", SUPINO = "Incline_Dumbbell_Press";

export function demoRaw(hoje: string): HomeRaw {
  const nada: HomeRaw = { sets: [], e1rm: [], sessoes: [], presenca: [], cardio: [], pesos: [], medidas: [], comida: [], checkins: [], checkouts: [] };
  if (vazio) return nada;
  const seg = C.mondayOf(hoje), ini = addDays(seg, -35); // 6 semanas, a atual inclusa
  const raw: HomeRaw = { ...nada };
  for (let w = 0; w < 6; w++) {
    const m = addDays(ini, w * 7);
    // seg/qui superior (ombro, bíceps, tríceps, peito), ter/sex inferior; a 4ª semana perde um dia (faltou)
    for (const [off, tipo] of [[0, "sup"], [1, "inf"], [3, "sup"], [4, "inf"]] as const) {
      const d = addDays(m, off);
      if (d > hoje || (w === 3 && off === 4)) continue;
      raw.sessoes.push(d);
      const grupos = tipo === "sup" ? [["ombro", 3 + (w > 2 ? 1 : 0)], ["biceps", 3], ["triceps", 3], ["peito", 3]] : [["quad", 4], ["isquio", 3], ["gluteo", 2], ["pant", 2]];
      for (const [mu, n] of grupos) raw.sets.push({ date: d, muscle: mu as string, n: n as number });
      if (tipo === "sup") {
        raw.e1rm.push({ date: d, exerciseId: LATERAL, e1rm: 6.8 + w * 0.35 + (off ? 0.1 : 0) }, { date: d, exerciseId: ROSCA, e1rm: 15 + w * 0.5 }, { date: d, exerciseId: TRICEPS, e1rm: 26 + w * 0.9 });
        if (off === 0) raw.e1rm.push({ date: d, exerciseId: SUPINO, e1rm: 31 + w * 0.8 });
      }
    }
    const peso = addDays(m, 2);
    if (peso <= hoje) raw.pesos.push({ date: peso, kg: Math.round((72 + w * 0.22 + (w % 2 ? 0.1 : -0.05)) * 10) / 10 });
    if (w % 2 === 0 && addDays(m, 5) <= hoje) raw.cardio.push({ date: addDays(m, 5), minutes: 25 + w * 2 });
    if (w < 5) raw.cardio.push({ date: addDays(m, 2), minutes: 20 });
  }
  raw.medidas = [{ date: addDays(ini, 0), braco: 33.0, cintura: 79.0 }, { date: addDays(ini, 14), braco: 33.3, cintura: 79.1 }, { date: addDays(ini, 28), braco: 33.6, cintura: 79.2 }];
  // comida: registrada em 3 dos 7 últimos dias; check-in em 4
  raw.comida = [-1, -2, -4].map((n, i) => ({ date: addDays(hoje, n), kcal: 2450 + i * 120, prot: 118 + i * 9 }));
  raw.checkins = [0, -1, -2, -4].map((n) => addDays(hoje, n));
  return raw;
}
