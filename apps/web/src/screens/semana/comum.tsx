// Peças da Semana que o Hoje também usa (status do dia, selo de origem, Treinei / Não treinei). #82: num arquivo à parte
// para o carrossel do Hoje não puxar a tela da Semana inteira para o JS inicial (a tela é lazy em app.tsx).
import * as C from "@ciclo/core";
import { today } from "../../lib/store/index.ts";
import { Icon } from "../../lib/ui/index.tsx";
import { desmarcar, marcar, marcavel, planoDoDia, podeDesmarcar, podeNaoTreinei } from "./estado.ts";
import type { Dia } from "./estado.ts";
import "./semana.css"; // o carrossel do Hoje usa as classes da Semana (status, Treinei)

export const STATUS: Record<C.DayStatus, string> = {
  feito: "feito", extra: "extra", faltou: "faltou", folga: "folga", pendente: "sem resposta", hoje: "hoje", livre: "livre", planejado: "planejado",
};
/** #108 Selo de quem montou o dia: revisão da IA (treino gerado pelo app), Chat ou você. */
export function SeloOrigem({ d, p }: { d: Dia; p: C.DayPlan }) {
  const txt = p.revisao === "pendente" ? "revisão da IA pendente" : p.revisao === "revisada" ? "revisado pela IA" : p.revisao === "mantida" ? "gerado pelo app · revisado"
    : d.source === "claude" ? "montado pelo Chat" : d.source === "voce" ? "escolha sua" : null;
  return txt ? <span class={`badge${p.revisao === "pendente" ? " warn" : ""}`}>{txt}</span> : null;
}

/** #108 Dia sem treino: o botão é Gerar treino (nada é gerado ao abrir a tela). */
export const semTreino = (d: Dia) => d.status === "livre" || (d.status === "folga" && d.date >= today && !planoDoDia(d));

/** #113 Treinei / Não treinei em qualquer dia até hoje (dentro ou fora do cadastro). Hoje: "Treinei" é a ação primária;
 *  nos outros dias, uma linha discreta (botões fantasma, toque ≥ 44 px). */
export function Marcar({ d }: { d: Dia }) {
  // #123 marcou "Treinei" sem querer: dá para trocar para Não (o dia volta a pendente e o check-in vira não)
  if (podeDesmarcar(d)) return <div class="sem-acts sem-marcar leve"><span class="small sub"><Icon id="check" /> Treinei</span>
    <button type="button" class="btn ghost" onClick={() => void desmarcar(d)}>Mudar para não treinei</button></div>;
  if (!marcavel(d)) return null;
  const hoje = d.date === today;
  return <div class={`sem-acts sem-marcar${hoje ? "" : " leve"}`}>
    {!hoje && <span class="small sub">Treinou?</span>}
    <button type="button" class={`btn${hoje ? " pri" : " ghost"}`} onClick={() => void marcar(d, true)}><Icon id="check" />Treinei</button>
    {podeNaoTreinei(d) && <button type="button" class={`btn${hoje ? "" : " ghost"}`} onClick={() => void marcar(d, false)}>Não treinei</button>}
  </div>;
}
