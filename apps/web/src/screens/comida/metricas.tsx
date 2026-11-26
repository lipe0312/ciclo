// #115 Comida > Configurações de métricas: por refeição, completar com a média quando faltar; dia sem nada fora da média
// (padrão) ou como 0. A conta é do core (diaComMedias); aqui só a escolha e a explicação do que entra.
import { MEALS, MEAL_NM } from "@ciclo/core";
import type { Meal } from "@ciclo/core";
import { DIA_VAZIO, DIA_VAZIO_NM } from "@ciclo/core/comida-medias";
import type { DiaVazio } from "@ciclo/core/comida-medias";
import { oQueEntra, regras, salvarMedias } from "./medias.ts";
import { Card, Chip, Seg, toast } from "../../lib/ui/index.tsx";

export function Metricas() {
  const r = regras();
  const salvar = (patch: Parameters<typeof salvarMedias>[0]) => salvarMedias(patch).then((ok) => toast(ok ? "Ajuste salvo" : "Não deu para salvar agora. Tente de novo."));
  return <Card>
    <p class="kicker">Configurações de métricas</p>
    <h2 style="margin-top:6px">O que entra na média</h2>
    <p class="small sub" style="margin:4px 0 10px">Refeição sem registro num dia com registro: completar com a média dela?</p>
    <div class="chips" role="group" aria-label="Completar com a média">
      {MEALS.map((m: Meal) => <Chip key={m} on={r.completar[m]} label={`${MEAL_NM[m]}: ${r.completar[m] ? "completa com a média" : "não completa"}`} onClick={() => salvar({ completar: { [m]: !r.completar[m] } })}>{MEAL_NM[m]}</Chip>)}
    </div>
    <p class="small sub" style="margin:14px 0 6px">Dia sem nenhum registro:</p>
    <Seg label="Dia sem nenhum registro" opts={DIA_VAZIO.map((x): [DiaVazio, string] => [x, DIA_VAZIO_NM[x]])} value={r.diaVazio} onPick={(x) => salvar({ diaVazio: x })} />
    <p class="tiny sub" style="margin-top:8px">{oQueEntra()} Vale para calorias e proteína no painel da semana.</p>
  </Card>;
}
