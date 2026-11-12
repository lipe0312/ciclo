// Catálogo base. Imagens: free-exercise-db (Unlicense / domínio público) → apps/web/public/img/ex/<src>.webp (0)
// e <src>-1.webp (1), geradas por scripts/catalogo-imagens.mjs. Regra: o Claude só escolhe IDs que existem aqui. O código valida e
// "hidrata" (nome, imagem, mídia). Os IDs são os do free-exercise-db e NÃO mudam (o Worker, o MCP e o D1 usam).


import { CARDIO_INFO, INFO } from "./catalog-info.ts";

export type MuscleId =
  | "peito" | "costas" | "ombro" | "post" | "biceps" | "triceps"
  | "quad" | "isquio" | "gluteo" | "pant" | "core";
export type Group = "sup" | "inf";
export type Kind = "livre" | "maquina" | "cabo" | "corpo";
export type Joint = "cervical" | "ombro" | "escapula" | "cotovelo" | "punho" | "lombar" | "quadril" | "joelho" | "tornozelo";

export interface Muscle { nm: string; group: Group; base: number }
export const MUSCLES: Record<MuscleId, Muscle> = {
  peito:   { nm: "Peito",         group: "sup", base: 10 },
  costas:  { nm: "Costas",        group: "sup", base: 12 },
  ombro:   { nm: "Ombro lateral", group: "sup", base: 10 },
  post:    { nm: "Ombro post.",   group: "sup", base: 6 },
  biceps:  { nm: "Bíceps",        group: "sup", base: 10 },
  triceps: { nm: "Tríceps",       group: "sup", base: 10 },
  quad:    { nm: "Quadríceps",    group: "inf", base: 10 },
  isquio:  { nm: "Posterior",     group: "inf", base: 8 },
  gluteo:  { nm: "Glúteos",       group: "inf", base: 6 },
  pant:    { nm: "Panturrilha",   group: "inf", base: 6 },
  core:    { nm: "Abdômen",       group: "inf", base: 4 },
};
export const MUSCLE_IDS = Object.keys(MUSCLES) as MuscleId[];

// Subdivisões (o que o mapa de músculos desenha e o Perfil usa para prioridades finas).
// `muscle` = em qual músculo do orçamento semanal a subdivisão conta.
export type Region = "ombro" | "costas" | "bracos" | "peito" | "pernas" | "core";
export type SubMuscleId =
  | "ombro_ant" | "ombro_lat" | "ombro_post"
  | "dorsal" | "costas_meio" | "trapezio" | "lombar"
  | "biceps" | "braquial" | "triceps_longa" | "triceps_lateral" | "antebraco"
  | "peito_sup" | "peito_medio"
  | "quad" | "isquio" | "gluteo" | "adutores" | "pant"
  | "abdomen" | "obliquos";
export interface SubMuscle { nm: string; region: Region; muscle: MuscleId }
export const SUB_MUSCLES: Record<SubMuscleId, SubMuscle> = {
  ombro_ant:       { nm: "Ombro anterior",              region: "ombro",  muscle: "ombro" },
  ombro_lat:       { nm: "Ombro lateral",               region: "ombro",  muscle: "ombro" },
  ombro_post:      { nm: "Ombro posterior",             region: "ombro",  muscle: "post" },
  dorsal:          { nm: "Dorsal (largura)",            region: "costas", muscle: "costas" },
  costas_meio:     { nm: "Meio das costas (espessura)", region: "costas", muscle: "costas" },
  trapezio:        { nm: "Trapézio superior",           region: "costas", muscle: "costas" },
  lombar:          { nm: "Lombar",                      region: "costas", muscle: "costas" },
  biceps:          { nm: "Bíceps",                      region: "bracos", muscle: "biceps" },
  braquial:        { nm: "Braquial / braquiorradial",   region: "bracos", muscle: "biceps" },
  triceps_longa:   { nm: "Tríceps · cabeça longa",      region: "bracos", muscle: "triceps" },
  triceps_lateral: { nm: "Tríceps · cabeça lateral",    region: "bracos", muscle: "triceps" },
  antebraco:       { nm: "Antebraço",                   region: "bracos", muscle: "biceps" },
  peito_sup:       { nm: "Peito superior",              region: "peito",  muscle: "peito" },
  peito_medio:     { nm: "Peito médio",                 region: "peito",  muscle: "peito" },
  quad:            { nm: "Quadríceps",                  region: "pernas", muscle: "quad" },
  isquio:          { nm: "Posterior de coxa",           region: "pernas", muscle: "isquio" },
  gluteo:          { nm: "Glúteo",                      region: "pernas", muscle: "gluteo" },
  adutores:        { nm: "Adutores",                    region: "pernas", muscle: "quad" },
  pant:            { nm: "Panturrilha",                 region: "pernas", muscle: "pant" },
  abdomen:         { nm: "Abdômen",                     region: "core",   muscle: "core" },
  obliquos:        { nm: "Oblíquos",                    region: "core",   muscle: "core" },
};
export const SUB_MUSCLE_IDS = Object.keys(SUB_MUSCLES) as SubMuscleId[];
export const REGIONS: Record<Region, string> = { ombro: "Ombro", costas: "Costas", bracos: "Braços", peito: "Peito", pernas: "Pernas", core: "Core" };

