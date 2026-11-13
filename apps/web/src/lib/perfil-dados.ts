// Textos e opções compartilhados entre Primeiros passos e Perfil (uma fonte só).
import { GOAL_IDS, GOAL_INFO } from "@ciclo/core";
import type { GoalId } from "./perfil-tipos.ts";

export const GOALS: { id: GoalId; nm: string; desc: string; statement: string; muda: string }[] = GOAL_IDS.map((id) => ({ id, ...GOAL_INFO[id] }));
export const BODY: [string, string, string][] = [
  ["muito_magro", "Muito magro", "difícil ganhar peso"], ["magro", "Magro", "pouca gordura e pouca massa"], ["falso_magro", "Magro com barriga", "braço fino, gordura na cintura"],
  ["normal", "Normal", "nem magro nem acima"], ["atletico", "Atlético", "massa visível, pouca gordura"], ["forte_gordura", "Forte com gordura", "massa boa, cintura alta"],
  ["acima", "Acima do peso", "quer perder gordura"], ["bem_acima", "Bem acima do peso", "saúde primeiro"],
];
export const LEVELS: [number, string, string][] = [[0, "Nunca treinei", "vou começar agora"], [1, "Menos de 1 ano", "ainda aprendendo"], [2, "1 a 3 anos", "já tenho base"], [3, "Mais de 3 anos", "treino há bastante tempo"]];
export const DIET: [string, string, string][] = [["zero", "Nada", "só acompanho o peso"], ["leve", "Leve", "falo ou escrevo o que comi"], ["detalhado", "Detalhado", "quero ver calorias e proteína"]];
export const DAYS_LONG: [string, string][] = [["seg", "Segunda"], ["ter", "Terça"], ["qua", "Quarta"], ["qui", "Quinta"], ["sex", "Sexta"], ["sab", "Sábado"], ["dom", "Domingo"]];
export const ANCHORS = ["Barbell_Bench_Press_-_Medium_Grip", "Wide-Grip_Lat_Pulldown", "Barbell_Curl", "Machine_Shoulder_Military_Press", "Leg_Press", "Barbell_Full_Squat", "Seated_Cable_Rows", "Side_Lateral_Raise"];
export const ANCHOR_DEFAULT: Record<string, [number, number]> = { "Barbell_Bench_Press_-_Medium_Grip": [40, 8], "Wide-Grip_Lat_Pulldown": [40, 10], Barbell_Curl: [20, 10], Machine_Shoulder_Military_Press: [30, 10], Leg_Press: [100, 12], Barbell_Full_Squat: [40, 8], Seated_Cable_Rows: [40, 10], Side_Lateral_Raise: [6, 12] };
/** Limites dos steppers (iguais aos do servidor; ver packages/core/src/perfil.ts). */
export const LIM: Record<string, [number, number]> = { age: [12, 90], heightCm: [120, 230], weightKg: [30, 250], "goal.metrics.bracoCm": [-5, 10], "goal.metrics.cinturaCm": [-20, 20], "goal.metrics.pesoKg": [-30, 30] };
