// Mapa de músculos ilustrado (SVG, frente e costas), por subdivisão do core (SUB_MUSCLES).
// Uso: destacar o músculo de um exercício (principal + secundários) ou escolher prioridades (modo selecionável).
// Os desenhos são da metade esquerda da figura; a direita é o espelho. A cor nunca é o único sinal: a legenda escreve os nomes.
import * as C from "@ciclo/core";
import type { SubMuscleId } from "@ciclo/core";

export type Shapes = Partial<Record<SubMuscleId, string[]>>;
export const SIL = [
  "M100 58 C88 58 74 59 62 62 C50 65 42 75 42 92 C40 110 40 126 43 140 C38 160 35 182 37 204 L49 206 C53 186 57 166 58 148 L60 112 C62 140 64 170 68 200 C66 212 64 222 66 232 C60 262 60 296 66 326 C60 350 60 376 63 400 L81 400 C83 376 84 352 82 330 C88 300 92 266 96 238 L100 238 Z",
];
export const FRENTE: Shapes = {
  trapezio: ["M92 56 C84 60 74 62 66 64 L84 66 C88 63 91 60 92 56 Z"],
  ombro_lat: ["M58 63 C48 66 43 76 43 92 L49 94 C49 81 53 71 62 65 Z"],
  ombro_ant: ["M62 65 C54 71 50 82 50 95 L59 97 C63 86 70 76 78 67 C72 64 67 64 62 65 Z"],
  peito_sup: ["M79 67 C72 75 66 84 63 93 L99 91 L99 66 C92 64 85 64 79 67 Z"],
  peito_medio: ["M63 95 C63 106 69 117 81 121 C91 122 97 119 99 117 L99 93 Z"],
  biceps: ["M47 98 C43 111 43 124 47 136 L57 136 C60 123 60 110 58 99 Z"],
  braquial: ["M45 128 C43 136 44 144 46 150 L51 149 L49 132 Z"],
  antebraco: ["M45 152 C39 168 37 186 39 200 L48 202 C52 186 55 169 56 153 Z"],
  abdomen: ["M86 125 L99 125 L99 206 L88 204 C86 180 84 150 86 125 Z"],
  obliquos: ["M68 122 C68 150 72 180 84 204 L87 204 C84 178 82 150 84 124 Z"],
  quad: ["M68 224 C61 252 61 290 67 320 L85 322 C90 290 92 258 90 232 Z"],
  adutores: ["M91 232 C93 256 93 280 89 300 L98 298 C99 272 99 248 97 236 Z"],
  pant: ["M66 338 C61 352 61 372 64 390 L71 390 C71 370 71 352 72 338 Z"],
};
export const COSTAS: Shapes = {
  trapezio: ["M99 52 L99 112 C92 98 81 80 66 66 C77 61 88 57 99 52 Z"],
  ombro_lat: ["M57 63 C47 67 42 77 42 92 L47 92 C47 80 51 70 61 64 Z"],
  ombro_post: ["M61 64 C52 70 48 80 48 92 L57 93 C60 84 66 76 74 70 C70 66 65 64 61 64 Z"],
  costas_meio: ["M75 72 C83 83 92 98 99 113 L99 140 C91 132 84 118 79 104 C77 92 75 82 75 72 Z"],
  dorsal: ["M65 97 C63 121 69 151 86 178 L96 171 C88 151 82 125 78 105 Z"],
  lombar: ["M89 168 L99 160 L99 212 L91 212 C91 196 89 182 89 168 Z"],
  triceps_lateral: ["M44 97 C40 111 40 125 44 137 L50 137 C50 123 50 109 50 97 Z"],
  triceps_longa: ["M51 97 C51 111 51 125 51 137 L58 134 C60 120 60 107 58 97 Z"],
  antebraco: ["M45 152 C39 168 37 186 39 200 L48 202 C52 186 55 169 56 153 Z"],
  gluteo: ["M70 214 C64 228 66 248 80 254 C90 256 97 252 99 246 L99 214 C90 210 80 210 70 214 Z"],
  isquio: ["M68 258 C62 282 64 304 70 322 L84 322 C88 300 90 278 88 260 Z"],
  adutores: ["M89 260 C91 278 91 296 89 306 L98 304 C99 286 99 268 97 256 Z"],
  pant: ["M66 336 C58 352 60 370 66 386 L80 386 C84 370 84 352 80 336 Z"],
};

