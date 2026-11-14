// #54/#62 Conta → Segurança: aviso de login em aparelho novo ("Fui eu" / "Não fui eu"), aparelhos com último acesso
// (encerrar cada um), passkeys, códigos de recuperação e "Sair de todos". "Fui eu", adicionar/apagar passkey, ver códigos e sair de todos pedem Face ID.
import { useEffect, useState } from "preact/hooks";
import { api } from "../../lib/api/index.ts";
import { Icon, toast } from "../../lib/ui/index.tsx";
import { Codigos } from "../entrar/codigos.tsx";
import { comFaceId, criarPasskey, erroPasskey, temPasskey } from "../entrar/webauthn.ts";
import { dia, limparNavegador } from "./comum.tsx";

interface Sessao { id: string; aparelho: string; createdAt: number; lastSeenAt: number | null; via: string; atual: boolean; aviso: boolean }
interface Passkey { id: string; createdAt: number; lastUsedAt: number | null; sincronizada: boolean }
interface Devices { sessions: Sessao[]; passkeys: Passkey[]; codigosRestantes: number }

const paraLogin = () => { limparNavegador(); location.hash = "#entrar"; location.reload(); };

export function Seguranca() {
  const [dev, setDev] = useState<Devices | null>(null);
  const [codigos, setCodigos] = useState<string[]>([]);
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState("");
  const load = async () => setDev(await api<Devices>("GET", "/api/account/devices"));
  useEffect(() => { load().catch(() => setErro("Não deu para carregar os aparelhos.")); }, []);
  const act = async (id: string, f: () => Promise<void>) => {
    setErro(""); setBusy(id);
    try { await f(); } catch (e) { setErro(erroPasskey(e)); } finally { setBusy(""); }
  };
  const sairDeTodos = () => act("todos", async () => { await comFaceId(() => api("POST", "/api/account/logout-all", {})); paraLogin(); });
  const avisos = dev?.sessions.filter((s) => s.aviso) ?? [];

  return <>
    {erro && <div class="note entrar-erro" role="alert"><Icon id="warn" />{erro}</div>}
    {codigos.length > 0 && <Codigos codigos={codigos} onOk={() => setCodigos([])} />}

    {avisos.map((s) => <section key={s.id} class="card conta-sec conta-aviso" role="alert" aria-labelledby={`av-${s.id}`}>
      <h2 id={`av-${s.id}`}><Icon id="warn" />Login em aparelho novo</h2>
      <p class="small">{s.aparelho} entrou em {dia(s.createdAt)}{s.via === "recuperacao" ? " com um código de recuperação" : ""}.</p>
      <div class="conta-duas">
        <button type="button" class="btn" disabled={!!busy} onClick={() => act("ok" + s.id, async () => { await comFaceId(() => api("POST", `/api/account/sessions/${encodeURIComponent(s.id)}/ok`, {})); await load(); })}>Fui eu</button>
        <button type="button" class="btn danger" disabled={!!busy} onClick={() => {
          if (confirm("Encerrar TODAS as sessões agora, inclusive esta? Você entra de novo com o Face ID.")) sairDeTodos();
        }}>Não fui eu</button>
      </div>
    </section>)}

    <section class="card conta-sec" aria-labelledby="ct-ap">
      <h2 id="ct-ap">Aparelhos</h2>
      <p class="small sub">Cada aparelho fica conectado enquanto você usa o app: 30 dias sem abrir encerram a sessão, e a cada 180 dias o Face ID é pedido de novo.</p>
      {!dev && <p class="small sub">{erro ? "Lista indisponível agora." : "Carregando…"}</p>}
      <ul class="conta-list">{dev?.sessions.map((s) => <li key={s.id}>
        <div><strong>{s.aparelho}</strong>{s.atual && <span class="badge acc" style="margin-left:6px">este aparelho</span>}
          <p class="tiny sub">Entrou em {dia(s.createdAt)}{s.via === "recuperacao" ? " (código)" : ""} · último acesso {dia(s.lastSeenAt)}</p></div>
        <button type="button" class="btn sm" disabled={!!busy} onClick={() => act("s" + s.id, async () => {
          await api("DELETE", `/api/account/sessions/${encodeURIComponent(s.id)}`);
          if (s.atual) paraLogin(); else { toast("Aparelho desconectado"); await load(); }
        })}>{s.atual ? "Sair deste aparelho" : "Encerrar"}</button>
      </li>)}</ul>
      <button type="button" class="btn danger full" disabled={!!busy || !dev?.sessions.length} onClick={() => {
        if (!confirm("Sair de todos os aparelhos, inclusive este? Quem estiver com uma sessão sua perde o acesso na hora.")) return;
        sairDeTodos();
      }}>{busy === "todos" ? "Aguardando o Face ID…" : "Sair de todos"}</button>
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
          act("p" + p.id, async () => { await comFaceId(() => api("DELETE", `/api/account/passkeys/${encodeURIComponent(p.id)}`)); toast("Passkey apagada"); await load(); });
        }}>Apagar</button>
      </li>)}</ul>
      <button type="button" class="btn pri full" disabled={!!busy || !temPasskey()} onClick={() => act("nova", async () => {
        await comFaceId(() => criarPasskey({})); toast("Passkey criada neste aparelho"); await load(); // #62: pede Face ID recente
      })}><Icon id="plus" />{busy === "nova" ? "Aguardando o Face ID…" : "Adicionar passkey neste aparelho"}</button>
    </section>

    <section class="card conta-sec" aria-labelledby="ct-rc">
      <h2 id="ct-rc">Códigos de recuperação</h2>
      <p class="small sub">{dev ? <><span class="num">{dev.codigosRestantes}</span> de 8 ainda valem. Ver códigos novos pede o Face ID e invalida os antigos.</> : "Ver códigos novos pede o Face ID e invalida os antigos."}</p>
      <button type="button" class="btn full" disabled={!!busy} onClick={() => {
        if (dev?.codigosRestantes && !confirm("Gerar 8 códigos novos? Os antigos deixam de valer.")) return;
        act("rc", async () => { setCodigos((await comFaceId(() => api<{ codigos: string[] }>("POST", "/api/account/recovery-codes", {}))).codigos); await load(); });
      }}>{busy === "rc" ? "Aguardando o Face ID…" : "Ver códigos novos"}</button>
    </section>
  </>;
}
