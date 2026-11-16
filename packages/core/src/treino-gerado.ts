// #108 "Gerar treino" num dia sem treino. O treino sai na hora do gerador determinístico (#65), dentro de uma semana que
// passa no validarSemana, com o selo "revisão da IA pendente". A revisão é assíncrona: um pedido `revisar_treino` na caixa
// (rotina/vigia ou o Claude conectado) ou direto pelo MCP. A resposta passa pelo aplicarRevisaoIA; inválida → fica a
// determinística. Quando houver chave própria (#88/#89), a revisão pode rodar na hora com a chave (não implementado).
import { MUSCLES } from "./catalog.ts";
import { aplicarRevisaoIA, compactarSemana, faixasSemana, gerarSemana, MIN_POR_SERIE, TIER_REVISAO } from "./gerador.ts";
import type { DiaGerado, PerfilGerador, SemanaGerada, Violacao } from "./gerador.ts";
import { resumirDia } from "./plan-day.ts";
import type { DayPlan, RevisaoTreino } from "./plan-day.ts";
import { DOWS } from "./semana.ts";
import type { Dow, Split } from "./semana.ts";

export const ACAO_REVISAR_TREINO = "revisar_treino";
export interface TreinoGerado { perfil: PerfilGerador; semana: SemanaGerada; dia: DiaGerado }

/** O perfil com o dia pedido entre os dias de treino (a meta cobre todos). */
export function perfilComDia(p: PerfilGerador, dow: Dow): PerfilGerador {
  const dias = DOWS.filter((d) => d === dow || p.dias.includes(d));
  return { ...p, dias, diasMeta: Math.max(p.diasMeta ?? 0, dias.length) };
}

/** Gera a semana com o dia incluído e devolve o dia. Determinística; a semana inteira passa no validarSemana. */
export function gerarTreinoDia(p: PerfilGerador, dow: Dow): TreinoGerado | null {
  const perfil = perfilComDia(p, dow);
  let semana: SemanaGerada;
  try { semana = gerarSemana(perfil); } catch { return null; }
  const dia = semana.dias.find((d) => d.dow === dow);
  return dia && dia.itens.length ? { perfil, semana, dia } : null;
}

const NOME: Record<Split, string> = { sup: "Superior", inf: "Inferior", full: "Corpo inteiro" };
const WHY: Record<RevisaoTreino, string> = {
  pendente: "Revisão da IA pendente: o treino já vale; se a revisão melhorar algo, ele muda sozinho.",
  revisada: "Revisado pela IA e conferido pelas mesmas regras.",
  mantida: "A IA revisou e ficou a versão do app.",
};

/** DayPlan do dia gerado (resumo sempre a partir dos itens). */
export function planoDoDiaGerado(dia: DiaGerado, revisao: RevisaoTreino): DayPlan {
  const groups = [...new Set(dia.itens.map((i) => MUSCLES[i.muscle].group))];
  return resumirDia({
    name: `Gerado · ${NOME[dia.split]}`, mode: "normal", groups, items: dia.itens, prehab: [],
    why: ["Gerado pelo app com as regras de volume, 2× por músculo e tempo.", WHY[revisao]],
    dropped: [], missing: [], cap: 0, setsTotal: 0, estMinutes: 0, weekClosePct: 0, suggestCompensatory: false, perMuscle: {}, revisao,
  });
}

/** Texto do pedido `revisar_treino` (tier barato). Começa com a data, que liga o pedido ao dia. */
export function pedidoRevisaoTreino(date: string, g: TreinoGerado): { tier: typeof TIER_REVISAO; texto: string } {
  const fx = faixasSemana(g.perfil);
  const faixas = [...new Set(g.dia.itens.map((i) => i.muscle))].map((m) => `${m} ${fx.musculos[m].min}–${fx.musculos[m].max}/semana`).join(", ");
  const texto = [
    `[${ACAO_REVISAR_TREINO} ${date}] Revise o treino gerado pelo app para ${g.dia.dow} (${date}). Só ajuste se melhorar; se estiver bom, responda sem itens.`,
    `Regras: IDs só do catálogo; até ${fx.minutos} min (${MIN_POR_SERIE} min por série); faixas: ${faixas}; compostos antes dos isolados; nada que pegue dor marcada; só aparelhos da academia.`,
    "Responda com ciclo_revisar_treino {date, itens:[{id, sets}]} ou ciclo_responder_pedido com itens. Inválido → fica a versão do app.",
    JSON.stringify(g.dia.itens.map((i) => ({ id: i.exerciseId, sets: i.sets }))),
  ].join("\n");
  return { tier: TIER_REVISAO, texto };
}

/** A data de um pedido `revisar_treino` (null se o texto não é um). */
export function dataDoPedidoRevisao(texto: string): string | null {
  const m = /^\[revisar_treino (\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01]))\]/.exec(texto);
  return m ? m[1] : null;
}

/** Passa a revisão da IA (itens compactos do dia) pelo aplicarRevisaoIA, no contexto da semana gerada.
 *  null = a IA aprovou como está. Inválida → o dia determinístico e as violações. */
export function revisarTreinoDia(g: TreinoGerado, itensIA: unknown): { dia: DiaGerado; fonte: "ia" | "deterministica"; violacoes: Violacao[] } {
  if (itensIA == null) return { dia: g.dia, fonte: "deterministica", violacoes: [] };
  if (!Array.isArray(itensIA)) return { dia: g.dia, fonte: "deterministica", violacoes: [{ codigo: "formato", msg: "itens: lista de {id, sets}" }] };
  const resposta = { dias: compactarSemana(g.semana).dias.map((d) => (d.dow === g.dia.dow ? { dow: d.dow, itens: itensIA } : d)) };
  const r = aplicarRevisaoIA(g.semana, resposta, g.perfil);
  const dia = r.semana.dias.find((d) => d.dow === g.dia.dow) ?? g.dia;
  return r.fonte === "ia" ? { dia, fonte: "ia", violacoes: [] } : { dia: g.dia, fonte: "deterministica", violacoes: r.violacoes };
}
