// Perfil de treino: blocos que dizem POR QUE importam, selo "completo / dá para melhorar" e o próximo passo recomendado.
// Sem numeração. Academias, Corpo (dor) e Comida têm tela própria; aqui só atalhos. Cada bloco abre em #perfil/<bloco>.
import { C, S, commit } from "../../lib/store/index.ts";
import { EXB, ensureBaseline, mName, profileChanged } from "../../lib/store/regras.ts";
import { SERVER } from "../../lib/api/index.ts";
import type { Route } from "../../lib/roteador/index.ts";
import { Card, Chip, Icon, Seg, Stepper, toast } from "../../lib/ui/index.tsx";
import { SeletorPrioridades, escolherObjetivo } from "../../lib/prioridades/index.tsx";
import { SeletorGrupos } from "../../lib/mapa-corpo/index.tsx";
import { IlustCorpo, IlustObjetivo } from "../../lib/ilustracoes/index.tsx";
import { ANCHORS, ANCHOR_DEFAULT, BODY, DAYS_LONG, GOALS, LIM } from "../../lib/perfil-dados.ts";
import { Mic } from "../../lib/voz/index.tsx";
import { DOW, DOW_NM, fmt, getPath, setPath } from "../../lib/util.ts";
import { CATS } from "../claude/caixa.tsx";

const pr = () => S.profile;
const pset = (k: string, v: unknown) => { setPath(S.profile, k, v); profileChanged(); commit(); };
const ptoggle = (k: string, v: string) => { const arr: string[] = getPath(S.profile, k); const i = arr.indexOf(v); i >= 0 ? arr.splice(i, 1) : arr.push(v); profileChanged(); commit(); };
const bounds = (k: string): [number, number] => LIM[k] ?? (k.endsWith(".kg") ? [0, 600] : k.endsWith(".reps") ? [1, 30] : [-1e9, 1e9]);
const step = (k: string, d: number) => { const [lo, hi] = bounds(k); pset(k, Math.min(hi, Math.max(lo, Math.round(((Number(getPath(S.profile, k)) || 0) + d) * 10) / 10))); };
function PSeg<T>({ k, opts, label }: { k: string; opts: [T, string][]; label?: string }) { return <Seg opts={opts} value={getPath(S.profile, k)} onPick={(v) => pset(k, v)} label={label} />; }
const Opt = ({ on, onClick, title, desc, children }: { on: boolean; onClick: () => void; title: string; desc: string; children?: any }) =>
  <button type="button" class="opt big" aria-pressed={on} onClick={onClick}>{children}<b>{title}</b><span>{desc}</span></button>;

interface Bloco { id: string; nm: string; icon: string; why: string; resumo: () => string; key?: C.ProfileBlock }
const LV = ["nunca treinou", "menos de 1 ano", "1–3 anos", "3+ anos"];
const BLOCOS: Bloco[] = [
  { id: "objetivo", nm: "Objetivo e foco", icon: "target", key: "objetivo", why: "Guia o volume, as prioridades e as metas de tudo no app.", resumo: () => pr().goal.statement },
  { id: "prioridades", nm: "Músculos prioritários", icon: "dumb", key: "prioridades", why: "Esses músculos são protegidos primeiro quando falta tempo ou dia.", resumo: () => C.groupsOfSubs(pr().subPriorities ?? []).map((g) => C.priorityGroups[g].nm).join(" › ") || pr().priorities.map(mName).join(" › ") || "nenhum escolhido" },
  { id: "voce", nm: "Você", icon: "user", key: "voce", why: "Calibra o ritmo de ganho e o alerta de cintura.", resumo: () => `${pr().age} anos · ${pr().heightCm} cm · ${pr().weightKg} kg · ${BODY.find((b) => b[0] === pr().bodyType)?.[1] ?? ""}` },
  { id: "experiencia", nm: "Experiência e cargas", icon: "clock", key: "experiencia", why: "Muda quantas séries você faz e a carga do 1º treino.", resumo: () => `${LV[pr().level]} · ${pr().remembered.length ? `${pr().remembered.length} carga(s) lembrada(s)` : "calibra no 1º treino"}` },
  { id: "rotina", nm: "Rotina da semana", icon: "cal", key: "rotina", why: "Muda como as séries se distribuem nos dias em que você realmente vai.", resumo: () => `${pr().daysTarget} dias · ${pr().minutes} min · semana começa ${DAYS_LONG.find((d) => d[0] === pr().weekStart)?.[1].toLowerCase() ?? ""}` },
  { id: "preferencias", nm: "Preferências por músculo", icon: "swap", key: "preferencias", why: "Muda quais exercícios entram e em que aparelho.", resumo: () => `${Object.values(pr().prefs).filter((v) => v && v !== "tanto_faz").length} músculo(s) com preferência · formato ${pr().dynamics}` },
  { id: "mobilidade", nm: "Mobilidade", icon: "body", key: "mobilidade", why: "Tira os exercícios que doem ao agachar fundo ou levantar o braço.", resumo: () => `agachar ${pr().mobility.squat ? "sem dor" : "com dor"} · braço acima da cabeça ${pr().mobility.overhead ? "sem dor" : "com dor"}` },
  { id: "claude", nm: "Como o Claude trabalha com você", icon: "chat", key: "claude", why: "Define o que ele muda sozinho, o tom e qual modelo responde cada pedido.", resumo: () => `${({ so_sugere: "só sugere", carga_sozinho: "carga sozinho, plano com aprovação", tudo: "tudo automático" } as Record<string, string>)[pr().autonomy]} · tom ${pr().tone}` },
];
const FORA: Bloco = { id: "comida", nm: "Comida e registro", icon: "food", why: "Define como você registra o que come (a tela Comida usa isto).", resumo: () => `registro ${pr().diet.mode} · ${pr().diet.kcal} kcal · ${pr().diet.protein} g` };

