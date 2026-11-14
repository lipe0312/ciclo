// Conta (#54/#55/#62): menu com as subtelas Perfil, Segurança, Pessoas e Convidar (só dono), Conectar Chat,
// Privacidade e dados, e Sair sempre visível. Rotas: #conta, #conta/perfil, #conta/seguranca, #conta/pessoas, #conta/chat, #conta/dados.
// Nada de dado de saúde de outra conta passa por aqui.
import { useEffect, useState } from "preact/hooks";
import type { Route } from "../../lib/roteador/index.ts";
import { SERVER, api } from "../../lib/api/index.ts";
import { Icon } from "../../lib/ui/index.tsx";
import { Conectar } from "./conectar.tsx";
import { PrivacidadeDados } from "./dados.tsx";
import { Perfil } from "./perfil.tsx";
import { Pessoas } from "./pessoas.tsx";
import { Seguranca } from "./seguranca.tsx";
import { Avatar, Sub, nomeCompleto, sair } from "./comum.tsx";
import type { Account } from "./comum.tsx";
import "./conta.css";

const ITENS: { id: string; nm: string; desc: string; icon: string; dono?: boolean }[] = [
  { id: "perfil", nm: "Perfil", desc: "Nome, sexo, nascimento, altura e peso", icon: "user" },
  { id: "seguranca", nm: "Segurança", desc: "Aparelhos, passkeys e códigos de recuperação", icon: "key" },
  { id: "pessoas", nm: "Pessoas e Convidar", desc: "Convites, vagas e acessos", icon: "grid", dono: true },
  { id: "chat", nm: "Conectar Chat", desc: "Use o Ciclo pelo seu Claude", icon: "chat" },
  { id: "dados", nm: "Privacidade e dados", desc: "Termos, privacidade, exportar e apagar", icon: "book" },
];

export default function Conta({ route }: { route: Route }) {
  const [acc, setAcc] = useState<Account | null>(null);
  const [erro, setErro] = useState("");
  const load = async () => setAcc((await api<{ account: Account }>("GET", "/api/account")).account);
  useEffect(() => { if (SERVER) load().catch(() => setErro("Não deu para carregar a conta.")); }, []);
  const sub = route.parts[0] ?? "";

  if (!SERVER) return <div class="conta"><p class="kicker">Conta</p><h1>Conta</h1>
    <div class="note"><Icon id="info" />Na demonstração não há conta: os dados ficam só neste navegador.</div>
    <Conectar demo /></div>;

  if (sub === "perfil") return <Sub titulo="Perfil"><Perfil acc={acc} onSalvo={setAcc} /></Sub>;
  if (sub === "seguranca") return <Sub titulo="Segurança"><Seguranca /></Sub>;
  if (sub === "pessoas" && acc?.role === "owner") return <Sub titulo="Pessoas e Convidar"><Pessoas /></Sub>;
  if (sub === "chat") return <Sub titulo="Conectar Chat"><Conectar demo={false} /></Sub>;
  if (sub === "dados") return <Sub titulo="Privacidade e dados"><PrivacidadeDados dona={acc?.role === "owner"} /></Sub>;

  return <div class="conta">
    <p class="kicker">Conta</p>
    <div class="conta-quem" aria-busy={!acc}>
      <Avatar nome={acc?.name} sobrenome={acc?.sobrenome} grande />
      <div><h1>{acc ? nomeCompleto(acc) : "Conta"}</h1>
        <p class="small sub">{!acc ? (erro ? " " : "Carregando…") : <>{acc.role === "owner" ? "Dono do app" : "Conta pessoal"}{acc.email ? ` · ${acc.email}` : ""}</>}</p></div>
    </div>
    {erro && <div class="note entrar-erro" role="alert"><Icon id="warn" />{erro}</div>}
    <nav class="card conta-menu" aria-label="Conta">
      {ITENS.filter((i) => !i.dono || acc?.role === "owner").map((i) => <a key={i.id} class="conta-item" href={`#conta/${i.id}`}>
        <Icon id={i.icon} /><span><b>{i.nm}</b><small class="sub">{i.desc}</small></span><Icon id="arrow" /></a>)}
    </nav>
    <button type="button" class="btn danger lg full" onClick={() => void sair()}>Sair</button>
  </div>;
}
