// #54/#62 Conta → Pessoas e Convidar (só o dono; o servidor confere role='owner'): contador de vagas, pessoas (só nome e datas),
// resetar acesso, convidar com e-mail e nome (gera o link, com Compartilhar do sistema), convites pendentes e revogar.
// Convidar e resetar pedem Face ID. #165: cartão da fase (vagas = contas + convites pendentes, o número vem do servidor),
// editar teto, fim da fase de testes e abrir/fechar (Face ID); sem vaga, o botão de convidar diz por quê.
import { useEffect, useState } from "preact/hooks";
import * as C from "@ciclo/core";
import { api } from "../../lib/api/index.ts";
import { Icon, Seg, toast } from "../../lib/ui/index.tsx";
import { comFaceId, erroPasskey } from "../entrar/webauthn.ts";
import { dia } from "./comum.tsx";

interface Pessoa { id: string; nome: string; role: string; createdAt: number; lastSeenAt: number | null; eu: boolean }
interface Convite { id: string; email: string | null; nome: string | null; reset: boolean; createdAt: number; expiresAt: number }
interface Fase { id: string; nome: string; teto: number; inicio: string; fimTestes: string | null; aberta: boolean }
interface People { fase: Fase | null; vagas: C.VagasFase; motivo: string | null; people: Pessoa[]; invites: Convite[] }
interface Gerado { codigo: string; link: string; para?: string }
const dataBr = (d: string | null) => (d ? d.split("-").reverse().join("/") : "sem data");