function Corpo() {
  const p = pr();
  return <><span class="f">Sexo</span><PSeg k="sex" label="Sexo" opts={[["m", "masculino"], ["f", "feminino"]]} />
    <div class="pp-steppers"><div><span class="f">Idade</span><Stepper value={p.age} step={1} onStep={(d) => step("age", d)} /></div><div><span class="f">Altura</span><Stepper value={p.heightCm} step={1} unit=" cm" onStep={(d) => step("heightCm", d)} /></div><div><span class="f">Peso</span><Stepper value={p.weightKg} step={0.5} unit=" kg" onStep={(d) => step("weightKg", d)} /></div></div>
    <div style="margin-top:16px"><span class="f">Como você se vê hoje</span><div class="opts two">{BODY.map(([v, l, d]) => <Opt key={v} on={p.bodyType === v} onClick={() => pset("bodyType", v)} title={l} desc={d}><IlustCorpo id={v} /></Opt>)}</div></div>
    <div style="margin-top:16px"><span class="f">Onde acumula gordura (pode marcar mais de um)</span><div class="chips">{C.FAT_WHERE.map((v) => <button type="button" key={v} class="chip tall" aria-pressed={p.fatWhere.includes(v)} onClick={() => ptoggle("fatWhere", v)}>{v}</button>)}</div></div></>;
}

function Objetivo() {
  const p = pr(), g = p.goal, mt = g.metrics;
  return <><p class="goal">{g.statement}</p>
    <p class="small sub" style="margin-top:6px">Em {g.horizonWeeks} semanas: braço +{fmt(mt.bracoCm, 1)} cm · cintura {mt.cinturaCm ? (mt.cinturaCm > 0 ? "+" : "") + fmt(mt.cinturaCm, 1) + " cm" : "igual"} · peso {mt.pesoKg >= 0 ? "+" : ""}{fmt(mt.pesoKg, 1)} kg · 2×/músculo em {mt.aderenciaPct}% das semanas.</p>
    <div style="margin-top:16px"><span class="f">Um objetivo principal (sugere as prioridades e as metas; você ajusta depois)</span>
      {C.GOAL_INFO[g.id as C.GoalId] && <div class="note goal-muda" style="margin:8px 0 12px" role="status"><Icon id="target" /><span><b>O que muda no seu treino:</b> {C.GOAL_INFO[g.id as C.GoalId].muda}</span></div>}
      <div class="opts two">{GOALS.map((o) => <Opt key={o.id} on={g.id === o.id} title={o.nm} desc={o.desc} onClick={() => { escolherObjetivo(o.id, profileChanged); commit(); }}><IlustObjetivo id={o.id} /></Opt>)}</div></div>
    <div class="pp-steppers" style="margin-top:16px"><div><span class="f">Horizonte</span><PSeg k="goal.horizonWeeks" label="Horizonte" opts={[[8, "8 sem"], [12, "12 sem"], [16, "16 sem"]]} /></div>
      <div><span class="f">Braço</span><Stepper value={mt.bracoCm} step={0.5} unit=" cm" onStep={(d) => step("goal.metrics.bracoCm", d)} /></div><div><span class="f">Cintura</span><Stepper value={mt.cinturaCm} step={0.5} unit=" cm" onStep={(d) => step("goal.metrics.cinturaCm", d)} /></div><div><span class="f">Peso</span><Stepper value={mt.pesoKg} step={0.5} unit=" kg" onStep={(d) => step("goal.metrics.pesoKg", d)} /></div></div></>;
}

