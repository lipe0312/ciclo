// Tela ainda vazia (outra issue preenche). Mantém a rota e o lugar na navegação.
import { Icon } from "../lib/ui/index.tsx";
export const Placeholder = ({ kicker, title, text, icon }: { kicker: string; title: string; text: string; icon: string }) =>
  <><p class="kicker">{kicker}</p><h1 style="margin-bottom:14px">{title}</h1>
    <div class="card"><div class="row start"><Icon id={icon} style="color:var(--acc);margin-top:2px" /><div><p>{text}</p><p class="small sub" style="margin-top:6px">Em construção.</p></div></div></div></>;
