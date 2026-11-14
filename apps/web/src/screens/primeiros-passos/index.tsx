// Primeiros passos: quiz de uma pergunta por tela (~10 telas, ≤ 2 min). Prioridades por GRUPO de músculo (até 5) e "onde treina" leve (#41). Cada resposta já grava no perfil, então dá para
// voltar, retomar de onde parou (rota #primeiros-passos/<n> + passo salvo no aparelho) e refazer quando quiser.
import { useEffect, useState } from "preact/hooks";
import { C, S, commit, today } from "../../lib/store/index.ts";
import { computePlan, profileChanged } from "../../lib/store/regras.ts";
import { SERVER, api, send } from "../../lib/api/index.ts";
import type { Route } from "../../lib/roteador/index.ts";
import { go, href, replace } from "../../lib/roteador/index.ts";
import { Icon, Seg, Stepper, toast } from "../../lib/ui/index.tsx";
import { escolherObjetivo } from "../../lib/prioridades/index.tsx";
import { SeletorGrupos } from "../../lib/mapa-corpo/index.tsx";
import { IlustCorpo, IlustObjetivo } from "../../lib/ilustracoes/index.tsx";
import { BODY, DAYS_LONG, DIET, GOALS, LEVELS, LIM } from "../../lib/perfil-dados.ts";
import { DEFAULT_GYMS } from "../../lib/store/index.ts";
import { limparDispensaCheckup } from "../../lib/faixa-checkup/index.tsx";
import { lsGet, lsSet, setPath } from "../../lib/util.ts";

const KEY = "ciclo:pp";
const pp = { ...{ step: 0 }, ...lsGet<{ step?: number }>(KEY, {}) };
const savePP = () => lsSet(KEY, pp);

const pset = (k: string, v: unknown) => { setPath(S.profile, k, v); profileChanged(); commit(); };
const stepNum = (k: string, d: number) => {
  const [lo, hi] = LIM[k] ?? [-1e9, 1e9];
  const cur = k.split(".").reduce((a: any, x) => a?.[x], S.profile) as number;
  pset(k, Math.min(hi, Math.max(lo, Math.round((Number(cur) + d) * 10) / 10)));
};

const Opt = ({ on, onClick, title, desc, children }: { on: boolean; onClick: () => void; title: string; desc?: string; children?: any }) =>
  <button type="button" class="opt big" aria-pressed={on} onClick={onClick}>{children}<b>{title}</b>{desc && <span>{desc}</span>}</button>;

// ---------- telas ----------
function Objetivo() {
  const g = S.profile.goal, info = C.GOAL_INFO[g.id as C.GoalId];
  return <>{info && <div class="note goal-muda" style="margin-bottom:14px" role="status"><Icon id="target" /><span><b>O que muda no seu treino:</b> {info.muda}</span></div>}
    <div class="opts two">{GOALS.map((o) => <Opt key={o.id} on={g.id === o.id} title={o.nm} desc={o.desc} onClick={() => { escolherObjetivo(o.id, profileChanged); commit(); }}><IlustObjetivo id={o.id} /></Opt>)}</div></>;
}

const Prioridades = () => <SeletorGrupos onChange={() => { profileChanged(); commit(); }} />;

const Experiencia = () => <div class="opts">{LEVELS.map(([v, nm, d]) => <Opt key={v} on={S.profile.level === v} title={nm} desc={d} onClick={() => pset("level", v)} />)}</div>;

function Rotina() {
  const pr = S.profile, toggle = (d: string) => {
    const a = pr.daysUsual.includes(d) ? pr.daysUsual.filter((x) => x !== d) : [...pr.daysUsual, d];
    pr.daysUsual = C.DOWS.filter((x) => a.includes(x)); pr.daysTarget = Math.min(7, Math.max(1, pr.daysUsual.length)); profileChanged(); commit();
  };
  return <><span class="f">Dias em que você costuma treinar</span>
    <div class="chips">{DAYS_LONG.map(([d, nm]) => <button type="button" key={d} class="chip tall" aria-pressed={pr.daysUsual.includes(d)} onClick={() => toggle(d)}>{nm.slice(0, 3)}</button>)}</div>
    <p class="small sub" style="margin-top:8px">{pr.daysUsual.length ? `${pr.daysUsual.length} dia(s) por semana.` : "Marque ao menos um dia."}</p>
    <div style="margin-top:20px"><span class="f">Quanto dura um treino</span><Seg opts={[[45, "45 min"], [60, "60 min"], [75, "75 min"], [90, "90 min"]]} value={pr.minutes} onPick={(v) => pset("minutes", v)} label="Duração" /></div></>;
}

