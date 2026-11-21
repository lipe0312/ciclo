// #123 Menu ⋯ do Treino: cancelar o treino começado (com confirmação), retirar o treino de hoje (discreto: a semana se
// reorganiza como falta) e corrigir as séries do treino terminado.
import { S, commit, today } from "../../lib/store/index.ts";
import { SheetHead, closeSheet, openSheet } from "../../lib/folha/index.tsx";
import "./corrigir.css";
import { Icon } from "../../lib/ui/index.tsx";
import { acaoDia, diaDe } from "../semana/estado.ts";
import { cancelarTreino, running } from "./sessao.ts";
import { abrirCorrigir } from "./corrigir.tsx";

const st: { confirmar: null | "cancelar" | "retirar" } = { confirmar: null };
export const abrirMenuTreino = () => { st.confirmar = null; openSheet(() => <Menu />); };

const feitas = () => Object.values((S.session?.logs ?? {}) as Record<string, { done: boolean }[]>).flat().filter((l) => l.done).length;
const set = (c: typeof st.confirmar) => { st.confirmar = c; commit(); };

function Menu() {
  const run = running(), fim = !run && S.session?.finishedAt && S.session.date === today ? S.session : null;
  const d = diaDe(today), retiravel = !run && !fim && d?.kind !== "folga" && d?.status === "hoje";
  if (st.confirmar === "cancelar") {
    const n = feitas();
    return <><SheetHead kicker="Cancelar treino" title="Descartar este treino?" />
      <p class="small sub" style="margin:6px 0 14px">{n ? `As ${n} séries registradas saem do histórico e do volume da semana.` : "Nada foi registrado ainda."} O cronômetro para e o dia volta a pendente.</p>
      <div class="row" style="gap:8px"><button type="button" class="btn" style="flex:1" onClick={() => set(null)}>Voltar</button>
        <button type="button" class="btn danger" style="flex:1" onClick={() => { closeSheet(); void cancelarTreino(); }}>Sim, descartar</button></div></>;
  }
  if (st.confirmar === "retirar") {
    return <><SheetHead kicker="Hoje sem treino" title="Retirar o treino de hoje?" />
      <p class="small sub" style="margin:6px 0 14px">Hoje fica sem treino e a semana se reorganiza como uma falta: o volume vai para os próximos dias, sem dobrar.</p>
      <div class="row" style="gap:8px"><button type="button" class="btn" style="flex:1" onClick={() => set(null)}>Voltar</button>
        <button type="button" class="btn danger" style="flex:1" onClick={() => void acaoDia(today, { action: "folga" }, "Treino retirado · a semana se reorganizou").then((ok) => ok && closeSheet())}>Sim, retirar</button></div></>;
  }
  return <><SheetHead kicker="Treino" title="Mais opções" />
    <div class="menu-treino">
      {fim && <button type="button" class="btn full" onClick={() => abrirCorrigir(fim.id)}><Icon id="edit" />Corrigir séries</button>}
      {run && <button type="button" class="btn full danger" onClick={() => set("cancelar")}><Icon id="x" />Cancelar treino</button>}
      {retiravel && <button type="button" class="btn full" onClick={() => set("retirar")}><Icon id="skip" />Retirar o treino de hoje</button>}
      {!fim && !run && !retiravel && <p class="small sub">Nada para mudar agora.</p>}
    </div></>;
}
