// Carrossel da semana (#29): um card por dia, hoje no centro, didático (status, grupos, minutos, academia).
// CTAs: Começar (hoje), Ver, Trocar geração e Ver semana inteira. Nada de formulário aberto aqui: trocar abre a folha da Semana.
import * as C from "@ciclo/core";
import { S, today } from "../../lib/store/index.ts";
import { gymById, mName } from "../../lib/store/regras.ts";
import { href } from "../../lib/roteador/index.ts";
import { Carrossel } from "../../lib/carrossel/index.tsx";
import { Card, Icon } from "../../lib/ui/index.tsx";
import { DOW_NM, dowIdx } from "../../lib/util.ts";
import { garantirSemana, getSemana, getVazio } from "../semana/estado.ts";
import type { Dia } from "../semana/estado.ts";
import { abrirTrocar, aberto } from "../semana/folhas.tsx";
import { STATUS } from "../semana/index.tsx";

const GRUPOS: Record<string, string> = { sup: "Superior", inf: "Inferior" };
const rodando = () => !!S.session && !S.session.finishedAt;

function CardDia({ d }: { d: Dia }) {
  const ehHoje = d.date === today;
  const p = d.kind !== "folga" || d.status === "extra" ? d.plan : null;
  const gym = gymById(d.gymId)?.name;
  const extra = d.status === "livre" && !!getSemana()?.extraToday?.items.length;
  const musc = p ? Object.entries(p.perMuscle).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([m, n]) => `${mName(m)} ${n}`).join(" · ") : "";
  return <div class={`hm-dia st-${d.status}${ehHoje ? " hoje" : ""}`}>
    <div class="row between start" style="gap:8px">
      <p class="kicker">{DOW_NM[dowIdx(d.date)]} {Number(d.date.slice(8, 10))}{ehHoje ? " · hoje" : ""}</p>
      <span class={`sem-st st-${d.status}`}>{STATUS[d.status]}</span></div>
    <h3 class="hm-dia-nome">{p ? p.name : d.status === "folga" ? "Folga" : d.status === "livre" ? "Dia livre" : "Sem treino"}</h3>
    {p ? <>
      <p class="small sub num">{p.groups.map((g) => GRUPOS[g]).join(" + ")} · {p.items.length} exercícios · {p.setsTotal} séries</p>
      <p class="small num"><Icon id="clock" /> ~{p.estMinutes} min{gym ? <> · <Icon id="gym" /> {gym}</> : null}</p>
      {musc && <p class="tiny sub">{musc}</p>}
    </> : <p class="small sub">{d.status === "folga" ? "Descansar também conta." : extra ? "Treinar hoje vira extra: só o que falta, sem passar do orçamento." : "Nada planejado para este dia."}</p>}
    {d.cardio && <p class="tiny">Cardio {d.cardio.minutes} min · {C.INTENSITIES[d.cardio.intensity].nm.toLowerCase()}</p>}
    <div class="hm-acts">
      {ehHoje && p && d.status !== "feito" && <a class="btn pri" href="#treino">{rodando() ? "Continuar" : "Começar"} <Icon id="arrow" /></a>}
      {extra && <a class="btn pri" href={href("semana", ["dia", d.date])}>Ver extra</a>}
      {(p || d.status === "feito") && <a class="btn" href={href("semana", ["dia", d.date])}>Ver</a>}
      {aberto(d) && d.kind !== "folga" && <button type="button" class="btn" onClick={() => abrirTrocar(d)}><Icon id="swap" />Trocar geração</button>}
    </div></div>;
}

export function SemanaCarrossel() {
  const s = getSemana();
  if (!s) {
    const vazio = getVazio();
    return <Card><div class="row between wrapx"><h2>Sua semana</h2><span class="badge">{vazio ? "ainda sem plano" : "carregando"}</span></div>
      {vazio ? <><p class="small sub" style="margin-top:6px">{vazio}</p><a class="btn pri" style="margin-top:10px" href="#primeiros-passos">Primeiros passos<Icon id="arrow" /></a></>
        : <><div class="hm-esq" style="height:150px;margin-top:10px" aria-hidden="true" /><button type="button" class="btn" style="margin-top:10px" onClick={() => void garantirSemana(true)}>Tentar de novo</button></>}</Card>;
  }
  const treinos = s.days.filter((d) => d.kind !== "folga").length;
  const hoje = Math.max(0, s.days.findIndex((d) => d.date === today));
  return <div class="hm-sem">
    <div class="row between wrapx" style="gap:8px;margin-bottom:8px"><h2>Sua semana</h2><span class="small sub num">{treinos} treinos · fecha em {s.closePct}%</span></div>
    <Carrossel items={s.days.map((d) => <CardDia key={d.date} d={d} />)} label="Dias da semana" inicial={hoje} cls="sem" />
    <a class="btn full" href="#semana"><Icon id="cal" />Ver semana inteira</a>
  </div>;
}
