// Primeiros passos: quiz de uma pergunta por tela (~10 telas, ≤ 2 min). Prioridades por GRUPO de músculo (até 5) e "onde treina" leve (#41).
// #71 Começa vazio (nada marcado, nem do cadastro: ele aparece como sugestão) e salva ao responder: cada toque grava o rascunho no
// aparelho e, logo depois, faz PATCH /api/profile só com os campos daquele passo (fila offline se sem sinal). Continuar, Voltar,
// Pular etapa e Pular por agora gravam na hora. Voltar, recarregar e reabrir mostram o que já foi respondido.
import { useEffect, useRef, useState } from "preact/hooks";
import { C, S, calc, commit, rascunhoPP, today } from "../../lib/store/index.ts";
import { computePlan, profileChanged } from "../../lib/store/regras.ts";
import { HttpError, SERVER, api, queue, send } from "../../lib/api/index.ts";
import type { Route } from "../../lib/roteador/index.ts";
import { go, href, replace } from "../../lib/roteador/index.ts";
import { Icon, Seg, toast } from "../../lib/ui/index.tsx";
import { setSubPriorities } from "../../lib/prioridades/index.tsx";
import { SeletorGrupos } from "../../lib/mapa-corpo/index.tsx";
import { IlustCorpo, IlustObjetivo } from "../../lib/ilustracoes/index.tsx";
import { BODY, DAYS_LONG, DIET, GOALS, LEVELS, LIM } from "../../lib/perfil-dados.ts";
import { DEFAULT_GYMS } from "../../lib/store/index.ts";
import { limparDispensaCheckup } from "../../lib/faixa-checkup/index.tsx";
import { lsGet, lsSet, setPath } from "../../lib/util.ts";

const KEY = "ciclo:pp";
/** `semDor`: tocou em "Nenhuma dor" (sem isso, nada aparece marcado nesse passo). */
const pp = { ...{ step: 0, semDor: false }, ...lsGet<{ step?: number; semDor?: boolean }>(KEY, {}) };
const savePP = () => lsSet(KEY, pp);

// ---------- salvar a cada resposta ----------
let salvo: "" | "salvando" | "salvo" | "aparelho" = "";
let timer: ReturnType<typeof setTimeout> | undefined, pendente: string | null = null;
const MSG_GENERICA = "Não deu para salvar agora. Tente de novo.";
/** Mensagem para a pessoa: a do servidor só quando ele já manda texto humano (perfil_invalido); nunca o texto técnico. */
export const mensagemErro = (e: unknown) => (e instanceof HttpError && (e.data as { code?: string } | null)?.code === "perfil_invalido" ? e.message : MSG_GENERICA);

/** Grava o passo agora (Continuar, Voltar, Pular). Não trava a navegação: o PATCH segue em segundo plano (ou na fila). */
export function salvarPasso(passo: string): Promise<void> {
  clearTimeout(timer); pendente = null;
  const data = C.patchDoPasso(passo, S.profile);
  if (!Object.keys(data).length || !SERVER) return Promise.resolve();
  rascunhoPP.gravar(data);
  const enviado = JSON.stringify(rascunhoPP.ler());
  salvo = "salvando"; commit();
  return send("PATCH", "/api/profile", { data }).then(() => {
    const offline = queue.length > 0;
    if (!offline && JSON.stringify(rascunhoPP.ler()) === enviado) rascunhoPP.limpar(); // o servidor já tem tudo o que estava no aparelho
    salvo = offline ? "aparelho" : "salvo"; commit();
  }).catch(() => { salvo = ""; commit(); }); // erro HTTP: o toast já mostrou o texto humano; o rascunho segue no aparelho
}
/** Uma resposta mudou: fica no aparelho na hora e vai ao servidor logo depois (debounce). */
function mudou(passo: string) {
  profileChanged(false);
  if (SERVER) rascunhoPP.gravar(C.patchDoPasso(passo, S.profile));
  commit();
  clearTimeout(timer); pendente = passo;
  timer = setTimeout(() => { if (pendente) void salvarPasso(pendente); }, 700);
}
const Salvo = () => <p class="tiny sub pp-salvo" role="status" aria-live="polite">{salvo === "salvando" ? "Salvando…" : salvo === "salvo" ? <><Icon id="check" />Salvo</> : salvo === "aparelho" ? "Salvo no aparelho; envia quando voltar o sinal" : ""}</p>;

