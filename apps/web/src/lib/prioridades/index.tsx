// Escolha das prioridades no mapa de músculos (SVG com subdivisões): até 3, na ordem do toque, com ▲▼ para reordenar.
// Também dá para escolher pela lista (toque ≥ 44 px), que é o caminho acessível. Usado nos Primeiros passos e no Perfil.
import { C, S } from "../store/index.ts";
import { Icon, toast } from "../ui/index.tsx";
import { MapaMusculos } from "../mapa-musculos/index.tsx";

const REGIONS: [C.Region, string][] = [["ombro", "Ombro"], ["bracos", "Braços"], ["peito", "Peito"], ["costas", "Costas"], ["pernas", "Pernas"], ["core", "Core"]];

/** Aplica a escolha no perfil: as subdivisões em ordem e os músculos que o planejador usa. */
export function setSubPriorities(subs: C.SubMuscleId[], onChange: () => void) {
  S.profile.subPriorities = subs;
  S.profile.priorities = C.prioritiesFromSubs(subs);
  onChange();
}

export function SeletorPrioridades({ onChange, size = "sm" }: { onChange: () => void; size?: "sm" | "md" }) {
  const subs = S.profile.subPriorities ?? [];
  const toggle = (s: C.SubMuscleId) => {
    const i = subs.indexOf(s);
    if (i >= 0) return setSubPriorities(subs.filter((x) => x !== s), onChange);
    if (subs.length >= C.MAX_PRIORITIES) return toast(`Até ${C.MAX_PRIORITIES} prioridades: toque numa marcada para tirar`);
    setSubPriorities([...subs, s], onChange);
  };
  const move = (i: number, d: number) => { const a = [...subs]; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; setSubPriorities(a, onChange); };
  return <div class="prio">
    <MapaMusculos selected={subs} onToggle={toggle} size={size} />
    <ol class="prio-list" aria-label="Suas prioridades, em ordem">
      {subs.map((s, i) => <li key={s}><b class="num prio-n">{i + 1}</b><span class="prio-nm">{C.SUB_MUSCLES[s].nm}</span>
        <button type="button" class="iconbtn" aria-label={`Subir ${C.SUB_MUSCLES[s].nm}`} disabled={i === 0} onClick={() => move(i, -1)}><Icon id="arrow" style="transform:rotate(-90deg)" /></button>
        <button type="button" class="iconbtn" aria-label={`Descer ${C.SUB_MUSCLES[s].nm}`} disabled={i === subs.length - 1} onClick={() => move(i, 1)}><Icon id="arrow" style="transform:rotate(90deg)" /></button>
        <button type="button" class="iconbtn" aria-label={`Tirar ${C.SUB_MUSCLES[s].nm}`} onClick={() => toggle(s)}><Icon id="x" /></button></li>)}
      {!subs.length && <li class="small sub prio-empty">Toque no desenho. A ordem do toque é a ordem de importância. Ex.: ombro lateral, bíceps, tríceps.</li>}
    </ol>
    <details class="prio-lista"><summary>Prefiro escolher pela lista</summary>
      {REGIONS.map(([r, nm]) => <div key={r} style="margin-top:10px"><span class="f">{nm}</span><div class="chips">
        {C.SUB_MUSCLE_IDS.filter((s) => C.SUB_MUSCLES[s].region === r).map((s) => <button type="button" key={s} class="chip tall" aria-pressed={subs.includes(s)} onClick={() => toggle(s)}>
          {subs.includes(s) && <b class="num">{subs.indexOf(s) + 1}</b>}{C.SUB_MUSCLES[s].nm}</button>)}</div></div>)}
    </details>
  </div>;
}
