// Folhas da Semana: trocar a geração de um dia, mover/trocar dias, regenerar com diff e versões (desfazer).
import type * as C from "@ciclo/core";
import { S, commit, today } from "../../lib/store/index.ts";
import { FOCUS } from "../../lib/store/regras.ts";
import { SheetHead, closeSheet, openSheet } from "../../lib/folha/index.tsx";
import { Chip, Icon, Seg } from "../../lib/ui/index.tsx";
import { DOW_NM, dowIdx } from "../../lib/util.ts";
import { acaoDia, desfazer, diaDe, getSemana, previaRegenerar, regenerar } from "./estado.ts";
import type { Dia } from "./estado.ts";

export const diaCurto = (date: string) => `${DOW_NM[dowIdx(date)]} ${Number(date.slice(8, 10))}`;
export const aberto = (d: Dia) => ["hoje", "planejado", "folga", "livre"].includes(d.status) && d.date >= today;

// ---------- trocar a geração ----------
let rasc: (C.DayOpts & { date: string }) | null = null;
export function abrirTrocar(d: Dia) { rasc = { date: d.date, ...d.opts }; openSheet(() => <Trocar />); }
function Trocar() {
  const r = rasc, d = r && diaDe(r.date);
  if (!r || !d) return null;
  const up = (o: Partial<C.DayOpts>) => { Object.assign(r, o); commit(); };
  const fid = FOCUS.find(([, , ms]) => ms.join() === (r.focus ?? []).join())?.[0] ?? "auto";
  const gerar = (opts: C.DayOpts) => acaoDia(r.date, { action: "gerar", opts }, "Dia gerado de novo").then((ok) => ok && closeSheet());
  const limpo = (): C.DayOpts => {
    const o: C.DayOpts = {};
    if (r.split) o.split = r.split; if (r.focus?.length) o.focus = r.focus; if (r.minutes) o.minutes = r.minutes;
    if (r.gymId) o.gymId = r.gymId; if (r.format && r.format !== "tradicional") o.format = r.format; if (r.crowded) o.crowded = true;
    if (r.mode && r.mode !== "normal") o.mode = r.mode;
    return o;
  };
  return <><SheetHead kicker={`Trocar a geração · ${diaCurto(r.date)}`} title={d.plan?.name ?? "Dia de treino"} />
    <p class="small sub" style="margin:6px 0 14px">O resto da semana se reorganiza pelo orçamento de séries. A versão anterior fica salva para desfazer.</p>
    <div class="stack">
      <div><span class="f">Divisão</span><Seg opts={[[null, "Automática"], ["sup", "Superior"], ["inf", "Inferior"], ["full", "Corpo inteiro"]]} value={r.split ?? null}
        onPick={(v) => up({ split: v as C.Split | null, focus: null })} label="Divisão" /></div>
      <div><span class="f">Foco</span><div class="chips">{FOCUS.map(([id, nm, ms]) =>
        <Chip key={id} on={fid === id} onClick={() => up({ focus: ms.length ? ms : null, split: null })}>{nm}</Chip>)}</div></div>
      <div><span class="f">Duração (min)</span><Seg opts={[30, 45, 60, 75, 90].map((n) => [n, String(n)] as [number, string])} value={r.minutes ?? S.profile.minutes} onPick={(v) => up({ minutes: v })} label="Duração" /></div>
      <div><span class="f">Academia</span><Seg opts={S.gyms.map((g) => [g.id, g.name] as [string, string])} value={r.gymId ?? d.gymId} onPick={(v) => up({ gymId: v })} label="Academia" /></div>
      <div><span class="f">Formato</span><Seg opts={[["tradicional", "Normal"], ["superserie", "Superséries"], ["circuito", "Circuito"]]} value={r.format ?? "tradicional"} onPick={(v) => up({ format: v as C.Format })} label="Formato" /></div>
    </div>
    <button type="button" class="btn pri full" style="margin-top:16px" onClick={() => gerar(limpo())}><Icon id="cycle" />Gerar este dia</button>
    {d.source === "voce" && <button type="button" class="btn ghost full" style="margin-top:8px" onClick={() => gerar({})}>Voltar ao automático</button>}</>;
}

