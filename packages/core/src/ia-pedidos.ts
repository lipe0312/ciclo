// #140 Perfil → Sua IA → Avançado: modelo e esforço por tipo de pedido. Fica à parte do índice ("@ciclo/core/ia-pedidos"): só
// o validador entra no perfil (perfil.ts); os rótulos baixam com a tela Avançado (orçamento de JS inicial).
// A regra é uma só (app, PUT /api/profile e Chat): modelo só da allowlist do provedor e, quando a tela manda a lista da própria
// chave (#88), só os que a chave acessa. Mensagem de erro fixa: nunca devolve o texto que a pessoa mandou.
import { ESFORCOS, PROVEDORES_IA, classificarModelo } from "./chaves.ts";
import type { Esforco, ProvedorIa } from "./chaves.ts";

export const TIPOS_PEDIDO_IA = ["gerar_semana", "revisar_treino", "comida", "pedidos_rotina"] as const;
export type TipoPedidoIa = (typeof TIPOS_PEDIDO_IA)[number];

/** Rótulo e uma linha de ajuda de cada tipo (texto da tela, sem marca de IA). */
export const ROTULO_PEDIDO_IA: Record<TipoPedidoIa, { nm: string; desc: string }> = {
  gerar_semana: { nm: "Gerar a semana", desc: "Montar ou refazer a semana de treino." },
  revisar_treino: { nm: "Revisar o treino", desc: "Conferir um treino e apontar riscos." },
  comida: { nm: "Comida", desc: "Registrar e corrigir o que você comeu." },
  pedidos_rotina: { nm: "Pedidos da rotina", desc: "Os pedidos que a sua IA responde em lote." },
};

/** `provedor` + `modelo` juntos (o ID só vale para o provedor dele); `esforco` sozinho vale para a chave que responder. */
export interface PrefPedidoIa { provedor?: ProvedorIa; modelo?: string; esforco?: Esforco }
export type PrefsPedidoIa = Partial<Record<TipoPedidoIa, PrefPedidoIa>>;
/** Modelos que cada chave da pessoa acessa (a lista da #88). */
export type ModelosDasChaves = Partial<Record<ProvedorIa, readonly string[]>>;
type Res<T> = { ok: true; valor: T } | { ok: false; erros: string[] };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function validarPrefPedidoIa(v: unknown, chaves?: ModelosDasChaves): Res<PrefPedidoIa> {
  if (!isObj(v)) return { ok: false, erros: ["preferência deve ser um objeto"] };
  const e: string[] = [];
  for (const k of Object.keys(v)) if (!["provedor", "modelo", "esforco"].includes(k)) e.push("campo desconhecido");
  const out: PrefPedidoIa = {};
  if (v.provedor !== undefined) {
    if (typeof v.provedor === "string" && (PROVEDORES_IA as readonly string[]).includes(v.provedor)) out.provedor = v.provedor as ProvedorIa;
    else e.push("provedor fora do cofre");
  }
  if (v.esforco !== undefined) {
    if (typeof v.esforco === "string" && (ESFORCOS as readonly string[]).includes(v.esforco)) out.esforco = v.esforco as Esforco;
    else e.push("esforço deve ser baixo|medio|alto");
  }
  if (v.modelo !== undefined) {
    if (v.provedor === undefined) e.push("modelo precisa do provedor");
    else if (out.provedor && typeof v.modelo === "string" && classificarModelo(out.provedor, v.modelo)) {
      if (chaves && !chaves[out.provedor]?.includes(v.modelo)) e.push("modelo que a chave não acessa");
      else out.modelo = v.modelo;
    } else if (out.provedor) e.push("modelo fora da lista permitida");
  }
  if (!e.length && out.modelo === undefined && out.esforco === undefined) e.push("escolha o modelo ou o esforço");
  return e.length ? { ok: false, erros: [...new Set(e)] } : { ok: true, valor: out };
}

/** O mapa inteiro (tipo → preferência). Tipo desconhecido ou valor ruim recusa tudo. */
export function validarPrefsPedidosIa(v: unknown, chaves?: ModelosDasChaves): Res<PrefsPedidoIa> {
  if (!isObj(v)) return { ok: false, erros: ["iaPedidos deve ser um objeto"] };
  const e: string[] = [], out: PrefsPedidoIa = {};
  for (const k of Object.keys(v)) {
    if (!(TIPOS_PEDIDO_IA as readonly string[]).includes(k)) { e.push("tipo de pedido desconhecido"); continue; }
    const r = validarPrefPedidoIa(v[k], chaves);
    if (r.ok) out[k as TipoPedidoIa] = r.valor; else e.push(`${k}: ${r.erros.join("; ")}`);
  }
  return e.length ? { ok: false, erros: [...new Set(e)].slice(0, 8) } : { ok: true, valor: out };
}