const Opt = ({ on, onClick, title, desc, children }: { on: boolean; onClick: () => void; title: string; desc?: string; children?: any }) =>
  <button type="button" class="opt big" aria-pressed={on} onClick={onClick}>{children}<b>{title}</b>{desc && <span>{desc}</span>}</button>;

// ---------- telas ----------
const FRASES_PADRAO = new Set(GOALS.map((g) => g.statement));
/** Escolher o objetivo: frase e metas iniciais. A frase escrita pela pessoa fica; as prioridades NÃO mudam (o preset é só sugestão). */
function escolherObjetivo(id: string) {
  const d = C.goalDefaults(id), g = S.profile.goal;
  const escrita = !!g.statement && !FRASES_PADRAO.has(g.statement);
  Object.assign(g, { id: d.id, statement: escrita ? g.statement : d.statement, horizonWeeks: d.horizonWeeks, metrics: d.metrics });
  if (d.id === "retorno") g.since = today; else delete g.since;
  mudou("objetivo");
}
/** #71 O campo do foco entra logo abaixo da linha do objetivo escolhido (largura toda), para aparecer sem rolar no celular. */
function Foco({ info }: { info: { statement: string; muda: string } }) {
  const g = S.profile.goal, ref = useRef<HTMLDivElement>(null);
  // escolheu um objetivo lá embaixo: traz o campo para cima do botão fixo (scroll-margin no CSS)
  useEffect(() => { (ref.current as (HTMLElement & { scrollIntoView?: (o: object) => void }) | null)?.scrollIntoView?.({ block: "nearest" }); }, [g.id]);
  return <div class="pp-foco" ref={ref}>
    <p class="small sub"><b>O que muda no seu treino:</b> {info.muda}</p>
    <label class="f" for="pp-foco" style="margin-top:10px">Seu foco, nas suas palavras</label>
    <textarea id="pp-foco" class="input" rows={2} maxLength={140} value={g.statement} placeholder={info.statement}
      onInput={(e) => { g.statement = (e.currentTarget as HTMLTextAreaElement).value.slice(0, 140); mudou("objetivo"); }} />
    <p class="tiny sub" style="margin-top:4px">Aparece no seu plano. Ex.: "ombros largos para o verão".</p></div>;
}
function Objetivo() {
  const g = S.profile.goal, info = C.GOAL_INFO[g.id as C.GoalId], i = GOALS.findIndex((o) => o.id === g.id);
  const fimDaLinha = i < 0 ? -1 : Math.min(GOALS.length - 1, i - (i % 2) + 1); // grade de 2 colunas
  return <div class="opts two">{GOALS.map((o, k) => [
    <Opt key={o.id} on={g.id === o.id} title={o.nm} desc={o.desc} onClick={() => escolherObjetivo(o.id)}><IlustObjetivo id={o.id} /></Opt>,
    info && k === fimDaLinha ? <Foco key="foco" info={info} /> : null,
  ])}</div>;
}

/** Sugestão do objetivo: chips tracejados (não marcados) e "Usar sugestão". */
function Sugestao() {
  const preset = C.goalPreset(S.profile.goal?.id ?? ""), grupos = C.groupsOfSubs(preset);
  if (!grupos.length || (S.profile.subPriorities ?? []).length) return null;
  return <div class="pp-sug" role="group" aria-label="Sugestão para o seu objetivo">
    <span class="small sub">Sugestão para o seu objetivo:</span>
    <div class="chips" style="margin-top:6px">{grupos.map((gr) => <span key={gr} class="chip sug">{C.priorityGroups[gr].nm}</span>)}</div>
    <button type="button" class="btn sm" style="margin-top:8px" onClick={() => setSubPriorities(preset, () => mudou("musculos"))}><Icon id="check" />Usar sugestão</button>
  </div>;
}
const Prioridades = () => <><Sugestao /><SeletorGrupos onChange={() => mudou("musculos")} /></>;

