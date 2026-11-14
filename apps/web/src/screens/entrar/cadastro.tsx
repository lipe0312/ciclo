// #62 "Crie sua conta no Ciclo": uma etapa por tela, com barra de progresso.
// Convite (/#convite/<código>): boas-vindas com quem convidou → nome e sobrenome → sexo → nascimento (opcional) → termos e
// privacidade (aceite) → Face ID → códigos de recuperação. Reset de acesso: boas-vindas → Face ID → códigos.
// Primeiro acesso do dono: o CÓDIGO de configuração e o e-mail vêm SEMPRE antes de tudo (o Face ID só começa com o código digitado).
// O botão de cada etapa fica logo abaixo dos campos (no fluxo da página): o teclado do iPhone não cobre.
import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import * as C from "@ciclo/core";
import { HttpError, SERVER, api } from "../../lib/api/index.ts";
import { Icon } from "../../lib/ui/index.tsx";
import { Codigos } from "./codigos.tsx";
import { Turnstile } from "./turnstile.tsx";
import { criarPasskey, erroPasskey, temPasskey } from "./webauthn.ts";
import { Privacidade, Termos } from "../legal/index.tsx";
import "./entrar.css";

interface Preview { reset: boolean; nome: string | null; email: string | null; por: string; expiresAt: number }
type Etapa = "boas" | "setup" | "nome" | "sexo" | "nascimento" | "aceite" | "faceid" | "codigos";
const hoje = () => new Date().toISOString().slice(0, 10);
function irPara(h: string) { location.hash = h; location.reload(); }

const SEXO_DESC: Record<C.Sexo, string> = {
  feminino: "Ajusta volume, descanso e progressão.",
  masculino: "Ajusta volume, descanso e progressão.",
  nao_informado: "Usamos uma abordagem neutra. Dá para mudar depois em Conta → Perfil.",
};

