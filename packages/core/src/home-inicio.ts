// #73 Hoje como home: o cartão de boas-vindas com prazo de validade, o "Complete o perfil" adiável, o caminho de evolução
// (marcos), as médias de 7 dias (proteína, água, sono), o próximo treino e os atalhos. Tudo puro: o Worker manda datas e
// números já agregados, o app só desenha.

import { mondayOf } from "./checkin.ts";
import { foodAverages } from "./comida.ts";
import type { FoodEntry } from "./comida.ts";
import { healthWeek, lastDays } from "./diario.ts";

const DAY = 864e5;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const isIso = (v: unknown): v is string => typeof v === "string" && ISO.test(v) && !Number.isNaN(Date.parse(v));
const addDays = (iso: string, n: number) => new Date(Date.parse(iso + "T12:00:00Z") + n * DAY).toISOString().slice(0, 10);
const diffDays = (a: string, b: string) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / DAY);
const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/** Dia (AAAA-MM-DD) de um instante em America/Sao_Paulo (UTC−3, sem horário de verão desde 2019). */
export const dataSP = (ms: number | null | undefined): string | null =>
  finite(ms) ? new Date(ms - 3 * 3600e3).toISOString().slice(0, 10) : null;

// ---------- cartão de boas-vindas ----------
export type Visibilidade = "mostrar" | "oculto";
/** Dias que o cartão "Sua semana está pronta" fica no Hoje depois do checkup (escolha nossa; não há número consagrado). */
export const BOAS_VINDAS_DIAS = 3;
export interface BoasVindasInput { checkupEm: string | null; primeiroTreinoEm: string | null; dispensadoEm: string | null; hoje: string }

/** Some no 1º destes: 1º treino registrado, 3 dias desde o checkup ou "Dispensar". Sem checkup feito, não há cartão. */
export function cartaoBoasVindas(i: BoasVindasInput): Visibilidade {
  if (!isIso(i.checkupEm) || !isIso(i.hoje)) return "oculto";
  if (i.primeiroTreinoEm || i.dispensadoEm) return "oculto";
  return diffDays(i.checkupEm, i.hoje) < BOAS_VINDAS_DIAS ? "mostrar" : "oculto";
}

/** "Lembrar depois" do "Complete o Perfil de treino" esconde por 7 dias; o cartão só existe enquanto falta algo. */
export const PERFIL_ADIA_DIAS = 7;
export function cartaoCompletePerfil(i: { falta: number; adiadoEm: string | null; hoje: string }): Visibilidade {
  if (i.falta <= 0) return "oculto";
  if (isIso(i.adiadoEm) && isIso(i.hoje) && diffDays(i.adiadoEm, i.hoje) < PERFIL_ADIA_DIAS) return "oculto";
  return "mostrar";
}

// ---------- caminho de evolução ----------
export interface MarcosRaw {
  contaEm: string | null; perfilEm: string | null; semanaEm: string | null; primeiroTreinoEm: string | null; primeiraMedidaEm: string | null;
  /** dias com comida (os primeiros 7 bastam) */
  diasComida: readonly string[];
  /** dias com treino registrado (para as 4 semanas seguidas) */
  diasTreino: readonly string[];
}
export type MarcoId = "conta" | "perfil" | "semana" | "treino" | "medida" | "comida7" | "semanas4";
export interface Marco { id: MarcoId; feito: boolean; data?: string; href: string; texto: string; cta: string; progresso?: string; proximo: boolean }

const COMIDA_DIAS = 7, SEMANAS_SEGUIDAS = 4;

/** 4 segundas seguidas com treino: a data do 1º treino da 4ª semana (ou null) e a sequência que ainda está viva hoje. */
function sequencia(dias: readonly string[], hoje?: string): { data: string | null; viva: number } {
  const ds = [...new Set(dias.filter(isIso))].sort();
  const porSemana = new Map<string, string>();
  for (const d of ds) { const m = mondayOf(d); if (!porSemana.has(m)) porSemana.set(m, d); }
  const segs = [...porSemana.keys()].sort();
  let run = 0, prev: string | null = null, data: string | null = null;
  for (const s of segs) {
    run = prev && diffDays(prev, s) === 7 ? run + 1 : 1; prev = s;
    if (run === SEMANAS_SEGUIDAS && !data) data = porSemana.get(s)!;
  }
  // viva = a sequência termina nesta semana ou na passada (a desta semana ainda pode chegar)
  const ref = mondayOf(hoje && isIso(hoje) ? hoje : segs[segs.length - 1] ?? "2000-01-03");
  const viva = prev && diffDays(prev, ref) <= 7 ? run : 0;
  return { data, viva };
}

