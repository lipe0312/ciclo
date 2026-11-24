// #89 Card de proposta da IA do Chat: prévia antes → depois (treino do dia ou comida) com Aprovar, Corrigir (edição no card)
// e Pedir alteração (texto que volta ao modelo). Nada grava antes do Aprovar; o servidor valida de novo ao aprovar.
// Todo texto vem como texto (o Preact escapa); nada de HTML vindo da IA.
import { useState } from "preact/hooks";
import { SERVER, api } from "../../lib/api/index.ts";
import { Icon, toast } from "../../lib/ui/index.tsx";

type PreviaTreino = { tipo: "treino"; data: string; nome?: string; antes: string[]; depois: string[]; avisos: string[] };
type PreviaComida = { tipo: "comida"; data: string; refeicoes: { refeicao: string; resumo: string; kcal: number; proteina: number }[]; duvidas: string[]; escolha: boolean };
export interface PropostaChat { id: string; ferramenta: string; args: Record<string, any>; previa: PreviaTreino | PreviaComida; status: string; criadoEm: number }

const REFEICAO: Record<string, string> = { cafe: "Café", almoco: "Almoço", lanche: "Lanche", jantar: "Jantar", ceia: "Ceia" };
const STATUS: Record<string, [string, string]> = { aprovada: ["aprovada", "ok"], descartada: ["descartada", ""], alterada: ["alteração pedida", "warn"] };
const diaBr = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : d);

/** Nome e séries de cada item da prévia ("Elevação lateral 3×12–15" → nome). */
const nomeDe = (linha: string) => linha.replace(/\s+\d+×[\d–-]+$/, "");

