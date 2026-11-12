// Grade de aparelhos com imagens (Academias, Primeiros passos). Seleção múltipla controlada por fora.
import * as C from "@ciclo/core";
import { useState } from "preact/hooks";
import { Icon } from "../ui/index.tsx";
import { img } from "../util.ts";

/** Imagem do aparelho; sem imagem (falta ou erro ao carregar) mostra um ícone de reserva em vez de bloco vazio. */
export function FotoAparelho({ src, w = 320, h = 240 }: { src: string; w?: number; h?: number }) {
  const [erro, setErro] = useState(false);
  return erro ? <span class="eq-ph" role="img" aria-label="Sem imagem do aparelho"><Icon id="dumb" /></span>
    : <img src={src} alt="" loading="lazy" width={w} height={h} onError={() => setErro(true)} />;
}
export const EQ_CATS: [string, string][] = [["todos", "Todos"], ["livres", "Pesos livres"], ["cabos", "Cabos"], ["maquinas", "Máquinas"], ["corpo", "Peso corporal"], ["cardio", "Cardio"]];
export function GradeAparelhos({ selected, onToggle, cat = "todos" }: { selected: string[]; onToggle: (id: string) => void; cat?: string }) {
  return <div class="eqgrid">{C.EQUIPMENT.filter((e) => cat === "todos" || e.cat === cat).map((e) =>
    <button type="button" class="eq" key={e.id} aria-pressed={selected.includes(e.id)} onClick={() => onToggle(e.id)}>
      <FotoAparelho src={img(e.img)} /><span class="ckm"><Icon id="check" /></span><span class="nm">{e.nm}</span>
    </button>)}</div>;
}
