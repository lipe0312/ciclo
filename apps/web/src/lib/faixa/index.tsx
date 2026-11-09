// Faixa de aviso no topo (não é modal). Qualquer tela chama showFaixa/hideFaixa; o shell desenha.
import { Icon } from "../ui/index.tsx";

export type Tom = "info" | "warn" | "bad";
export interface Aviso { id: string; text: string; tone: Tom; action?: { label: string; href?: string; onClick?: () => void }; closable?: boolean }
let avisos: Aviso[] = [];
let rerender: () => void = () => {};
export const setFaixaRerender = (f: () => void) => { rerender = f; };
export function showFaixa(a: Aviso) { avisos = avisos.filter((x) => x.id !== a.id).concat(a); rerender(); }
export function hideFaixa(id: string) { if (avisos.some((x) => x.id === id)) { avisos = avisos.filter((x) => x.id !== id); rerender(); } }

export function Faixa() {
  if (!avisos.length) return null;
  return <div class="faixas">{avisos.map((a) => <div key={a.id} class={`faixa ${a.tone}`} role={a.tone === "bad" ? "alert" : "status"}>
    <Icon id={a.tone === "info" ? "info" : "warn"} /><span class="small" style="flex:1">{a.text}</span>
    {a.action && (a.action.href ? <a class="btn sm" href={a.action.href}>{a.action.label}</a> : <button type="button" class="btn sm" onClick={a.action.onClick}>{a.action.label}</button>)}
    {a.closable !== false && <button type="button" class="iconbtn sm" aria-label="Fechar aviso" onClick={() => hideFaixa(a.id)}><Icon id="x" /></button>}
  </div>)}</div>;
}