function Experiencia() {
  const p = pr();
  const est = ["Incline_Dumbbell_Press", "Incline_Dumbbell_Curl", "Cable_Seated_Lateral_Raise", "Hack_Squat"].map((x) => ({ id: x, s: C.startLoad(x, p.remembered, EXB[x].r[1]) }));
  const anchor = (x: string) => { const r = p.remembered, i = r.findIndex((y) => y.exerciseId === x); if (i >= 0) r.splice(i, 1); else if (r.length < 4) { const [kg, reps] = ANCHOR_DEFAULT[x] ?? [20, 10]; r.push({ exerciseId: x, kg, reps, confidence: "aproximado" }); } else return toast("Até 4"); profileChanged(); commit(); };
  return <><span class="f">Há quanto tempo treina</span><PSeg k="level" label="Experiência" opts={[[0, "nunca"], [1, "< 1 ano"], [2, "1–3 anos"], [3, "3+ anos"]]} />
    <div style="margin-top:16px"><span class="f">Cargas que você lembra (opcional, não precisa ser exato)</span><p class="small sub">Escolha até 4. O app estima o resto pela família do movimento e ajusta depois do 1º treino.</p>
      <div class="chips" style="margin-top:8px">{ANCHORS.map((x) => <button type="button" key={x} class="chip tall" aria-pressed={p.remembered.some((r) => r.exerciseId === x)} onClick={() => anchor(x)}>{EXB[x].nm}</button>)}</div>
      {p.remembered.map((r, i) => <div key={r.exerciseId} class="row wrapx" style="margin-top:10px;gap:10px"><b style="min-width:150px">{EXB[r.exerciseId].nm}</b><Stepper value={r.kg} step={EXB[r.exerciseId].inc || 2.5} unit=" kg" onStep={(d) => step(`remembered.${i}.kg`, d)} /><span class="sub">×</span><Stepper value={r.reps} step={1} unit=" reps" onStep={(d) => step(`remembered.${i}.reps`, d)} />
        <PSeg k={`remembered.${i}.confidence`} label="Certeza" opts={[["certeza", "certeza"], ["aproximado", "aprox."]]} /></div>)}
      <div class="card" style="margin-top:12px;background:var(--sup-2)"><p class="kicker">Carga inicial estimada</p>{est.map(({ id: x, s }) => <div key={x} class="row between small" style="padding:4px 0"><span>{EXB[x].nm}</span><span class="num">{s.kg ? <><b>{fmt(s.kg, 1)} kg</b> × {EXB[x].r[1]}</> : "calibrar (sobrar 3 reps)"}</span></div>)}</div></div></>;
}

