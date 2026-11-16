// Grade de aparelhos com imagens (Academias, Primeiros passos). Seleção múltipla controlada por fora.
import * as C from "@ciclo/core";
import { useState } from "preact/hooks";
import { Icon } from "../ui/index.tsx";

const CAT_ICONE: Record<string, string> = { livres: "dumb", cabos: "swap", maquinas: "gym", corpo: "body", cardio: "run" };
/** Ilustração do aparelho (SVG do projeto); sem foto, ou se falhar o carregamento, mostra o ícone da categoria, nunca foto de exercício. */
export function FotoAparelho({ eq, w = 320, h = 240 }: { eq: C.Equipment; w?: number; h?: number }) {
  const [erro, setErro] = useState(false);
  return erro || !eq.foto ? <span class="eq-ph" role="img" aria-label={`${eq.nm}: sem ilustração`}><Icon id={CAT_ICONE[eq.cat] ?? "dumb"} /></span>
    : <span class="ap-box"><img class="ap-img" src={eq.foto} alt={eq.nm} loading="lazy" width={w} height={h} onError={() => setErro(true)} /></span>;
}
export const EQ_CATS: [string, string][] = [["todos", "Todos"], ["livres", "Pesos livres"], ["cabos", "Cabos"], ["maquinas", "Máquinas"], ["corpo", "Peso corporal"], ["cardio", "Cardio"]];
export function GradeAparelhos({ selected, onToggle, cat = "todos" }: { selected: string[]; onToggle: (id: string) => void; cat?: string }) {
  return <div class="eqgrid">{C.EQUIPMENT.filter((e) => cat === "todos" || e.cat === cat).map((e) =>
    <button type="button" class="eq" key={e.id} aria-pressed={selected.includes(e.id)} onClick={() => onToggle(e.id)}>
      <FotoAparelho eq={e} /><span class="ckm"><Icon id="check" /></span><span class="nm">{e.nm}</span>
    </button>)}</div>;
}
