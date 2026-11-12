// Recap do período ausente (#42): fim de semana, semana ou mês (regras no core: reviewWindow, recapModo, refeicoesFaltando).
// Tudo registrado → 1 tela de confirmação (1 toque). Dia em branco → telas curtas, cada uma pulável: sono, álcool e fumo,
// comida que faltou (só se faltou) e treinos + "algo mais?". Mês → médias. O texto livre vai ao Claude como dado.
import { useEffect, useState } from "preact/hooks";
import { C, S } from "../../lib/store/index.ts";
import { loadFood } from "../../lib/store/regras.ts";
import { Card, Icon, Seg, Stepper, toast } from "../../lib/ui/index.tsx";
import { Mic } from "../../lib/voz/index.tsx";
import { fmt, longDate } from "../../lib/util.ts";
import { go } from "../../lib/roteador/index.ts";
import { D, checkinOf, dismissAbsence, recapPendente, saveRecap, snooze } from "../../lib/diario/estado.ts";
import type { RecapBody, RecapDia } from "../../lib/diario/estado.ts";

const SIMNAO: [boolean, string][] = [[true, "sim"], [false, "não"]];
const TITULO: Record<C.RecapKind, string> = { fds: "Como foi o fim de semana?", semana: "Como foi a semana?", mes: "Resumo do mês" };
const BEB: [C.Bebida, string][] = [["cerveja", "Cerveja (lata)"], ["vinho", "Vinho (taça)"], ["destilado", "Destilado (dose)"]];
const curto = (iso: string) => new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "numeric", timeZone: "UTC" }).format(new Date(iso + "T12:00:00Z")).replace(".", "");
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

function dadosDo(p: C.RecapPeriodo) {
  const dias = C.recapDias(p);
  const checkins = dias.flatMap((d) => { const c = checkinOf(d); return c ? [{ date: d, sleepH: c.sleepH }] : []; });
  const checkouts = dias.flatMap((d) => { const c = D.checkouts[d]; return c ? [{ date: d, alcohol: c.alcohol, trained: c.trained, cardioMin: c.cardio?.minutes ?? null, cardioType: c.cardio?.type ? C.CARDIO_BY_ID[c.cardio.type]?.nm ?? null : null }] : []; });
  const faltando = C.refeicoesFaltando(p, (S.food as { date: string; meal: C.Meal | null }[]));
  return { dias, checkins, checkouts, faltando };
}

function Cabeca({ p }: { p: C.RecapPeriodo }) {
  const low = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
  const [a, b] = [p.kind === "fds" ? "sexta à noite" : low(longDate(p.from)), low(longDate(p.to))];
  return <div style="margin-bottom:14px"><p class="kicker">Diário · recap</p><h1>{TITULO[p.kind]}</h1>
    <p class="small sub" style="margin-top:4px">{a} a {b}. Pule o que não lembrar.</p>
    <div class="row wrapx" style="gap:8px;margin-top:10px">
      <button type="button" class="btn sm" onClick={() => { snooze(); go("#diario"); }}><Icon id="clock" />Mais tarde</button>
      <button type="button" class="btn sm ghost" onClick={() => { dismissAbsence(); toast("Período pulado"); go("#diario"); }}><Icon id="skip" />Pular este período</button></div></div>;
}

function Texto({ value, onChange, id, label }: { value: string; onChange: (v: string) => void; id: string; label: string }) {
  return <div><label class="f" for={id}>{label}</label>
    <div class="row start" style="gap:8px"><textarea class="input" id={id} maxLength={1000} placeholder="Conta como foi (texto ou voz)" value={value} onInput={(e) => onChange(e.currentTarget.value)} />
      <Mic value={value} onChange={(v) => onChange(v.slice(0, 1000))} label={label} /></div></div>;
}

async function concluir(b: RecapBody, msg: string) {
  try { await saveRecap(b); toast(msg); go("#diario"); } catch { /* erro já avisado */ }
}

