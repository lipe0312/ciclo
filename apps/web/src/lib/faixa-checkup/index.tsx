// Faixa "Não fez o checkup inicial?": discreta, sem modal. Dispensar esconde por 7 dias (neste aparelho); concluir esconde de vez.
// Reaproveitável na Home (#29): <FaixaCheckup />. A regra (estado, 7 dias) vive no core.
import { C, S, commit } from "../store/index.ts";
import { SERVER } from "../api/index.ts";
import { Icon } from "../ui/index.tsx";
import { lsGet, lsSet } from "../util.ts";

const KEY = "ciclo:checkup-ate";
/** Demo (`?demo&pulou`): conta zerada que pulou o checkup. */
const demoPulou = !SERVER && /[?&]pulou\b/.test(location.search);

export const estadoDoCheckup = (): C.EstadoCheckup =>
  demoPulou && S.profile.meta?.checkup !== "feito" ? "pulado" : C.estadoCheckup(!SERVER || S.onboarding === "concluido", S.profile.meta);
export const limparDispensaCheckup = () => lsSet(KEY, null);

export function FaixaCheckup() {
  const est = estadoDoCheckup();
  if (est === "nunca" || !C.mostrarFaixaCheckup(est, lsGet<number | null>(KEY, null), Date.now())) return null;
  return <div class="note" role="status" style="align-items:center;margin-bottom:14px;flex-wrap:wrap">
    <Icon id="info" /><span style="flex:1;min-width:200px">Não fez o checkup inicial? Faça agora <span class="sub">(2 min)</span></span>
    <a class="btn sm pri" href="#primeiros-passos/0">Fazer checkup</a>
    <button type="button" class="iconbtn" aria-label="Dispensar por 7 dias" onClick={() => { lsSet(KEY, C.dispensarCheckup(Date.now())); commit(); }}><Icon id="x" /></button>
  </div>;
}