// ---------- mover / trocar / folga ----------
export function abrirMover(d: Dia) { openSheet(() => <Mover date={d.date} />); }
function Mover({ date }: { date: string }) {
  const s = getSemana(), d = diaDe(date);
  if (!s || !d) return null;
  const go = (body: { action: string; to?: string }, ok: string) => acaoDia(date, body, ok).then((r) => r && closeSheet());
  const treino = d.kind !== "folga";
  const outros = s.days.filter((x) => x.date !== date && aberto(x));
  return <><SheetHead kicker={`Mover · ${diaCurto(date)}`} title={treino ? d.plan?.name ?? "Treino" : "Dia livre"} />
    <p class="small sub" style="margin:6px 0 12px">{treino ? "Leve este treino para um dia livre ou troque com outro dia de treino." : "Traga um treino para cá ou planeje um treino neste dia."}</p>
    {outros.map((x) => {
      const livre = x.kind === "folga";
      if (!treino && livre) return null;
      const body = treino && livre ? { action: "mover", to: x.date } : { action: "trocar", to: x.date };
      return <button type="button" key={x.date} class="sem-opt" onClick={() => go(body, treino && livre ? `Movido para ${diaCurto(x.date)}` : `Trocado com ${diaCurto(x.date)}`)}>
        <b>{diaCurto(x.date)}</b><span class="small sub">{livre ? "livre" : x.plan?.name ?? "treino"}</span>
        <span class="small">{treino && livre ? "Mover para cá" : "Trocar"}</span></button>;
    })}
    <hr />
    {treino ? <button type="button" class="btn full" onClick={() => go({ action: "folga" }, "Folga marcada · semana reorganizada")}>Marcar folga neste dia</button>
      : <button type="button" class="btn pri full" onClick={() => go({ action: date === today ? "extra" : "treino" }, date === today ? "Treino extra montado" : "Treino planejado")}>{date === today ? "Treinar hoje (extra)" : "Planejar treino neste dia"}</button>}</>;
}

// ---------- regenerar com diff ----------
const reg: { reset: boolean; diff: C.DayDiff[] | null; carregando: boolean } = { reset: false, diff: null, carregando: false };
async function prever() { reg.carregando = true; commit(); reg.diff = await previaRegenerar(reg.reset); reg.carregando = false; commit(); }
export function abrirRegenerar() { reg.reset = false; reg.diff = null; openSheet(() => <Regenerar />); prever(); }
function Regenerar() {
  return <><SheetHead kicker="Regenerar a semana" title="O que muda" />
    <p class="small sub" style="margin:6px 0 12px">Monta de novo os dias que ainda não passaram com o perfil, as dores e o volume de agora.</p>
    <Seg opts={[[false, "Manter minhas trocas"], [true, "Descartar minhas trocas"]]} value={reg.reset} onPick={(v) => { reg.reset = v; prever(); }} label="Trocas" />
    <div class="sem-diff" aria-live="polite">{reg.carregando ? <p class="small sub">Calculando…</p>
      : !reg.diff ? null : !reg.diff.length ? <p class="small">Nada muda: a semana já está atualizada.</p>
      : reg.diff.map((x) => <div key={x.date} class="sem-diff-dia"><p class="small"><b>{diaCurto(x.date)}</b> · <span class="sub">{x.before}</span> → <b>{x.after}</b></p>
        {x.lines.length > 0 && <ul>{x.lines.map((l, i) => <li key={i} class={l.startsWith("+") ? "mais" : l.startsWith("−") ? "menos" : ""}>{l}</li>)}</ul>}</div>)}</div>
    <div class="row" style="margin-top:14px;gap:8px">
      <button type="button" class="btn" style="flex:1" onClick={closeSheet}>Cancelar</button>
      <button type="button" class="btn pri" style="flex:1" disabled={!reg.diff?.length} onClick={() => regenerar(reg.reset).then((ok) => ok && closeSheet())}>Aplicar</button></div></>;
}

// ---------- versões (desfazer) ----------
const ORIGEM: Record<string, string> = { auto: "gerada na segunda", regenerar: "regenerada", ajuste: "troca de dia", falta: "falta respondida", extra: "treino extra", desfazer: "desfeita" };
const hora = (t: number) => new Intl.DateTimeFormat("pt-BR", { weekday: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(t));
const ver = { todas: false };
export function abrirVersoes() { ver.todas = false; openSheet(() => <Versoes />); }
function Versoes() {
  const s = getSemana(); if (!s) return null;
  const lista = ver.todas ? s.versions : s.versions.slice(0, 5);
  return <><SheetHead kicker="Versões da semana" title="Desfazer" />
    <p class="small sub" style="margin:6px 0 12px">Cada mudança guarda a geração anterior. Voltar cria uma versão nova; nada se perde.</p>
    {lista.map((v) => <div key={v.version} class="sem-opt" style="cursor:default">
      <b class="num">v{v.version}</b><span class="small sub">{ORIGEM[v.source] ?? v.source} · {hora(v.createdAt)}</span>
      {v.version === s.version ? <span class="badge acc">atual</span>
        : <button type="button" class="btn" onClick={() => desfazer(v.version).then((ok) => ok && closeSheet())}>Voltar</button>}</div>)}
    {!ver.todas && s.versions.length > 5 && <button type="button" class="btn ghost full" style="margin-top:8px" onClick={() => { ver.todas = true; commit(); }}>Ver mais ({s.versions.length - 5})</button>}</>;
}
