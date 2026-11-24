// #134 Estado do Chat: a conversa aberta (balões), o envio por caminho (rascunho, pedido da rotina, chave) e o histórico
// no servidor (lista, abrir, nova, apagar). No demo, tudo em memória; o estado de IA pode ser simulado por ?demo&ia=...
import { useEffect, useState } from "preact/hooks";
import * as C from "@ciclo/core";
import * as CH from "@ciclo/core/chat";
import { SERVER, api } from "../../lib/api/index.ts";
import { S, commit } from "../../lib/store/index.ts";
import { toast } from "../../lib/ui/index.tsx";
import { uid } from "../../lib/util.ts";
import { sendInbox } from "./caixa.tsx";
import type { PropostaChat } from "./proposta.tsx";

export type Papel = "usuario" | "aviso" | "ia" | "sem_ia" | "pedido" | "chave";
export interface MsgChat { id: string; papel: Papel; texto: string; pedidoId?: string | null; criadaEm: number; anexo?: string | null; /** #89 propostas da IA nesta resposta */ propostas?: PropostaChat[] }
export interface ConversaResumo { id: string; titulo: string; criadaEm: number; atualizadaEm: number }
export interface Anexo { nome: string; tipo: CH.TipoAnexo }

export const chat = {
  conversaId: null as string | null,
  msgs: [] as MsgChat[],
  pensando: false,
  /** só nesta conversa: a chave escolhida no topo e o toggle "Mandar para a rotina" */
  chaveEscolhida: null as C.ProvedorIa | null,
  paraRotina: false,
  anexo: null as Anexo | null,
  conversas: null as ConversaResumo[] | null,
};
const demo = new Map<string, { resumo: ConversaResumo; msgs: MsgChat[] }>();
const subs = new Set<() => void>();
export const mudou = () => { subs.forEach((f) => f()); };
export function useChat() {
  const [, set] = useState(0);
  useEffect(() => { const f = () => set((n) => n + 1); subs.add(f); return () => { subs.delete(f); }; }, []);
  return chat;
}

const msg = (papel: Papel, texto: string, extra: Partial<MsgChat> = {}): MsgChat => ({ id: uid(), papel, texto, criadaEm: Date.now(), ...extra });

/** Guarda a mensagem da pessoa no histórico da conta (servidor) ou na memória do demo. Falha não perde o que está na tela. */
async function guardar(texto: string, pedidoId: string | null) {
  if (!SERVER) {
    const id = chat.conversaId ?? uid();
    const d = demo.get(id) ?? { resumo: { id, titulo: CH.tituloConversa(texto), criadaEm: Date.now(), atualizadaEm: Date.now() }, msgs: [] };
    d.resumo.atualizadaEm = Date.now(); d.msgs = chat.msgs.filter((m) => m.papel === "usuario"); demo.set(id, d);
    chat.conversaId = id; chat.conversas = null; return;
  }
  try {
    const r = await api<{ conversa: ConversaResumo }>("POST", "/api/conversas/mensagens", { conversaId: chat.conversaId ?? "nova", texto, ...(pedidoId ? { pedidoId } : {}) });
    chat.conversaId = r.conversa.id; chat.conversas = null;
  } catch { toast("Sem conexão: esta mensagem não entrou no histórico"); }
}