export function CardProposta({ p, provedor, onMuda, onResposta }: {
  p: PropostaChat; provedor: string | null;
  onMuda: (p: PropostaChat) => void;
  /** Pedir alteração devolve uma mensagem nova da IA (com as propostas novas) */ onResposta: (r: { mensagem: { texto: string; papel: string }; propostas: PropostaChat[] }) => void;
}) {
  const [modo, setModo] = useState<"ver" | "corrigir" | "alterar">("ver");
  const [ocupado, setOcupado] = useState(false);
  const [sets, setSets] = useState<number[]>(() => (Array.isArray(p.args.itens) ? p.args.itens.map((i: any) => Number(i?.sets) || 3) : []));
  const [texto, setTexto] = useState<string>(typeof p.args.texto === "string" ? p.args.texto : "");
  const [pedido, setPedido] = useState("");
  const pv = p.previa;
  const pendente = p.status === "pendente";
  const titulo = pv?.tipo === "treino" ? `Treino de ${diaBr(pv.data)}` : `Comida de ${diaBr(pv?.data ?? "")}`;

  async function acao(fn: () => Promise<void>) {
    if (ocupado) return;
    setOcupado(true);
    try { await fn(); } catch (e) { toast(e instanceof Error && e.message ? e.message : "Não deu agora. Tente de novo"); } finally { setOcupado(false); }
  }
  const aprovar = (args?: Record<string, unknown>) => acao(async () => {
    if (SERVER) await api("POST", `/api/chat/propostas/${encodeURIComponent(p.id)}/aprovar`, args ? { args } : {});
    onMuda({ ...p, status: "aprovada", ...(args ? { args } : {}) }); setModo("ver");
    toast(pv?.tipo === "treino" ? "Treino do dia atualizado" : "Comida registrada");
  });
  const corrigido = () => (pv?.tipo === "treino"
    ? { ...p.args, itens: (p.args.itens ?? []).map((i: any, k: number) => ({ ...i, sets: sets[k] })) }
    : { ...p.args, texto: texto.trim() });
  const descartar = () => acao(async () => {
    if (SERVER) await api("POST", `/api/chat/propostas/${encodeURIComponent(p.id)}/descartar`, {});
    onMuda({ ...p, status: "descartada" });
  });
  const alterar = () => acao(async () => {
    const t = pedido.trim();
    if (!t) { toast("Diga o que mudar"); return; }
    if (!SERVER) { onMuda({ ...p, status: "alterada" }); onResposta({ mensagem: { papel: "ia", texto: "Na demonstração a IA não refaz a proposta." }, propostas: [] }); return; }
    const r = await api("POST", `/api/chat/propostas/${encodeURIComponent(p.id)}/alterar`, { texto: t, provedor });
    onMuda({ ...p, status: "alterada" }); onResposta(r); setPedido(""); setModo("ver");
  });

  const [rot, cls] = STATUS[p.status] ?? ["", ""];
  return <section class="ch-prop" aria-label={`Proposta: ${titulo}`}>
    <div class="row between start ch-prop-topo">
      <p class="small"><b>Proposta</b> · {titulo}</p>
      {!pendente && rot && <span class={`badge ${cls}`}>{rot}</span>}
    </div>
    {pv?.tipo === "treino" && <>
      {pv.nome && <p class="tiny sub">{pv.nome}</p>}
      <div class="diff ch-prop-diff">
        {pv.antes.length ? pv.antes.map((l, i) => <div key={`a${i}`} class="minus">− {l}</div>) : <div class="minus">− sem treino salvo neste dia</div>}
        {pv.depois.map((l, i) => <div key={`d${i}`} class="plus">+ {l}</div>)}
      </div>
      {!!pv.avisos.length && <p class="tiny sub">{pv.avisos.join(" · ")}</p>}
    </>}
    {pv?.tipo === "comida" && <>
      <div class="diff ch-prop-diff">{pv.refeicoes.map((r, i) => <div key={i} class="plus">+ {REFEICAO[r.refeicao] ?? r.refeicao}: {r.resumo} · {r.kcal} kcal · {r.proteina} g prot.</div>)}</div>
      {!!pv.duvidas.length && <p class="tiny sub">{pv.duvidas.join(" · ")}</p>}
      {pv.escolha && <p class="tiny sub">Já existe registro nessa refeição: ao aprovar, soma ao que está lá.</p>}
    </>}

    {pendente && modo === "corrigir" && <div class="ch-prop-form">
      {pv?.tipo === "treino" ? <ul class="ch-prop-sets">{pv.depois.map((l, k) => <li key={k} class="row between">
        <label class="small" for={`s-${p.id}-${k}`}>{nomeDe(l)}</label>
        <select id={`s-${p.id}-${k}`} class="input ch-prop-num" value={sets[k]} onChange={(ev) => { const v = [...sets]; v[k] = Number((ev.target as HTMLSelectElement).value); setSets(v); }}>
          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n} séries</option>)}
        </select></li>)}</ul>
        : <><label class="f" for={`t-${p.id}`}>O que você comeu</label>
          <textarea id={`t-${p.id}`} class="input" maxLength={2000} value={texto} onInput={(ev) => setTexto((ev.target as HTMLTextAreaElement).value)} /></>}
      <div class="row wrapx ch-acoes">
        <button type="button" class="btn sm pri" disabled={ocupado || (pv?.tipo === "comida" && texto.trim().length < 2)} onClick={() => aprovar(corrigido())}><Icon id="check" />Aprovar corrigido</button>
        <button type="button" class="btn sm ghost" onClick={() => setModo("ver")}>Voltar</button>
      </div>
    </div>}

    {pendente && modo === "alterar" && <div class="ch-prop-form">
      <label class="f" for={`a-${p.id}`}>O que a IA deve mudar</label>
      <textarea id={`a-${p.id}`} class="input" maxLength={1000} value={pedido} placeholder="ex.: troca o tríceps por outro sem polia" onInput={(ev) => setPedido((ev.target as HTMLTextAreaElement).value)} />
      <div class="row wrapx ch-acoes">
        <button type="button" class="btn sm pri" disabled={ocupado || !pedido.trim()} onClick={alterar}><Icon id="send" />Pedir alteração</button>
        <button type="button" class="btn sm ghost" onClick={() => setModo("ver")}>Voltar</button>
      </div>
    </div>}

    {pendente && modo === "ver" && <div class="row wrapx ch-acoes">
      <button type="button" class="btn sm pri" disabled={ocupado} onClick={() => aprovar()}><Icon id="check" />Aprovar</button>
      <button type="button" class="btn sm" disabled={ocupado} onClick={() => setModo("corrigir")}><Icon id="edit" />Corrigir</button>
      <button type="button" class="btn sm" disabled={ocupado || !provedor} onClick={() => setModo("alterar")}><Icon id="chat" />Pedir alteração</button>
      <button type="button" class="btn sm ghost" disabled={ocupado} onClick={descartar} aria-label="Descartar a proposta"><Icon id="x" />Descartar</button>
    </div>}
    {pendente && <p class="tiny sub">Nada é gravado antes de você aprovar.</p>}
  </section>;
}
