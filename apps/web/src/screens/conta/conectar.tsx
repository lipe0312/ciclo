// #55 "Conectar meu Claude": passo a passo guiado (conta → chave → connector no claude.ai → teste ✅ → opcional),
// e a lista das chaves da conta (rótulo, criada, último uso, aviso de expiração, revogar com 1 toque).
// A chave é por conta: o Claude dela só lê e escreve os dados dela. Na demo, URL e chave são de mentira e marcadas.
import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import * as C from "@ciclo/core";
import { api } from "../../lib/api/index.ts";
import { Icon, toast } from "../../lib/ui/index.tsx";
import { comFaceId } from "../entrar/webauthn.ts";

export interface Chave extends C.TokenInfo, C.EstadoToken { id: string; label: string }
interface Lista { tokens: Chave[]; max: number; ativos: number }

const dia = (ms: number | null) => (ms ? new Date(ms).toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: "numeric" }) : "nunca");
const POLL_MS = 3000, POLL_MAX_MS = 5 * 60_000;
const PEDIDO_TESTE = "Use o Ciclo e me diga o treino de hoje.";

async function copiar(txt: string, oque: string) {
  try { await navigator.clipboard.writeText(txt); toast(`${oque} copiado`); } catch { toast("Não deu para copiar: selecione e copie à mão"); }
}

function Campo({ rotulo, valor, copia, oque, exemplo }: { rotulo: string; valor: string; copia?: string; oque: string; exemplo?: boolean }) {
  return <div class="cn-campo">
    <div class="row between" style="gap:8px"><span class="tiny sub">{rotulo}</span>{exemplo && <span class="badge warn">exemplo</span>}</div>
    <div class="cn-valor"><code class="mono">{valor}</code>
      <button type="button" class="btn sm" onClick={() => copiar(copia ?? valor, oque)} aria-label={`Copiar ${oque}`}>Copiar</button></div>
  </div>;
}

function Passo({ n, estado, titulo, children }: { n: number; estado: "feito" | "atual" | "depois"; titulo: string; children?: ComponentChildren }) {
  return <li class={`cn-passo ${estado}`} aria-current={estado === "atual" ? "step" : undefined}>
    <span class="cn-num" aria-hidden="true">{estado === "feito" ? <Icon id="check" /> : n}</span>
    <div class="cn-corpo"><h3>{titulo}<span class="sr">{estado === "feito" ? " (feito)" : estado === "atual" ? " (agora)" : ""}</span></h3>{children}</div>
  </li>;
}

