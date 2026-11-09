// Perfil ("Ponto de partida"): seções editáveis a qualquer momento.
import { C, S, commit } from "../../lib/store/index.ts";
import { EXB, mName, profileChanged } from "../../lib/store/regras.ts";
import { SERVER } from "../../lib/api/index.ts";
import { Card, Chip, Icon, Seg, Stepper, toast } from "../../lib/ui/index.tsx";
import { MapaMusculos } from "../../lib/mapa-musculos/index.tsx";
import { Mic } from "../../lib/voz/index.tsx";
import { DOW, DOW_NM, fmt, getPath, setPath } from "../../lib/util.ts";
import { GymEditor } from "../academias/index.tsx";
import { CATS } from "../claude/caixa.tsx";

const BODY: [string, string, string][] = [["muito_magro", "Muito magro", "difícil ganhar peso"], ["magro", "Magro", "pouca gordura e pouca massa"], ["falso_magro", "Magro com barriga", "braço fino, gordura na cintura"], ["normal", "Normal", "nem magro nem acima"], ["atletico", "Atlético", "massa visível, pouca gordura"], ["forte_gordura", "Forte com gordura", "massa boa, cintura alta"], ["acima", "Acima do peso", "quer perder gordura"], ["bem_acima", "Bem acima do peso", "saúde primeiro"]];
const GOALS: [string, string, string, C.MuscleId[], string][] = [
  ["bracos_ombros", "Braços e ombros maiores", "mantendo a cintura", ["ombro", "biceps", "triceps"], "Braços e ombros maiores mantendo a cintura"],
  ["massa_geral", "Ganhar massa no geral", "corpo todo, sem foco", ["costas", "peito", "quad"], "Ganhar massa no corpo todo"],
  ["definir", "Perder gordura", "mantendo o músculo", ["costas", "ombro", "quad"], "Perder gordura mantendo o músculo"],
  ["recompor", "Recompor", "trocar gordura por músculo", ["ombro", "costas", "biceps"], "Recompor: menos cintura, mais braço e ombro"],
  ["forca", "Ficar mais forte", "cargas maiores nos básicos", ["costas", "peito", "quad"], "Ficar mais forte nos básicos"],
  ["constancia", "Constância", "treinar 2×/músculo sem falhar", [], "Treinar toda semana com 2× por músculo"],
];
const ANCHORS = ["Barbell_Bench_Press_-_Medium_Grip", "Wide-Grip_Lat_Pulldown", "Barbell_Curl", "Machine_Shoulder_Military_Press", "Leg_Press", "Barbell_Full_Squat", "Seated_Cable_Rows", "Side_Lateral_Raise"];
const ANCHOR_DEFAULT: Record<string, [number, number]> = { "Barbell_Bench_Press_-_Medium_Grip": [40, 8], "Wide-Grip_Lat_Pulldown": [40, 10], Barbell_Curl: [20, 10], Machine_Shoulder_Military_Press: [30, 10], Leg_Press: [100, 12], Barbell_Full_Squat: [40, 8], Seated_Cable_Rows: [40, 10], Side_Lateral_Raise: [6, 12] };

const p = () => S.profile;
const SECS: [string, string, () => string][] = [
  ["voce", "Você", () => `${p().heightCm} cm · ${p().weightKg} kg · ${BODY.find((b) => b[0] === p().bodyType)?.[1] ?? ""}`],
  ["objetivo", "Objetivo", () => p().goal.statement],
  ["experiencia", "Experiência e cargas", () => `${["nunca treinou", "menos de 1 ano", "1–3 anos", "3+ anos"][p().level]} · ${p().remembered.length ? p().remembered.length + " carga(s) lembrada(s)" : "calibra no 1º treino"}`],
  ["rotina", "Rotina da semana", () => `${p().daysTarget} dias · ${p().minutes} min · semana ${p().flexWeek ? "flexível" : "fixa"}`],
  ["academias", "Academias", () => S.gyms.map((g) => g.name).join(" · ")],
  ["preferencias", "Preferências por músculo", () => `${Object.values(p().prefs).filter((v) => v && v !== "tanto_faz").length} músculo(s) com preferência · formato ${p().dynamics}`],
  ["corpo", "Corpo e dores", () => `${S.pains.length} dor(es) ativa(s)`],
  ["comida", "Comida", () => `registro ${p().diet.mode} · ${p().diet.kcal} kcal · ${p().diet.protein} g`],
  ["claude", "Claude", () => `${({ so_sugere: "só sugere", carga_sozinho: "carga sozinho, plano com aprovação", tudo: "tudo automático" } as Record<string, string>)[p().autonomy]} · modelo por pedido`],
];

