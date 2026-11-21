// #134 Pedidos da rotina, à parte da conversa: faixa recolhida no topo ("2 pedidos na rotina ▾"). Aberta, cada pedido com a
// IA de destino, status, hora e Abrir / Cancelar / Aplicar; o status honesto da fila fica aqui dentro. Sem pedidos, nada.
import { useState } from "preact/hooks";
import * as CH from "@ciclo/core/chat";
import { S } from "../../lib/store/index.ts";
import { Icon, toast } from "../../lib/ui/index.tsx";
import { applyInbox, dropInbox, hhmm } from "./caixa.tsx";
import { StatusFila, useClaude } from "./memoria.tsx";

const ROTULO: Record<CH.StatusPedido, [string, string]> = { aguardando: ["aguardando", "warn"], respondido: ["respondido", "ok"], erro: ["erro", "bad"] };

/** "Abrir no <IA>": link com o prompt quando a IA aceita (e o texto é curto e não sensível); senão, o bloco com Copiar. */
export function MiniPrompt({ ia, texto }: { ia: CH.IaDoCaminho | null; texto: string }) {
  const mp = CH.miniPrompt(ia, texto);
  if (mp.url) return <a class="btn sm" href={mp.url} target="_blank" rel="noopener noreferrer"><Icon id="chat" />Abrir no {mp.nome}</a>;
  const copiar = () => navigator.clipboard?.writeText(mp.prompt).then(() => toast("Copiado"), () => toast("Selecione o texto e copie"));
  return <div class="ch-mini">
    <p class="tiny sub">Abra o {mp.nome} e cole este pedido:</p>
    <code class="ch-prompt">{mp.prompt}</code>
    <button type="button" class="btn sm" onClick={copiar}><Icon id="check" />Copiar</button>
  </div>;
}

function Pedido({ m, ia }: { m: any; ia: CH.IaDoCaminho | null }) {
  const [abrir, setAbrir] = useState(false);
  const st = CH.statusPedido(m)!;
  const [rot, cls] = ROTULO[st];
  const diff: { minus?: string; plus?: string }[] | null = m.change?.diff ?? (m.change?.itens ? m.change.itens.map((t: string) => ({ plus: t })) : null);
  return <li class="ch-pedido">
    <div class="row between start" style="gap:8px">
      <p class="small ch-txt">{m.text}</p>
      <span class={`badge ${cls}`}>{rot}</span>
    </div>
    <p class="tiny sub">para {ia?.nome ?? "sua IA"}{m.created_at ? ` · ${hhmm(m.created_at)}` : ""}</p>
    {m.response && <div class="msg small ch-resp"><span class="ch-txt">{m.response}</span>
      {!!diff?.length && <div class="diff">{diff.map((d, i) => <div key={i}>{d.minus && <div class="minus">− {d.minus}</div>}{d.plus && <div class="plus">+ {d.plus}</div>}</div>)}</div>}</div>}
    <div class="row wrapx ch-acoes">
      {st === "aguardando" && <button type="button" class="btn sm ghost" aria-expanded={abrir} onClick={() => setAbrir(!abrir)}><Icon id="arrow" />Abrir</button>}
      {CH.podeAplicar(m) && <button type="button" class="btn sm pri" onClick={() => applyInbox(m)}><Icon id="check" />Aplicar</button>}
      <button type="button" class="btn sm ghost" onClick={() => { dropInbox(m); toast("Pedido cancelado"); }}><Icon id="x" />Cancelar</button>
    </div>
    {abrir && st === "aguardando" && <MiniPrompt ia={ia} texto={m.text} />}
  </li>;
}

export function FaixaPedidos({ ia }: { ia: CH.IaDoCaminho | null }) {
  const [aberta, setAberta] = useState(false);
  const info = useClaude();
  const lista = CH.pedidosDaFaixa(S.inbox as CH.PedidoRotina[]);
  if (!lista.length) return null;
  return <section class={`ch-faixa${aberta ? " on" : ""}`} aria-label="Pedidos da rotina">
    <button type="button" class="ch-faixa-btn" aria-expanded={aberta} aria-controls="ch-faixa-lista" onClick={() => setAberta(!aberta)}>
      <Icon id="clock" /><span>{CH.resumoFaixa(lista.length)}</span><Icon id="arrow" cls="ch-seta" />
    </button>
    {aberta && <div id="ch-faixa-lista" class="ch-faixa-corpo">
      <StatusFila info={info} />
      <ul class="ch-pedidos">{lista.map((m) => <Pedido key={m.id} m={m} ia={ia} />)}</ul>
    </div>}
  </section>;
}
