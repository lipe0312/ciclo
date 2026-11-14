// Caixa de pedidos ao Chat (connector MCP). No demo, respostas ilustrativas; no servidor, o Chat responde ao processar a caixa.
import { C, S, commit, today, loadServer } from "../../lib/store/index.ts";
import { FOCUS, EXB, activePlan, addFood, addPain, computePlan, dayInput, estimateFood, foodTotals, mName } from "../../lib/store/regras.ts";
import { SERVER, send } from "../../lib/api/index.ts";
import { Card, Chip, Icon, Seg, toast } from "../../lib/ui/index.tsx";
import { Mic } from "../../lib/voz/index.tsx";
import { clone, fmt, uid } from "../../lib/util.ts";
import { loadClaude } from "./memoria.tsx";

export const CATS = ["Hoje", "Treino", "Corpo", "Comida", "Plano"];
type Tier = keyof typeof C.TIER_INFO;

function demoAnswer(m: any): { response: string; change?: any } {
  const t = m.text.toLowerCase();
  const plan = computePlan();
  const firstMuscle = (re: string) => ([["ombro", /ombro/], ["bracos", /braç|brac|bíceps|tríceps/], ["peito", /peito/], ["costas", /costa/], ["pernas", /perna|coxa|glúteo/]] as [string, RegExp][]).find(([, r]) => r.test(re))?.[0];
  switch (m.action) {
    case "pouco_tempo": { const min = Number(t.match(/(\d+)\s?min/)?.[1] ?? (/dormi/.test(t) ? S.ui.minutes : 40)); const ch = /dormi/.test(t) ? { mode: "expresso" } : { minutes: Math.max(20, Math.min(90, min)) };
      return { response: /dormi/.test(t) ? "Sono curto: mantive só as prioridades com menos séries. Carga normal, sem buscar recorde." : `Cortei para caber em ${(ch as any).minutes} min mantendo ombro e braços.`, change: ch }; }
    case "academia_cheia": return { response: "Troquei o que depende de polia e rack por halteres e máquinas que costumam estar livres.", change: { crowded: true } };
    case "foco_musculo": { const f = firstMuscle(t) ?? "ombro"; return { response: `Hoje abre com ${FOCUS.find((x) => x[0] === f)![1].toLowerCase()} (≥ 4 séries). O resto da semana se reorganiza sozinho.`, change: { focus: f } }; }
    case "compensatorio": return { response: "Montei o corpo inteiro compensatório: prioridades primeiro, pernas com 2 séries cada para garantir a 2ª frequência.", change: { mode: "compensatorio" } };
    case "trocar_academia": { const g = S.gyms.find((x) => x.id !== S.ui.gymId)!; return { response: `Refeito com os aparelhos de ${g.name}.`, change: { gymId: g.id } }; }
    case "trocar_exercicio": { const it = plan.items.find((i) => i.alts.length); if (!it) return { response: "Não achei troca disponível." };
      return { response: `Troque ${it.nm} por ${EXB[it.alts[0]].nm}: mesmo músculo, aparelho diferente. Vale só hoje.`, change: { swap: { muscle: it.muscle, to: it.alts[0] } } }; }
    case "nao_gostei": return { response: "Virei em superséries (pares de músculos diferentes, 15 s entre eles). Mesmo volume, menos tempo parado.", change: { format: "superserie" } };
    case "dor": { const region = /escápula|escapula/.test(t) ? (/direit/.test(t) ? "escapula_d" : "escapula_e") : /lombar/.test(t) ? "lombar" : /joelho/.test(t) ? "joelho_d" : "ombro_d";
      return { response: `Registrei dor (${C.REGION_BY_ID[region].nm}, média). Saem os exercícios que forçam a região e entra fortalecimento no aquecimento. Se persistir por mais de 1–2 semanas ou for forte, procure um fisioterapeuta.`, change: { pain: { region, intensity: 2 } } }; }
    case "registrar_comida": { const tot = estimateFood(m.text); return { response: tot.kcal ? `Estimativa: ~${fmt(tot.kcal)} kcal e ${fmt(tot.prot)} g de proteína. Faltam ~${fmt(Math.max(0, S.profile.diet.protein - foodTotals(today).prot - tot.prot))} g de proteína hoje.` : "Me diga o que comeu e eu estimo pela tabela TACO.", change: tot.kcal ? { food: m.text } : null }; }
    case "registrar_treino": return { response: "Registrado no treino de hoje.", change: null };
    case "explicar": { const it = plan.items[0]; return { response: `${it.nm}: ${EXB[it.exerciseId]?.stretch ? "trabalha o músculo alongado, o que tende a dar mais hipertrofia; " : ""}é prioridade (${mName(it.muscle)}) e cabe nos aparelhos de hoje.`, change: null }; }
    case "revisao_semana": return { response: `Semana em ${plan.weekClosePct}%: ${C.MUSCLE_IDS.filter((x) => (S.week.freq[x] ?? 0) >= 2).length} músculos com 2×. Sono abaixo de 7 h em ${Object.values(S.week.checkins).filter((c: any) => c.sleepH < 7).length} dia(s). Sugestões: 1) manter +1 série de tríceps (pouca dor, progrediu); 2) proteína: 1 whey extra nos dias sem almoço com carne.`, change: null };
    default: return { response: "Entendi. Vou considerar isso na revisão de domingo.", change: null };
  }
}
export function applyChangeTo(ui: typeof S.ui, ch: any, extraPains: any[], preview: boolean) {
  if (ch.minutes) ui.minutes = ch.minutes;
  if (ch.crowded != null) ui.crowded = ch.crowded;
  if (ch.focus) ui.focus = FOCUS.find((f) => f[0] === ch.focus)?.[2] ?? [];
  if (ch.mode) ui.mode = ch.mode;
  if (ch.gymId) ui.gymId = ch.gymId;
  if (ch.format) ui.format = ch.format;
  if (ch.swap) ui.swapsToday = { ...ui.swapsToday, [ch.swap.muscle]: ch.swap.to };
  if (ch.pain) { if (preview) extraPains.push(ch.pain); else addPain({ ...ch.pain, kind: "muscular", context: "pelo Chat" }); }
  if (ch.food && !preview) addFood(ch.food);
  ui.locked = false;
}
function previewDiff(ch: any) {
  if (!ch) return null;
  const ui = clone(S.ui), extra: any[] = [];
  applyChangeTo(ui, ch, extra, true);
  const before = computePlan(), after = C.planDay(dayInput(ui, extra));
  const key = (i: C.PlanItem) => `${i.nm} ${i.sets}×`;
  const b = new Set(before.items.map(key)), a = new Set(after.items.map(key));
  const out: { minus?: string; plus?: string }[] = [];
  before.items.filter((i) => !a.has(key(i))).forEach((i) => out.push({ minus: key(i) }));
  after.items.filter((i) => !b.has(key(i))).forEach((i) => out.push({ plus: key(i) }));
  after.prehab.filter((p) => !before.prehab.some((x) => x.exerciseId === p.exerciseId)).forEach((p) => out.push({ plus: `${p.nm} 2× (aquecimento)` }));
  if (ch.format) out.push({ plus: `formato: ${ch.format === "superserie" ? "superséries" : ch.format}` });
  out.push({ plus: `${before.setsTotal} → ${after.setsTotal} séries · ~${after.estMinutes} min` });
  return out.slice(0, 9);
}

