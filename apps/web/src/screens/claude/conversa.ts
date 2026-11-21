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

export type Papel = "usuario" | "aviso" | "ia" | "sem_ia" | "pedido" | "chave";
export interface MsgChat { id: string; papel: Papel; texto: string; pedidoId?: string | null; criadaEm: number; anexo?: string | null }
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
    S.ui.inboxDraft = ""; commit();
    chat.msgs.push(msg("chave", e.caminho.chave?.nome ?? "")); mudou();
    await guardar(v.texto, null);
  }
  mudou();
}

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
    const r = await api<{ mensagens: { id: string; papel: Papel; texto: string; pedidoId: string | null; criadaEm: number }[] }>("GET", `/api/conversas/${encodeURIComponent(id)}`);
    novaConversa(); chat.conversaId = id;
    chat.msgs = r.mensagens.flatMap((m) => (m.pedidoId ? [{ ...m, papel: "usuario" as Papel }, { ...m, id: `${m.id}-p`, papel: "pedido" as Papel }] : [m]));
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