const pset = (k: string, v: unknown) => { setPath(S.profile, k, v); profileChanged(); commit(); };
const ptoggle = (k: string, v: string) => { const arr: string[] = getPath(S.profile, k); const i = arr.indexOf(v); i >= 0 ? arr.splice(i, 1) : arr.push(v); profileChanged(); commit(); };
const step = (k: string, d: number) => pset(k, Math.round(((Number(getPath(S.profile, k)) || 0) + d) * 10) / 10);
function PSeg<T>({ k, opts }: { k: string; opts: [T, string][] }) { return <Seg opts={opts} value={getPath(S.profile, k)} onPick={(v) => pset(k, v)} />; }
const Opt = ({ on, onClick, title, desc }: { on: boolean; onClick: () => void; title: string; desc: string }) =>
  <button type="button" class="opt" aria-pressed={on} onClick={onClick}><b>{title}</b><span>{desc}</span></button>;

function Body({ id }: { id: string }) {
  const pr = S.profile;
  switch (id) {
    case "voce": return <><div class="grid g2"><div><span class="f">Sexo</span><PSeg k="sex" opts={[["m", "masculino"], ["f", "feminino"]]} /></div>
      <div class="row wrapx" style="gap:16px"><div><span class="f">Idade</span><Stepper value={pr.age} step={1} onStep={(d) => step("age", d)} /></div><div><span class="f">Altura</span><Stepper value={pr.heightCm} step={1} unit=" cm" onStep={(d) => step("heightCm", d)} /></div><div><span class="f">Peso</span><Stepper value={pr.weightKg} step={0.5} unit=" kg" onStep={(d) => step("weightKg", d)} /></div></div></div>
      <div style="margin-top:16px"><span class="f">Como você se vê hoje</span><div class="opts">{BODY.map(([v, l, d]) => <Opt key={v} on={pr.bodyType === v} onClick={() => pset("bodyType", v)} title={l} desc={d} />)}</div></div>
      <div style="margin-top:16px"><span class="f">Onde acumula gordura (pode marcar mais de um)</span><div class="chips">{["barriga", "peito", "costas/flancos", "quadril e coxas", "distribuído", "quase não acumulo"].map((v) => <Chip key={v} on={pr.fatWhere.includes(v)} onClick={() => ptoggle("fatWhere", v)}>{v}</Chip>)}</div></div></>;
    case "objetivo": { const g = pr.goal, mt = g.metrics;
      const prio = (m: C.MuscleId) => { const a = pr.priorities, i = a.indexOf(m); if (i >= 0) a.splice(i, 1); else if (a.length < 3) a.push(m); else return toast("Até 3 prioridades"); profileChanged(); commit(); };
      const subs = pr.subPriorities ?? (pr.subPriorities = []);
      return <><p class="goal">{g.statement}</p><p class="small sub" style="margin-top:6px">Em {g.horizonWeeks} semanas: braço +{fmt(mt.bracoCm, 1)} cm · cintura {mt.cinturaCm ? (mt.cinturaCm > 0 ? "+" : "") + fmt(mt.cinturaCm, 1) + " cm" : "igual"} · peso {mt.pesoKg >= 0 ? "+" : ""}{fmt(mt.pesoKg, 1)} kg · 2×/músculo em {mt.aderenciaPct}% das semanas. Tudo no app serve a isso.</p>
        <div style="margin-top:16px"><span class="f">Um objetivo principal</span><div class="opts">{GOALS.map(([v, l, d, ms, st]) => <Opt key={v} on={g.id === v} title={l} desc={d} onClick={() => { Object.assign(g, { id: v, statement: st }); if (ms.length) pr.priorities = [...ms]; profileChanged(); commit(); }} />)}</div></div>
        <div style="margin-top:16px"><span class="f">Músculos prioritários (até 3, na ordem)</span><div class="chips">{C.MUSCLE_IDS.map((m) => { const i = pr.priorities.indexOf(m); return <Chip key={m} on={i >= 0} onClick={() => prio(m)}>{i >= 0 && <b class="num">{i + 1}</b>}{mName(m)}</Chip>; })}</div></div>
        <div style="margin-top:16px"><span class="f">Detalhe por subdivisão (opcional) · toque no desenho</span>
          <MapaMusculos selected={subs} onToggle={(s) => { const i = subs.indexOf(s); i >= 0 ? subs.splice(i, 1) : subs.push(s); profileChanged(); commit(); }} size="sm" />
          <p class="tiny sub" style="margin-top:6px">{subs.length ? subs.map((s) => C.SUB_MUSCLES[s].nm).join(" · ") : "Nenhuma subdivisão marcada. Ex.: ombro lateral, tríceps cabeça longa."}</p></div>
        <div class="row wrapx" style="gap:16px;margin-top:16px"><div><span class="f">Horizonte</span><PSeg k="goal.horizonWeeks" opts={[[8, "8 sem"], [12, "12 sem"], [16, "16 sem"]]} /></div>
          <div><span class="f">Braço</span><Stepper value={mt.bracoCm} step={0.5} unit=" cm" onStep={(d) => step("goal.metrics.bracoCm", d)} /></div><div><span class="f">Cintura</span><Stepper value={mt.cinturaCm} step={0.5} unit=" cm" onStep={(d) => step("goal.metrics.cinturaCm", d)} /></div><div><span class="f">Peso</span><Stepper value={mt.pesoKg} step={0.5} unit=" kg" onStep={(d) => step("goal.metrics.pesoKg", d)} /></div></div></>; }
    case "experiencia": { const est = ["Incline_Dumbbell_Press", "Incline_Dumbbell_Curl", "Cable_Seated_Lateral_Raise", "Hack_Squat"].map((x) => ({ id: x, s: C.startLoad(x, pr.remembered, EXB[x].r[1]) }));
      const anchor = (x: string) => { const r = pr.remembered, i = r.findIndex((y) => y.exerciseId === x); if (i >= 0) r.splice(i, 1); else if (r.length < 4) { const [kg, reps] = ANCHOR_DEFAULT[x] ?? [20, 10]; r.push({ exerciseId: x, kg, reps, confidence: "aproximado" }); } else return toast("Até 4"); profileChanged(); commit(); };
      return <><span class="f">Há quanto tempo treina</span><PSeg k="level" opts={[[0, "nunca"], [1, "< 1 ano"], [2, "1–3 anos"], [3, "3+ anos"]]} />
        <div style="margin-top:16px"><span class="f">Cargas que você lembra (opcional — não precisa ser exato)</span><p class="small sub">Escolha até 4. O app estima o resto pela família do movimento e ajusta depois do 1º treino.</p>
          <div class="chips" style="margin-top:8px">{ANCHORS.map((x) => <Chip key={x} on={pr.remembered.some((r) => r.exerciseId === x)} onClick={() => anchor(x)}>{EXB[x].nm}</Chip>)}</div>
          {pr.remembered.map((r, i) => <div key={r.exerciseId} class="row wrapx" style="margin-top:10px;gap:10px"><b style="min-width:150px">{EXB[r.exerciseId].nm}</b><Stepper value={r.kg} step={EXB[r.exerciseId].inc || 2.5} unit=" kg" onStep={(d) => step(`remembered.${i}.kg`, d)} /><span class="sub">×</span><Stepper value={r.reps} step={1} unit=" reps" onStep={(d) => step(`remembered.${i}.reps`, d)} />
            <PSeg k={`remembered.${i}.confidence`} opts={[["certeza", "certeza"], ["aproximado", "aprox."]]} /></div>)}
          <div class="card" style="margin-top:12px;background:var(--sup-2)"><p class="kicker">Carga inicial estimada</p>{est.map(({ id: x, s }) => <div key={x} class="row between small" style="padding:4px 0"><span>{EXB[x].nm}</span><span class="num">{s.kg ? <><b>{fmt(s.kg, 1)} kg</b> × {EXB[x].r[1]}</> : "calibrar (sobrar 3 reps)"}</span></div>)}</div></div></>; }
    case "rotina": return <><span class="f">Dias que normalmente dá para ir</span><div class="chips">{DOW.map((d, i) => <Chip key={d} on={pr.daysUsual.includes(d)} onClick={() => ptoggle("daysUsual", d)}>{DOW_NM[i]}</Chip>)}</div>
      <div class="row wrapx" style="gap:16px;margin-top:16px"><div><span class="f">Meta por semana</span><PSeg k="daysTarget" opts={[[2, "2"], [3, "3"], [4, "4"], [5, "5"]]} /></div><div><span class="f">Duração típica</span><PSeg k="minutes" opts={[[45, "45"], [60, "60"], [75, "75"], [90, "90"]]} /></div></div>
      <div class="row wrapx" style="gap:16px;margin-top:16px"><div><span class="f">Semana</span><PSeg k="flexWeek" opts={[[true, "flexível (orçamento)"], [false, "dias fixos"]]} /></div><div><span class="f">Começa na</span><PSeg k="weekStart" opts={[["seg", "segunda"], ["dom", "domingo"]]} /></div><div><span class="f">Horário</span><PSeg k="hour" opts={[["manha", "manhã"], ["almoco", "almoço"], ["tarde", "tarde"], ["noite", "noite"]]} /></div></div>
      <div class="note" style="margin-top:16px"><Icon id="info" /><span>Semana flexível: as séries de cada músculo viram um orçamento. Faltou? O app pergunta quantos dias ainda dá e redistribui, sempre buscando 2× por músculo. Compensatório só quando você pedir.</span></div></>;
    case "academias": return <GymEditor />;
    case "preferencias": return <><p class="small sub" style="margin-bottom:10px">Por músculo: o que você prefere quando há opção. Com a academia cheia, o app ainda pode desviar para o que estiver livre.</p>
      {C.MUSCLE_IDS.map((m) => <div class="prefrow" key={m}><span class="small"><b>{mName(m)}</b></span><Seg opts={[["livre", "Livre"], ["maquina", "Máquina"], ["cabo", "Cabo"], ["tanto_faz", "Tanto faz"]]} value={pr.prefs[m] ?? "tanto_faz"} onPick={(v) => pset(`prefs.${m}`, v)} /></div>)}
      <div style="margin-top:16px"><span class="f">Exercícios que você faz melhor (entram primeiro)</span>{pr.priorities.map((m) => <label key={m} class="prefrow small"><span>{mName(m)}</span><select class="input" value={pr.pinned[m] ?? ""} onChange={(e) => { const v = e.currentTarget.value; if (v) pr.pinned[m] = v; else delete pr.pinned[m]; profileChanged(); commit(); }}><option value="">automático</option>{C.EXERCISES.filter((e) => e.m === m).map((e) => <option key={e.id} value={e.id}>{e.nm}</option>)}</select></label>)}</div>
      <div style="margin-top:16px"><span class="f">Evitar</span><div class="chips">{["Barbell_Full_Squat", "Bent_Over_Barbell_Row", "Dips_-_Triceps_Version", "Pullups", "EZ-Bar_Skullcrusher", "Romanian_Deadlift", "Barbell_Bench_Press_-_Medium_Grip"].map((x) => <Chip key={x} on={pr.avoid.includes(x)} onClick={() => ptoggle("avoid", x)}>{EXB[x].nm}</Chip>)}</div></div>
      <div class="row wrapx" style="gap:16px;margin-top:16px"><div><span class="f">Formato padrão</span><PSeg k="dynamics" opts={[["tradicional", "normal"], ["superserie", "superséries"], ["circuito", "circuito"]]} /></div>
        <div><span class="f">Academia cheia</span><PSeg k="crowdedStrategy" opts={[["halteres", "ir de halteres"], ["reordenar", "mudar a ordem"], ["esperar", "esperar"]]} /></div></div></>;
    case "corpo": return <><p class="small">Dores ativas: <b>{S.pains.length}</b>. <a href="#corpo" class="btn sm">Abrir mapa de dor <Icon id="arrow" /></a></p>
      <div class="row wrapx" style="gap:16px;margin-top:16px"><div><span class="f">Agacha fundo sem dor?</span><PSeg k="mobility.squat" opts={[[true, "sim"], [false, "não"]]} /></div><div><span class="f">Braço acima da cabeça sem dor?</span><PSeg k="mobility.overhead" opts={[[true, "sim"], [false, "não"]]} /></div></div></>;
    case "comida": return <><span class="f">Um dia típico (fale ou escreva)</span><div class="row start" style="gap:10px"><Mic value={pr.diet.typical} onChange={(v) => { pr.diet.typical = v; profileChanged(); commit(); }} label="Falar o dia típico" />
        <textarea class="input" rows={3} aria-label="Dia típico" placeholder="café: pão com ovo · almoço: marmita arroz, feijão, frango · janta: o que tiver" value={pr.diet.typical} onInput={(e) => { pr.diet.typical = e.currentTarget.value; profileChanged(); }} /></div>
      <div class="row wrapx" style="gap:16px;margin-top:16px"><div><span class="f">Como registrar</span><PSeg k="diet.mode" opts={[["zero", "só peso"], ["leve", "leve (falar/escrever)"], ["detalhado", "detalhado"]]} /></div></div>
      <div style="margin-top:16px"><span class="f">Restrições</span><div class="chips">{["lactose", "glúten", "vegetariano", "não come peixe"].map((v) => <Chip key={v} on={pr.diet.restrictions.includes(v)} onClick={() => ptoggle("diet.restrictions", v)}>{v}</Chip>)}</div></div>
      <div style="margin-top:16px"><span class="f">Suplementos</span><div class="chips">{["whey", "creatina", "cafeína"].map((v) => <Chip key={v} on={pr.diet.supplements.includes(v)} onClick={() => ptoggle("diet.supplements", v)}>{v}</Chip>)}</div></div></>;
    case "claude": return <><span class="f">Quanto o Claude pode mudar sozinho</span><PSeg k="autonomy" opts={[["so_sugere", "só sugere"], ["carga_sozinho", "carga sozinho, plano com aprovação"], ["tudo", "tudo"]]} />
      <div style="margin-top:16px"><span class="f">Modelo por tipo de pedido (economia × qualidade)</span>{CATS.map((c) => <div class="prefrow" key={c}><span class="small"><b>{c}</b></span><PSeg k={`tiers.${c}`} opts={[["haiku", "Haiku"], ["sonnet", "Sonnet"], ["opus", "Opus"]]} /></div>)}
        <p class="tiny sub" style="margin-top:8px">Haiku: registro e trocas simples · Sonnet: reorganizar o dia/semana · Opus: dor, revisão e novo bloco. Cada pedido pode trocar o modelo antes de enviar.</p></div>
      <div class="row wrapx" style="gap:16px;margin-top:16px"><div><span class="f">Tom</span><PSeg k="tone" opts={[["direto", "direto"], ["motivador", "motivador"], ["tecnico", "técnico"]]} /></div><div><span class="f">Revisão semanal</span><PSeg k="reviewTime" opts={[["dom20", "dom 20h"], ["seg7", "seg 7h"]]} /></div></div>
      <div class="note" style="margin-top:16px"><Icon id="info" /><span>{SERVER ? <>Connector: claude.ai → Personalizar → Connectors → URL <code>/mcp</code> + token. Funciona no app do Claude no celular.</> : "Na versão online, o Claude conversa com este app pelo connector do claude.ai (sem API, na sua assinatura)."}</span></div></>;
  }
  return null;
}