export async function sendInbox(text: string, promptId?: string) {
  text = text.trim(); if (!text) return toast("Escreva ou fale o pedido");
  const preset = C.PROMPTS.find((p) => p.id === promptId);
  const cls = C.classify(text);
  const m: any = { id: uid(), created_at: Date.now(), text, action: preset?.action ?? cls.action, tier: S.ui.tierOverride ?? preset?.tier ?? cls.tier, status: "pendente" };
  S.inbox.unshift(m); S.ui.inboxDraft = ""; S.ui.tierOverride = null; commit();
  if (SERVER) {
    // #66: a regra (ou a API paga, se ligada) pode responder na hora; senão fica na fila para a rotina/conexão
    const r = await send<{ id: string; status?: string; response?: string; change?: unknown; cerebro?: string }>("POST", "/api/inbox", { text, promptId, tier: m.tier, date: today }).catch(() => null);
    if (r) m.id = r.id;
    if (r?.status === "respondido") { Object.assign(m, { status: "respondido", response: r.response, change: r.change ?? null, cerebro: r.cerebro }); commit(); toast("Respondido"); }
    else toast(`Na fila · ${C.TIER_INFO[m.tier as Tier].nm}`);
    loadClaude(); return;
  }
  setTimeout(() => { const a = demoAnswer(m); m.response = a.response; m.change = a.change ? { ...a.change, diff: previewDiff(a.change) } : null; m.status = a.change ? "respondido" : "aplicado"; commit(); }, 900);
}

function applyInbox(m: any) {
  if (!m?.change) return;
  if (m.change.salvo) { S.ui.locked = false; loadServer().then(commit).catch(() => {}); } else applyChangeTo(S.ui, m.change, [], false);
  m.status = "aplicado"; commit(); toast("Aplicado ao treino de hoje");
  send("POST", `/api/inbox/${m.id}/status`, { status: "aplicado" }).catch(() => {});
}
function dropInbox(m: any) { m.status = "descartado"; commit(); send("POST", `/api/inbox/${m.id}/status`, { status: "descartado" }).catch(() => {}); }

