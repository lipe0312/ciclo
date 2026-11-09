// Hoje: objetivo, check-in, semana flexível, compensatório, treino do dia, volume, Claude e mini-cartões.
import { C, S, commit, dates, today } from "../../lib/store/index.ts";
import { FOCUS, computePlan, defaultGymFor, foodTotals, gymById, mName } from "../../lib/store/regras.ts";
import { SERVER, send } from "../../lib/api/index.ts";
import { Card, Chip, Icon, Seg, toast } from "../../lib/ui/index.tsx";
import { BarraSimples, BarraVolume } from "../../lib/grafico/index.tsx";
import { DOW_NM, dowIdx, fmt, longDate } from "../../lib/util.ts";
import { CaixaClaude } from "../claude/caixa.tsx";

const CK: Record<string, { nm: string; opts: [number, string][] }> = {
  sleepH: { nm: "Sono", opts: [[5, "≤5h"], [6, "6h"], [7, "7h"], [8, "8h"], [9, "9h+"]] },
  energy: { nm: "Energia", opts: [[1, "baixa"], [2, "ok"], [3, "alta"]] },
  soreness: { nm: "Dor muscular", opts: [[0, "zero"], [1, "leve"], [2, "alta"]] },
  stress: { nm: "Estresse", opts: [[1, "baixo"], [2, "médio"], [3, "alto"]] },
  food: { nm: "Comida ontem", opts: [[-1, "menos"], [0, "normal"], [1, "mais"]] },
};
const draftOf = () => (S.ui.ckDraft?.date === S.ui.ckDate ? S.ui.ckDraft : { date: S.ui.ckDate, ...(S.week.checkins[S.ui.ckDate] ?? {}) });

function saveCheckin() {
  const d = draftOf();
  const w = parseFloat(((document.getElementById("ckWeight") as HTMLInputElement | null)?.value || "").replace(",", "."));
  if (Number.isFinite(w)) d.weightKg = w;
  const miss = Object.keys(CK).filter((k) => d[k] == null);
  if (miss.length) return toast(`Falta: ${miss.map((k) => CK[k].nm.toLowerCase()).join(", ")}`);
  const { date, ...vals } = d; S.week.checkins[date] = vals; S.ui.ckDraft = null;
  const next = C.coverage(Object.keys(S.week.checkins).map((x) => ({ date: x })), dates, today).missing[0];
  if (next) S.ui.ckDate = next;
  commit(); toast(next ? `Salvo · falta ${DOW_NM[dowIdx(next)]}` : "Check-in salvo");
  send("PUT", `/api/checkin/${date}`, { sleepH: vals.sleepH, energy: vals.energy, soreness: vals.soreness, stress: vals.stress, food: vals.food, weightKg: vals.weightKg ?? null }).catch(() => {});
}

function Checkin() {
  const d = S.ui.ckDate, ck = S.week.checkins[d] ?? {}, saved = !!S.week.checkins[d];
  const draft = draftOf();
  const cov = C.coverage(Object.keys(S.week.checkins).map((date) => ({ date })), dates, today);
  const r = saved ? C.readiness(ck) : null;
  return <Card cls={!S.week.checkins[today] ? "hl" : ""} id="ckCard">
    <div class="row between wrapx"><div><p class="kicker">Check-in · {d === today ? "hoje" : longDate(d)}</p>
      <h2 style="margin-top:2px">{saved ? `Prontidão: ${r!.label}` : "Como você está? (10 s)"}</h2></div>
      <span class={`badge ${cov.missing.length ? "warn" : "ok"} num`}>{cov.filled}/{cov.due} dias</span></div>
    <p class="small sub" style="margin-top:4px">{saved ? r!.advice : "É o dado mais importante da revisão de domingo. Toque e pronto."}</p>
    <div style="margin-top:12px">{Object.entries(CK).map(([k, c]) => <div class="ckrow" key={k}><span class="small">{c.nm}</span>
      <Seg opts={c.opts} value={draft[k]} label={c.nm} onPick={(v) => { S.ui.ckDraft = { ...draft, [k]: v }; commit(); }} /></div>)}
      <div class="ckrow"><label class="small" for="ckWeight">Peso (opcional)</label><input class="input num" id="ckWeight" inputMode="decimal" placeholder="kg" value={draft.weightKg ?? ""} style="max-width:120px" /></div></div>
    <div class="row between wrapx" style="margin-top:12px">
      <div class="dots" style="flex:1;min-width:240px;margin:0">{dates.map((x, i) => {
        const st = x > today ? "fut" : S.week.checkins[x] ? "ok" : "miss";
        return <button type="button" key={x} class={`dot-day ${st} ${x === d ? "sel" : ""}`} disabled={x > today} onClick={() => { S.ui.ckDate = x; S.ui.ckDraft = null; commit(); }}
          aria-label={`${DOW_NM[i]} ${st === "ok" ? "feito" : st === "miss" ? "pendente" : ""}`}><i />{DOW_NM[i]}</button>; })}</div>
      <button type="button" class="btn pri" onClick={saveCheckin}><Icon id="check" />{saved ? "Atualizar" : "Salvar"}</button></div>
  </Card>;
}

