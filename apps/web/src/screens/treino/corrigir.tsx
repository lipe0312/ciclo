// #123 Corrigir um treino registrado, mesmo terminado (dia feito não trava): editar carga/reps (ou tempo), apagar série e
// tirar o exercício. Servidor: grava e refaz o resumo; o volume da semana recalcula. Demonstração: só a sessão do aparelho.
import { useEffect, useState } from "preact/hooks";
import { C, S, commit } from "../../lib/store/index.ts";
import { EXB } from "../../lib/store/regras.ts";
import { SERVER, api } from "../../lib/api/index.ts";
import { SheetHead, openSheet } from "../../lib/folha/index.tsx";
import "./corrigir.css";
import { Icon, toast } from "../../lib/ui/index.tsx";

interface Serie { exerciseId: string; setNo: number; kg: number | null; reps: number | null; segundos: number | null }
interface Item { exerciseId: string; nm?: string; muscle?: string }
interface Sessao { id: string; date: string; plan: { name?: string; items?: Item[] }; sets: Serie[] }

export const abrirCorrigir = (id: string) => openSheet(() => <Corrigir id={id} />);

const numero = (v: string) => { const n = parseFloat(v.replace(",", ".")); return Number.isFinite(n) ? n : null; };
/** A sessão do aparelho no formato do servidor (séries feitas; o nº é a posição, como no servidor). */
function local(id: string): Sessao | null {
  const s = S.session; if (!s || s.id !== id) return null;
  const sets: Serie[] = [];
  for (const [ex, logs] of Object.entries(s.logs as Record<string, any[]>)) logs.forEach((l, k) => {
    if (l.done) sets.push({ exerciseId: ex, setNo: k + 1, kg: numero(String(l.kg ?? "")), reps: l.modo === "tempo" ? null : parseInt(String(l.reps), 10) || 0, segundos: l.modo === "tempo" ? C.lerSegundos(l.seg ?? "") : null });
  });
  return { id, date: s.date, plan: s.plan, sets };
}
/** Espelha a correção na sessão do aparelho (Hoje mostra o resumo dela). */
function espelhar(id: string, f: (logs: Record<string, any[]>, plan: { items: Item[] }) => void, summary?: unknown) {
  const s = S.session; if (!s || s.id !== id) return;
  f(s.logs, s.plan);
  if (summary) s.summary = summary;
  else if (s.finishedAt) s.summary = C.sessionSummary(s.finishedAt - s.startedAt, Object.fromEntries(Object.entries(s.logs as Record<string, any[]>).map(([ex, l]) => [ex, l.filter((x) => x.done).map((x) => x.modo === "tempo" ? { kg: 0, reps: 0, segundos: C.lerSegundos(x.seg ?? "") } : { kg: numero(String(x.kg ?? "")) ?? 0, reps: parseInt(String(x.reps), 10) || 0 })]).filter(([, l]) => l.length)), {});
}
const semanaDeNovo = () => { if (SERVER) void import("../semana/estado.ts").then((m) => m.garantirSemana(true)).catch(() => {}); };

