// Estado da semana planejada (#24). Servidor: /api/week (versões no D1). Demonstração: o mesmo core roda no navegador
// com dados fictícios e as versões ficam no localStorage. Hoje lê daqui o treino do dia e os dias que restam.
import * as C from "@ciclo/core";
import { S, adotarTreinoDeHoje, commit, monday, today } from "../../lib/store/index.ts";
import { SERVER, api } from "../../lib/api/index.ts";
import { toast } from "../../lib/ui/index.tsx";
import { lsGet, lsSet } from "../../lib/util.ts";
// #82 a demonstração (planWeek, weekView… no navegador) só baixa no ?demo: fora do JS inicial do servidor
const carregarDemo = () => import("./demo.ts").then((m) => m.demo);

export interface Versao { version: number; source: string; createdAt: number }
export type Dia = C.WeekDay & { status: C.DayStatus };
export interface Semana extends Omit<C.WeekView, "days"> {
  days: Dia[]; version: number; versions: Versao[];
  progression: { changes: C.VolumeChange[]; deload: { on: boolean; reason: string | null } };
}

const CACHE = `ciclo:v1:${SERVER ? "srv" : "demo"}:semana:${monday}`;
let semana: Semana | null = lsGet<Semana | null>(CACHE, null);
let vazio: string | null = null;
let carregando: Promise<void> | null = null;
/** #63 Texto do "sem semana" na interface (o servidor manda só o motivo). */
const VAZIO: Record<string, string> = {
  sem_perfil: "Complete o Perfil de treino: falta o básico (objetivo, dias e onde treina).",
};
export const getSemana = () => semana;
export const getVazio = () => vazio;
export const diaDe = (date: string) => semana?.days.find((d) => d.date === date) ?? null;

function set(s: Semana | null) {
  semana = s; if (s) lsSet(CACHE, s);
  sincronizarHoje(); commit();
}

/** Carrega uma vez por abertura do app (Hoje e Semana chamam). */
export function garantirSemana(force = false): Promise<void> {
  if (carregando && !force) return carregando;
  carregando = (async () => {
    await Promise.resolve(); // o efeito da tela roda antes de a casca assinar o commit
    try {
      if (!SERVER) { const demo = await carregarDemo(); await demo.semear(); return set(demo.ver()); }
      const r = await api<{ week: Semana | null; empty?: string }>("GET", `/api/week?date=${today}`);
      vazio = r.week ? null : VAZIO[r.empty ?? ""] ?? VAZIO.sem_perfil;
      set(r.week);
    } catch (e) {
      if (!SERVER) { console.error("semana (demo)", e instanceof Error ? e.message : e); return; }
      if (!semana) toast("Sem conexão: a semana aparece quando voltar o sinal");
    }
  })();
  return carregando;
}

async function rodar(f: () => Promise<{ week: Semana | null }>, ok: string) {
  try { const r = await f(); if (r.week) set(r.week); toast(ok); return true; }
  catch (e: any) { toast(e?.status ? e.message : "Sem conexão: tente de novo com sinal"); return false; }
}

/** Ação num dia: gerar (trocar geração), mover, trocar, folga, treino, extra, manter (sem compensatório) ou falta. */
export const acaoDia = (date: string, body: { action: string; opts?: C.DayOpts; to?: string; resposta?: string }, ok = "Semana reorganizada") =>
  rodar(() => (SERVER ? api("POST", `/api/week/day/${date}`, { ...body, today }) : carregarDemo().then((d) => d.acao(date, body))), ok);

/** #108 "Gerar treino" num dia sem treino: só por toque. Sai na hora (gerador validado) com "revisão da IA pendente". */
export const gerarTreino = (date: string) =>
  rodar(() => (SERVER ? api("POST", `/api/week/day/${date}/gerar-treino`, { today }) : carregarDemo().then((d) => d.gerarTreino(date))), "Treino gerado · revisão da IA pendente");

/** #108/#121 O treino de um dia é sempre o da semana (fonte única). Dia sem treino não tem plano (nada é gerado ao abrir). */
export const planoDoDia = (d: Dia): C.DayPlan | null => C.treinoDoDia({ days: [d] }, d.date);

