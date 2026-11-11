// Histórico: sessões passadas (volume e PRs) e cardio, do mais recente para trás. Servidor: paginado; demonstração: a semana.
import { useEffect, useState } from "preact/hooks";
import { C, S } from "../../lib/store/index.ts";
import { EXB } from "../../lib/store/regras.ts";
import { SERVER, api } from "../../lib/api/index.ts";
import { Card } from "../../lib/ui/index.tsx";
import { fmt, longDate } from "../../lib/util.ts";
import { cardioLine, cardioName } from "./cardio.tsx";

interface Ses { id: string; date: string; startedAt: number; finishedAt: number | null; closedBy: string | null; name: string | null; sets: number; volume: number; prs: { exerciseId: string; kind: string; value: number; prev: number }[] }
const PR_TXT: Record<string, string> = { e1rm: "e1RM", carga: "carga", reps: "reps" };

export function Historico() {
  const [sess, setSess] = useState<Ses[]>([]), [next, setNext] = useState<number | null>(null), [cardio, setCardio] = useState<C.CardioEntry[]>(S.week.cardio), [busy, setBusy] = useState(SERVER), [fail, setFail] = useState(false);
  const load = async (before: number | null) => {
    setBusy(true); setFail(false);
    try {
      const r = await api<{ sessions: Ses[]; next: number | null }>("GET", `/api/sessions?limit=15${before ? `&before=${before}` : ""}`);
      setSess((x) => (before ? [...x, ...r.sessions] : r.sessions)); setNext(r.next);
      if (!before) setCardio((await api<{ cardio: C.CardioEntry[] }>("GET", "/api/cardio?limit=100")).cardio);
    } catch { setFail(true); }
    setBusy(false);
  };
  useEffect(() => { if (SERVER) void load(null); else setSess(S.week.sessions.map((s: any, i: number) => ({ id: String(i), date: s.date, startedAt: 0, finishedAt: 1, closedBy: null, name: s.name, sets: 0, volume: 0, prs: [] }))); }, []);
  // com mais páginas por vir, cardio mais antigo que a última sessão carregada espera a próxima página
  const floor = next != null && sess.length ? sess[sess.length - 1].date : "";
  type Row = { date: string; k: string; ses?: Ses; car?: C.CardioEntry };
  const rows: Row[] = [...sess.map((s) => ({ date: s.date, k: "s" + s.id, ses: s })), ...cardio.filter((c) => c.date >= floor).map((c) => ({ date: c.date, k: "c" + c.id, car: c }))]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return <>
    <h1 style="margin:4px 0 12px">Histórico</h1>
    {!SERVER && <p class="small sub" style="margin-bottom:10px">Demonstração: volume e recordes aparecem com o servidor.</p>}
    <Card>{rows.length ? rows.map((r) => r.ses ? <div key={r.k} style="padding:10px 0;border-top:1px solid var(--borda)">
        <div class="row between start"><div><b>{r.ses.name ?? "Treino"}</b><p class="small sub num">{longDate(r.date)}{r.ses.finishedAt && r.ses.startedAt ? ` · ${C.fmtClock(r.ses.finishedAt - r.ses.startedAt)}` : ""}{r.ses.closedBy === "auto" ? " · fechou sozinho" : ""}</p></div>
          {r.ses.sets > 0 && <div class="num" style="text-align:right"><b>{fmt(r.ses.volume)} kg</b><p class="tiny sub">{r.ses.sets} séries</p></div>}</div>
        {r.ses.prs.length > 0 && <div class="row wrapx" style="gap:6px;margin-top:6px">{r.ses.prs.slice(0, 6).map((p, i) => <span class="badge ok num" key={i}>PR {PR_TXT[p.kind] ?? p.kind} · {EXB[p.exerciseId]?.nm ?? p.exerciseId} {fmt(p.value, p.value % 1 ? 1 : 0)}{p.kind === "reps" ? "" : " kg"}</span>)}</div>}</div>
      : <div key={r.k} class="row between" style="padding:10px 0;border-top:1px solid var(--borda)"><div><b>{cardioName(r.car!.type)}</b><p class="small sub num">{longDate(r.date)} · {cardioLine(r.car!)}</p></div><span class="badge">cardio</span></div>)
      : <p class="sub">{busy ? "Carregando…" : "Nenhum treino ainda. O primeiro aparece aqui ao encerrar."}</p>}
      {fail && <p class="small" role="alert" style="color:var(--warn)">Sem conexão para carregar mais. <button type="button" class="btn sm" onClick={() => load(next)}>Tentar de novo</button></p>}
      {next != null && !fail && <button type="button" class="btn full" style="margin-top:10px" disabled={busy} onClick={() => load(next)}>{busy ? "Carregando…" : "Carregar mais"}</button>}</Card></>;
}