const LUGARES: [C.PlaceChoice, string, string][] = [["academia", "Academia", "máquinas, polias e halteres"], ["casa", "Casa", "halteres, elástico e barra fixa"]];
/** Conta nova: a resposta leve vira o(s) lugar(es) com os aparelhos mais comuns (sem perguntar aparelho; ajusta depois em Academias). */
function aplicarLugares(places: readonly string[]) {
  const acad = places.includes("academia"), casa = places.includes("casa");
  const mk = (id: string, name: string, kind: C.PlaceKind, base: (typeof DEFAULT_GYMS)[number]) => ({ id, name, kind, equipment: [...base.equipment], busyHours: [] as string[] });
  const gs = [...(acad ? [mk("acad1", "Academia 1", "academia", DEFAULT_GYMS[0])] : []), ...(casa ? [mk("casa", "Casa", "casa", DEFAULT_GYMS[2])] : [])];
  if (!gs.length) return;
  S.gyms = gs; S.ui.gymId = gs[0].id; S.ui.gymTab = gs[0].id;
  S.profile.dayGym = Object.fromEntries(C.DOWS.map((d) => [d, acad && casa && (d === "sab" || d === "dom") ? "casa" : gs[0].id]));
}
const novaConta = () => SERVER && S.onboarding !== "concluido";
function Onde() {
  const places = S.profile.places ?? [];
  const toggle = (k: C.PlaceChoice) => {
    const a = places.includes(k) ? places.filter((x) => x !== k) : [...places, k];
    if (!a.length) return toast("Escolha ao menos uma opção");
    pset("places", C.PLACES.filter((x) => a.includes(x)));
    if (novaConta()) { aplicarLugares(S.profile.places); commit(); }
  };
  return <><div class="opts" role="group" aria-label="Onde você treina (pode marcar os dois)">{LUGARES.map(([k, nm, d]) => <Opt key={k} on={places.includes(k)} title={nm} desc={d} onClick={() => toggle(k)} />)}</div>
    <div class="note" style="margin-top:14px"><Icon id="gym" /><span>{novaConta() ? <>Os aparelhos de cada lugar você ajusta depois, em <a class="link44" href="#academias">Academias</a>, com um passo a passo rápido.</>
      : <>Seus lugares ficam como estão ({S.gyms.map((x) => x.name).join(", ")}). Para mexer nos aparelhos, use <a class="link44" href="#academias">Academias</a>.</>}</span></div></>;
}

function resolvePain(region: string) {
  const p = S.pains.find((x) => x.region === region); if (!p) return;
  S.pains = S.pains.filter((x) => x.region !== region);
  send("POST", `/api/pains/${p.id}/resolve`).catch(() => {});
}
function addPainQuick(region: string) {
  const row = { id: String(crypto.randomUUID()), created_at: Date.now(), region, intensity: 2 };
  S.pains = S.pains.filter((x) => x.region !== region).concat(row);
  send<{ id: string }>("POST", "/api/pains", { region, intensity: 2 }).then((r) => { if (r?.id) row.id = r.id; }).catch(() => {});
}
function Dores() {
  const setIntensity = (region: string, v: number) => { const p = S.pains.find((x) => x.region === region); if (!p) return; p.intensity = v; send("POST", "/api/pains", { region, intensity: v }).catch(() => {}); commit(); };
  return <><div class="chips"><button type="button" class="chip tall" aria-pressed={!S.pains.length} onClick={() => { [...S.pains].forEach((p) => resolvePain(p.region)); commit(); }}>Nenhuma dor</button></div>
    <span class="f" style="margin-top:16px">Ou toque onde dói ou incomoda</span>
    <div class="chips">{C.PAIN_REGIONS.map((r) => <button type="button" key={r.id} class="chip tall" aria-pressed={S.pains.some((p) => p.region === r.id)}
      onClick={() => { S.pains.some((p) => p.region === r.id) ? resolvePain(r.id) : addPainQuick(r.id); commit(); }}>{r.nm}</button>)}</div>
    {S.pains.map((p) => <div key={p.region} class="prefrow" style="margin-top:12px"><span class="small"><b>{C.REGION_BY_ID[p.region]?.nm ?? p.region}</b></span>
      <Seg opts={[[1, "leve"], [2, "média"], [3, "forte"]]} value={p.intensity} onPick={(v) => setIntensity(p.region, v)} label={`Intensidade ${p.region}`} /></div>)}
    {S.pains.some((p) => p.intensity >= 3) && <div class="note warn" style="margin-top:14px"><Icon id="warn" /><span>Dor forte ou que dura mais de 1–2 semanas pede um profissional. O app adapta o treino, mas não diagnostica.</span></div>}</>;
}

