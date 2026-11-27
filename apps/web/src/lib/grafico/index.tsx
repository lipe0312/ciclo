// Gráficos em SVG/CSS (DESIGN.md): barra = feito + hoje (hachurado) + marca da meta; valor sempre escrito.
export function BarraVolume({ label, done, today = 0, target, max, prio }: { label: string; done: number; today?: number; target: number; max: number; prio?: boolean }) {
  const pct = (v: number) => Math.min(100, (v / max) * 100);
  return <div class="vol num"><span>{label}{prio && <span style="color:var(--acc)"> ●</span>}</span>
    <div class="bar" role="img" aria-label={`${label}: ${done} feitas, ${today} hoje, meta ${target}`}>
      <i class="d" style={{ width: `${pct(done)}%` }} /><i class="t" style={{ left: `${pct(done)}%`, width: `${pct(today)}%` }} /><span class="mk" style={{ left: `${pct(target)}%` }} />
    </div><span class="sub">{done}{today ? `+${today}` : ""}/{target}</span></div>;
}
export const BarraSimples = ({ pct, color }: { pct: number; color?: string }) =>
  <div class="bar"><i class="d" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} /></div>;

/** Linha simples com pontos e rótulo do último valor. */
export function Linha({ values, label, unit = "" }: { values: number[]; label: string; unit?: string }) {
  if (values.length < 2) return null;
  const w = 240, h = 56, min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const pts = values.map((v, i) => [8 + (i * (w - 16)) / (values.length - 1), h - 8 - ((v - min) / span) * (h - 16)]);
  return <svg class="spark" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${label}: ${values.join(", ")}${unit}`} preserveAspectRatio="none">
    <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke" />
    {pts.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="3" fill={i === pts.length - 1 ? "var(--acc)" : "currentColor"} />)}
  </svg>;
}
