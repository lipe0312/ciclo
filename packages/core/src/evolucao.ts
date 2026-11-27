// #147 Evolução por período. Fica fora do índice do core (o JS inicial do app está no teto): a tela Evolução, o destaque da
// Home e o Worker importam `@ciclo/core/evolucao`. Puro, sem dependências.
//
// O Worker manda linhas agregadas por dia (EvolucaoRaw, uma consulta de até 12 meses); aqui ficam a janela do período, a
// divisão automática em dias, semanas ou meses, as médias (comida com a regra da #115), a cobertura do registro, a comparação
// com o período anterior de mesmo tamanho e com o começo, e as conquistas na direção do objetivo da pessoa.
import { MUSCLE_IDS } from "./catalog.ts";
import { mondayOf } from "./checkin.ts";
import { foodAverages } from "./comida.ts";
import type { DiaConta, FoodEntry, Meal } from "./comida.ts";
import { REGRAS_MEDIAS_PADRAO, diaComMedias, mediasPorRefeicao } from "./comida-medias.ts";
import type { ContextoMedias, NaoComi, RegrasMedias } from "./comida-medias.ts";

const DAY = 864e5;
const addDays = (iso: string, n: number) => new Date(Date.parse(iso + "T12:00:00Z") + n * DAY).toISOString().slice(0, 10);
const diffDays = (a: string, b: string) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / DAY);
const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const r2 = (n: number) => Math.round(n * 100) / 100;
const minS = (a: string, b: string) => (a < b ? a : b);
const p2 = (n: number) => String(n).padStart(2, "0");

// ---------- meses ----------
/** Teto de meses por consulta ao Worker (decisão do dono: 1 ano por consulta). */
export const MAX_MESES = 12;
export const mesValido = (v: unknown): v is string => typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
const ym = (m: string) => [Number(m.slice(0, 4)), Number(m.slice(5, 7))] as const;
export const mesDe = (iso: string) => iso.slice(0, 7);
/** Meses de `de` a `ate`, inclusive (ate antes de de → 0 ou negativo). */
export const mesesEntre = (de: string, ate: string) => { const [a, b] = ym(de), [c, d] = ym(ate); return c * 12 + d - (a * 12 + b) + 1; };
export const somaMeses = (m: string, n: number) => { const [a, b] = ym(m), t = a * 12 + (b - 1) + n; return `${String(Math.floor(t / 12)).padStart(4, "0")}-${p2((t % 12) + 1)}`; };
export const fimDoMes = (m: string) => { const [a, b] = ym(m); return `${m}-${p2(new Date(Date.UTC(a, b, 0)).getUTCDate())}`; };

// ---------- período ----------
export const PERIODOS_EVO = ["semana", "mes", "3m", "6m", "1a", "tudo", "custom"] as const;
export type PeriodoEvo = (typeof PERIODOS_EVO)[number];
export const PERIODO_NM: Record<PeriodoEvo, string> = { semana: "Semana", mes: "Mês", "3m": "3 meses", "6m": "6 meses", "1a": "1 ano", tudo: "Tudo", custom: "Personalizado" };
const MESES_DE: Partial<Record<PeriodoEvo, number>> = { mes: 1, "3m": 3, "6m": 6, "1a": 12 };
export const CUSTOM_MESES = { min: 2, max: MAX_MESES } as const;
export type Grupo = "dia" | "semana" | "mes";
/** Até 1 mês por dia, até 3 meses por semana, acima disso por mês. */
export const grupoDe = (dias: number): Grupo => (dias <= 31 ? "dia" : dias <= 92 ? "semana" : "mes");

export interface Intervalo { inicio: string; fim: string }
export interface JanelaEvo extends Intervalo {
  periodo: PeriodoEvo; hoje: string; grupo: Grupo; meses: number;
  /** até onde há dado: o fim do período ou hoje */ ate: string;
  /** dias de `inicio` a `ate` */ decorridos: number;
  /** o período anterior com os MESMOS dias decorridos (Tudo não tem) */ anterior: Intervalo | null;
  /** o que se compara: o período até hoje (em Tudo, o mês atual contra o primeiro) */ base: Intervalo;
  /** a janela de mesmo tamanho a partir do 1º registro (null sem registro ou se ela cai dentro do período) */ comeco: Intervalo | null;
  primeiro: string | null;
}
export type JanelaOuErro = { ok: true; j: JanelaEvo } | { ok: false; erro: string };