/** #113 "Treinei"/"não treinei" vale em qualquer dia até hoje, mesmo fora dos dias cadastrados (a semana se reorganiza). */
export const marcavel = (d: Dia) => d.date <= today && d.status !== "feito" && d.status !== "extra";
export const podeNaoTreinei = (d: Dia) => marcavel(d) && (d.status === "hoje" || d.status === "pendente");
export const marcar = (d: Dia, fui: boolean) => acaoDia(d.date, { action: "falta", resposta: fui ? "fui" : "nao_fui" }, fui ? "Marcado: treinei" : "Marcado: não treinei · semana reorganizada")
  .then((ok) => { if (ok) { if (fui) S.week.attendance[d.date] = "fui"; else S.week.attendance[d.date] = "nao_fui"; } return ok; });
/** #123 Marcou "Treinei" sem querer: trocar para Não volta o dia a pendente (o check-in vira não). Série registrada segura o dia. */
export const podeDesmarcar = (d: Dia) => d.date <= today && (d.status === "feito" || d.status === "extra") && S.week.attendance[d.date] === "fui";
export async function desmarcar(d: Dia) {
  const ok = await acaoDia(d.date, { action: "falta", resposta: "nao_fui" }, "Marcado: não treinei · o dia voltou a pendente");
  if (!ok) return;
  delete S.week.attendance[d.date];
  const st = diaDe(d.date)?.status;
  if (st === "feito" || st === "extra") toast("Há séries registradas nesse dia: corrija ou cancele pelo treino");
}

/** #113 Empurrar treino: prévia (o que anda e para onde) e aplicar. Hoje vira folga; feito não se move. */
export interface Empurrao { moves: { de: string; para: string | null; nome: string }[]; diff: C.DayDiff[] }
export async function previaEmpurrar(): Promise<Empurrao | null> {
  try { return SERVER ? await api<Empurrao>("POST", "/api/week/empurrar", { today }) : (await carregarDemo()).empurrar(false); }
  catch (e: any) { toast(e?.status ? e.message : "Sem conexão"); return null; }
}
export const empurrar = () =>
  rodar(() => (SERVER ? api("POST", "/api/week/empurrar", { today, apply: true }) : carregarDemo().then((d) => d.empurrar(true))), "Treinos empurrados · hoje é folga");

export async function previaRegenerar(reset: boolean): Promise<C.DayDiff[] | null> {
  try { return SERVER ? (await api<{ diff: C.DayDiff[] }>("POST", "/api/week/regenerate", { date: today, reset })).diff : (await carregarDemo()).regenerar(reset, false).diff; }
  catch (e: any) { toast(e?.status ? e.message : "Sem conexão"); return null; }
}
/** Regenerar substitui o treino dos dias que ainda não passaram (#121: não há "voltar versão"; voltar atrás é pedir à IA). */
export const regenerar = (reset: boolean) =>
  rodar(() => (SERVER ? api("POST", "/api/week/regenerate", { date: today, reset, apply: true }) : carregarDemo().then((d) => d.regenerar(reset, true))), "Semana regenerada");

/** Hoje: dias que restam vêm da semana; o treino de hoje é SEMPRE o da semana (#121 fonte única: o que a IA salvou, o
 *  gerado ou o editado). Mudou lá → o Começar abre o novo; no meio do treino nada troca. Dia livre: nada é gerado ao abrir. */
export function sincronizarHoje() {
  const s = semana; if (!s) return;
  const d = s.days.find((x) => x.date === today); if (!d) return;
  S.ui.daysLeft = Math.max(1, s.days.filter((x) => x.date >= today && (x.status === "hoje" || x.status === "planejado")).length);
  if (!adotarTreinoDeHoje(d.status === "hoje" ? C.treinoDoDia(s, today) : null)) return;
  if (d.gymId && S.gyms.some((g) => g.id === d.gymId)) S.ui.gymId = d.gymId;
  if (d.opts.minutes) S.ui.minutes = d.opts.minutes;
  if (d.opts.format) S.ui.format = d.opts.format;
}

