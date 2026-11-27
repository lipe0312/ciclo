// #147 Dados da Evolução. Servidor: GET /api/evolucao (até 12 meses por consulta; o período + o anterior + o começo podem
// pedir mais de uma, e "Tudo" pede de 12 em 12 meses até o 1º registro). Demonstração: 6 meses fictícios gerados aqui no
// aparelho (demo.ts, baixa só na demo). A conta toda é do core (`@ciclo/core/evolucao`).
import { consultasEvolucao, evolucao, janelaEvolucao, mesDe, somaMeses } from "@ciclo/core/evolucao";
import type { EvolucaoRaw, EvolucaoView, PeriodoEvo } from "@ciclo/core/evolucao";
import { C, S, today } from "../../lib/store/index.ts";
import { EXB } from "../../lib/store/regras.ts";
import { SERVER, api } from "../../lib/api/index.ts";
import { TZ, lsGet, lsSet } from "../../lib/util.ts";

type Faixa = { de: string; ate: string };
/** Uma consulta fica guardada por 2 min: trocar de aba ou de período e voltar não pede de novo. */
const VALIDADE = 120_000;
const cache = new Map<string, { em: number; p: Promise<EvolucaoRaw> }>();

function buscar(f: Faixa): Promise<EvolucaoRaw> {
  const k = `${f.de}|${f.ate}`, c = cache.get(k);
  if (c && Date.now() - c.em < VALIDADE) return c.p;
  const p = SERVER ? api<{ evolucao: EvolucaoRaw }>("GET", `/api/evolucao?de=${f.de}&ate=${f.ate}`).then((r) => r.evolucao)
    : import("./demo.ts").then((m) => m.demoEvolucao(f.de, f.ate, today)); // os dados fictícios só baixam na demonstração
  p.catch(() => cache.delete(k));
  cache.set(k, { em: Date.now(), p });
  return p;
}
const coberta = (c: Faixa, bs: Faixa[]) => bs.some((b) => b.de <= c.de && c.ate <= b.ate);
const hora = () => Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }).format(new Date()));

export type Resultado = { ok: true; view: EvolucaoView } | { ok: false; erro: string; rede?: boolean };

export async function carregarEvolucao(periodo: PeriodoEvo, custom: { de?: string; ate?: string } = {}): Promise<Resultado> {
  const r0 = janelaEvolucao(periodo, today, custom);
  if (!r0.ok) return { ok: false, erro: r0.erro };
  try {
    // 1ª rodada: o período e o anterior (em Tudo, os últimos 12 meses); a resposta diz quando foi o 1º registro
    const ja: Faixa[] = periodo === "tudo" ? [{ de: somaMeses(mesDe(today), -11), ate: mesDe(today) }] : consultasEvolucao(r0.j);
    const rs = await Promise.all(ja.map(buscar));
    const primeiro = rs.map((r) => r.primeiro).filter((d): d is string => !!d).sort()[0] ?? null;
    const r1 = janelaEvolucao(periodo, today, { ...custom, primeiro });
    if (!r1.ok) return { ok: false, erro: r1.erro };
    // 2ª rodada: o começo e o resto de "Tudo", só o que ainda não veio
    rs.push(...(await Promise.all(consultasEvolucao(r1.j).filter((c) => !coberta(c, ja)).map(buscar))));
    const ctx = C.ctxDoPerfil(S.profile);
    return { ok: true, view: evolucao(r1.j, rs, {
      hoje: today, agora: { date: today, hora: SERVER ? hora() : 23 }, prioridades: ctx.prioridades, diasMeta: ctx.diasMeta,
      objetivo: { bracoCm: ctx.meta.bracoCm, cinturaCm: ctx.meta.cinturaCm, pesoKg: ctx.meta.pesoKg }, metaProteina: ctx.dieta.protein, metaKcal: ctx.dieta.kcal,
      nome: nomeExercicio,
    }) };
  } catch {
    return { ok: false, erro: "Sem conexão ou o servidor não respondeu. Seus registros estão salvos.", rede: true };
  }
}

export const nomeExercicio = (id: string) => EXB[id]?.nm ?? S.personalizados[id]?.nome ?? "exercício";

// ---------- conquistas já vistas (só uma comodidade do aparelho: a Home não repete o destaque) ----------
const KEY_VISTAS = "ciclo:v1:evolucao:vistas";
export const vistas = (): string[] => lsGet<string[]>(KEY_VISTAS, []);
export function marcarVistas(ids: string[]) {
  const v = vistas(), novas = ids.filter((id) => !v.includes(id));
  if (novas.length) lsSet(KEY_VISTAS, [...v, ...novas].slice(-100));
}