/** Tudo registrado: uma tela, "Confirmar" conclui com 1 toque; tocar num dia abre aquele dia para ajustar. */
function Confirmar({ p }: { p: C.RecapPeriodo }) {
  const x = dadosDo(p), linhas = C.recapLinhas(p, x), [txt, setTxt] = useState("");
  const ajustar = (d: string) => { D.sel = d; go(`#diario/checkout/${d}`); };
  return <Card cls="hl">
    <h2>Confirma?</h2>
    <ul class="rc-linhas">{linhas.map((l) => <li key={l.date}>
      <button type="button" class="rc-linha" onClick={() => ajustar(l.date)} aria-label={`Ajustar ${l.label}: ${l.texto}`}>
        <span><b>{l.label}:</b> {l.texto}</span><span class="tiny sub rc-ajustar"><Icon id="edit" />Ajustar</span></button>
      {l.lacunas.length > 0 && <p class="rc-lacuna small"><Icon id="warn" />{l.lacunas.join(", ")}</p>}</li>)}</ul>
    {x.faltando.length > 0 && <p class="small sub" style="margin-top:8px">Repasse o que comeu no {p.kind === "fds" ? "fds" : "período"} para o painel ficar correto: <a href="#comida">Comida</a>.</p>}
    <div style="margin-top:12px"><Texto id="rcConf" label="Algo mais? (opcional)" value={txt} onChange={setTxt} /></div>
    <button type="button" class="btn pri full" style="margin-top:14px" onClick={() => concluir({ from: p.from, to: p.to, texto: txt }, "Confirmado")}><Icon id="check" />Confirmar</button>
  </Card>;
}

/** Mês: curto, só médias + texto livre. */
function Mes({ p }: { p: C.RecapPeriodo }) {
  const x = dadosDo(p), [txt, setTxt] = useState("");
  const m = C.recapMes(p, { checkins: x.checkins, checkouts: x.checkouts, treinos: x.checkouts.filter((c) => c.trained).length });
  const st: [string, string][] = [
    ["Sono médio", m.sonoMedio == null ? "—" : `${fmt(m.sonoMedio, 1)} h`], ["Álcool", `${fmt(m.dosesSemana, 1)} doses/sem`],
    ["Treinos", `${fmt(m.treinosSemana, 1)}/sem`], ["Dias com registro", `${m.diasRegistrados} de ${m.dias}`],
  ];
  return <Card cls="hl">
    <h2>Médias do período</h2>
    <div class="dia-stats rc-stats">{st.map(([k, v]) => <div key={k}><p class="tiny sub">{k}</p><p class="num dia-stat">{v}</p></div>)}</div>
    <div style="margin-top:12px"><Texto id="rcMes" label="Algo mais?" value={txt} onChange={setTxt} /></div>
    <button type="button" class="btn pri full" style="margin-top:14px" onClick={() => concluir({ from: p.from, to: p.to, texto: txt }, "Resumo do mês salvo")}><Icon id="check" />Confirmar</button>
  </Card>;
}

