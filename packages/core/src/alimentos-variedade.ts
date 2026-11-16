// #80 "Faltam X g" com variedade: as sugestões não saem sempre de carne/frango/whey. Fica fora de alimentos.ts (e do
// índice do core) porque o JS inicial do app está no teto: a tela de Comida carrega este módulo junto com ela.
// Puro, sem dependências.
import { ALIMENTOS_COMUNS, ALIMENTO_BY_KEY } from "./alimentos.ts";
import type { Alimento, FaltaHoje, Unidade } from "./alimentos.ts";

const MIN_PROT_UN = 5, MAX_CAND = 6;
const GENERICAS = new Set(["porcao", "colher", "fatia", "concha", "copo", "pote", "scoop", "lata", "file", "prato", "metade", "bife"]);
const norm = (s: string) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/-/g, " ");
const rotulo = (a: Alimento, u: Unidade, n: number) => {
  const nome = n > 1 ? u.pl ?? `${u.nome}s` : u.nome, q = String(n).replace(".", ",");
  return GENERICAS.has(norm(u.nome)) ? `${q} ${nome} de ${a.curto}` : `${q} ${nome}`;
};

/** #80 Fontes para variar o "faltam X g" (não só carne/frango/whey): ovos, peixe, atum, queijo, além da base da pessoa. */
export const VARIEDADE_PROTEINA = ["ovo", "tilapia", "atum", "queijo-minas", "frango", "carne", "whey"] as const;
const PESADAS = new Set(["carne", "frango", "whey", "carne-moida"]);
export interface OpcoesFalta {
  /** dia (AAAA-MM-DD): gira a ordem das fontes para a sugestão mudar ao longo da semana */ dia?: string;
  /** chaves já comidas hoje: vão para o fim da fila */ comidos?: readonly string[];
  /** preferências: chaves que a pessoa não come */ evitar?: readonly string[];
}

/**
 * O `faltaHoje` da #43 com variedade (#80). Mesmo cálculo das faltas; nas sugestões, duas carnes "pesadas" (carne, frango, whey) juntas pesam contra; com `dia`, a fila gira e entra a variedade
 * (ovo, peixe, atum, queijo), o já comido hoje vai para o fim e o que a pessoa evita não aparece.
 */
export function faltaHojeVariada(meta: { kcal: number; protein: number }, totais: { kcal: number; prot: number }, base: readonly Alimento[], o: OpcoesFalta = {}): FaltaHoje {
  const prot = Math.max(0, Math.round(meta.protein - totais.prot));
  const kcal = Math.max(0, Math.round((meta.kcal - totais.kcal) / 10) * 10);
  if (totais.prot >= meta.protein * 0.95 || prot <= 0) return { prot, kcal, sugestoes: [] };
  const evitar = new Set(o.evitar ?? []), comidos = new Set(o.comidos ?? []);
  const proteico = (a: Alimento) => a.prot * a.unidades[0].g / 100 >= MIN_PROT_UN && a.prot >= 8 && !evitar.has(a.key);
  let cand = base.filter(proteico);
  const variar = !!o.dia || (cand.length >= 2 && cand.every((a) => PESADAS.has(a.key)));
  if (cand.length < 2 || variar) {
    const tem = new Set(cand.map((a) => a.key));
    const extra = variar
      ? VARIEDADE_PROTEINA.map((k) => ALIMENTO_BY_KEY[k]).filter((a) => a && proteico(a) && !tem.has(a.key))
      : ALIMENTOS_COMUNS.filter((a) => proteico(a) && !tem.has(a.key)).sort((a, b) => b.prot * b.unidades[0].g - a.prot * a.unidades[0].g);
    cand = [...cand, ...extra];
  }
  cand = variar ? cand.slice(0, MAX_CAND + 2) : cand.slice(0, MAX_CAND);
  // fila do dia: gira a ordem pelo número do dia (mesmo dia = mesma sugestão; outro dia = outra)
  const giro = o.dia ? Math.round(Date.parse(o.dia + "T12:00:00Z") / 864e5) : 0;
  const pos = new Map(cand.map((a, i) => [a.key, o.dia ? (i - giro % cand.length + cand.length) % cand.length : 0]));
  type Op = { parts: [Alimento, number][]; p: number; k: number; score: number };
  const ops: Op[] = [];
  const add = (parts: [Alimento, number][]) => {
    const p = parts.reduce((s, [a, n]) => s + a.prot * a.unidades[0].g / 100 * n, 0), k = parts.reduce((s, [a, n]) => s + a.kcal * a.unidades[0].g / 100 * n, 0);
    const un = parts.reduce((s, [, n]) => s + n, 0);
    const pesadas = parts.filter(([a]) => PESADAS.has(a.key)).length;
    const score = Math.max(0, prot - p) * 2 + Math.max(0, p - prot) * 0.5 + Math.max(0, k - kcal) / 20 + un
      + (pesadas >= 2 ? 6 : 0) + parts.reduce((s, [a, n]) => s + (pos.get(a.key) ?? 0) * 1.5 + (comidos.has(a.key) ? 25 : 0) + (PESADAS.has(a.key) && n > 2 ? 4 : 0), 0);
    ops.push({ parts, p, k, score });
  };
  for (let i = 0; i < cand.length; i++) {
    for (let n = 1; n <= 4; n++) add([[cand[i], n]]);
    for (let j = i + 1; j < cand.length; j++) for (let n = 1; n <= 3; n++) for (let m = 1; m <= 3; m++) add([[cand[i], n], [cand[j], m]]);
  }
  ops.sort((a, b) => a.score - b.score); // sort estável: empate fica na ordem da base
  const keyset = (o: Op) => o.parts.map(([a]) => a.key).sort().join("|");
  const picked: Op[] = [];
  for (const o of ops) { if (picked.length >= 2) break; if (!picked.some((x) => keyset(x) === keyset(o))) picked.push(o); }
  return {
    prot, kcal,
    sugestoes: picked.map((o) => ({
      itens: o.parts.map(([a, n]) => ({ key: a.key, qtd: n, unidade: a.unidades[0].nome })),
      texto: `${o.parts.map(([a, n]) => rotulo(a, a.unidades[0], n)).join(" + ")} = ${Math.round(o.p)} g`,
      prot: Math.round(o.p), kcal: Math.round(o.k),
    })),
  };
}
