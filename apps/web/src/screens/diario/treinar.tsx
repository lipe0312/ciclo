// "Vai treinar hoje?" → Sim (#42): sugere o treino da semana que mais cobre os músculos abaixo de 2× (core: sugerirTreinoHoje)
// e "Começar" traz esse dia para hoje. Sem treino que ajude: o extra do dia (se houver) ou descanso. "Hoje não" segue para a Comida.
import { useEffect } from "preact/hooks";
import { C, S, today } from "../../lib/store/index.ts";
import { mName } from "../../lib/store/regras.ts";
import { Card, Icon } from "../../lib/ui/index.tsx";
import { go } from "../../lib/roteador/index.ts";
import { longDate } from "../../lib/util.ts";
import { responderTreino } from "../../lib/diario/estado.ts";
import { acaoDia, diaDe, garantirSemana, getSemana } from "../semana/estado.ts";

const lista = (ms: string[]) => ms.map(mName).join(", ").replace(/, ([^,]*)$/, " e $1");

export function Treinar() {
  useEffect(() => { garantirSemana().catch(() => {}); }, []);
  const s = getSemana(), hoje = diaDe(today);
  const futuros = (s?.days ?? []).filter((d) => d.date > today && d.status === "planejado" && d.plan?.items.length)
    .map((d) => ({ date: d.date, name: d.plan!.name, perMuscle: d.plan!.perMuscle as Record<string, number> }));
  const sug = s ? C.sugerirTreinoHoje(futuros, S.week.freq, s.targets as Record<string, number>, S.profile.priorities) : null;
  const extra = hoje?.status === "livre" && s?.extraToday?.items.length ? s.extraToday : null;
  const nao = () => { responderTreino("nao"); go("#comida"); };
  async function comecar() {
    responderTreino("sim");
    if (sug && !(await acaoDia(sug.date, { action: "mover", to: today }, "Treino trazido para hoje"))) return;
    go("#treino");
  }
  return <>
    <p class="kicker">Diário · {longDate(today)}</p><h1 style="margin-bottom:14px">Vai treinar hoje?</h1>
    {!s ? <Card><p class="small sub">Carregando a semana…</p></Card>
      : sug ? <Card cls="hl">
        <p class="kicker">O que mais ajuda a semana</p><h2 style="margin-top:2px">{sug.name}</h2>
        <p class="small" style="margin-top:6px">Cobre <b>{lista(sug.cobre)}</b>, que ainda {sug.cobre.length > 1 ? "estão" : "está"} abaixo de 2× na semana. Era de {longDate(sug.date)}: vem para hoje e a semana se reorganiza.</p>
        <button type="button" class="btn pri full" style="margin-top:14px" onClick={comecar}>Começar<Icon id="arrow" /></button>
        <button type="button" class="btn full" style="margin-top:8px" onClick={nao}>Hoje não · registrar comida</button></Card>
      : extra ? <Card cls="hl">
        <p class="kicker">Treino extra de hoje</p><h2 style="margin-top:2px">{extra.name}</h2>
        <p class="small sub" style="margin-top:6px">{extra.why[0]}</p>
        <button type="button" class="btn pri full" style="margin-top:14px" onClick={comecar}>Começar<Icon id="arrow" /></button>
        <button type="button" class="btn full" style="margin-top:8px" onClick={nao}>Hoje não · registrar comida</button></Card>
      : <Card><h2>A semana já está coberta</h2><p class="small sub" style="margin-top:6px">Nenhum treino que falta cobre um músculo abaixo de 2×. Descanso também é treino.</p>
        <button type="button" class="btn pri full" style="margin-top:14px" onClick={nao}>Registrar comida<Icon id="arrow" /></button></Card>}
  </>;
}