const Experiencia = () => <div class="opts">{LEVELS.map(([v, nm, d]) => <Opt key={v} on={S.profile.level === v} title={nm} desc={d} onClick={() => { S.profile.level = v as 0 | 1 | 2 | 3; mudou("experiencia"); }} />)}</div>;

function Rotina() {
  const pr = S.profile, toggle = (d: string) => {
    const a = pr.daysUsual.includes(d) ? pr.daysUsual.filter((x) => x !== d) : [...pr.daysUsual, d];
    pr.daysUsual = C.DOWS.filter((x) => a.includes(x)); pr.daysTarget = pr.daysUsual.length ? Math.min(7, pr.daysUsual.length) : null; mudou("rotina");
  };
  return <><span class="f">Dias em que você costuma treinar</span>
    <div class="chips">{DAYS_LONG.map(([d, nm]) => <button type="button" key={d} class="chip tall" aria-pressed={pr.daysUsual.includes(d)} onClick={() => toggle(d)}>{nm.slice(0, 3)}</button>)}</div>
    <p class="small sub" style="margin-top:8px">{pr.daysUsual.length ? `${pr.daysUsual.length} dia(s) por semana.` : "Marque ao menos um dia."}</p>
    <div style="margin-top:20px"><span class="f">Quanto dura um treino</span><Seg opts={[[45, "45 min"], [60, "60 min"], [75, "75 min"], [90, "90 min"]]} value={pr.minutes} onPick={(v) => { pr.minutes = v; mudou("rotina"); }} label="Duração" /></div></>;
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
    S.profile.places = C.PLACES.filter((x) => a.includes(x));
    if (novaConta()) aplicarLugares(S.profile.places);
    mudou("onde");
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
  pp.semDor = false; savePP();
  send<{ id: string }>("POST", "/api/pains", { region, intensity: 2 }).then((r) => { if (r?.id) row.id = r.id; }).catch(() => {});
}
function Dores() {
  const setIntensity = (region: string, v: number) => { const p = S.pains.find((x) => x.region === region); if (!p) return; p.intensity = v; send("POST", "/api/pains", { region, intensity: v }).catch(() => {}); commit(); };
  const nenhuma = () => { [...S.pains].forEach((p) => resolvePain(p.region)); pp.semDor = true; savePP(); commit(); };
  return <><div class="chips"><button type="button" class="chip tall" aria-pressed={pp.semDor && !S.pains.length} onClick={nenhuma}>Nenhuma dor</button></div>
    <span class="f" style="margin-top:16px">Ou toque onde dói ou incomoda</span>
    <div class="chips">{C.PAIN_REGIONS.map((r) => <button type="button" key={r.id} class="chip tall" aria-pressed={S.pains.some((p) => p.region === r.id)}
      onClick={() => { S.pains.some((p) => p.region === r.id) ? resolvePain(r.id) : addPainQuick(r.id); commit(); }}>{r.nm}</button>)}</div>
    {S.pains.map((p) => <div key={p.region} class="prefrow" style="margin-top:12px"><span class="small"><b>{C.REGION_BY_ID[p.region]?.nm ?? p.region}</b></span>
      <Seg opts={[[1, "leve"], [2, "média"], [3, "forte"]]} value={p.intensity} onPick={(v) => setIntensity(p.region, v)} label={`Intensidade ${p.region}`} /></div>)}
    {S.pains.some((p) => p.intensity >= 3) && <div class="note warn" style="margin-top:14px"><Icon id="warn" /><span>Dor forte ou que dura mais de 1–2 semanas pede um profissional. O app adapta o treino, mas não diagnostica.</span></div>}</>;
}

