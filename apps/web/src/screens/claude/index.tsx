// Tela Chat (#30 → #134): layout de app de IA. Topo com "Chat" + a IA da chave (seletor só desta conversa) e o menu ⋯
// (Conversas, Nova conversa, Memória do Chat, Como mudar seu treino). Faixa recolhida com os pedidos da rotina, balões e o
// composer fixo. O caminho de cada envio vem do estadoIA (#133): nenhum, só conector, chave ou ambos, para qualquer IA.
import { useEffect, useRef, useState } from "preact/hooks";
import * as C from "@ciclo/core";
import * as CH from "@ciclo/core/chat";
import type { Route } from "../../lib/roteador/index.ts";
import { replace } from "../../lib/roteador/index.ts";
import { S, commit, useStore } from "../../lib/store/index.ts";
import { Card, Icon } from "../../lib/ui/index.tsx";
import { SheetHead, closeSheet, openSheet } from "../../lib/folha/index.tsx";
import { useEstadoIa } from "../../lib/sua-ia/estado.ts";
import { ClaudeLigado, MemoriaCard, loadClaude, useClaude } from "./memoria.tsx";
import { FaixaPedidos, MiniPrompt } from "./faixa.tsx";
import { Composer } from "./composer.tsx";
import { abrirConversa, apagarConversa, carregarConversas, chat, iaDoDemo, mudou, novaConversa, useChat } from "./conversa.ts";
import type { Envio, MsgChat } from "./conversa.ts";
import "./chat.css";

/** O estado de IA da conta (ou o simulado no demo). null enquanto carrega. */
function useEnvio(): Envio | null {
  const real = useEstadoIa();
  const d = iaDoDemo();
  const ia = d ? d.ia : S.profile.ia;
  const conta = d ?? (real ? real.conta : null);
  if (!conta) return null;
  const estado = C.estadoIA(ia, conta.conector, conta.chaves);
  return { modo: estado.estado, caminho: CH.caminhoChat(ia, estado, conta.chaves, chat.chaveEscolhida), ia };
}

function Balao({ m, e }: { m: MsgChat; e: Envio }) {
  if (m.papel === "usuario") return <div class="ch-msg eu"><p class="ch-txt">{m.texto}</p>{m.anexo && <p class="tiny ch-anexo-nm"><Icon id="cam" />{m.anexo}</p>}</div>;
  if (m.papel === "sem_ia") {
    const s = CH.mensagemSemIa(e.ia);
    return <div class="ch-msg ia"><p>{s.texto}</p><a class="btn sm pri" href={s.href}><Icon id="key" />{s.botao}</a></div>;
  }
  if (m.papel === "pedido") return <div class="ch-msg ia">
    <p>Virou um pedido na rotina{e.caminho.conector ? ` do ${e.caminho.conector.nome}` : ""}. A resposta aparece na faixa “pedidos na rotina”, lá em cima.</p>
    {e.caminho.conector && <MiniPrompt ia={e.caminho.conector} texto={m.texto} />}
  </div>;
  if (m.papel === "chave") return <div class="ch-msg ia"><p>Guardei na conversa. A resposta na hora com a sua chave{m.texto ? ` do ${m.texto}` : ""} chega numa próxima versão.</p></div>;
  return <div class="ch-msg ia"><p class="ch-txt">{m.texto}</p></div>;
}