export type EquipmentCat = "livres" | "cabos" | "maquinas" | "corpo" | "cardio";
export interface Equipment { id: string; nm: string; cat: EquipmentCat; img: string; busy: 0 | 1 | 2; note?: string }
// busy = quanto costuma ficar ocupado (0 nunca, 2 sempre). Usado no modo "academia cheia".
// img = ID do catálogo cuja imagem representa o aparelho.
export const EQUIPMENT: Equipment[] = [
  { id: "halteres", nm: "Halteres", cat: "livres", img: "Dumbbell_Bicep_Curl", busy: 0 },
  { id: "barra", nm: "Barra olímpica", cat: "livres", img: "Barbell_Curl", busy: 1 },
  { id: "ez", nm: "Barra W", cat: "livres", img: "EZ-Bar_Curl", busy: 0 },
  { id: "banco", nm: "Banco ajustável", cat: "livres", img: "Incline_Dumbbell_Press", busy: 1 },
  { id: "rack", nm: "Rack / gaiola", cat: "livres", img: "Barbell_Full_Squat", busy: 2 },
  { id: "scott", nm: "Banco Scott", cat: "livres", img: "Preacher_Curl", busy: 0 },
  { id: "kettle", nm: "Kettlebell", cat: "livres", img: "Goblet_Squat", busy: 0 },
  { id: "elastico", nm: "Elásticos", cat: "livres", img: "Lateral_Raise_-_With_Bands", busy: 0 },
  { id: "polia", nm: "Polia / crossover", cat: "cabos", img: "Cable_Crossover", busy: 2 },
  { id: "puxador", nm: "Puxador alto", cat: "cabos", img: "Wide-Grip_Lat_Pulldown", busy: 1 },
  { id: "remada", nm: "Remada baixa", cat: "cabos", img: "Seated_Cable_Rows", busy: 1 },
  { id: "legpress", nm: "Leg press 45°", cat: "maquinas", img: "Leg_Press", busy: 2 },
  { id: "hack", nm: "Hack", cat: "maquinas", img: "Hack_Squat", busy: 1 },
  { id: "smith", nm: "Smith", cat: "maquinas", img: "Smith_Machine_Squat", busy: 1 },
  { id: "extensora", nm: "Cadeira extensora", cat: "maquinas", img: "Leg_Extensions", busy: 1 },
  { id: "flexora", nm: "Mesa flexora", cat: "maquinas", img: "Lying_Leg_Curls", busy: 1 },
  { id: "flexora_sent", nm: "Cadeira flexora", cat: "maquinas", img: "Seated_Leg_Curl", busy: 1 },
  { id: "peck", nm: "Voador / peck deck", cat: "maquinas", img: "Butterfly", busy: 1 },
  { id: "supmaq", nm: "Supino máquina", cat: "maquinas", img: "Leverage_Chest_Press", busy: 1 },
  { id: "desenv", nm: "Desenvolvimento máquina", cat: "maquinas", img: "Machine_Shoulder_Military_Press", busy: 1 },
  { id: "remmaq", nm: "Remada máquina", cat: "maquinas", img: "Leverage_Iso_Row", busy: 1 },
  { id: "roscamaq", nm: "Rosca máquina", cat: "maquinas", img: "Machine_Bicep_Curl", busy: 0 },
  { id: "tricmaq", nm: "Tríceps máquina", cat: "maquinas", img: "Machine_Triceps_Extension", busy: 0 },
  { id: "pant", nm: "Panturrilha em pé", cat: "maquinas", img: "Standing_Calf_Raises", busy: 0 },
  { id: "pantsent", nm: "Panturrilha sentado", cat: "maquinas", img: "Seated_Calf_Raise", busy: 0 },
  { id: "adutora", nm: "Cadeira adutora", cat: "maquinas", img: "Thigh_Adductor", busy: 1 },
  { id: "abdutora", nm: "Cadeira abdutora", cat: "maquinas", img: "Thigh_Abductor", busy: 1 },
  { id: "cavalinho", nm: "Remada cavalinho (T-bar)", cat: "maquinas", img: "T-Bar_Row_with_Handle", busy: 1 },
  { id: "hiper", nm: "Banco de hiperextensão (romano)", cat: "maquinas", img: "Hyperextensions_Back_Extensions", busy: 0 },
  { id: "abdmaq", nm: "Abdominal na máquina", cat: "maquinas", img: "Ab_Crunch_Machine", busy: 0 },
  { id: "roda", nm: "Roda abdominal", cat: "livres", img: "Ab_Roller", busy: 0 },
  { id: "barrafixa", nm: "Barra fixa", cat: "corpo", img: "Pullups", busy: 0 },
  { id: "paralela", nm: "Paralelas", cat: "corpo", img: "Dips_-_Triceps_Version", busy: 0 },
];
export const EQUIPMENT_BY_ID: Record<string, Equipment> = Object.fromEntries(EQUIPMENT.map((e) => [e.id, e]));

/** Texto didático por exercício (pt-BR). Opcional: o conteúdo é preenchido pelas tarefas de conteúdo do catálogo. */
export interface ExerciseInfo {
  howTo?: string[]; tips?: string[]; mistakes?: string[];
  subMuscles?: SubMuscleId[]; secondary?: SubMuscleId[];
  aliases?: string[];
}
/** Imagens: 0 = img/ex/<src>.webp (início, existe para todos os de força do M0); 1 = img/ex/<src>-1.webp (fim, quando houver). */
export type ImageIdx = 0 | 1;

export interface Exercise extends ExerciseInfo {
  id: string; nm: string; m: MuscleId; eq: string[]; kind: Kind;
  r: [number, number]; rest: number; stretch?: boolean; fat: 1 | 2 | 3;
  joints: Partial<Record<Joint, 1 | 2 | 3>>;
  fam?: string; ratio?: number; inc: number; prehab?: Joint[];
  /** Fora da montagem automática (acessório/isolado demais); continua na biblioteca e na edição manual. */
  planOff?: boolean;
  type: "forca";
  images: ImageIdx[];
}

const X = (id: string, nm: string, m: MuscleId, eq: string[], kind: Kind, r: [number, number], rest: number,
  fat: 1 | 2 | 3, joints: Exercise["joints"], extra: Partial<Exercise> = {}): Exercise =>
  ({ id, nm, m, eq, kind, r, rest, fat, joints, inc: 2.5, type: "forca", images: [0, 1], ...extra });