export function janelaEvolucao(periodo: string, hoje: string, o: { de?: string | null; ate?: string | null; primeiro?: string | null } = {}): JanelaOuErro {
  if (!(PERIODOS_EVO as readonly string[]).includes(periodo)) return { ok: false, erro: "período inválido" };
  const p = periodo as PeriodoEvo, mesHoje = mesDe(hoje), primeiro = o.primeiro && o.primeiro <= hoje ? o.primeiro : null;
  let inicio: string, fim: string, meses: number;
  if (p === "semana") { inicio = mondayOf(hoje); fim = addDays(inicio, 6); meses = 1; }
  else if (p === "tudo") { inicio = `${mesDe(primeiro ?? hoje)}-01`; fim = fimDoMes(mesHoje); meses = mesesEntre(mesDe(inicio), mesHoje); }
  else if (p === "custom") {
    if (!mesValido(o.de) || !mesValido(o.ate)) return { ok: false, erro: "escolha o mês de início e o de fim" };
    meses = mesesEntre(o.de, o.ate);
    if (meses < CUSTOM_MESES.min || meses > CUSTOM_MESES.max) return { ok: false, erro: `de ${CUSTOM_MESES.min} a ${CUSTOM_MESES.max} meses` };
    if (o.ate > mesHoje) return { ok: false, erro: "o fim vai até o mês atual" };
    inicio = `${o.de}-01`; fim = fimDoMes(o.ate);
  } else { meses = MESES_DE[p]!; inicio = `${somaMeses(mesHoje, -(meses - 1))}-01`; fim = fimDoMes(mesHoje); }
  const ate = minS(fim, hoje), decorridos = diffDays(inicio, ate) + 1;
  let anterior: Intervalo | null = null;
  if (p !== "tudo") {
    const ai = p === "semana" ? addDays(inicio, -7) : `${somaMeses(mesDe(inicio), -meses)}-01`;
    anterior = { inicio: ai, fim: minS(addDays(ai, decorridos - 1), addDays(inicio, -1)) };
  }
  const base = p === "tudo" ? { inicio: `${mesHoje}-01` > inicio ? `${mesHoje}-01` : inicio, fim: ate } : { inicio, fim: ate };
  let comeco: Intervalo | null = null;
  if (primeiro) {
    const c = p === "tudo" ? { inicio: primeiro, fim: fimDoMes(mesDe(primeiro)) } : { inicio: primeiro, fim: addDays(primeiro, diffDays(base.inicio, base.fim)) };
    comeco = c.fim < base.inicio ? c : null;
  }
  return { ok: true, j: { periodo: p, hoje, grupo: p === "tudo" ? "mes" : grupoDe(diffDays(inicio, fim) + 1), meses, inicio, fim, ate, decorridos, anterior, base, comeco, primeiro } };
}

/** Faixas de meses a pedir ao Worker (cada uma com até 12): o período + o anterior, do fim para trás, e o começo se ficar de fora. */
export function consultasEvolucao(j: JanelaEvo): { de: string; ate: string }[] {
  const blocos = (de: string, ate: string) => {
    const out: { de: string; ate: string }[] = [];
    for (let fim = ate, i = 0; mesesEntre(de, fim) > 0 && i < 10; i++) {
      const ini = mesesEntre(de, fim) > MAX_MESES ? somaMeses(fim, -(MAX_MESES - 1)) : de;
      out.unshift({ de: ini, ate: fim }); fim = somaMeses(ini, -1);
    }
    return out;
  };
  const de = mesDe(j.anterior?.inicio ?? j.inicio), out = blocos(de, mesDe(j.ate));
  if (j.comeco && mesDe(j.comeco.inicio) < de) {
    const cf = mesDe(j.comeco.fim);
    out.unshift(...blocos(mesDe(j.comeco.inicio), cf < de ? cf : somaMeses(de, -1)));
  }
  return out;
}

// ---------- baldes (as barras) ----------
export interface Balde extends Intervalo { rotulo: string; dias: number; andamento: boolean }
const MES_ABR = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const DIA_SEM = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

