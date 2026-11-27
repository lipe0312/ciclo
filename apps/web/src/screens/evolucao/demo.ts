// #147 Dados FICTÍCIOS da Evolução na demonstração: 6 meses de treino, comida, saúde e corpo, sempre relativos a "hoje" e
// sempre iguais (sem Math.random: o "sorteio" é um hash da data). Baixa só na demonstração (import dinâmico).
// `?demo&vazio` mostra a conta nova. Nada aqui é de gente de verdade.
import { fimDoMes } from "@ciclo/core/evolucao";
import type { EvolucaoRaw } from "@ciclo/core/evolucao";
import { REGRAS_MEDIAS_PADRAO } from "@ciclo/core/comida-medias";
import { addDays } from "../../lib/util.ts";

const vazio = /[?&]vazio\b/.test(location.search);
const DIAS = 183;
const LATERAL = "Cable_Seated_Lateral_Raise", ROSCA = "Incline_Dumbbell_Curl", TRICEPS = "Cable_Rope_Overhead_Triceps_Extension";
/** 0 a 1, sempre o mesmo para a mesma data e o mesmo "sal" */
const sorteio = (d: string, sal: string) => { let h = 2166136261; for (const ch of d + sal) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return ((h >>> 0) % 10000) / 10000; };
const r1 = (n: number) => Math.round(n * 10) / 10;

export function demoEvolucao(de: string, ate: string, hoje: string): EvolucaoRaw {
  const ini = addDays(hoje, -(DIAS - 1));
  const r: EvolucaoRaw = {
    de, ate, sets: [], e1rm: [], sessoes: [], presenca: [], cardio: [], refeicoes: [], naoComi: [], bebida: [], agua: [], sono: [], alcool: [],
    peso: [], medidas: [], recordeAntes: [], primeiro: vazio ? null : ini, comecoCorpo: { peso: null, braco: null, cintura: null, ombro: null }, regrasMedias: REGRAS_MEDIAS_PADRAO,
  };
  if (vazio) return r;
  const from = `${de}-01`, fimC = fimDoMes(ate), to = fimC < hoje ? fimC : hoje, comidaDe = addDays(from, -27);
  const antes = new Map<string, number>();
  for (let d = ini, i = 0; d <= to; d = addDays(d, 1), i++) {
    const t = i / DIAS, dow = (new Date(d + "T12:00:00Z").getUTCDay() + 6) % 7, x = (s: string) => sorteio(d, s), dentro = d >= from;
    // treino seg/ter/qui/sex; falta mais no começo (e a falta fica marcada como "não fui")
    if ([0, 1, 3, 4].includes(dow) && d < hoje) {
      if (x("falta") < 0.28 - t * 0.18) { if (dentro) r.presenca.push({ date: d, status: "nao_fui" }); }
      else {
        const sup = dow === 0 || dow === 3;
        const grupos: [string, number][] = sup ? [["ombro", 3 + Math.round(t * 2)], ["biceps", 3 + (t > 0.5 ? 1 : 0)], ["triceps", 3], ["peito", 3]] : [["quad", 4], ["isquio", 3], ["gluteo", 2], ["pant", 2]];
        const ex: [string, string, number][] = sup ? [[LATERAL, "ombro", 6.5 + t * 2.2], [ROSCA, "biceps", 14 + t * 3], [TRICEPS, "triceps", 25 + t * 5]] : [];
        for (const [id, mu, v] of ex) {
          const e = r1(v + (x(id) - 0.5) * 0.4);
          if (dentro) r.e1rm.push({ date: d, exerciseId: id, muscle: mu, e1rm: e }); else antes.set(id, Math.max(antes.get(id) ?? 0, e));
        }
        if (dentro) { r.sessoes.push(d); for (const [muscle, n] of grupos) r.sets.push({ date: d, muscle, n }); }
      }
    }
    if (dentro && (dow === 2 || dow === 5) && x("cardio") < 0.8) r.cardio.push({ date: d, minutes: 15 + Math.round(t * 25 + x("min") * 8) });
    // comida: registrada em 60% dos dias no começo e 85% no fim; a proteína sobe com o tempo
    if (d >= comidaDe && x("comida") < 0.6 + t * 0.25) {
      const k = (s: string) => Math.round((x(s) - 0.5) * 120);
      if (x("cafe") < 0.85) r.refeicoes.push({ date: d, meal: "cafe", kcal: 450 + k("kc"), prot: Math.round(24 + t * 10) });
      else if (x("nao") < 0.3) r.naoComi.push({ date: d, meal: "cafe" });
      r.refeicoes.push({ date: d, meal: "almoco", kcal: 850 + k("ka"), prot: Math.round(42 + t * 12) });
      if (x("lanche") < 0.4) r.refeicoes.push({ date: d, meal: "lanche", kcal: 300 + k("kl"), prot: 15 });
      if (x("jantar") < 0.8) r.refeicoes.push({ date: d, meal: "jantar", kcal: 750 + k("kj"), prot: Math.round(38 + t * 12) });
    }
    // peso às quartas e domingos; medidas a cada 14 dias (braço e ombro sobem, a cintura fica parada). O 1º de cada é o "começo".
    const kg = dow === 2 || dow === 6 ? r1(71 + t * 2 + (x("peso") - 0.5) * 0.4) : null;
    const med = i % 14 === 0 ? { date: d, braco: r1(32.5 + t * 1.5), cintura: r1(79 + (x("cint") - 0.5) * 0.4), ombro: r1(115 + t * 2) } : null;
    if (kg != null) r.comecoCorpo.peso ??= { date: d, value: kg };
    if (med) { r.comecoCorpo.braco ??= { date: d, value: med.braco }; r.comecoCorpo.cintura ??= { date: d, value: med.cintura }; r.comecoCorpo.ombro ??= { date: d, value: med.ombro }; }
    if (!dentro) continue;
    if (kg != null) r.peso.push({ date: d, kg });
    if (med) r.medidas.push(med);
    // checkout (água e álcool) em 70% das noites; menos álcool nos últimos meses
    if (x("checkout") < 0.7) {
      const doses = dow >= 4 && x("alc") < 0.55 - t * 0.35 ? 2 + Math.round(x("doses") * 2) : 0;
      r.agua.push({ date: d, litros: r1(1.8 + t * 0.7 + (x("agua") - 0.5) * 0.6) });
      r.alcool.push({ date: d, doses });
      if (doses) r.bebida.push({ date: d, kcal: doses * 150 });
    }
    // check-in (sono) em 80% das manhãs
    if (x("checkin") < 0.8) r.sono.push({ date: d, horas: Math.min(9, 6 + Math.round(x("sono") * 1.6 + t)) });
  }
  r.recordeAntes = [...antes].map(([exerciseId, e1rm]) => ({ exerciseId, e1rm }));
  return r;
}
