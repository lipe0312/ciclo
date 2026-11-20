// #125 Banco de alternativas fixas por exercício de força: a fonte única do Trocar (Detalhe, folha Trocar e ciclo_treino_trocar).
// Cada exercício tem até 6 substitutos ORDENADOS, todos da mesma subparte principal (subMuscles[0]). Ordem: mesma porção do
// músculo e padrão de movimento > mesma posição de alongamento > praticidade. Critério: docs/09-base-cientifica.md
// (eficiência por subparte; alongado > encurtado; cabeça longa do tríceps e do bíceps pela posição do ombro).
// Não há IA em runtime: mudou o catálogo, mude aqui e suba BANCO_VERSAO. Validado em packages/core/test/alternativas-125.test.ts.
// Exercício ausente daqui (ou com a lista esgotada pela academia) cai na regra da #74 (trocar.ts).

export const BANCO_VERSAO = 1;

type Alt = readonly [id: string, motivo: string];
// motivos repetidos (curtos: vão para a IA no ciclo_treino_trocar)
const MAQ = "mesmo movimento na máquina, estável";
const HALT = "mesmo movimento com halteres, mais amplitude";
const BARRA = "mesmo movimento com barra, mais carga";
const ALONG = "mesma porção, mais alongado";
const CORPO = "sem aparelho, mesmo padrão";