function Corrigir({ id }: { id: string }) {
  const [ses, setSes] = useState<Sessao | null>(null), [erro, setErro] = useState(false), [busy, setBusy] = useState(false), [tirar, setTirar] = useState<string | null>(null);
  const carregar = async () => {
    if (!SERVER) return setSes(local(id));
    try { setSes(await api<Sessao>("GET", `/api/sessions/${encodeURIComponent(id)}`)); setErro(false); } catch { setErro(true); }
  };
  useEffect(() => { void carregar(); }, [id]);
  const rodar = async (f: () => Promise<void>, ok: string) => {
    setBusy(true);
    try { await f(); await carregar(); semanaDeNovo(); commit(); toast(ok); }
    catch (e: any) { toast(e?.status ? e.message : "Sem conexão: tente de novo com sinal"); }
    setBusy(false);
  };
  if (erro) return <><SheetHead kicker="Corrigir treino" title="Sem conexão" /><p class="small sub" style="margin-top:8px">Abra de novo com sinal para corrigir.</p></>;
  if (!ses) return <><SheetHead kicker="Corrigir treino" title="Carregando…" /></>;
  const nome = (ex: string) => ses.plan.items?.find((i) => i.exerciseId === ex)?.nm ?? EXB[ex]?.nm ?? ex;
  const musculo = (ex: string) => ses.plan.items?.find((i) => i.exerciseId === ex)?.muscle;
  const porEx = new Map<string, Serie[]>();
  for (const x of [...ses.sets].sort((a, b) => a.setNo - b.setNo)) porEx.set(x.exerciseId, [...(porEx.get(x.exerciseId) ?? []), x]);

  const salvar = (x: Serie, campo: "kg" | "reps" | "seg", v: string) => {
    const novo = { ...x };
    if (campo === "kg") novo.kg = numero(v);
    else if (campo === "reps") { const r = parseInt(v, 10); if (!Number.isFinite(r) || r < 0 || r > 100) return toast("Repetições de 0 a 100"); novo.reps = r; }
    else { const sg = C.lerSegundos(v); if (sg == null) return toast("Tempo em mm:ss, até 60:00"); novo.segundos = sg; }
    if (novo.kg != null && (novo.kg < 0 || novo.kg > 600)) return toast("Carga de 0 a 600 kg");
    void rodar(async () => {
      let summary: unknown;
      if (SERVER) summary = (await api<{ summary?: unknown }>("POST", `/api/sessions/${encodeURIComponent(id)}/sets`, { corrigir: true, exerciseId: x.exerciseId, muscle: musculo(x.exerciseId), setNo: x.setNo, kg: novo.kg,
        ...(novo.segundos != null ? { segundos: novo.segundos } : { reps: novo.reps }) })).summary;
      espelhar(id, (logs) => { const l = logs[x.exerciseId]?.[x.setNo - 1]; if (l) { l.kg = novo.kg ?? ""; if (novo.segundos != null) l.seg = C.fmtSegundos(novo.segundos); else l.reps = novo.reps; } }, summary);
    }, "Série corrigida");
  };
  const apagar = (x: Serie) => rodar(async () => {
    let summary: unknown;
    if (SERVER) summary = (await api<{ summary?: unknown }>("DELETE", `/api/sessions/${encodeURIComponent(id)}/sets/${encodeURIComponent(x.exerciseId)}/${x.setNo}`)).summary;
    espelhar(id, (logs) => { const l = logs[x.exerciseId]?.[x.setNo - 1]; if (l) l.done = false; }, summary);
  }, `Série ${x.setNo} apagada`);
  const tirarEx = (ex: string) => rodar(async () => {
    let summary: unknown;
    if (SERVER) summary = (await api<{ summary?: unknown }>("DELETE", `/api/sessions/${encodeURIComponent(id)}/exercises/${encodeURIComponent(ex)}`)).summary;
    espelhar(id, (logs, plan) => { delete logs[ex]; plan.items = plan.items.filter((i) => i.exerciseId !== ex); }, summary);
    setTirar(null);
  }, `${nome(ex)} saiu do treino`);

  return <><SheetHead kicker="Corrigir treino" title={ses.plan.name ?? "Treino"} />
    <p class="small sub" style="margin:6px 0 10px">Corrija carga e repetições, apague séries ou tire um exercício. Vale mesmo com o dia feito; o volume da semana recalcula.</p>
    {!porEx.size && <p class="small">Nenhuma série registrada neste treino.</p>}
    {[...porEx].map(([ex, sets]) => <div class="corr-ex" key={ex}>
      <div class="row between"><b class="small" style="min-width:0">{nome(ex)}</b>
        {tirar === ex ? <span class="row" style="gap:6px"><button type="button" class="btn sm" disabled={busy} onClick={() => setTirar(null)}>Voltar</button><button type="button" class="btn sm danger" disabled={busy} onClick={() => tirarEx(ex)}>Tirar</button></span>
          : <button type="button" class="btn sm" disabled={busy} onClick={() => setTirar(ex)}><Icon id="x" />Tirar do treino</button>}</div>
      {sets.map((x) => <div class="corr-serie" key={x.setNo}>
        <span class="num small sub">{x.setNo}</span>
        {x.segundos != null
          ? <input class="input num" inputMode="numeric" aria-label={`Tempo da série ${x.setNo} de ${nome(ex)}`} value={C.fmtSegundos(x.segundos)} disabled={busy} onChange={(e) => salvar(x, "seg", e.currentTarget.value)} />
          : <><input class="input num" inputMode="decimal" aria-label={`Carga (kg) da série ${x.setNo} de ${nome(ex)}`} value={x.kg ?? ""} disabled={busy} onChange={(e) => salvar(x, "kg", e.currentTarget.value)} /><span class="small sub">kg ×</span>
            <input class="input num" inputMode="numeric" aria-label={`Repetições da série ${x.setNo} de ${nome(ex)}`} value={x.reps ?? ""} disabled={busy} onChange={(e) => salvar(x, "reps", e.currentTarget.value)} /></>}
        <button type="button" class="iconbtn" aria-label={`Apagar a série ${x.setNo} de ${nome(ex)}`} disabled={busy} onClick={() => apagar(x)}><Icon id="x" /></button>
      </div>)}
    </div>)}</>;
}
