// #82 A divisão da pessoa ("Meu treino atual"): "Seguindo a sua divisão A/B/C/D" quando a semana segue, ou a sugestão
// (não imposição) "Manter minha divisão / Ajustar" quando ela deixa um músculo abaixo de 2× ou não fecha nos dias.
// "Manter" é respeitado (regra 5): a semana segue a divisão e só o risco fica à vista. Regra no core (divisao.ts).
// #139 Antes de Manter/Ajustar, uma prévia mostra o que muda nos dias que ainda não passaram e pede confirmação.
import * as C from "@ciclo/core";
import { S, commit, today } from "../../lib/store/index.ts";
import { SERVER, api, send } from "../../lib/api/index.ts";
import { SheetHead, closeSheet, openSheet } from "../../lib/folha/index.tsx";
import { Card, Icon, toast } from "../../lib/ui/index.tsx";
import { garantirSemana, regenerar } from "./estado.ts";
import type { Semana } from "./estado.ts";
import { diaCurto } from "./folhas.tsx";

/** A escolha muda o desenho da semana (passa a seguir ou deixa de seguir a divisão)? Só aí os dias abertos são refeitos. */
const mudaSemana = (d: C.DivisaoSemana, escolha: C.EscolhaDivisao) => d.seguindo !== (d.compativel || escolha === "manter");

async function escolher(d: C.DivisaoSemana, escolha: C.EscolhaDivisao): Promise<boolean> {
  const divisaoEscolha: C.DivisaoEscolha = { escolha, assinatura: d.assinatura };
  const perfil = S.profile as C.PerfilApp & { divisaoEscolha?: C.DivisaoEscolha };
  const antes = perfil.divisaoEscolha;
  perfil.divisaoEscolha = divisaoEscolha;
  commit();
  try { await send("PATCH", "/api/profile", { data: { divisaoEscolha } }); }
  catch { perfil.divisaoEscolha = antes; commit(); toast("Não deu para salvar a escolha. Tente de novo."); return false; }
  if (mudaSemana(d, escolha)) return regenerar(false);
  await garantirSemana(true);
  return true;
}

// ---------- prévia (o que muda) → confirmar ----------
// Fica aqui (chunk da Semana): estado.ts e folhas.tsx entram no JS inicial.
/** "Como ficaria" com a escolha: nada é salvo (servidor: regenerate sem apply; demonstração: o core no navegador). */
async function previaDivisao(divisaoEscolha: C.DivisaoEscolha): Promise<C.DayDiff[] | null> {
  try {
    return SERVER ? (await api<{ diff: C.DayDiff[] }>("POST", "/api/week/regenerate", { date: today, reset: false, divisaoEscolha })).diff
      : (await import("./demo.ts")).demo.regenerar(false, false, divisaoEscolha).diff;
  } catch (e: any) { toast(e?.status ? e.message : "Sem conexão"); return null; }
}
function ListaDiff({ carregando, diff, vazio }: { carregando: boolean; diff: C.DayDiff[] | null; vazio: string }) {
  return <div class="sem-diff" aria-live="polite">{carregando ? <p class="small sub">Calculando…</p>
    : !diff ? <p class="small">Não deu para calcular agora.</p> : !diff.length ? <p class="small">{vazio}</p>
    : diff.map((x) => <div key={x.date} class="sem-diff-dia"><p class="small"><b>{diaCurto(x.date)}</b> · <span class="sub">{x.before}</span> → <b>{x.after}</b></p>
      {x.lines.length > 0 && <ul>{x.lines.map((l, i) => <li key={i} class={l.startsWith("+") ? "mais" : l.startsWith("−") ? "menos" : ""}>{l}</li>)}</ul>}</div>)}</div>;
}
const pv: { d: C.DivisaoSemana | null; escolha: C.EscolhaDivisao; diff: C.DayDiff[] | null; carregando: boolean; salvando: boolean } =
  { d: null, escolha: "manter", diff: null, carregando: false, salvando: false };
function abrirPrevia(d: C.DivisaoSemana, escolha: C.EscolhaDivisao) {
  Object.assign(pv, { d, escolha, diff: null, carregando: true, salvando: false });
  openSheet(() => <Previa />);
  const pronto = (diff: C.DayDiff[] | null) => { if (pv.d === d && pv.escolha === escolha) { pv.diff = diff; pv.carregando = false; commit(); } };
  if (!mudaSemana(d, escolha)) pronto([]);
  else void previaDivisao({ escolha, assinatura: d.assinatura }).then(pronto);
}
function Previa() {
  const d = pv.d;
  if (!d) return null;
  const manter = pv.escolha === "manter";
  const confirmar = async () => { pv.salvando = true; commit(); const ok = await escolher(d, pv.escolha); pv.salvando = false; commit(); if (ok) closeSheet(); };
  return <><SheetHead kicker={`Sua divisão · ${d.letras}`} title={manter ? "Manter minha divisão" : "Ajustar para 2×"} />
    <p class="small sub" style="margin:6px 0 12px">{manter
      ? "A semana passa a seguir a sua divisão, na ordem do seu treino atual. O risco de músculo abaixo de 2× fica à vista."
      : "A semana é montada pelo método, com os exercícios que você já faz, para cada músculo pegar 2× por semana."}
      {" "}Muda só os dias que ainda não passaram e substitui os treinos desses dias, inclusive os da IA.</p>
    <ListaDiff carregando={pv.carregando} diff={pv.diff} vazio="Nada muda nos treinos desta semana: só a sua escolha fica salva." />
    <div class="row" style="margin-top:14px;gap:8px">
      <button type="button" class="btn" style="flex:1" onClick={closeSheet}>Cancelar</button>
      <button type="button" class="btn pri" style="flex:1" disabled={pv.carregando || pv.salvando || !pv.diff} onClick={confirmar}>
        {pv.salvando ? "Salvando…" : "Confirmar"}</button></div></>;
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
          <div class="sem-acts uma"><button type="button" class="btn" onClick={() => abrirPrevia(d, "ajustar")}>Ajustar para 2×</button></div>
        </>}
      </div></div></Card>;
  if (d.escolha === "ajustar") return null;
  return <Card cls="sem-aviso sem-div-sug">
    <p class="kicker">Sua divisão · {d.letras}</p>
    <h2 style="margin-top:4px">{d.avisos[0]}</h2>
    {d.avisos.slice(1).map((a) => <p key={a} class="small" style="margin-top:4px">{a}</p>)}
    <p class="small sub" style="margin-top:6px">Quer manter assim ou ajustar para 2× por semana? Ajustar monta a semana pelo método, com os exercícios que você já faz. Antes de mudar, você vê o que muda.</p>
    <div class="sem-acts">
      <button type="button" class="btn" onClick={() => abrirPrevia(d, "manter")}>Manter minha divisão</button>
      <button type="button" class="btn pri" onClick={() => abrirPrevia(d, "ajustar")}>Ajustar</button>
    </div>
  </Card>;
}
