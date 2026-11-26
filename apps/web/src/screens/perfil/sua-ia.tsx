// #133 Perfil → Sua IA (#perfil/ia): uma tela só, no lugar de "Conectar Chat" e "Chaves de IA". As mesmas 2 escolhas dos
// Primeiros passos (editáveis), o status (estadoIA do core), o guia de cada caminho, as conexões do conector e as chaves
// de API (cofre da #88). Mudar a IA não apaga conexão nem chave: ficam como "não é a principal", com Revogar.
// #140 Avançado (recolhido): modelo e esforço por tipo de pedido (avancado.tsx, em chunk à parte).
import type { ComponentType } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import * as C from "@ciclo/core";
import { S, commit } from "../../lib/store/index.ts";
import { profileChanged } from "../../lib/store/regras.ts";
import { SERVER } from "../../lib/api/index.ts";
import { Card, Icon } from "../../lib/ui/index.tsx";
import { ComoUsa, EscolhaIa } from "../../lib/sua-ia/escolha.tsx";
import { Guia } from "../../lib/sua-ia/guia.tsx";
import { useEstadoIa } from "../../lib/sua-ia/estado.ts";
import { Conexoes } from "../conta/conectar.tsx";
import "../../lib/sua-ia/sua-ia.css";

const mudou = () => { profileChanged(); commit(); };
const ESTADO_TXT: Record<C.EstadoIa["estado"], string> = { nenhum: "Nada configurado ainda", conector: "Conector ligado", chave: "Chave de API ligada", ambos: "Conector e chave de API ligados" };
const CONECTOR_TXT: Record<C.EstadoConector, [string, string]> = {
  ativo: ["conectado", "ok"], pendente: ["falta testar", "warn"], expirado: ["expirou: reconectar", "bad"], nenhum: ["falta configurar", ""],
};

export default function SuaIa() {
  const e = useEstadoIa();
  const [Chaves, setChaves] = useState<ComponentType<{ demo?: boolean; inicial?: C.ProvedorIa }> | null>(null);
  const [inicial, setInicial] = useState<C.ProvedorIa | undefined>(undefined);
  const chavesRef = useRef<HTMLDivElement>(null);
  // #140 o Avançado (modelo e esforço por tipo de pedido) baixa só quando a pessoa abre
  const [Avancado, setAvancado] = useState<ComponentType | null>(null);
  const abrirAvancado = (aberto: boolean) => { if (aberto && !Avancado) import("./avancado.tsx").then((m) => setAvancado(() => m.default)).catch(() => {}); };
  // as chaves em chunk à parte (orçamento de JS por tela)
  useEffect(() => { import("../conta/chaves.tsx").then((m) => setChaves(() => m.Chaves)).catch(() => {}); }, []);
  const irParaChave = (p: C.ProvedorIa) => { setInicial(p); (chavesRef.current as (HTMLElement & { scrollIntoView?: (o: object) => void }) | null)?.scrollIntoView?.({ block: "start" }); };
  const ia = S.profile.ia;
  const cs = C.caminhos(ia);
  const conector = e?.conta.conector ?? "nenhum";
  const usaConector = cs.some((p) => p.caminho === "conector") || conector !== "nenhum";
  return <div class="sia">
    <p class="kicker">Perfil</p><h1>Sua IA</h1>
    <p class="sub sia-resumo">{C.resumoCaminho(ia)}</p>
    {e && <p class="small" role="status"><span class={`badge ${e.estado.estado === "nenhum" ? "" : "ok"}`}>{ESTADO_TXT[e.estado.estado]}</span></p>}

    <Card><h2>Qual IA você usa?</h2><p class="small sub">Pode marcar mais de uma.</p><div class="sia-campo"><EscolhaIa onMudou={mudou} /></div></Card>
    {ia && <Card><h2>Como você usa?</h2><div class="sia-campo"><ComoUsa onMudou={mudou} /></div></Card>}

    {cs.length > 0 && <section class="stack" aria-labelledby="sia-guias"><h2 id="sia-guias">Guia</h2>
      {cs.map((p) => <Card key={`${p.ia}-${p.guia}`}>
        <div class="row between wrapx sia-topo"><span class="small"><b>{p.nomeIa}</b>{p.principal && cs.length > 1 ? " · principal" : ""}</span>
          {p.caminho === "conector" && e && <span class={`badge ${CONECTOR_TXT[conector][1]}`}>{CONECTOR_TXT[conector][0]}</span>}
          {p.caminho === "chave" && e && <span class={`badge ${e.conta.chaves.some((k) => k.ativo && k.provedor === p.provedorChave) ? "ok" : ""}`}>
            {e.conta.chaves.some((k) => k.ativo && k.provedor === p.provedorChave) ? "chave ativa" : "falta a chave"}</span>}</div>
        <Guia passo={p} onChave={irParaChave} conectado={p.caminho === "conector" ? conector === "ativo" : undefined} />
      </Card>)}</section>}

    {SERVER && usaConector && <Conexoes naoPrincipal={!!e?.estado.conectorNaoPrincipal && conector !== "nenhum"} />}

    <div ref={chavesRef} class="sia-chaves" id="chaves">
      <h2>Chaves de API</h2>
      {e && e.estado.chavesNaoPrincipais.length > 0 && <p class="tiny sub">Chaves que não são da sua IA principal continuam valendo; desative ou apague quando quiser.</p>}
      {Chaves ? <Chaves demo={!SERVER} inicial={inicial} /> : <p class="small sub" aria-busy="true">Carregando…</p>}
    </div>

    <details class="cx-mais" onToggle={(e) => abrirAvancado((e.currentTarget as HTMLDetailsElement).open)}><summary>Avançado</summary>
      {Avancado ? <Avancado /> : <p class="small sub" aria-busy="true">Carregando…</p>}
    </details>
    <p class="tiny sub sia-rodape"><Icon id="info" style="width:12px;height:12px" /> Dá para trocar a qualquer hora. Trocar a IA não apaga conexões nem chaves.</p>
  </div>;
}
