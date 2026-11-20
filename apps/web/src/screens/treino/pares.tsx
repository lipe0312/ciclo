// #125 "Fazer junto com…": parear ou desparear à mão no treino do dia (supersérie A1/A2). Só oferece quem pode parear
// (C.podeParear: antagonistas, superior × inferior, ombro lateral × braço). Edição manual: a geração não desfaz.
// Baixa só quando abre. A alternância A1 → A2 na sessão vem depois da #122.
import { C, S, commit, today } from "../../lib/store/index.ts";
import { activePlan, dayInput, mName } from "../../lib/store/regras.ts";
import { SERVER, send } from "../../lib/api/index.ts";
import { SheetHead, closeSheet } from "../../lib/folha/index.tsx";
import { toast } from "../../lib/ui/index.tsx";

function aplicar(items: C.PlanItem[], msg: string) {
  const plan = C.resumirDia({ ...activePlan(), items });
  if (S.session && !S.session.finishedAt) S.session.plan = plan; else { S.plan = plan; S.ui.locked = true; S.ui.planSource = "manual"; }
  closeSheet(); commit(); toast(msg);
  if (SERVER) void send("PUT", `/api/day-plan/${today}`, { plan, gymId: S.ui.gymId, source: "manual" }).catch(() => {});
}

export function Pares({ idx }: { idx: number }) {
  const items = activePlan().items, it = items[idx];
  if (!it) return null;
  const eq = dayInput().equipment;
  const parceiro = it.par ? items.find((x, k) => k !== idx && x.par?.[0] === it.par![0]) : undefined;
  const opcoes = items.map((x, k) => ({ x, k })).filter(({ x, k }) => k !== idx && C.podeParear(it.exerciseId, x.exerciseId, eq));
  return <><SheetHead kicker="Supersérie" title={it.nm} />
    <p class="small sub" style="margin:8px 0 6px">Faça uma série de cada, alternando. Só aparecem exercícios que não disputam o mesmo músculo: antagonistas, superior com inferior ou ombro lateral com braço.</p>
    {parceiro && <div class="alt"><span class="badge acc num">{it.par}</span><div><h3>Junto com {parceiro.nm}</h3><p class="tiny sub">{mName(parceiro.muscle)}</p></div>
      <button type="button" class="btn sm" onClick={() => aplicar(C.desparear(items, idx), "Par desfeito")}>Desfazer par</button></div>}
    {opcoes.filter(({ x }) => x !== parceiro).map(({ x, k }) => <div key={x.exerciseId + k} class="alt">
      <span class="badge num">{x.par ?? "—"}</span>
      <div><h3>{x.nm}</h3><p class="tiny sub">{mName(x.muscle)} · {x.sets} séries{x.par ? " · sai do par atual" : ""}</p></div>
      <button type="button" class="btn sm pri" onClick={() => aplicar(C.parear(items, idx, k), `Junto com ${x.nm}`)}>Fazer junto</button></div>)}
    {!opcoes.length && !parceiro && <p class="small" style="margin-top:10px">Nenhum exercício de hoje combina com este sem disputar o mesmo músculo.</p>}</>;
}