export interface Envio { modo: CH.ModoChat; caminho: CH.CaminhoChat; ia: C.PerfilIa | null | undefined }
/** Envia o que está no composer pelo caminho do estado de IA. Sem IA: "pensando…" e a mensagem fixa; o texto fica no composer. */
export async function enviar(e: Envio): Promise<void> {
  const v = CH.validarMensagem(S.ui.inboxDraft ?? "");
  if (!v.ok) { toast(v.erro); return; }
  const anexo = chat.anexo;
  const destino = CH.destinoEnvio(e.modo, chat.paraRotina);
  chat.msgs.push(msg("usuario", v.texto, { anexo: anexo ? anexo.nome : null }));
  if (destino === "rascunho") {
    chat.pensando = true; mudou();
    await new Promise((r) => setTimeout(r, CH.CHAT.pensandoMs));
    chat.pensando = false; chat.msgs.push(msg("sem_ia", CH.mensagemSemIa(e.ia).texto)); mudou();
    return; // nada vai a servidor de IA; o rascunho continua no composer
  }
  chat.anexo = null;
  if (destino === "pedido") {
    const m = await sendInbox(anexo ? `${v.texto}\n(anexo no aparelho: ${anexo.tipo})` : v.texto);
    S.ui.inboxDraft = ""; commit();
    chat.msgs.push(msg("pedido", v.texto, { pedidoId: m?.id ?? null })); mudou();
    await guardar(v.texto, SERVER ? m?.id ?? null : null);
  } else {
    S.ui.inboxDraft = ""; commit(); mudou();
    await guardar(v.texto, null);
    // #89 anexo: o Chat com a chave ainda não manda arquivo ao modelo (mensagem fixa); o texto segue
    if (anexo) chat.msgs.push(msg("aviso", "Este modelo não lê arquivos aqui. Descreva em texto o que está na foto ou no PDF."));
    await responder(e.caminho.chave?.provedor ?? null);
  }
  mudou();
}

/** #89 Resposta com a chave: o servidor lê a última mensagem guardada e responde (texto + propostas; nada grava antes do Aprovar). */
async function responder(provedor: C.ProvedorIa | null): Promise<void> {
  chat.pensando = true; mudou();
  try {
    if (!SERVER) { chat.msgs.push(msg("ia", DEMO.texto, { propostas: [{ ...DEMO.proposta, id: uid(), criadoEm: Date.now() }] })); return; }
    if (!chat.conversaId || !provedor) { chat.msgs.push(msg("aviso", "Não deu para guardar a mensagem: tente de novo.")); return; }
    const r = await api<{ mensagem: { papel: Papel; texto: string }; propostas: PropostaChat[] }>("POST", "/api/chat/responder", { conversaId: chat.conversaId, provedor });
    novaResposta(r);
  } catch { chat.msgs.push(msg("aviso", "A IA não respondeu agora. Tente de novo em instantes.")); }
  finally { chat.pensando = false; mudou(); }
}
/** Uma resposta da IA (do Chat ou de "Pedir alteração") entra na conversa com as propostas dela. */
export function novaResposta(r: { mensagem: { papel: string; texto: string }; propostas: PropostaChat[] }) {
  chat.msgs.push(msg(r.mensagem.papel === "ia" ? "ia" : "aviso", r.mensagem.texto, { propostas: r.propostas?.length ? r.propostas : undefined })); mudou();
}
/** A proposta mudou de status (aprovada, descartada, alterada). */
export function propostaMudou(p: PropostaChat) {
  for (const m of chat.msgs) if (m.propostas) m.propostas = m.propostas.map((x) => (x.id === p.id ? p : x));
  mudou();
}

// demonstração (sem servidor): uma proposta ilustrativa, com dados fictícios
const DEMO: { texto: string; proposta: Omit<PropostaChat, "id" | "criadoEm"> } = {
  texto: "Montei o treino de hoje com foco em ombro lateral, mantendo bíceps e tríceps. Confira antes de aprovar.",
  proposta: {
    ferramenta: "ciclo_salvar_treino_do_dia", status: "pendente",
    args: { motivo: "foco em ombro lateral (demonstração)", itens: [{ id: "a", sets: 4 }, { id: "b", sets: 3 }, { id: "c", sets: 3 }] },
    previa: { tipo: "treino", data: new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10), nome: "Ombro e braços", antes: ["Supino reto 3×8–10", "Remada baixa 3×10–12"], depois: ["Elevação lateral 4×12–15", "Rosca alternada 3×10–12", "Tríceps na polia 3×10–12"], avisos: [] },
  },
};

export function novaConversa() {
  Object.assign(chat, { conversaId: null, msgs: [], pensando: false, chaveEscolhida: null, paraRotina: false, anexo: null });
  mudou();
}

