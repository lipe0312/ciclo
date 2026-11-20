// #125 Alternativas do Detalhe: a MESMA lista e ordem da folha Trocar e do ciclo_treino_trocar (C.alternativas: banco fixo da
// mesma porção do músculo, filtrado pela academia do dia, dor e "nunca"). Baixa só quando o Detalhe abre (fora do JS inicial).
import { C, S } from "../../lib/store/index.ts";
import { dayInput, gymById } from "../../lib/store/regras.ts";
import { Card, Icon } from "../../lib/ui/index.tsx";
import { href } from "../../lib/roteador/index.ts";
import { img } from "../../lib/util.ts";

export function AlternativasDetalhe({ id }: { id: string }) {
  const inp = dayInput(), tem = new Set(inp.equipment);
  const alt = C.alternativas(id, inp);
  const gym = gymById(S.ui.gymId);
  if (!alt.mesmaParte.length && !alt.semAparelho.length) return null;
  const parte = alt.parte ? C.SUB_MUSCLES[alt.parte].nm.toLowerCase() : null;
  return <Card><h2>Alternativas</h2>
    {parte && <p class="small sub" style="margin-top:4px">Mesma parte ({parte}), na ordem da melhor troca{gym ? ` em ${gym.name}` : ""}.</p>}
    {alt.mesmaParte.map((a) => <a key={a.ex.id} class="alt altlink" href={href("treino", ["exercicio", a.ex.id])}>
      <img src={img(C.imageSrc(a.ex))} alt="" loading="lazy" width={56} height={56} />
      <div><h3>{a.ex.nm}</h3><p class="tiny sub">{a.motivo}</p>
        {(a.familiar || a.blockedByPain) && <p class="tiny sub alt-meta">{a.familiar && <span class="badge ok">você já faz</span>}{a.blockedByPain && <span class="badge bad">força região com dor</span>}</p>}</div>
      <Icon id="arrow" /></a>)}
    {!alt.mesmaParte.length && <p class="small" style="margin-top:8px">Nenhuma da mesma parte com os aparelhos{gym ? ` de ${gym.name}` : ""}.</p>}
    {alt.semAparelho.length > 0 && <><h3 class="kicker" style="margin-top:14px">Precisa de aparelho</h3>
      <ul class="small sub" style="margin:6px 0 0;padding-left:18px;display:grid;gap:4px">{alt.semAparelho.map((e) => <li key={e.id}>{e.nm} <span class="tiny">({e.eq.filter((q) => !tem.has(q)).map((q) => C.EQUIPMENT_BY_ID[q]?.nm ?? q).join(", ")})</span></li>)}</ul></>}
  </Card>;
}
