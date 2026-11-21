// #123 "Feito" só ao terminar, cancelar treino, Treinei ↔ check-in e corrigir séries de um dia (mesmo já feito).
// - Começar não grava presença; Terminar grava ("fim"). Sessão aberta com séries não deixa o dia "feito" (dayStatus + `abertas`).
// - Cancelar descarta a sessão (séries, cronômetro, descanso) e o dia volta a pendente; a presença automática some.
// - "Treinei" grava a presença e o check-in (sim); trocar para "Não" volta o dia a pendente e o check-in vira não.
// - Corrigir (app e MCP): apagar séries, remover exercício, corrigir uma série, descartar/mesclar sessão duplicada do dia.
//   Numeração das séries é a do DIA (ordem das sessões, depois o nº da série), 1..n por exercício. Puro, sem dependências.
import { EXERCISE_BY_ID } from "./catalog.ts";
import type { MuscleId } from "./catalog.ts";
import { erroSerie, fmtSerie } from "./medida.ts";
import type { Attendance, Sets } from "./semana.ts";

/** Fontes da presença gravada pelo próprio treino (Começar antigo / Terminar): somem quando o treino do dia é descartado. */
export const PRESENCA_DO_TREINO = ["inicio", "fim"] as const;

/** "Treinei"/"Não treinei". Trocar de Treinei para Não = começou sem querer: o dia volta a pendente (sem presença). */
export function respostaTreinei(atual: Attendance | null | undefined, fui: boolean): { presenca: Attendance | null; checkin: boolean } {
  if (fui) return { presenca: "fui", checkin: true };
  return { presenca: atual === "fui" ? null : "nao_fui", checkin: false };
}

/** Depois de descartar sessão(ões) do dia: a presença automática some só se não sobrou sessão. "Treinei" da pessoa fica. */
export function presencaAposDescartar(p: { status: string; source: string } | null | undefined, restam: number): "manter" | "apagar" {
  return p && p.status === "fui" && restam === 0 && (PRESENCA_DO_TREINO as readonly string[]).includes(p.source) ? "apagar" : "manter";
}

/** Cancelar o treino começado no aparelho: sem sessão local (cronômetro e descanso param) e o dia sem ela, pendente. */
export function cancelarSessaoLocal<W extends { sessions: { id?: string }[]; attendance: Record<string, string> }, L extends { id: string; date: string }>(
  s: L, week: W,
): { sessao: null; week: W } {
  const sessions = week.sessions.filter((x) => x.id !== s.id);
  const attendance = { ...week.attendance };
  if (!sessions.some((x) => (x as { date?: string }).date === s.date) && attendance[s.date] === "fui") delete attendance[s.date];
  return { sessao: null, week: { ...week, sessions, attendance } };
}

// ---------- corrigir séries de um dia ----------
export interface SerieDia {
  sessao: string; exercicio: string; serie: number; musculo: MuscleId;
  kg: number | null; reps: number | null; segundos: number | null; rir: number | null;
  /** started_at da sessão: ordena a numeração do dia */
  inicio: number;
}
export interface PedidoCorrecao {
  /** séries do dia a apagar; sem `series` = o exercício inteiro sai do dia */
  apagar?: { exercicioId: string; series?: number[] }[];
  corrigir?: { exercicioId: string; serie: number; kg?: number; reps?: number; segundos?: number; rir?: number }[];
  /** descarta uma sessão do dia (sobra duplicada) com as séries dela */
  descartarSessao?: string;
  /** junta as sessões do dia na mais antiga (sem mudar o volume) */
  mesclar?: boolean;
}
type Chave = { sessao: string; exercicio: string; serie: number };
export interface PlanoCorrecao {
  apagar: Chave[];
  corrigir: (Chave & { kg: number | null; reps: number | null; segundos: number | null; rir: number | null })[];
  mover: (Chave & { para: string; paraSerie: number })[];
  descartar: string[];
  /** o que muda, em linhas curtas */
  linhas: string[];
  /** séries por músculo na semana, só os que mudam: "9 → 7" */
  volume: Partial<Record<MuscleId, string>>;
}
const MAX_SERIES = 12;
const nome = (id: string) => (Object.prototype.hasOwnProperty.call(EXERCISE_BY_ID, id) ? EXERCISE_BY_ID[id].nm : id);
const txt = (s: Pick<SerieDia, "kg" | "reps" | "segundos">) => fmtSerie({ kg: s.kg ?? 0, reps: s.reps ?? 0, segundos: s.segundos });

