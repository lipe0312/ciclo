// #74 Eficiência por subparte e popularidade de cada exercício. Separado de catalog.ts para o arquivo não crescer demais.
// - eficiencia: 3 = principal, 2 = pega bem, 1 = pega pouco; subparte ausente = praticamente não trabalha.
//   Fonte e critério: docs/09-base-cientifica.md, seção "Eficiência por subparte". É um RANKING PRÁTICO (EMG ≠ hipertrofia).
// - popularidade: 1..5, de logs públicos de apps de treino (docs/09-base-cientifica.md, seção "Exercícios mais comuns").
//   Só ordena a lista do "Meu treino atual" e desempata para iniciante; NUNCA entra na eficiência.
// Regra (teste): a subparte principal (subMuscles[0]) tem a maior nota do exercício.

import type { SubMuscleId as S } from "./catalog.ts";

export type Nota = 1 | 2 | 3;
export type Popularidade = 1 | 2 | 3 | 4 | 5;
export type Eficiencia = Partial<Record<S, Nota>>;

/** [eficiência por subparte, popularidade] por ID do catálogo. */
export const EFICIENCIA_POP: Record<string, [Eficiencia, Popularidade]> = {
  // ---------- peito: inclinado → superior; reto, voador e crossover alto → médio ----------
  Incline_Dumbbell_Press: [{ peito_sup: 3, peito_medio: 2, ombro_ant: 2, triceps_lateral: 1 }, 4],
  Leverage_Chest_Press: [{ peito_medio: 3, peito_sup: 2, ombro_ant: 1, triceps_lateral: 1 }, 2],
  Butterfly: [{ peito_medio: 3, peito_sup: 2, ombro_ant: 1 }, 2],
  Cable_Crossover: [{ peito_medio: 3, peito_sup: 1, ombro_ant: 1 }, 3],
  Dumbbell_Bench_Press: [{ peito_medio: 3, peito_sup: 2, ombro_ant: 2, triceps_lateral: 1 }, 3],
  "Barbell_Bench_Press_-_Medium_Grip": [{ peito_medio: 3, peito_sup: 2, ombro_ant: 2, triceps_lateral: 2, triceps_longa: 1 }, 5],
  Pushups: [{ peito_medio: 3, peito_sup: 2, ombro_ant: 2, triceps_lateral: 1, abdomen: 1 }, 2],
  "Barbell_Incline_Bench_Press_-_Medium_Grip": [{ peito_sup: 3, peito_medio: 2, ombro_ant: 2, triceps_lateral: 1 }, 2],
  Leverage_Incline_Chest_Press: [{ peito_sup: 3, peito_medio: 2, ombro_ant: 2, triceps_lateral: 1 }, 2],
  Dumbbell_Flyes: [{ peito_medio: 3, peito_sup: 2, ombro_ant: 1 }, 2],
  Incline_Dumbbell_Flyes: [{ peito_sup: 3, peito_medio: 2, ombro_ant: 1 }, 2],
  Low_Cable_Crossover: [{ peito_sup: 3, peito_medio: 2, ombro_ant: 1 }, 2],
  Smith_Machine_Incline_Bench_Press: [{ peito_sup: 3, peito_medio: 2, ombro_ant: 2, triceps_lateral: 1 }, 2],

  // ---------- costas: puxadas → dorsal; remadas → meio das costas ----------
  "Wide-Grip_Lat_Pulldown": [{ dorsal: 3, costas_meio: 2, biceps: 1 }, 5],
  Seated_Cable_Rows: [{ costas_meio: 3, dorsal: 2, biceps: 1, ombro_post: 1 }, 4],
  Leverage_Iso_Row: [{ costas_meio: 3, dorsal: 2, biceps: 1, ombro_post: 1 }, 2],
  "One-Arm_Dumbbell_Row": [{ dorsal: 3, costas_meio: 2, biceps: 1, lombar: 1 }, 3],
  Pullups: [{ dorsal: 3, costas_meio: 2, biceps: 2, antebraco: 1, ombro_post: 1 }, 4],
  Bent_Over_Barbell_Row: [{ costas_meio: 3, dorsal: 2, lombar: 2, biceps: 1, ombro_post: 1 }, 5],
  "Straight-Arm_Pulldown": [{ dorsal: 3, costas_meio: 1, triceps_longa: 1 }, 2],
  "Scapular_Pull-Up": [{ trapezio: 2, costas_meio: 1, dorsal: 1 }, 1],
  "Close-Grip_Front_Lat_Pulldown": [{ dorsal: 3, costas_meio: 2, biceps: 1 }, 2],
  Underhand_Cable_Pulldowns: [{ dorsal: 3, biceps: 2, costas_meio: 1 }, 2],
  One_Arm_Lat_Pulldown: [{ dorsal: 3, costas_meio: 1, biceps: 1 }, 2],
  "Chin-Up": [{ dorsal: 3, biceps: 2, costas_meio: 2, ombro_post: 1 }, 2],
  "T-Bar_Row_with_Handle": [{ costas_meio: 3, dorsal: 2, ombro_post: 1, biceps: 1 }, 2],
  "Seated_One-arm_Cable_Pulley_Rows": [{ costas_meio: 3, dorsal: 2, biceps: 1 }, 2],
  "Bent_Over_Two-Dumbbell_Row": [{ costas_meio: 3, dorsal: 2, lombar: 2, biceps: 1, ombro_post: 1 }, 2],
  Inverted_Row: [{ costas_meio: 3, dorsal: 2, ombro_post: 2, biceps: 1 }, 2],
  "Bent-Arm_Dumbbell_Pullover": [{ dorsal: 2, peito_medio: 2, triceps_longa: 1 }, 2],
  Barbell_Shrug: [{ trapezio: 3, antebraco: 1 }, 2],
  Hyperextensions_Back_Extensions: [{ lombar: 3, gluteo: 2, isquio: 2 }, 2],

  // ---------- ombro lateral e anterior: elevações → lateral; desenvolvimentos → anterior (lateral moderado, posterior quase nada) ----------
  Cable_Seated_Lateral_Raise: [{ ombro_lat: 3, ombro_ant: 1 }, 2],
  Side_Lateral_Raise: [{ ombro_lat: 3, ombro_ant: 1, ombro_post: 1, trapezio: 1 }, 5],
  Machine_Shoulder_Military_Press: [{ ombro_ant: 3, ombro_lat: 2, triceps_lateral: 1 }, 2],
  Seated_Dumbbell_Press: [{ ombro_ant: 3, ombro_lat: 2, triceps_lateral: 1 }, 3],
  "Lateral_Raise_-_With_Bands": [{ ombro_lat: 3, ombro_ant: 1 }, 2],
  Dumbbell_Scaption: [{ ombro_lat: 2, ombro_ant: 2, trapezio: 1, ombro_post: 1 }, 1],
  Arnold_Dumbbell_Press: [{ ombro_ant: 3, ombro_lat: 2, triceps_lateral: 1 }, 2],
  Standing_Military_Press: [{ ombro_ant: 3, ombro_lat: 2, triceps_lateral: 1, abdomen: 1 }, 5],
  Seated_Side_Lateral_Raise: [{ ombro_lat: 3, ombro_ant: 1, ombro_post: 1, trapezio: 1 }, 2],
  "One-Arm_Incline_Lateral_Raise": [{ ombro_lat: 3, ombro_ant: 1 }, 2],
  "Standing_Low-Pulley_Deltoid_Raise": [{ ombro_lat: 3, ombro_ant: 1 }, 2],
  Front_Dumbbell_Raise: [{ ombro_ant: 3, ombro_lat: 1 }, 2],
  Front_Cable_Raise: [{ ombro_ant: 3, ombro_lat: 1 }, 2],
  Upright_Barbell_Row: [{ ombro_lat: 3, trapezio: 2, ombro_ant: 1, biceps: 1 }, 2],

  // ---------- ombro posterior: crucifixo inverso (máquina, halteres, cabo) > face pull e remadas ----------
  Face_Pull: [{ ombro_post: 2, trapezio: 2, costas_meio: 1 }, 3],
  Reverse_Flyes: [{ ombro_post: 3, trapezio: 1, costas_meio: 1 }, 2],
  Reverse_Machine_Flyes: [{ ombro_post: 3, trapezio: 1, costas_meio: 1 }, 2],
  Band_Pull_Apart: [{ ombro_post: 2, costas_meio: 1, trapezio: 1 }, 1],
  External_Rotation_with_Band: [{ ombro_post: 1, trapezio: 1 }, 1],
  Cable_Rear_Delt_Fly: [{ ombro_post: 3, trapezio: 1, costas_meio: 1 }, 2],
  Bent_Over_Dumbbell_Rear_Delt_Raise_With_Head_On_Bench: [{ ombro_post: 3, trapezio: 1, costas_meio: 1 }, 2],
  "Cable_Rope_Rear-Delt_Rows": [{ ombro_post: 2, costas_meio: 2, trapezio: 1 }, 1],

  // ---------- bíceps: supinado → bíceps; martelo e pegada pronada → braquial / braquiorradial ----------
  Incline_Dumbbell_Curl: [{ biceps: 3, braquial: 1 }, 2],
  Preacher_Curl: [{ biceps: 3, braquial: 2 }, 2],
  Hammer_Curls: [{ braquial: 3, biceps: 2, antebraco: 2 }, 3],
  High_Cable_Curls: [{ biceps: 3, braquial: 1 }, 2],
  Machine_Bicep_Curl: [{ biceps: 3, braquial: 1 }, 2],
  "EZ-Bar_Curl": [{ biceps: 3, braquial: 2, antebraco: 1 }, 2],
  Barbell_Curl: [{ biceps: 3, braquial: 1, antebraco: 1 }, 4],
  Dumbbell_Bicep_Curl: [{ biceps: 3, braquial: 1, antebraco: 1 }, 4],
  Cable_Preacher_Curl: [{ biceps: 3, braquial: 2 }, 2],
  Machine_Preacher_Curls: [{ biceps: 3, braquial: 2 }, 2],
  Standing_Biceps_Cable_Curl: [{ biceps: 3, braquial: 1 }, 2],
  "Cable_Hammer_Curls_-_Rope_Attachment": [{ braquial: 3, biceps: 2, antebraco: 2 }, 2],
  Spider_Curl: [{ biceps: 3, braquial: 1 }, 2],
  Concentration_Curls: [{ biceps: 3, braquial: 1 }, 2],
  Zottman_Curl: [{ biceps: 2, braquial: 2, antebraco: 2 }, 1],
  Reverse_Barbell_Curl: [{ braquial: 3, antebraco: 2, biceps: 1 }, 1],

  // ---------- tríceps: acima da cabeça → cabeça longa; pulley e coice → cabeça lateral ----------
  Cable_Rope_Overhead_Triceps_Extension: [{ triceps_longa: 3, triceps_lateral: 2 }, 2],
  Triceps_Pushdown: [{ triceps_lateral: 3, triceps_longa: 2 }, 4],
  Machine_Triceps_Extension: [{ triceps_lateral: 3, triceps_longa: 2 }, 2],
  "EZ-Bar_Skullcrusher": [{ triceps_longa: 3, triceps_lateral: 2 }, 2],
  "Dips_-_Triceps_Version": [{ triceps_lateral: 3, triceps_longa: 2, peito_medio: 2, ombro_ant: 2 }, 2],
  "Close-Grip_Barbell_Bench_Press": [{ triceps_lateral: 3, triceps_longa: 2, peito_medio: 2, ombro_ant: 2 }, 2],
  "Triceps_Pushdown_-_Rope_Attachment": [{ triceps_lateral: 3, triceps_longa: 2 }, 4],
  Standing_Dumbbell_Triceps_Extension: [{ triceps_longa: 3, triceps_lateral: 2 }, 2],
  Standing_Overhead_Barbell_Triceps_Extension: [{ triceps_longa: 3, triceps_lateral: 2 }, 2],
  Lying_Dumbbell_Tricep_Extension: [{ triceps_longa: 3, triceps_lateral: 2 }, 2],
  Reverse_Grip_Triceps_Pushdown: [{ triceps_lateral: 3, triceps_longa: 1, antebraco: 1 }, 2],
  Cable_One_Arm_Tricep_Extension: [{ triceps_lateral: 3, triceps_longa: 2 }, 2],
  Tricep_Dumbbell_Kickback: [{ triceps_lateral: 3, triceps_longa: 2 }, 2],
  Bench_Dips: [{ triceps_lateral: 3, triceps_longa: 2, ombro_ant: 2 }, 2],

  // ---------- pernas: agachamentos → quadríceps (glúteo e adutores no fundo); extensora → quadríceps ----------
  Hack_Squat: [{ quad: 3, gluteo: 2, adutores: 1 }, 2],
  Leg_Press: [{ quad: 3, gluteo: 2, adutores: 1, isquio: 1 }, 4],
  Smith_Machine_Squat: [{ quad: 3, gluteo: 2 }, 2],
  Barbell_Full_Squat: [{ quad: 3, gluteo: 3, adutores: 2, lombar: 1, isquio: 1 }, 5],
  Leg_Extensions: [{ quad: 3 }, 5],
  Goblet_Squat: [{ quad: 3, gluteo: 2, abdomen: 1 }, 2],
  Dumbbell_Lunges: [{ quad: 3, gluteo: 2, isquio: 1 }, 2],
  Front_Barbell_Squat: [{ quad: 3, gluteo: 2, abdomen: 1 }, 2],
  Split_Squat_with_Dumbbells: [{ quad: 3, gluteo: 2 }, 3],
  Dumbbell_Step_Ups: [{ quad: 3, gluteo: 2 }, 2],
  Thigh_Adductor: [{ adutores: 3 }, 2],

  // ---------- posterior de coxa: flexora sentada > deitada; stiff/terra romeno também pega glúteo ----------
  Romanian_Deadlift: [{ isquio: 3, gluteo: 2, lombar: 2 }, 3],
  Seated_Leg_Curl: [{ isquio: 3, pant: 1 }, 3],
  Lying_Leg_Curls: [{ isquio: 2, pant: 1 }, 3],
  "Stiff-Legged_Dumbbell_Deadlift": [{ isquio: 3, gluteo: 2, lombar: 2 }, 3],
  Barbell_Deadlift: [{ isquio: 2, gluteo: 2, lombar: 2, dorsal: 1, quad: 1 }, 5],

  // ---------- glúteo: elevação pélvica, ponte e coice; abdutora pega mais o glúteo médio ----------
  Barbell_Hip_Thrust: [{ gluteo: 3, isquio: 1 }, 4],
  Dumbbell_Rear_Lunge: [{ gluteo: 3, quad: 2, isquio: 1 }, 2],
  Butt_Lift_Bridge: [{ gluteo: 2, isquio: 1 }, 2],
  Pull_Through: [{ gluteo: 3, isquio: 2, lombar: 1 }, 1],
  Barbell_Glute_Bridge: [{ gluteo: 3, isquio: 1 }, 2],
  "One-Legged_Cable_Kickback": [{ gluteo: 3, isquio: 1 }, 2],
  Thigh_Abductor: [{ gluteo: 2 }, 3],

  // ---------- panturrilha: em pé (joelho estendido) > sentado para o gastrocnêmio ----------
  Standing_Calf_Raises: [{ pant: 3 }, 2],
  Calf_Press_On_The_Leg_Press_Machine: [{ pant: 3 }, 2],
  Seated_Calf_Raise: [{ pant: 2 }, 2],
  Standing_Dumbbell_Calf_Raise: [{ pant: 3 }, 2],
  Donkey_Calf_Raises: [{ pant: 3 }, 1],

  // ---------- abdômen: flexão do tronco com carga e elevação de pernas > prancha e dead bug ----------
  Cable_Crunch: [{ abdomen: 3 }, 2],
  Hanging_Leg_Raise: [{ abdomen: 3, obliquos: 1, antebraco: 1 }, 2],
  Dead_Bug: [{ abdomen: 2, obliquos: 1 }, 2],
  Plank: [{ abdomen: 2, obliquos: 1 }, 2],
  Side_Bridge: [{ obliquos: 3, abdomen: 1 }, 2],
  Star_Jump: [{ pant: 2, gluteo: 1 }, 3],
  Crunches: [{ abdomen: 2 }, 2],
  Reverse_Crunch: [{ abdomen: 3, obliquos: 1 }, 2],
  Ab_Crunch_Machine: [{ abdomen: 3 }, 2],
  Ab_Roller: [{ abdomen: 3, dorsal: 1, ombro_ant: 1 }, 2],
};
