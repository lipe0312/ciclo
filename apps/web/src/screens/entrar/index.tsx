// #54 Tela #entrar: Face ID (passkey), convite, código de recuperação e primeiro acesso do dono.
// Qualquer 401 da API cai aqui com ?volta=<rota>; depois do login o app recarrega na rota de origem.
import { useEffect, useState } from "preact/hooks";
import type { Route } from "../../lib/roteador/index.ts";
import { SERVER, api } from "../../lib/api/index.ts";
import { Icon } from "../../lib/ui/index.tsx";
import { Codigos } from "./codigos.tsx";
import { criarPasskey, entrarComPasskey, erroPasskey, temPasskey } from "./webauthn.ts";

type Modo = "inicio" | "convite" | "recuperar" | "dono" | "codigos";

/** Só rotas internas do app (#tela…), nunca #entrar de novo. */
function destino(volta?: string) {
  return volta && /^#[a-z]/.test(volta) && !volta.startsWith("#entrar") ? volta : "#hoje";
}
function irPara(h: string) { location.hash = h; location.reload(); }

export default function Entrar({ route }: { route: Route }) {
  const q = route.query;
  const [modo, setModo] = useState<Modo>(q.convite ? "convite" : "inicio");
  const [convite, setConvite] = useState(q.convite ?? "");
  const [nome, setNome] = useState("");
  const [codigo, setCodigo] = useState("");
  const [setup, setSetup] = useState("");
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  const [codigos, setCodigos] = useState<string[]>([]);
  const [bootstrap, setBootstrap] = useState(false);
  const volta = destino(q.volta);

  useEffect(() => { if (SERVER) api<{ bootstrap: boolean }>("GET", "/auth/status").then((r) => setBootstrap(r.bootstrap)).catch(() => {}); }, []);

  const run = async (f: () => Promise<void>) => {
    setErro(""); setBusy(true);
    try { await f(); } catch (e) { setErro(erroPasskey(e)); } finally { setBusy(false); }
  };
  const criada = (r: { codigos?: string[] }) => { if (r.codigos?.length) { setCodigos(r.codigos); setModo("codigos"); } else irPara(volta); };
  const sem = !SERVER ? "Na demonstração não há login: os dados ficam só neste navegador." : !temPasskey() ? "Este navegador não tem passkey. Use o Safari do iPhone ou um navegador atualizado." : "";

  const voltar = <button type="button" class="btn ghost" onClick={() => { setErro(""); setModo("inicio"); }}><Icon id="back" />Voltar</button>;
  const aviso = erro && <div class="note entrar-erro" role="alert"><Icon id="warn" />{erro}</div>;

  return <div class="entrar">
    <div class="brand entrar-brand"><span class="logo"><Icon id="cycle" /></span>Ciclo</div>

    {modo === "inicio" && <>
      <h1>Entrar</h1>
      <p class="sub">Com o Face ID ou o Touch ID: sem senha e sem e-mail.</p>
      {sem && <div class="note"><Icon id="info" />{sem}</div>}
      {aviso}
      <button type="button" class="btn pri lg full" disabled={busy || !!sem} onClick={() => run(async () => { await entrarComPasskey(); irPara(volta); })}>
        <Icon id="key" />{busy ? "Aguardando o Face ID…" : "Entrar com Face ID"}</button>
      <div class="entrar-links">
        <button type="button" class="btn full" onClick={() => setModo("convite")}>Tenho um convite</button>
        <button type="button" class="btn ghost full" onClick={() => setModo("recuperar")}>Perdi o aparelho: usar código de recuperação</button>
        {bootstrap && <button type="button" class="btn ghost full" onClick={() => setModo("dono")}>Primeiro acesso (dono do app)</button>}
      </div>
    </>}

    {modo === "convite" && <form onSubmit={(e) => { e.preventDefault(); run(async () => criada(await criarPasskey({ convite, nome }))); }}>
      <h1>Criar conta</h1>
      <p class="sub">O convite vale uma vez, por 7 dias.</p>
      <label class="f" for="en-conv">Código do convite</label>
      <input id="en-conv" class="input mono" value={convite} onInput={(e) => setConvite(e.currentTarget.value)} autocomplete="off" autocapitalize="characters" spellcheck={false} required maxLength={24} placeholder="XXXX-XXXX-XXXX-XXXX" />
      <label class="f" for="en-nome">Seu nome</label>
      <input id="en-nome" class="input" value={nome} onInput={(e) => setNome(e.currentTarget.value)} autocomplete="given-name" maxLength={40} required />
      <div class="note"><Icon id="info" /><span>A passkey fica no iCloud Keychain (ou no Gerenciador de senhas do Google). O mesmo Face ID passa a valer no Mac e no iPad da sua conta.</span></div>
      {aviso}
      <button type="submit" class="btn pri lg full" disabled={busy || !!sem}><Icon id="key" />{busy ? "Aguardando o Face ID…" : "Criar conta com Face ID"}</button>
      {voltar}
    </form>}

    {modo === "dono" && <form onSubmit={(e) => { e.preventDefault(); run(async () => criada(await criarPasskey({ setup, nome }))); }}>
      <h1>Primeiro acesso</h1>
      <p class="sub">Use o código de configuração (OWNER_SETUP_CODE). Esta conta vira a dona do app e convida as outras.</p>
      <label class="f" for="en-setup">Código de configuração</label>
      <input id="en-setup" class="input mono" type="password" value={setup} onInput={(e) => setSetup(e.currentTarget.value)} autocomplete="off" required maxLength={200} />
      <label class="f" for="en-nome2">Seu nome</label>
      <input id="en-nome2" class="input" value={nome} onInput={(e) => setNome(e.currentTarget.value)} autocomplete="given-name" maxLength={40} />
      {aviso}
      <button type="submit" class="btn pri lg full" disabled={busy || !!sem}><Icon id="key" />{busy ? "Aguardando o Face ID…" : "Criar conta com Face ID"}</button>
      {voltar}
    </form>}

    {modo === "recuperar" && <form onSubmit={(e) => { e.preventDefault(); run(async () => { await api("POST", "/auth/recover", { codigo }); irPara("#conta"); }); }}>
      <h1>Código de recuperação</h1>
      <p class="sub">Cada código entra uma vez. Depois, em Conta, crie uma passkey nova neste aparelho.</p>
      <label class="f" for="en-rec">Código</label>
      <input id="en-rec" class="input mono" value={codigo} onInput={(e) => setCodigo(e.currentTarget.value)} autocomplete="one-time-code" autocapitalize="characters" spellcheck={false} required maxLength={16} placeholder="XXXX-XXXX-XX" />
      {aviso}
      <button type="submit" class="btn pri lg full" disabled={busy || !SERVER}>{busy ? "Entrando…" : "Entrar com o código"}</button>
      {voltar}
    </form>}

    {modo === "codigos" && <Codigos codigos={codigos} okLabel="Já guardei, continuar" onOk={() => irPara(volta)} />}
  </div>;
}
