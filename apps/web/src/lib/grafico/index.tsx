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

/** Colunas por semana (#29): a última coluna é a semana atual (verde, ainda em andamento); `meta` desenha a marca tracejada.
 *  O valor sempre vem escrito fora do gráfico; o aria-label lista todos os valores. */
export function Colunas({ values, label, unit = "", meta, max }: { values: number[]; label: string; unit?: string; meta?: number; max?: number }) {
  const w = 240, h = 56, n = values.length, top = Math.max(max ?? 0, meta ?? 0, ...values, 1);
  const bw = n ? (w - 8) / n : 0, y = (v: number) => h - 4 - (v / top) * (h - 10);
  return <svg class="spark colunas" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${label}: ${values.join(", ")}${unit}`} preserveAspectRatio="none">
    <line x1="0" y1={h - 3.5} x2={w} y2={h - 3.5} stroke="var(--borda-ctrl)" stroke-width="1" vector-effect="non-scaling-stroke" />
    {values.map((v, i) => <rect key={i} x={4 + i * bw + bw * 0.14} width={bw * 0.72} y={v > 0 ? y(v) : h - 4.5} height={v > 0 ? h - 4 - y(v) : 1} rx="2" fill={i === n - 1 ? "var(--acc)" : "var(--txt)"} opacity={i === n - 1 ? 1 : 0.85} />)}
    {meta != null && <line x1="0" x2={w} y1={y(meta)} y2={y(meta)} stroke="var(--sub)" stroke-width="1.5" stroke-dasharray="4 3" vector-effect="non-scaling-stroke" />}
  </svg>;
}
