// #134 Chat (estilo dos apps de IA): por qual caminho a mensagem vai (rascunho, pedido da rotina ou chave), o mini prompt
// para a IA externa (nada longo ou sensível na URL), a faixa dos pedidos da rotina, o "Fale com a IA" e as regras do
// histórico de conversas. Fica fora do índice (subcaminho "@ciclo/core/chat"): só a tela Chat baixa. Tudo genérico: a IA de cada caminho vem do perfil (#133), nunca fixa no código.
import { NOME_PROVEDOR } from "./chaves.ts";
import type { ProvedorIa } from "./chaves.ts";
import { PROVEDORES_IA_APP, caminhos, linkAbrirIa } from "./ia.ts";
import type { ChaveResumo, EstadoIa, IaId, PerfilIa } from "./ia.ts";

export const CHAT = {
  /** texto de uma mensagem (o mesmo limite do pedido da caixa é 2000; a conversa aceita mais) */ textoMax: 4000,
  tituloMax: 60,
  /** conversas guardadas por conta; a mais antiga sai quando passa disso */ conversasMax: 100,
  mensagensMax: 400,
  anexoMaxBytes: 10 * 1024 * 1024,
  /** texto do usuário que ainda pode ir junto na URL do mini prompt */ urlTextoMax: 120,
  /** "pensando…" do estado sem IA */ pensandoMs: 1000,
} as const;

export type ModoChat = EstadoIa["estado"];
export interface IaDoCaminho { id: IaId | "alternativa" | null; nome: string }
export interface CaminhoChat {
  modo: ModoChat;
  /** a IA da rotina (conector). id null = conectado, mas a pessoa não marcou qual IA (nome genérico, sem link) */ conector: IaDoCaminho | null;
  /** a IA da chave e o provedor da chave usada nesta conversa */ chave: (IaDoCaminho & { provedor: ProvedorIa }) | null;
  /** as chaves ativas (o seletor do topo troca entre elas só nesta conversa) */ chaves: ProvedorIa[];
}

const NOME_GENERICO = "sua IA";

/** Nome na tela da IA de uma chave: a IA do perfil que usa esse provedor (ex.: Gemini), senão o nome do provedor. */
function nomeDaChave(ia: PerfilIa | null | undefined, provedor: ProvedorIa): string {
  return caminhos(ia).find((p) => p.caminho === "chave" && p.provedorChave === provedor)?.nomeIa ?? NOME_PROVEDOR[provedor];
}

/**
 * O caminho de cada envio. A rotina (conector) e a chave são independentes e podem ser IAs diferentes.
 * `escolhida`: o provedor que a pessoa escolheu no topo para esta conversa (precisa estar ativo).
 */
export function caminhoChat(ia: PerfilIa | null | undefined, estado: Pick<EstadoIa, "estado">, chaves: readonly ChaveResumo[], escolhida?: ProvedorIa | null): CaminhoChat {
  const cs = caminhos(ia);
  const ativas = [...new Set(chaves.filter((k) => k.ativo).map((k) => k.provedor))];
  let conector: IaDoCaminho | null = null;
  if (estado.estado === "conector" || estado.estado === "ambos") {
    const p = cs.find((x) => x.caminho === "conector");
    conector = p ? { id: p.ia, nome: p.nomeIa } : { id: null, nome: NOME_GENERICO };
  }
  let chave: CaminhoChat["chave"] = null;
  if ((estado.estado === "chave" || estado.estado === "ambos") && ativas.length) {
    const doPerfil = cs.filter((p) => p.caminho === "chave").map((p) => p.provedorChave).find((pv) => pv && ativas.includes(pv));
    const provedor = escolhida && ativas.includes(escolhida) ? escolhida : doPerfil ?? ativas[0];
    const p = cs.find((x) => x.caminho === "chave" && x.provedorChave === provedor);
    chave = { id: p?.ia ?? null, nome: nomeDaChave(ia, provedor), provedor };
  }
  return { modo: estado.estado, conector, chave, chaves: ativas };
}

export type DestinoEnvio = "rascunho" | "pedido" | "chave";
/** Para onde vai a mensagem: sem IA fica como rascunho; só conector vira pedido; chave responde na hora (ambos: chave, ou pedido pelo toggle). */
export function destinoEnvio(modo: ModoChat, paraRotina = false): DestinoEnvio {
  if (modo === "nenhum") return "rascunho";
  if (modo === "conector") return "pedido";
  if (modo === "ambos" && paraRotina) return "pedido";
  return "chave";
}

/** A mensagem fixa do estado "nenhum": leva a Perfil → Sua IA já na IA escolhida (ou "Escolha sua IA"). */
export function mensagemSemIa(ia: PerfilIa | null | undefined): { texto: string; botao: string; href: string } {
  const texto = "Você ainda não conectou nenhuma IA, então não consigo responder aqui. Para gerar seus treinos com IA, siga o passo a passo →";
  const p = caminhos(ia)[0];
  if (!ia || !p) return { texto, botao: "Escolha sua IA", href: "#perfil/ia" };
  return { texto, botao: `Configurar o ${p.nomeIa}`, href: "#perfil/ia" };
}

/** Rótulo do topo: "<IA> · modelo". Sem chave, só "Chat". */
export const rotuloTopo = (c: CaminhoChat) => (c.chave ? `${c.chave.nome} · modelo padrão` : null);