function Rotina() {
  const p = pr();
  return <><span class="f">Onde você treina (pode marcar os dois)</span>
    <div class="chips">{([["academia", "Academia"], ["casa", "Casa"]] as [C.PlaceChoice, string][]).map(([k, nm]) => <button type="button" key={k} class="chip tall" aria-pressed={(p.places ?? []).includes(k)}
      onClick={() => { const a = (p.places ?? []).includes(k) ? p.places.filter((x) => x !== k) : [...(p.places ?? []), k]; if (!a.length) return toast("Escolha ao menos uma opção"); pset("places", C.PLACES.filter((x) => a.includes(x))); }}>{nm}</button>)}</div>
    <p class="tiny sub" style="margin:6px 0 16px">Os aparelhos de cada lugar ficam em <a class="link44" href="#academias">Academias</a>.</p>
    <span class="f">Dias que normalmente dá para ir</span><div class="chips">{DOW.map((d, i) => <button type="button" key={d} class="chip tall" aria-pressed={p.daysUsual.includes(d)} onClick={() => ptoggle("daysUsual", d)}>{DOW_NM[i]}</button>)}</div>
    <div class="row wrapx" style="gap:16px;margin-top:16px"><div><span class="f">Meta por semana</span><PSeg k="daysTarget" label="Meta por semana" opts={[[2, "2"], [3, "3"], [4, "4"], [5, "5"]]} /></div><div><span class="f">Duração típica</span><PSeg k="minutes" label="Duração" opts={[[45, "45 min"], [60, "60 min"], [75, "75 min"], [90, "90 min"]]} /></div></div>
    <div class="row wrapx" style="gap:16px;margin-top:16px"><div><span class="f">Semana</span><PSeg k="flexWeek" label="Tipo de semana" opts={[[true, "flexível (orçamento)"], [false, "dias fixos"]]} /></div>
      <div><label class="f" for="weekStart">A semana começa em</label><select id="weekStart" aria-label="A semana começa em" class="input" style="min-width:160px" value={p.weekStart} onChange={(e) => pset("weekStart", e.currentTarget.value)}>{DAYS_LONG.map(([v, nm]) => <option key={v} value={v}>{nm}</option>)}</select></div>
      <div><span class="f">Horário</span><PSeg k="hour" label="Horário" opts={[["manha", "manhã"], ["almoco", "almoço"], ["tarde", "tarde"], ["noite", "noite"]]} /></div></div>
    <div class="note" style="margin-top:16px"><Icon id="info" /><span>Semana flexível: as séries de cada músculo viram um orçamento. Faltou? O app pergunta quantos dias ainda dá e redistribui, sempre buscando 2× por músculo. Compensatório só quando você pedir.</span></div></>;
}

function Preferencias() {
  const p = pr();
  return <><p class="small sub" style="margin-bottom:10px">Por músculo: o que você prefere quando há opção. Com a academia cheia, o app ainda pode desviar para o que estiver livre.</p>
    {C.MUSCLE_IDS.map((m) => <div class="prefrow" key={m}><span class="small"><b>{mName(m)}</b></span><Seg label={`Preferência de ${mName(m)}`} opts={[["livre", "Livre"], ["maquina", "Máquina"], ["cabo", "Cabo"], ["tanto_faz", "Tanto faz"]]} value={p.prefs[m] ?? "tanto_faz"} onPick={(v) => pset(`prefs.${m}`, v)} /></div>)}
    <div style="margin-top:16px"><span class="f">Exercícios que você faz melhor (entram primeiro)</span>{p.priorities.map((m) => <label key={m} class="prefrow small"><span>{mName(m)}</span><select class="input" value={p.pinned[m] ?? ""} onChange={(e) => { const v = e.currentTarget.value; if (v) p.pinned[m] = v; else delete p.pinned[m]; profileChanged(); commit(); }}><option value="">automático</option>{C.EXERCISES.filter((e) => e.m === m).map((e) => <option key={e.id} value={e.id}>{e.nm}</option>)}</select></label>)}</div>
    <div style="margin-top:16px"><span class="f">Evitar</span><div class="chips">{["Barbell_Full_Squat", "Bent_Over_Barbell_Row", "Dips_-_Triceps_Version", "Pullups", "EZ-Bar_Skullcrusher", "Romanian_Deadlift", "Barbell_Bench_Press_-_Medium_Grip"].map((x) => <button type="button" key={x} class="chip tall" aria-pressed={p.avoid.includes(x)} onClick={() => ptoggle("avoid", x)}>{EXB[x].nm}</button>)}</div></div>
    <div class="row wrapx" style="gap:16px;margin-top:16px"><div><span class="f">Formato padrão</span><PSeg k="dynamics" label="Formato" opts={[["tradicional", "normal"], ["superserie", "superséries"], ["circuito", "circuito"]]} /></div>
      <div><span class="f">Academia cheia</span><PSeg k="crowdedStrategy" label="Academia cheia" opts={[["halteres", "ir de halteres"], ["reordenar", "mudar a ordem"], ["esperar", "esperar"]]} /></div></div></>;
}

const Mobilidade = () => <><div class="row wrapx" style="gap:16px"><div><span class="f">Agacha fundo sem dor?</span><PSeg k="mobility.squat" label="Agachar" opts={[[true, "sim"], [false, "não"]]} /></div><div><span class="f">Braço acima da cabeça sem dor?</span><PSeg k="mobility.overhead" label="Braço acima da cabeça" opts={[[true, "sim"], [false, "não"]]} /></div></div>
  <p class="small" style="margin-top:14px">Dores de hoje ficam no <a class="link44" href="#corpo">mapa de dor</a>: <b>{S.pains.length}</b> ativa(s).</p></>;

