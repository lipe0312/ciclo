// "Mais" (celular): os destinos que não cabem na barra inferior.
import { MAIS } from "../../nav.ts";
import { Icon } from "../../lib/ui/index.tsx";
export default function Mais() {
  return <><h1 style="margin-bottom:14px">Mais</h1>
    <nav class="stack" aria-label="Mais">{MAIS.map((d) => <a key={d.id} class="sec" href={`#${d.id}`}><span class="n"><Icon id={d.icon} /></span><span><b>{d.nm}</b></span><Icon id="arrow" /></a>)}</nav></>;
}
