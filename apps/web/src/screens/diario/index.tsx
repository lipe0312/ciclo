// Diário (#27, #42): check-in da manhã, checkout da noite (todo dia), saúde da semana e calendário de 7/30 dias.
// Rotas: #diario · #diario/checkout[/<data>] · #diario/resumo (recap do período) · #diario/treinar · #diario/exames.
import { useEffect } from "preact/hooks";
import type { Route } from "../../lib/roteador/index.ts";
import { SERVER } from "../../lib/api/index.ts";
import { commit, today } from "../../lib/store/index.ts";
import { longDate } from "../../lib/util.ts";
import { Icon } from "../../lib/ui/index.tsx";
import { D } from "../../lib/diario/estado.ts";
import { Checkin } from "./checkin.tsx";
import { CheckoutCard } from "./checkout.tsx";
import { Calendario } from "./calendario.tsx";
import { Saude } from "./saude.tsx";
import { Recap } from "./recap.tsx";
import { Treinar } from "./treinar.tsx";
import { Exames } from "./exames.tsx";
import "./diario.css";

export default function Diario({ route }: { route: Route }) {
  const sub = route.parts[0];
  const dia = route.parts[1];
  useEffect(() => {
    if (sub !== "checkout") return;
    // a faixa abre o checkout do dia certo (ontem ou hoje); enviar faz a faixa sumir na hora
    if (dia && /^\d{4}-\d{2}-\d{2}$/.test(dia) && dia <= today && D.sel !== dia) { D.sel = dia; commit(); }
    requestAnimationFrame(() => document.getElementById("checkout")?.scrollIntoView({ block: "start" }));
  }, [sub, dia]);
  if (sub === "exames") return <Exames />;
  if (sub === "resumo") return <Recap />;
  if (sub === "treinar") return <Treinar />;
  return <>
    <div class="row between" style="margin-bottom:14px;gap:12px"><div><p class="kicker">{longDate(today)}{SERVER ? "" : " · demonstração"}</p><h1>Diário</h1></div>
      <a class="btn sm" href="#diario/exames"><Icon id="info" />Exames</a></div>
    {D.failed && <p class="small sub" role="status" style="margin-bottom:10px">Sem conexão: mostrando o que está no aparelho.</p>}
    <div class="grid dash"><div class="stack"><Checkin /><CheckoutCard key={D.sel} /></div>
      <div class="stack"><Saude /><Calendario /></div></div>
  </>;
}