// Ordem dentro do músculo = preferência padrão (alongado e estável primeiro).
// Ordem do M0 preservada (a montagem do treino depende dela). Exercícios novos vão no fim.
const RAW: Exercise[] = [
  X("Incline_Dumbbell_Press", "Supino inclinado com halteres", "peito", ["halteres", "banco"], "livre", [8, 12], 120, 2, { ombro: 2 }, { stretch: true, fam: "press_h", ratio: 0.36, inc: 2 }),
  X("Leverage_Chest_Press", "Supino reto na máquina", "peito", ["supmaq"], "maquina", [8, 12], 90, 1, { ombro: 1 }, { fam: "press_h", ratio: 0.9, inc: 5 }),
  X("Butterfly", "Voador (peck deck)", "peito", ["peck"], "maquina", [10, 15], 75, 1, { ombro: 1 }, { stretch: true, inc: 5 }),
  X("Cable_Crossover", "Crossover na polia alta", "peito", ["polia"], "cabo", [12, 15], 75, 1, { ombro: 1 }, { stretch: true }),
  X("Dumbbell_Bench_Press", "Supino reto com halteres", "peito", ["halteres", "banco"], "livre", [8, 12], 120, 2, { ombro: 2 }, { fam: "press_h", ratio: 0.4, inc: 2 }),
  X("Barbell_Bench_Press_-_Medium_Grip", "Supino reto com barra", "peito", ["barra", "banco", "rack"], "livre", [6, 10], 150, 3, { ombro: 3, punho: 1 }, { fam: "press_h", ratio: 1 }),
  X("Pushups", "Flexão de braço", "peito", [], "corpo", [8, 20], 75, 1, { punho: 1, ombro: 1 }),

  X("Wide-Grip_Lat_Pulldown", "Puxada frontal aberta", "costas", ["puxador"], "cabo", [8, 12], 120, 2, { ombro: 1, cotovelo: 1 }, { stretch: true, fam: "pull_v", ratio: 1, inc: 5 }),
  X("Seated_Cable_Rows", "Remada baixa com triângulo", "costas", ["remada"], "cabo", [8, 12], 120, 2, { lombar: 1 }, { fam: "row", ratio: 1, inc: 5 }),
  X("Leverage_Iso_Row", "Remada articulada", "costas", ["remmaq"], "maquina", [8, 12], 90, 1, {}, { fam: "row", ratio: 1, inc: 5 }),
  X("One-Arm_Dumbbell_Row", "Remada unilateral com halter (serrote)", "costas", ["halteres", "banco"], "livre", [8, 12], 90, 2, { lombar: 1 }, { stretch: true, fam: "row", ratio: 0.5, inc: 2 }),
  X("Pullups", "Barra fixa pronada", "costas", ["barrafixa"], "corpo", [5, 10], 120, 2, { ombro: 2, cotovelo: 2 }, { stretch: true }),
  X("Bent_Over_Barbell_Row", "Remada curvada com barra", "costas", ["barra"], "livre", [6, 10], 120, 3, { lombar: 3 }, { fam: "row", ratio: 1.1 }),
  X("Straight-Arm_Pulldown", "Pulldown com braços estendidos", "costas", ["polia"], "cabo", [12, 15], 75, 1, { ombro: 1 }, { stretch: true }),

  X("Cable_Seated_Lateral_Raise", "Elevação lateral na polia", "ombro", ["polia"], "cabo", [12, 20], 60, 1, { ombro: 1 }, { stretch: true, fam: "lateral", ratio: 1, inc: 1.25 }),
  X("Side_Lateral_Raise", "Elevação lateral com halteres", "ombro", ["halteres"], "livre", [12, 20], 60, 1, { ombro: 1 }, { fam: "lateral", ratio: 1.6, inc: 1 }),
  X("Machine_Shoulder_Military_Press", "Desenvolvimento na máquina", "ombro", ["desenv"], "maquina", [8, 12], 120, 2, { ombro: 2 }, { fam: "press_v", ratio: 1, inc: 5 }),
  X("Seated_Dumbbell_Press", "Desenvolvimento com halteres", "ombro", ["halteres", "banco"], "livre", [8, 12], 120, 2, { ombro: 2 }, { fam: "press_v", ratio: 0.4, inc: 2 }),
  X("Lateral_Raise_-_With_Bands", "Elevação lateral com elástico", "ombro", ["elastico"], "livre", [15, 25], 60, 1, {}, { inc: 0 }),
  X("Dumbbell_Scaption", "Elevação em Y (scaption)", "ombro", ["halteres"], "livre", [12, 20], 60, 1, { ombro: 1 }, { fam: "lateral", ratio: 1.4, inc: 1, prehab: ["escapula", "ombro"] }),

  X("Face_Pull", "Face pull na polia", "post", ["polia"], "cabo", [12, 20], 60, 1, {}, { prehab: ["escapula", "ombro", "cervical"] }),
  X("Reverse_Flyes", "Crucifixo inverso com halteres", "post", ["halteres"], "livre", [12, 20], 60, 1, {}, { inc: 1 }),
  X("Reverse_Machine_Flyes", "Crucifixo inverso na máquina", "post", ["peck"], "maquina", [12, 20], 60, 1, {}, { inc: 5 }),
  X("Band_Pull_Apart", "Abertura com elástico (pull apart)", "post", ["elastico"], "livre", [15, 25], 45, 1, {}, { inc: 0, prehab: ["escapula", "ombro"] }),
  X("External_Rotation_with_Band", "Rotação externa com elástico", "post", ["elastico"], "livre", [12, 20], 45, 1, {}, { inc: 0, prehab: ["ombro"] }),
  X("Scapular_Pull-Up", "Retração escapular na barra", "costas", ["barrafixa"], "corpo", [8, 12], 60, 1, {}, { inc: 0, prehab: ["escapula"] }),

  X("Incline_Dumbbell_Curl", "Rosca inclinada com halteres", "biceps", ["halteres", "banco"], "livre", [8, 12], 75, 1, { cotovelo: 1, ombro: 1 }, { stretch: true, fam: "curl", ratio: 0.4, inc: 1 }),
  X("Preacher_Curl", "Rosca Scott com barra W", "biceps", ["scott", "ez"], "livre", [8, 12], 75, 1, { cotovelo: 2 }, { fam: "curl", ratio: 0.8 }),
  X("Hammer_Curls", "Rosca martelo", "biceps", ["halteres"], "livre", [10, 15], 75, 1, {}, { fam: "curl", ratio: 0.45, inc: 1 }),
  X("High_Cable_Curls", "Rosca na polia alta (duplo bíceps)", "biceps", ["polia"], "cabo", [12, 15], 60, 1, { cotovelo: 1 }, { fam: "curl", ratio: 0.5 }),
  X("Machine_Bicep_Curl", "Rosca na máquina", "biceps", ["roscamaq"], "maquina", [10, 15], 60, 1, { cotovelo: 1 }, { fam: "curl", ratio: 0.9, inc: 5 }),
  X("EZ-Bar_Curl", "Rosca direta com barra W", "biceps", ["ez"], "livre", [8, 12], 90, 1, { cotovelo: 1 }, { fam: "curl", ratio: 1 }),
  X("Barbell_Curl", "Rosca direta com barra reta", "biceps", ["barra"], "livre", [8, 12], 90, 1, { punho: 2, cotovelo: 1 }, { fam: "curl", ratio: 1 }),

  X("Cable_Rope_Overhead_Triceps_Extension", "Tríceps francês na polia", "triceps", ["polia"], "cabo", [10, 15], 75, 1, { cotovelo: 2, ombro: 1 }, { stretch: true, fam: "ext", ratio: 0.8 }),
  X("Triceps_Pushdown", "Tríceps pulley com barra", "triceps", ["polia"], "cabo", [10, 15], 60, 1, { cotovelo: 1 }, { fam: "ext", ratio: 1 }),
  X("Machine_Triceps_Extension", "Tríceps na máquina", "triceps", ["tricmaq"], "maquina", [10, 15], 60, 1, { cotovelo: 1 }, { fam: "ext", ratio: 1, inc: 5 }),
  X("EZ-Bar_Skullcrusher", "Tríceps testa com barra W", "triceps", ["ez", "banco"], "livre", [8, 12], 90, 1, { cotovelo: 3 }, { stretch: true, fam: "ext", ratio: 0.9 }),
  X("Dips_-_Triceps_Version", "Paralelas (mergulho)", "triceps", ["paralela"], "corpo", [6, 12], 120, 2, { ombro: 3, cotovelo: 2 }),
  X("Close-Grip_Barbell_Bench_Press", "Supino fechado", "triceps", ["barra", "banco", "rack"], "livre", [6, 10], 120, 2, { punho: 2, ombro: 2 }, { fam: "press_h", ratio: 0.85 }),

  X("Hack_Squat", "Agachamento hack", "quad", ["hack"], "maquina", [8, 12], 150, 3, { joelho: 2 }, { stretch: true, fam: "squat", ratio: 1.1, inc: 5 }),
  X("Leg_Press", "Leg press 45°", "quad", ["legpress"], "maquina", [10, 15], 150, 2, { joelho: 2, lombar: 1 }, { fam: "squat", ratio: 2.5, inc: 10 }),
  X("Smith_Machine_Squat", "Agachamento no Smith", "quad", ["smith"], "maquina", [8, 12], 150, 3, { joelho: 2, lombar: 2 }, { fam: "squat", ratio: 0.9, inc: 5 }),
  X("Barbell_Full_Squat", "Agachamento livre com barra", "quad", ["rack", "barra"], "livre", [6, 10], 180, 3, { joelho: 2, lombar: 3, quadril: 2 }, { stretch: true, fam: "squat", ratio: 1 }),
  X("Leg_Extensions", "Cadeira extensora", "quad", ["extensora"], "maquina", [12, 15], 75, 1, { joelho: 2 }, { inc: 5 }),
  X("Goblet_Squat", "Agachamento goblet", "quad", ["halteres"], "livre", [10, 15], 90, 2, { joelho: 1 }, { fam: "squat", ratio: 0.35, inc: 2 }),
  X("Dumbbell_Lunges", "Afundo com halteres (passada)", "quad", ["halteres"], "livre", [8, 12], 90, 2, { joelho: 2 }, { inc: 2 }),

  X("Romanian_Deadlift", "Stiff com barra (terra romeno)", "isquio", ["barra"], "livre", [8, 12], 150, 3, { lombar: 2 }, { stretch: true, fam: "hinge", ratio: 1 }),
  X("Seated_Leg_Curl", "Cadeira flexora", "isquio", ["flexora_sent"], "maquina", [10, 15], 75, 1, { joelho: 1 }, { stretch: true, inc: 5 }),
  X("Lying_Leg_Curls", "Mesa flexora", "isquio", ["flexora"], "maquina", [10, 15], 75, 1, { joelho: 1 }, { inc: 5 }),
  X("Stiff-Legged_Dumbbell_Deadlift", "Stiff com halteres", "isquio", ["halteres"], "livre", [8, 12], 120, 2, { lombar: 2 }, { stretch: true, fam: "hinge", ratio: 0.4, inc: 2 }),

  X("Barbell_Hip_Thrust", "Elevação pélvica com barra", "gluteo", ["barra", "banco"], "livre", [8, 12], 120, 2, { quadril: 1 }, { inc: 5 }),
  X("Dumbbell_Rear_Lunge", "Afundo reverso com halteres", "gluteo", ["halteres"], "livre", [8, 12], 90, 2, { joelho: 1 }, { inc: 2 }),
  X("Butt_Lift_Bridge", "Ponte de glúteo no chão", "gluteo", [], "corpo", [12, 20], 60, 1, {}, { inc: 0, prehab: ["lombar", "quadril", "joelho"] }),

  X("Standing_Calf_Raises", "Panturrilha em pé na máquina", "pant", ["pant"], "maquina", [10, 15], 60, 1, {}, { stretch: true, inc: 5 }),
  X("Calf_Press_On_The_Leg_Press_Machine", "Panturrilha no leg press", "pant", ["legpress"], "maquina", [12, 15], 60, 1, {}, { stretch: true, inc: 10 }),
  X("Seated_Calf_Raise", "Panturrilha sentado (banco solear)", "pant", ["pantsent"], "maquina", [12, 20], 60, 1, {}, { inc: 5 }),
  X("Standing_Dumbbell_Calf_Raise", "Panturrilha em pé com halter", "pant", ["halteres"], "livre", [12, 20], 60, 1, {}, { inc: 2 }),

  X("Cable_Crunch", "Abdominal na polia (ajoelhado)", "core", ["polia"], "cabo", [10, 15], 60, 1, {}, {}),
  X("Hanging_Leg_Raise", "Elevação de pernas na barra", "core", ["barrafixa"], "corpo", [8, 15], 60, 1, { lombar: 1 }, { inc: 0 }),
  X("Dead_Bug", "Dead bug", "core", [], "corpo", [8, 12], 45, 1, {}, { inc: 0, prehab: ["lombar", "quadril"] }),
  X("Plank", "Prancha", "core", [], "corpo", [30, 60], 45, 1, { lombar: 1 }, { inc: 0, prehab: ["lombar"] }),

  // ---- ampliação (#22): ombro lateral, bíceps, tríceps, costas e máquinas. Vai no fim: não muda a preferência acima. ----
  X("Arnold_Dumbbell_Press", "Desenvolvimento Arnold", "ombro", ["halteres", "banco"], "livre", [8, 12], 120, 2, { ombro: 2 }, { fam: "press_v", ratio: 0.3, inc: 2 }),
  X("Standing_Military_Press", "Desenvolvimento militar em pé com barra", "ombro", ["barra", "rack"], "livre", [6, 10], 150, 3, { ombro: 3, lombar: 1 }, { fam: "press_v", ratio: 0.8 }),
  X("Seated_Side_Lateral_Raise", "Elevação lateral sentado com halteres", "ombro", ["halteres", "banco"], "livre", [12, 20], 60, 1, { ombro: 1 }, { fam: "lateral", ratio: 1.5, inc: 1 }),
  X("One-Arm_Incline_Lateral_Raise", "Elevação lateral inclinada com halter (unilateral)", "ombro", ["halteres", "banco"], "livre", [12, 20], 60, 1, { ombro: 1 }, { stretch: true, fam: "lateral", ratio: 1.5, inc: 1 }),
  X("Standing_Low-Pulley_Deltoid_Raise", "Elevação lateral na polia baixa (unilateral)", "ombro", ["polia"], "cabo", [12, 20], 60, 1, { ombro: 1 }, { stretch: true, fam: "lateral", ratio: 1, inc: 1.25 }),
  X("Front_Dumbbell_Raise", "Elevação frontal com halteres", "ombro", ["halteres"], "livre", [10, 15], 60, 1, { ombro: 1 }, { inc: 1, planOff: true }),
  X("Front_Cable_Raise", "Elevação frontal na polia", "ombro", ["polia"], "cabo", [10, 15], 60, 1, { ombro: 1 }, { inc: 1.25, planOff: true }),
  X("Upright_Barbell_Row", "Remada alta com barra", "ombro", ["barra"], "livre", [8, 12], 90, 2, { ombro: 3, punho: 2 }, { planOff: true }),

  X("Cable_Rear_Delt_Fly", "Crucifixo inverso na polia (cabos cruzados)", "post", ["polia"], "cabo", [12, 20], 60, 1, {}, { inc: 1.25 }),
  X("Bent_Over_Dumbbell_Rear_Delt_Raise_With_Head_On_Bench", "Crucifixo inverso apoiado no banco", "post", ["halteres", "banco"], "livre", [12, 20], 60, 1, {}, { inc: 1 }),
  X("Cable_Rope_Rear-Delt_Rows", "Remada para ombro posterior na corda", "post", ["polia"], "cabo", [12, 20], 60, 1, { ombro: 1 }, { inc: 1.25 }),

  X("Dumbbell_Bicep_Curl", "Rosca direta com halteres", "biceps", ["halteres"], "livre", [8, 12], 75, 1, { cotovelo: 1 }, { fam: "curl", ratio: 0.4, inc: 1 }),
  X("Cable_Preacher_Curl", "Rosca Scott na polia", "biceps", ["polia", "scott"], "cabo", [10, 15], 60, 1, { cotovelo: 2 }, { fam: "curl", ratio: 0.7 }),
  X("Machine_Preacher_Curls", "Rosca Scott na máquina", "biceps", ["roscamaq"], "maquina", [10, 15], 60, 1, { cotovelo: 1 }, { fam: "curl", ratio: 0.9, inc: 5 }),
  X("Standing_Biceps_Cable_Curl", "Rosca direta na polia baixa", "biceps", ["polia"], "cabo", [10, 15], 60, 1, { cotovelo: 1 }, { fam: "curl", ratio: 0.6 }),
  X("Cable_Hammer_Curls_-_Rope_Attachment", "Rosca martelo na polia com corda", "biceps", ["polia"], "cabo", [10, 15], 60, 1, {}, { fam: "curl", ratio: 0.5 }),
  X("Spider_Curl", "Rosca spider", "biceps", ["ez", "banco"], "livre", [10, 15], 60, 1, { cotovelo: 1 }, { fam: "curl", ratio: 0.7 }),
  X("Concentration_Curls", "Rosca concentrada", "biceps", ["halteres", "banco"], "livre", [10, 15], 60, 1, { cotovelo: 1 }, { fam: "curl", ratio: 0.4, inc: 1 }),
  X("Zottman_Curl", "Rosca Zottman", "biceps", ["halteres"], "livre", [10, 12], 60, 1, { punho: 1, cotovelo: 1 }, { inc: 1, planOff: true }),
  X("Reverse_Barbell_Curl", "Rosca inversa com barra W", "biceps", ["ez"], "livre", [10, 15], 60, 1, { punho: 2, cotovelo: 1 }, { planOff: true }),

  X("Triceps_Pushdown_-_Rope_Attachment", "Tríceps corda na polia", "triceps", ["polia"], "cabo", [10, 15], 60, 1, { cotovelo: 1 }, { fam: "ext", ratio: 0.9 }),
  X("Standing_Dumbbell_Triceps_Extension", "Tríceps francês com halter", "triceps", ["halteres"], "livre", [10, 15], 75, 1, { cotovelo: 2, ombro: 1 }, { stretch: true, fam: "ext", ratio: 0.4, inc: 1 }),
  X("Standing_Overhead_Barbell_Triceps_Extension", "Tríceps francês com barra W em pé", "triceps", ["ez"], "livre", [8, 12], 75, 1, { cotovelo: 2, ombro: 1, lombar: 1 }, { stretch: true, fam: "ext", ratio: 0.7 }),
  X("Lying_Dumbbell_Tricep_Extension", "Tríceps testa com halteres", "triceps", ["halteres", "banco"], "livre", [8, 12], 90, 1, { cotovelo: 2 }, { stretch: true, fam: "ext", ratio: 0.35, inc: 1 }),
  X("Reverse_Grip_Triceps_Pushdown", "Tríceps pulley com pegada supinada", "triceps", ["polia"], "cabo", [10, 15], 60, 1, { cotovelo: 1, punho: 1 }, { fam: "ext", ratio: 0.7 }),
  X("Cable_One_Arm_Tricep_Extension", "Tríceps unilateral na polia", "triceps", ["polia"], "cabo", [10, 15], 60, 1, { cotovelo: 1 }, { inc: 1.25 }),
  X("Tricep_Dumbbell_Kickback", "Tríceps coice com halter", "triceps", ["halteres"], "livre", [12, 15], 60, 1, {}, { inc: 1 }),
  X("Bench_Dips", "Mergulho no banco", "triceps", ["banco"], "corpo", [8, 15], 90, 2, { ombro: 3, punho: 2, cotovelo: 1 }, { inc: 0 }),

  X("Close-Grip_Front_Lat_Pulldown", "Puxada fechada com triângulo", "costas", ["puxador"], "cabo", [8, 12], 120, 2, { cotovelo: 1 }, { stretch: true, fam: "pull_v", ratio: 1, inc: 5 }),
  X("Underhand_Cable_Pulldowns", "Puxada supinada", "costas", ["puxador"], "cabo", [8, 12], 120, 2, { cotovelo: 2 }, { fam: "pull_v", ratio: 0.95, inc: 5 }),
  X("One_Arm_Lat_Pulldown", "Puxada unilateral na polia", "costas", ["polia"], "cabo", [10, 12], 90, 1, { ombro: 1 }, { stretch: true, fam: "pull_v", ratio: 0.55, inc: 2.5 }),
  X("Chin-Up", "Barra fixa supinada", "costas", ["barrafixa"], "corpo", [5, 10], 120, 2, { ombro: 2, cotovelo: 2 }, { inc: 0 }),
  X("T-Bar_Row_with_Handle", "Remada cavalinho (T-bar)", "costas", ["cavalinho"], "maquina", [8, 12], 120, 2, { lombar: 2 }, { fam: "row", ratio: 0.9, inc: 5 }),
  X("Seated_One-arm_Cable_Pulley_Rows", "Remada baixa unilateral", "costas", ["remada"], "cabo", [10, 12], 90, 1, {}, { fam: "row", ratio: 0.5, inc: 2.5 }),
  X("Bent_Over_Two-Dumbbell_Row", "Remada curvada com halteres", "costas", ["halteres"], "livre", [8, 12], 90, 2, { lombar: 2 }, { fam: "row", ratio: 0.4, inc: 2 }),
  X("Inverted_Row", "Remada invertida (barra baixa no Smith)", "costas", ["smith"], "corpo", [8, 15], 90, 1, { ombro: 1 }, { inc: 0 }),
  X("Bent-Arm_Dumbbell_Pullover", "Pullover com halter", "costas", ["halteres", "banco"], "livre", [10, 15], 75, 1, { ombro: 2 }, { stretch: true, inc: 2 }),
  X("Barbell_Shrug", "Encolhimento com barra", "costas", ["barra"], "livre", [10, 15], 60, 1, {}, { inc: 5, planOff: true }),
  X("Hyperextensions_Back_Extensions", "Extensão lombar no banco romano", "costas", ["hiper"], "corpo", [10, 15], 60, 1, { lombar: 2 }, { inc: 0, planOff: true }),

  X("Barbell_Incline_Bench_Press_-_Medium_Grip", "Supino inclinado com barra", "peito", ["barra", "banco", "rack"], "livre", [6, 10], 150, 3, { ombro: 3, punho: 1 }, { fam: "press_h", ratio: 0.85 }),
  X("Leverage_Incline_Chest_Press", "Supino inclinado na máquina", "peito", ["supmaq"], "maquina", [8, 12], 90, 1, { ombro: 1 }, { fam: "press_h", ratio: 0.8, inc: 5 }),
  X("Dumbbell_Flyes", "Crucifixo reto com halteres", "peito", ["halteres", "banco"], "livre", [10, 15], 75, 1, { ombro: 2 }, { stretch: true, inc: 1 }),
  X("Incline_Dumbbell_Flyes", "Crucifixo inclinado com halteres", "peito", ["halteres", "banco"], "livre", [10, 15], 75, 1, { ombro: 2 }, { stretch: true, inc: 1 }),
  X("Low_Cable_Crossover", "Crossover na polia baixa", "peito", ["polia"], "cabo", [12, 15], 75, 1, { ombro: 1 }, {}),
  X("Smith_Machine_Incline_Bench_Press", "Supino inclinado no Smith", "peito", ["smith", "banco"], "maquina", [8, 12], 120, 2, { ombro: 2, punho: 1 }, { fam: "press_h", ratio: 0.8, inc: 5 }),

  X("Front_Barbell_Squat", "Agachamento frontal com barra", "quad", ["rack", "barra"], "livre", [6, 10], 180, 3, { joelho: 2, punho: 2, lombar: 2 }, { stretch: true, fam: "squat", ratio: 0.75 }),
  X("Split_Squat_with_Dumbbells", "Afundo estático com halteres", "quad", ["halteres"], "livre", [8, 12], 90, 2, { joelho: 2 }, { inc: 2 }),
  X("Dumbbell_Step_Ups", "Subida no banco (step-up) com halteres", "quad", ["halteres", "banco"], "livre", [8, 12], 90, 2, { joelho: 2 }, { inc: 2 }),
  X("Thigh_Adductor", "Cadeira adutora", "quad", ["adutora"], "maquina", [12, 20], 60, 1, { quadril: 1 }, { inc: 5 }),
  X("Barbell_Deadlift", "Levantamento terra", "isquio", ["barra"], "livre", [5, 8], 180, 3, { lombar: 3, quadril: 2 }, { fam: "hinge", ratio: 1.25, planOff: true }),
  X("Pull_Through", "Pull through na polia", "gluteo", ["polia"], "cabo", [10, 15], 75, 1, { lombar: 1 }, { inc: 2.5 }),
  X("Barbell_Glute_Bridge", "Ponte de glúteo com barra", "gluteo", ["barra"], "livre", [8, 12], 90, 2, { quadril: 1, lombar: 1 }, { inc: 5 }),
  X("One-Legged_Cable_Kickback", "Coice de glúteo na polia", "gluteo", ["polia"], "cabo", [10, 15], 60, 1, {}, { inc: 1.25 }),
  X("Thigh_Abductor", "Cadeira abdutora", "gluteo", ["abdutora"], "maquina", [12, 20], 60, 1, { quadril: 1 }, { inc: 5 }),
  X("Donkey_Calf_Raises", "Panturrilha burrinho", "pant", ["pant"], "maquina", [12, 20], 60, 1, {}, { stretch: true, inc: 5 }),

  X("Crunches", "Abdominal supra (crunch)", "core", [], "corpo", [12, 20], 45, 1, { lombar: 1 }, { inc: 0 }),
  X("Reverse_Crunch", "Abdominal infra (elevação de quadril)", "core", [], "corpo", [10, 15], 45, 1, { lombar: 1 }, { inc: 0 }),
  X("Ab_Crunch_Machine", "Abdominal na máquina", "core", ["abdmaq"], "maquina", [10, 15], 60, 1, {}, { inc: 5 }),
  X("Ab_Roller", "Roda abdominal", "core", ["roda"], "corpo", [8, 12], 60, 2, { lombar: 2, ombro: 1 }, { inc: 0 }),
];
/** Catálogo completo: dados do exercício + texto didático e músculos (catalog-info.ts). Imagens 0 (início) e 1 (fim). */
export const EXERCISES: Exercise[] = RAW.map((e) => ({ ...e, ...INFO[e.id] }));
export const EXERCISE_BY_ID: Record<string, Exercise> = Object.fromEntries(EXERCISES.map((e) => [e.id, e]));

