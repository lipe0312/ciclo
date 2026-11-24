// #139 Depois de cadastrar a 1ª academia: oferecer "Refazer a semana" na hora, na página do lugar novo. A semana que saiu
// com peso corporal passa a usar os aparelhos dele; a faixa "sem academia" some junto (há uma academia agora).
import { S, commit } from "../../lib/store/index.ts";
import { SERVER } from "../../lib/api/index.ts";
import { Icon } from "../../lib/ui/index.tsx";
import { getSemana, regenerar } from "../semana/estado.ts";

let oferta: string | null = null, refazendo = false;
/** Chame ANTES de salvar um lugar novo: devolve o "depois" que marca a oferta se era o 1º lugar da conta. */
export function antesDoPrimeiro(): (gymId: string) => void {
  const primeiro = SERVER && S.gyms.length === 0 && !!getSemana(); // sem semana (perfil incompleto) não há o que refazer
  return (gymId) => { oferta = primeiro ? gymId : null; refazendo = false; };
}

export function OfertaRefazer({ gymId, nome }: { gymId: string; nome: string }) {
  if (oferta !== gymId) return null;
  const fechar = () => { oferta = null; commit(); };
  const refazer = async () => {
    refazendo = true; commit();
    const ok = await regenerar(false);
    refazendo = false; if (ok) oferta = null; commit();
  };
  return <div class="note lug-refazer" role="status">
    <Icon id="cycle" /><div class="lug-refazer-t">
      <p class="small"><b>Primeiro lugar cadastrado.</b> A semana foi montada sem academia. Refazer agora usa os aparelhos de {nome} nos dias que ainda não passaram.</p>
      <div class="lug-refazer-a">
        <button type="button" class="btn pri" disabled={refazendo} onClick={() => void refazer()}><Icon id="cycle" />{refazendo ? "Refazendo…" : "Refazer a semana"}</button>
        <button type="button" class="btn ghost" disabled={refazendo} onClick={fechar}>Agora não</button></div></div>
  </div>;
}
