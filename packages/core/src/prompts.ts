// Biblioteca de pedidos ao Claude. Cada pedido tem um "tier" de modelo:
// haiku = registro/rotina (barato) · sonnet = ajustes do dia · opus = decisões de bloco, dor e revisão.
// O app grava o pedido na caixa (inbox) com o tier; quem processa (rotina na nuvem, claude -p ou você)
// usa o modelo indicado. A resposta volta como texto curto + uma "mudança" em JSON que o core valida.

export type Tier = "haiku" | "sonnet" | "opus";
export type Action =
  | "registrar_comida" | "registrar_treino" | "trocar_exercicio" | "academia_cheia" | "pouco_tempo"
  | "foco_musculo" | "compensatorio" | "nao_gostei" | "dor" | "explicar" | "trocar_academia"
  | "revisao_semana" | "novo_bloco" | "livre";

export interface PromptDef { id: string; cat: "Hoje" | "Treino" | "Corpo" | "Comida" | "Plano"; label: string; text: string; action: Action; tier: Tier }

export const PROMPTS: PromptDef[] = [
  { id: "pouco-tempo", cat: "Hoje", label: "Só tenho 40 min", text: "Hoje só tenho 40 minutos. Ajusta o treino mantendo as prioridades.", action: "pouco_tempo", tier: "haiku" },
  { id: "cheia", cat: "Hoje", label: "Academia cheia", text: "A academia está lotada. Troca o que depende de polia/rack por opções livres.", action: "academia_cheia", tier: "haiku" },
  { id: "foco-ombro", cat: "Hoje", label: "Hoje quero ombro", text: "Hoje quero treinar ombro. Reorganiza a semana a partir disso.", action: "foco_musculo", tier: "sonnet" },
  { id: "compensa", cat: "Hoje", label: "Gerar compensatório", text: "Só consigo ir hoje esta semana. Gera um treino compensatório de corpo inteiro.", action: "compensatorio", tier: "sonnet" },
  { id: "outra-acad", cat: "Hoje", label: "Vou na outra academia", text: "Hoje vou treinar na Academia 2. Refaz com os aparelhos de lá.", action: "trocar_academia", tier: "haiku" },
  { id: "ocupado", cat: "Treino", label: "Aparelho ocupado", text: "O aparelho do próximo exercício está ocupado. Me dá a melhor troca agora.", action: "trocar_exercicio", tier: "haiku" },
  { id: "nao-gostei", cat: "Treino", label: "Não gostei da dinâmica", text: "Não gostei da dinâmica desse treino (muito parado/longo). Muda o formato mantendo o volume.", action: "nao_gostei", tier: "sonnet" },
  { id: "sei-melhor", cat: "Treino", label: "Faço melhor outro exercício", text: "Conheço e faço melhor outro exercício no lugar deste. Revê minha troca.", action: "trocar_exercicio", tier: "sonnet" },
  { id: "registrar", cat: "Treino", label: "Registrar por texto", text: "Fiz rosca inclinada 3x10 com 12 kg e tríceps francês 3x12 com 20 kg.", action: "registrar_treino", tier: "haiku" },
  { id: "dor", cat: "Corpo", label: "Senti dor", text: "Senti dor na escápula esquerda no remo. O que muda no treino e o que fortalecer?", action: "dor", tier: "opus" },
  { id: "dormi-mal", cat: "Corpo", label: "Dormi mal", text: "Dormi mal (5 h). Ajusta a intensidade de hoje.", action: "pouco_tempo", tier: "haiku" },
  { id: "comi", cat: "Comida", label: "O que comi", text: "Comi: 3 ovos, 2 pães, arroz feijão e frango no almoço, um whey.", action: "registrar_comida", tier: "haiku" },
  { id: "falta-prot", cat: "Comida", label: "Quanto falta?", text: "Quanto falta de proteína hoje e o que comer no jantar?", action: "registrar_comida", tier: "haiku" },
  { id: "porque", cat: "Plano", label: "Por que esse exercício?", text: "Por que esse exercício está no meu treino?", action: "explicar", tier: "haiku" },
  { id: "revisao", cat: "Plano", label: "Revisar a semana", text: "Faz a revisão da semana com os check-ins e me diz 1–3 mudanças.", action: "revisao_semana", tier: "opus" },
  { id: "bloco", cat: "Plano", label: "Novo bloco", text: "Fim do bloco: monta o próximo com o que aprendeu.", action: "novo_bloco", tier: "opus" },
];

export const TIER_INFO: Record<Tier, { nm: string; why: string }> = {
  haiku: { nm: "Haiku", why: "rápido e barato: registro, trocas simples, contas" },
  sonnet: { nm: "Sonnet", why: "ajuste do dia: reorganizar treino e semana" },
  opus: { nm: "Opus", why: "decisões importantes: dor, revisão, novo bloco" },
};

const RULES: [RegExp, Action, Tier][] = [
  [/\b(dor|doendo|lesão|machuc|pontada|escápula|lombar|joelho)/i, "dor", "opus"],
  [/\b(revis|semana toda|balanço)/i, "revisao_semana", "opus"],
  [/\b(novo bloco|mesociclo|fim do bloco)/i, "novo_bloco", "opus"],
  [/\b(compensa|só (consigo|vou) (ir )?hoje)/i, "compensatorio", "sonnet"],
  [/\b(não gostei|chato|dinâmica|parado)/i, "nao_gostei", "sonnet"],
  [/\b(quero (treinar|malhar|focar)|foco)/i, "foco_musculo", "sonnet"],
  [/\b(comi|almocei|jantei|café|proteína|kcal)/i, "registrar_comida", "haiku"],
  [/\b(ocupad|troca|trocar)/i, "trocar_exercicio", "haiku"],
  [/\b(cheia|lotad)/i, "academia_cheia", "haiku"],
  [/\b(\d+\s?min|pouco tempo|corrido)/i, "pouco_tempo", "haiku"],
  [/\b(fiz|\dx\d)/i, "registrar_treino", "haiku"],
];
/** Classifica texto livre → ação + tier (o usuário pode trocar o tier antes de enviar). */
export function classify(text: string): { action: Action; tier: Tier } {
  for (const [re, action, tier] of RULES) if (re.test(text)) return { action, tier };
  return { action: "livre", tier: "sonnet" };
}