function Claude() {
  return <><span class="f">Quanto o Claude pode mudar sozinho</span><PSeg k="autonomy" label="Autonomia" opts={[["so_sugere", "só sugere"], ["carga_sozinho", "carga sozinho, plano com aprovação"], ["tudo", "tudo"]]} />
    <div style="margin-top:16px"><span class="f">Modelo por tipo de pedido (economia × qualidade)</span>{CATS.map((c) => <div class="prefrow" key={c}><span class="small"><b>{c}</b></span><PSeg k={`tiers.${c}`} label={`Modelo de ${c}`} opts={[["haiku", "Haiku"], ["sonnet", "Sonnet"], ["opus", "Opus"]]} /></div>)}
      <p class="tiny sub" style="margin-top:8px">Haiku: registro e trocas simples · Sonnet: reorganizar o dia/semana · Opus: dor, revisão e novo bloco. Cada pedido pode trocar o modelo antes de enviar.</p></div>
    <div class="row wrapx" style="gap:16px;margin-top:16px"><div><span class="f">Tom</span><PSeg k="tone" label="Tom" opts={[["direto", "direto"], ["motivador", "motivador"], ["tecnico", "técnico"]]} /></div><div><span class="f">Revisão semanal</span><PSeg k="reviewTime" label="Revisão semanal" opts={[["dom20", "dom 20h"], ["seg7", "seg 7h"]]} /></div></div>
    <div class="note" style="margin-top:16px"><Icon id="info" /><span>{SERVER ? <>Connector: claude.ai → Personalizar → Connectors → URL <code>/mcp</code> + token. Funciona no app do Claude no celular. Em <a class="link44" href="#conta">Conta</a> você gera o token.</> : "Na versão online, o Claude conversa com este app pelo connector do claude.ai (sem API, na sua assinatura)."}</span></div></>;
}

function Comida() {
  const d = pr().diet;
  return <><span class="f">Como registrar</span><PSeg k="diet.mode" label="Como registrar" opts={[["zero", "só peso"], ["leve", "leve (falar/escrever)"], ["detalhado", "detalhado"]]} />
    <div style="margin-top:16px"><span class="f">Um dia típico (fale ou escreva)</span><div class="row start" style="gap:10px"><Mic value={d.typical} onChange={(v) => { d.typical = v; profileChanged(); commit(); }} label="Falar o dia típico" />
      <textarea class="input" rows={3} aria-label="Dia típico" placeholder="café: pão com ovo · almoço: marmita arroz, feijão, frango · janta: o que tiver" value={d.typical} onInput={(e) => { d.typical = e.currentTarget.value; profileChanged(); }} /></div></div>
    <div style="margin-top:16px"><span class="f">Restrições</span><div class="chips">{["lactose", "glúten", "vegetariano", "não come peixe"].map((v) => <Chip key={v} on={d.restrictions.includes(v)} onClick={() => ptoggle("diet.restrictions", v)}>{v}</Chip>)}</div></div>
    <div style="margin-top:16px"><span class="f">Suplementos</span><div class="chips">{["whey", "creatina", "cafeína"].map((v) => <Chip key={v} on={d.supplements.includes(v)} onClick={() => ptoggle("diet.supplements", v)}>{v}</Chip>)}</div></div></>;
}

function Prioridades() {
  const onChange = () => { profileChanged(); commit(); };
  return <><SeletorGrupos onChange={onChange} />
    <details class="prio-lista"><summary>Modo avançado: escolher por subparte</summary>
      <p class="small sub" style="margin:8px 0">Aqui dá para separar, por exemplo, ombro lateral de ombro posterior. Vale o mesmo limite de 5 músculos.</p>
      <SeletorPrioridades onChange={onChange} /></details></>;
}

const CORPO_BLOCO: Record<string, () => any> = { objetivo: Objetivo, prioridades: Prioridades, voce: Corpo, experiencia: Experiencia, rotina: Rotina, preferencias: Preferencias, mobilidade: Mobilidade, claude: Claude, comida: Comida };

const Selo = ({ ok }: { ok: boolean }) => <span class={`badge ${ok ? "ok" : "warn"}`}>{ok ? <><Icon id="check" />completo</> : "dá para melhorar"}</span>;

