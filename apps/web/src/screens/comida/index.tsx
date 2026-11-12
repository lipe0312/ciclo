// Comida: registro por voz/texto, painel de 7 dias, metas e calorias adaptativas (#28). Uma peça por arquivo.
import { useEffect, useState } from "preact/hooks";
import { today } from "../../lib/store/index.ts";
import { loadDiet, loadFood } from "../../lib/store/regras.ts";
import { S } from "../../lib/store/index.ts";
import { DiaCard, Registro } from "./registro.tsx";
import { Painel } from "./painel.tsx";
import { Metas } from "./metas.tsx";

export default function Comida() {
  const [dia, setDia] = useState(today);
  useEffect(() => { loadFood().then(loadDiet); }, []);
  return <><p class="kicker">Dieta flexível · modo {S.profile.diet.mode}</p><h1 style="margin-bottom:14px">Comida</h1>
    <div class="grid g2" style="align-items:start">
      <div class="grid"><Registro dia={dia} /><DiaCard dia={dia} setDia={setDia} /></div>
      <div class="grid"><Painel /><Metas /></div>
    </div></>;
}