/** #165 Cartão da fase: "Fase Piloto 2027 · 13 de 50 vagas · 3 convites pendentes" e a edição (teto, fim dos testes, aberta). */
function CartaoFase({ fase, vagas, onSalvo }: { fase: Fase; vagas: C.VagasFase; onSalvo: () => Promise<void> }) {
  const [teto, setTeto] = useState(String(fase.teto));
  const [fim, setFim] = useState(fase.fimTestes ?? "");
  const [aberta, setAberta] = useState(fase.aberta);
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setTeto(String(fase.teto)); setFim(fase.fimTestes ?? ""); setAberta(fase.aberta); }, [fase.id, fase.teto, fase.fimTestes, fase.aberta]);
  const t = Number(teto);
  const tetoOk = /^\d+$/.test(teto.trim()) && t >= 1 && t <= C.TETO_SEGURANCA;
  const mudou = t !== fase.teto || (fim || null) !== fase.fimTestes || aberta !== fase.aberta;
  const salvar = async (e: Event) => {
    e.preventDefault();
    if (!tetoOk) { setErro(`O teto vai de 1 a ${C.TETO_SEGURANCA}.`); return; }
    setErro(""); setBusy(true);
    try {
      await comFaceId(() => api("PATCH", `/api/account/fases/${encodeURIComponent(fase.id)}`, { teto: t, fimTestes: fim || null, aberta }));
      toast("Fase salva"); await onSalvo();
    } catch (x) { setErro(erroPasskey(x)); } finally { setBusy(false); }
  };
  return <section class="card conta-sec" aria-labelledby="pp-fase">
    <div class="row between"><h2 id="pp-fase">Fase {fase.nome}</h2><span class={`badge${fase.aberta ? "" : " warn"}`}>{fase.aberta ? "aberta" : "fechada"}</span></div>
    <p class="num"><strong>{vagas.texto}</strong> · {vagas.pendentes} {vagas.pendentes === 1 ? "convite pendente" : "convites pendentes"}</p>
    <p class="small sub">Vaga = conta ativa ou convite que ainda não venceu. Você não entra na conta. Convite vencido ou revogado devolve a vaga sozinho.
      {" "}Fim da fase de testes: {dataBr(fase.fimTestes)}.</p>
    <details class="oa-sit">
      <summary>Editar fase</summary>
      <form class="conta-form" onSubmit={salvar} noValidate>
        {erro && <div class="note entrar-erro" role="alert"><Icon id="warn" />{erro}</div>}
        <label class="f" for="pp-teto">Teto de vagas (1 a {C.TETO_SEGURANCA})</label>
        <input id="pp-teto" class="input num" inputMode="numeric" autocomplete="off" value={teto} onInput={(e) => setTeto(e.currentTarget.value)} aria-invalid={!tetoOk} aria-describedby="pp-teto-dica" />
        <p id="pp-teto-dica" class="tiny sub">Baixar o teto não tira ninguém: só barra convites e contas novas.</p>
        <label class="f" for="pp-fim">Fim da fase de testes (opcional)</label>
        <input id="pp-fim" class="input num" type="date" min={fase.inicio} value={fim} onInput={(e) => setFim(e.currentTarget.value)} />
        <p class="f" id="pp-aberta" style="margin-top:0">Convites novos</p>
        <Seg label="Convites novos" opts={[[true, "Aberta"], [false, "Fechada"]]} value={aberta} onPick={setAberta} />
        <p class="tiny sub">Fechada não emite convite novo; os já enviados valem até vencer.</p>
        <button type="submit" class="btn pri full" disabled={busy || !mudou} aria-describedby={!mudou && !busy ? "pp-fase-igual" : undefined}><Icon id="key" />{busy ? "Aguardando o Face ID…" : "Salvar com Face ID"}</button>
        {!mudou && !busy && <p id="pp-fase-igual" class="tiny sub" role="note">Sem alterações: mude o teto, a data ou a abertura para salvar.</p>}
      </form>
    </details>
  </section>;
}

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
  const motivo = ppl.motivo; // do servidor: sem fase, fase fechada ou sem vaga
  return <>
    {erro && <div class="note entrar-erro" role="alert"><Icon id="warn" />{erro}</div>}
    {ppl.fase && <CartaoFase fase={ppl.fase} vagas={ppl.vagas} onSalvo={load} />}
    <section class="card conta-sec" aria-labelledby="pp-conv">
      <div class="row between"><h2 id="pp-conv">Convidar</h2><span class={`badge num${ppl.vagas.cheio ? " warn" : ""}`}>{ppl.vagas.livres} {ppl.vagas.livres === 1 ? "vaga livre" : "vagas livres"}</span></div>
      <p class="small sub">O convite vale 7 dias, uma vez, e só para este e-mail. O link aparece uma vez: compartilhe agora.</p>
      <form class="conta-form" onSubmit={(e) => { e.preventDefault(); if (!valido) { setErro("Informe o e-mail e o nome de quem você vai convidar."); return; } act("inv", async () => {
        const r = await comFaceId(() => api<Gerado>("POST", "/api/account/invites", { email, nome }));
        setGerado({ ...r, para: C.nomeValido(nome) ?? undefined }); setEmail(""); setNome(""); await load();
      }); }} noValidate>
        <label class="f" for="pp-nome">Nome da pessoa</label>
        <input id="pp-nome" class="input" value={nome} onInput={(e) => setNome(e.currentTarget.value)} autocomplete="off" maxLength={40} required />
        <label class="f" for="pp-email">E-mail da pessoa</label>
        <input id="pp-email" class="input" type="email" value={email} onInput={(e) => setEmail(e.currentTarget.value)} autocomplete="off" maxLength={254} required />
        <button type="submit" class="btn pri full chv-salvar" disabled={!!busy || !!motivo || !valido} aria-describedby={motivo ? "pp-motivo" : !valido ? "pp-falta" : undefined}><Icon id="plus" />{motivo ? "Convidar indisponível" : busy === "inv" ? "Aguardando o Face ID…" : "Gerar convite"}</button>
        {motivo && <p id="pp-motivo" class="small" role="note"><Icon id="info" /> {motivo}</p>}
        {!motivo && !valido && !busy && <p id="pp-falta" class="tiny sub" role="note">Preencha o nome e um e-mail válido para gerar o convite.</p>}
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