const Corpo = () => <>
  <span class="f">Sexo</span><Seg opts={[["m", "masculino"], ["f", "feminino"]]} value={S.profile.sex} onPick={(v) => pset("sex", v)} label="Sexo" />
  <div class="pp-steppers"><div><span class="f">Idade</span><Stepper value={S.profile.age} step={1} onStep={(d) => stepNum("age", d)} /></div>
    <div><span class="f">Altura</span><Stepper value={S.profile.heightCm} step={1} unit=" cm" onStep={(d) => stepNum("heightCm", d)} /></div>
    <div><span class="f">Peso</span><Stepper value={S.profile.weightKg} step={0.5} unit=" kg" onStep={(d) => stepNum("weightKg", d)} /></div></div></>;

const ComoVoce = () => <div class="opts two">{BODY.map(([v, nm, d]) => <Opt key={v} on={S.profile.bodyType === v} title={nm} desc={d} onClick={() => pset("bodyType", v)}><IlustCorpo id={v} /></Opt>)}</div>;

const Comida = () => <div class="opts">{DIET.map(([v, nm, d]) => <Opt key={v} on={S.profile.diet.mode === v} title={nm} desc={d} onClick={() => pset("diet.mode", v)} />)}</div>;

function Resumo() {
  const plan = computePlan(true);
  return <><div class="card dark"><p class="kicker" style="color:#A1A1AA">Seu plano em uma frase</p><p class="goal" style="margin-top:6px">{C.planSentence(S.profile)}</p></div>
    <div class="card" style="margin-top:12px"><p class="kicker">Primeiro treino · prévia</p><h2 style="margin-top:4px">{plan.name}</h2>
      <p class="small sub num" style="margin-top:2px">{plan.items.length} exercícios · {plan.setsTotal} séries · ~{plan.estMinutes} min</p>
      <ul class="pp-prev">{plan.items.slice(0, 6).map((i) => <li key={i.exerciseId}><span>{i.nm}</span><span class="sub num">{i.sets}×{i.reps.join("–")}</span></li>)}</ul>
      {plan.items.length > 6 && <p class="tiny sub">+ {plan.items.length - 6} no treino completo</p>}
      <p class="tiny sub" style="margin-top:10px">Prioridades: {C.groupsOfSubs(S.profile.subPriorities ?? []).map((g) => C.priorityGroups[g].nm).join(" › ") || "nenhuma"}. Você pode mudar tudo depois em Perfil.</p></div></>;
}

interface Passo { id: string; title: string; sub: string; Tela: () => any }
const PASSOS: Passo[] = [
  { id: "objetivo", title: "Qual é o seu objetivo principal?", sub: "Ele guia o volume, as prioridades e as metas.", Tela: Objetivo },
  { id: "musculos", title: "Quais músculos mais importam?", sub: "Toque no desenho ou na lista, até 5, na ordem de importância. O treino protege esses primeiro.", Tela: Prioridades },
  { id: "experiencia", title: "Há quanto tempo você treina?", sub: "Muda quantas séries você faz por semana.", Tela: Experiencia },
  { id: "rotina", title: "Como é a sua semana?", sub: "Muda como as séries se distribuem nos dias que você realmente vai.", Tela: Rotina },
  { id: "onde", title: "Academia, casa ou os dois?", sub: "Pode marcar os dois. Os aparelhos você cadastra depois, em Academias.", Tela: Onde },
  { id: "dores", title: "Algo dói ou incomoda hoje?", sub: "Muda quais exercícios saem e o aquecimento de fortalecimento.", Tela: Dores },
  { id: "corpo", title: "Seus dados básicos", sub: "Calibra o ritmo de ganho e as metas.", Tela: Corpo },
  { id: "comovoce", title: "Como você se vê hoje?", sub: "Ajuda a ajustar o ritmo e o alerta de cintura.", Tela: ComoVoce },
  { id: "comida", title: "E a comida, como quer registrar?", sub: "Dá para mudar quando quiser.", Tela: Comida },
  { id: "resumo", title: "Tudo pronto", sub: "Confira e gere a sua semana.", Tela: Resumo },
];
const LAST = PASSOS.length - 1;

