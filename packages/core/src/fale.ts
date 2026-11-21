// #134 "Fale com a IA": o link interno que abre o Chat com o pedido já escrito no composer. Pequeno de propósito: fica
// no índice do core (o Hoje usa); o resto do Chat é o subcaminho "@ciclo/core/chat".
/** O pedido padrão (Hoje). Constante para a Hoje não puxar o resto deste módulo para o JS inicial. */
export const FALE_HOJE = "O que treino hoje?";
export const HREF_FALE_HOJE = `#chat?texto=${encodeURIComponent(FALE_HOJE)}`;
export type OrigemFale = "hoje" | "treino" | "trocar_exercicio" | "semana" | "comida" | "diario";
/** O pedido que já entra escrito no composer (não enviado). `nome` = exercício, quando houver. */
export function pedidoFale(origem: OrigemFale, nome?: string): string {
  const nm = nome?.replace(/\s+/g, " ").trim().slice(0, 80);
  switch (origem) {
    case "trocar_exercicio": return nm ? `Troque o exercício ${nm} de hoje` : "Troque um exercício de hoje";
    case "treino": return "Ajuste meu treino de hoje";
    case "semana": return "Reorganize o resto da minha semana";
    case "comida": return "Registrar o almoço";
    case "diario": return "Como foi minha semana?";
    default: return FALE_HOJE;
  }
}

/** O link interno do "Fale com a IA": abre o Chat com o pedido no composer. Nunca uma IA externa. */
export const hrefFale = (origem: OrigemFale, nome?: string) => `#chat?texto=${encodeURIComponent(pedidoFale(origem, nome))}`;
