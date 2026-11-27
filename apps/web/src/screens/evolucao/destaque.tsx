// #147 Destaque da Home quando há conquista nova no mês (na direção do objetivo; nunca bronca). Baixa à parte do JS inicial
// (que está no teto). "Nova" = ainda não vista neste aparelho: abrir a Evolução no Mês ou tocar em "Dispensar" tira daqui.
import { useEffect, useState } from "preact/hooks";
import type { Conquista } from "@ciclo/core/evolucao";
import { Card, Icon } from "../../lib/ui/index.tsx";
import { carregarEvolucao, marcarVistas, vistas } from "./estado.ts";
import "./evolucao.css";

export default function Destaque() {
  const [cs, setCs] = useState<Conquista[]>([]);
  useEffect(() => {
    let vivo = true;
    void carregarEvolucao("mes").then((r) => { if (vivo && r.ok) { const vs = vistas(); setCs(r.view.conquistas.filter((c) => !vs.includes(c.id))); } });
    return () => { vivo = false; };
  }, []);
  if (!cs.length) return null;
  const dispensar = () => { marcarVistas(cs.map((c) => c.id)); setCs([]); };
  return <Card cls="hl evo-dest" aria-label="Conquista nova"><div class="row start"><Icon id="spark" style="color:var(--acc);margin-top:2px;flex:none" /><div style="flex:1;min-width:0">
    <p class="kicker">{cs.length === 1 ? "Conquista nova" : `${cs.length} conquistas novas`} · este mês</p>
    <ul>{cs.slice(0, 2).map((c) => <li class="small" key={c.id}>{c.texto}</li>)}</ul>
    {cs.length > 2 && <p class="tiny sub" style="margin-top:2px">e mais {cs.length - 2} na Evolução</p>}
    <div class="row wrapx" style="gap:8px;margin-top:10px"><a class="btn pri" href={`#evolucao/${cs[0].aba}?p=mes`}>Ver na Evolução<Icon id="arrow" /></a>
      <button type="button" class="btn ghost" onClick={dispensar}>Dispensar</button></div>
  </div></div></Card>;
}