function markDay(d: string) {
  if (d >= today) return toast(d === today ? "Hoje: começar o treino já marca “fui”" : "Futuro: use “Dias que ainda dá”");
  const cyc: Record<string, string> = { fui: "nao_fui", nao_fui: "folga", folga: "fui" };
  S.week.attendance[d] = cyc[S.week.attendance[d] ?? "folga"] ?? "fui"; commit();
  send("PUT", `/api/attendance/${d}`, { status: S.week.attendance[d] }).catch(() => {});
}
const setUi = (k: "daysLeft" | "minutes" | "gymId" | "format", v: any) => { (S.ui as any)[k] = v; S.ui.locked = false; commit(); };

function Semana({ plan }: { plan: C.DayPlan }) {
  const proj: string[] = [];
  let g = plan.groups.length === 2 ? "full" : plan.groups[0];
  for (let i = 1; i < S.ui.daysLeft; i++) { g = g === "sup" ? "inf" : "sup"; proj.push(g); }
  let fut = 0;
  const fid = FOCUS.find(([, , ms]) => ms.join() === S.ui.focus.join())?.[0] ?? "auto";
  return <Card>
    <div class="row between wrapx"><h2>Semana flexível</h2><span class="small sub num">fecha em {plan.weekClosePct}% · {Object.values(S.week.attendance).filter((x) => x === "fui").length} feitos</span></div>
    <p class="small sub" style="margin:4px 0 12px">Dias passados: toque para marcar fui / faltou / folga. Iniciar o treino já conta como “fui”.</p>
    <div class="week">{dates.map((d, i) => {
      const att = S.week.attendance[d], ses = S.week.sessions.find((s: any) => s.date === d);
      let cls: string, lbl: string, st: any = null;
      if (d < today) {
        cls = att === "fui" || ses ? "fui" : att === "nao_fui" ? "nao" : "livre";
        lbl = cls === "fui" ? (ses?.name ?? "treino").replace("Superior", "Sup.").replace("Inferior", "Inf.") : cls === "nao" ? "faltou" : att === "folga" ? "folga" : "marcar";
        st = cls === "fui" ? <Icon id="check" /> : cls === "nao" ? <Icon id="x" /> : null;
      } else if (d === today) {
        cls = "hoje" + (att === "fui" || S.session ? " fui" : "");
        lbl = plan.mode === "compensatorio" ? "Corpo todo" : plan.groups[0] === "sup" ? "Sup." : "Inf.";
        st = att === "fui" || S.session ? <Icon id="check" /> : null;
      } else { const p = proj[fut++]; cls = p ? "prev" : "livre"; lbl = p ? (p === "sup" ? "Sup." : "Inf.") : "folga"; }
      const gy = gymById(d === today ? S.ui.gymId : defaultGymFor(d))?.name.replace("Academia ", "A") ?? "";
      return <button type="button" key={d} class={`day ${cls}`} onClick={() => markDay(d)} aria-label={`${DOW_NM[i]}: ${lbl}`}><b>{DOW_NM[i]}</b><span class="st">{st}</span><span class="lbl">{lbl}</span><span class="gy">{d >= today && lbl !== "folga" ? gy : ""}</span></button>;
    })}</div><hr />
    <div class="ctl"><div><h3>Dias que ainda dá (com hoje)</h3><p class="small sub">o resto da semana se reorganiza</p></div>
      <Seg opts={[1, 2, 3, 4].map((n) => [n, String(n)] as [number, string])} value={S.ui.daysLeft} onPick={(v) => setUi("daysLeft", v)} label="Dias que ainda dá" /></div>
    <div class="ctl"><div><h3>Tempo hoje</h3><p class="small sub">≈ 1 série a cada 3 min</p></div>
      <Seg opts={[30, 45, 60, 75, 90].map((n) => [n, String(n)] as [number, string])} value={S.ui.minutes} onPick={(v) => setUi("minutes", v)} label="Minutos" /></div>
    <div class="ctl"><div><h3>Academia hoje</h3><p class="small sub">só entram aparelhos de lá</p></div>
      <Seg opts={S.gyms.map((gm) => [gm.id, gm.name.replace("Academia ", "Acad ")] as [string, string])} value={S.ui.gymId} onPick={(v) => setUi("gymId", v)} label="Academia" /></div>
    <div style="margin-top:12px"><h3>Foco de hoje</h3><div class="chips" style="margin-top:8px">
      {FOCUS.map(([id, nm, ms]) => <Chip key={id} on={fid === id} onClick={() => { S.ui.focus = ms; if (ms.length) S.ui.mode = "normal"; S.ui.locked = false; commit(); }}>{nm}</Chip>)}
      <Chip on={S.ui.crowded} onClick={() => { S.ui.crowded = !S.ui.crowded; S.ui.locked = false; commit(); }}><Icon id="warn" />Academia cheia</Chip></div></div>
    <div class="ctl" style="margin-top:12px"><div><h3>Formato</h3><p class="small sub">mesmo volume, outra dinâmica</p></div>
      <Seg opts={[["tradicional", "Normal"], ["superserie", "Superséries"], ["circuito", "Circuito"]]} value={S.ui.format} onPick={(v) => setUi("format", v)} label="Formato" /></div>
  </Card>;
}

