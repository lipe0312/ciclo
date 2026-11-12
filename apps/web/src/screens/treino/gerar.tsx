// "Gerar outro treino" (#44): folha com até 4 perguntas de toque, todas opcionais. O core refaz o dia pelo orçamento da
// semana (2× por músculo, sem compensar dobrado); vira uma versão (desfazer volta à anterior, como na Semana).
import { C, S, commit, today } from "../../lib/store/index.ts";
import { gymById, mName } from "../../lib/store/regras.ts";
import { SheetHead, closeSheet, openSheet } from "../../lib/folha/index.tsx";
import { Icon, Seg, Chip, toast } from "../../lib/ui/index.tsx";
import { acaoDia, desfazer, diaDe, getSemana, garantirSemana } from "../semana/estado.ts";
import { diaCurto } from "../semana/folhas.tsx";
import "../semana/semana.css";

interface Rasc { date: string; livres: string[]; estilo: "livre" | "maquina" | null; leve: boolean; adiantar: C.MuscleId | null }
let rasc: Rasc | null = null;
/** versão anterior à última geração de hoje (para o "Desfazer" do Treino); some ao recarregar */
export let anterior: { date: string; version: number } | null = null;

/** Aparelhos que o dia pode usar: os da academia do dia que algum exercício dos grupos do treino precisa. */
export function aparelhosDoDia(groups: C.Group[], equipment: string[]): C.Equipment[] {
  const usa = new Set(C.EXERCISES.filter((e) => groups.includes(C.MUSCLES[e.m].group) && !e.planOff).flatMap((e) => e.eq));
  return C.EQUIPMENT.filter((q) => equipment.includes(q.id) && usa.has(q.id));
}

export function abrirGerarOutro(date: string = today) {
  const d = diaDe(date);
  if (!d) { void garantirSemana().then(() => abrirGerarOutro(date)); return toast("Carregando a semana…"); }
  const gym = gymById(d.gymId)?.equipment ?? [];
  const todos = aparelhosDoDia(d.plan?.groups ?? ["sup", "inf"], gym).map((q) => q.id);
  const o = d.opts;
  rasc = { date, livres: todos.filter((q) => !o.ocupados?.includes(q)), estilo: o.estilo ?? null, leve: !!o.leve, adiantar: o.adiantar ?? null };
  openSheet(() => <Gerar />);
}

async function gerar(todos: string[]) {
  const r = rasc, s = getSemana(); if (!r || !s) return;
  const opts: C.DayOpts = {};
  const ocupados = todos.filter((q) => !r.livres.includes(q));
  if (ocupados.length) opts.ocupados = ocupados;
  if (r.estilo) opts.estilo = r.estilo;
  if (r.leve) opts.leve = true;
  if (r.adiantar) opts.adiantar = r.adiantar;
  const v0 = s.version;
  const ok = await acaoDia(r.date, { action: "outro", opts }, "Treino gerado de novo · dá para desfazer");
  if (!ok) return;
  if (r.date === today) { anterior = { date: r.date, version: v0 }; aplicarHoje(); }
  closeSheet(); commit();
}

/** O treino de hoje passa a ser o da semana nova (antes de começar) ou troca só o que ainda não foi feito (durante). */
export function aplicarHoje() {
  const d = diaDe(today), plan = d?.plan; if (!plan?.items.length) return;
  const ses = S.session;
  if (ses && !ses.finishedAt) {
    const feitos = ses.plan.items.filter((it: C.PlanItem) => (ses.logs[it.exerciseId] ?? []).some((l: { done: boolean }) => l.done) || ses.skipped[it.exerciseId]);
    const musc = new Set(feitos.map((it: C.PlanItem) => it.muscle));
    const ids = new Set(feitos.map((it: C.PlanItem) => it.exerciseId));
    ses.plan = { ...plan, items: [...feitos, ...plan.items.filter((it) => !musc.has(it.muscle) && !ids.has(it.exerciseId))] };
    ses.plan.setsTotal = ses.plan.items.reduce((a: number, it: C.PlanItem) => a + it.sets, 0);
    ses.logs = Object.fromEntries(Object.entries(ses.logs).filter(([id]) => ses.plan.items.some((it: C.PlanItem) => it.exerciseId === id)));
  } else { S.plan = plan; S.ui.locked = true; S.ui.planSource = "semana"; }
  S.ui.swapsToday = {};
}

export async function desfazerGeracao() {
  const a = anterior; if (!a) return;
  if (await desfazer(a.version)) { anterior = null; aplicarHoje(); commit(); }
}

function Gerar() {
  const r = rasc, d = r && diaDe(r.date), s = getSemana();
  if (!r || !d || !s) return null;
  const plan = d.plan;
  const gym = gymById(d.gymId);
  const todos = aparelhosDoDia(plan?.groups ?? ["sup", "inf"], gym?.equipment ?? []);
  const ids = todos.map((q) => q.id);
  const sugerido = plan ? C.sugerirAdiantar(s, plan, S.profile.priorities) : null;
  const doDia = plan ? C.MUSCLE_IDS.filter((m) => (plan.perMuscle[m] ?? 0) > 0 || m === sugerido) : [];
  const up = (p: Partial<Rasc>) => { Object.assign(r, p); commit(); };
  const toggle = (id: string) => up({ livres: r.livres.includes(id) ? r.livres.filter((x) => x !== id) : [...r.livres, id] });
  const ocup = ids.length - ids.filter((q) => r.livres.includes(q)).length;
  return <><SheetHead kicker={`Gerar outro treino · ${r.date === today ? "hoje" : diaCurto(r.date)}`} title={plan?.name ?? "Treino"} />
    <p class="ger-intro tiny sub">Tudo opcional · respeita o volume da semana (2× por músculo, sem dobrar).</p>
    <div class="stack ger">
      {ids.length > 0 && <div><span class="f" id="gLivres">Quais aparelhos estão livres? <span class="sub tiny">desmarque os ocupados{ocup ? ` (${ocup})` : ""}</span></span>
        <div class="chips ger-eq" role="group" aria-labelledby="gLivres">{todos.map((q) => <Chip key={q.id} on={r.livres.includes(q.id)} onClick={() => toggle(q.id)}>{q.nm}</Chip>)}</div></div>}
      <div><span class="f">Estilo</span><Seg opts={[[null, "Tanto faz"], ["livre", "Mais peso livre"], ["maquina", "Mais máquina"]] as [Rasc["estilo"], string][]} value={r.estilo} onPick={(v) => up({ estilo: v })} label="Estilo" /></div>
      <div><span class="f">Intensidade</span><Seg opts={[[false, "Normal"], [true, "Mais leve hoje"]]} value={r.leve} onPick={(v) => up({ leve: v })} label="Intensidade" /></div>
      <div><label class="f" for="gAdi">Aproveitar para adiantar</label>
        <select class="input" id="gAdi" value={r.adiantar ?? ""} onChange={(e) => up({ adiantar: (e.currentTarget.value || null) as C.MuscleId | null })}>
          <option value="">Nenhum</option>{doDia.map((m) => <option key={m} value={m}>{mName(m)}{m === sugerido ? " · atrás na semana (sugerido)" : ""}</option>)}</select></div>
    </div>
    <button type="button" class="btn pri full ger-go" onClick={() => gerar(ids)}><Icon id="cycle" />Gerar outro treino</button></>;
}