export default function Perfil() {
  const sec = S.ui.perfilSec;
  const go = (v: string | null) => { S.ui.perfilSec = v; commit(); scrollTo(0, 0); };
  if (!sec) return <><p class="kicker">Perfil · edite quando quiser</p><h1>Ponto de partida</h1>
    <div class="card dark" style="margin:14px 0"><p class="kicker" style="color:#A1A1AA">Objetivo</p><p class="goal" style="margin-top:4px">{S.profile.goal.statement}</p>
      <p class="small sub" style="margin-top:6px">Prioridades: {S.profile.priorities.map(mName).join(" › ") || "nenhuma"} · {S.profile.goal.horizonWeeks} semanas</p></div>
    {SECS.map(([id, nm, sum], i) => <button type="button" key={id} class="sec done" onClick={() => go(id)}><span class="n num"><b>{i + 1}</b></span><span><b>{nm}</b><br /><span class="small sub">{sum()}</span></span><Icon id="arrow" /></button>)}</>;
  const i = SECS.findIndex((s) => s[0] === sec);
  return <><div class="row between" style="margin-bottom:12px"><button type="button" class="btn sm" onClick={() => go(null)}><Icon id="back" />Perfil</button><span class="small sub num">{i + 1} de {SECS.length}</span></div>
    <h1 style="margin-bottom:14px">{SECS[i][1]}</h1><Card><Body id={sec} /></Card>
    <div class="row between" style="margin-top:14px">{i > 0 ? <button type="button" class="btn" onClick={() => go(SECS[i - 1][0])}><Icon id="back" />{SECS[i - 1][1]}</button> : <span />}
      {i < SECS.length - 1 ? <button type="button" class="btn pri" onClick={() => go(SECS[i + 1][0])}>{SECS[i + 1][1]} <Icon id="arrow" /></button> : <button type="button" class="btn pri" onClick={() => go(null)}>Concluir <Icon id="check" /></button>}</div></>;
}
