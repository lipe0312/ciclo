// #88 Chaves de API (BYOK, ADR-0015), dentro de Perfil → Sua IA (#133). A pessoa usa o Chat conectado (assinatura), a própria chave de API, ou os dois.
// A chave só sai deste aparelho no POST/PUT: o campo é password, sem autocomplete, nunca vai para estado, URL, query,
// localStorage ou IndexedDB, e é limpo do DOM logo depois de lido. Depois de salva, a tela só vê
// provedor · apelido · ••••últimos4 · impressão · criada · último uso. Cadastrar, trocar, mudar e apagar pedem Face ID.
import { useEffect, useRef, useState } from "preact/hooks";
import * as C from "@ciclo/core";
import { HttpError, api } from "../../lib/api/index.ts";
import { recarregarContaIa } from "../../lib/sua-ia/estado.ts";
import { Icon, Seg, toast } from "../../lib/ui/index.tsx";
import { comFaceId, erroPasskey } from "../entrar/webauthn.ts";
import { dia } from "./comum.tsx";

type Provedor = C.ProvedorIa;
type Esforco = "baixo" | "medio" | "alto";
interface ChaveIa {
  id: string; provedor: Provedor; nomeProvedor: string; apelido: string; mascara: string; impressao: string;
  modelos: { id: string; familia: string }[]; modelo: string | null; esforco: Esforco;
  tetoDia: number; tetoMes: number; gastoDia: number; gastoMes: number; criadoEm: number; usadoEm: number | null; ativo: boolean;
}
interface Lista { chaves: ChaveIa[]; max: number; cofre: boolean; provedores: { id: Provedor; nome: string }[]; padraoServidor: { openai: boolean } }