/** "Continuar no Chat": abre o claude.ai com o pedido e o tipo de contexto já escritos (conversa em tempo real pelo connector). */
export const Continuar = ({ m }: { m: { text: string; action?: string; tier?: string } }) =>
  <a class="btn ghost sm" href={C.linkContinuar({ texto: m.text, acao: m.action, tier: m.tier })} target="_blank" rel="noopener noreferrer"><Icon id="chat" />Continuar no Chat</a>;

export function InboxItem({ m }: { m: any }) {
  const diff: { minus?: string; plus?: string }[] | null = m.change?.diff ?? (m.change?.itens ? m.change.itens.map((t: string) => ({ plus: t })) : null);
  return <div><div class="msg me small"><b>Você</b> <span class={`tier ${m.tier}`}>{C.TIER_INFO[m.tier as Tier]?.nm ?? m.tier}</span><br />{m.text}</div>
    {m.response ? <div class="msg small" style="margin-top:6px"><b>{m.cerebro === "regra" ? "Ciclo (regra, sem IA):" : m.cerebro === "openai-api" ? "IA de reserva:" : "Chat:"}</b> {m.response}
      {!!diff?.length && <div class="diff">{diff.map((d, i) => <div key={i}>{d.minus && <div class="minus">− {d.minus}</div>}{d.plus && <div class="plus">+ {d.plus}</div>}</div>)}</div>}
      {m.status === "respondido" && m.change && <div class="row" style="margin-top:8px;gap:6px"><button type="button" class="btn pri sm" onClick={() => applyInbox(m)}><Icon id="check" />Aplicar</button><button type="button" class="btn sm" onClick={() => dropInbox(m)}>Descartar</button></div>}
      {m.status === "aplicado" && <p class="tiny sub" style="margin-top:6px"><Icon id="check" style="width:12px;height:12px" /> aplicado</p>}
    </div> : <div class="row between wrapx" style="margin-top:4px;row-gap:4px"><p class="tiny sub"><Icon id="clock" style="width:12px;height:12px;vertical-align:-2px" /> {SERVER ? "na fila — o Chat responde quando processar a caixa" : "pensando…"}</p>
      <Continuar m={m} /></div>}</div>;
}

export function CaixaClaude({ limit = 6 }: { limit?: number }) {
  void activePlan;
  const ps = C.PROMPTS.filter((p) => p.cat === S.ui.promptCat);
  const draft = S.ui.inboxDraft ?? "";
  const cls = draft ? C.classify(draft) : null;
  const tier = (S.ui.tierOverride ?? cls?.tier ?? S.profile.tiers[S.ui.promptCat]) as Tier;
  const setDraft = (v: string) => { S.ui.inboxDraft = v; commit(); };
  return <Card><div class="row between wrapx"><h2>Pedir ao Chat</h2><span class="badge">connector · sua assinatura</span></div>
    <p class="small sub" style="margin:4px 0 10px">Toque num pedido pronto ou escreva/fale. A resposta volta aqui com a mudança para aplicar.</p>
    <div class="tabs">{CATS.map((c) => <Chip key={c} on={S.ui.promptCat === c} onClick={() => { S.ui.promptCat = c; commit(); }}>{c}</Chip>)}</div>
    <div class="chips" style="margin-top:8px">{ps.map((p) => <button type="button" key={p.id} class="chip" onClick={() => sendInbox(p.text, p.id)}>{p.label} <span class={`tier ${p.tier}`}>{C.TIER_INFO[p.tier].nm}</span></button>)}</div>
    <div class="row start" style="margin-top:10px;gap:8px"><textarea class="input" id="inboxTxt" rows={2} aria-label="Pedido ao Chat" placeholder="ex.: hoje quero treinar ombro e tenho 45 min" value={draft}
      onInput={(e) => { S.ui.inboxDraft = e.currentTarget.value; }} onBlur={() => commit()} />
      <Mic value={draft} onChange={setDraft} label="Falar o pedido" /></div>
    <div class="row between wrapx" style="margin-top:8px;row-gap:8px"><div class="row small" style="gap:6px">Modelo:
      <Seg opts={(["haiku", "sonnet", "opus"] as Tier[]).map((t) => [t, C.TIER_INFO[t].nm] as [Tier, string])} value={tier} onPick={(t) => { S.ui.tierOverride = t; commit(); }} label="Modelo" /></div>
      <button type="button" class="btn pri sm" onClick={() => sendInbox(S.ui.inboxDraft)}><Icon id="send" />Enviar</button></div>
    <p class="tiny sub" style="margin-top:6px">{C.TIER_INFO[tier].why}{cls ? ` · detectado: ${cls.action.replace(/_/g, " ")}` : ""}</p>
    <hr /><div class="thread">{S.inbox.slice(0, limit).map((m) => <InboxItem key={m.id} m={m} />)}{!S.inbox.length && <p class="small sub">Nenhum pedido ainda.</p>}</div></Card>;
}
