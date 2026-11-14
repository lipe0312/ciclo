// Conta (#54): aparelhos e sessões ("Sair deste aparelho" / "Sair de todos"), passkeys, códigos de recuperação
// e, para o dono, Pessoas (vagas, convites, resetar acesso). Nada de dado de saúde de outra conta passa por aqui.
// O resto da Conta (exportar/apagar, conectar o Claude) é a #55.
import { useEffect, useState } from "preact/hooks";
import { SERVER, api } from "../../lib/api/index.ts";
import { Icon, toast } from "../../lib/ui/index.tsx";
import { Codigos } from "../entrar/codigos.tsx";
import { criarPasskey, erroPasskey, temPasskey } from "../entrar/webauthn.ts";

interface Sessao { id: string; aparelho: string; createdAt: number; lastSeenAt: number | null; via: string; atual: boolean }
interface Passkey { id: string; createdAt: number; lastUsedAt: number | null; sincronizada: boolean }
interface Devices { sessions: Sessao[]; passkeys: Passkey[]; codigosRestantes: number; via: string | null }
interface Pessoa { id: string; nome: string; role: string; createdAt: number; lastSeenAt: number | null; eu: boolean }
interface Convite { id: string; email: string | null; reset: boolean; createdAt: number; expiresAt: number }
interface People { vagas: { texto: string; cheio: boolean }; people: Pessoa[]; invites: Convite[] }
interface Account { name: string | null; email: string | null; role: "owner" | "user"; via: string | null }

const dia = (ms: number | null) => (ms ? new Date(ms).toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: "numeric" }) : "nunca");
const sair = () => { location.hash = "#entrar"; location.reload(); };

