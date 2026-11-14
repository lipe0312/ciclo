// "Mais" (celular): os destinos que não cabem na barra inferior.
// #71 Com os Primeiros passos pendentes, o resto do app ainda não abre: o ⋯ mostra só o que abre (voltar ao checkup e Conta).
import { MAIS } from "../../nav.ts";
import { S } from "../../lib/store/index.ts";
import { SERVER } from "../../lib/api/index.ts";
import { Icon } from "../../lib/ui/index.tsx";

const Item = ({ to, icon, nm, desc }: { to: string; icon: string; nm: string; desc?: string }) =>
  <a class="sec" href={to}><span class="n"><Icon id={icon} /></span><span><b>{nm}</b>{desc && <span class="small sub" style="display:block">{desc}</span>}</span><Icon id="arrow" /></a>;

export default function Mais() {
  if (SERVER && S.onboarding === "pendente") return <><h1 style="margin-bottom:14px">Mais</h1>
    <p class="small sub" style="margin-bottom:12px">O resto do app abre quando você terminar ou pular os Primeiros passos.</p>
    <nav class="stack" aria-label="Mais"><Item to="#primeiros-passos" icon="target" nm="Primeiros passos" desc="continuar de onde parou" /><Item to="#conta" icon="key" nm="Conta" /></nav></>;
  return <><h1 style="margin-bottom:14px">Mais</h1>
    <nav class="stack" aria-label="Mais">{MAIS.map((d) => <Item key={d.id} to={`#${d.id}`} icon={d.icon} nm={d.nm} />)}</nav></>;
}