export const BANCO_ALTERNATIVAS: Readonly<Record<string, readonly Alt[]>> = {
  // ---------- peito superior: empurrar ou aduzir com o braço subindo (banco inclinado, cabo de baixo) ----------
  Incline_Dumbbell_Press: [["Smith_Machine_Incline_Bench_Press", "mesmo ângulo inclinado, carga guiada"], ["Barbell_Incline_Bench_Press_-_Medium_Grip", "mesmo inclinado com barra"], ["Leverage_Incline_Chest_Press", "inclinado na máquina, estável"], ["Incline_Dumbbell_Flyes", "mesmo banco, isola o peito superior alongado"], ["Low_Cable_Crossover", "cabo de baixo para cima: mesma linha das fibras"]],
  "Barbell_Incline_Bench_Press_-_Medium_Grip": [["Smith_Machine_Incline_Bench_Press", "mesmo ângulo inclinado, carga guiada"], ["Incline_Dumbbell_Press", HALT], ["Leverage_Incline_Chest_Press", "inclinado na máquina, estável"], ["Incline_Dumbbell_Flyes", "mesmo banco, isola o peito superior"], ["Low_Cable_Crossover", "cabo de baixo para cima: mesma linha das fibras"]],
  Leverage_Incline_Chest_Press: [["Smith_Machine_Incline_Bench_Press", "mesmo ângulo, carga guiada"], ["Incline_Dumbbell_Press", HALT], ["Barbell_Incline_Bench_Press_-_Medium_Grip", BARRA], ["Low_Cable_Crossover", "cabo de baixo para cima: mesma linha das fibras"], ["Incline_Dumbbell_Flyes", "mesmo ângulo, isolado e alongado"]],
  Smith_Machine_Incline_Bench_Press: [["Leverage_Incline_Chest_Press", "mesmo inclinado guiado, na máquina"], ["Barbell_Incline_Bench_Press_-_Medium_Grip", "mesmo inclinado com barra livre"], ["Incline_Dumbbell_Press", HALT], ["Low_Cable_Crossover", "cabo de baixo para cima: mesma linha das fibras"], ["Incline_Dumbbell_Flyes", "mesmo ângulo, isolado e alongado"]],
  Incline_Dumbbell_Flyes: [["Low_Cable_Crossover", "mesma adução de baixo para cima, tensão constante"], ["Incline_Dumbbell_Press", "mesmo banco e alongamento, multiarticular"], ["Leverage_Incline_Chest_Press", "inclinado na máquina, estável"], ["Smith_Machine_Incline_Bench_Press", "mesmo ângulo, carga guiada"]],
  Low_Cable_Crossover: [["Incline_Dumbbell_Flyes", "mesma adução para cima, mais alongado"], ["Leverage_Incline_Chest_Press", "inclinado na máquina, estável"], ["Incline_Dumbbell_Press", "mesmo ângulo, multiarticular"], ["Smith_Machine_Incline_Bench_Press", "mesmo ângulo, carga guiada"]],

  // ---------- peito médio: empurrar ou aduzir na horizontal ----------
  Leverage_Chest_Press: [["Dumbbell_Bench_Press", HALT], ["Barbell_Bench_Press_-_Medium_Grip", BARRA], ["Pushups", CORPO], ["Butterfly", "mesmo peito médio, isolado na máquina"], ["Cable_Crossover", "mesmo peito médio, isolado no cabo"]],
  Butterfly: [["Cable_Crossover", "mesma adução, tensão no alongado"], ["Dumbbell_Flyes", "mesma adução com halteres, alongado"], ["Dumbbell_Bench_Press", "mesmo peito médio, multiarticular"], ["Leverage_Chest_Press", "mesmo peito médio na máquina"], ["Pushups", CORPO]],
  Cable_Crossover: [["Butterfly", "mesma adução na máquina, estável"], ["Dumbbell_Flyes", "mesma adução com halteres, alongado"], ["Dumbbell_Bench_Press", "mesmo peito médio, multiarticular"], ["Leverage_Chest_Press", "mesmo peito médio na máquina"]],
  Dumbbell_Bench_Press: [["Barbell_Bench_Press_-_Medium_Grip", BARRA], ["Leverage_Chest_Press", MAQ], ["Pushups", CORPO], ["Dumbbell_Flyes", "mesmo banco, isola o peito alongado"], ["Butterfly", "mesmo peito médio, isolado na máquina"]],
  "Barbell_Bench_Press_-_Medium_Grip": [["Dumbbell_Bench_Press", HALT], ["Leverage_Chest_Press", MAQ], ["Pushups", CORPO], ["Butterfly", "mesmo peito médio, isolado na máquina"]],
  Pushups: [["Dumbbell_Bench_Press", "mesmo empurrar horizontal com carga"], ["Leverage_Chest_Press", MAQ], ["Barbell_Bench_Press_-_Medium_Grip", BARRA], ["Cable_Crossover", "mesmo peito médio, isolado no cabo"]],
  Dumbbell_Flyes: [["Butterfly", "mesma adução na máquina, estável"], ["Cable_Crossover", "mesma adução no cabo"], ["Dumbbell_Bench_Press", "mesmo banco, multiarticular"], ["Leverage_Chest_Press", "mesmo peito médio na máquina"]],

  // ---------- dorsal: puxar na vertical / estender o ombro (largura) ----------
  "Wide-Grip_Lat_Pulldown": [["Pullups", "mesma puxada vertical, peso do corpo"], ["Close-Grip_Front_Lat_Pulldown", "mesma puxada, pegada fechada"], ["One_Arm_Lat_Pulldown", "mesma puxada, unilateral e alongada"], ["Underhand_Cable_Pulldowns", "mesma puxada, pegada supinada"], ["Chin-Up", "puxada vertical no peso do corpo"], ["One-Arm_Dumbbell_Row", "cotovelo para o quadril: dorsal alongado"]],
  Pullups: [["Wide-Grip_Lat_Pulldown", "mesma puxada no puxador, carga ajustável"], ["Chin-Up", "mesma barra, pegada supinada"], ["Close-Grip_Front_Lat_Pulldown", "mesma puxada, pegada fechada"], ["Underhand_Cable_Pulldowns", "puxada supinada no puxador"], ["One_Arm_Lat_Pulldown", "mesma puxada, unilateral"]],
  "Close-Grip_Front_Lat_Pulldown": [["Wide-Grip_Lat_Pulldown", "mesma puxada, pegada aberta"], ["Underhand_Cable_Pulldowns", "mesma puxada, pegada supinada"], ["One_Arm_Lat_Pulldown", "mesma puxada, unilateral e alongada"], ["Chin-Up", "puxada vertical no peso do corpo"], ["Pullups", "puxada vertical no peso do corpo"]],
  Underhand_Cable_Pulldowns: [["Chin-Up", "mesma pegada supinada, peso do corpo"], ["Close-Grip_Front_Lat_Pulldown", "mesma puxada, pegada neutra"], ["Wide-Grip_Lat_Pulldown", "mesma puxada, pegada aberta"], ["One_Arm_Lat_Pulldown", "mesma puxada, unilateral"]],
  "Chin-Up": [["Underhand_Cable_Pulldowns", "mesma pegada supinada, carga ajustável"], ["Pullups", "mesma barra, pegada pronada"], ["Close-Grip_Front_Lat_Pulldown", "puxada fechada no puxador"], ["Wide-Grip_Lat_Pulldown", "puxada aberta no puxador"]],
  One_Arm_Lat_Pulldown: [["Close-Grip_Front_Lat_Pulldown", "mesma puxada, bilateral"], ["Wide-Grip_Lat_Pulldown", "mesma puxada, bilateral"], ["One-Arm_Dumbbell_Row", "unilateral, cotovelo para o quadril"], ["Straight-Arm_Pulldown", "mesma extensão de ombro, dorsal isolado"], ["Underhand_Cable_Pulldowns", "puxada supinada no puxador"]],
  "One-Arm_Dumbbell_Row": [["One_Arm_Lat_Pulldown", "unilateral, cotovelo para o quadril"], ["Close-Grip_Front_Lat_Pulldown", "mesma linha do dorsal, bilateral"], ["Straight-Arm_Pulldown", "dorsal isolado, alongado"], ["Wide-Grip_Lat_Pulldown", "puxada vertical no puxador"], ["Bent-Arm_Dumbbell_Pullover", "dorsal alongado com halter"]],
  "Straight-Arm_Pulldown": [["Bent-Arm_Dumbbell_Pullover", "mesma extensão de ombro, dorsal alongado"], ["One_Arm_Lat_Pulldown", "dorsal unilateral no cabo"], ["Close-Grip_Front_Lat_Pulldown", "dorsal com puxada fechada"], ["Wide-Grip_Lat_Pulldown", "dorsal com puxada aberta"]],
  "Bent-Arm_Dumbbell_Pullover": [["Straight-Arm_Pulldown", "mesma extensão de ombro, no cabo"], ["One_Arm_Lat_Pulldown", "dorsal unilateral no cabo"], ["Wide-Grip_Lat_Pulldown", "dorsal com puxada aberta"], ["Close-Grip_Front_Lat_Pulldown", "dorsal com puxada fechada"]],

  // ---------- meio das costas: remadas (espessura) ----------
  Seated_Cable_Rows: [["Seated_One-arm_Cable_Pulley_Rows", "mesma remada sentada, unilateral"], ["Leverage_Iso_Row", "mesma remada na máquina, peito apoiado"], ["T-Bar_Row_with_Handle", "mesma remada com pegada neutra"], ["Bent_Over_Two-Dumbbell_Row", "mesma remada com halteres"], ["Inverted_Row", "remada no peso do corpo"], ["Bent_Over_Barbell_Row", "remada curvada, mais carga"]],
  Leverage_Iso_Row: [["Seated_Cable_Rows", "mesma remada sentada no cabo"], ["T-Bar_Row_with_Handle", "mesma remada com pegada neutra"], ["Seated_One-arm_Cable_Pulley_Rows", "mesma remada, unilateral"], ["Bent_Over_Two-Dumbbell_Row", "mesma remada com halteres"], ["Inverted_Row", "remada no peso do corpo"]],
  Bent_Over_Barbell_Row: [["Bent_Over_Two-Dumbbell_Row", "mesma remada curvada com halteres"], ["T-Bar_Row_with_Handle", "mesma remada curvada, apoio no aparelho"], ["Seated_Cable_Rows", "mesma remada, poupa a lombar"], ["Leverage_Iso_Row", "mesma remada, peito apoiado"], ["Inverted_Row", "remada no peso do corpo"]],
  "T-Bar_Row_with_Handle": [["Bent_Over_Barbell_Row", "mesma remada curvada com barra"], ["Leverage_Iso_Row", "mesma remada, peito apoiado"], ["Seated_Cable_Rows", "mesma remada sentada no cabo"], ["Bent_Over_Two-Dumbbell_Row", "mesma remada com halteres"]],
  "Seated_One-arm_Cable_Pulley_Rows": [["Seated_Cable_Rows", "mesma remada sentada, bilateral"], ["Leverage_Iso_Row", "mesma remada na máquina"], ["Bent_Over_Two-Dumbbell_Row", "mesma remada com halteres"], ["T-Bar_Row_with_Handle", "mesma remada com pegada neutra"]],
  "Bent_Over_Two-Dumbbell_Row": [["Bent_Over_Barbell_Row", "mesma remada curvada com barra"], ["T-Bar_Row_with_Handle", "mesma remada curvada, apoio no aparelho"], ["Leverage_Iso_Row", "mesma remada, peito apoiado (poupa a lombar)"], ["Seated_Cable_Rows", "mesma remada sentada no cabo"], ["Inverted_Row", "remada no peso do corpo"]],
  Inverted_Row: [["Seated_Cable_Rows", "mesma remada horizontal com carga"], ["Leverage_Iso_Row", "mesma remada na máquina"], ["Bent_Over_Two-Dumbbell_Row", "mesma remada com halteres"], ["T-Bar_Row_with_Handle", "mesma remada com pegada neutra"]],

  // ---------- ombro lateral: abdução (a prioridade do dono) ----------
  Side_Lateral_Raise: [["Cable_Seated_Lateral_Raise", "mesma elevação lateral; no cabo, tensão também embaixo"], ["Standing_Low-Pulley_Deltoid_Raise", "mesma elevação no cabo, unilateral e alongada"], ["One-Arm_Incline_Lateral_Raise", "mesma elevação, inclinada: mais alongado"], ["Seated_Side_Lateral_Raise", "mesma elevação sentado, sem impulso"], ["Lateral_Raise_-_With_Bands", "mesma elevação com elástico"], ["Dumbbell_Scaption", "elevação em Y, poupa o ombro"]],
  Cable_Seated_Lateral_Raise: [["Standing_Low-Pulley_Deltoid_Raise", "mesma elevação no cabo, unilateral"], ["One-Arm_Incline_Lateral_Raise", "também alongado, com halter"], ["Side_Lateral_Raise", "mesma elevação com halteres"], ["Seated_Side_Lateral_Raise", "mesma elevação sentado, sem impulso"], ["Lateral_Raise_-_With_Bands", "mesma elevação com elástico"]],
  "Standing_Low-Pulley_Deltoid_Raise": [["Cable_Seated_Lateral_Raise", "mesma elevação no cabo"], ["One-Arm_Incline_Lateral_Raise", "também unilateral e alongado"], ["Side_Lateral_Raise", "mesma elevação com halteres"], ["Seated_Side_Lateral_Raise", "mesma elevação sentado, sem impulso"], ["Lateral_Raise_-_With_Bands", "mesma elevação com elástico"]],
  "One-Arm_Incline_Lateral_Raise": [["Standing_Low-Pulley_Deltoid_Raise", "mesma elevação unilateral, alongada no cabo"], ["Cable_Seated_Lateral_Raise", "elevação no cabo, tensão no alongado"], ["Side_Lateral_Raise", "mesma elevação, em pé"], ["Seated_Side_Lateral_Raise", "mesma elevação sentado"]],
  Seated_Side_Lateral_Raise: [["Side_Lateral_Raise", "mesma elevação, em pé"], ["Cable_Seated_Lateral_Raise", "mesma elevação no cabo"], ["One-Arm_Incline_Lateral_Raise", ALONG], ["Standing_Low-Pulley_Deltoid_Raise", "mesma elevação no cabo, unilateral"], ["Lateral_Raise_-_With_Bands", "mesma elevação com elástico"]],
  "Lateral_Raise_-_With_Bands": [["Side_Lateral_Raise", "mesma elevação com halteres"], ["Cable_Seated_Lateral_Raise", "mesma elevação no cabo"], ["Standing_Low-Pulley_Deltoid_Raise", "mesma elevação no cabo, unilateral"], ["Seated_Side_Lateral_Raise", "mesma elevação sentado"]],
  Dumbbell_Scaption: [["Side_Lateral_Raise", "elevação lateral clássica"], ["Seated_Side_Lateral_Raise", "elevação lateral sentado"], ["Cable_Seated_Lateral_Raise", "elevação lateral no cabo"], ["Lateral_Raise_-_With_Bands", "elevação com elástico"]],
  Upright_Barbell_Row: [["Side_Lateral_Raise", "ombro lateral sem rodar o ombro"], ["Cable_Seated_Lateral_Raise", "ombro lateral no cabo"], ["Standing_Low-Pulley_Deltoid_Raise", "ombro lateral no cabo, unilateral"]],

  // ---------- ombro anterior: desenvolvimentos ----------
  Machine_Shoulder_Military_Press: [["Seated_Dumbbell_Press", HALT], ["Arnold_Dumbbell_Press", "desenvolvimento com rotação, halteres"], ["Standing_Military_Press", BARRA]],
  Seated_Dumbbell_Press: [["Machine_Shoulder_Military_Press", MAQ], ["Arnold_Dumbbell_Press", "mesmo desenvolvimento, com rotação"], ["Standing_Military_Press", BARRA]],
  Arnold_Dumbbell_Press: [["Seated_Dumbbell_Press", "mesmo desenvolvimento com halteres"], ["Machine_Shoulder_Military_Press", MAQ], ["Standing_Military_Press", BARRA]],
  Standing_Military_Press: [["Seated_Dumbbell_Press", "mesmo desenvolvimento, sentado com halteres"], ["Machine_Shoulder_Military_Press", MAQ], ["Arnold_Dumbbell_Press", "desenvolvimento com rotação"]],
  Front_Dumbbell_Raise: [["Seated_Dumbbell_Press", "ombro anterior com desenvolvimento"], ["Machine_Shoulder_Military_Press", "ombro anterior na máquina"], ["Arnold_Dumbbell_Press", "ombro anterior com rotação"]],
  Front_Cable_Raise: [["Machine_Shoulder_Military_Press", "ombro anterior na máquina"], ["Seated_Dumbbell_Press", "ombro anterior com desenvolvimento"], ["Arnold_Dumbbell_Press", "ombro anterior com rotação"]],

  // ---------- ombro posterior: abdução horizontal ----------
  Reverse_Flyes: [["Bent_Over_Dumbbell_Rear_Delt_Raise_With_Head_On_Bench", "mesmo crucifixo, cabeça apoiada (sem roubar)"], ["Reverse_Machine_Flyes", "mesmo crucifixo inverso na máquina"], ["Cable_Rear_Delt_Fly", "mesmo crucifixo no cabo, tensão constante"], ["Face_Pull", "posterior com rotação externa"], ["Cable_Rope_Rear-Delt_Rows", "remada alta para o posterior"], ["Band_Pull_Apart", "abertura com elástico"]],
  Reverse_Machine_Flyes: [["Cable_Rear_Delt_Fly", "mesmo crucifixo inverso no cabo"], ["Reverse_Flyes", "mesmo crucifixo com halteres"], ["Bent_Over_Dumbbell_Rear_Delt_Raise_With_Head_On_Bench", "mesmo crucifixo, apoiado no banco"], ["Face_Pull", "posterior com rotação externa"], ["Cable_Rope_Rear-Delt_Rows", "remada alta para o posterior"]],
  Cable_Rear_Delt_Fly: [["Reverse_Machine_Flyes", "mesmo crucifixo inverso na máquina"], ["Reverse_Flyes", "mesmo crucifixo com halteres"], ["Bent_Over_Dumbbell_Rear_Delt_Raise_With_Head_On_Bench", "mesmo crucifixo, apoiado no banco"], ["Face_Pull", "posterior no cabo com rotação"], ["Cable_Rope_Rear-Delt_Rows", "remada alta para o posterior"]],
  Bent_Over_Dumbbell_Rear_Delt_Raise_With_Head_On_Bench: [["Reverse_Flyes", "mesmo crucifixo, sem apoio"], ["Reverse_Machine_Flyes", "mesmo crucifixo na máquina"], ["Cable_Rear_Delt_Fly", "mesmo crucifixo no cabo"], ["Face_Pull", "posterior com rotação externa"]],
  Face_Pull: [["Cable_Rope_Rear-Delt_Rows", "mesma corda, puxada alta"], ["Cable_Rear_Delt_Fly", "posterior no cabo, isolado"], ["Reverse_Machine_Flyes", "posterior na máquina"], ["Reverse_Flyes", "posterior com halteres"], ["Band_Pull_Apart", "abertura com elástico"]],
  "Cable_Rope_Rear-Delt_Rows": [["Face_Pull", "mesma corda, com rotação externa"], ["Cable_Rear_Delt_Fly", "posterior no cabo, isolado"], ["Reverse_Machine_Flyes", "posterior na máquina"], ["Reverse_Flyes", "posterior com halteres"]],
  Band_Pull_Apart: [["Face_Pull", "posterior no cabo com rotação"], ["Reverse_Flyes", "mesma abertura com halteres"], ["Cable_Rear_Delt_Fly", "mesma abertura no cabo"]],
  External_Rotation_with_Band: [["Face_Pull", "rotação externa com carga no cabo"], ["Band_Pull_Apart", "mesmo elástico, abertura"]],

  // ---------- bíceps: flexão do cotovelo com antebraço supinado ----------
  // braço atrás do corpo (cabeça longa alongada) → braço ao lado → braço à frente (Scott/spider, cabeça curta)
  Incline_Dumbbell_Curl: [["Standing_Biceps_Cable_Curl", "polia baixa de costas (bayesiana): mesmo braço atrás do corpo"], ["Dumbbell_Bicep_Curl", "mesma rosca supinada, em pé"], ["High_Cable_Curls", "rosca no cabo, tensão constante"], ["EZ-Bar_Curl", "rosca supinada com barra W"], ["Machine_Bicep_Curl", "rosca supinada na máquina"], ["Barbell_Curl", "rosca supinada com barra"]],
  Standing_Biceps_Cable_Curl: [["Incline_Dumbbell_Curl", "braço atrás do corpo: cabeça longa alongada"], ["Dumbbell_Bicep_Curl", "mesma rosca com halteres"], ["High_Cable_Curls", "rosca no cabo, polia alta"], ["EZ-Bar_Curl", "rosca supinada com barra W"], ["Machine_Bicep_Curl", "rosca supinada na máquina"]],
  Dumbbell_Bicep_Curl: [["Incline_Dumbbell_Curl", ALONG], ["EZ-Bar_Curl", "mesma rosca com barra W"], ["Standing_Biceps_Cable_Curl", "mesma rosca no cabo"], ["Barbell_Curl", "mesma rosca com barra"], ["Machine_Bicep_Curl", "mesma rosca na máquina"], ["Concentration_Curls", "rosca isolada, sem roubar"]],
  "EZ-Bar_Curl": [["Barbell_Curl", "mesma rosca com barra reta"], ["Dumbbell_Bicep_Curl", "mesma rosca com halteres"], ["Standing_Biceps_Cable_Curl", "mesma rosca no cabo"], ["Preacher_Curl", "mesma barra W, no Scott"], ["Machine_Bicep_Curl", "mesma rosca na máquina"]],
  Barbell_Curl: [["EZ-Bar_Curl", "mesma rosca, melhor para o punho"], ["Dumbbell_Bicep_Curl", "mesma rosca com halteres"], ["Standing_Biceps_Cable_Curl", "mesma rosca no cabo"], ["Machine_Bicep_Curl", "mesma rosca na máquina"]],
  High_Cable_Curls: [["Standing_Biceps_Cable_Curl", "mesma rosca no cabo, polia baixa"], ["Cable_Preacher_Curl", "rosca no cabo com apoio"], ["Dumbbell_Bicep_Curl", "rosca supinada com halteres"], ["Machine_Bicep_Curl", "rosca supinada na máquina"]],
  Machine_Bicep_Curl: [["Machine_Preacher_Curls", "mesma máquina, braço apoiado"], ["Preacher_Curl", "rosca com braço apoiado, barra W"], ["Standing_Biceps_Cable_Curl", "rosca no cabo"], ["EZ-Bar_Curl", "rosca com barra W"], ["Dumbbell_Bicep_Curl", "rosca com halteres"]],
  Preacher_Curl: [["Machine_Preacher_Curls", "mesmo Scott na máquina"], ["Cable_Preacher_Curl", "mesmo Scott no cabo"], ["Spider_Curl", "mesmo braço à frente, apoiado no banco"], ["Concentration_Curls", "braço apoiado, com halter"], ["Machine_Bicep_Curl", "rosca na máquina"]],
  Machine_Preacher_Curls: [["Preacher_Curl", "mesmo Scott com barra W"], ["Cable_Preacher_Curl", "mesmo Scott no cabo"], ["Machine_Bicep_Curl", "rosca na máquina"], ["Spider_Curl", "braço à frente, apoiado no banco"], ["Concentration_Curls", "braço apoiado, com halter"]],
  Cable_Preacher_Curl: [["Preacher_Curl", "mesmo Scott com barra W"], ["Machine_Preacher_Curls", "mesmo Scott na máquina"], ["Spider_Curl", "braço à frente, apoiado no banco"], ["Concentration_Curls", "braço apoiado, com halter"]],
  Spider_Curl: [["Preacher_Curl", "mesmo braço à frente, no Scott"], ["Machine_Preacher_Curls", "Scott na máquina"], ["Cable_Preacher_Curl", "Scott no cabo"], ["Concentration_Curls", "braço apoiado, com halter"]],
  Concentration_Curls: [["Spider_Curl", "braço apoiado à frente, com barra W"], ["Preacher_Curl", "braço apoiado no Scott"], ["Machine_Preacher_Curls", "Scott na máquina"], ["Cable_Preacher_Curl", "Scott no cabo"], ["Dumbbell_Bicep_Curl", "rosca com halteres, em pé"]],
  Zottman_Curl: [["Dumbbell_Bicep_Curl", "rosca supinada com halteres"], ["EZ-Bar_Curl", "rosca com barra W"], ["Standing_Biceps_Cable_Curl", "rosca no cabo"]],

  // ---------- braquial / braquiorradial: pegada neutra ou pronada ----------
  Hammer_Curls: [["Cable_Hammer_Curls_-_Rope_Attachment", "mesma pegada neutra, no cabo com corda"]],
  "Cable_Hammer_Curls_-_Rope_Attachment": [["Hammer_Curls", "mesma pegada neutra, com halteres"]],
  Reverse_Barbell_Curl: [["Hammer_Curls", "braquial com pegada neutra"], ["Cable_Hammer_Curls_-_Rope_Attachment", "braquial no cabo com corda"]],

  // ---------- tríceps cabeça longa: braço acima da cabeça ou à frente (alongada) ----------
  Cable_Rope_Overhead_Triceps_Extension: [["Standing_Dumbbell_Triceps_Extension", "mesmo francês, braço acima da cabeça"], ["Standing_Overhead_Barbell_Triceps_Extension", "mesmo francês com barra W"], ["EZ-Bar_Skullcrusher", "testa: cabeça longa também alongada"], ["Lying_Dumbbell_Tricep_Extension", "testa com halteres"]],
  Standing_Dumbbell_Triceps_Extension: [["Cable_Rope_Overhead_Triceps_Extension", "mesmo francês no cabo, tensão constante"], ["Standing_Overhead_Barbell_Triceps_Extension", "mesmo francês com barra W"], ["EZ-Bar_Skullcrusher", "testa: cabeça longa alongada"], ["Lying_Dumbbell_Tricep_Extension", "testa com halteres"]],
  Standing_Overhead_Barbell_Triceps_Extension: [["Standing_Dumbbell_Triceps_Extension", "mesmo francês com halter"], ["Cable_Rope_Overhead_Triceps_Extension", "mesmo francês no cabo"], ["EZ-Bar_Skullcrusher", "mesma barra W, deitado"], ["Lying_Dumbbell_Tricep_Extension", "testa com halteres"]],
  "EZ-Bar_Skullcrusher": [["Lying_Dumbbell_Tricep_Extension", "mesmo testa com halteres"], ["Cable_Rope_Overhead_Triceps_Extension", "francês no cabo, mais alongado"], ["Standing_Overhead_Barbell_Triceps_Extension", "francês com a mesma barra W"], ["Standing_Dumbbell_Triceps_Extension", "francês com halter"]],
  Lying_Dumbbell_Tricep_Extension: [["EZ-Bar_Skullcrusher", "mesmo testa com barra W"], ["Standing_Dumbbell_Triceps_Extension", "francês com halter, mais alongado"], ["Cable_Rope_Overhead_Triceps_Extension", "francês no cabo"], ["Standing_Overhead_Barbell_Triceps_Extension", "francês com barra W"]],

  // ---------- tríceps cabeça lateral: braço ao lado do corpo (pulley, máquina, mergulho) ----------
  Triceps_Pushdown: [["Triceps_Pushdown_-_Rope_Attachment", "mesmo pulley, com corda"], ["Machine_Triceps_Extension", MAQ], ["Cable_One_Arm_Tricep_Extension", "mesmo pulley, unilateral"], ["Reverse_Grip_Triceps_Pushdown", "mesmo pulley, pegada supinada"], ["Tricep_Dumbbell_Kickback", "mesma extensão com halter"], ["Dips_-_Triceps_Version", "mergulho: multiarticular"]],
  "Triceps_Pushdown_-_Rope_Attachment": [["Triceps_Pushdown", "mesmo pulley, com barra"], ["Cable_One_Arm_Tricep_Extension", "mesmo pulley, unilateral"], ["Machine_Triceps_Extension", MAQ], ["Reverse_Grip_Triceps_Pushdown", "mesmo pulley, pegada supinada"], ["Tricep_Dumbbell_Kickback", "mesma extensão com halter"]],
  Machine_Triceps_Extension: [["Triceps_Pushdown", "mesma extensão no pulley"], ["Triceps_Pushdown_-_Rope_Attachment", "mesma extensão com corda"], ["Cable_One_Arm_Tricep_Extension", "mesma extensão, unilateral"], ["Tricep_Dumbbell_Kickback", "mesma extensão com halter"], ["Dips_-_Triceps_Version", "mergulho: multiarticular"]],
  "Dips_-_Triceps_Version": [["Close-Grip_Barbell_Bench_Press", "multiarticular com carga alta"], ["Bench_Dips", "mesmo mergulho, no banco"], ["Machine_Triceps_Extension", "tríceps na máquina, poupa o ombro"], ["Triceps_Pushdown", "tríceps no pulley, poupa o ombro"]],
  "Close-Grip_Barbell_Bench_Press": [["Dips_-_Triceps_Version", "multiarticular no peso do corpo"], ["Machine_Triceps_Extension", "tríceps na máquina"], ["Triceps_Pushdown", "tríceps no pulley"], ["Bench_Dips", "mergulho no banco"]],
  Reverse_Grip_Triceps_Pushdown: [["Triceps_Pushdown", "mesmo pulley, pegada pronada"], ["Triceps_Pushdown_-_Rope_Attachment", "mesmo pulley, com corda"], ["Cable_One_Arm_Tricep_Extension", "mesmo pulley, unilateral"], ["Machine_Triceps_Extension", MAQ]],
  Cable_One_Arm_Tricep_Extension: [["Triceps_Pushdown_-_Rope_Attachment", "mesmo pulley, bilateral com corda"], ["Triceps_Pushdown", "mesmo pulley, bilateral"], ["Tricep_Dumbbell_Kickback", "mesma extensão unilateral com halter"], ["Machine_Triceps_Extension", MAQ], ["Reverse_Grip_Triceps_Pushdown", "pulley com pegada supinada"]],
  Tricep_Dumbbell_Kickback: [["Cable_One_Arm_Tricep_Extension", "mesma extensão unilateral, no cabo"], ["Triceps_Pushdown_-_Rope_Attachment", "pulley com corda"], ["Triceps_Pushdown", "pulley com barra"], ["Machine_Triceps_Extension", MAQ]],
  Bench_Dips: [["Dips_-_Triceps_Version", "mesmo mergulho, nas paralelas"], ["Close-Grip_Barbell_Bench_Press", "multiarticular com barra"], ["Machine_Triceps_Extension", "tríceps na máquina, poupa o ombro"], ["Triceps_Pushdown", "tríceps no pulley, poupa o ombro"]],

  // ---------- quadríceps: agachar, empurrar com as pernas, estender o joelho ----------
  Hack_Squat: [["Smith_Machine_Squat", "mesmo agachamento guiado"], ["Leg_Press", "mesmo empurrar com as pernas, apoiado"], ["Barbell_Full_Squat", "agachamento livre, fundo"], ["Front_Barbell_Squat", "agachamento frontal, tronco ereto"], ["Goblet_Squat", "agachamento com halter"], ["Split_Squat_with_Dumbbells", "unilateral com halteres"]],
  Leg_Press: [["Hack_Squat", "mesmo empurrar guiado, mais fundo"], ["Smith_Machine_Squat", "agachamento guiado"], ["Barbell_Full_Squat", "agachamento livre"], ["Goblet_Squat", "agachamento com halter"], ["Split_Squat_with_Dumbbells", "unilateral com halteres"]],
  Smith_Machine_Squat: [["Hack_Squat", "mesmo agachamento guiado, apoiado"], ["Leg_Press", "empurrar com as pernas, apoiado"], ["Barbell_Full_Squat", "mesmo agachamento, livre"], ["Front_Barbell_Squat", "agachamento frontal"], ["Goblet_Squat", "agachamento com halter"]],
  Barbell_Full_Squat: [["Front_Barbell_Squat", "mesmo agachamento livre, frontal"], ["Hack_Squat", "agachamento guiado, poupa a lombar"], ["Smith_Machine_Squat", "mesmo agachamento, guiado"], ["Leg_Press", "empurrar com as pernas, poupa a lombar"], ["Goblet_Squat", "agachamento com halter"]],
  Front_Barbell_Squat: [["Barbell_Full_Squat", "mesmo agachamento livre, barra atrás"], ["Hack_Squat", "agachamento guiado"], ["Smith_Machine_Squat", "agachamento guiado"], ["Goblet_Squat", "mesma carga à frente, com halter"], ["Leg_Press", "empurrar com as pernas"]],
  Goblet_Squat: [["Front_Barbell_Squat", "mesma carga à frente, com barra"], ["Hack_Squat", "agachamento guiado"], ["Smith_Machine_Squat", "agachamento guiado"], ["Leg_Press", "empurrar com as pernas"], ["Split_Squat_with_Dumbbells", "unilateral com halteres"]],
  Leg_Extensions: [["Hack_Squat", "quadríceps com joelho bem à frente"], ["Split_Squat_with_Dumbbells", "quadríceps unilateral"], ["Leg_Press", "quadríceps apoiado"], ["Goblet_Squat", "quadríceps com halter"]],
  Dumbbell_Lunges: [["Split_Squat_with_Dumbbells", "mesmo afundo, parado"], ["Dumbbell_Step_Ups", "unilateral, subida no banco"], ["Goblet_Squat", "agachamento com halter"], ["Hack_Squat", "agachamento guiado"], ["Leg_Press", "empurrar com as pernas"]],
  Split_Squat_with_Dumbbells: [["Dumbbell_Lunges", "mesmo afundo, com passada"], ["Dumbbell_Step_Ups", "unilateral, subida no banco"], ["Goblet_Squat", "agachamento com halter"], ["Hack_Squat", "agachamento guiado"], ["Leg_Press", "empurrar com as pernas"]],
  Thigh_Adductor: [], // adutores: nada mais no catálogo trabalha essa parte como principal (cai na regra da #74)
  Dumbbell_Step_Ups: [["Split_Squat_with_Dumbbells", "unilateral, afundo parado"], ["Dumbbell_Lunges", "unilateral, com passada"], ["Goblet_Squat", "agachamento com halter"], ["Leg_Press", "empurrar com as pernas"]],

  // ---------- posterior de coxa: dobrar o quadril (stiff) ou flexionar o joelho ----------
  Romanian_Deadlift: [["Stiff-Legged_Dumbbell_Deadlift", "mesmo stiff com halteres"], ["Seated_Leg_Curl", "posterior alongado, sentado"], ["Lying_Leg_Curls", "posterior isolado, deitado"]],
  "Stiff-Legged_Dumbbell_Deadlift": [["Romanian_Deadlift", "mesmo stiff com barra"], ["Seated_Leg_Curl", "posterior alongado, sentado"], ["Lying_Leg_Curls", "posterior isolado, deitado"]],
  Seated_Leg_Curl: [["Lying_Leg_Curls", "mesma flexora, deitado"], ["Romanian_Deadlift", "posterior também alongado, no quadril"], ["Stiff-Legged_Dumbbell_Deadlift", "stiff com halteres"]],
  Lying_Leg_Curls: [["Seated_Leg_Curl", "mesma flexora, sentado e mais alongado"], ["Romanian_Deadlift", "posterior no quadril, com barra"], ["Stiff-Legged_Dumbbell_Deadlift", "stiff com halteres"]],
  Barbell_Deadlift: [["Romanian_Deadlift", "mesma dobra de quadril, foco no posterior"], ["Stiff-Legged_Dumbbell_Deadlift", "stiff com halteres"]],

  // ---------- glúteo: estender o quadril ----------
  Barbell_Hip_Thrust: [["Barbell_Glute_Bridge", "mesma ponte, no chão"], ["Pull_Through", "mesma extensão de quadril, no cabo"], ["One-Legged_Cable_Kickback", "glúteo isolado no cabo"], ["Butt_Lift_Bridge", "ponte sem carga"], ["Dumbbell_Rear_Lunge", "glúteo unilateral com halteres"]],
  Barbell_Glute_Bridge: [["Barbell_Hip_Thrust", "mesma ponte, mais amplitude no banco"], ["Pull_Through", "extensão de quadril no cabo"], ["Butt_Lift_Bridge", "mesma ponte, sem carga"], ["One-Legged_Cable_Kickback", "glúteo isolado no cabo"]],
  Pull_Through: [["Barbell_Hip_Thrust", "mesma extensão de quadril, com barra"], ["Barbell_Glute_Bridge", "ponte com barra"], ["One-Legged_Cable_Kickback", "glúteo isolado no cabo"], ["Dumbbell_Rear_Lunge", "glúteo unilateral com halteres"]],
  "One-Legged_Cable_Kickback": [["Pull_Through", "mesma extensão de quadril no cabo"], ["Barbell_Hip_Thrust", "extensão de quadril com barra"], ["Barbell_Glute_Bridge", "ponte com barra"], ["Butt_Lift_Bridge", "ponte sem carga"]],
  Dumbbell_Rear_Lunge: [["Barbell_Hip_Thrust", "glúteo com extensão de quadril"], ["Pull_Through", "extensão de quadril no cabo"], ["Barbell_Glute_Bridge", "ponte com barra"], ["One-Legged_Cable_Kickback", "glúteo unilateral no cabo"]],
  Butt_Lift_Bridge: [["Barbell_Glute_Bridge", "mesma ponte, com barra"], ["Barbell_Hip_Thrust", "mesma ponte no banco, com barra"], ["One-Legged_Cable_Kickback", "glúteo isolado no cabo"], ["Pull_Through", "extensão de quadril no cabo"]],
  Thigh_Abductor: [["One-Legged_Cable_Kickback", "glúteo isolado no cabo"], ["Barbell_Hip_Thrust", "glúteo com extensão de quadril"]],

  // ---------- panturrilha: em pé (gastrocnêmio alongado) antes de sentado ----------
  Standing_Calf_Raises: [["Donkey_Calf_Raises", "mesma flexão plantar, joelho estendido"], ["Calf_Press_On_The_Leg_Press_Machine", "mesma panturrilha no leg press"], ["Standing_Dumbbell_Calf_Raise", "mesma panturrilha em pé com halter"], ["Seated_Calf_Raise", "sentado: mais sóleo"]],
  Calf_Press_On_The_Leg_Press_Machine: [["Standing_Calf_Raises", "mesma panturrilha, em pé na máquina"], ["Donkey_Calf_Raises", "joelho estendido, alongado"], ["Standing_Dumbbell_Calf_Raise", "em pé com halter"], ["Seated_Calf_Raise", "sentado: mais sóleo"]],
  Seated_Calf_Raise: [["Standing_Calf_Raises", "panturrilha em pé na máquina"], ["Calf_Press_On_The_Leg_Press_Machine", "panturrilha no leg press"], ["Standing_Dumbbell_Calf_Raise", "em pé com halter"], ["Donkey_Calf_Raises", "panturrilha burrinho"]],
  Standing_Dumbbell_Calf_Raise: [["Standing_Calf_Raises", "mesma panturrilha em pé, na máquina"], ["Calf_Press_On_The_Leg_Press_Machine", "panturrilha no leg press"], ["Donkey_Calf_Raises", "joelho estendido, alongado"], ["Seated_Calf_Raise", "sentado: mais sóleo"]],
  Donkey_Calf_Raises: [["Standing_Calf_Raises", "mesma panturrilha, joelho estendido"], ["Calf_Press_On_The_Leg_Press_Machine", "panturrilha no leg press"], ["Standing_Dumbbell_Calf_Raise", "em pé com halter"], ["Seated_Calf_Raise", "sentado: mais sóleo"]],

  // ---------- abdômen: flexão do tronco, elevação de quadril, anti-extensão ----------
  Cable_Crunch: [["Ab_Crunch_Machine", "mesma flexão do tronco com carga"], ["Crunches", "mesma flexão, sem aparelho"], ["Reverse_Crunch", "abdômen pela elevação do quadril"], ["Hanging_Leg_Raise", "abdômen na barra"]],
  Ab_Crunch_Machine: [["Cable_Crunch", "mesma flexão do tronco, no cabo"], ["Crunches", "mesma flexão, sem aparelho"], ["Reverse_Crunch", "abdômen pela elevação do quadril"]],
  Crunches: [["Cable_Crunch", "mesma flexão, com carga no cabo"], ["Ab_Crunch_Machine", "mesma flexão na máquina"], ["Reverse_Crunch", "abdômen pela elevação do quadril"]],
  Hanging_Leg_Raise: [["Reverse_Crunch", "mesma elevação do quadril, no chão"], ["Cable_Crunch", "abdômen com carga no cabo"], ["Ab_Roller", "abdômen com a roda"]],
  Reverse_Crunch: [["Hanging_Leg_Raise", "mesma elevação, na barra"], ["Crunches", "flexão do tronco, sem aparelho"], ["Cable_Crunch", "abdômen com carga no cabo"]],
  Ab_Roller: [["Plank", "mesma anti-extensão, parado"], ["Dead_Bug", "anti-extensão deitado"], ["Hanging_Leg_Raise", "abdômen na barra"]],
  Dead_Bug: [["Plank", "anti-extensão, parado"], ["Reverse_Crunch", "abdômen deitado"], ["Crunches", "flexão do tronco, sem aparelho"]],
  Plank: [["Dead_Bug", "anti-extensão deitado"], ["Ab_Roller", "mesma anti-extensão, mais difícil"], ["Reverse_Crunch", "abdômen deitado"]],
};

/** Motivo do banco para trocar `de` por `para` (null fora do banco). */
export function motivoDoBanco(de: string, para: string): string | null {
  const l = Object.hasOwn(BANCO_ALTERNATIVAS, de) ? BANCO_ALTERNATIVAS[de] : undefined;
  return l?.find(([id]) => id === para)?.[1] ?? null;
}