export function Cadastro({ modo, codigo, siteKey, onSair }: { modo: "convite" | "dono"; codigo?: string; siteKey: string | null; onSair: () => void }) {
  const [prev, setPrev] = useState<Preview | null>(null);
  const [erro, setErro] = useState("");
  const [fatal, setFatal] = useState("");
  const [busy, setBusy] = useState(false);
  const [etapa, setEtapa] = useState<Etapa>(modo === "dono" ? "setup" : "boas");
  const [f, setF] = useState({ setup: "", email: "", nome: "", sobrenome: "", sexo: "" as C.Sexo | "", nascimento: "", aceite: false });
  const [codigos, setCodigos] = useState<string[]>([]);
  const [token, setToken] = useState(""), [tsVez, setTsVez] = useState(0);
  const titulo = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (modo !== "convite" || !codigo) return;
    api<Preview>("POST", "/auth/convite", { convite: codigo }).then((p) => { setPrev(p); setF((x) => ({ ...x, nome: p.reset ? "" : p.nome ?? "", email: p.email ?? "" })); })
      .catch((e) => setFatal(e instanceof HttpError ? e.message : "Sem conexão. Abra o link de novo quando tiver internet."));
  }, [codigo]);
  useEffect(() => { titulo.current?.focus(); setErro(""); }, [etapa]);

  const reset = !!prev?.reset;
  const etapas: Etapa[] = modo === "dono" ? ["setup", "nome", "sexo", "nascimento", "aceite", "faceid", "codigos"]
    : reset ? ["boas", "faceid", "codigos"] : ["boas", "nome", "sexo", "nascimento", "aceite", "faceid", "codigos"];
  const i = Math.max(0, etapas.indexOf(etapa)), pct = Math.round(((i + 1) / etapas.length) * 100);
  const proxima = () => setEtapa(etapas[Math.min(etapas.length - 1, i + 1)]);
  const anterior = () => (i === 0 ? onSair() : setEtapa(etapas[i - 1]));
  const set = (k: keyof typeof f) => (e: Event) => setF((x) => ({ ...x, [k]: (e.currentTarget as HTMLInputElement).value }));

  const nascOk = C.nascimentoValido(f.nascimento, hoje()).ok;
  const pode: Record<Etapa, boolean> = {
    boas: !!prev, setup: f.setup.trim().length >= 16 && !!C.emailValido(f.email), nome: !!C.nomeValido(f.nome) && !!C.sobrenomeValido(f.sobrenome),
    sexo: !!C.sexoValido(f.sexo), nascimento: nascOk, aceite: f.aceite, faceid: true, codigos: true,
  };
  const robo = modo === "convite" && !!siteKey;
  const sem = !SERVER ? "Na demonstração não há conta: os dados ficam só neste navegador." : !temPasskey() ? "Este navegador não tem passkey. Use o Safari do iPhone ou um navegador atualizado." : "";

  const criar = async () => {
    setErro(""); setBusy(true);
    const base = { nome: f.nome, sobrenome: f.sobrenome, sexo: f.sexo, nascimento: f.nascimento || null, aceite: { ...C.CONSENT_VERSAO } };
    const body = modo === "dono" ? { setup: f.setup, email: f.email, ...base }
      : reset ? { convite: codigo } : { convite: codigo, email: f.email, ...base, ...(robo && token ? { turnstile: token } : {}) };
    try {
      const r = await criarPasskey(body);
      if (r.codigos?.length) { setCodigos(r.codigos); setEtapa("codigos"); } else irPara("#hoje");
    } catch (e) {
      const code = (e instanceof HttpError ? (e.data as { code?: string } | null)?.code : null) ?? "";
      setErro(erroPasskey(e));
      if (code === "setup_errado") setEtapa("setup"); // o código ou o e-mail estavam errados: volta para eles
      if (code === "aceite") setEtapa("aceite");
    } finally { setBusy(false); if (robo) { setToken(""); setTsVez((n) => n + 1); } }
  };

  if (fatal) return <div class="entrar"><div class="note entrar-erro" role="alert"><Icon id="warn" />{fatal}</div>
    <p class="sub">Sem convite válido? Peça um novo a quem administra o app.</p>
    <button type="button" class="btn" onClick={onSair}><Icon id="back" />Voltar ao início</button></div>;
  if (modo === "convite" && !prev) return <div class="entrar" aria-busy="true"><p class="sub">Abrindo o convite…</p></div>;

  const aviso = erro && <div class="note entrar-erro" role="alert"><Icon id="warn" />{erro}</div>;
  const cta = (label = "Continuar") => <button type="submit" class="btn pri lg full" disabled={!pode[etapa]}>{label}<Icon id="arrow" /></button>;
  const form = (onOk: () => void, conteudo: ComponentChildren) =>
    <form class="cad-form" onSubmit={(e) => { e.preventDefault(); if (pode[etapa]) onOk(); }} noValidate>{conteudo}</form>;

  return <div class="entrar cad">
    <div class="cad-top">
      <button type="button" class="btn ghost" onClick={anterior} disabled={busy || etapa === "codigos"}><Icon id="back" />Voltar</button>
      <span class="small sub num" aria-hidden="true">{i + 1} de {etapas.length}</span>
    </div>
    <div class="pp-bar" role="progressbar" aria-label="Progresso do cadastro" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><i style={`width:${pct}%`} /></div>
    <p class="kicker cad-kicker">{modo === "dono" ? "Primeiro acesso" : reset ? "Recupere o acesso" : "Crie sua conta no Ciclo"}</p>

    {etapa === "boas" && prev && form(proxima, <>
      <h1 ref={titulo} tabIndex={-1}>{reset ? `Oi${prev.nome ? `, ${prev.nome}` : ""}` : `Bem-vindo${prev.nome ? `, ${prev.nome}` : ""}`}</h1>
      <p class="sub">{reset ? <>{prev.por} liberou um acesso novo para a sua conta. Seus dados continuam lá: só falta criar o Face ID neste aparelho.</>
        : <><b>{prev.por}</b> te convidou para o Ciclo, um app de treino com semana flexível.</>}</p>
      {!reset && prev.email && <div class="cad-email"><span class="tiny sub">E-mail do convite</span><span class="mono">{prev.email}</span></div>}
      <p class="tiny sub">O convite vale uma vez, até {new Date(prev.expiresAt).toLocaleDateString("pt-BR", { day: "numeric", month: "long" })}.</p>
      {cta("Começar")}
    </>)}

    {etapa === "setup" && form(proxima, <>
      <h1 ref={titulo} tabIndex={-1}>Código de configuração</h1>
      <p class="sub">Primeiro o código (OWNER_SETUP_CODE) e o seu e-mail de dono (OWNER_EMAIL). Sem os dois, a conta de dono não é criada.</p>
      <label class="f" for="cad-setup">Código de configuração</label>
      <input id="cad-setup" class="input mono" type="password" value={f.setup} onInput={set("setup")} autocomplete="off" required minLength={16} maxLength={200} enterkeyhint="next" />
      <label class="f" for="cad-email">Seu e-mail</label>
      <input id="cad-email" class="input" type="email" value={f.email} onInput={set("email")} autocomplete="email" required maxLength={254} enterkeyhint="next" />
      {aviso}
      {cta()}
    </>)}

    {etapa === "nome" && form(proxima, <>
      <h1 ref={titulo} tabIndex={-1}>Como você se chama?</h1>
      <label class="f" for="cad-nome">Nome</label>
      <input id="cad-nome" class="input" value={f.nome} onInput={set("nome")} autocomplete="given-name" required maxLength={40} enterkeyhint="next" />
      <label class="f" for="cad-sobre">Sobrenome</label>
      <input id="cad-sobre" class="input" value={f.sobrenome} onInput={set("sobrenome")} autocomplete="family-name" required maxLength={60} enterkeyhint="next" />
      {cta()}
    </>)}

    {etapa === "sexo" && form(proxima, <>
      <h1 ref={titulo} tabIndex={-1}>Sexo</h1>
      <p class="sub">Muda volume, descanso e progressão do treino.</p>
      <div class="opts" role="group" aria-label="Sexo">{C.SEXOS.map((s) =>
        <button type="button" key={s} class="opt big" aria-pressed={f.sexo === s} onClick={() => setF((x) => ({ ...x, sexo: s }))}>
          <b>{C.SEXO_TEXTO[s]}</b><span>{SEXO_DESC[s]}</span></button>)}</div>
      {cta()}
    </>)}

    {etapa === "nascimento" && form(proxima, <>
      <h1 ref={titulo} tabIndex={-1}>Data de nascimento</h1>
      <p class="sub">Opcional. Calibra o ritmo de ganho e a recuperação.</p>
      <label class="f" for="cad-nasc">Nascimento</label>
      <input id="cad-nasc" class="input" type="date" value={f.nascimento} onInput={set("nascimento")} autocomplete="bday" max={hoje()} enterkeyhint="next" />
      {!nascOk && <p class="tiny entrar-erro" role="alert">Confira a data (idade de 13 a 110 anos).</p>}
      {cta(f.nascimento ? "Continuar" : "Pular")}
    </>)}

    {etapa === "aceite" && form(proxima, <>
      <h1 ref={titulo} tabIndex={-1}>Termos e privacidade</h1>
      <p class="sub">O Ciclo guarda dados de saúde (peso, medidas, dores, exames, comida e treinos). Eles só servem para montar o seu treino: sem venda, sem anúncio.</p>
      <details class="cad-doc"><summary>Ler os termos de uso</summary><Termos /></details>
      <details class="cad-doc"><summary>Ler a privacidade</summary><Privacidade /></details>
      <label class="cad-check">
        <input type="checkbox" checked={f.aceite} onChange={(e) => setF((x) => ({ ...x, aceite: e.currentTarget.checked }))} />
        <span>Li e aceito os <a class="link44" href="#termos" target="_blank" rel="noopener">termos</a> e a <a class="link44" href="#privacidade" target="_blank" rel="noopener">privacidade</a>, e consinto com o uso dos meus dados de saúde para montar o meu treino.</span>
      </label>
      {aviso}
      {cta()}
    </>)}

    {etapa === "faceid" && <div class="cad-form">
      <h1 ref={titulo} tabIndex={-1}>Face ID</h1>
      <p class="sub">Sem senha: a passkey fica no iCloud Keychain (ou no Gerenciador de senhas do Google) e vale no Mac e no iPad da sua conta.</p>
      {sem && <div class="note"><Icon id="info" />{sem}</div>}
      {robo && siteKey && <Turnstile key={tsVez} siteKey={siteKey} onToken={setToken} onErro={() => setErro("Não deu para carregar a verificação contra robôs. Confira a internet e tente de novo.")} />}
      {aviso}
      <button type="button" class="btn pri lg full" disabled={busy || !!sem || (robo && !token)} onClick={criar}><Icon id="key" />{busy ? "Aguardando o Face ID…" : reset ? "Criar Face ID neste aparelho" : "Criar conta com Face ID"}</button>
    </div>}

    {etapa === "codigos" && <Codigos codigos={codigos} okLabel="Já guardei, abrir o app" onOk={() => irPara("#hoje")} />}
  </div>;
}
