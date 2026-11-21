// #82 A divisão da pessoa ("Meu treino atual"): "Seguindo a sua divisão A/B/C/D" quando a semana segue, ou a sugestão
// (não imposição) "Manter minha divisão / Ajustar" quando ela deixa um músculo abaixo de 2× ou não fecha nos dias.
// "Manter" é respeitado (regra 5): a semana segue a divisão e só o risco fica à vista. Regra no core (divisao.ts).
import * as C from "@ciclo/core";
import { S, commit } from "../../lib/store/index.ts";
import { send } from "../../lib/api/index.ts";
import { Card, Icon, toast } from "../../lib/ui/index.tsx";
import { garantirSemana, regenerar } from "./estado.ts";
import type { Semana } from "./estado.ts";

async function escolher(d: C.DivisaoSemana, escolha: C.EscolhaDivisao) {
  const divisaoEscolha: C.DivisaoEscolha = { escolha, assinatura: d.assinatura };
  const perfil = S.profile as C.PerfilApp & { divisaoEscolha?: C.DivisaoEscolha };
  const antes = perfil.divisaoEscolha;
  perfil.divisaoEscolha = divisaoEscolha;
  commit();
  try { await send("PATCH", "/api/profile", { data: { divisaoEscolha } }); }
  catch { perfil.divisaoEscolha = antes; commit(); toast("Não deu para salvar a escolha. Tente de novo."); return; }
  // a semana refaz os dias que ainda não passaram só quando muda o desenho (passa a seguir ou deixa de seguir a divisão)
  if (d.seguindo !== (d.compativel || escolha === "manter")) await regenerar(false);
  else await garantirSemana(true);
}

export function DivisaoCard({ s }: { s: Semana }) {
  const d = s.divisao;
  if (!d) return null;
  const frase = `Seguindo a sua divisão ${d.letras}`;
  if (d.seguindo) return <Card cls="sem-div">
    <div class="row start" style="gap:10px"><Icon id="check" style="color:var(--ok);margin-top:2px;flex:none" />
      <div style="min-width:0;flex:1"><h2 class="sem-div-t">{frase}</h2>
        <p class="small sub" style="margin-top:4px">{d.tipo === "outra" ? "A sua divisão" : `Divisão ${d.nome}`}, na ordem do seu treino atual. O app só ajusta volume e exercícios.</p>
        {d.escolha === "manter" && d.avisos.length > 0 && <>
          <p class="small sem-div-risco">{d.avisos.join(" ")} Você escolheu manter assim.</p>
          <div class="sem-acts uma"><button type="button" class="btn sm" onClick={() => escolher(d, "ajustar")}>Ajustar para 2×</button></div>
        </>}
      </div></div></Card>;
  if (d.escolha === "ajustar") return null;
  return <Card cls="sem-aviso">
    <p class="kicker">Sua divisão · {d.letras}</p>
    <h2 style="margin-top:4px">{d.avisos[0]}</h2>
    {d.avisos.slice(1).map((a) => <p key={a} class="small" style="margin-top:4px">{a}</p>)}
    <p class="small sub" style="margin-top:6px">Quer manter assim ou ajustar para 2× por semana? Ajustar monta a semana pelo método, com os exercícios que você já faz.</p>
    <div class="sem-acts">
      <button type="button" class="btn" onClick={() => escolher(d, "manter")}>Manter minha divisão</button>
      <button type="button" class="btn pri" onClick={() => escolher(d, "ajustar")}>Ajustar</button>
    </div>
  </Card>;
}