// ---------- cardio ----------
export type CardioUnit = "min" | "km" | "kcal";
export type Intensity = "zona2" | "moderado" | "intervalado";
/** Os ids ("zona2", "moderado", "intervalado") ficam como estão no banco (CHECK da tabela); o que aparece é leve · moderado · forte. */
export const INTENSITIES: Record<Intensity, { nm: string; desc: string }> = {
  zona2: { nm: "Leve", desc: "dá para conversar em frases (zona 2); ~60–70% da FC máxima" },
  moderado: { nm: "Moderado", desc: "fala entrecortada; ~70–80% da FC máxima" },
  intervalado: { nm: "Forte", desc: "respiração pesada, só frases curtas; tiros, jogo corrido ou intervalado" },
};
/** Como a modalidade aparece na lista: máquina da academia, rua, água, esporte (jogo) ou tiros. */
export type CardioModo = "maquina" | "rua" | "agua" | "esporte" | "tiros";
export interface Cardio {
  id: string; nm: string; type: "cardio"; eq: string[];
  /** unidade principal de registro; `units` = todas aceitas. kcal é sempre estimada (MET × kg × horas). */
  metUnit: CardioUnit; units: CardioUnit[];
  met: Record<Intensity, number>;
  howTo?: string[]; tips?: string[]; mistakes?: string[];
  subMuscles?: SubMuscleId[]; secondary?: SubMuscleId[]; aliases?: string[];
  /** modalidade do registro de cardio (#44): ícone, grupo e se é esporte. Só as de `CARDIO` entram na biblioteca de exercícios. */
  modo?: CardioModo; icon?: string; fonte?: string;
  /** imagens do free-exercise-db (início e fim), geradas por scripts/catalogo-imagens.mjs */
  images: ImageIdx[];
  /** ID do free-exercise-db de onde vêm as imagens (padrão: o próprio id). */
  src?: string;
}
const K = (id: string, nm: string, eq: string[], units: CardioUnit[], met: [number, number, number], extra: Partial<Cardio> = {}): Cardio =>
  ({ id, nm, type: "cardio", eq, metUnit: "min", units, met: { zona2: met[0], moderado: met[1], intervalado: met[2] }, images: [0, 1], ...extra });