/** As barras do período, de `inicio` até hoje. Barra que termina antes do 1º registro fica de fora (não é zero); sem registro, nenhuma. */
export function baldesDe(j: JanelaEvo, primeiro: string | null = j.primeiro): Balde[] {
  if (!primeiro || primeiro > j.ate) return [];
  const out: Balde[] = [];
  const anos = new Set([j.inicio.slice(0, 4), j.ate.slice(0, 4)]).size > 1;
  for (let ini = j.inicio, i = 0; ini <= j.ate && i < 400; i++) {
    const cheio = j.grupo === "dia" ? ini : j.grupo === "semana" ? minS(addDays(mondayOf(ini), 6), j.fim) : fimDoMes(mesDe(ini));
    const fim = minS(cheio, j.ate);
    const rotulo = j.grupo === "mes" ? `${MES_ABR[Number(ini.slice(5, 7)) - 1]}${anos ? `/${ini.slice(2, 4)}` : ""}`
      : j.grupo === "semana" ? `${Number(ini.slice(8, 10))}/${Number(ini.slice(5, 7))}`
      : j.periodo === "semana" ? DIA_SEM[diffDays(mondayOf(ini), ini)] : String(Number(ini.slice(8, 10)));
    if (fim >= primeiro) out.push({ inicio: ini, fim, rotulo, dias: diffDays(ini, fim) + 1, andamento: cheio >= j.hoje });
    ini = addDays(fim, 1);
  }
  return out;
}

// ---------- dados do Worker ----------
export interface PontoEvo { date: string; value: number }
/** Uma consulta (até 12 meses). Só números e datas; nenhum texto livre da pessoa. */
export interface EvolucaoRaw {
  de: string; ate: string;
  sets: { date: string; muscle: string; n: number }[];
  e1rm: { date: string; exerciseId: string; muscle: string; e1rm: number }[];
  sessoes: string[];
  presenca: { date: string; status: string }[];
  cardio: { date: string; minutes: number }[];
  /** comida por dia e refeição (desde 27 dias antes de `de`: a média de cada refeição da #115) */
  refeicoes: { date: string; meal: Meal | null; kcal: number; prot: number }[];
  naoComi: NaoComi[];
  /** kcal das bebidas registradas pelo checkout (Comida › "bebida") */
  bebida: { date: string; kcal: number }[];
  agua: { date: string; litros: number }[]; sono: { date: string; horas: number }[]; alcool: { date: string; doses: number }[];
  peso: { date: string; kg: number }[];
  medidas: { date: string; braco: number | null; cintura: number | null; ombro: number | null }[];
  /** maior e1RM de cada exercício antes de `de` (o "recorde" compara com tudo o que veio antes) */
  recordeAntes: { exerciseId: string; e1rm: number }[];
  /** 1º registro de qualquer tipo, de qualquer época */
  primeiro: string | null;
  /** 1ª medida de cada uma, de qualquer época (o "começo" do corpo) */
  comecoCorpo: { peso: PontoEvo | null; braco: PontoEvo | null; cintura: PontoEvo | null; ombro: PontoEvo | null };
  regrasMedias: RegrasMedias;
}

export interface EvolucaoOpts {
  hoje: string; agora?: { date: string; hora: number };
  prioridades: readonly string[]; diasMeta: number;
  /** metas do objetivo: o sinal diz a direção (+ ganhar, − perder, 0 manter) */
  objetivo: { bracoCm: number; cinturaCm: number; pesoKg: number };
  metaProteina: number; metaKcal: number;
  nome?: (exerciseId: string) => string;
}

export interface Cob { registrados: number; naMedia: number; dias: number }
export interface SerieEvo extends Cob {
  /** valor de cada barra (null = sem registro nela, nunca zero inventado) */ baldes: (number | null)[];
  cobertura: Cob[];
  valor: number | null; anterior: number | null; comeco: number | null; difAnterior: number | null; difComeco: number | null;
}
export type Aba = "treino" | "comida" | "saude" | "corpo";
export interface Conquista { id: string; aba: Aba; texto: string }
export interface EvolucaoView {
  janela: JanelaEvo; baldes: Balde[]; comeco: Intervalo | null;
  treino: { dias: SerieEvo; series: { muscle: string; s: SerieEvo }[]; freq2: SerieEvo; e1rm: { exerciseId: string; muscle: string; s: SerieEvo; recorde: boolean }[]; cardio: SerieEvo; semanasSeguidas: number; temDados: boolean };
  comida: { kcal: SerieEvo; prot: SerieEvo; protDias: SerieEvo; bebida: SerieEvo; temDados: boolean };
  saude: { agua: SerieEvo; sono: SerieEvo; alcoolNoites: SerieEvo; alcoolDoses: SerieEvo; temDados: boolean };
  corpo: { peso: SerieEvo; braco: SerieEvo; cintura: SerieEvo; ombro: SerieEvo; temDados: boolean };
  conquistas: Conquista[];
}

