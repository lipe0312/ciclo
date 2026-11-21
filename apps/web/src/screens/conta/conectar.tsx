// #55/#133 Conexões do conector (MCP) da conta, dentro de Perfil → Sua IA: a lista (login pelo Face ID ou chave manual),
// com estado, último uso e Revogar; e o plano B (chave manual + cabeçalho) para a IA que não abre a tela do Ciclo.
// O guia de cada IA fica no core (GUIAS_IA). A chave do conector é da conta: a IA com ela só vê e altera os dados dela.
import { useEffect, useState } from "preact/hooks";
import * as C from "@ciclo/core";
import { api } from "../../lib/api/index.ts";
import { Icon, toast } from "../../lib/ui/index.tsx";
import { copiar, urlConector } from "../../lib/sua-ia/guia.tsx";
import { recarregarContaIa } from "../../lib/sua-ia/estado.ts";
import { comFaceId } from "../entrar/webauthn.ts";

export interface Chave extends C.TokenInfo, C.EstadoToken { id: string; label: string; kind?: string }
interface Lista { tokens: Chave[]; max: number; ativos: number }

const dia = (ms: number | null) => (ms ? new Date(ms).toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: "numeric" }) : "nunca");

function Campo({ rotulo, valor, oque }: { rotulo: string; valor: string; oque: string }) {
  return <div class="cn-campo"><span class="tiny sub">{rotulo}</span>
    <div class="cn-valor"><code class="mono">{valor}</code>
      <button type="button" class="btn sm" onClick={() => copiar(valor, `${oque} copiado`)} aria-label={`Copiar ${oque}`}>Copiar</button></div></div>;
}

/** Conexões da conta. `naoPrincipal`: a principal da pessoa usa chave de API (a conexão continua, com Revogar). */
export function Conexoes({ naoPrincipal = false }: { naoPrincipal?: boolean }) {
  const [lista, setLista] = useState<Lista | null>(null);
  const [nova, setNova] = useState<{ id: string; token: string } | null>(null);
  const [busy, setBusy] = useState("");
  const [erro, setErro] = useState("");
  const load = async () => { setLista(await api<Lista>("GET", "/api/account/tokens")); void recarregarContaIa(); };
  useEffect(() => { load().catch(() => setErro("Não deu para carregar as conexões.")); }, []);
  const act = async (id: string, f: () => Promise<void>) => {
    setErro(""); setBusy(id);
    try { await f(); } catch (e) { setErro(e instanceof Error ? e.message : "Algo deu errado."); } finally { setBusy(""); }
  };
  const gerar = () => act("gerar", async () => {
    const r = await comFaceId(() => api<{ id: string; token: string }>("POST", "/api/account/tokens", { label: "Chave manual" })); // #62: Face ID
    setNova({ id: r.id, token: r.token }); await load();
  });
  const revogar = (k: Chave) => act("r" + k.id, async () => {
    await api("DELETE", `/api/account/tokens/${encodeURIComponent(k.id)}`);
    if (nova?.id === k.id) setNova(null);
    toast("Conexão revogada: para na próxima chamada"); await load();
  });
  const visiveis = (lista?.tokens ?? []).filter((k) => k.estado !== "revogado");
  const cheio = !!lista && lista.ativos >= lista.max;
  return <section class="card conta-sec" aria-labelledby="sia-cx">
    <h2 id="sia-cx">Conexões do conector</h2>
    <p class="tiny sub">Conexão sem uso há {C.TOKEN_IDLE_DAYS} dias expira sozinha. Revogar corta na hora.{naoPrincipal ? " Não é a sua IA principal, mas continua funcionando." : ""}</p>
    {erro && <div class="note entrar-erro" role="alert"><Icon id="warn" />{erro}</div>}
    {lista && !visiveis.length && <p class="small sub">Nenhuma conexão ainda.</p>}
    <ul class="conta-list">{visiveis.map((k) => <li key={k.id}>
      <div><strong class="cn-rotulo">{k.label}</strong>
        {naoPrincipal && <span class="badge" style="margin-left:6px">não é a principal</span>}
        {k.estado === "expirando" && <span class="badge warn" style="margin-left:6px">expira em <span class="num">{k.diasRestantes}</span> d</span>}
        {k.estado === "expirado" && <span class="badge bad" style="margin-left:6px">expirou: reconecte</span>}
        <p class="tiny sub">{k.kind === "oauth" ? "Login pelo Face ID" : "Chave manual"} · criada em {dia(k.createdAt)} · último uso {dia(k.lastUsedAt)}</p></div>
      <button type="button" class="btn sm" disabled={!!busy} aria-label={`${k.estado === "expirado" ? "Remover" : "Revogar"} ${k.label}`} onClick={() => revogar(k)}>{k.estado === "expirado" ? "Remover" : "Revogar"}</button>
    </li>)}</ul>
    <details class="cx-mais"><summary>Plano B: chave manual</summary>
      <p class="small sub">Para a IA que não abre a tela do Ciclo: gere uma chave e preencha a URL e o cabeçalho no conector dela.</p>
      {nova ? <><Campo rotulo="URL do conector" valor={urlConector()} oque="URL" />
        <Campo rotulo="Cabeçalho" valor={C.cabecalhoAuth(nova.token)} oque="Cabeçalho" />
        <p class="tiny sub"><Icon id="warn" style="width:12px;height:12px;color:var(--warn)" /> Aparece só agora: no banco fica só uma impressão dela.</p></>
        : <button type="button" class="btn full" disabled={!!busy || cheio} onClick={gerar}><Icon id="key" />{cheio ? `Máximo de ${lista?.max} chaves: revogue uma` : busy === "gerar" ? "Gerando…" : "Gerar chave manual"}</button>}
    </details>
  </section>;
}
