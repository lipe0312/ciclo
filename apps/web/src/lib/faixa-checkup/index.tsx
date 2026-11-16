// #63 Cartão "Complete para aprofundar mais" (quem pulou o Perfil de treino): leva ao Perfil de treino, sem modal.
// Dispensar esconde por 7 dias (neste aparelho); concluir esconde de vez. Reaproveitável na Home (#29): <FaixaCheckup />.
// A regra (estado, 7 dias) vive no core.
import { C, S, commit } from "../store/index.ts";
import { SERVER } from "../api/index.ts";
import { Icon } from "../ui/index.tsx";
import { lsGet, lsSet } from "../util.ts";

// Por conta (e-mail), para não vazar entre contas no mesmo aparelho.
const KEY = () => `ciclo:checkup-ate:${SERVER ? S.account?.email ?? "?" : "demo"}`;
/** Demo (`?demo&pulou`): conta zerada que pulou o checkup. */
const demoPulou = !SERVER && /[?&]pulou\b/.test(location.search);

export const estadoDoCheckup = (): C.EstadoCheckup =>
  demoPulou && S.profile.meta?.checkup !== "feito" ? "pulado" : C.estadoCheckup(!SERVER || S.onboarding === "concluido", S.profile.meta);
export const limparDispensaCheckup = () => lsSet(KEY(), null);

export function FaixaCheckup() {
  const est = estadoDoCheckup();
  if (est === "nunca" || !C.mostrarFaixaCheckup(est, lsGet<number | null>(KEY(), null), Date.now())) return null;
  return <section class="card note-checkup" aria-labelledby="aprofundar-t">
    <div class="row start" style="gap:10px"><Icon id="target" style="color:var(--acc);margin-top:2px" />
      <div style="flex:1;min-width:0"><p class="kicker">Perfil de treino</p><h2 id="aprofundar-t" style="margin-top:4px">Complete para aprofundar mais</h2>
        <p class="small sub" style="margin-top:4px">Músculos que mais importam, dores e corpo deixam o treino mais certo para você. Leva 2 min.</p></div></div>
    <div class="row wrapx note-checkup-a"><a class="btn pri" href="#perfil">Completar Perfil de treino</a>
      <button type="button" class="btn ghost" onClick={() => { lsSet(KEY(), C.dispensarCheckup(Date.now())); commit(); }}>Lembrar em 7 dias</button></div>
  </section>;
}