export default function Conta() {
  const [acc, setAcc] = useState<Account | null>(null);
  const [dev, setDev] = useState<Devices | null>(null);
  const [ppl, setPpl] = useState<People | null>(null);
  const [codigos, setCodigos] = useState<string[]>([]);
  const [convite, setConvite] = useState<{ codigo: string; link: string; para?: string } | null>(null);
  const [email, setEmail] = useState("");
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState("");

  const load = async () => {
    const a = await api<{ account: Account }>("GET", "/api/account");
    setAcc(a.account);
    setDev(await api<Devices>("GET", "/api/account/devices"));
    if (a.account.role === "owner") setPpl(await api<People>("GET", "/api/account/people"));
  };
  useEffect(() => { if (SERVER) load().catch(() => setErro("Não deu para carregar a conta.")); }, []);

  const act = async (id: string, f: () => Promise<void>) => {
    setErro(""); setBusy(id);
    try { await f(); } catch (e) { setErro(erroPasskey(e)); } finally { setBusy(""); }
  };

  if (!SERVER) return <><p class="kicker">Conta</p><h1>Conta</h1>
    <div class="note" style="margin-top:12px"><Icon id="info" />Na demonstração não há conta: os dados ficam só neste navegador.</div></>;

  return <div class="conta">
    <p class="kicker">Conta</p>
    <h1>{acc ? acc.name ?? "Conta" : "Conta"}</h1>
    <p class="small sub" aria-busy={!acc}>{!acc ? (erro ? "\u00a0" : "Carregando…") : <>{acc.role === "owner" ? "Dona do app" : "Conta pessoal"}{acc.via === "access" ? " · entrou pelo Cloudflare Access (transição)" : ""}</>}</p>
    {erro && <div class="note entrar-erro" role="alert"><Icon id="warn" />{erro}</div>}

    {codigos.length > 0 && <Codigos codigos={codigos} onOk={() => setCodigos([])} />}

    <section class="card conta-sec" aria-labelledby="ct-ap">
      <h2 id="ct-ap">Aparelhos</h2>
      <p class="small sub">Cada aparelho fica logado por 90 dias, renovados quando você usa o app.</p>
      {!dev && <p class="small sub">{erro ? "Lista indisponível agora." : "Carregando…"}</p>}
      {dev && !dev.sessions.length && <p class="small sub">Nenhuma sessão de passkey ainda{acc?.via === "access" ? ": crie uma passkey abaixo para deixar o Access." : "."}</p>}
      <ul class="conta-list">{dev?.sessions.map((s) => <li key={s.id}>
        <div><strong>{s.aparelho}</strong>{s.atual && <span class="badge acc" style="margin-left:6px">este aparelho</span>}
          <p class="tiny sub">Entrou em {dia(s.createdAt)}{s.via === "recuperacao" ? " (código)" : ""} · último uso {dia(s.lastSeenAt)}</p></div>
        <button type="button" class="btn sm" disabled={!!busy} onClick={() => act("s" + s.id, async () => {
          await api("DELETE", `/api/account/sessions/${encodeURIComponent(s.id)}`);
          if (s.atual) sair(); else { toast("Aparelho desconectado"); await load(); }
        })}>{s.atual ? "Sair deste aparelho" : "Sair"}</button>
      </li>)}</ul>
      <button type="button" class="btn danger full" disabled={!!busy || !dev?.sessions.length} onClick={() => {
        if (!confirm("Sair de todos os aparelhos, inclusive este? Quem estiver com uma sessão sua perde o acesso na hora.")) return;
        act("todos", async () => { await api("POST", "/api/account/logout-all", {}); sair(); });
      }}>Sair de todos</button>
    </section>

    <section class="card conta-sec" aria-labelledby="ct-pk">
      <h2 id="ct-pk">Passkeys</h2>
      <p class="small sub">Com o iCloud Keychain, a passkey do iPhone já vale no Mac e no iPad. Adicione outra se usar um aparelho fora dele.</p>
      {dev?.passkeys.length === 1 && <p class="small sub">Mantenha ao menos uma: para apagar esta, adicione outra antes.</p>}
      <ul class="conta-list">{dev?.passkeys.map((p, i) => <li key={p.id}>
        <div><strong>Passkey {i + 1}</strong>{p.sincronizada && <span class="badge ok" style="margin-left:6px">sincronizada</span>}
          <p class="tiny sub">Criada em {dia(p.createdAt)} · último uso {dia(p.lastUsedAt)}</p></div>
        <button type="button" class="btn sm" disabled={!!busy || (dev?.passkeys.length ?? 0) < 2} aria-label={`Apagar passkey ${i + 1}`} onClick={() => {
          if (!confirm("Apagar esta passkey? O aparelho dela não entra mais.")) return;
          act("p" + p.id, async () => { await api("DELETE", `/api/account/passkeys/${encodeURIComponent(p.id)}`); toast("Passkey apagada"); await load(); });
        }}>Apagar</button>
      </li>)}</ul>
      <button type="button" class="btn pri full" disabled={!!busy || !temPasskey()} onClick={() => act("nova", async () => {
        await criarPasskey({}); toast("Passkey criada neste aparelho"); await load();
      })}><Icon id="plus" />{busy === "nova" ? "Aguardando o Face ID…" : "Adicionar passkey neste aparelho"}</button>
    </section>

    <section class="card conta-sec" aria-labelledby="ct-rc">
      <h2 id="ct-rc">Códigos de recuperação</h2>
      <p class="small sub">{dev ? <><span class="num">{dev.codigosRestantes}</span> de 8 ainda valem. Gerar novos invalida os antigos.</> : "Gerar novos invalida os antigos."}</p>
      <button type="button" class="btn full" disabled={!!busy} onClick={() => {
        if (dev?.codigosRestantes && !confirm("Gerar 8 códigos novos? Os antigos deixam de valer.")) return;
        act("rc", async () => { setCodigos((await api<{ codigos: string[] }>("POST", "/api/account/recovery-codes", {})).codigos); await load(); });
      }}>Gerar códigos novos</button>
    </section>

    {ppl && <section class="card conta-sec" aria-labelledby="ct-pp">
      <div class="row between"><h2 id="ct-pp">Pessoas</h2><span class={`badge${ppl.vagas.cheio ? " warn" : ""}`}>{ppl.vagas.texto}</span></div>
      <p class="small sub">Cada pessoa tem o próprio perfil. Aqui aparecem só nome e datas, nunca dados de treino ou saúde.</p>
      <ul class="conta-list">{ppl.people.map((p) => <li key={p.id}>
        <div><strong>{p.nome}</strong>{p.role === "owner" && <span class="badge" style="margin-left:6px">dona</span>}
          <p class="tiny sub">Desde {dia(p.createdAt)} · último acesso {dia(p.lastSeenAt)}</p></div>
        {!p.eu && <button type="button" class="btn sm" disabled={!!busy} onClick={() => {
          if (!confirm(`Resetar o acesso de ${p.nome}? Os aparelhos dela saem agora e um convite novo devolve o acesso. Os dados ficam.`)) return;
          act("r" + p.id, async () => { const r = await api<{ codigo: string; link: string }>("POST", `/api/account/people/${encodeURIComponent(p.id)}/reset`, {}); setConvite({ ...r, para: p.nome }); await load(); });
        }}>Resetar acesso</button>}
      </li>)}</ul>

      {convite && <div class="note conta-convite" role="status"><Icon id="key" /><div>
        <p><strong>Convite{convite.para ? ` para ${convite.para}` : ""}:</strong> <span class="mono">{convite.codigo}</span></p>
        <p class="tiny sub">Vale 7 dias, uma vez. Não aparece de novo.</p>
        <button type="button" class="btn sm" onClick={async () => { try { await navigator.clipboard.writeText(convite.link); toast("Link copiado"); } catch { toast("Copie o código acima"); } }}>Copiar link</button>
      </div></div>}

      {ppl.invites.length > 0 && <><p class="kicker" style="margin-top:12px">Convites pendentes</p>
        <ul class="conta-list">{ppl.invites.map((c) => <li key={c.id}>
          <div><strong>{c.reset ? "Reset de acesso" : c.email ?? "Convite"}</strong><p class="tiny sub">Vence em {dia(c.expiresAt)}</p></div>
          <button type="button" class="btn sm" disabled={!!busy} onClick={() => act("c" + c.id, async () => { await api("DELETE", `/api/account/invites/${encodeURIComponent(c.id)}`); await load(); })}>Cancelar</button>
        </li>)}</ul></>}

      <form class="conta-form" onSubmit={(e) => { e.preventDefault(); act("inv", async () => {
        const r = await api<{ codigo: string; link: string }>("POST", "/api/account/invites", email ? { email } : {}); setConvite(r); setEmail(""); await load();
      }); }}>
        <label class="f" for="ct-email">E-mail da pessoa (opcional)</label>
        <input id="ct-email" class="input" type="email" value={email} onInput={(e) => setEmail(e.currentTarget.value)} autocomplete="off" maxLength={254} />
        <button type="submit" class="btn pri full" disabled={!!busy || ppl.vagas.cheio}><Icon id="plus" />{ppl.vagas.cheio ? "Sem vagas" : "Criar convite"}</button>
      </form>
    </section>}
  </div>;
}
