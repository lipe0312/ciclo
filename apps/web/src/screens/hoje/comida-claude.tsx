// Comida do dia e da semana (proteína e kcal de hoje + média de 7 dias vs a meta) e o cartão do Claude (#29).
import * as C from "@ciclo/core";
import { S } from "../../lib/store/index.ts";
import { Card, Icon } from "../../lib/ui/index.tsx";
import { BarraSimples } from "../../lib/grafico/index.tsx";
import { fmt } from "../../lib/util.ts";
import { Painel } from "./paineis.tsx";

const Linha = ({ nome, valor, meta, pct, un }: { nome: string; valor: number | null; meta: number; pct: number | null; un: string }) =>
  <div class="hm-linha"><div class="row between wrapx" style="gap:6px"><span class="small">{nome}</span>
    <span class="small num"><b>{valor == null ? "—" : fmt(valor)}</b> / {fmt(meta)} {un}{pct != null && <span class="sub"> · {pct}%</span>}</span></div>
    <BarraSimples pct={pct ?? 0} color="var(--acc)" /></div>;

export function ComidaPainel({ c }: { c: C.HomeView["comida"] }) {
  return <Painel titulo="Comida" resumo={<span class="small sub num">{c.daysLogged} de 7 dias registrados</span>} alterar={["Registrar comida", "#comida"]} detalhe={["Ajustar metas", "#perfil/comida"]}>
    <p class="kicker" style="margin-top:10px">Hoje</p>
    <Linha nome="Proteína" valor={c.hoje.prot} meta={c.metaProt} pct={c.metaProt ? Math.round((c.hoje.prot / c.metaProt) * 100) : null} un="g" />
    <Linha nome="Calorias" valor={c.hoje.kcal} meta={c.metaKcal} pct={c.metaKcal ? Math.round((c.hoje.kcal / c.metaKcal) * 100) : null} un="kcal" />
    <p class="kicker" style="margin-top:12px">Média dos últimos 7 dias</p>
    {c.daysLogged ? <>
      <Linha nome="Proteína" valor={c.avgProt} meta={c.metaProt} pct={c.protPct} un="g" />
      <Linha nome="Calorias" valor={c.avgKcal} meta={c.metaKcal} pct={c.kcalPct} un="kcal" /></>
      : <p class="small sub" style="margin-top:6px">Sem comida registrada nestes 7 dias. A média só conta os dias com registro.</p>}
  </Painel>;
}

const curto = (t: string, n = 150) => (t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t);
/** Último pedido ao Claude: pendente (aguardando) ou a última resposta, com atalho para o chat. Texto vira nó de texto (nunca HTML). */
export function ClaudeCard() {
  const lista = [...(S.inbox as { id: string; text: string; status: string; response?: string | null; created_at: number }[])].sort((a, b) => b.created_at - a.created_at);
  const pend = lista.find((x) => x.status === "pendente");
  const resp = lista.find((x) => x.response);
  return <Card cls="hm-painel"><div class="row between wrapx" style="gap:8px"><h2>Claude</h2>{pend ? <span class="badge warn">pedido pendente</span> : resp ? <span class="badge ok">respondido</span> : null}</div>
    {pend ? <><p class="small" style="margin-top:6px">Você pediu: “{curto(pend.text, 110)}”</p><p class="small sub">O Claude responde quando você abrir o chat dele e processar a caixa.</p></>
      : resp ? <><p class="small sub" style="margin-top:6px">Última resposta</p><p class="small">{curto(resp.response ?? "")}</p></>
        : <p class="small sub" style="margin-top:6px">Peça ajustes de treino, comida ou dor. Os pedidos ficam numa caixa que o Claude lê pelo connector.</p>}
    <div class="hm-ctas"><a class="btn sm pri" href="#claude"><Icon id="chat" />Abrir o chat</a></div></Card>;
}
