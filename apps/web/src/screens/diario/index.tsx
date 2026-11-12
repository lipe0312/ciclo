// Diário (#27): check-in da manhã, checkout da noite (todo dia), saúde da semana e calendário de 7/30 dias.
// Rotas: #diario · #diario/checkout · #diario/resumo (dias sem abrir) · #diario/exames.
import { useEffect } from "preact/hooks";
import type { Route } from "../../lib/roteador/index.ts";
import { SERVER } from "../../lib/api/index.ts";
import { today } from "../../lib/store/index.ts";
import { longDate } from "../../lib/util.ts";
import { D } from "../../lib/diario/estado.ts";
import { Checkin } from "./checkin.tsx";
import { CheckoutCard } from "./checkout.tsx";
import { Calendario } from "./calendario.tsx";
import { Saude } from "./saude.tsx";
import { Resumo } from "./resumo.tsx";
import { Exames } from "./exames.tsx";
import "./diario.css";

export default function Diario({ route }: { route: Route }) {
  const sub = route.parts[0];
  useEffect(() => { if (sub === "checkout") document.getElementById("checkout")?.scrollIntoView({ block: "start" }); }, [sub]);
  if (sub === "exames") return <Exames />;
  if (sub === "resumo") return <><p class="kicker">Diário</p><h1 style="margin-bottom:14px">Resumo dos dias</h1><Resumo key={`${D.reminder.absence?.from}-${D.reminder.absence?.to}`} /></>; // remonta quando o intervalo carrega
  return <>
    <div style="margin-bottom:14px"><p class="kicker">{longDate(today)}{SERVER ? "" : " · demonstração"}</p><h1>Diário</h1></div>
    {D.failed && <p class="small sub" role="status" style="margin-bottom:10px">Sem conexão: mostrando o que está no aparelho.</p>}
    <div class="grid dash"><div class="stack"><Checkin /><CheckoutCard key={D.sel} /></div>
      <div class="stack"><Saude /><Calendario /></div></div>
  </>;
}
