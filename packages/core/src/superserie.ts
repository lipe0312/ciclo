// #125 Superséries pareadas de verdade: o item ganha `par` ("A1"/"A2") e só pareia músculos que não competem.
// Formato `superserie` = "preferir pares" na geração (nunca pela posição). A alternância na sessão vem depois da #122.
import { EQUIPMENT_BY_ID, EXERCISE_BY_ID, MUSCLES } from "./catalog.ts";
import type { Exercise, MuscleId } from "./catalog.ts";
import type { Issue } from "./validate.ts";
import type { Format } from "./semana.ts";

/** Formato válido vindo do perfil (dynamics) ou da tela; qualquer outra coisa = tradicional. */
export const formatoDe = (v: unknown): Format | null => (v === "superserie" || v === "circuito" || v === "tradicional" ? v : null);

/** Pares que não competem: antagonistas e o ombro lateral (prioridade) com os braços. Superior × inferior vale sempre. */
const COMBINAM = new Set(["biceps:triceps", "peito:costas", "peito:post", "quad:isquio", "ombro:biceps", "ombro:triceps"]);
const combinam = (a: MuscleId, b: MuscleId) => COMBINAM.has(`${a}:${b}`) || COMBINAM.has(`${b}:${a}`) || MUSCLES[a].group !== MUSCLES[b].group;
const motor = (e: Exercise) => e.subMuscles?.[0];
/** A subparte principal de um pega bem (≥ 2) no outro: os dois cansam o mesmo motor. */
const disputa = (a: Exercise, b: Exercise) => { const m = motor(a); return !!m && (b.eficiencia?.[m] ?? 0) >= 2; };
const concorridos = (e: Exercise) => e.eq.filter((q) => EQUIPMENT_BY_ID[q]?.busy === 2);

/** 0 = podem formar par; senão o código do motivo (texto em MOTIVOS, fora do JS inicial do app). */
function conflito(a: string, b: string, aparelhos: readonly string[]): number {
  const x = EXERCISE_BY_ID[a], y = EXERCISE_BY_ID[b];
  if (!x || !y) return 1;
  if (a === b) return 2;
  if (x.m === y.m || disputa(x, y) || disputa(y, x)) return 3;
  if (!combinam(x.m, y.m)) return 4;
  const tem = new Set(aparelhos);
  if (![...x.eq, ...y.eq].every((q) => tem.has(q))) return 5;
  const cx = concorridos(x), cy = concorridos(y);
  return cx.length && cy.length && !cx.some((q) => cy.includes(q)) ? 6 : 0;
}
const MOTIVOS = ["", "só exercícios do catálogo formam par", "o mesmo exercício", "os dois usam o mesmo músculo principal",
  "os músculos competem (use antagonistas, superior × inferior ou ombro lateral × braço)", "falta aparelho na academia",
  "dois aparelhos concorridos diferentes: segurar os dois não dá"];
/** Por que `a` e `b` não formam par (null = podem). IDs do catálogo; personalizado ou fora do catálogo não pareia. */
export function motivoSemPar(a: string, b: string, aparelhos: readonly string[]): string | null {
  return MOTIVOS[conflito(a, b, aparelhos)] || null;
}
export const podeParear = (a: string, b: string, aparelhos: readonly string[]) => conflito(a, b, aparelhos) === 0;

type ComPar = { exerciseId: string; par?: string };
const LETRAS = "ABCDEFGH";
const semPar = <T extends ComPar>(i: T): T => { const { par: _p, ...r } = i; return r as T; };
const letraLivre = (items: ComPar[]) => [...LETRAS].find((l) => !items.some((i) => i.par?.[0] === l)) ?? null;