const CARDIO_RAW: Cardio[] = [
  K("Running_Treadmill", "Esteira · corrida", [], ["min", "km", "kcal"], [8, 9.8, 11.5], { modo: "maquina", icon: "run" }),
  K("Walking_Treadmill", "Esteira · caminhada inclinada", [], ["min", "km", "kcal"], [4.5, 6, 7], { modo: "maquina", icon: "walk" }),
  K("Bicycling_Stationary", "Bicicleta ergométrica", [], ["min", "km", "kcal"], [5.5, 7, 10], { modo: "maquina", icon: "bike" }),
  K("Recumbent_Bike", "Bicicleta horizontal", [], ["min", "km", "kcal"], [4.5, 6, 8], { modo: "maquina", icon: "bike" }),
  K("Elliptical_Trainer", "Elíptico (transport)", [], ["min", "kcal"], [5, 7, 9], { modo: "maquina", icon: "ellip" }),
  K("Stairmaster", "Escada (simulador)", [], ["min", "kcal"], [6, 9, 11], { modo: "maquina", icon: "stairs" }),
  K("Rowing_Stationary", "Remo ergômetro", [], ["min", "km", "kcal"], [6, 8.5, 11], { modo: "maquina", icon: "swim" }),
  K("Trail_Running_Walking", "Corrida / caminhada na rua", [], ["min", "km", "kcal"], [5, 9, 10.5], { modo: "rua", icon: "run" }),
  K("Rope_Jumping", "Pular corda", [], ["min", "kcal"], [8.8, 11, 12.3], { modo: "maquina", icon: "bolt" }),
  K("HIIT", "HIIT (intervalado)", [], ["min", "kcal"], [6, 8, 10], { metUnit: "min", src: "Battling_Ropes", modo: "tiros", icon: "bolt" }),
];
export const CARDIO: Cardio[] = CARDIO_RAW.map((c) => ({ ...c, ...CARDIO_INFO[c.id] }));