export default function Perfil({ route }: { route: Route }) {
  ensureBaseline();
  const cp = C.profileCompleteness(S.profile);
  const id = route.parts[0], bloco = [...BLOCOS, FORA].find((b) => b.id === id);
  const porClaude = S.profile.meta?.filledBy === "claude" && !S.profile.meta.confirmed;
  const Tela = bloco && CORPO_BLOCO[bloco.id];
  if (bloco && Tela) {
    const nx = cp.next && cp.next.block !== bloco.id ? BLOCOS.find((b) => b.id === cp.next!.block) : null;
    return <><div class="row between" style="margin-bottom:12px"><a class="btn" href="#perfil"><Icon id="back" />Perfil</a>{bloco.key && <Selo ok={cp.blocks[bloco.key]} />}</div>
      <h1>{bloco.nm}</h1><p class="sub" style="margin:4px 0 14px">{bloco.why}</p><Card><Tela /></Card>
      <div class="stack" style="margin-top:14px">
        {nx && cp.next && <div class="card hl"><p class="kicker">Próximo passo recomendado</p><p style="font-weight:700;margin-top:2px">{cp.next.cta}</p><p class="small sub">{cp.next.why}</p><a class="btn pri" style="margin-top:10px" href={`#perfil/${nx.id}`}>Ir agora<Icon id="arrow" /></a></div>}
        <a class="btn full" href="#perfil"><Icon id="check" />Concluir</a></div></>;
  }
  const nx = cp.next ? BLOCOS.find((b) => b.id === cp.next!.block) : null;
  return <><p class="kicker">Perfil de treino · edite quando quiser</p><h1>O que o treino sabe sobre você</h1>
    {porClaude && <div class="note" style="margin-top:14px"><Icon id="chat" /><span style="flex:1">Preenchido pelo Claude. Confira os blocos abaixo.</span>
      <button type="button" class="btn sm" onClick={() => { S.profile.meta = { ...S.profile.meta, filledBy: "claude", confirmed: true }; profileChanged(); commit(); toast("Perfil confirmado"); }}>Está certo</button></div>}
    <div class="card dark" style="margin:14px 0"><div class="row between wrapx"><p class="kicker" style="color:#A1A1AA">Objetivo</p><Selo ok={cp.badge === "completo"} /></div>
      <p class="goal" style="margin-top:4px">{S.profile.goal.statement}</p>
      <p class="small sub" style="margin-top:6px">{C.planSentence(S.profile)}</p>
      <p class="tiny" style="margin-top:8px;color:#A1A1AA" aria-label="Blocos completos"><span class="num">{cp.done} de {cp.total}</span> blocos completos</p></div>
    {nx && cp.next && <div class="card hl" style="margin-bottom:14px"><p class="kicker">Próximo passo recomendado</p><p style="font-weight:700;margin-top:2px">{cp.next.cta}</p><p class="small sub">Muda o treino: {cp.next.why}.</p>
      <a class="btn pri" style="margin-top:10px" href={`#perfil/${nx.id}`}>Fazer agora<Icon id="arrow" /></a></div>}
    <nav aria-label="Blocos do perfil" class="stack">{BLOCOS.map((b) => <a key={b.id} class="sec" href={`#perfil/${b.id}`}><span class="n"><Icon id={b.icon} /></span>
      <span><b>{b.nm}</b> {b.key && <Selo ok={cp.blocks[b.key]} />}<br /><span class="small sub">{b.why}</span><br /><span class="small">{b.resumo()}</span></span><Icon id="arrow" /></a>)}</nav>
    <p class="kicker" style="margin:20px 0 8px">Fora do treino</p>
    <nav aria-label="Atalhos" class="stack"><a class="sec" href={`#perfil/${FORA.id}`}><span class="n"><Icon id={FORA.icon} /></span><span><b>{FORA.nm}</b><br /><span class="small sub">{FORA.why}</span><br /><span class="small">{FORA.resumo()}</span></span><Icon id="arrow" /></a>
      <a class="sec" href="#academias"><span class="n"><Icon id="gym" /></span><span><b>Academias</b><br /><span class="small sub">{S.gyms.map((g) => g.name).join(" · ")}</span></span><Icon id="arrow" /></a>
      <a class="sec" href="#corpo"><span class="n"><Icon id="body" /></span><span><b>Corpo e dores</b><br /><span class="small sub">{S.pains.length} dor(es) ativa(s)</span></span><Icon id="arrow" /></a></nav>
    <hr /><a class="btn full" href="#primeiros-passos/0"><Icon id="spark" />Refazer checkup</a>
    <p class="small sub" style="text-align:center;margin-top:6px">Suas respostas atuais já vêm preenchidas.</p></>;
}
