// #74 Folha Trocar: só a mesma subparte; "outra parte do músculo" com aviso (a semana repõe).
// #125 a lista é a do banco fixo (C.alternativas), a mesma do Detalhe e do ciclo_treino_trocar, com o motivo de cada troca.
import { useState } from "preact/hooks";
import { C, S, commit } from "../../lib/store/index.ts";
import { EXB, activePlan, dayInput, gymById, mName, profileChanged } from "../../lib/store/regras.ts";
import { SheetHead, closeSheet } from "../../lib/folha/index.tsx";
import { Icon, toast } from "../../lib/ui/index.tsx";
import { img } from "../../lib/util.ts";

/** #74 `outra`: troca para outra parte do músculo. Só vale hoje (não fixa "sempre"); a semana repõe a parte que saiu. */
function pickSwap(idx: number, to: string, scope: "hoje" | "sempre", outra = false) {
  const plan = activePlan(), it = plan.items[idx], ex = EXB[to];
  if (scope === "sempre" && !outra) { S.profile.pinned[it.muscle] = to; profileChanged(); }
  const troca = () => { plan.items[idx] = { ...it, exerciseId: to, nm: ex.nm, kind: ex.kind, reps: ex.r, rest: ex.rest, alts: it.alts.filter((x) => x !== to).concat(it.exerciseId) }; };
  if (S.session && !S.session.finishedAt) troca();
  else if (outra) { troca(); S.ui.locked = true; S.ui.planSource = "manual"; } // outro músculo: o "fixar por músculo" não serve
  else { S.ui.swapsToday[it.muscle] = to; S.ui.locked = false; }
  closeSheet(); commit(); toast(scope === "sempre" ? "Trocado no plano (sempre)" : outra ? "Trocado só hoje · a semana repõe a parte que saiu" : "Trocado só hoje");
}
/** Bolinhas de eficiência (●●○) com o número escrito para leitor de tela. */
export const Bolinhas = ({ n }: { n: number }) => <span class="ef-dots" role="img" aria-label={`eficiência ${n} de 3`}>{[1, 2, 3].map((k) => <i key={k} class={k <= n ? "on" : ""} />)}</span>;
function AltItem({ a, idx, outra }: { a: C.Alternativa; idx: number; outra?: boolean }) {
  const e = a.ex, parte = C.partePrincipal(e);
  return <div class="alt" style={a.blockedByPain ? "opacity:.5" : ""}>
    <img src={img(e.id)} alt="" loading="lazy" width={56} height={56} />
    <div><h3>{e.nm}</h3><p class="tiny sub">{a.motivo}</p>
      <p class="tiny sub alt-meta">{a.familiar && <span class="badge ok">você já faz</span>}<Bolinhas n={a.nota} />{parte ? <span>{C.parteCurta(parte)}</span> : null}<span>{e.r.join("–")} reps</span>{S.media[e.id] ? <span>você tem vídeo</span> : null}{a.blockedByPain ? <span>força região com dor</span> : null}</p></div>
    {a.blockedByPain ? <span class="badge bad">dor</span> : outra
      ? <button type="button" class="btn sm" onClick={() => pickSwap(idx, e.id, "hoje", true)}>Só hoje</button>
      : <div class="row" style="gap:6px"><button type="button" class="btn sm" onClick={() => pickSwap(idx, e.id, "hoje")}>Hoje</button><button type="button" class="btn sm pri" onClick={() => pickSwap(idx, e.id, "sempre")}>Sempre</button></div>}
  </div>;
}
export function Swap({ idx }: { idx: number }) {
  const [outra, setOutra] = useState(false);
  const plan = activePlan(), it = plan.items[idx];
  if (!it) return null;
  const gym = gymById(S.session?.gymId ?? S.ui.gymId);
  const alt = C.alternativas(it.exerciseId, dayInput());
  const parteNm = alt.parte ? C.SUB_MUSCLES[alt.parte].nm : mName(it.muscle);
  return <><SheetHead kicker={`Trocar · ${parteNm}`} title={it.nm} />
    <p class="small sub" style="margin:8px 0 6px">Mesma parte do músculo ({parteNm.toLowerCase()}), da melhor troca para baixo; o que você já faz sobe. Só aparelho de {gym.name}; dor e "nunca" já contam.</p>
    {alt.mesmaParte.length ? alt.mesmaParte.map((a) => <AltItem key={a.ex.id} a={a} idx={idx} />) : <p class="small" style="margin:10px 0">Sem outra opção para {parteNm.toLowerCase()} com os aparelhos de {gym.name}.</p>}
    {alt.outraParte.length > 0 && (!outra
      ? <button type="button" class="link44 alt-outra" aria-expanded={false} onClick={() => setOutra(true)}>Trocar por outra parte do músculo</button>
      : <><div class="note warn" role="note" style="margin-top:12px"><Icon id="warn" /><span>Isso não trabalha {parteNm.toLowerCase()}. A semana vai repor essa parte em outro dia.</span></div>
        {alt.outraParte.map((a) => <AltItem key={a.ex.id} a={a} idx={idx} outra />)}</>)}
    {alt.semAparelho.length > 0 && <><h3 class="kicker" style="margin-top:14px">Precisa de aparelho</h3><p class="tiny sub" style="margin-top:4px">Não tem em {gym.name}: {alt.semAparelho.map((e) => e.nm).join(", ")}</p></>}</>;
}