/** Modalidades só do registro de cardio (#44): sem imagem nem passo a passo, não entram na biblioteca de exercícios.
 *  MET do Compendium of Physical Activities (Ainsworth 2011; atualização 2024), [leve, moderado, forte]; onde o Compendium
 *  não separa o nível do meio, é o ponto entre os vizinhos. Ordem de grandeza, não medida. */
const E = (id: string, nm: string, units: CardioUnit[], met: [number, number, number], modo: CardioModo, icon: string, fonte: string): Cardio =>
  K(id, nm, [], units, met, { modo, icon, fonte, images: [] });
const CARDIO_EXTRA: Cardio[] = [
  E("Running_Outdoor", "Corrida (rua)", ["min", "km", "kcal"], [8.3, 9.8, 11.5], "rua", "run", "Compendium: corrida a 5, 6 e 7 mph"),
  E("Walking_Outdoor", "Caminhada (rua)", ["min", "km", "kcal"], [3, 4.3, 5], "rua", "walk", "Compendium (2,8 · 3,5 e 4 mph)"),
  E("Swimming", "Natação", ["min", "km", "kcal"], [5.8, 7, 9.8], "agua", "swim", "Compendium (nado livre leve e vigoroso)"),
  E("Sprints", "Tiro / sprints", ["min", "kcal"], [8, 10, 12.3], "tiros", "bolt", "Compendium (corrida intervalada; estimativa)"),
  E("Futsal", "Futsal", ["min", "kcal"], [7, 8.5, 10], "esporte", "ball", "Compendium (futebol casual e competitivo)"),
  E("Futebol", "Futebol", ["min", "kcal"], [7, 8.5, 10], "esporte", "ball", "Compendium (futebol casual e competitivo)"),
  E("Tenis", "Tênis", ["min", "kcal"], [6, 7.3, 8], "esporte", "ball", "Compendium (duplas, geral e simples)"),
  E("Beach_Tennis", "Beach tennis", ["min", "kcal"], [5, 6, 8], "esporte", "ball", "Compendium (rebater, duplas); estimativa"),
  E("Basquete", "Basquete", ["min", "kcal"], [4.5, 6.5, 8], "esporte", "ball", "Compendium (arremessos, geral e jogo)"),
  E("Volei", "Vôlei", ["min", "kcal"], [3, 4, 6], "esporte", "ball", "Compendium (recreativo, geral e competitivo)"),
  E("Luta", "Luta (judô, karatê, boxe, muay thai)", ["min", "kcal"], [5.3, 7.8, 10.3], "esporte", "ball", "Compendium (ritmo lento e moderado)"),
  E("Outro_Esporte", "Outro esporte", ["min", "kcal"], [4, 6, 8], "esporte", "ball", "estimativa genérica"),
];
export const CARDIO_BY_ID: Record<string, Cardio> = Object.fromEntries([...CARDIO, ...CARDIO_EXTRA].map((c) => [c.id, c]));
/** kcal estimada (MET × kg × horas). Ordem de grandeza, não medida. */
export const cardioKcal = (c: Cardio, intensity: Intensity, kg: number, minutes: number) =>
  Math.round(c.met[intensity] * kg * (minutes / 60));