// ---------- mini prompt ----------
export const MINI_PROMPT = "Use o conector do Ciclo: processa minha caixa de pedidos.";
// saúde, documento, contato e números longos: nada disso vai para a URL (fica no histórico do navegador e nos logs da IA)
const SENSIVEL = /\b(dor(es)?|exame|laudo|rem[eé]dio|medica(mento|ção)|les[aã]o|cirurgia|press[aã]o|glicose|diabet\w*|colesterol|ansiedade|depress\w*|horm[oô]nio|testosterona|gr[aá]vida|gesta\w*|diagn[oó]stico|sangue|cpf|rg|senha|endere[cç]o|telefone|celular)\b|@|\d{5,}|\d{3}[.\s-]\d{3}/i;
/** Texto que não pode ir para a URL de uma IA externa. */
export const textoSensivel = (t: string) => SENSIVEL.test(t);

export interface MiniPrompt { prompt: string; url: string | null; copiar: boolean; nome: string }
/**
 * "Abrir no <IA>": o prompt é curto e fixo. O texto do pedido vai como dado (pela caixa) e só entra na URL quando é curto
 * e sem nada sensível; senão, e quando a IA não aceita texto na URL, fica só o bloco com Copiar.
 */
export function miniPrompt(ia: IaDoCaminho | null, texto = ""): MiniPrompt {
  const t = texto.replace(/\s+/g, " ").trim();
  const nome = ia?.nome ?? NOME_GENERICO;
  const seguro = !t || (t.length <= CHAT.urlTextoMax && !textoSensivel(t));
  const prompt = t && seguro ? `${MINI_PROMPT} Pedido: "${t}"` : MINI_PROMPT;
  const aceita = !!ia?.id && !!PROVEDORES_IA_APP[ia.id === "alternativa" ? "claude" : ia.id].abrir?.promptNaUrl;
  const url = aceita && seguro && ia?.id ? linkAbrirIa(ia.id, prompt) : null;
  return { prompt, url, copiar: !url, nome };
}

// ---------- faixa dos pedidos da rotina ----------
export type StatusPedido = "aguardando" | "respondido" | "erro";
export interface PedidoRotina { id: string; text: string; status?: string; created_at?: number; response?: string | null; change?: unknown }
/** O status na faixa. aplicado/descartado saem da faixa (null). */
export function statusPedido(p: Pick<PedidoRotina, "status" | "response">): StatusPedido | null {
  const s = p.status ?? "pendente";
  if (s === "aplicado" || s === "descartado") return null;
  if (s === "pendente") return p.response ? "respondido" : "aguardando";
  if (s === "respondido") return "respondido";
  return "erro";
}
/** Pedidos que aparecem na faixa (os mais novos primeiro). Sem nenhum, a faixa não aparece. */
export const pedidosDaFaixa = <T extends PedidoRotina>(inbox: readonly T[]): T[] =>
  inbox.filter((p) => statusPedido(p) !== null).sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0));
export const resumoFaixa = (n: number) => (n === 1 ? "1 pedido na rotina" : `${n} pedidos na rotina`);
/** "Aplicar" só quando a resposta traz proposta. */
export const podeAplicar = (p: PedidoRotina) => statusPedido(p) === "respondido" && p.change != null;

// ---------- composer ----------
export const SUGESTOES_CHAT = ["O que treino hoje?", "Registrar o almoço", "Como foi minha semana?"] as const;
/** Enter envia; Shift+Enter quebra a linha; durante a composição do teclado (acento, IME) não envia. */
export const enterEnvia = (e: { key: string; shiftKey?: boolean; isComposing?: boolean }) => e.key === "Enter" && !e.shiftKey && !e.isComposing;

/** Texto de uma mensagem: tira espaço sobrando e caractere de controle; vazio ou longo demais = erro. */
export function validarMensagem(v: unknown): { ok: true; texto: string } | { ok: false; erro: string } {
  if (typeof v !== "string") return { ok: false, erro: "texto deve ser texto" };
  // eslint-disable-next-line no-control-regex
  const t = v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/[ \t]+\n/g, "\n").trim();
  if (!t) return { ok: false, erro: "Escreva ou fale a mensagem" };
  if (t.length > CHAT.textoMax) return { ok: false, erro: `Mensagem longa demais (até ${CHAT.textoMax} caracteres)` };
  return { ok: true, texto: t };
}
/** Título da conversa: a 1ª mensagem, numa linha, cortada. */
export function tituloConversa(texto: string): string {
  const t = texto.replace(/\s+/g, " ").trim();
  if (!t) return "Conversa";
  return t.length <= CHAT.tituloMax ? t : `${t.slice(0, CHAT.tituloMax - 1).trimEnd()}…`;
}

export type TipoAnexo = "foto" | "pdf";
const ANEXO_MIME: Record<string, TipoAnexo> = { "image/jpeg": "foto", "image/png": "foto", "image/webp": "foto", "image/heic": "foto", "image/heif": "foto", "application/pdf": "pdf" };
export const ANEXO_ACCEPT = Object.keys(ANEXO_MIME).join(",");
/** O "+" do composer: só foto ou PDF, até 10 MB. */
export function validarAnexo(a: { tipo: string; bytes: number }): { ok: true; anexo: TipoAnexo } | { ok: false; erro: string } {
  const t = ANEXO_MIME[String(a.tipo).toLowerCase()];
  if (!t) return { ok: false, erro: "Anexe uma foto ou um PDF" };
  if (!(a.bytes > 0)) return { ok: false, erro: "Arquivo vazio" };
  if (a.bytes > CHAT.anexoMaxBytes) return { ok: false, erro: "Arquivo grande demais (até 10 MB)" };
  return { ok: true, anexo: t };
}

export { hrefFale, pedidoFale } from "./fale.ts";
export type { OrigemFale } from "./fale.ts";
