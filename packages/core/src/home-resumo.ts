// #159 Resumo de treino da Home (Semana | Mês): dias treinados contra a meta, séries, cardio e duração média, cada um com a
// diferença contra o período anterior de mesmo tamanho. Tudo puro: o Worker manda linhas por dia (HomeRaw), o core conta.
//
// Semana = segunda a domingo da semana corrente (em andamento); mês = o mês corrente. O período anterior tem o MESMO número de
// dias já decorridos (quinta: seg a qui da semana passada; dia 12: 1 a 12 do mês passado, sem passar do fim dele), para a conta
// não parecer "atrás" só porque o período atual ainda está no meio.
import { mondayOf } from "./checkin.ts";

const DAY = 864e5;
const addDays = (iso: string, n: number) => new Date(Date.parse(iso + "T12:00:00Z") + n * DAY).toISOString().slice(0, 10);
const diffDays = (a: string, b: string) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / DAY);
const diasDoMes = (ano: number, mes: number) => new Date(Date.UTC(ano, mes, 0)).getUTCDate(); // mes: 1 a 12
const iso = (ano: number, mes: number, dia: number) => `${String(ano).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const media = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;

export type PeriodoResumo = "semana" | "mes";
/** Janela da tela de detalhe: 4 semanas por padrão, 12 (3 meses) no máximo. A #147 amplia daqui. */
export const DETALHE_SEMANAS = { curta: 4, longa: 12 } as const;

export interface JanelaResumo {
  inicio: string; fim: string; antInicio: string; antFim: string;
  /** dias do período já decorridos (até hoje) e dias do período inteiro */
  decorridos: number; total: number;
}

export function janelaResumo(hoje: string, periodo: PeriodoResumo): JanelaResumo {
  if (periodo === "semana") {
    const inicio = mondayOf(hoje), decorridos = diffDays(inicio, hoje) + 1, antInicio = addDays(inicio, -7);
    return { inicio, fim: hoje, antInicio, antFim: addDays(antInicio, decorridos - 1), decorridos, total: 7 };
  }
  const ano = Number(hoje.slice(0, 4)), mes = Number(hoje.slice(5, 7)), dia = Number(hoje.slice(8, 10));
  const aAno = mes === 1 ? ano - 1 : ano, aMes = mes === 1 ? 12 : mes - 1;
  return {
    inicio: iso(ano, mes, 1), fim: hoje, antInicio: iso(aAno, aMes, 1), antFim: iso(aAno, aMes, Math.min(dia, diasDoMes(aAno, aMes))),
    decorridos: dia, total: diasDoMes(ano, mes),
  };
}

/** Sessão com início e fim em ms. `auto` = o app fechou sozinho (o fim é só um teto, não a hora que a pessoa terminou). */
export interface DuracaoRaw { date: string; startedAt: number; finishedAt: number | null; auto?: boolean }
export interface ResumoRaw {
  sets: { date: string; muscle: string; n: number }[];
  sessoes: string[]; presenca: string[];
  cardio: { date: string; minutes: number }[];
  duracoes?: DuracaoRaw[];
}

export interface MedidasResumo {
  dias: number; series: number; cardioMin: number;
  /** minutos por semana; só depois de uma semana de período (antes disso o número engana) */
  cardioMediaSemana: number | null;
  /** minutos, só das sessões com início e fim reais; null sem nenhuma */
  duracaoMin: number | null; sessoesComTempo: number;
}
export interface ResumoPeriodo {
  periodo: PeriodoResumo; inicio: string; fim: string; antInicio: string; antFim: string;
  decorridos: number; total: number;
  /** meta de dias treinados no período inteiro */
  meta: number;
  atual: MedidasResumo; anterior: MedidasResumo;
  /** atual − anterior; duração é null se faltar em um dos dois */
  dif: { dias: number; series: number; cardioMin: number; duracaoMin: number | null };
  /** algum treino neste período ou no anterior (senão: "precisa de mais registros") */
  temDados: boolean;
}
export interface ResumoTreino { semana: ResumoPeriodo; mes: ResumoPeriodo }

function medir(raw: ResumoRaw, de: string, ate: string, decorridos: number): MedidasResumo {
  const dentro = (d: string) => d >= de && d <= ate;
  const dias = new Set([...raw.sessoes, ...raw.presenca].filter(dentro)).size;
  const series = raw.sets.filter((s) => dentro(s.date) && finite(s.n) && s.n > 0).reduce((a, s) => a + s.n, 0);
  const cardioMin = raw.cardio.filter((c) => dentro(c.date) && finite(c.minutes) && c.minutes > 0).reduce((a, c) => a + c.minutes, 0);
  const tempos = (raw.duracoes ?? []).filter((x) => dentro(x.date) && !x.auto && finite(x.finishedAt) && finite(x.startedAt) && x.finishedAt > x.startedAt)
    .map((x) => (x.finishedAt! - x.startedAt) / 60_000);
  return {
    dias, series, cardioMin,
    cardioMediaSemana: decorridos >= 7 ? Math.round((cardioMin * 7) / decorridos) : null,
    duracaoMin: tempos.length ? Math.round(media(tempos)) : null, sessoesComTempo: tempos.length,
  };
}

function resumo(raw: ResumoRaw, hoje: string, diasMeta: number, periodo: PeriodoResumo): ResumoPeriodo {
  const j = janelaResumo(hoje, periodo);
  const atual = medir(raw, j.inicio, j.fim, j.decorridos), anterior = medir(raw, j.antInicio, j.antFim, j.decorridos);
  const porSemana = Math.max(1, Math.min(7, Math.round(finite(diasMeta) ? diasMeta : 1)));
  const meta = periodo === "semana" ? porSemana : Math.max(1, Math.min(j.total, Math.round((porSemana * j.total) / 7)));
  return {
    periodo, inicio: j.inicio, fim: j.fim, antInicio: j.antInicio, antFim: j.antFim, decorridos: j.decorridos, total: j.total,
    meta, atual, anterior,
    dif: {
      dias: atual.dias - anterior.dias, series: atual.series - anterior.series, cardioMin: atual.cardioMin - anterior.cardioMin,
      duracaoMin: atual.duracaoMin != null && anterior.duracaoMin != null ? atual.duracaoMin - anterior.duracaoMin : null,
    },
    temDados: atual.dias > 0 || anterior.dias > 0 || atual.series > 0 || anterior.series > 0,
  };
}

export function resumoTreino(raw: ResumoRaw, o: { hoje: string; diasMeta: number }): ResumoTreino {
  return { semana: resumo(raw, o.hoje, o.diasMeta, "semana"), mes: resumo(raw, o.hoje, o.diasMeta, "mes") };
}

/** A diferença escrita ("1 dia a mais que a semana passada"): nunca só o sinal nem só a cor. `null` = não dá para comparar. */
export function difTexto(d: number | null, un: readonly [string, string], periodo: PeriodoResumo): string {
  const ref = periodo === "semana" ? "a semana passada" : "o mês passado";
  if (d == null) return `sem dado ${periodo === "semana" ? "na semana passada" : "no mês passado"}`;
  if (d === 0) return `igual ${periodo === "semana" ? "à semana passada" : "ao mês passado"}`;
  const n = Math.abs(d);
  return `${n} ${n === 1 ? un[0] : un[1]} a ${d > 0 ? "mais" : "menos"} que ${ref}`;
}
