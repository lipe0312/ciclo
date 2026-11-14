// #70 Cenário `semi`: conta em uso. Perfil de treino respondido, 1 academia com aparelhos, 2 semanas de treinos feitos,
// check-ins, 1 dor leve e comida de 3 dias. Tudo entra pela API (a mesma validação do app), então o formato é sempre o de verdade.
import { DEFAULT_PROFILE } from "@ciclo/core";
import { criarConta, diaSemana, somarDias } from "./lib.mjs";

export const slug = "cenario-semi";
export const descricao = "Conta em uso: Perfil respondido, 1 academia, 2 semanas de treinos, check-ins, 1 dor leve e comida de 3 dias.";
export const tem = ["conta de 'Bia Teste'", "Perfil de treino respondido (braços e ombros)", "1 academia com aparelhos", "treinos de 2 semanas (seg/ter/qui/sex)", "check-ins", "dor leve no ombro esquerdo", "comida de 3 dias"];

const DIAS_TREINO = new Set(["seg", "ter", "qui", "sex"]);
const COMIDA = [["cafe", "2 ovos mexidos e 1 pão francês"], ["almoco", "arroz, feijão e 150 g de frango grelhado"]];

// Fica abaixo do limite de 120 escritas por minuto da API (o runner ainda espera e repete se um 429 vier).
export async function criarSemi(ctx, opts = {}) {
  const uid = await criarConta(ctx, { slug: opts.slug ?? slug, nome: "Bia", sobrenome: "Teste", sexo: "feminino", onboarding: "concluido", criadaHa: 20, ...opts.conta });
  const perfil = JSON.parse(JSON.stringify(DEFAULT_PROFILE));
  Object.assign(perfil, { sex: "f", age: 30, heightCm: 165, weightKg: 62, level: 1, places: ["academia"], daysUsual: ["seg", "ter", "qui", "sex"], daysTarget: 4, minutes: 60,
    dayGym: Object.fromEntries(["seg", "ter", "qua", "qui", "sex", "sab", "dom"].map((d) => [d, "acad1"])) });
  perfil.goal = { ...perfil.goal, statement: "Braços e ombros maiores mantendo a cintura (fictício)" };
  perfil.meta = { filledBy: "app", confirmed: true, checkup: "feito" };
  await ctx.api("PUT", "/api/profile", { data: perfil });
  await ctx.api("PUT", "/api/gyms/acad1", { name: "Academia Exemplo", kind: "academia", equipment: ["halteres", "banco", "polia", "puxador", "barra", "legpress", "extensora", "flexora", "barrafixa"], busyHours: ["18-20"] });
  await ctx.api("GET", `/api/week?date=${ctx.hoje}`);

  // 2 semanas de treinos feitos (nunca hoje: o dia de hoje fica para você treinar)
  for (let n = 14; n >= 1; n--) {
    const d = somarDias(ctx.hoje, -n);
    if (!DIAS_TREINO.has(diaSemana(d))) continue;
    const { plan, gymId } = await ctx.api("POST", "/api/plan-day", { date: d, daysLeft: 3, gymId: "acad1" });
    if (!plan?.items?.length) continue;
    const { id } = await ctx.api("POST", "/api/sessions", { date: d, gymId, plan }, { status: 201 });
    for (const it of plan.items.slice(0, 3)) for (let s = 1; s <= 2; s++) await ctx.api("POST", `/api/sessions/${id}/sets`, { exerciseId: it.exerciseId, setNo: s, kg: 8 + s, reps: 10, rir: 2 });
    await ctx.api("POST", `/api/sessions/${id}/finish`, { feedback: { feel: "bom" } });
    await ctx.api("PUT", `/api/checkin/${d}`, { sleepH: 7, energy: 2, soreness: 1, stress: 2, food: 0, weightKg: 62 });
  }
  await ctx.api("POST", "/api/pains", { region: "ombro_e", intensity: 1, context: "incômodo leve (fictício)" }, { status: 201 });
  for (let n = 2; n >= 0; n--) for (const [meal, text] of COMIDA) await ctx.api("POST", "/api/food", { date: somarDias(ctx.hoje, -n), text, meal }, { status: 201 });
  return uid;
}

export async function seed(ctx) { await criarSemi(ctx); }
