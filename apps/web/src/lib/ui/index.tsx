// Componentes básicos: ícone, cartão, chip, segmento, stepper, toast.
import type { ComponentChildren, JSX } from "preact";
import { useEffect, useState } from "preact/hooks";
import { fmt } from "../util.ts";

export const Icon = ({ id, cls = "", style }: { id: string; cls?: string; style?: string | JSX.CSSProperties }) =>
  <svg class={`i ${cls}`} style={style} aria-hidden="true"><use href={`#i-${id}`} /></svg>;

export const Card = ({ children, cls = "", ...rest }: { children?: ComponentChildren; cls?: string } & JSX.HTMLAttributes<HTMLDivElement>) =>
  <div class={`card ${cls}`} {...rest}>{children}</div>;

export const Chip = ({ on, onClick, children, label }: { on?: boolean; onClick?: () => void; children: ComponentChildren; label?: string }) =>
  <button type="button" class="chip" aria-pressed={on == null ? undefined : on} onClick={onClick} aria-label={label}>{children}</button>;

/** Segmento: opções [valor, rótulo]; compara por JSON para aceitar número/booleano. */
export function Seg<T>({ opts, value, onPick, label, cls = "" }: { opts: [T, string][]; value: T; onPick: (v: T) => void; label?: string; cls?: string }) {
  return <div class={`seg ${cls}`} role="group" aria-label={label}>
    {opts.map(([v, l]) => <button type="button" key={String(v)} aria-pressed={JSON.stringify(v) === JSON.stringify(value)} onClick={() => onPick(v)}>{l}</button>)}
  </div>;
}

export const Stepper = ({ value, step, unit = "", onStep }: { value: number; step: number; unit?: string; onStep: (d: number) => void }) =>
  <span class="stepper"><button type="button" aria-label="menos" onClick={() => onStep(-step)}>−</button>
    <span class="num">{fmt(value, step < 1 ? 1 : 0)}{unit}</span>
    <button type="button" aria-label="mais" onClick={() => onStep(step)}>+</button></span>;

// toast
let setT: (t: string) => void = () => {};
let timer: ReturnType<typeof setTimeout> | undefined;
export function toast(t: string) { setT(t); clearTimeout(timer); timer = setTimeout(() => setT(""), 2400); }
export function Toast() {
  const [t, set] = useState("");
  useEffect(() => { setT = set; }, []);
  return <div class={`toast ${t ? "show" : ""}`} role="status" aria-live="polite">{t}</div>;
}