export type Vista = "frente" | "costas";
export interface MapaProps {
  primary?: SubMuscleId[]; secondary?: SubMuscleId[];
  /** modo selecionável (Perfil): quais estão marcados e o que fazer ao tocar */
  selected?: SubMuscleId[]; onToggle?: (id: SubMuscleId) => void;
  views?: Vista[]; size?: "sm" | "md";
}
export const MIRROR = "matrix(-1 0 0 1 200 0)";

/** Caixa do desenho (os caminhos usam só coordenadas absolutas M/L/C/Z). */
function bbox(ds: string[]) {
  const n = ds.join(" ").match(/-?\d+(?:\.\d+)?/g)!.map(Number);
  const xs = n.filter((_, i) => i % 2 === 0), ys = n.filter((_, i) => i % 2 === 1);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}
/** Área de toque invisível: só cresce o lado que ficaria menor que ~44 px na tela (o desenho não muda). */
function hitRects(ds: string[], min: number) {
  const b = bbox(ds), w = b.x1 - b.x0, h = b.y1 - b.y0;
  if (w >= min && h >= min) return null;
  const W = Math.max(w, min), H = Math.max(h, min), cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
  return { x: cx - W / 2, y: cy - H / 2, width: W, height: H };
}

function Corpo({ vista, p }: { vista: Vista; p: MapaProps }) {
  const shapes = vista === "frente" ? FRENTE : COSTAS;
  const cls = (id: SubMuscleId) => p.primary?.includes(id) ? "pri" : p.secondary?.includes(id) ? "sec" : p.selected?.includes(id) ? "sel" : "";
  return <svg viewBox="0 0 200 410" role="group" aria-label={`Músculos · ${vista}`}>
    <circle class="sil" cx="100" cy="30" r="17" /><rect class="sil" x="92" y="44" width="16" height="16" />
    {SIL.map((d, i) => <g key={i}><path class="sil" d={d} /><path class="sil" d={d} transform={MIRROR} /></g>)}
    {(Object.entries(shapes) as [SubMuscleId, string[]][]).map(([id, ds]) => {
      const nm = C.SUB_MUSCLES[id].nm, sel = !!p.onToggle;
      return <g key={id} class={`mus ${cls(id)} ${sel ? "tap" : ""}`} data-m={id}
        {...(sel ? { role: "button", tabIndex: 0, "aria-pressed": !!p.selected?.includes(id), "aria-label": nm,
          onClick: () => p.onToggle!(id), onKeyDown: (e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); p.onToggle!(id); } } } : {})}>
        <title>{nm}</title>{ds.map((d, i) => <g key={i}><path d={d} /><path d={d} transform={MIRROR} /></g>)}
      </g>;
    })}
    {p.onToggle && <g class="hit" aria-hidden="true">{(Object.entries(shapes) as [SubMuscleId, string[]][]).map(([id, ds]) => {
      const r = hitRects(ds, p.size === "sm" ? 60 : 54); if (!r) return null;
      return <g key={id}><rect {...r} onClick={() => p.onToggle!(id)} /><rect {...r} transform={MIRROR} onClick={() => p.onToggle!(id)} /></g>;
    })}</g>}
    <text x="100" y="408" class="lbl">{vista === "frente" ? "Frente" : "Costas"}</text>
  </svg>;
}

export function MapaMusculos(p: MapaProps) {
  const views = p.views ?? ["frente", "costas"];
  const names = (ids?: SubMuscleId[]) => (ids ?? []).map((s) => C.SUB_MUSCLES[s].nm).join(", ");
  return <div class={`musmap ${p.size ?? "md"}`}>
    <div class="musmap-figs">{views.map((v) => <Corpo key={v} vista={v} p={p} />)}</div>
    {(p.primary?.length || p.secondary?.length) ? <div class="legend" style="justify-content:center;margin-top:8px">
      {!!p.primary?.length && <span><i class="sw" style="background:var(--acc-bg)" />principal: {names(p.primary)}</span>}
      {!!p.secondary?.length && <span><i class="sw sw-sec" />secundário: {names(p.secondary)}</span>}
    </div> : null}
  </div>;
}

/** Subdivisões padrão quando o exercício ainda não tem `subMuscles` (conteúdo pendente). */
export const DEFAULT_SUB: Record<C.MuscleId, SubMuscleId[]> = {
  peito: ["peito_medio"], costas: ["dorsal"], ombro: ["ombro_lat"], post: ["ombro_post"], biceps: ["biceps"], triceps: ["triceps_longa", "triceps_lateral"],
  quad: ["quad"], isquio: ["isquio"], gluteo: ["gluteo"], pant: ["pant"], core: ["abdomen"],
};