/** Idade, altura e peso: campo de número, vazio até a pessoa digitar. Valor fora do limite não grava (avisa embaixo). */
function Numero({ k, rotulo, unidade, decimal }: { k: "age" | "heightCm" | "weightKg"; rotulo: string; unidade: string; decimal?: boolean }) {
  const [lo, hi] = LIM[k], v = S.profile[k];
  const [txt, setTxt] = useState(v == null ? "" : String(v).replace(".", ","));
  useEffect(() => { if (v != null && Number(txt.replace(",", ".")) !== v) setTxt(String(v).replace(".", ",")); }, [v]);
  const n = Number(txt.replace(",", ".")), fora = txt.trim() !== "" && !(Number.isFinite(n) && n >= lo && n <= hi);
  const onInput = (e: Event) => {
    const t = (e.currentTarget as HTMLInputElement).value; setTxt(t);
    const x = Number(t.replace(",", "."));
    if (t.trim() === "") { S.profile[k] = null; mudou("corpo"); }
    else if (Number.isFinite(x) && x >= lo && x <= hi) { S.profile[k] = decimal ? Math.round(x * 10) / 10 : Math.round(x); mudou("corpo"); }
  };
  return <div class="pp-num"><label class="f" for={`pp-${k}`}>{rotulo} <span class="sub">({unidade})</span></label>
    <input id={`pp-${k}`} class="input num" type="text" inputMode={decimal ? "decimal" : "numeric"} autoComplete="off" value={txt} onInput={onInput} aria-invalid={fora} aria-describedby={fora ? `pp-${k}-e` : undefined} />
    {fora && <p id={`pp-${k}-e`} class="tiny" style="color:var(--warn);margin-top:4px">Use de {lo} a {hi} {unidade}.</p>}</div>;
}
const SEXO_NM: Record<string, string> = { m: "masculino", f: "feminino" };
function Corpo() {
  const cad = C.perfilContaNova(S.account ?? {}, today) as Record<string, any>;
  const falta = (["sex", "age", "heightCm", "weightKg"] as const).filter((k) => cad[k] != null && S.profile[k] == null);
  const usar = () => { for (const k of falta) (S.profile as Record<string, any>)[k] = cad[k]; mudou("corpo"); };
  const resumo = [cad.sex && SEXO_NM[cad.sex], cad.age && `${cad.age} anos`, cad.heightCm && `${cad.heightCm} cm`, cad.weightKg && `${cad.weightKg} kg`].filter(Boolean).join(" · ");
  return <>{falta.length > 0 && <div class="pp-sug" role="group" aria-label="Dados do seu cadastro">
      <span class="small sub">Do seu cadastro: {resumo}</span>
      <button type="button" class="btn sm" style="margin-top:8px" onClick={usar}><Icon id="check" />Usar do cadastro</button></div>}
    <span class="f">Sexo</span><Seg opts={[["m", "masculino"], ["f", "feminino"]]} value={S.profile.sex} onPick={(v) => { S.profile.sex = v; mudou("corpo"); }} label="Sexo" />
    <div class="pp-nums"><Numero k="age" rotulo="Idade" unidade="anos" /><Numero k="heightCm" rotulo="Altura" unidade="cm" /><Numero k="weightKg" rotulo="Peso" unidade="kg" decimal /></div></>;
}

const ComoVoce = () => <div class="opts two">{BODY.map(([v, nm, d]) => <Opt key={v} on={S.profile.bodyType === v} title={nm} desc={d} onClick={() => { S.profile.bodyType = v; mudou("comovoce"); }}><IlustCorpo id={v} /></Opt>)}</div>;

const Comida = () => <div class="opts">{DIET.map(([v, nm, d]) => <Opt key={v} on={S.profile.diet.mode === v} title={nm} desc={d} onClick={() => { setPath(S.profile, "diet.mode", v); mudou("comida"); }} />)}</div>;

/** Conta nova que recarregou depois do passo "onde": os lugares só existem no aparelho na hora de gerar; refaz a partir da resposta. */
const garantirLugares = () => { if (novaConta() && !S.gyms.length && (S.profile.places ?? []).length) aplicarLugares(S.profile.places); };

function Faltando({ itens }: { itens: C.Falta[] }) {
  return <div class="note warn pp-falta" role="alert" style="margin-top:12px"><Icon id="warn" /><div>
    <p class="small"><b>Para gerar a semana, falta responder:</b></p>
    <ul class="pp-falta-l">{itens.map((f) => <li key={f.rotulo}>{f.passo ? <a class="link44" href={href("primeiros-passos", [String(C.PASSOS_PP.indexOf(f.passo))])}>{f.rotulo}</a> : f.rotulo}</li>)}</ul></div></div>;
}

