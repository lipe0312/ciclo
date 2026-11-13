// Mapa do corpo por GRUPO (quiz e Perfil): ombro, bíceps, tríceps, peito, costas, pernas, glúteo e abdômen.
// Zonas de toque grandes e sem sobreposição (≥ 44 px em 390 px), uma figura por vez no celular (Frente/Costas) e as duas no computador.
// Tocar no desenho OU na lista; tocar de novo retira; até 5, na ordem do toque (o número aparece no músculo).
// As subdivisões de cada grupo vêm do core (priorityGroups); o detalhe por subparte fica no Perfil (modo avançado).
import { useState } from "preact/hooks";
import { C, S } from "../store/index.ts";
import { Icon, Seg, toast } from "../ui/index.tsx";
import { COSTAS, FRENTE, MIRROR, SIL } from "../mapa-musculos/index.tsx";
import type { Shapes } from "../mapa-musculos/index.tsx";
import { setSubPriorities } from "../prioridades/index.tsx";
import "./mapa-corpo.css";

type G = C.PriorityGroupId;
type Vista = "frente" | "costas";
interface Zona { g: G; hit: string; at: [number, number]; sub: C.SubMuscleId[] }

// Zonas de toque: polígonos da metade esquerda (a direita é o espelho), lado a lado sem se cobrirem.
const ZONAS: Record<Vista, Zona[]> = {
  frente: [
    { g: "ombro", hit: "M34 56 L79 56 L79 67 L72 75 L66 84 L63 93 L62 98 L34 98 Z", at: [52, 80], sub: ["ombro_lat", "ombro_ant"] },
    { g: "peito", hit: "M79 56 L100 56 L100 124 L62 124 L62 98 L63 93 L66 84 L72 75 L79 67 Z", at: [84, 98], sub: ["peito_sup", "peito_medio"] },
    { g: "biceps", hit: "M30 98 L62 98 L62 150 L30 150 Z", at: [48, 122], sub: ["biceps", "braquial"] },
    { g: "abdomen", hit: "M62 124 L100 124 L100 210 L62 210 Z", at: [86, 166], sub: ["abdomen", "obliquos"] },
    { g: "pernas", hit: "M54 214 L100 214 L100 395 L54 395 Z", at: [78, 296], sub: ["quad", "adutores", "pant"] },
  ],
  costas: [
    { g: "ombro", hit: "M34 56 L74 56 L74 98 L34 98 Z", at: [54, 80], sub: ["ombro_lat", "ombro_post"] },
    { g: "costas", hit: "M74 48 L100 48 L100 210 L62 210 L62 98 L74 98 Z", at: [86, 124], sub: ["trapezio", "costas_meio", "dorsal", "lombar"] },
    { g: "triceps", hit: "M30 98 L62 98 L62 150 L30 150 Z", at: [48, 120], sub: ["triceps_lateral", "triceps_longa"] },
    { g: "gluteo", hit: "M54 210 L100 210 L100 258 L54 258 Z", at: [80, 234], sub: ["gluteo"] },
    { g: "pernas", hit: "M52 258 L100 258 L100 395 L52 395 Z", at: [78, 322], sub: ["isquio", "adutores", "pant"] },
  ],
};
const FORMAS: Record<Vista, Shapes> = { frente: FRENTE, costas: COSTAS };

/** Os grupos escolhidos, na ordem do toque (derivado das subdivisões que o perfil guarda). */
export const gruposEscolhidos = (): G[] => C.groupsOfSubs(S.profile.subPriorities ?? []);

/** Tocar escolhe, tocar de novo retira, o 6º é recusado com aviso. */
export function alternarGrupo(g: G, onChange: () => void) {
  const r = C.toggleGroup(S.profile.subPriorities ?? [], g);
  if (!r.changed) return toast(`Máximo ${C.MAX_PRIORITIES} prioridades: toque numa marcada para tirar`);
  setSubPriorities(r.subs, onChange);
}
export function moverGrupo(g: G, d: number, onChange: () => void) { setSubPriorities(C.moveGroup(S.profile.subPriorities ?? [], g, d), onChange); }