const ESFORCOS: [Esforco, string][] = [["baixo", "Baixo"], ["medio", "Médio"], ["alto", "Alto"]];
const usd = (v: number) => `US$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const numero = (s: string) => Number(s.replace(",", ".").trim());
/** Lê o campo da chave e já o esvazia: o valor vive só nesta chamada (nunca em estado do componente). */
function tirarChave(ref: { current: HTMLInputElement | null }): string {
  const el = ref.current; const v = el?.value ?? "";
  if (el) el.value = "";
  return v;
}
const msgErro = (e: unknown) => (e instanceof HttpError ? e.message : erroPasskey(e));

/** Campo da chave: password, sem autocomplete/correção, sem name (nada vai para a URL), sem valor controlado. */
function CampoChave({ id, rotulo, refEl }: { id: string; rotulo: string; refEl: { current: HTMLInputElement | null } }) {
  return <>
    <label class="f" for={id}>{rotulo}</label>
    <input id={id} ref={refEl} class="input mono" type="password" autocomplete="off" autoCapitalize="off" autoCorrect="off" spellcheck={false}
      inputMode="text" maxLength={512} required aria-describedby={`${id}-ajuda`} />
    <p id={`${id}-ajuda`} class="tiny sub">Fica cifrada no servidor. Depois de salva, ninguém vê a chave inteira, nem você.</p>
  </>;
}

function Item({ k, busy, act, onMudou }: { k: ChaveIa; busy: string; act: (id: string, f: () => Promise<void>) => void; onMudou: () => Promise<void> }) {
  const [trocando, setTrocando] = useState(false);
  const novaRef = useRef<HTMLInputElement>(null);
  const patch = (b: Record<string, unknown>, ok: string) => act(`p${k.id}`, async () => {
    await comFaceId(() => api("PATCH", `/api/account/chaves/${encodeURIComponent(k.id)}`, b)); toast(ok); await onMudou();
  });
  const trocar = () => act(`t${k.id}`, async () => {
    const chave = tirarChave(novaRef);
    await comFaceId(() => api("PUT", `/api/account/chaves/${encodeURIComponent(k.id)}/segredo`, { chave }));
    setTrocando(false); toast("Chave trocada e validada"); await onMudou();
  });
  const cheio = k.gastoDia >= k.tetoDia || k.gastoMes >= k.tetoMes;
  return <li class="chv-item">
    <div class="chv-topo">
      <div class="chv-nome"><strong>{k.nomeProvedor} · {k.apelido}</strong>
        <span class={`badge ${k.ativo ? "ok" : ""}`}>{k.ativo ? "ativa" : "desativada"}</span>
        {cheio && <span class="badge warn">teto atingido</span>}</div>
      <p class="tiny sub"><span class="mono">{k.mascara}</span> · impressão <span class="mono">{k.impressao}</span> · criada em {dia(k.criadoEm)} · último uso {dia(k.usadoEm)}</p>
      <p class="tiny sub num">Hoje {usd(k.gastoDia)} de {usd(k.tetoDia)} · mês {usd(k.gastoMes)} de {usd(k.tetoMes)}</p>
    </div>
    <div class="chv-grade">
      <div><label class="f" for={`m-${k.id}`}>Modelo</label>
        <select id={`m-${k.id}`} class="input" value={k.modelo ?? ""} disabled={!!busy} onChange={(e) => patch({ modelo: (e.currentTarget as HTMLSelectElement).value }, "Modelo salvo")}>
          {k.modelos.map((m) => <option key={m.id} value={m.id}>{m.familia} · {m.id}</option>)}
        </select></div>
      <div><span class="f">Esforço</span>
        <Seg<Esforco> opts={ESFORCOS} value={k.esforco} label={`Esforço de ${k.apelido}`} onPick={(v) => { if (v !== k.esforco && !busy) patch({ esforco: v }, "Esforço salvo"); }} /></div>
    </div>
    {trocando && <form class="conta-form" onSubmit={(e) => { e.preventDefault(); trocar(); }} noValidate>
      <CampoChave id={`nova-${k.id}`} rotulo={`Chave nova da ${k.nomeProvedor}`} refEl={novaRef} />
      <div class="conta-duas">
        <button type="button" class="btn" onClick={() => { tirarChave(novaRef); setTrocando(false); }}>Cancelar</button>
        <button type="submit" class="btn pri" disabled={!!busy}>{busy === `t${k.id}` ? "Validando…" : "Validar e trocar"}</button>
      </div>
    </form>}
    {!trocando && <div class="chv-acoes">
      <button type="button" class="btn sm" disabled={!!busy} onClick={() => setTrocando(true)}>Trocar chave</button>
      <button type="button" class="btn sm" disabled={!!busy} onClick={() => patch({ ativo: !k.ativo }, k.ativo ? "Chave desativada" : "Chave ativada")}>{k.ativo ? "Desativar" : "Ativar"}</button>
      <button type="button" class="btn sm danger" disabled={!!busy} aria-label={`Apagar ${k.apelido}`} onClick={() => {
        if (!confirm(`Apagar a chave "${k.apelido}"? Ela some do servidor agora (o histórico de uso fica, sem a chave).`)) return;
        act(`d${k.id}`, async () => { await comFaceId(() => api("DELETE", `/api/account/chaves/${encodeURIComponent(k.id)}`)); toast("Chave apagada"); await onMudou(); });
      }}>Apagar</button>
    </div>}
  </li>;
}

/** Na demonstração (sem servidor): lista vazia fictícia, nada é enviado. */
const DEMO: Lista = { chaves: [], max: 6, cofre: false, padraoServidor: { openai: false },
  provedores: C.PROVEDORES_IA.map((id) => ({ id, nome: C.NOME_PROVEDOR[id] })) };

export function Chaves({ demo = false, inicial }: { demo?: boolean; inicial?: Provedor }) {
  const [lista, setLista] = useState<Lista | null>(demo ? DEMO : null);
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState("");
  const [prov, setProv] = useState<Provedor>(inicial ?? "openai");
  useEffect(() => { if (inicial) setProv(inicial); }, [inicial]);
  // #133 nível grátis: 1 frase sobre o uso dos dados e "Entendi" antes de salvar
  const [entendi, setEntendi] = useState<Partial<Record<Provedor, boolean>>>({});
  const aviso = C.avisoChaveGratis(prov);
  const [apelido, setApelido] = useState("");
  const [tetoDia, setTetoDia] = useState("1");
  const [tetoMes, setTetoMes] = useState("10");
  const chaveRef = useRef<HTMLInputElement>(null);
  const load = async () => { setLista(await api<Lista>("GET", "/api/account/chaves")); void recarregarContaIa(); };
  useEffect(() => { if (!demo) load().catch(() => setErro("Não deu para carregar as chaves.")); }, []);
  const act = (id: string, f: () => Promise<void>) => {
    setErro(""); setBusy(id);
    void f().catch((e) => setErro(msgErro(e))).finally(() => setBusy(""));
  };
  const salvar = () => act("nova", async () => {
    const chave = tirarChave(chaveRef);
    await comFaceId(() => api("POST", "/api/account/chaves", { provedor: prov, apelido: apelido.trim() || undefined, chave, tetoDia: numero(tetoDia), tetoMes: numero(tetoMes) }));
    setApelido(""); toast("Chave validada e guardada"); await load();
  });
  const nomes = lista?.provedores ?? [];
  const cheia = !!lista && lista.chaves.length >= lista.max;
  // por que o botão está parado (dito ao lado dele, não só pela cor)
  const motivo = demo ? "Na demonstração não há servidor: crie sua conta para cadastrar uma chave."
    : lista && !lista.cofre ? "O cofre de chaves ainda não foi ligado neste servidor. Peça ao dono do app."
    : cheia ? `Você já tem ${lista?.max} chaves: apague uma para cadastrar outra.`
    : aviso && !entendi[prov] ? "Leia o aviso acima e toque em Entendi." : "";

  return <>
    <p class="small sub">Use o Chat conectado pela sua assinatura, a sua própria chave de API, ou os dois. A chave fica cifrada no servidor e só é usada pelo app, com o teto de gasto que você definir.</p>
    {erro && <div class="note entrar-erro" role="alert"><Icon id="warn" />{erro}</div>}
    {lista?.padraoServidor.openai && <div class="note"><Icon id="info" />O app tem uma chave de reserva do dono (OpenAI). Se você cadastrar a sua, a sua tem prioridade.</div>}

    <section class="card conta-sec" aria-labelledby="chv-suas">
      <h2 id="chv-suas">Suas chaves</h2>
      {!lista && <p class="small sub" aria-busy="true">{erro ? "Lista indisponível agora." : "Carregando…"}</p>}
      {lista && !lista.chaves.length && <p class="small sub">Nenhuma chave ainda. O Chat conectado já funciona sem chave; cadastre uma só se quiser usar a sua própria conta de API.</p>}
      <ul class="conta-list chv-lista">{lista?.chaves.map((k) => <Item key={k.id} k={k} busy={busy} act={act} onMudou={load} />)}</ul>
    </section>

    <form class="card conta-sec conta-form" aria-labelledby="chv-nova" onSubmit={(e) => { e.preventDefault(); salvar(); }} noValidate autocomplete="off">
      <h2 id="chv-nova">Cadastrar chave</h2>
      <span class="f">Provedor</span>
      <div class="chips" role="group" aria-label="Provedor">{(nomes.length ? nomes : DEMO.provedores).map((p) =>
        <button type="button" key={p.id} class="chip tall" aria-pressed={prov === p.id} onClick={() => setProv(p.id)}>{p.nome}</button>)}</div>
      {aviso && <div class="note warn" role="note"><Icon id="warn" /><span style="flex:1">{aviso}</span>
        {entendi[prov] ? <span class="badge ok"><Icon id="check" />entendido</span>
          : <button type="button" class="btn sm" onClick={() => setEntendi({ ...entendi, [prov]: true })}>Entendi</button>}</div>}
      <label class="f" for="chv-apelido">Apelido (opcional)</label>
      <input id="chv-apelido" class="input" value={apelido} maxLength={40} autocomplete="off" onInput={(e) => setApelido((e.currentTarget as HTMLInputElement).value)} />
      <CampoChave id="chv-chave" rotulo="Chave de API" refEl={chaveRef} />
      <div class="conta-duas">
        <div><label class="f" for="chv-dia">Teto por dia (US$)</label>
          <input id="chv-dia" class="input num" inputMode="decimal" value={tetoDia} maxLength={6} onInput={(e) => setTetoDia((e.currentTarget as HTMLInputElement).value)} /></div>
        <div><label class="f" for="chv-mes">Teto por mês (US$)</label>
          <input id="chv-mes" class="input num" inputMode="decimal" value={tetoMes} maxLength={6} onInput={(e) => setTetoMes((e.currentTarget as HTMLInputElement).value)} /></div>
      </div>
      <p class="tiny sub">Ao salvar, o app confere a chave no provedor (lista os modelos dela) e pede o Face ID. Bateu o teto, para e avisa.</p>
      {motivo && <p id="chv-motivo" class="note warn" role="status"><Icon id="warn" />{motivo}</p>}
      <button type="submit" class="btn pri full chv-salvar" disabled={!!busy || !!motivo} aria-describedby={motivo ? "chv-motivo" : undefined}>{busy === "nova" ? "Validando…" : "Validar e salvar"}</button>
    </form>
  </>;
}