type Ref = { text: string; naoLembro: boolean };
/** Algum dia em branco: 2 a 4 telas curtas, cada uma pulável. */
function Completo({ p }: { p: C.RecapPeriodo }) {
  const x = dadosDo(p);
  const passos = ["sono", "alcool", ...(x.faltando.length ? ["comida"] : []), "treino"] as const;
  const [i, setI] = useState(0);
  const [dias, setDias] = useState<Record<string, RecapDia>>({});
  const [refs, setRefs] = useState<Record<string, Ref>>({});
  const [txt, setTxt] = useState("");
  const up = (d: string, v: Partial<RecapDia>) => setDias({ ...dias, [d]: { ...(dias[d] ?? { date: d }), ...v } });
  const passo = passos[i], ultimo = i === passos.length - 1;
  const fim = () => concluir({
    from: p.from, to: p.to, texto: txt,
    dias: Object.values(dias),
    refeicoes: Object.entries(refs).filter(([, r]) => r.naoLembro || r.text.trim()).map(([k, r]) => { const [date, meal] = k.split("|"); return { date, meal: meal as C.Meal, ...(r.text.trim() ? { text: r.text.trim() } : { naoLembro: true }) }; }),
  }, "Recap salvo · calendário e Comida atualizados");
  const sono = x.checkins.length ? x.checkins.reduce((s, c) => s + c.sleepH, 0) / x.checkins.length : null;
  const label = (d: string) => (p.kind === "fds" && d === p.from ? "Sexta à noite" : longDate(d));

  return <Card cls="hl">
    <p class="kicker num">{i + 1} de {passos.length}</p>
    {passo === "sono" && <>
      <h2 style="margin-top:2px">Sono</h2>
      <p class="small" style="margin-top:6px">{sono == null ? "Sem noite registrada no período." : <>Média registrada: <b class="num">{fmt(sono, 1)} h</b> ({x.checkins.length} noite{x.checkins.length > 1 ? "s" : ""}).</>} Confirma ou ajusta noite a noite, se quiser.</p>
      <div class="rc-dias">{x.dias.map((d) => <div class="ckrow" key={d}><span class="small">{curto(d)} · dormiu bem?</span>
        <Seg opts={SIMNAO} value={dias[d]?.sleptWell ?? D.checkouts[d]?.sleptWell ?? null} label={`Dormiu bem em ${label(d)}?`} onPick={(v) => up(d, { sleptWell: v })} /></div>)}</div>
      </>}
    {passo === "alcool" && <>
      <h2 style="margin-top:2px">Álcool e fumo</h2>
      <p class="small sub" style="margin-top:6px">Doses viram kcal na Comida do dia, marcadas como bebida.</p>
      <div class="rc-dias">{x.dias.map((d) => {
        const dz = dias[d]?.alcool ?? {}, k = C.alcoolKcal(dz), had = D.checkouts[d]?.alcohol;
        return <div class="rs-dia" key={d}><h3>{label(d)} {k > 0 && <span class="badge num">+{fmt(k)} kcal</span>}</h3>
          {had != null && !dias[d]?.alcool && <p class="tiny sub">No checkout: {had} dose{had === 1 ? "" : "s"}. Toque para dizer o tipo.</p>}
          {BEB.map(([b, nm]) => <div class="ckrow" key={b}><span class="small">{nm}</span>
            <Stepper value={dz[b] ?? 0} step={1} onStep={(s) => up(d, { alcool: { ...dz, [b]: clamp((dz[b] ?? 0) + s, 0, 30) } })} /></div>)}
          <div class="ckrow"><span class="small">Fumo / vape</span><Seg opts={SIMNAO} value={dias[d]?.smoke ?? D.checkouts[d]?.smoke ?? null} label={`Fumo em ${label(d)}`} onPick={(v) => up(d, { smoke: v, smokeQty: v ? 1 : null })} /></div>
        </div>;
      })}</div></>}
    {passo === "comida" && <>
      <h2 style="margin-top:2px">Comida que faltou</h2>
      <p class="small" style="margin-top:6px"><b>Repasse o que comeu no {p.kind === "fds" ? "fds" : "período"} para o painel ficar correto.</b> “Não lembro” vira estimativa (não some como zero).</p>
      <div class="rc-dias">{x.faltando.flatMap((f) => f.meals.map((m) => {
        const k = `${f.date}|${m}`, r = refs[k] ?? { text: "", naoLembro: false }, id = `rc-${f.date}-${m}`;
        const set = (v: Partial<Ref>) => setRefs({ ...refs, [k]: { ...r, ...v } });
        return <div class="rc-ref" key={k}><label class="f" for={id}>{curto(f.date)} · {C.MEAL_NM[m]}</label>
          <div class="row start" style="gap:8px"><input class="input" id={id} maxLength={500} placeholder="o que comeu" disabled={r.naoLembro} value={r.text} onInput={(e) => set({ text: e.currentTarget.value })} />
            <Mic value={r.text} onChange={(v) => set({ text: v.slice(0, 500), naoLembro: false })} label={`Ditar ${C.MEAL_NM[m]} de ${label(f.date)}`} /></div>
          <button type="button" class="btn sm" aria-pressed={r.naoLembro} onClick={() => set({ naoLembro: !r.naoLembro, text: "" })}><Icon id={r.naoLembro ? "check" : "skip"} />Não lembro</button></div>;
      }))}</div></>}
    {passo === "treino" && <>
      <h2 style="margin-top:2px">Treinos e cardio</h2>
      <div class="rc-dias">{x.dias.map((d) => {
        const c = dias[d]?.cardio ?? null, ses = S.week.sessions.some((s: any) => s.date === d);
        return <div class="rs-dia" key={d}><h3>{label(d)}</h3>
          <div class="ckrow"><span class="small">Treinou?</span>{ses ? <span class="small sub">sessão registrada</span>
            : <Seg opts={SIMNAO} value={dias[d]?.trained ?? D.checkouts[d]?.trained ?? null} label={`Treinou em ${label(d)}?`} onPick={(v) => up(d, { trained: v })} />}</div>
          <div class="row wrapx" style="gap:8px"><select class="input dia-sel" aria-label={`Cardio em ${label(d)}`} value={c?.type ?? ""} onChange={(e) => { const t = e.currentTarget.value; up(d, { cardio: t ? { type: t, minutes: c?.minutes ?? 30 } : null }); }}>
            <option value="">sem cardio</option>{C.CARDIO.map((o) => <option key={o.id} value={o.id}>{o.nm}</option>)}</select>
            {c && <Stepper value={c.minutes} step={5} unit=" min" onStep={(s) => up(d, { cardio: { ...c, minutes: clamp(c.minutes + s, 5, 300) } })} />}</div>
        </div>;
      })}</div>
      <div style="margin-top:12px"><Texto id="rcTxt" label="Algo mais?" value={txt} onChange={setTxt} /></div></>}
    <div class="row" style="gap:8px;margin-top:14px">
      {i > 0 && <button type="button" class="btn" onClick={() => setI(i - 1)} aria-label="Voltar"><Icon id="back" /></button>}
      {!ultimo && <button type="button" class="btn ghost" onClick={() => setI(i + 1)}>Pular</button>}
      <button type="button" class="btn pri rc-next" onClick={() => (ultimo ? fim() : setI(i + 1))}>{ultimo ? <><Icon id="check" />Concluir</> : <>Próximo<Icon id="arrow" /></>}</button>
    </div>
  </Card>;
}

export function Recap() {
  useEffect(() => { loadFood(); }, []); // lacunas de comida precisam dos registros do período
  const p = recapPendente();
  if (!p) return <><p class="kicker">Diário</p><h1 style="margin-bottom:14px">Recap</h1>
    <Card><h2>Nada para recapitular</h2><p class="small sub" style="margin-top:6px">Nenhum período pendente. Para preencher um dia antigo, toque nele no calendário.</p>
      <a class="btn full" style="margin-top:12px" href="#diario"><Icon id="back" />Voltar ao Diário</a></Card></>;
  const x = dadosDo(p);
  const modo = C.recapModo(p, x.dias.map((d) => ({ date: d, checkin: !!checkinOf(d), checkout: !!D.checkouts[d] })));
  return <><Cabeca p={p} />
    <div class="rc-wrap">{modo === "confirmar" ? <Confirmar p={p} /> : modo === "mes" ? <Mes p={p} /> : <Completo key={`${p.from}-${p.to}`} p={p} />}</div></>;
}