/** Os 7 marcos do caminho, na ordem. O primeiro não feito é o `proximo` (destacado, com CTA para a tela certa). */
export function marcosEvolucao(r: MarcosRaw, hoje?: string): Marco[] {
  const comida = [...new Set(r.diasComida.filter(isIso))].sort();
  const seq = sequencia(r.diasTreino, hoje);
  const m = (id: MarcoId, data: string | null | undefined, texto: string, cta: string, href: string, progresso?: string): Omit<Marco, "proximo"> =>
    ({ id, feito: !!data, ...(data ? { data } : {}), texto, cta, href, ...(data || !progresso ? {} : { progresso }) });
  const out = [
    m("conta", r.contaEm, "Conta criada", "Ver a conta", "#conta"),
    m("perfil", r.perfilEm, "Perfil de treino", "Responder o perfil", "#primeiros-passos"),
    m("semana", r.semanaEm, "1ª semana gerada", "Ver a semana", "#semana"),
    m("treino", r.primeiroTreinoEm, "1º treino", "Fazer o 1º treino", "#treino"),
    m("medida", r.primeiraMedidaEm, "1ª medida", "Medir braço e cintura", "#corpo"),
    m("comida7", comida.length >= COMIDA_DIAS ? comida[COMIDA_DIAS - 1] : null, "7 dias de comida", "Registrar comida", "#comida", `${Math.min(comida.length, COMIDA_DIAS)} de ${COMIDA_DIAS}`),
    m("semanas4", seq.data, "4 semanas seguidas", "Treinar esta semana", "#treino", `${Math.min(seq.viva, SEMANAS_SEGUIDAS)} de ${SEMANAS_SEGUIDAS}`),
  ];
  const prox = out.findIndex((x) => !x.feito);
  return out.map((x, i) => ({ ...x, proximo: i === prox }));
}

// ---------- médias da semana ----------
export type MediaId = "prot" | "agua" | "sono";
export interface MediaCard {
  id: MediaId; nome: string; unidade: string; media: number | null; meta: number | null; anterior: number | null;
  variacao: "sobe" | "desce" | "igual" | null;
  /** 7 dias até hoje (do mais antigo ao mais novo); v = null quando não houve registro */
  dias: { date: string; v: number | null }[];
  vazio: { texto: string; cta: string; href: string };
}
export interface MediasRaw { comida: readonly { date: string; kcal: number; prot: number }[]; agua: readonly { date: string; litros: number }[]; sono: readonly { date: string; horas: number }[] }

const r1 = (n: number) => Math.round(n * 10) / 10;
const variacao = (a: number | null, b: number | null, eps: number): MediaCard["variacao"] =>
  a == null || b == null ? null : Math.abs(a - b) < eps ? "igual" : a > b ? "sobe" : "desce";
const CO_NULO = { alcohol: null, smoke: null, smokeQty: null, caffeineLate: null, cardioMin: null, steps: null, mood: null };

