// Pedidos da rotina (caixa do connector MCP): enviar, aplicar e cancelar. No demo, respostas ilustrativas; no servidor, a IA
// responde ao processar a caixa. #134: a tela é o Chat (index.tsx); aqui fica só a lógica, sem link direto para IA externa.
import { C, S, calc, commit, today, loadServer } from "../../lib/store/index.ts";
import { FOCUS, EXB, addFood, addPain, computePlan, dayInput, estimateFood, foodTotals, mName } from "../../lib/store/regras.ts";
import { SERVER, send } from "../../lib/api/index.ts";
import { toast } from "../../lib/ui/index.tsx";
import { clone, fmt, uid } from "../../lib/util.ts";
import { loadClaude } from "./memoria.tsx";

/** Categorias de pedido (modelo por tipo, em Perfil → Como o Chat trabalha com você). */
export const CATS = ["Hoje", "Treino", "Corpo", "Comida", "Plano"];
export const hhmm = (ms: number) => new Date(ms).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

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
    case "registrar_comida": { const tot = estimateFood(m.text); return { response: tot.kcal ? `Estimativa: ~${fmt(tot.kcal)} kcal e ${fmt(tot.prot)} g de proteína. Faltam ~${fmt(Math.max(0, calc().diet.protein - foodTotals(today).prot - tot.prot))} g de proteína hoje.` : "Me diga o que comeu e eu estimo pela tabela TACO.", change: tot.kcal ? { food: m.text } : null }; }
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

/** Manda um pedido para a rotina. Devolve o pedido criado (no aparelho), ou null se o texto está vazio. */
export async function sendInbox(text: string, promptId?: string): Promise<any | null> {
  text = text.trim(); if (!text) { toast("Escreva ou fale o pedido"); return null; }
  const preset = C.PROMPTS.find((p) => p.id === promptId);
  const cls = C.classify(text);
  const m: any = { id: uid(), created_at: Date.now(), text, action: preset?.action ?? cls.action, tier: S.ui.tierOverride ?? preset?.tier ?? cls.tier, status: "pendente" };
  S.inbox.unshift(m); S.ui.inboxDraft = ""; S.ui.tierOverride = null; commit();
  if (SERVER) {
    // #66: a regra (ou a API paga, se ligada) pode responder na hora; senão fica na fila para a rotina/conexão
    const r = await send<{ id: string; status?: string; response?: string; change?: unknown; cerebro?: string }>("POST", "/api/inbox", { text, promptId, tier: m.tier, date: today }).catch(() => null);
    if (r) m.id = r.id;
    if (r?.status === "respondido") { Object.assign(m, { status: "respondido", response: r.response, change: r.change ?? null, cerebro: r.cerebro }); commit(); toast("Respondido"); }
    else toast("Na fila");
    loadClaude(); return m;
  }
  setTimeout(() => { if (m.status !== "pendente") return; const a = demoAnswer(m); m.response = a.response; m.change = a.change ? { ...a.change, diff: previewDiff(a.change) } : null; m.status = a.change ? "respondido" : "aplicado"; commit(); }, 900);
  return m;
}

export function applyInbox(m: any) {
  if (!m?.change) return;
  if (m.change.salvo) { S.ui.locked = false; loadServer().then(commit).catch(() => {}); } else applyChangeTo(S.ui, m.change, [], false);
  m.status = "aplicado"; commit(); toast("Aplicado ao treino de hoje");
  send("POST", `/api/inbox/${m.id}/status`, { status: "aplicado" }).catch(() => {});
}
export function dropInbox(m: any) { m.status = "descartado"; commit(); send("POST", `/api/inbox/${m.id}/status`, { status: "descartado" }).catch(() => {}); }
