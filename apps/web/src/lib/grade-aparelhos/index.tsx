// Grade de aparelhos com imagens (Academias, Primeiros passos). Seleção múltipla controlada por fora.
import * as C from "@ciclo/core";
import { Icon } from "../ui/index.tsx";
import { img } from "../util.ts";

export const EQ_CATS: [string, string][] = [["todos", "Todos"], ["livres", "Pesos livres"], ["cabos", "Cabos"], ["maquinas", "Máquinas"], ["corpo", "Peso corporal"], ["cardio", "Cardio"]];
export function GradeAparelhos({ selected, onToggle, cat = "todos" }: { selected: string[]; onToggle: (id: string) => void; cat?: string }) {
  return <div class="eqgrid">{C.EQUIPMENT.filter((e) => cat === "todos" || e.cat === cat).map((e) =>
    <button type="button" class="eq" key={e.id} aria-pressed={selected.includes(e.id)} onClick={() => onToggle(e.id)}>
      <img src={img(e.img)} alt="" loading="lazy" width={320} height={240} /><span class="ckm"><Icon id="check" /></span><span class="nm">{e.nm}</span>
    </button>)}</div>;
}
