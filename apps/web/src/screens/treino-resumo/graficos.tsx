// Gráficos do detalhe do treino (#159). HTML/SVG próprio, só nesta tela (baixa sob demanda). Regras de legibilidade:
// o valor vem ESCRITO em cada barra e no fim de cada linha; a meta é uma linha tracejada com legenda escrita; a semana
// em andamento é hachurada (e a legenda diz); a cor nunca é o único sinal. Um gráfico por músculo.
import { fmt } from "../../lib/util.ts";

const ALT = 96;
const ddmm = (iso: string) => `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}`;
/** Rótulos do eixo: com muitas semanas, só alterna (a última sempre aparece). */
const mostra = (i: number, n: number) => n <= 6 || (n - 1 - i) % 2 === 0;

export function ColunasValor({ values, semanas, label, unit = "", meta, metaTxt, max }: {
  values: number[]; semanas: string[]; label: string; unit?: string; meta?: number; metaTxt?: string; max?: number;
}) {
  const n = values.length, top = Math.max(1, max ?? 0, meta ?? 0, ...values);
  const px = (v: number) => (v > 0 ? Math.max(3, Math.round((v / top) * ALT)) : 1);
  return <figure class="gv">
    <div class="gv-area" role="img" style={{ height: `${ALT + 18}px` }}
      aria-label={`${label}: ${values.map((v, i) => `${ddmm(semanas[i])} ${v}${unit}`).join(", ")}${meta != null ? `; meta ${meta}${unit}` : ""}`}>
      {meta != null && <i class="gv-meta" aria-hidden="true" style={{ bottom: `${Math.round((meta / top) * ALT)}px` }} />}
      <div class="gv-cols" aria-hidden="true">{values.map((v, i) => <div class="gv-col" key={i}>
        <span class="gv-v num">{fmt(v)}</span><i class={`gv-b${i === n - 1 ? " atual" : ""}`} style={{ height: `${px(v)}px` }} /></div>)}</div>
    </div>
    <div class="gv-eixo tiny sub num" aria-hidden="true">{semanas.map((s, i) => <span key={s}>{mostra(i, n) ? ddmm(s) : ""}</span>)}</div>
    <figcaption class="gv-leg tiny sub">
      {meta != null && <span><i class="gv-sw meta" aria-hidden="true" />tracejado: {metaTxt ?? `meta de ${meta}${unit}`}</span>}
      <span><i class="gv-sw atual" aria-hidden="true" />hachurado: semana em andamento</span>
    </figcaption>
  </figure>;
}

/** Linha de uma série com buracos (semana sem medida): o 1º e o último valor escritos, o último em destaque. */
export function LinhaValor({ values, semanas, label, unit = "" }: { values: (number | null)[]; semanas: string[]; label: string; unit?: string }) {
  const W = 320, H = 98, L = 30, R = 56, T = 22, B = 22;
  const pts = values.map((v, i) => (v == null ? null : { v, i })).filter((p): p is { v: number; i: number } => p != null);
  if (!pts.length) return null;
  const n = values.length, min = Math.min(...pts.map((p) => p.v)), max = Math.max(...pts.map((p) => p.v)), span = max - min || 1;
  const x = (i: number) => (n > 1 ? L + (i * (W - L - R)) / (n - 1) : L);
  const y = (v: number) => (max === min ? (T + H - B) / 2 : H - B - ((v - min) / span) * (H - B - T));
  const xy = pts.map((p) => [x(p.i), y(p.v)] as const), ult = pts.length - 1;
  return <svg class="gv-linha" viewBox={`0 0 ${W} ${H}`} role="img"
    aria-label={`${label}: ${pts.map((p) => `${ddmm(semanas[p.i])} ${fmt(p.v, 1)}${unit}`).join(", ")}`}>
    <line x1={L} x2={W - R} y1={H - B + 2} y2={H - B + 2} stroke="var(--borda-ctrl)" stroke-width="1" />
    {xy.length > 1 && <polyline points={xy.map((p) => p.join(",")).join(" ")} fill="none" stroke="currentColor" stroke-width="2" />}
    {xy.map(([cx, cy], k) => <circle key={k} cx={cx} cy={cy} r={k === ult ? 4 : 3} fill={k === ult ? "var(--acc)" : "currentColor"} stroke={k === ult ? "currentColor" : "none"} stroke-width="1.5" />)}
    {ult > 0 && <text x={xy[0][0]} y={xy[0][1] - 8} text-anchor="middle" class="gv-t">{fmt(pts[0].v, 1)}</text>}
    <text x={xy[ult][0] + 8} y={xy[ult][1] + 4} class="gv-t fim">{fmt(pts[ult].v, 1)}{unit}</text>
    <text x={x(0)} y={H - 3} text-anchor="start" class="gv-ax">{ddmm(semanas[0])}</text>
    <text x={x(n - 1)} y={H - 3} text-anchor="end" class="gv-ax">{ddmm(semanas[n - 1])}</text>
  </svg>;
}
