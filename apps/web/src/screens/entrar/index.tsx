// #54/#62 Tela inicial = login. Sem sessão, qualquer rota cai aqui (?volta=<rota>): logo, "Entrar com Face ID", "Tenho um convite"
// e "Acesso só por convite · X de 10 vagas usadas". Não há cadastro aberto: sem convite, "Peça um convite a quem administra o app".
// Modos extras: código de recuperação, Face ID de novo (app fechado há mais de 7 dias, sem deslogar), aceite de versão nova dos
// termos/privacidade e o primeiro acesso do dono (que SEMPRE pede o código antes do Face ID, em cadastro.tsx).
// O link do convite (/#convite/<código>) abre o "Crie sua conta no Ciclo" (cadastro.tsx).
import { useEffect, useState } from "preact/hooks";
import * as C from "@ciclo/core";
import { go, href, replace } from "../../lib/roteador/index.ts";
import type { Route } from "../../lib/roteador/index.ts";
import { HttpError, SERVER, api } from "../../lib/api/index.ts";
import { Icon } from "../../lib/ui/index.tsx";
import { Cadastro } from "./cadastro.tsx";
import { entrarComPasskey, erroPasskey, faceIdDeNovo, temPasskey } from "./webauthn.ts";
import { Turnstile } from "./turnstile.tsx";
import { SeusDados } from "../conta/dados.tsx";
import "./entrar.css";

type Modo = "inicio" | "convite" | "recuperar" | "dono" | "faceid" | "aceite";
interface Status { bootstrap: boolean; turnstile?: string | null; vagas?: { usadas: number; max: number } }

/** Só rotas internas do app (#tela…), nunca #entrar/#convite de novo. */
function destino(volta?: string) {
  return volta && /^#[a-z]/.test(volta) && !/^#(entrar|convite)/.test(volta) ? volta : "#hoje";
}
function irPara(h: string) { location.hash = h; location.reload(); }