function abrirMenu() {
  void carregarConversas();
  const Corpo = () => {
    useChat(); const info = useClaude();
    return <>
      <SheetHead kicker="Chat" title="Mais opções" />
      <button type="button" class="btn full ch-nova" onClick={() => { novaConversa(); closeSheet(); }}><Icon id="plus" />Nova conversa</button>
      <h3 class="ch-sec">Conversas</h3>
      {chat.conversas == null ? <p class="small sub">Carregando…</p> : !chat.conversas.length ? <p class="small sub">Nenhuma conversa guardada ainda.</p>
        : <ul class="ch-conversas">{chat.conversas.map((c) => <li key={c.id} class="row between">
          <button type="button" class="ch-conv" aria-current={c.id === chat.conversaId ? "true" : undefined} onClick={() => { void abrirConversa(c.id); closeSheet(); }}>
            <span class="ch-txt">{c.titulo}</span><span class="tiny sub">{new Date(c.atualizadaEm).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</span></button>
          <button type="button" class="btn ghost sm" aria-label={`Apagar a conversa: ${c.titulo}`} onClick={() => void apagarConversa(c.id)}><Icon id="x" /></button>
        </li>)}</ul>}
      <p class="tiny sub">Apagar uma conversa apaga de verdade. As conversas entram no export e no apagar da conta.</p>
      <div class="stack ch-menu-cards">
        <MemoriaCard info={info} />
        <Card><h2>Como mudar seu treino</h2>
          <ol class="small ch-lista">
            <li><b>Editar à mão</b> no Treino: trocar, séries e reps (a IA só revisa).</li>
            <li><b>Gerar outro</b> no Treino, na hora e sem IA.</li>
            <li><b>Pedidos da rotina</b> aqui: a proposta volta com <i>Aplicar</i>.</li>
          </ol></Card>
        <ClaudeLigado info={info} />
      </div>
    </>;
  };
  openSheet(() => <Corpo />);
}

function abrirSeletor(e: Envio) {
  const nomes = (p: C.ProvedorIa) => CH.caminhoChat(e.ia, { estado: "chave" }, [{ provedor: p, ativo: true }]).chave?.nome ?? C.NOME_PROVEDOR[p];
  const Corpo = () => {
    useChat();
    const atual = CH.caminhoChat(e.ia, { estado: e.modo }, e.caminho.chaves.map((p) => ({ provedor: p, ativo: true })), chat.chaveEscolhida).chave?.provedor;
    return <>
      <SheetHead kicker="Só nesta conversa" title="Qual IA responde" />
      <div class="stack ch-opcoes">{e.caminho.chaves.map((p) => <button key={p} type="button" class="opt" aria-pressed={p === atual}
        onClick={() => { chat.chaveEscolhida = p; mudou(); closeSheet(); }}>{nomes(p)}</button>)}</div>
      <p class="small sub">O padrão, o modelo e o esforço de cada chave ficam em <a class="link44" href="#perfil/ia">Perfil → Sua IA</a>.</p>
    </>;
  };
  openSheet(() => <Corpo />);
}

const SAUDACAO: Record<CH.ModoChat, string> = {
  nenhum: "Conecte uma IA para conversar aqui. Enquanto isso, o app gera seus treinos sozinho.",
  conector: "O que você mandar vira um pedido na rotina da sua IA.",
  chave: "Pergunte sobre treino, comida ou a sua semana.",
  ambos: "Pergunte sobre treino, comida ou a sua semana.",
};

export default function Chat({ route }: { route: Route }) {
  useStore(); useChat();
  const e = useEnvio();
  const [foco, setFoco] = useState(0);
  const fim = useRef<HTMLDivElement>(null);
  useEffect(() => { const t = setInterval(loadClaude, 60_000); return () => clearInterval(t); }, []);
  // "Fale com a IA": o pedido chega escrito no composer (não enviado) e sai da URL
  const pre = route.query.texto;
  useEffect(() => {
    if (pre == null) return;
    const v = CH.validarMensagem(pre);
    if (v.ok) { S.ui.inboxDraft = v.texto; commit(); setFoco((n) => n + 1); }
    replace("#chat");
  }, [pre]);
  useEffect(() => { fim.current?.scrollIntoView?.({ block: "end" }); }, [chat.msgs.length, chat.pensando]);
  if (!e) return <div class="ch"><h1>Chat</h1><p class="small sub" role="status">Carregando…</p></div>;
  const topo = CH.rotuloTopo(e.caminho);
  return <div class="ch" data-modo={e.modo}>
    <header class="ch-topo">
      <h1>Chat</h1>
      {topo && (e.caminho.chaves.length > 1
        ? <button type="button" class="ch-ia" onClick={() => abrirSeletor(e)} aria-label={`IA desta conversa: ${topo}. Trocar`}>{topo}<Icon id="arrow" cls="ch-seta" /></button>
        : <span class="ch-ia">{topo}</span>)}
      <button type="button" class="iconbtn ch-mais" aria-label="Mais opções do Chat" onClick={abrirMenu}><Icon id="more" /></button>
    </header>
    <FaixaPedidos ia={e.caminho.conector} />
    <div class="ch-thread" aria-live="polite">
      {!chat.msgs.length && <div class="ch-vazio">
        <h2>Como posso ajudar?</h2>
        <p class="small sub">{SAUDACAO[e.modo]}</p>
        <div class="chips ch-sugestoes">{CH.SUGESTOES_CHAT.map((t) => <button key={t} type="button" class="chip" onClick={() => { S.ui.inboxDraft = t; commit(); setFoco((n) => n + 1); }}>{t}</button>)}</div>
      </div>}
      {chat.msgs.map((m) => <Balao key={m.id} m={m} e={e} />)}
      {chat.pensando && <div class="ch-msg ia ch-pensando" role="status"><span class="ch-pontos" aria-hidden="true"><i /><i /><i /></span>pensando…</div>}
      <div ref={fim} class="ch-fim" />
    </div>
    <Composer envio={e} foco={foco} />
  </div>;
}