function TreinoCard({ plan }: { plan: C.DayPlan }) {
  const running = S.session && !S.session.finishedAt;
  return <div class="card dark">
    <div class="row between wrapx start"><div><p class="kicker" style="color:#A1A1AA">Treino de hoje · {gymById(S.ui.gymId)?.name}</p>
      <h2 style="font-size:22px;margin-top:4px">{plan.name}</h2>
      <p class="small sub num" style="margin-top:4px">{plan.items.length} exercícios · {plan.setsTotal} séries · ~{plan.estMinutes} min{S.ui.format !== "tradicional" ? ` · ${S.ui.format === "superserie" ? "superséries" : "circuito"}` : ""}</p></div>
      {running ? <a class="btn pri" href="#treino">Continuar <Icon id="arrow" /></a> : <a class="btn pri" href="#treino">Começar <Icon id="arrow" /></a>}</div>
    <ul class="small" style="margin:12px 0 0;padding-left:18px;color:#D4D4D8;display:grid;gap:4px">{plan.why.map((w, i) => <li key={i}>{w}</li>)}</ul>
    <div class="chips" style="margin-top:12px">{Object.entries(plan.perMuscle).map(([m, n]) => <span key={m} class="badge" style="background:#26262B;color:#F4F4F5">{mName(m)} <b class="num">{n}</b></span>)}
      {plan.prehab.length > 0 && <span class="badge" style="background:#26262B;color:#C6F432">+ fortalecimento</span>}</div>
    {S.ui.locked && <p class="tiny" style="margin-top:10px;color:#A1A1AA">{S.ui.planSource === "claude" ? "Montado pelo Claude" : "Editado por você · o Claude revisa"} · mudar os controles <button type="button" class="btn sm ghost" style="color:#C6F432" onClick={() => { S.ui.locked = false; computePlan(true); commit(); }}>refaz o treino</button></p>}
  </div>;
}

function Compensa({ plan }: { plan: C.DayPlan }) {
  const setMode = (v: C.Mode) => { S.ui.mode = v; S.ui.locked = false; commit(); toast(v === "normal" ? "Voltou ao normal" : "Gerado a seu pedido"); };
  if (plan.mode !== "normal") return <Card><div class="row between wrapx"><div><p class="kicker">Modo {plan.mode === "compensatorio" ? "compensatório" : "expresso"}</p><p class="small sub">Gerado a seu pedido.</p></div><button type="button" class="btn sm" onClick={() => setMode("normal")}>Voltar ao normal</button></div></Card>;
  if (!plan.suggestCompensatory) return null;
  const other = plan.groups[0] === "sup" ? "inf" : "sup";
  const lacking = C.MUSCLE_IDS.filter((m) => C.MUSCLES[m].group === other && (S.week.freq[m] ?? 0) < 2).map(mName);
  return <Card cls="hl"><div class="row start"><Icon id="info" style="color:var(--acc);margin-top:2px" /><div style="flex:1">
    <h3>Só sobrou hoje?</h3><p class="small sub" style="margin-top:4px">{lacking.slice(0, 4).join(", ")} ainda não tiveram 2× nesta semana. O compensatório junta os dois grupos numa sessão — só se você quiser.</p>
    <div class="row wrapx" style="margin-top:10px;gap:8px"><button type="button" class="btn pri sm" onClick={() => setMode("compensatorio")}>Gerar compensatório</button><button type="button" class="btn sm" onClick={() => setMode("expresso")}>Expresso (só prioridades)</button></div></div></div></Card>;
}