export default function Entrar({ route }: { route: Route }) {
  const q = route.query;
  // /#convite/<código> (e o formato antigo #entrar?convite=) abrem o cadastro; o código sai da URL assim que é lido
  const codigoUrl = route.screen === "convite" ? route.parts[0] ?? "" : q.convite ?? "";
  const [codigoConvite, setCodigoConvite] = useState(codigoUrl);
  const inicial: Modo = codigoUrl ? "convite" : q.modo === "faceid" ? "faceid" : q.modo === "aceite" ? "aceite" : "inicio";
  const [modo, setModo] = useState<Modo>(inicial);
  const [abrirCadastro, setAbrirCadastro] = useState(!!codigoUrl);
  const [digitado, setDigitado] = useState("");
  const [codigo, setCodigo] = useState("");
  const [aceite, setAceite] = useState(false);
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  const [st, setSt] = useState<Status | null>(null);
  // #56 Turnstile: só com a chave do servidor; no login, quando o servidor pedir (depois de 3 falhas)
  const [pedeRobo, setPedeRobo] = useState(false);
  const [token, setToken] = useState("");
  const [tsVez, setTsVez] = useState(0);
  const volta = destino(q.volta);
  const siteKey = st?.turnstile ?? null;

  // o código sai da URL assim que é lido; um link de convite aberto com o app já aberto (só o hash muda) também abre o cadastro
  useEffect(() => {
    if (!codigoUrl) return;
    setCodigoConvite(codigoUrl); setModo("convite"); setAbrirCadastro(true);
    replace(route.screen === "convite" ? "#convite" : href("entrar", [], { volta: q.volta }));
  }, [codigoUrl]);
  useEffect(() => { if (SERVER) api<Status>("GET", "/auth/status").then(setSt).catch(() => {}); }, []);

  const robo = !!siteKey && pedeRobo;
  const ts = () => (robo && token ? { turnstile: token } : {});
  const run = async (f: () => Promise<void>) => {
    setErro(""); setBusy(true);
    try { await f(); } catch (e) {
      if (e instanceof HttpError && (e.data as { code?: string } | null)?.code === "turnstile") setPedeRobo(true);
      setErro(erroPasskey(e));
    } finally {
      setBusy(false);
      if (robo) { setToken(""); setTsVez((n) => n + 1); }
    }
  };
  const faltaRobo = robo && !token;
  const verificacao = robo && siteKey && <Turnstile key={tsVez} siteKey={siteKey} onToken={setToken} onErro={() => setErro("Não deu para carregar a verificação contra robôs. Confira a internet e tente de novo.")} />;
  const sem = !SERVER ? "Na demonstração não há login: os dados ficam só neste navegador." : !temPasskey() ? "Este navegador não tem passkey. Use o Safari do iPhone ou um navegador atualizado." : "";
  const inicio = () => { setErro(""); setModo("inicio"); setAbrirCadastro(false); if (route.screen === "convite") go("#entrar"); };

  if (modo === "convite" && abrirCadastro && codigoConvite) return <Cadastro modo="convite" codigo={codigoConvite} siteKey={siteKey} onSair={inicio} />;
  if (modo === "dono") return <Cadastro modo="dono" siteKey={siteKey} onSair={inicio} />;

  const voltar = <button type="button" class="btn ghost" onClick={inicio}><Icon id="back" />Voltar</button>;
  const aviso = erro && <div class="note entrar-erro" role="alert"><Icon id="warn" />{erro}</div>;
  const vagas = st?.vagas ? `${Math.min(st.vagas.usadas, st.vagas.max)} de ${st.vagas.max} vagas usadas` : null;
  const rodape = <p class="entrar-rodape tiny sub"><a class="link44" href="#termos">Termos</a> · <a class="link44" href="#privacidade">Privacidade</a></p>;

  return <div class="entrar">
    <div class="brand entrar-brand"><span class="logo"><Icon id="cycle" /></span>Ciclo</div>

    {modo === "inicio" && <>
      <h1>Entrar</h1>
      <p class="sub">Com o Face ID ou o Touch ID, sem senha e sem código por e&#8209;mail.</p>
      {sem && <div class="note"><Icon id="info" />{sem}</div>}
      {aviso}
      {verificacao}
      <button type="button" class="btn pri lg full" disabled={busy || !!sem || faltaRobo} onClick={() => run(async () => { await entrarComPasskey(ts()); irPara(volta); })}>
        <Icon id="key" />{busy ? "Aguardando o Face ID…" : "Entrar com Face ID"}</button>
      <button type="button" class="btn lg full" onClick={() => { setErro(""); setModo("convite"); }}>Tenho um convite</button>
      <div class="entrar-vagas" role="note"><Icon id="info" /><div><b>Acesso só por convite{vagas ? ` · ${vagas}` : ""}</b>
        <p class="tiny sub">Sem convite? Peça um convite a quem administra o app.</p></div></div>
      <div class="entrar-links">
        <button type="button" class="btn ghost full" onClick={() => { setErro(""); setModo("recuperar"); }}>Perdi o aparelho: usar código de recuperação</button>
        {st?.bootstrap && <button type="button" class="btn ghost full" onClick={() => { setErro(""); setModo("dono"); }}>Primeiro acesso (dono do app)</button>}
      </div>
      {rodape}
    </>}

    {modo === "convite" && <form onSubmit={(e) => { e.preventDefault(); const c = C.normalizeCode(digitado, C.INVITE_LEN); if (!c) { setErro("Código no formato XXXX-XXXX-XXXX-XXXX."); return; } setCodigoConvite(c); setAbrirCadastro(true); }}>
      <h1>Tenho um convite</h1>
      <p class="sub">Abra o link que você recebeu ou cole o código. O convite vale uma vez, por 7 dias, para o e-mail de quem foi convidado.</p>
      <label class="f" for="en-conv">Código do convite</label>
      <input id="en-conv" class="input mono" value={digitado} onInput={(e) => setDigitado(e.currentTarget.value)} autocomplete="off" autocapitalize="characters" spellcheck={false} required maxLength={24} placeholder="XXXX-XXXX-XXXX-XXXX" enterkeyhint="go" />
      {aviso}
      <button type="submit" class="btn pri lg full" disabled={!digitado.trim()}>Continuar<Icon id="arrow" /></button>
      {voltar}
    </form>}

    {modo === "recuperar" && <form onSubmit={(e) => { e.preventDefault(); run(async () => { await api("POST", "/auth/recover", { codigo, ...ts() }); irPara("#conta/seguranca"); }); }}>
      <h1>Código de recuperação</h1>
      <p class="sub">Cada código entra uma vez. Depois, em Conta → Segurança, crie uma passkey nova neste aparelho.</p>
      <label class="f" for="en-rec">Código</label>
      <input id="en-rec" class="input mono" value={codigo} onInput={(e) => setCodigo(e.currentTarget.value)} autocomplete="one-time-code" autocapitalize="characters" spellcheck={false} required maxLength={16} placeholder="XXXX-XXXX-XX" enterkeyhint="go" />
      {verificacao}
      {aviso}
      <button type="submit" class="btn pri lg full" disabled={busy || !SERVER || faltaRobo}>{busy ? "Entrando…" : "Entrar com o código"}</button>
      {voltar}
    </form>}

    {modo === "faceid" && <>
      <h1>Confirme que é você</h1>
      <p class="sub">O app ficou mais de 7 dias fechado. Você continua conectado: só falta o Face ID.</p>
      {sem && <div class="note"><Icon id="info" />{sem}</div>}
      {aviso}
      <button type="button" class="btn pri lg full" disabled={busy || !!sem} onClick={() => run(async () => {
        try { await faceIdDeNovo(); } catch (e) { if (e instanceof HttpError && e.status === 401) { setModo("inicio"); throw new Error("Sua sessão terminou: entre de novo."); } throw e; }
        irPara(volta);
      })}><Icon id="key" />{busy ? "Aguardando o Face ID…" : "Continuar com Face ID"}</button>
      <button type="button" class="btn ghost full" onClick={() => run(async () => { await api("POST", "/auth/logout", {}); irPara("#entrar"); })}>Sair desta conta</button>
    </>}

    {modo === "aceite" && <form onSubmit={(e) => { e.preventDefault(); run(async () => { await api("POST", "/api/account/consent", { ...C.CONSENT_VERSAO }); irPara(volta); }); }}>
      <h1>Termos atualizados</h1>
      <p class="sub">Os termos de uso ou a privacidade mudaram. Para continuar usando o app, leia e aceite a versão nova.</p>
      <label class="cad-check">
        <input type="checkbox" checked={aceite} onChange={(e) => setAceite(e.currentTarget.checked)} />
        <span>Li e aceito os <a class="link44" href="#termos" target="_blank" rel="noopener">termos</a> e a <a class="link44" href="#privacidade" target="_blank" rel="noopener">privacidade</a>, e consinto com o uso dos meus dados de saúde para montar o meu treino.</span>
      </label>
      {aviso}
      <button type="submit" class="btn pri lg full" disabled={busy || !aceite}>{busy ? "Salvando…" : "Aceitar e continuar"}</button>
    </form>}
    {modo === "aceite" && <details class="cad-doc"><summary>Não quero aceitar</summary>
      <p class="small sub">Revogar o consentimento leva a exportar e apagar a conta.</p><SeusDados donaComOutras={false} /></details>}
  </div>;
}
