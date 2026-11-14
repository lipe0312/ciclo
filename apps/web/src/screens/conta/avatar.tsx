// #62 Bolinha de perfil no topo da Home, à direita: iniciais da conta; abre o menu com Conta e Sair.
import { S } from "../../lib/store/index.ts";
import { SERVER } from "../../lib/api/index.ts";
import { SheetHead, closeSheet, openSheet } from "../../lib/folha/index.tsx";
import { Icon } from "../../lib/ui/index.tsx";
import { Avatar, nomeCompleto, sair } from "./comum.tsx";
import "./conta.css";

export function AvatarMenu() {
  const a = S.account as { name: string | null; sobrenome?: string | null; email?: string | null } | null;
  const nome = SERVER ? a?.name ?? null : "Demo";
  const abrir = () => openSheet(() => <div class="avatar-menu">
    <SheetHead kicker="Conta" title={SERVER ? nomeCompleto({ name: a?.name ?? null, sobrenome: a?.sobrenome ?? null }) : "Demonstração"} />
    {SERVER && a?.email && <p class="small sub">{a.email}</p>}
    <a class="conta-item" href="#conta" onClick={closeSheet}><Icon id="user" /><span>Conta</span><Icon id="arrow" /></a>
    <a class="conta-item" href="#conta/perfil" onClick={closeSheet}><Icon id="edit" /><span>Perfil</span><Icon id="arrow" /></a>
    {SERVER && <button type="button" class="btn danger full" onClick={() => { closeSheet(); void sair(); }}>Sair</button>}
  </div>);
  return <button type="button" class="avatar-btn" onClick={abrir} aria-label={`Abrir menu da conta${a?.name ? ` de ${a.name}` : ""}`} aria-haspopup="dialog">
    <Avatar nome={nome} sobrenome={a?.sobrenome ?? null} />
  </button>;
}