/** Média de 7 dias (só dias registrados entram, como no resto do app) e a dos 7 anteriores. Sem registro: null, nunca 0. */
export function mediasSemana(raw: MediasRaw, hoje: string, metaProt: number | null): MediaCard[] {
  const sem = lastDays(hoje, 7), ant = lastDays(addDays(hoje, -7), 7);
  const okDia = (d: unknown) => isIso(d);

  const food: FoodEntry[] = raw.comida.filter((c) => okDia(c.date) && finite(c.prot)).map((c) => ({ date: c.date, kcal: finite(c.kcal) ? c.kcal : 0, prot: c.prot }));
  const alvo = { kcal: 0, protein: finite(metaProt) ? metaProt : 0 };
  const pA = foodAverages(food, hoje, alvo, 7), pB = foodAverages(food, addDays(hoje, -7), alvo, 7);

  // água (checkout) e sono (check-in): a mesma regra das médias da saúde da semana (healthWeek)
  const agua = raw.agua.filter((a) => okDia(a.date) && finite(a.litros) && a.litros >= 0 && a.litros <= 10).map((a) => ({ ...CO_NULO, date: a.date, waterMl: Math.round(a.litros * 1000) }));
  const sono = raw.sono.filter((s) => okDia(s.date) && finite(s.horas) && s.horas >= 0 && s.horas <= 24).map((s) => ({ date: s.date, sleepH: s.horas }));
  const hA = healthWeek(sem, sono, agua, 0), hB = healthWeek(ant, sono, agua, 0);
  const litros = (ml: number | null) => (ml == null ? null : r1(ml / 1000));
  const porDia = <T extends { date: string }>(xs: readonly T[], f: (x: T) => number) => {
    const m = new Map<string, number>(); for (const x of xs) m.set(x.date, (m.get(x.date) ?? 0) + f(x)); return m;
  };
  const protDia = new Map(pA.days.filter((d) => d.logged).map((d) => [d.date, d.prot])), aguaDia = porDia(agua, (a) => a.waterMl / 1000), sonoDia = porDia(sono, (s) => s.sleepH);
  const serie = (m: Map<string, number>, f = (v: number) => v) => sem.map((date) => ({ date, v: m.has(date) ? f(m.get(date)!) : null }));

  const aguaA = litros(hA.waterAvgMl), aguaB = litros(hB.waterAvgMl);
  return [
    { id: "prot", nome: "Proteína", unidade: "g/dia", media: pA.avgProt, meta: finite(metaProt) && metaProt > 0 ? metaProt : null, anterior: pB.avgProt,
      variacao: variacao(pA.avgProt, pB.avgProt, 3), dias: serie(protDia),
      vazio: { texto: "Registre o que você come e a média de proteína aparece aqui.", cta: "Registrar comida", href: "#comida" } },
    { id: "agua", nome: "Água", unidade: "L/dia", media: aguaA, meta: null, anterior: aguaB, variacao: variacao(aguaA, aguaB, 0.1), dias: serie(aguaDia, r1),
      vazio: { texto: "Registre a água no checkout da noite.", cta: "Fazer o checkout", href: "#diario/checkout" } },
    { id: "sono", nome: "Sono", unidade: "h/noite", media: hA.sleepAvg, meta: null, anterior: hB.sleepAvg, variacao: variacao(hA.sleepAvg, hB.sleepAvg, 0.2), dias: serie(sonoDia, r1),
      vazio: { texto: "Registre o sono no check-in da manhã.", cta: "Fazer o check-in", href: "#diario" } },
  ];
}

// ---------- próximo treino ----------
export interface DiaLite { date: string; kind: string; status: string; temPlano: boolean }
/** Há treino hoje (com plano e ainda não feito)? Se não, o próximo dia da semana com treino (ou null). */
export function proximoTreino(dias: readonly DiaLite[], hoje: string): { hojeTreino: boolean; proximo: string | null } {
  const treina = (d: DiaLite) => d.kind !== "folga" && d.temPlano && d.status !== "feito" && d.status !== "faltou";
  const h = dias.find((d) => d.date === hoje);
  if (h && treina(h)) return { hojeTreino: true, proximo: null };
  const prox = dias.filter((d) => d.date > hoje && treina(d)).sort((a, b) => (a.date < b.date ? -1 : 1))[0];
  return { hojeTreino: false, proximo: prox?.date ?? null };
}

// ---------- atalhos ----------
export type AtalhoId = "semana" | "corpo" | "comida" | "diario" | "chat" | "academias";
export interface Atalho { id: AtalhoId; nome: string; href: string; icone: string; status: string }
export interface AtalhosInput {
  hoje: string; semana: { feitos: number; treinos: number } | null; ultimaMedida: string | null;
  /** dias com comida nos últimos 7 */
  diasComida: number; checkinHoje: boolean; academias: number;
}
/** Os 6 atalhos "um pouco de tudo", cada um com um micro-status de uma linha. */
export function atalhosHome(i: AtalhosInput): Atalho[] {
  const dm = isIso(i.ultimaMedida) ? diffDays(i.ultimaMedida, i.hoje) : null;
  return [
    { id: "semana", nome: "Semana", href: "#semana", icone: "cal", status: i.semana ? `${i.semana.feitos} de ${i.semana.treinos} treinos` : "sem plano ainda" },
    { id: "corpo", nome: "Corpo", href: "#corpo", icone: "body", status: dm == null ? "nenhuma medida ainda" : dm <= 0 ? "medido hoje" : `última medida há ${dm} ${dm === 1 ? "dia" : "dias"}` },
    { id: "comida", nome: "Comida", href: "#comida", icone: "food", status: `${Math.max(0, Math.min(7, i.diasComida))} de 7 dias registrados` },
    { id: "diario", nome: "Diário", href: "#diario", icone: "book", status: i.checkinHoje ? "check-in feito hoje" : "check-in pendente" },
    { id: "chat", nome: "Chat", href: "#chat", icone: "chat", status: "pergunte sobre o seu treino" },
    { id: "academias", nome: "Academias", href: "#academias", icone: "gym", status: i.academias > 0 ? `${i.academias} ${i.academias === 1 ? "lugar" : "lugares"}` : "nenhum lugar ainda" },
  ];
}