interface Medida { v: number | null; reg: number; media: number }
type Medir = (iv: Intervalo) => Medida;
const dentro = (d: string, iv: Intervalo) => d >= iv.inicio && d <= iv.fim;
const dif = (a: number | null, b: number | null) => (a != null && b != null ? r2(a - b) : null);

/** Junta as consultas: cada linha uma vez só (as faixas podem se tocar na janela de 28 dias da comida). */
function juntar(rs: readonly EvolucaoRaw[]) {
  const uniq = <T>(xs: T[], k: (x: T) => string) => { const m = new Map<string, T>(); for (const x of xs) m.set(k(x), x); return [...m.values()]; };
  const all = <K extends keyof EvolucaoRaw>(k: K) => rs.flatMap((r) => r[k] as unknown as any[]);
  const prim = rs.map((r) => r.primeiro).filter((d): d is string => !!d).sort()[0] ?? null;
  const cc = (k: keyof EvolucaoRaw["comecoCorpo"]) => rs.map((r) => r.comecoCorpo?.[k]).filter((p): p is PontoEvo => !!p && finite(p.value)).sort((a, b) => (a.date < b.date ? -1 : 1))[0] ?? null;
  return {
    sets: uniq(all("sets") as EvolucaoRaw["sets"], (x) => `${x.date}|${x.muscle}`),
    e1rm: uniq(all("e1rm") as EvolucaoRaw["e1rm"], (x) => `${x.date}|${x.exerciseId}`),
    sessoes: new Set(all("sessoes") as string[]),
    presenca: uniq(all("presenca") as EvolucaoRaw["presenca"], (x) => x.date),
    cardio: uniq(all("cardio") as EvolucaoRaw["cardio"], (x) => x.date),
    refeicoes: uniq(all("refeicoes") as EvolucaoRaw["refeicoes"], (x) => `${x.date}|${x.meal}`),
    naoComi: uniq(all("naoComi") as NaoComi[], (x) => `${x.date}|${x.meal}`),
    bebida: uniq(all("bebida") as EvolucaoRaw["bebida"], (x) => x.date),
    agua: uniq(all("agua") as EvolucaoRaw["agua"], (x) => x.date),
    sono: uniq(all("sono") as EvolucaoRaw["sono"], (x) => x.date),
    alcool: uniq(all("alcool") as EvolucaoRaw["alcool"], (x) => x.date),
    peso: uniq(all("peso") as EvolucaoRaw["peso"], (x) => x.date).sort((a, b) => (a.date < b.date ? -1 : 1)),
    medidas: uniq(all("medidas") as EvolucaoRaw["medidas"], (x) => x.date).sort((a, b) => (a.date < b.date ? -1 : 1)),
    primeiro: prim, regras: rs[0]?.regrasMedias ?? REGRAS_MEDIAS_PADRAO,
    comecoCorpo: { peso: cc("peso"), braco: cc("braco"), cintura: cc("cintura"), ombro: cc("ombro") },
    /** maior e1RM antes de `d`: as linhas buscadas + o "antes" de cada consulta que começa até `d` */
    recordeAntes: (ex: string, d: string) => {
      const vs = [...rs.filter((r) => `${r.de}-01` <= d).flatMap((r) => r.recordeAntes.filter((x) => x.exerciseId === ex).map((x) => x.e1rm)),
        ...rs.flatMap((r) => r.e1rm.filter((x) => x.exerciseId === ex && x.date < d).map((x) => x.e1rm))].filter(finite);
      return vs.length ? Math.max(...vs) : null;
    },
  };
}