function Resumo() {
  garantirLugares();
  const plan = computePlan(true), g = C.GOAL_INFO[S.profile.goal?.id as C.GoalId];
  return <><div class="card dark"><p class="kicker" style="color:#A1A1AA">Seu plano em uma frase</p>
      {g && <p class="small" style="margin-top:6px;color:#A1A1AA">Objetivo: {g.nm}</p>}
      <p class="goal" style="margin-top:6px">{C.planSentence(S.profile)}</p></div>
    <div class="card" style="margin-top:12px"><p class="kicker">Primeiro treino · prévia</p><h2 style="margin-top:4px">{plan.name}</h2>
      <p class="small sub num" style="margin-top:2px">{plan.items.length} exercícios · {plan.setsTotal} séries · ~{plan.estMinutes} min</p>
      <ul class="pp-prev">{plan.items.slice(0, 6).map((i) => <li key={i.exerciseId}><span>{i.nm}</span><span class="sub num">{i.sets}×{i.reps.join("–")}</span></li>)}</ul>
      {plan.items.length > 6 && <p class="tiny sub">+ {plan.items.length - 6} no treino completo</p>}
      <p class="tiny sub" style="margin-top:10px">Prioridades: {C.groupsOfSubs(S.profile.subPriorities ?? []).map((gr) => C.priorityGroups[gr].nm).join(" › ") || "nenhuma"}. Você pode mudar tudo depois em Perfil.</p></div></>;
}