function Figura({ vista, sel, onToggle }: { vista: Vista; sel: G[]; onToggle: (g: G) => void }) {
  return <svg viewBox="0 0 200 410" role="group" aria-label={`Mapa do corpo · ${vista}`} class={`mc-fig v-${vista}`}>
    <circle class="sil" cx="100" cy="30" r="17" /><rect class="sil" x="92" y="44" width="16" height="16" />
    {SIL.map((d, i) => <g key={i}><path class="sil" d={d} /><path class="sil" d={d} transform={MIRROR} /></g>)}
    {ZONAS[vista].map((z) => {
      const on = sel.includes(z.g), n = sel.indexOf(z.g) + 1, nm = C.priorityGroups[z.g].nm;
      const formas = z.sub.flatMap((s) => FORMAS[vista][s] ?? []);
      const ativar = () => onToggle(z.g);
      return <g key={z.g} class={`mc-zona ${on ? "on" : ""}`} role="button" tabIndex={0} aria-pressed={on} aria-label={on ? `${nm}, prioridade ${n}` : nm}
        onClick={ativar} onKeyDown={(e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ativar(); } }}>
        <title>{nm}</title>
        {formas.map((d, i) => <g key={i} class="mc-m"><path d={d} /><path d={d} transform={MIRROR} /></g>)}
        <path class="mc-hit" d={z.hit} /><path class="mc-hit" d={z.hit} transform={MIRROR} />
        {on && <g class="mc-badge" aria-hidden="true"><circle cx={z.at[0]} cy={z.at[1]} r="10" /><text x={z.at[0]} y={z.at[1] + 4.5}>{n}</text></g>}
      </g>;
    })}
    <text x="100" y="408" class="lbl">{vista === "frente" ? "Frente" : "Costas"}</text>
  </svg>;
}

/** Mapa + lista + contador "3 de 5" + ordem (▲▼). Tudo o que muda passa por `alternarGrupo`/`moverGrupo` (core). */
export function SeletorGrupos({ onChange }: { onChange: () => void }) {
  const [vista, setVista] = useState<Vista>("frente");
  const sel = gruposEscolhidos(), cheio = sel.length >= C.MAX_PRIORITIES;
  const toggle = (g: G) => alternarGrupo(g, onChange);
  return <div class="mc">
    <div class="mc-topo">
      <p class={`mc-cont num ${cheio ? "cheio" : ""}`} role="status" aria-live="polite"><b>{sel.length} de {C.MAX_PRIORITIES}</b> prioridades{cheio ? " · máximo" : ""}</p>
      <Seg opts={[["frente", "Frente"], ["costas", "Costas"]]} value={vista} onPick={setVista} label="Lado do corpo" cls="mc-seg" />
    </div>
    <div class="mc-corpo">
      <div class={`mc-figs ver-${vista}`}><Figura vista="frente" sel={sel} onToggle={toggle} /><Figura vista="costas" sel={sel} onToggle={toggle} /></div>
      <div class="mc-lado">
        <div class="mc-lista" role="group" aria-label="Músculos">
          {C.PRIORITY_GROUP_IDS.map((g) => { const i = sel.indexOf(g);
            return <button type="button" key={g} class="chip tall mc-op" aria-pressed={i >= 0} onClick={() => toggle(g)}>{i >= 0 && <b class="num mc-n">{i + 1}</b>}{C.priorityGroups[g].nm}</button>; })}
        </div>
        <ol class="prio-list" aria-label="Suas prioridades, em ordem">
          {sel.map((g, i) => <li key={g}><b class="num prio-n">{i + 1}</b><span class="prio-nm">{C.priorityGroups[g].nm}</span>
            <button type="button" class="iconbtn" aria-label={`Subir ${C.priorityGroups[g].nm}`} disabled={i === 0} onClick={() => moverGrupo(g, -1, onChange)}><Icon id="arrow" style="transform:rotate(-90deg)" /></button>
            <button type="button" class="iconbtn" aria-label={`Descer ${C.priorityGroups[g].nm}`} disabled={i === sel.length - 1} onClick={() => moverGrupo(g, 1, onChange)}><Icon id="arrow" style="transform:rotate(90deg)" /></button>
            <button type="button" class="iconbtn" aria-label={`Tirar ${C.priorityGroups[g].nm}`} onClick={() => toggle(g)}><Icon id="x" /></button></li>)}
          {!sel.length && <li class="small sub prio-empty">Toque no desenho ou na lista. A ordem do toque é a ordem de importância. Ex.: ombro, bíceps, tríceps.</li>}
        </ol>
      </div>
    </div>
  </div>;
}