export function evolucao(j0: JanelaEvo, rs: readonly EvolucaoRaw[], o: EvolucaoOpts): EvolucaoView {
  const R = juntar(rs);
  const j: JanelaEvo = j0.primeiro || !R.primeiro ? j0 : { ...j0, primeiro: R.primeiro };
  const baldes = baldesDe(j);
  const serie = (medir: Medir, comecoFixo?: number | null): SerieEvo => {
    const bs = baldes.map((b) => medir(b)), at = medir(j.base), an = j.anterior ? medir(j.anterior) : null;
    const comeco = comecoFixo !== undefined ? comecoFixo : j.comeco ? medir(j.comeco).v : null;
    return {
      baldes: bs.map((x) => x.v), cobertura: bs.map((x, i) => ({ registrados: x.reg, naMedia: x.media, dias: baldes[i].dias })),
      valor: at.v, anterior: an?.v ?? null, comeco, difAnterior: dif(at.v, an?.v ?? null), difComeco: dif(at.v, comeco),
      registrados: at.reg, naMedia: at.media, dias: diffDays(j.base.inicio, j.base.fim) + 1,
    };
  };
  const conta = (ds: Iterable<string>, iv: Intervalo) => { let n = 0; for (const d of ds) if (dentro(d, iv)) n++; return n; };

  // ---------- treino ----------
  const treinou = new Set([...R.sessoes, ...R.presenca.filter((p) => p.status === "fui").map((p) => p.date)]);
  const marcados = new Set([...R.sessoes, ...R.presenca.map((p) => p.date)]);
  const regT = (iv: Intervalo) => conta(marcados, iv);
  const dias = serie((iv) => { const r = regT(iv); return { v: conta(treinou, iv), reg: r, media: r }; });
  const series = o.prioridades.filter((m) => (MUSCLE_IDS as readonly string[]).includes(m)).map((m) => ({
    muscle: m, s: serie((iv) => { const r = regT(iv); return { v: R.sets.filter((x) => x.muscle === m && dentro(x.date, iv) && finite(x.n) && x.n > 0).reduce((a, x) => a + x.n, 0), reg: r, media: r }; }),
  }));
  const pct2 = (seg: string) => {
    const fim = addDays(seg, 6), por = new Map<string, Set<string>>();
    for (const x of R.sets) if (x.date >= seg && x.date <= fim && x.n > 0) { const s = por.get(x.muscle) ?? new Set<string>(); s.add(x.date); por.set(x.muscle, s); }
    return Math.round(([...por.values()].filter((s) => s.size >= 2).length / MUSCLE_IDS.length) * 100);
  };
  const freq2 = serie((iv) => {
    let segs: string[] = [];
    for (let d = mondayOf(iv.inicio) < iv.inicio ? addDays(mondayOf(iv.inicio), 7) : iv.inicio; d <= iv.fim; d = addDays(d, 7)) segs.push(d);
    if (segs.length > 1) segs = segs.filter((s) => addDays(s, 6) < j.hoje || s === segs[0]); // a semana em andamento só conta sozinha
    segs = segs.filter((s) => !j.primeiro || addDays(s, 6) >= j.primeiro);
    return segs.length ? { v: Math.round(segs.reduce((a, s) => a + pct2(s), 0) / segs.length), reg: segs.length, media: segs.length } : { v: null, reg: 0, media: 0 };
  });
  const cardio = serie((iv) => {
    const cs = R.cardio.filter((c) => dentro(c.date, iv) && finite(c.minutes) && c.minutes > 0), r = new Set([...cs.map((c) => c.date), ...[...marcados].filter((d) => dentro(d, iv))]).size;
    return { v: cs.reduce((a, c) => a + c.minutes, 0), reg: r, media: r };
  });
  // e1RM dos exercícios-chave: medido em ≥ 2 barras do período (ou 2 dias); prioritários primeiro
  const atual = { inicio: j.inicio, fim: j.ate };
  const porEx = new Map<string, { muscle: string; barras: Set<number> }>();
  for (const x of R.e1rm) {
    if (!dentro(x.date, atual) || !finite(x.e1rm) || x.e1rm <= 0) continue;
    const e = porEx.get(x.exerciseId) ?? { muscle: x.muscle, barras: new Set<number>() };
    const i = baldes.findIndex((b) => dentro(x.date, b)); e.barras.add(baldes.length > 1 ? i : diffDays(j.inicio, x.date)); porEx.set(x.exerciseId, e);
  }
  const pri = (m: string) => { const i = o.prioridades.indexOf(m); return i < 0 ? 99 : i; };
  const chaves = [...porEx].filter(([, e]) => e.barras.size >= 2).sort(([a, x], [b, y]) => pri(x.muscle) - pri(y.muscle) || y.barras.size - x.barras.size || (a < b ? -1 : 1)).slice(0, 3);
  const e1rm = chaves.map(([exerciseId, e]) => {
    const s = serie((iv) => { const vs = R.e1rm.filter((x) => x.exerciseId === exerciseId && dentro(x.date, iv) && finite(x.e1rm)).map((x) => x.e1rm); return { v: vs.length ? r2(Math.max(...vs)) : null, reg: vs.length, media: vs.length }; });
    const antes = R.recordeAntes(exerciseId, j.base.inicio);
    return { exerciseId, muscle: e.muscle, s, recorde: antes != null && s.valor != null && s.valor > antes };
  });
  // semanas seguidas na meta de dias, da semana do fim do período para trás (a em andamento só soma se já bateu)
  const meta = Math.max(1, Math.min(7, Math.round(finite(o.diasMeta) ? o.diasMeta : 1)));
  const desde = rs.map((r) => `${r.de}-01`).sort()[0] ?? j.inicio;
  let semanasSeguidas = 0;
  for (let seg = mondayOf(j.ate), i = 0; seg >= mondayOf(desde) && i < 60; seg = addDays(seg, -7), i++) {
    const n = conta(treinou, { inicio: seg, fim: addDays(seg, 6) });
    if (n >= meta) semanasSeguidas++; else if (i > 0 || addDays(seg, 6) < j.hoje) break;
  }

  // ---------- comida (#115: dia vazio fora ou 0, refeição que faltou entra pela média dela, "não comi" conta 0) ----------
  const porData = new Map<string, FoodEntry[]>();
  for (const x of R.refeicoes) { const l = porData.get(x.date) ?? []; l.push({ date: x.date, meal: x.meal, kcal: x.kcal, prot: x.prot }); porData.set(x.date, l); }
  const naoComiDias = new Set(R.naoComi.map((n) => n.date));
  const cacheDia = new Map<string, DiaConta>();
  const diaFn = (d: string): DiaConta => {
    let x = cacheDia.get(d);
    if (!x) {
      if (j.primeiro && d < j.primeiro) x = { date: d, kcal: 0, prot: 0, logged: false, conta: false, estimadas: [] };
      else {
        const hist: FoodEntry[] = [];
        for (let k = 0; k < 28; k++) hist.push(...(porData.get(addDays(d, -k)) ?? []));
        const ctx: ContextoMedias = { regras: R.regras, naoComi: R.naoComi.filter((n) => n.date === d), medias: porData.has(d) || naoComiDias.has(d) ? mediasPorRefeicao(hist, d) : {}, agora: o.agora };
        x = diaComMedias(porData.get(d) ?? [], d, ctx);
      }
      cacheDia.set(d, x);
    }
    return x;
  };
  const alvo = { kcal: o.metaKcal, protein: o.metaProteina };
  const media = (iv: Intervalo) => foodAverages([], iv.fim, alvo, diffDays(iv.inicio, iv.fim) + 1, diaFn);
  const regC = (iv: Intervalo) => conta(new Set([...porData.keys(), ...naoComiDias]), iv);
  const kcal = serie((iv) => { const m = media(iv); return { v: m.avgKcal, reg: regC(iv), media: m.daysLogged }; });
  const prot = serie((iv) => { const m = media(iv); return { v: m.avgProt, reg: regC(iv), media: m.daysLogged }; });
  const protDias = serie((iv) => { const m = media(iv); return { v: m.daysLogged ? m.adherence.rate : null, reg: regC(iv), media: m.daysLogged }; });
  const bebida = serie((iv) => { const b = R.bebida.filter((x) => dentro(x.date, iv) && finite(x.kcal)); return { v: Math.round(b.reduce((a, x) => a + x.kcal, 0)), reg: b.length, media: b.length }; });

  // ---------- saúde: média só dos dias registrados ----------
  const mediaDe = <T extends { date: string }>(xs: T[], f: (x: T) => number, casas = 1) => (iv: Intervalo): Medida => {
    const vs = xs.filter((x) => dentro(x.date, iv) && finite(f(x))).map(f);
    return { v: vs.length ? Math.round((vs.reduce((a, b) => a + b, 0) / vs.length) * 10 ** casas) / 10 ** casas : null, reg: vs.length, media: vs.length };
  };
  const agua = serie(mediaDe(R.agua, (x) => x.litros));
  const sono = serie(mediaDe(R.sono, (x) => x.horas));
  const alc = (iv: Intervalo) => R.alcool.filter((x) => dentro(x.date, iv) && finite(x.doses));
  const alcoolNoites = serie((iv) => { const a = alc(iv); return { v: a.length ? a.filter((x) => x.doses > 0).length : null, reg: a.length, media: a.length }; });
  const alcoolDoses = serie((iv) => { const a = alc(iv); return { v: a.length ? a.reduce((s, x) => s + x.doses, 0) : null, reg: a.length, media: a.length }; });

  // ---------- corpo: o último valor de cada período; o começo é a 1ª medida de todas ----------
  const ultimo = <T extends { date: string }>(xs: T[], f: (x: T) => number | null) => (iv: Intervalo): Medida => {
    const vs = xs.filter((x) => dentro(x.date, iv) && finite(f(x)));
    return { v: vs.length ? f(vs[vs.length - 1]) : null, reg: vs.length, media: vs.length };
  };
  const ini = (p: PontoEvo | null) => (p && p.date < j.base.inicio ? p.value : null);
  const peso = serie(ultimo(R.peso, (x) => x.kg), ini(R.comecoCorpo.peso));
  const braco = serie(ultimo(R.medidas, (x) => x.braco), ini(R.comecoCorpo.braco));
  const cintura = serie(ultimo(R.medidas, (x) => x.cintura), ini(R.comecoCorpo.cintura));
  const ombro = serie(ultimo(R.medidas, (x) => x.ombro), ini(R.comecoCorpo.ombro));

  const tem = (s: SerieEvo) => s.cobertura.some((c) => c.registrados > 0);
  const v: Omit<EvolucaoView, "conquistas"> = {
    janela: j, baldes, comeco: j.comeco,
    treino: { dias, series, freq2, e1rm, cardio, semanasSeguidas, temDados: tem(dias) || tem(cardio) || series.some((x) => tem(x.s)) },
    comida: { kcal, prot, protDias, bebida, temDados: tem(kcal) },
    saude: { agua, sono, alcoolNoites, alcoolDoses, temDados: tem(agua) || tem(sono) || tem(alcoolNoites) },
    corpo: { peso, braco, cintura, ombro, temDados: tem(peso) || tem(braco) || tem(cintura) || tem(ombro) },
  };
  return { ...v, conquistas: conquistasDe(v, o) };
}