function Volume({ plan }: { plan: C.DayPlan }) {
  const t = C.weeklyTargets(S.profile.level, S.profile.priorities);
  const max = Math.max(16, ...Object.values(t));
  return <Card><div class="row between wrapx"><h2>Volume da semana</h2><span class="badge num">fecha em {plan.weekClosePct}%</span></div>
    <div class="legend" style="margin:8px 0 14px"><span><i class="sw" style="background:var(--txt)" />feito</span><span><i class="sw sw-sec" />hoje</span><span><i class="sw" style="background:var(--sub);width:2px;height:12px" />meta</span></div>
    {C.MUSCLE_IDS.map((m) => <BarraVolume key={m} label={`${mName(m)} · ${S.week.freq[m] ?? 0}×`} done={S.week.done[m] ?? 0} today={plan.perMuscle[m] ?? 0} target={t[m]} max={max} prio={S.profile.priorities.includes(m)} />)}
    <p class="tiny sub" style="margin-top:12px">Meta = séries/semana · “2×” = músculo treinado em 2 sessões. Prioridades marcadas com ●.</p></Card>;
}

function Objetivo() {
  const g = S.profile.goal, ms = S.measures, first = ms[0], last = ms[ms.length - 1];
  const wk = Math.max(1, Math.round((Date.parse(today) - Date.parse(first?.date ?? today)) / 6048e5) + 1);
  const arm = first && last ? last.braco - first.braco : 0, waist = first && last ? last.cintura - first.cintura : 0;
  return <Card><div class="row start"><Icon id="target" style="color:var(--acc);margin-top:3px" /><div style="flex:1;min-width:0">
    <p class="kicker">Objetivo · semana {Math.min(wk, g.horizonWeeks)} de {g.horizonWeeks}</p><p style="font-weight:700;margin-top:2px">{g.statement}</p>
    <div class="grid g3" style="margin-top:10px;gap:8px">
      <div><p class="tiny sub">Braço</p><p class="num"><b>{arm >= 0 ? "+" : ""}{fmt(arm, 1)}</b> / +{fmt(g.metrics.bracoCm, 1)} cm</p><div style="margin-top:4px"><BarraSimples pct={(arm / (g.metrics.bracoCm || 1)) * 100} color="var(--acc)" /></div></div>
      <div><p class="tiny sub">Cintura</p><p class="num"><b>{waist >= 0 ? "+" : ""}{fmt(waist, 1)}</b> cm · meta ±1</p><div style="margin-top:4px"><BarraSimples pct={Math.abs(waist) * 100} color={Math.abs(waist) > 1 ? "var(--bad)" : "var(--ok)"} /></div></div>
      <div><p class="tiny sub">Frequência 2×</p><p class="num"><b>{C.MUSCLE_IDS.filter((m) => (S.week.freq[m] ?? 0) >= 2).length}</b>/{C.MUSCLE_IDS.length} músculos</p></div>
    </div></div></div></Card>;
}

function Mini() {
  const ws = dates.map((d) => S.week.checkins[d]?.weightKg).filter(Boolean);
  const { kcal, protein: prot } = S.profile.diet;
  const tf = foodTotals(today);
  return <div class="grid" style="grid-template-columns:repeat(2,minmax(0,1fr))">
    <Card><p class="kicker">Peso</p><p class="big num" style="margin-top:6px">{ws.length ? fmt(ws[ws.length - 1], 1) : "—"}<span class="small sub"> kg</span></p><p class="small sub">{ws.length} registro(s) na semana</p></Card>
    <Card><p class="kicker">Comida hoje</p><p class="big num" style="margin-top:6px">{fmt(tf.kcal)}</p><p class="small sub num">kcal · meta {fmt(kcal)}</p>
      <p class="small num" style="margin-top:6px"><b>{fmt(tf.prot)} g</b> <span class="sub">proteína · {prot}</span></p><div style="margin-top:4px"><BarraSimples pct={(tf.prot / prot) * 100} color="var(--acc)" /></div></Card></div>;
}

export default function Hoje() {
  const plan = computePlan();
  return <>
    <div class="row between wrapx" style="margin-bottom:14px"><div><p class="kicker">{longDate(today)}{SERVER ? "" : " · demonstração"}</p><h1>Hoje</h1></div></div>
    <div class="grid dash"><div class="stack"><Objetivo /><Checkin /><Semana plan={plan} /><Compensa plan={plan} /><TreinoCard plan={plan} /><Volume plan={plan} /></div>
      <div class="stack"><CaixaClaude /><Mini /></div></div>
  </>;
}
