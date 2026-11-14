// #54/#62 Conta → Pessoas e Convidar (só o dono; o servidor confere role='owner'): contador de vagas, pessoas (só nome e datas),
// resetar acesso, convidar com e-mail e nome (gera o link, com Compartilhar do sistema), convites pendentes e revogar.
// Convidar e resetar pedem Face ID.
import { useEffect, useState } from "preact/hooks";
import * as C from "@ciclo/core";
import { api } from "../../lib/api/index.ts";
import { Icon, toast } from "../../lib/ui/index.tsx";
import { comFaceId, erroPasskey } from "../entrar/webauthn.ts";
import { dia } from "./comum.tsx";

interface Pessoa { id: string; nome: string; role: string; createdAt: number; lastSeenAt: number | null; eu: boolean }
interface Convite { id: string; email: string | null; nome: string | null; reset: boolean; createdAt: number; expiresAt: number }
interface People { vagas: { texto: string; cheio: boolean; usadas: number; max: number }; people: Pessoa[]; invites: Convite[] }
interface Gerado { codigo: string; link: string; para?: string }

async function compartilhar(c: Gerado) {
  const texto = `${c.para ? `${c.para}, você` : "Você"} foi convidado para o Ciclo. Abra o link no iPhone (vale 7 dias, uma vez):`;
  if (navigator.share) { try { await navigator.share({ title: "Convite para o Ciclo", text: texto, url: c.link }); return; } catch (e) { if ((e as { name?: string })?.name === "AbortError") return; } }
  try { await navigator.clipboard.writeText(c.link); toast("Link copiado"); } catch { toast("Copie o link acima"); }
}

export function Pessoas() {
  const [ppl, setPpl] = useState<People | null>(null);
  const [gerado, setGerado] = useState<Gerado | null>(null);
  const [email, setEmail] = useState("");
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState("");
  const load = async () => setPpl(await api<People>("GET", "/api/account/people"));
  useEffect(() => { load().catch(() => setErro("Não deu para carregar as pessoas.")); }, []);
  const act = async (id: string, f: () => Promise<void>) => {
    setErro(""); setBusy(id);
    try { await f(); } catch (e) { setErro(erroPasskey(e)); } finally { setBusy(""); }
  };
  const valido = !!C.emailValido(email) && !!C.nomeValido(nome);

  if (!ppl) return <p class="small sub" aria-busy={!erro}>{erro || "Carregando…"}</p>;
  return <>
    {erro && <div class="note entrar-erro" role="alert"><Icon id="warn" />{erro}</div>}
    <section class="card conta-sec" aria-labelledby="pp-conv">
      <div class="row between"><h2 id="pp-conv">Convidar</h2><span class={`badge${ppl.vagas.cheio ? " warn" : ""}`}>{ppl.vagas.texto}</span></div>
      <p class="small sub">O convite vale 7 dias, uma vez, e só para este e-mail. O link aparece uma vez: compartilhe agora.</p>
      <form class="conta-form" onSubmit={(e) => { e.preventDefault(); if (!valido) { setErro("Informe o e-mail e o nome de quem você vai convidar."); return; } act("inv", async () => {
        const r = await comFaceId(() => api<Gerado>("POST", "/api/account/invites", { email, nome }));
        setGerado({ ...r, para: C.nomeValido(nome) ?? undefined }); setEmail(""); setNome(""); await load();
      }); }} noValidate>
        <label class="f" for="pp-nome">Nome da pessoa</label>
        <input id="pp-nome" class="input" value={nome} onInput={(e) => setNome(e.currentTarget.value)} autocomplete="off" maxLength={40} required />
        <label class="f" for="pp-email">E-mail da pessoa</label>
        <input id="pp-email" class="input" type="email" value={email} onInput={(e) => setEmail(e.currentTarget.value)} autocomplete="off" maxLength={254} required />
        <button type="submit" class="btn pri full" disabled={!!busy || ppl.vagas.cheio || !valido}><Icon id="plus" />{ppl.vagas.cheio ? "Sem vagas" : busy === "inv" ? "Aguardando o Face ID…" : "Gerar convite"}</button>
      </form>
      {gerado && <div class="note conta-convite" role="status"><Icon id="key" /><div>
        <p><strong>Convite{gerado.para ? ` para ${gerado.para}` : ""}</strong></p>
        <p class="mono tiny">{gerado.link}</p>
        <div class="row wrapx" style="gap:8px;margin-top:6px">
          <button type="button" class="btn pri sm" onClick={() => void compartilhar(gerado)}>Compartilhar</button>
          <button type="button" class="btn sm" onClick={async () => { try { await navigator.clipboard.writeText(gerado.link); toast("Link copiado"); } catch { toast("Copie o link acima"); } }}>Copiar link</button>
        </div>
      </div></div>}
    </section>

    {ppl.invites.length > 0 && <section class="card conta-sec" aria-labelledby="pp-pend">
      <h2 id="pp-pend">Convites pendentes</h2>
      <ul class="conta-list">{ppl.invites.map((c) => <li key={c.id}>
        <div><strong>{c.reset ? "Reset de acesso" : c.nome ?? c.email ?? "Convite"}</strong><p class="tiny sub">{c.email ? `${c.email} · ` : ""}vence em {dia(c.expiresAt)}</p></div>
        <button type="button" class="btn sm" disabled={!!busy} onClick={() => act("c" + c.id, async () => { await api("DELETE", `/api/account/invites/${encodeURIComponent(c.id)}`); toast("Convite revogado"); await load(); })}>Revogar</button>
      </li>)}</ul>
    </section>}

    <section class="card conta-sec" aria-labelledby="pp-pes">
      <h2 id="pp-pes">Pessoas</h2>
      <p class="small sub">Cada pessoa tem o próprio perfil. Aqui aparecem só nome e datas, nunca dados de treino ou saúde.</p>
      <ul class="conta-list">{ppl.people.map((p) => <li key={p.id}>
        <div><strong>{p.nome}</strong>{p.role === "owner" && <span class="badge" style="margin-left:6px">dono</span>}
          <p class="tiny sub">Desde {dia(p.createdAt)} · último acesso {dia(p.lastSeenAt)}</p></div>
        {!p.eu && <button type="button" class="btn sm" disabled={!!busy} onClick={() => {
          if (!confirm(`Resetar o acesso de ${p.nome}? Os aparelhos saem agora e um convite novo devolve o acesso. Os dados ficam.`)) return;
          act("r" + p.id, async () => { const r = await comFaceId(() => api<Gerado>("POST", `/api/account/people/${encodeURIComponent(p.id)}/reset`, {})); setGerado({ ...r, para: p.nome }); await load(); });
        }}>Resetar acesso</button>}
      </li>)}</ul>
    </section>
  </>;
}
