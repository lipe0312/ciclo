// Faixa "Não fez o checkup inicial?": discreta, sem modal. Dispensar esconde por 7 dias (neste aparelho); concluir esconde de vez.
// Reaproveitável na Home (#29): <FaixaCheckup />. A regra (estado, 7 dias) vive no core.
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
  return <div class="note note-checkup" role="status">
    <Icon id="info" /><span class="note-checkup-t">Não fez o checkup inicial? Faça agora <span class="sub">(2 min)</span></span>
    <a class="btn sm pri" href="#primeiros-passos/0">Fazer checkup</a>
    <button type="button" class="btn sm ghost" onClick={() => { lsSet(KEY(), C.dispensarCheckup(Date.now())); commit(); }}>Dispensar (7 dias)</button>
  </div>;
}