export async function carregarConversas(): Promise<void> {
  if (!SERVER) { chat.conversas = [...demo.values()].map((d) => d.resumo).sort((a, b) => b.atualizadaEm - a.atualizadaEm); mudou(); return; }
  try { chat.conversas = (await api<{ conversas: ConversaResumo[] }>("GET", "/api/conversas")).conversas; } catch { toast("Sem conexão: não deu para carregar as conversas"); chat.conversas ??= []; }
  mudou();
}

export async function abrirConversa(id: string): Promise<void> {
  if (!SERVER) {
    const d = demo.get(id); if (!d) return;
    novaConversa(); chat.conversaId = id; chat.msgs = d.msgs.slice(); mudou(); return;
  }
  try {
    const [r, ps] = await Promise.all([
      api<{ mensagens: { id: string; papel: Papel; texto: string; pedidoId: string | null; criadaEm: number }[] }>("GET", `/api/conversas/${encodeURIComponent(id)}`),
      api<{ propostas: PropostaChat[] }>("GET", `/api/chat/propostas?conversaId=${encodeURIComponent(id)}`).catch(() => ({ propostas: [] as PropostaChat[] })),
    ]);
    novaConversa(); chat.conversaId = id;
    chat.msgs = r.mensagens.flatMap((m) => (m.pedidoId ? [{ ...m, papel: "usuario" as Papel }, { ...m, id: `${m.id}-p`, papel: "pedido" as Papel }] : [m]));
    // #89 cada proposta volta junto da resposta da IA que veio logo depois dela
    for (const p of [...ps.propostas].sort((a, b) => a.criadoEm - b.criadoEm)) {
      const m = chat.msgs.find((x) => (x.papel === "ia" || x.papel === "aviso") && x.criadaEm >= p.criadoEm);
      if (m) (m.propostas ??= []).push(p);
    }
    mudou();
  } catch { toast("Não deu para abrir a conversa"); }
}

/** Apagar apaga mesmo (no servidor, a conversa e as mensagens). */
export async function apagarConversa(id: string): Promise<void> {
  if (SERVER) { try { await api("DELETE", `/api/conversas/${encodeURIComponent(id)}`); } catch { toast("Não deu para apagar agora"); return; } }
  else demo.delete(id);
  if (chat.conversaId === id) novaConversa();
  chat.conversas = (chat.conversas ?? []).filter((c) => c.id !== id); mudou(); toast("Conversa apagada");
}

// ---------- estado de IA simulado no demo (?demo&ia=nenhum|conector|chave|ambos&rotina=<IA>&chave=<IA>) ----------
const PROV_DA_IA: Partial<Record<C.IaId, C.ProvedorIa>> = { claude: "anthropic", chatgpt: "openai", gemini: "gemini", deepseek: "deepseek", outra: "openrouter" };
const ehIa = (v: string | null): v is C.IaId => !!v && (C.IA_IDS as readonly string[]).includes(v);
export function iaDoDemo(search = location.search): { ia: C.PerfilIa; conector: C.EstadoConector; chaves: C.ChaveResumo[] } | null {
  if (SERVER) return null;
  const q = new URLSearchParams(search), estado = q.get("ia");
  if (!estado || !["nenhum", "conector", "chave", "ambos"].includes(estado)) return null;
  const rotina = ehIa(q.get("rotina")) ? q.get("rotina") as C.IaId : "claude";
  const daChave = ehIa(q.get("chave")) ? q.get("chave") as C.IaId : "gemini";
  const usa: C.UsoIa[] = [];
  if (estado === "nenhum") usa.push({ provedor: rotina, acesso: ["gratis"] });
  if (estado === "conector" || estado === "ambos") usa.push({ provedor: rotina, acesso: ["assinatura"] });
  if ((estado === "chave" || estado === "ambos") && !usa.some((u) => u.provedor === daChave)) usa.push({ provedor: daChave, acesso: ["chave"] });
  const chaves: C.ChaveResumo[] = estado === "chave" || estado === "ambos" ? [{ provedor: PROV_DA_IA[daChave] ?? "openrouter", ativo: true }] : [];
  return { ia: { usa, principal: usa[0]?.provedor ?? null }, conector: estado === "conector" || estado === "ambos" ? "ativo" : "nenhum", chaves };
}
