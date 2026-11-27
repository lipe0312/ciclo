// Comida: dia escolhido (hoje ou até 30 dias atrás, #87), registro por voz/texto, o que falta hoje, painel de 7 dias, base de alimentos (#43), metas e calorias adaptativas (#28). Uma peça por arquivo.
import { useEffect, useState } from "preact/hooks";
import { today } from "../../lib/store/index.ts";
import { loadDiet, loadFood } from "../../lib/store/regras.ts";
import { S } from "../../lib/store/index.ts";
import { DiaCard, Registro } from "./registro.tsx";
import { Painel } from "./painel.tsx";
import { Metas } from "./metas.tsx";
import { BaseAlimentos } from "./base.tsx";
import { Ajustes } from "./ajustes.tsx";
import { Metricas } from "./metricas.tsx";
import { SeletorDia } from "./dia.tsx";
import { Icon } from "../../lib/ui/index.tsx";

export default function Comida() {
  const [dia, setDia] = useState(today);
  useEffect(() => { loadFood().then(loadDiet); }, []);
  return <><div class="row between wrapx" style="margin-bottom:14px;gap:12px"><div><p class="kicker">Dieta flexível · modo {S.profile.diet.mode}</p><h1>Comida</h1></div>
      <a class="btn sm" href="#evolucao/comida"><Icon id="spark" />Evolução</a></div>{/* #147 atalho para a aba Comida da Evolução */}
    <div class="grid g2" style="align-items:start">
      <div class="grid"><SeletorDia dia={dia} setDia={setDia} /><Registro dia={dia} /><DiaCard dia={dia} setDia={setDia} /><BaseAlimentos /></div>
      <div class="grid"><Painel /><Metas /><Metricas /><Ajustes /></div>
    </div></>;
}