// ---------- biblioteca (força + cardio) ----------
export type CatalogItem = Exercise | Cardio;
export const CATALOG: CatalogItem[] = [...EXERCISES, ...CARDIO];
export const CATALOG_BY_ID: Record<string, CatalogItem> = Object.fromEntries(CATALOG.map((e) => [e.id, e]));
/** Pasta das imagens do item (ID do free-exercise-db). */
export const imageSrc = (it: Pick<CatalogItem, "id"> & { src?: string }) => it.src ?? it.id;

// Regiões do mapa de dor (com lado) → articulação usada nas regras.
export const PAIN_REGIONS: { id: string; nm: string; joint: Joint; view: "frente" | "costas" }[] = [
  { id: "cervical", nm: "Pescoço / cervical", joint: "cervical", view: "costas" },
  { id: "ombro_e", nm: "Ombro esquerdo", joint: "ombro", view: "frente" },
  { id: "ombro_d", nm: "Ombro direito", joint: "ombro", view: "frente" },
  { id: "escapula_e", nm: "Escápula esquerda", joint: "escapula", view: "costas" },
  { id: "escapula_d", nm: "Escápula direita", joint: "escapula", view: "costas" },
  { id: "cotovelo_e", nm: "Cotovelo esquerdo", joint: "cotovelo", view: "frente" },
  { id: "cotovelo_d", nm: "Cotovelo direito", joint: "cotovelo", view: "frente" },
  { id: "punho_e", nm: "Punho esquerdo", joint: "punho", view: "frente" },
  { id: "punho_d", nm: "Punho direito", joint: "punho", view: "frente" },
  { id: "lombar", nm: "Lombar", joint: "lombar", view: "costas" },
  { id: "quadril_e", nm: "Quadril esquerdo", joint: "quadril", view: "frente" },
  { id: "quadril_d", nm: "Quadril direito", joint: "quadril", view: "frente" },
  { id: "joelho_e", nm: "Joelho esquerdo", joint: "joelho", view: "frente" },
  { id: "joelho_d", nm: "Joelho direito", joint: "joelho", view: "frente" },
  { id: "tornozelo_e", nm: "Tornozelo esquerdo", joint: "tornozelo", view: "frente" },
  { id: "tornozelo_d", nm: "Tornozelo direito", joint: "tornozelo", view: "frente" },
];
export const REGION_BY_ID = Object.fromEntries(PAIN_REGIONS.map((r) => [r.id, r]));