async function concluir(setBusy: (b: boolean) => void) {
  setBusy(true);
  try {
    S.profile.meta = { ...S.profile.meta, filledBy: "app", confirmed: true, checkup: "feito" }; limparDispensaCheckup();
    if (novaConta()) aplicarLugares(S.profile.places ?? ["academia"]);
    S.ui.locked = false; S.ui.planSource = undefined; S.ui.minutes = S.profile.minutes; S.ui.format = S.profile.dynamics; S.ui.minutesSet = true;
    S.ui.daysLeft = Math.min(4, Math.max(1, S.profile.daysTarget));
    const plan = computePlan(true);
    if (SERVER) {
      await api("PUT", "/api/profile", { data: S.profile });
      for (const g of S.gyms.slice(0, 2)) await api("PUT", `/api/gyms/${encodeURIComponent(g.id)}`, { name: g.name, kind: g.kind, equipment: g.equipment, busyHours: g.busyHours });
      await api("PUT", `/api/day-plan/${today}`, { plan, gymId: S.ui.gymId, source: "core" });
      await api("PATCH", "/api/account", { onboarding: "concluido" });
    }
    S.onboarding = "concluido"; pp.step = 0; savePP(); commit(); toast("Semana gerada"); go("#hoje");
  } catch (e: any) { toast(e?.message ?? "Não deu para salvar agora. Tente de novo."); setBusy(false); }
}

async function pular(setBusy: (b: boolean) => void) {
  setBusy(true);
  try {
    S.profile.meta = { ...S.profile.meta, checkup: "pulado" };
    if (SERVER) { await api("PUT", "/api/profile", { data: S.profile }); await api("PATCH", "/api/account", { onboarding: "concluido" }); }
    S.onboarding = "concluido"; commit(); toast("Sem problema: dá para fazer o checkup depois"); go("#hoje");
  } catch (e: any) { toast(e?.message ?? "Não deu para salvar agora. Tente de novo."); setBusy(false); }
}

export default function PrimeirosPassos({ route }: { route: Route }) {
  const [busy, setBusy] = useState(false);
  const n = Number(route.parts[0]);
  const has = Number.isInteger(n) && n >= 0 && n <= LAST;
  const step = has ? n : Math.min(LAST - 1, Math.max(0, pp.step));
  useEffect(() => { if (!has) replace(href("primeiros-passos", [String(step)])); }, [has, step]);
  useEffect(() => { pp.step = step; savePP(); scrollTo(0, 0); }, [step]);
  const P = PASSOS[step], Tela = P.Tela, pct = Math.round(((step + 1) / PASSOS.length) * 100);
  const goto = (i: number) => go(href("primeiros-passos", [String(i)]));
  const feito = S.onboarding === "concluido" || !SERVER;
  const porClaude = S.profile.meta?.filledBy === "claude" && !S.profile.meta.confirmed;
  // #62: conta nova começa sem nada marcado: objetivo e onde treina precisam de uma escolha
  const blocked = (P.id === "objetivo" && !S.profile.goal?.id) || (P.id === "onde" && !(S.profile.places ?? []).length)
    || (P.id === "musculos" && !S.profile.subPriorities.length && C.goalPreset(S.profile.goal.id).length > 0) || (P.id === "rotina" && !S.profile.daysUsual.length);
  return <div class="pp">
    <div class="pp-top"><button type="button" class="btn" disabled={step === 0} onClick={() => goto(step - 1)} aria-label="Voltar uma pergunta"><Icon id="back" />Voltar</button>
      <span class="small sub num" aria-hidden="true">{step + 1} de {PASSOS.length}</span>
      {feito ? <a class="btn ghost" href="#perfil">Sair</a> : <button type="button" class="btn ghost" disabled={busy} onClick={() => pular(setBusy)}>Pular por agora</button>}</div>
    <div class="pp-bar" role="progressbar" aria-label="Progresso dos Primeiros passos" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><i style={`width:${pct}%`} /></div>
    {porClaude && step === 0 && <div class="note" style="margin-top:14px"><Icon id="chat" /><span>Preenchido pelo Claude. Confira as respostas e siga até o fim para confirmar.</span></div>}
    <h1 class="pp-q">{P.title}</h1><p class="sub pp-sub">{P.sub}</p>
    <div class="pp-body"><Tela /></div>
    <div class="pp-cta">{step < LAST
      ? <button type="button" class="btn pri lg full" disabled={blocked} onClick={() => goto(step + 1)}>Continuar<Icon id="arrow" /></button>
      : <button type="button" class="btn pri lg full" disabled={busy} onClick={() => concluir(setBusy)}><Icon id="check" />{busy ? "Gerando…" : "Gerar minha semana e abrir o Hoje"}</button>}
      {blocked && <p class="tiny sub" style="text-align:center;margin-top:6px">{P.id === "rotina" ? "Marque ao menos um dia." : P.id === "objetivo" ? "Escolha um objetivo." : P.id === "onde" ? "Escolha onde você treina." : "Escolha ao menos uma prioridade."}</p>}</div>
  </div>;
}