/** Planeja a correção do dia: o que apagar, corrigir, mover e descartar, as linhas da prévia e o volume antes → depois. */
export function planejarCorrecao(
  e: { series: readonly SerieDia[]; sessoes: readonly { id: string; inicio: number }[]; semana?: Sets },
  p: PedidoCorrecao,
): PlanoCorrecao | { erro: string } {
  const ses = [...e.sessoes].sort((a, b) => a.inicio - b.inicio || (a.id < b.id ? -1 : 1));
  const ordem = new Map(ses.map((s, i) => [s.id, i]));
  const doDia = (ex: string) => e.series.filter((s) => s.exercicio === ex)
    .sort((a, b) => (ordem.get(a.sessao) ?? 0) - (ordem.get(b.sessao) ?? 0) || a.serie - b.serie);
  const out: PlanoCorrecao = { apagar: [], corrigir: [], mover: [], descartar: [], linhas: [], volume: {} };
  const saiu = new Set<string>(), k = (s: Chave) => `${s.sessao}|${s.exercicio}|${s.serie}`;
  const tira = (s: SerieDia) => { if (!saiu.has(k(s))) { saiu.add(k(s)); out.apagar.push({ sessao: s.sessao, exercicio: s.exercicio, serie: s.serie }); } };

  for (const a of p.apagar ?? []) {
    const l = doDia(a.exercicioId);
    if (!l.length) return { erro: `${a.exercicioId}: sem séries registradas nesse dia` };
    if (!a.series?.length) { l.forEach(tira); out.linhas.push(`remover ${nome(a.exercicioId)} do dia (${l.length} série${l.length > 1 ? "s" : ""})`); continue; }
    for (const n of [...new Set(a.series)].sort((x, y) => x - y)) {
      const s = l[n - 1];
      if (!s) return { erro: `${a.exercicioId}: não existe a série ${n} nesse dia (há ${l.length})` };
      tira(s); out.linhas.push(`apagar ${nome(a.exercicioId)} série ${n} (${txt(s)})`);
    }
  }
  for (const c of p.corrigir ?? []) {
    const s = doDia(c.exercicioId)[c.serie - 1];
    if (!s) return { erro: `${c.exercicioId}: não existe a série ${c.serie} nesse dia` };
    if (saiu.has(k(s))) return { erro: `${c.exercicioId} série ${c.serie}: está para apagar e corrigir ao mesmo tempo` };
    const tempo = c.segundos != null || (c.reps == null && s.segundos != null);
    const novo = { kg: c.kg ?? s.kg, reps: tempo ? null : c.reps ?? s.reps, segundos: tempo ? c.segundos ?? s.segundos : null, rir: c.rir ?? s.rir };
    const er = erroSerie(c.exercicioId, { reps: novo.reps, segundos: novo.segundos });
    if (er) return { erro: `${c.exercicioId} série ${c.serie}: ${er}` };
    out.corrigir.push({ sessao: s.sessao, exercicio: s.exercicio, serie: s.serie, ...novo });
    out.linhas.push(`corrigir ${nome(c.exercicioId)} série ${c.serie}: ${txt(s)} → ${txt(novo)}`);
  }
  if (p.descartarSessao != null) {
    if (!ordem.has(p.descartarSessao)) return { erro: "sessão não encontrada nesse dia (use o id da prévia)" };
    const l = e.series.filter((s) => s.sessao === p.descartarSessao);
    l.forEach(tira);
    out.descartar.push(p.descartarSessao);
    out.linhas.push(`descartar a sessão ${ordem.get(p.descartarSessao)! + 1} do dia (${l.length} série${l.length === 1 ? "" : "s"})`);
  }
  if (p.mesclar) {
    if (ses.length < 2) return { erro: "esse dia tem uma sessão só: nada para mesclar" };
    const alvo = ses[0].id, prox = new Map<string, number>();
    for (const s of e.series) if (s.sessao === alvo && !saiu.has(k(s))) prox.set(s.exercicio, Math.max(prox.get(s.exercicio) ?? 0, s.serie));
    for (const o of ses.slice(1)) {
      if (out.descartar.includes(o.id)) continue;
      for (const s of e.series.filter((x) => x.sessao === o.id && !saiu.has(k(x))).sort((a, b) => a.serie - b.serie)) {
        const n = (prox.get(s.exercicio) ?? 0) + 1;
        if (n > MAX_SERIES) return { erro: `${s.exercicio}: mesclar passaria de ${MAX_SERIES} séries; descarte a sessão duplicada` };
        prox.set(s.exercicio, n);
        out.mover.push({ sessao: s.sessao, exercicio: s.exercicio, serie: s.serie, para: alvo, paraSerie: n });
      }
      out.descartar.push(o.id);
    }
    out.linhas.push(`mesclar ${ses.length} sessões do dia na 1ª (${out.mover.length} série${out.mover.length === 1 ? "" : "s"} movida${out.mover.length === 1 ? "" : "s"})`);
  }
  if (!out.linhas.length) return { erro: "nada a corrigir: mande apagar, corrigir, descartarSessao ou mesclar" };
  // volume da semana (séries por músculo): só o que sai muda; corrigir e mesclar não mudam a contagem
  const menos: Partial<Record<MuscleId, number>> = {};
  for (const s of e.series) if (saiu.has(k(s))) menos[s.musculo] = (menos[s.musculo] ?? 0) + 1;
  for (const [m, n] of Object.entries(menos) as [MuscleId, number][]) {
    const antes = e.semana?.[m] ?? n;
    out.volume[m] = `${antes} → ${Math.max(0, antes - n)}`;
  }
  return out;
}
