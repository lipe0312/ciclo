// Aviso inline (não é modal) de dia planejado que passou sem treino: "Ontem era Superior. Não deu?".
// Aparece no Hoje e na Semana; a resposta grava a presença e reorganiza o resto da semana.
import { today } from "../../lib/store/index.ts";
import { Icon } from "../../lib/ui/index.tsx";
import { DOW_NM, addDays, dowIdx } from "../../lib/util.ts";
import { acaoDia, getSemana } from "./estado.ts";
import "./semana.css";

const quando = (d: string) => (d === addDays(today, -1) ? "Ontem" : `${DOW_NM[dowIdx(d)]} (${d.slice(8, 10)}/${d.slice(5, 7)})`);

export function AvisoFalta() {
  const s = getSemana();
  if (!s?.misses.length) return null;
  const date = s.misses[s.misses.length - 1];
  const d = s.days.find((x) => x.date === date);
  const nome = d?.plan?.name ?? "dia de treino";
  const resp = (resposta: string, ok: string) => acaoDia(date, { action: "falta", resposta }, ok);
  return <div class="card sem-aviso" role="status">
    <div class="row start"><Icon id="warn" style="color:var(--warn);margin-top:2px" /><div style="flex:1;min-width:0">
      <h3>{quando(date)} era {nome}. Não deu?</h3>
      <p class="small sub" style="margin-top:4px">{s.misses.length > 1 ? `Mais ${s.misses.length - 1} dia(s) sem resposta. ` : ""}Responder reorganiza o resto da semana.</p>
      <div class="sem-acts">
        <button type="button" class="btn" onClick={() => resp("fui", "Marcado: fui")}><Icon id="check" />Fui e esqueci de marcar</button>
        <button type="button" class="btn pri" onClick={() => resp("nao_fui", "Volume redistribuído nos próximos dias")}>Não fui · reorganizar</button>
        <button type="button" class="btn" onClick={() => resp("folga", "Folga registrada")}>Folga planejada</button>
      </div></div></div></div>;
}