// ---------- conquistas: só o que melhorou NA DIREÇÃO do objetivo; nunca o contrário, nunca bronca ----------
const num = (n: number, d = 1) => { const s = (Math.round(Math.abs(n) * 10 ** d) / 10 ** d).toFixed(d); return (s.includes(".") ? s.replace(/\.?0+$/, "") : s).replace(".", ","); };
const sinal = (n: number, d = 1) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${num(n, d)}`;
const sentido = (alvo: number) => (finite(alvo) && alvo > 0 ? 1 : finite(alvo) && alvo < 0 ? -1 : 0);
/** Variação mínima para contar (abaixo disso é ruído da medida) e o que ainda é "estável". */
const LIMIAR = { cm: 0.3, kg: 0.3, estavel: 0.5 } as const;

function conquistasDe(v: Omit<EvolucaoView, "conquistas">, o: EvolucaoOpts): Conquista[] {
  const j = v.janela, chave = `${j.periodo}:${j.base.inicio}`, out: Conquista[] = [];
  const add = (id: string, aba: Aba, texto: string) => out.push({ id: `${chave}:${id}`, aba, texto });
  const d = (s: SerieEvo) => (j.periodo === "tudo" ? s.difComeco : s.difAnterior);
  // corpo
  const sb = sentido(o.objetivo.bracoCm), sc = sentido(o.objetivo.cinturaCm), sp = sentido(o.objetivo.pesoKg);
  const db = d(v.corpo.braco), dc = d(v.corpo.cintura), dp = d(v.corpo.peso), dom = d(v.corpo.ombro);
  const bracoOk = sb > 0 && db != null && db >= LIMIAR.cm;
  const cinturaEstavel = dc != null && Math.abs(dc) <= LIMIAR.estavel && sc <= 0;
  if (bracoOk) add("braco", "corpo", cinturaEstavel ? `Braço ${sinal(db!)} cm com a cintura estável` : `Braço ${sinal(db!)} cm`);
  if (sc < 0 && dc != null && dc <= -LIMIAR.cm) add("cintura", "corpo", `Cintura ${sinal(dc)} cm`);
  else if (!bracoOk && sc === 0 && cinturaEstavel && v.corpo.cintura.registrados > 0 && sb > 0) add("cintura", "corpo", "Cintura estável, como o objetivo pede");
  if (sb > 0 && dom != null && dom >= LIMIAR.cm) add("ombro", "corpo", `Ombro ${sinal(dom)} cm`);
  if (sp !== 0 && dp != null && dp * sp >= LIMIAR.kg) add("peso", "corpo", `Peso ${sinal(dp)} kg, na direção do objetivo`);
  // treino
  for (const e of v.treino.e1rm.filter((x) => x.recorde).slice(0, 2)) add(`recorde-${e.exerciseId}`, "treino", `Recorde de força em ${o.nome?.(e.exerciseId) ?? e.exerciseId}: ${num(e.s.valor!)} kg (e1RM)`);
  if (v.treino.semanasSeguidas >= 2) add("semanas", "treino", `${v.treino.semanasSeguidas} semanas seguidas na meta de treinos`);
  const dd = d(v.treino.dias);
  if (dd != null && dd >= 1 && (v.treino.dias.valor ?? 0) >= 2) add("dias", "treino", `${dd} ${dd === 1 ? "dia" : "dias"} de treino a mais que ${j.periodo === "tudo" ? "no começo" : "o período anterior"}`);
  const df = d(v.treino.freq2);
  if (df != null && df >= 10) add("freq2", "treino", `Mais músculos treinados 2× na semana: ${v.treino.freq2.valor}% (eram ${(v.treino.freq2.valor ?? 0) - df}%)`);
  // comida
  const pd = v.comida.protDias, dpd = d(pd), antPd = j.periodo === "tudo" ? pd.comeco : pd.anterior;
  if (dpd != null && dpd >= 10 && pd.naMedia >= 3) add("proteina", "comida", `Proteína batida em mais dias: ${pd.valor}% dos dias (eram ${antPd}%)`);
  // saúde
  const ds = d(v.saude.sono), antS = j.periodo === "tudo" ? v.saude.sono.comeco : v.saude.sono.anterior;
  if (ds != null && ds >= 0.3 && antS != null && antS < 8) add("sono", "saude", `Sono médio subiu para ${num(v.saude.sono.valor!)} h`);
  const da = d(v.saude.agua);
  if (da != null && da >= 0.2) add("agua", "saude", `Mais água: média de ${num(v.saude.agua.valor!)} L por dia registrado`);
  const al = v.saude.alcoolDoses, antA = j.periodo === "tudo" ? al.comeco : al.anterior;
  if (al.valor != null && antA != null && antA > 0 && al.valor < antA) add("alcool", "saude", `Menos doses de álcool: ${al.valor} (eram ${antA})`);
  return out;
}

/** A diferença escrita: nunca só o sinal nem só a cor. `null` = sem dado para comparar. */
export function difTextoEvo(dv: number | null, un: readonly [string, string], ref: "anterior" | "comeco", casas = 0): string {
  const alvo = ref === "anterior" ? "o período anterior" : "no começo";
  if (dv == null) return ref === "anterior" ? "sem dado do período anterior" : "sem dado do começo";
  if (dv === 0 || Math.abs(dv) < 0.5 * 10 ** -casas) return ref === "anterior" ? "igual ao período anterior" : "igual ao começo";
  const n = Math.abs(dv), t = casas ? num(n, casas) : String(Math.round(n));
  return `${t} ${n === 1 ? un[0] : un[1]} a ${dv > 0 ? "mais" : "menos"} que ${alvo}`;
}