/** Junta `i` e `j` (A1 = i, A2 = j logo depois de i). Quem estava em outro par fica sozinho. */
export function parear<T extends ComPar>(items: readonly T[], i: number, j: number): T[] {
  if (i === j || !items[i] || !items[j]) return [...items];
  const sai = new Set([items[i].par?.[0], items[j].par?.[0]].filter(Boolean));
  const out = items.map((x) => (x.par && sai.has(x.par[0]) ? semPar(x) : x));
  const l = letraLivre(out);
  if (!l) return [...items];
  const a = { ...out[i], par: l + "1" }, b = { ...out[j], par: l + "2" };
  const resto = out.filter((_, k) => k !== i && k !== j);
  resto.splice(i - (j < i ? 1 : 0), 0, a, b);
  return normalizarPares(resto);
}
/** Desfaz o par do item `i` (o parceiro também fica sozinho). */
export function desparear<T extends ComPar>(items: readonly T[], i: number): T[] {
  const l = items[i]?.par?.[0];
  return l ? normalizarPares(items.map((x) => (x.par?.[0] === l ? semPar(x) : x))) : [...items];
}
/** Renomeia os pares na ordem (A, B, C…) e solta par incompleto (ex.: o parceiro saiu do treino). */
export function normalizarPares<T extends ComPar>(items: readonly T[]): T[] {
  const conta = new Map<string, number>();
  for (const i of items) if (i.par) conta.set(i.par[0], (conta.get(i.par[0]) ?? 0) + 1);
  const nova = new Map<string, string>();
  return items.map((i) => {
    if (!i.par || conta.get(i.par[0]) !== 2) return i.par ? semPar(i) : i;
    if (!nova.has(i.par[0])) nova.set(i.par[0], LETRAS[nova.size]);
    return { ...i, par: nova.get(i.par[0])! + i.par[1] };
  });
}

/** "Preferir pares" na geração: na ordem do plano, cada item sem par pega o 1º seguinte que pode parear com ele. */
export function parearItens<T extends ComPar>(items: readonly T[], aparelhos: readonly string[]): T[] {
  let out = items.map(semPar);
  for (let i = 0; i < out.length; i++) {
    if (out[i].par) continue;
    const j = out.findIndex((x, k) => k > i && !x.par && podeParear(out[i].exerciseId, x.exerciseId, aparelhos));
    if (j > 0) out = parear(out, i, j);
  }
  return out;
}

/** Pares de um plano vindo da IA: cada letra tem exatamente X1 e X2, e os dois podem parear. */
export function validarPares(items: readonly ComPar[], aparelhos: readonly string[]): Issue[] {
  const grupos = new Map<string, { i: number; it: ComPar }[]>();
  items.forEach((it, i) => { if (it.par != null) grupos.set(it.par[0] ?? "", [...(grupos.get(it.par[0] ?? "") ?? []), { i, it }]); });
  const out: Issue[] = [];
  for (const [l, g] of grupos) {
    const ok = /^[A-H]$/.test(l) && g.length === 2 && g.some((x) => x.it.par === l + "1") && g.some((x) => x.it.par === l + "2");
    if (!ok) { out.push({ severity: "erro", code: "par", msg: `Par ${l || "?"}: precisa de exatamente ${l || "X"}1 e ${l || "X"}2.`, index: g[0].i }); continue; }
    const m = motivoSemPar(g[0].it.exerciseId, g[1].it.exerciseId, aparelhos);
    if (m) out.push({ severity: "erro", code: "par", msg: `Par ${l}: ${m}.`, index: g[1].i });
  }
  return out;
}

/** Plano gravado pelo app (PUT do dia): par inválido ou de músculos que competem é solto; o resto fica como veio. */
export function limparPares<T extends ComPar>(items: readonly T[], aparelhos: readonly string[]): T[] {
  const ruins = new Set(validarPares(items, aparelhos).map((x) => items[x.index ?? -1]?.par?.[0]));
  return normalizarPares(items.map((i) => (i.par != null && (!/^[A-H][12]$/.test(String(i.par)) || ruins.has(i.par[0])) ? semPar(i) : i)));
}
