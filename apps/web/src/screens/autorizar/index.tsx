// #66 Tela de consentimento do OAuth do MCP: "Permitir que o Claude acesse seu Ciclo".
// Usa a sessão do app (cookie) ou entra com a passkey (Face ID) aqui mesmo. Permitir → o Worker gera um código de uso
// único e o navegador volta para o app que pediu (a redirect_uri registrada). Texto do cliente é dado: JSX escapa.
import { useEffect, useState } from "preact/hooks";
import { ErroApi, api, entrarComPasskey, erroTexto, temPasskey } from "./passkey.ts";

interface Info { cliente: string; destino: string; conta: { nome: string | null } | null }
type Fase = "carregando" | "pronto" | "voltando" | "vencido";

const PODE = [
  "Ver seu perfil, treinos, check-ins e o histórico do Ciclo",
  "Responder perguntas e os pedidos da aba Chat",
  "Gerar e ajustar o seu treino (o app valida tudo antes de salvar)",
];

export function Autorizar({ req }: { req: string }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [fase, setFase] = useState<Fase>("carregando");
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);

  const carregar = () => api<Info>("GET", `/oauth/pedido/${encodeURIComponent(req)}`)
    .then((i) => { setInfo(i); setFase("pronto"); })
    .catch((e) => { setFase("vencido"); setErro(e instanceof ErroApi ? e.message : "Sem conexão. Tente de novo."); });
  useEffect(() => { if (/^[0-9a-f]{32}$/.test(req)) carregar(); else { setFase("vencido"); setErro("Link incompleto: volte ao Claude e tente de novo."); } }, []);

  async function decidir(permitir: boolean) {
    setErro(""); setBusy(true);
    try {
      const r = await api<{ redirect: string }>("POST", "/oauth/decidir", { req, permitir });
      setFase("voltando");
      location.replace(r.redirect);
    } catch (e) {
      if (e instanceof ErroApi && e.code === "entrar") { setInfo((i) => (i ? { ...i, conta: null } : i)); setErro("Sua sessão acabou: entre com o Face ID."); }
      else if (e instanceof ErroApi && e.code === "vencido") { setFase("vencido"); setErro(e.message); }
      else setErro(erroTexto(e));
    } finally { setBusy(false); }
  }
  async function entrar() {
    setErro(""); setBusy(true);
    try { await entrarComPasskey(); await carregar(); } catch (e) { setErro(erroTexto(e)); } finally { setBusy(false); }
  }

  return <main class="aut">
    <div class="aut-marca"><span class="aut-logo" aria-hidden="true">C</span>Ciclo</div>
    {fase === "carregando" && <p class="sub" role="status">Carregando…</p>}
    {fase === "vencido" && <section class="card aut-card">
      <h1>Não deu para continuar</h1>
      <p class="sub aut-p" role="alert">{erro}</p>
      <p class="small sub aut-p">Abra o Claude, vá em Conectores e tente conectar de novo. O pedido vale por 10 minutos.</p>
    </section>}
    {fase === "voltando" && <section class="card aut-card"><h1>Pronto</h1><p class="sub aut-p" role="status">Voltando para {info?.cliente ?? "o app"}…</p></section>}
    {fase === "pronto" && info && <section class="card aut-card" aria-labelledby="autTitulo">
      <p class="kicker">Conectar ao Ciclo</p>
      <h1 id="autTitulo">Permitir que {info.cliente} acesse seu Ciclo?</h1>
      <p class="small sub aut-p">Depois de permitir, você volta para <b>{info.destino}</b>.</p>
      <ul class="aut-lista">{PODE.map((t) => <li key={t}>{t}</li>)}</ul>
      <p class="tiny sub aut-p">Nada é apagado pela conexão: apagar dados é só no app. Você desliga quando quiser em Conta → Claude conectado.</p>
      {info.conta
        ? <>
          <p class="small aut-p">Conta: <b>{info.conta.nome ?? "sua conta"}</b></p>
          <button type="button" class="btn pri lg full aut-btn" disabled={busy} onClick={() => decidir(true)}>Permitir</button>
          <button type="button" class="btn full aut-btn" disabled={busy} onClick={() => decidir(false)}>Agora não</button>
        </>
        : <>
          {!temPasskey() && <p class="small aut-erro" role="alert">Este navegador não tem passkey. Use o Safari do iPhone ou um navegador atualizado.</p>}
          <button type="button" class="btn pri lg full aut-btn" disabled={busy || !temPasskey()} onClick={entrar}>Entrar com Face ID</button>
          <button type="button" class="btn full aut-btn" disabled={busy} onClick={() => decidir(false)}>Agora não</button>
          <p class="tiny sub aut-p">Ainda não tem conta no Ciclo? Peça um convite a quem administra o seu app.</p>
        </>}
      {erro && <p class="small aut-erro" role="alert">{erro}</p>}
    </section>}
  </main>;
}
