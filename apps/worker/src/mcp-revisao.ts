// #108 Revisão pela IA do treino gerado pelo app ("Gerar treino"). Sem itens: lê os dias com revisão pendente (o treino e
// as regras). Com date + itens: passa a revisão pelo validador do core; inválida → fica a versão do app e volta a lista
// de violações. Aplicar resolve o pedido `revisar_treino` da caixa e tira o selo "revisão pendente".
import { MUSCLE_IDS } from "@ciclo/core";
import { date } from "./http.ts";
import { S, obj, today } from "./mcp-tipos.ts";
import type { Tool } from "./mcp-tipos.ts";
import { revisarTreino, revisoesPendentes } from "./treino-gerado.ts";

const ITENS = {
  type: "array", maxItems: 16, description: "Treino revisado do dia: itens compactos {id, sets} (IDs do catálogo).",
  items: { type: "object", required: ["id", "sets"], properties: { id: { type: "string", maxLength: 80 }, sets: { type: "integer", minimum: 1, maximum: 8 }, muscle: { type: "string", enum: MUSCLE_IDS } } },
};

export const TOOLS_REVISAO: Tool[] = [{
  name: "ciclo_revisar_treino",
  description: "Revisão do treino gerado pelo app (\"Gerar treino\", selo \"revisão da IA pendente\"). Sem itens: lista os dias pendentes com o treino, o motivo e as regras (só lê). Com date + itens {id, sets}: aplica a revisão se passar no validador; inválida → fica a versão do app e devolve as violações. Com date e aplicar:true sem itens: aprova como está. Resolve o pedido revisar_treino da caixa.",
  inputSchema: obj({ date: S.date, itens: ITENS, aplicar: { type: "boolean", description: "true sem itens: aprova a versão do app" }, resposta: { type: "string", maxLength: 600 } }),
  run: async (a, env, uid) => {
    if (!Array.isArray(a.itens) && a.aplicar !== true) return { pendentes: await revisoesPendentes(env, uid, a.date ? date(a.date) : undefined) };
    return revisarTreino(env, uid, date(a.date), Array.isArray(a.itens) ? a.itens : null, today(), typeof a.resposta === "string" ? a.resposta.slice(0, 600) : "Revisão aplicada");
  },
}];