interface Passo { id: C.PassoPP; title: string; sub: string; Tela: () => any }
export const PASSOS: Passo[] = [
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

/** O passo já tem resposta? (sem resposta, aparece "Pular etapa") */
const respondido = (id: string) => id === "dores" ? pp.semDor || S.pains.length > 0
  : id === "musculos" ? (S.profile.subPriorities ?? []).length > 0 : id === "rotina" ? S.profile.daysUsual.length > 0 && S.profile.minutes != null
  : Object.keys(C.patchDoPasso(id, S.profile)).length > 0;

async function concluir(setBusy: (b: boolean) => void, setFalta: (f: C.Falta[]) => void) {
  const v = C.validarParaGerar(S.profile);
  setFalta(v.faltando);
  if (!v.ok) return toast(`Falta responder: ${v.faltando.map((f) => f.rotulo.toLowerCase()).join(", ")}.`);
  setBusy(true);
  try {
    garantirLugares();
    S.profile.meta = { ...S.profile.meta, filledBy: "app", confirmed: true, checkup: "feito" }; limparDispensaCheckup();
    const c = calc();
    S.ui.locked = false; S.ui.planSource = undefined; S.ui.minutes = c.minutes; S.ui.format = c.dynamics; S.ui.minutesSet = true;
    S.ui.daysLeft = Math.min(4, Math.max(1, c.daysTarget));
    const plan = computePlan(true);
    if (SERVER) {
      clearTimeout(timer); pendente = null;
      const respostas = C.PASSOS_PP.reduce((a, id) => ({ ...a, ...C.patchDoPasso(id, S.profile) }), {} as Record<string, unknown>);
      await api("PATCH", "/api/profile", { data: { ...respostas, dayGym: S.profile.dayGym, meta: S.profile.meta } });
      for (const g of S.gyms.slice(0, 2)) await api("PUT", `/api/gyms/${encodeURIComponent(g.id)}`, { name: g.name, kind: g.kind, equipment: g.equipment, busyHours: g.busyHours });
      await api("PUT", `/api/day-plan/${today}`, { plan, gymId: S.ui.gymId, source: "core" });
      await api("PATCH", "/api/account", { onboarding: "concluido" });
      rascunhoPP.limpar();
    }
    S.onboarding = "concluido"; pp.step = 0; pp.semDor = false; savePP(); salvo = ""; commit(); toast("Semana gerada"); go("#hoje");
  } catch (e) { toast(mensagemErro(e)); setBusy(false); }
}

/** Pular por agora: salva o que já foi respondido (nunca valida o perfil inteiro), marca "pulado" e vai para o Hoje. */
async function pular(passo: string, setBusy: (b: boolean) => void) {
  setBusy(true);
  try {
    await salvarPasso(passo);
    S.profile.meta = { ...S.profile.meta, checkup: "pulado" };
    if (SERVER) { await send("PATCH", "/api/profile", { data: { meta: { checkup: "pulado" } } }); await send("PATCH", "/api/account", { onboarding: "concluido" }); }
    S.onboarding = "concluido"; pp.step = 0; savePP(); salvo = ""; commit(); toast("Sem problema: dá para fazer o checkup depois"); go("#hoje");
  } catch (e) { toast(mensagemErro(e)); setBusy(false); }
}

export default function PrimeirosPassos({ route }: { route: Route }) {
  const [busy, setBusy] = useState(false);
  const [falta, setFalta] = useState<C.Falta[]>([]);
  const n = Number(route.parts[0]);
  const has = Number.isInteger(n) && n >= 0 && n <= LAST;
  const step = has ? n : Math.min(LAST - 1, Math.max(0, pp.step));
  useEffect(() => { if (!has) replace(href("primeiros-passos", [String(step)])); }, [has, step]);
  useEffect(() => { pp.step = step; savePP(); scrollTo(0, 0); }, [step]);
  const P = PASSOS[step], Tela = P.Tela, pct = Math.round(((step + 1) / PASSOS.length) * 100);
  const goto = (i: number) => { void salvarPasso(P.id); go(href("primeiros-passos", [String(i)])); };
  const feito = S.onboarding === "concluido" || !SERVER;
  const porClaude = S.profile.meta?.filledBy === "claude" && !S.profile.meta.confirmed;
  // Continuar pede uma resposta só onde o resto depende dela; "Pular etapa" sempre avança sem responder.
  const blocked = (P.id === "objetivo" && !S.profile.goal?.id) || (P.id === "onde" && !(S.profile.places ?? []).length) || (P.id === "rotina" && !S.profile.daysUsual.length);
  return <div class="pp">
    <div class="pp-top"><button type="button" class="btn" disabled={step === 0} onClick={() => goto(step - 1)} aria-label="Voltar uma pergunta"><Icon id="back" />Voltar</button>
      <span class="small sub num" aria-hidden="true">{step + 1} de {PASSOS.length}</span>
      {feito ? <a class="btn ghost" href="#perfil">Sair</a> : <button type="button" class="btn ghost" disabled={busy} onClick={() => pular(P.id, setBusy)}>Pular por agora</button>}</div>
    <div class="pp-bar" role="progressbar" aria-label="Progresso dos Primeiros passos" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><i style={`width:${pct}%`} /></div>
    <Salvo />
    {porClaude && step === 0 && <div class="note" style="margin-top:14px"><Icon id="chat" /><span>Preenchido pelo Chat. Confira as respostas e siga até o fim para confirmar.</span></div>}
    <h1 class="pp-q">{P.title}</h1><p class="sub pp-sub">{P.sub}</p>
    <div class="pp-body"><Tela /></div>
    {step === LAST && falta.length > 0 && <Faltando itens={falta} />}
    <div class="pp-cta">{step < LAST
      ? <><button type="button" class="btn pri lg full" disabled={blocked} onClick={() => goto(step + 1)}>Continuar<Icon id="arrow" /></button>
        {(blocked || !respondido(P.id)) && <button type="button" class="btn ghost full pp-pular" onClick={() => goto(step + 1)}>Pular etapa</button>}</>
      : <button type="button" class="btn pri lg full" disabled={busy} onClick={() => concluir(setBusy, setFalta)}><Icon id="check" />{busy ? "Gerando…" : "Gerar minha semana e abrir o Hoje"}</button>}
      {blocked && <p class="tiny sub" style="text-align:center;margin-top:6px">{P.id === "rotina" ? "Marque ao menos um dia." : P.id === "objetivo" ? "Escolha um objetivo." : "Escolha onde você treina."}</p>}</div>
  </div>;
}
