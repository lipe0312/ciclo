// "O que você não está registrando" (#29): até 5 lacunas pelo impacto no objetivo (core: gaps), cada uma com CTA de 1 toque.
import * as C from "@ciclo/core";
import { Card, Icon } from "../../lib/ui/index.tsx";

export function Lacunas({ gaps }: { gaps: C.Gap[] }) {
  if (!gaps.length) return <Card><div class="row start"><Icon id="check" style="color:var(--ok);margin-top:2px" /><div><h2>Registros em dia</h2>
    <p class="small sub" style="margin-top:4px">Medidas, peso, comida e check-in estão recentes. É isso que faz o Claude acertar o seu plano.</p></div></div></Card>;
  return <Card cls="hm-painel"><div class="row between wrapx" style="gap:8px"><h2>O que você não está registrando</h2><span class="badge warn num">{gaps.length}</span></div>
    <p class="small sub" style="margin:4px 0 6px">Do que mais pesa no seu objetivo para o que menos pesa.</p>
    <ol class="hm-gaps">{gaps.map((g) => <li key={g.id}><span class="hm-gap-t">{g.texto}</span><a class="btn sm" href={g.href}>{g.cta}</a></li>)}</ol>
  </Card>;
}
