// #66 Tela de consentimento do OAuth do MCP. A identidade é o DESTINO (host da redirect_uri, conferido contra a allowlist
// OAUTH_REDIRECT_HOSTS), nunca o nome que o cliente escolheu no registro. Permitir pede o Face ID recente
// (exigirFaceId da #62), mesmo com sessão, e o aceite dos termos em dia. Depois, o navegador volta para o destino com um código de uso único.
import { useEffect, useState } from "preact/hooks";
import { ErroApi, api, confirmarFaceId, entrarComPasskey, erroTexto, temPasskey } from "./passkey.ts";

interface Info { destino: string; verificado: boolean; conta: { nome: string | null } | null }
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
  useEffect(() => { if (/^[0-9a-f]{32}$/.test(req)) carregar(); else { setFase("vencido"); setErro("Link incompleto: volte ao app que pediu a conexão e tente de novo."); } }, []);

  async function decidir(permitir: boolean, jaFezFaceId = false): Promise<void> {
    setErro(""); setBusy(true);
    try {
      const r = await api<{ redirect: string }>("POST", "/oauth/decidir", { req, permitir });
      setFase("voltando");
      location.replace(r.redirect);
    } catch (e) {
      if (e instanceof ErroApi && (e.code === "reauth" || e.code === "entrar") && permitir && !jaFezFaceId) {
        // Face ID na hora de consentir (#62): com sessão, reconfirma; sem sessão, entra com a passkey. Depois tenta de novo.
        try { await (e.code === "reauth" ? confirmarFaceId() : entrarComPasskey()); setBusy(false); return decidir(true, true); } catch (e2) { setErro(erroTexto(e2)); }
      } else if (e instanceof ErroApi && e.code === "aceite") setErro("Antes, abra o app do Ciclo e aceite os termos e a privacidade atualizados."); else if (e instanceof ErroApi && e.code === "vencido") { setFase("vencido"); setErro(e.message); }
      else setErro(erroTexto(e));
    } finally { setBusy(false); }
  }

  return <main class="aut">
    <div class="aut-marca"><span class="aut-logo" aria-hidden="true">C</span>Ciclo</div>
    {fase === "carregando" && <p class="sub" role="status">Carregando…</p>}
    {fase === "vencido" && <section class="card aut-card">
      <h1>Não deu para continuar</h1>
      <p class="sub aut-p" role="alert">{erro}</p>
      <p class="small sub aut-p">Volte ao app que pediu a conexão, abra Conectores e tente de novo. O pedido vale por 10 minutos.</p>
    </section>}
    {fase === "voltando" && <section class="card aut-card"><h1>Pronto</h1><p class="sub aut-p" role="status">Voltando para {info?.destino ?? "o app"}…</p></section>}
    {fase === "pronto" && info && <section class="card aut-card" aria-labelledby="autTitulo">
      <p class="kicker">Conectar ao Ciclo</p>
      <h1 id="autTitulo">Permitir acesso ao seu Ciclo?</h1>
      <div class={`aut-destino${info.verificado ? "" : " nao"}`}>
        <span class="tiny sub">O acesso vai para</span>
        <b class="aut-host">{info.destino}</b>
        {info.verificado
          ? <span class="badge ok">destino verificado</span>
          : <span class="badge warn" role="alert">app não verificado: só permita se foi você que abriu isto no seu computador</span>}
      </div>
      <ul class="aut-lista">{PODE.map((t) => <li key={t}>{t}</li>)}</ul>
      <p class="tiny sub aut-p">Nada é apagado pela conexão: apagar dados é só no app. Você desliga quando quiser em Conta → Conectar meu Chat.</p>
      {info.conta && <p class="small aut-p">Conta: <b>{info.conta.nome ?? "sua conta"}</b></p>}
      {!temPasskey() && <p class="small aut-erro" role="alert">Este navegador não tem passkey. Use o Safari do iPhone ou um navegador atualizado.</p>}
      <button type="button" class="btn pri lg full aut-btn" disabled={busy} onClick={() => decidir(true)}>Permitir com Face ID</button>
      <button type="button" class="btn full aut-btn" disabled={busy} onClick={() => decidir(false)}>Agora não</button>
      {!info.conta && <p class="tiny sub aut-p">Ainda não tem conta no Ciclo? Peça um convite a quem administra o seu app.</p>}
      {erro && <p class="small aut-erro" role="alert">{erro}</p>}
    </section>}
  </main>;
}