export function Conectar({ demo }: { demo: boolean }) {
  const [lista, setLista] = useState<Lista | null>(null);
  const [nova, setNova] = useState<{ id: string; token: string } | null>(null);
  const [rotulo, setRotulo] = useState("claude.ai");
  const [testando, setTestando] = useState(false);
  const [busy, setBusy] = useState("");
  const [erro, setErro] = useState("");
  const timer = useRef<number | null>(null);

  const load = async () => { const l = await api<Lista>("GET", "/api/account/tokens"); setLista(l); return l; };
  useEffect(() => {
    if (!demo) load().catch(() => setErro("Não deu para carregar as chaves."));
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, []);

  const now = Date.now();
  const tokens = lista?.tokens ?? [];
  const passo = demo ? 1 : C.passoConectar({ temConta: true, tokens }, now);
  const conectado = passo === 5;
  const origin = demo ? C.EXEMPLO_CONEXAO.url.replace(/\/mcp$/, "") : location.origin;
  const url = demo ? C.EXEMPLO_CONEXAO.url : C.mcpUrl(origin);
  const chave = demo ? C.EXEMPLO_CONEXAO.token : nova?.token ?? null;
  const est = (k: number): "feito" | "atual" | "depois" => (demo ? (k === 1 ? "atual" : "depois") : passo > k ? "feito" : passo === k ? "atual" : "depois");

  const act = async (id: string, f: () => Promise<void>) => {
    setErro(""); setBusy(id);
    try { await f(); } catch (e) { setErro(e instanceof Error ? e.message : "Algo deu errado."); } finally { setBusy(""); }
  };

  const gerar = () => act("gerar", async () => {
    const r = await comFaceId(() => api<{ id: string; token: string }>("POST", "/api/account/tokens", { label: rotulo.trim() || "Chat" })); // #62: gerar chave pede Face ID
    setNova({ id: r.id, token: r.token }); await load();
  });

  const testar = () => {
    if (demo) { toast("Na demonstração não há servidor: crie sua conta para testar de verdade"); return; }
    setTestando(true);
    const fim = Date.now() + POLL_MAX_MS;
    const tick = async () => {
      const l = await load().catch(() => null);
      if (l && C.passoConectar({ temConta: true, tokens: l.tokens }, Date.now()) === 5) { setTestando(false); toast("Chat conectado"); return; }
      if (Date.now() > fim) { setTestando(false); setErro("O Chat ainda não chamou. Confira a URL e o cabeçalho e tente de novo."); return; }
      timer.current = window.setTimeout(tick, POLL_MS);
    };
    tick();
  };

  const revogar = (k: Chave) => act("r" + k.id, async () => {
    await api("DELETE", `/api/account/tokens/${encodeURIComponent(k.id)}`);
    if (nova?.id === k.id) setNova(null);
    toast("Chave revogada: o Chat dela para na próxima chamada"); await load();
  });

  const visiveis = tokens.filter((k) => k.estado !== "revogado");
  const cheio = !!lista && lista.ativos >= lista.max;

  return <section class="card conta-sec" aria-labelledby="ct-cn">
    <div class="row between wrapx"><h2 id="ct-cn">Conectar meu Chat</h2>
      {demo ? <span class="badge warn">demonstração</span> : conectado ? <span class="badge ok" role="status"><Icon id="check" style="width:12px;height:12px" />conectado</span> : null}</div>
    <p class="small sub">Cada pessoa liga o próprio Chat. A chave é sua: o Chat com ela só vê e altera os seus dados.</p>
    <p class="tiny sub">Funciona com o Claude, da Anthropic, na sua assinatura.</p>
    {demo && <div class="note warn"><Icon id="info" /><span>Na demonstração, a URL e a chave abaixo são <b>de exemplo</b> e não funcionam. Crie sua conta para gerar a sua.</span></div>}
    {erro && <div class="note entrar-erro" role="alert"><Icon id="warn" />{erro}</div>}

    <ol class="cn-passos">
      <Passo n={1} estado={est(1)} titulo="Criar sua conta">
        <p class="small sub">{demo ? "Peça um convite a quem administra o app e entre com o Face ID (passkey)." : "Feito: você está na sua conta."}</p>
      </Passo>

      <Passo n={2} estado={est(2)} titulo="Gerar minha chave">
        {chave
          ? <><Campo rotulo="Sua chave" valor={chave} oque="Chave" exemplo={demo} />
            {!demo && <p class="tiny sub"><Icon id="warn" style="width:12px;height:12px;color:var(--warn)" /> Aparece só agora. Copie e cole no passo 3; no banco fica só uma impressão dela.</p>}</>
          : <form class="conta-form" onSubmit={(e) => { e.preventDefault(); if (!demo) gerar(); }}>
            <label class="f" for="cn-rot">Nome da chave</label>
            <input id="cn-rot" class="input" value={rotulo} maxLength={60} autocomplete="off" onInput={(e) => setRotulo(e.currentTarget.value)} />
            <button type="submit" class="btn pri full" disabled={demo || !!busy || cheio}><Icon id="key" />{cheio ? `Máximo de ${lista?.max} chaves: revogue uma` : busy === "gerar" ? "Gerando…" : "Gerar minha chave"}</button>
          </form>}
      </Passo>

      <Passo n={3} estado={est(3)} titulo="Colar no claude.ai">
        <p class="small">Abra <b>claude.ai → Configurações → Connectors → Adicionar connector personalizado</b> e preencha:</p>
        <div class="cn-mock" aria-label="Como fica o formulário do connector">
          <div class="cn-mock-l"><span class="tiny sub">Nome</span><span class="small">Ciclo</span></div>
          <div class="cn-mock-l"><span class="tiny sub">Autenticação</span><span class="small">No sign in</span></div>
        </div>
        <Campo rotulo="URL do connector" valor={url} oque="URL" exemplo={demo} />
        <Campo rotulo="Request header" valor={C.cabecalhoAuth(chave ?? "<sua chave>")} copia={chave ? C.cabecalhoAuth(chave) : undefined} oque="Cabeçalho" exemplo={demo} />
        {!chave && !demo && <p class="tiny sub">Gere uma chave nova no passo 2 para o cabeçalho sair pronto (as antigas não aparecem de novo).</p>}
      </Passo>

      <Passo n={4} estado={conectado ? "feito" : est(4)} titulo="Testar">
        <p class="small">No Claude (celular ou computador), peça:</p>
        <Campo rotulo="Pedido de teste" valor={PEDIDO_TESTE} oque="Pedido" />
        {conectado
          ? <p class="small cn-ok" role="status"><Icon id="check" />O Chat chamou o Ciclo. Pronto!</p>
          : <button type="button" class="btn full" disabled={testando || (!demo && passo < 3)} onClick={testar}>
            <Icon id={testando ? "clock" : "check"} />{testando ? "Aguardando o Chat chamar…" : "Já pedi: conferir"}</button>}
        {testando && <p class="tiny sub" role="status" aria-live="polite">O app confere sozinho a cada 3 s por até 5 min.</p>}
      </Passo>

      <Passo n={5} estado="depois" titulo="Opcional: rotina e vigia">
        <p class="small sub">Para a caixa de pedidos responder sem você abrir o Claude: uma rotina a cada 3 h no Claude Code (<code class="mono">/schedule</code> com <code class="mono">/processar-caixa origem=rotina</code>) e, com o Mac ligado, o vigia, que responde em segundos:</p>
        <Campo rotulo="Vigia no Mac (Terminal, na pasta do Ciclo)" valor={`CICLO_URL=${origin} CICLO_TOKEN=<sua chave> .claude/skills/processar-caixa/vigia.sh`} oque="Comando" exemplo={demo} />
      </Passo>
    </ol>

    {!demo && <>
      <div class="row between" style="margin-top:4px"><h3>Suas chaves</h3>{lista && <span class={`badge${cheio ? " warn" : ""}`}><span class="num">{lista.ativos}</span>de {lista.max}</span>}</div>
      <p class="tiny sub">Chave sem uso há {C.TOKEN_IDLE_DAYS} dias expira sozinha. Revogar corta o Chat dela na hora.</p>
      {lista && !visiveis.length && <p class="small sub">Nenhuma chave ainda.</p>}
      <ul class="conta-list">{visiveis.map((k) => <li key={k.id}>
        <div><strong class="cn-rotulo">{k.label}</strong>
          {k.estado === "expirando" && <span class="badge warn" style="margin-left:6px">expira em <span class="num">{k.diasRestantes}</span> d</span>}
          {k.estado === "expirado" && <span class="badge bad" style="margin-left:6px">expirada</span>}
          <p class="tiny sub">Criada em {dia(k.createdAt)} · último uso {dia(k.lastUsedAt)}</p></div>
        <button type="button" class="btn sm" disabled={!!busy} aria-label={`${k.estado === "expirado" ? "Remover" : "Revogar"} a chave ${k.label}`} onClick={() => revogar(k)}>{k.estado === "expirado" ? "Remover" : "Revogar"}</button>
      </li>)}</ul>
      {chave && <button type="button" class="btn ghost full" onClick={() => setNova(null)}>Gerar outra chave</button>}
    </>}
  </section>;
}
