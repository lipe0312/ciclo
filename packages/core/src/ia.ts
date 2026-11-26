// #133 "Sua IA": qual IA a pessoa usa, como (assinatura, grátis, chave), e o caminho que o app recomenda.
// Dado versionado (PROVEDORES_IA_APP, GUIAS_IA, OUTRAS_IAS) + regras puras (caminhos, estadoIA, aviso). TODAS as telas
// leem daqui: nada de `if claude` espalhado. Mudar o perfil não apaga conexões nem chaves (ficam "não é a principal").
// Os guias, os links oficiais e o autocomplete ficam em ia-guias.ts (subcaminho "@ciclo/core/ia-guias", fora do JS inicial).
import type { ProvedorIa } from "./chaves.ts";
import type { TokenInfo } from "./conexao.ts";
import { tokenValido } from "./conexao.ts";

export type IaId = "claude" | "chatgpt" | "gemini" | "deepseek" | "outra";
export const IAS_CARD: readonly Exclude<IaId, "outra">[] = ["claude", "chatgpt", "gemini", "deepseek"];
export const IA_IDS: readonly IaId[] = [...IAS_CARD, "outra"];
export type AcessoIa = "assinatura" | "gratis" | "chave" | "nao_sei";
export const ACESSOS_IA: readonly AcessoIa[] = ["assinatura", "gratis", "chave", "nao_sei"];
export type CaminhoIa = "conector" | "chave" | "sugerir_alternativa";

export interface UsoIa { provedor: IaId; acesso: AcessoIa[]; /** só em "outra": o nome digitado (ex.: "Kimi") */ nome?: string }
/** `perfil.ia`. Ausente = ainda não respondeu. `usa: []` = sem IA (com `testarGratis` = quer testar grátis). */
export interface PerfilIa { usa: UsoIa[]; principal?: IaId | null; testarGratis?: boolean }


export interface LinkOficial { rotulo: string; url: string; /** AAAA-MM-DD em que alguém abriu a página e confirmou; null = conferir */ conferidoEm: string | null }
/** Uma célula da tabela: o que fazer para essa IA com essa forma de acesso. */
export interface CelulaIa {
  caminho: CaminhoIa;
  /** cofre: o provedor da chave (caminho "chave") */ provedorChave?: ProvedorIa;
  /** a chave é do nível gratuito do provedor (mostra o aviso de uso de dados) */ gratis?: boolean;
  /** assinatura do Claude: dá também para criar a rotina que responde os Pedidos da rotina */ rotina?: boolean;
  /** guia que a tela abre */ guia: GuiaId;
  /** "Seu caminho: …" */ resumo: string; minutos: number;
  /** "Não apareceu a opção?" → a alternativa (conector beta) */ beta?: boolean;
}
export interface InfoIa {
  nome: string;
  /** nível do guia: detalhado (passos curtos) ou genérico (3 perguntas) */ guia: "detalhado" | "generico";
  /** onde abrir a conversa com o pedido pronto; aceita o pedido na URL? (conferir) */ abrir?: { url: string; promptNaUrl: boolean };
  celulas: Record<Exclude<AcessoIa, "nao_sei">, CelulaIa>;
  /** "Não sei": a célula mais simples */ naoSei: Exclude<AcessoIa, "nao_sei">;
}

export type GuiaId = "claude_conector" | "chatgpt_conector" | "chave_anthropic" | "chave_openai" | "gemini_chave_gratis" | "chave_gemini"
  | "chave_deepseek" | "openrouter_gratis" | "chave_openrouter" | "generico" | "alternativa";
export interface Guia { titulo: string; passos: string[]; links: LinkOficial[]; /** mostra a URL do conector com Copiar */ urlConector?: boolean; /** mostra o atalho para Chaves de API */ cofre?: ProvedorIa; teste?: boolean }


/** A tabela da issue #133 (cada célula: conferir na página oficial no dia; o link fica no guia). */
export const PROVEDORES_IA_APP: Record<IaId, InfoIa> = {
  claude: {
    nome: "Claude", guia: "detalhado", abrir: { url: "https://claude.ai/new?q=", promptNaUrl: true }, naoSei: "gratis",
    celulas: {
      assinatura: { caminho: "conector", rotina: true, guia: "claude_conector", resumo: "conector no seu Claude", minutos: 1 },
      gratis: { caminho: "conector", guia: "claude_conector", resumo: "conector no Claude grátis", minutos: 1 },
      chave: { caminho: "chave", provedorChave: "anthropic", guia: "chave_anthropic", resumo: "sua chave da Anthropic no Chat do Ciclo", minutos: 2 },
    },
  },
  chatgpt: {
    // #140 o ChatGPT não aceita o pedido na URL: o app abre limpo (a página inicial), o pedido vai pelo Copiar
    nome: "ChatGPT", guia: "detalhado", abrir: { url: "https://chatgpt.com/", promptNaUrl: false }, naoSei: "gratis",
    celulas: {
      assinatura: { caminho: "conector", beta: true, guia: "chatgpt_conector", resumo: "conector no ChatGPT (modo desenvolvedor, beta)", minutos: 2 },
      gratis: { caminho: "sugerir_alternativa", guia: "alternativa", resumo: "o ChatGPT grátis não aceita conector: teste com o Claude grátis", minutos: 1 },
      chave: { caminho: "chave", provedorChave: "openai", guia: "chave_openai", resumo: "sua chave da OpenAI no Chat do Ciclo", minutos: 2 },
    },
  },
  gemini: {
    nome: "Gemini", guia: "detalhado", naoSei: "gratis",
    celulas: {
      // no app do Gemini o conector personalizado ainda não chega ao Brasil: o caminho é a chave grátis do AI Studio
      assinatura: { caminho: "chave", provedorChave: "gemini", gratis: true, guia: "gemini_chave_gratis", resumo: "chave grátis do Gemini no Chat do Ciclo", minutos: 2 },
      gratis: { caminho: "chave", provedorChave: "gemini", gratis: true, guia: "gemini_chave_gratis", resumo: "chave grátis do Gemini no Chat do Ciclo", minutos: 2 },
      chave: { caminho: "chave", provedorChave: "gemini", guia: "chave_gemini", resumo: "sua chave do Gemini no Chat do Ciclo", minutos: 2 },
    },
  },
  deepseek: {
    nome: "DeepSeek", guia: "detalhado", naoSei: "gratis",
    celulas: {
      assinatura: { caminho: "chave", provedorChave: "deepseek", guia: "chave_deepseek", resumo: "chave da DeepSeek no Chat do Ciclo", minutos: 3 },
      gratis: { caminho: "chave", provedorChave: "openrouter", gratis: true, guia: "openrouter_gratis", resumo: "chave do OpenRouter com modelo grátis no Chat do Ciclo", minutos: 3 },
      chave: { caminho: "chave", provedorChave: "deepseek", guia: "chave_deepseek", resumo: "sua chave da DeepSeek no Chat do Ciclo", minutos: 2 },
    },
  },
  outra: {
    nome: "Outra IA", guia: "generico", naoSei: "gratis",
    celulas: {
      assinatura: { caminho: "sugerir_alternativa", guia: "generico", resumo: "veja se a sua IA aceita conector; se não, teste com o Claude grátis", minutos: 2 },
      gratis: { caminho: "sugerir_alternativa", guia: "generico", resumo: "veja se a sua IA aceita conector; se não, teste com o Claude grátis", minutos: 2 },
      chave: { caminho: "chave", provedorChave: "openrouter", guia: "chave_openrouter", resumo: "chave do OpenRouter (muitos modelos) no Chat do Ciclo", minutos: 3 },
    },
  },
};


/** A alternativa grátis recomendada: o Claude grátis (conector). Quem prefere o Chat do Ciclo: a chave grátis do Gemini. */
export const ALTERNATIVA_GRATIS: CelulaIa = { caminho: "conector", guia: "alternativa", resumo: "Claude grátis só para testar (conector)", minutos: 2 };
export const ALTERNATIVA_GEMINI: CelulaIa = PROVEDORES_IA_APP.gemini.celulas.gratis;

// ---------- validação (perfil.ia) ----------
const NOME_LIVRE = /^[\p{L}\p{N} ._()+-]{1,40}$/u;
/** Confere `perfil.ia` (vem do app ou do Chat). Erro → mensagens técnicas; o nome livre é dado, nunca instrução. */
export function validarPerfilIa(v: unknown): { ok: true; valor: PerfilIa } | { ok: false; erros: string[] } {
  const e: string[] = [];
  if (!v || typeof v !== "object" || Array.isArray(v)) return { ok: false, erros: ["ia deve ser um objeto"] };
  const o = v as Record<string, unknown>;
  for (const k of Object.keys(o)) if (!["usa", "principal", "testarGratis"].includes(k)) e.push(`ia.${k.slice(0, 30)}: campo desconhecido`);
  if (!Array.isArray(o.usa) || o.usa.length > 5) return { ok: false, erros: [...e, "ia.usa: lista de até 5"] };
  const usa: UsoIa[] = [];
  for (const [i, x] of o.usa.entries()) {
    const u = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
    if (!(IA_IDS as readonly string[]).includes(u.provedor as string)) { e.push(`ia.usa.${i}.provedor inválido`); continue; }
    if (usa.some((y) => y.provedor === u.provedor)) { e.push(`ia.usa.${i}: IA repetida`); continue; }
    const ac = Array.isArray(u.acesso) ? u.acesso : [];
    if (ac.length > 4 || ac.some((a) => !(ACESSOS_IA as readonly string[]).includes(a as string)) || new Set(ac).size !== ac.length) { e.push(`ia.usa.${i}.acesso inválido`); continue; }
    for (const k of Object.keys(u)) if (!["provedor", "acesso", "nome"].includes(k)) e.push(`ia.usa.${i}.${k.slice(0, 30)}: campo desconhecido`);
    const item: UsoIa = { provedor: u.provedor as IaId, acesso: ACESSOS_IA.filter((a) => ac.includes(a)) };
    if (u.provedor === "outra" && u.nome != null) {
      const nome = typeof u.nome === "string" ? u.nome.replace(/\s+/g, " ").trim() : "";
      if (!NOME_LIVRE.test(nome)) { e.push(`ia.usa.${i}.nome: até 40 letras e números`); continue; }
      item.nome = nome;
    } else if (u.nome != null) e.push(`ia.usa.${i}.nome só em "outra"`);
    usa.push(item);
  }
  let principal: IaId | null = null;
  if (o.principal != null) {
    if (!usa.some((u) => u.provedor === o.principal)) e.push("ia.principal: precisa ser uma das IAs marcadas");
    else principal = o.principal as IaId;
  }
  if (o.testarGratis != null && typeof o.testarGratis !== "boolean") e.push("ia.testarGratis deve ser true|false");
  if (o.testarGratis === true && usa.length) e.push("ia.testarGratis só com \"Não uso IA\"");
  if (e.length) return { ok: false, erros: e.slice(0, 8) };
  const valor: PerfilIa = { usa, principal: principal ?? (usa.length === 1 ? usa[0].provedor : null) };
  if (!usa.length) valor.testarGratis = o.testarGratis === true;
  return { ok: true, valor };
}

/** A principal: a escolhida, ou a 1ª marcada. */
export const principalIa = (ia: PerfilIa | null | undefined): IaId | null =>
  !ia?.usa.length ? null : ia.principal && ia.usa.some((u) => u.provedor === ia.principal) ? ia.principal : ia.usa[0].provedor;

/** Nome na tela de uma IA da pessoa (em "outra", o que ela digitou). */
export const nomeIa = (u: Pick<UsoIa, "provedor" | "nome">) => (u.provedor === "outra" ? u.nome || PROVEDORES_IA_APP.outra.nome : PROVEDORES_IA_APP[u.provedor].nome);

// ---------- caminhos ----------
export interface PassoIa extends CelulaIa { ia: IaId | "alternativa"; nomeIa: string; acesso: AcessoIa | null; principal: boolean }

/**
 * O que fazer, em ordem: a principal primeiro; dentro de cada IA, um item por caminho (assinatura + grátis do Claude
 * viram um só conector, com a rotina se for assinatura). Sem IA: [] (algoritmo) ou a alternativa grátis (testar grátis).
 * ChatGPT/"outra" sem caminho próprio ganham a alternativa grátis recomendada (uma só, com contexto).
 */
export function caminhos(ia: PerfilIa | null | undefined): PassoIa[] {
  if (!ia) return [];
  if (!ia.usa.length) return ia.testarGratis ? [{ ...ALTERNATIVA_GRATIS, ia: "alternativa", nomeIa: "Claude", acesso: null, principal: true }] : [];
  const pr = principalIa(ia);
  const ordem = [...ia.usa].sort((a, b) => Number(b.provedor === pr) - Number(a.provedor === pr));
  const out: PassoIa[] = [];
  for (const u of ordem) {
    const info = PROVEDORES_IA_APP[u.provedor];
    const acessos = (u.acesso.length ? u.acesso : ["nao_sei"] as AcessoIa[]).map((a) => (a === "nao_sei" ? info.naoSei : a));
    const daIa: PassoIa[] = [];
    for (const a of [...new Set(acessos)]) {
      const c = info.celulas[a];
      const igual = daIa.find((p) => p.caminho === c.caminho && p.provedorChave === c.provedorChave && p.guia === c.guia);
      if (igual) { if (c.rotina) Object.assign(igual, { rotina: true, resumo: c.resumo, acesso: a }); continue; }
      daIa.push({ ...c, ia: u.provedor, nomeIa: nomeIa(u), acesso: a, principal: u.provedor === pr });
    }
    out.push(...daIa);
  }
  // quem só tem "sugerir alternativa" e nenhum outro caminho real: entra a alternativa grátis (uma, recomendada)
  if (out.every((p) => p.caminho === "sugerir_alternativa")) out.push({ ...ALTERNATIVA_GRATIS, ia: "alternativa", nomeIa: "Claude", acesso: null, principal: false });
  return out;
}

/** "Seu caminho: chave grátis do Gemini no Chat do Ciclo · 2 min" (o 1º passo). Sem IA: o algoritmo. */
export function resumoCaminho(ia: PerfilIa | null | undefined): string {
  const c = caminhos(ia)[0];
  if (!ia) return "Escolha sua IA: dá para trocar a qualquer hora em Perfil → Sua IA.";
  if (!c) return "Seu caminho: sem IA, o algoritmo do app gera tudo.";
  return `Seu caminho: ${c.resumo} · ${c.minutos} min`;
}

// ---------- estado ----------
export type EstadoConector = "nenhum" | "pendente" | "ativo" | "expirado";
/** Conexões MCP (chave manual ou OAuth): usada e válida = ativo; válida sem uso = pendente; só vencidas = expirado. */
export function estadoConector(tokens: readonly TokenInfo[], now: number): EstadoConector {
  const vivos = tokens.filter((t) => t.revokedAt == null);
  const validos = vivos.filter((t) => tokenValido(t, now));
  if (validos.some((t) => t.lastUsedAt != null)) return "ativo";
  if (validos.length) return "pendente";
  return vivos.length ? "expirado" : "nenhum";
}

export interface ChaveResumo { provedor: ProvedorIa; ativo: boolean }
export interface AvisoIa { id: string; texto: string; href: string; /** muda quando o perfil de IA muda: a dispensa de 7 dias cai na hora */ chave: string }
export interface EstadoIa {
  estado: "nenhum" | "conector" | "chave" | "ambos";
  conector: EstadoConector;
  /** o que falta, na ordem de caminhos() */ pendencias: PassoIa[];
  /** a conexão MCP existe mas a principal usa chave (ou o contrário): mostra "não é a principal" com Revogar */
  conectorNaoPrincipal: boolean;
  chavesNaoPrincipais: ProvedorIa[];
  aviso: AvisoIa | null;
}

export const AVISO_DISPENSA_MS = 7 * 86_400_000;
/** Impressão curta do perfil de IA (sem hash criptográfico: só para a dispensa voltar quando o perfil muda). */
export function assinaturaIa(ia: PerfilIa | null | undefined): string {
  if (!ia) return "vazio";
  const s = JSON.stringify([ia.usa.map((u) => [u.provedor, [...u.acesso].sort(), u.nome ?? ""]), principalIa(ia), !!ia.testarGratis]);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

const satisfeito = (p: PassoIa, conector: EstadoConector, chaves: readonly ChaveResumo[]) =>
  p.caminho === "conector" ? conector === "ativo"
    : p.caminho === "chave" ? chaves.some((k) => k.ativo && k.provedor === p.provedorChave)
      : false;

function textoPendencia(p: PassoIa): string {
  if (p.ia === "alternativa" || p.guia === "alternativa") return `Teste grátis: conecte o Ciclo ao Claude (${p.minutos} min)`;
  if (p.caminho === "conector") return `Conecte o Ciclo ao seu ${p.nomeIa} (${p.minutos} min)`;
  if (p.caminho === "chave") return p.gratis ? `Pegue sua chave grátis ${p.provedorChave === "openrouter" ? "do OpenRouter" : `do ${p.nomeIa}`} (${p.minutos} min)` : `Cadastre sua chave de API (${p.minutos} min)`;
  return `Veja como usar o Ciclo com ${p.nomeIa} (${p.minutos} min)`;
}

/**
 * Estado da IA da pessoa: o que está ligado (conector, chave, ambos), o que falta e O aviso (no máximo um) que as telas
 * com "Fale com a IA" mostram. Sem perfil → "Escolha sua IA". Sem IA (sem testar) → nenhum aviso: o algoritmo segue.
 */
export function estadoIA(ia: PerfilIa | null | undefined, conector: EstadoConector, chaves: readonly ChaveResumo[]): EstadoIa {
  const temChave = chaves.some((k) => k.ativo);
  const temConector = conector === "ativo";
  const estado = temConector && temChave ? "ambos" : temConector ? "conector" : temChave ? "chave" : "nenhum";
  const cs = caminhos(ia);
  const pendencias = cs.filter((p) => p.caminho !== "sugerir_alternativa" && !satisfeito(p, conector, chaves));
  const doPrincipal = cs.filter((p) => p.principal);
  const conectorNaoPrincipal = conector !== "nenhum" && !doPrincipal.some((p) => p.caminho === "conector");
  const provPrincipal = new Set(doPrincipal.map((p) => p.provedorChave).filter(Boolean));
  const chavesNaoPrincipais = [...new Set(chaves.filter((k) => !provPrincipal.has(k.provedor)).map((k) => k.provedor))];
  const chave = assinaturaIa(ia);
  let aviso: AvisoIa | null = null;
  const usaConector = cs.some((p) => p.caminho === "conector");
  if (!ia) aviso = { id: "escolher", texto: "Escolha sua IA", href: "#perfil/ia", chave };
  else if (conector === "expirado" && usaConector) aviso = { id: "expirou", texto: "Sua conexão expirou: reconectar", href: "#perfil/ia", chave };
  else {
    // o 1º item ainda não resolvido; "sugerir alternativa" conta como resolvido quando a alternativa (conector) já está ativa
    const p = cs.find((x) => (x.caminho === "sugerir_alternativa" ? conector !== "ativo" : !satisfeito(x, conector, chaves)));
    if (p) aviso = { id: `falta:${p.guia}`, texto: textoPendencia(p), href: "#perfil/ia", chave };
  }
  return { estado, conector, pendencias, conectorNaoPrincipal, chavesNaoPrincipais, aviso };
}

/** Mostra o aviso? Não se a pessoa dispensou ESTE aviso, com ESTE perfil, há menos de 7 dias. */
export function mostrarAvisoIa(aviso: AvisoIa | null, dispensa: { id: string; chave: string; em: number } | null | undefined, now: number): boolean {
  if (!aviso) return false;
  if (!dispensa) return true;
  return !(dispensa.id === aviso.id && dispensa.chave === aviso.chave && now - dispensa.em < AVISO_DISPENSA_MS);
}

/** "Abrir no Claude" com o pedido pronto: só para a IA que aceita o pedido na URL; senão, null (a tela copia o pedido). */
export function linkAbrirIa(ia: IaId | "alternativa", pedido: string): string | null {
  const a = PROVEDORES_IA_APP[ia === "alternativa" ? "claude" : ia].abrir;
  return a?.promptNaUrl ? a.url + encodeURIComponent(pedido.slice(0, 1500)) : null;
}
/** #140 "Abrir no app": a IA que NÃO aceita o pedido na URL abre limpa (página inicial dela): nada do usuário vai na URL. */
export function linkAbrirApp(ia: IaId | "alternativa"): string | null {
  const a = PROVEDORES_IA_APP[ia === "alternativa" ? "claude" : ia].abrir;
  return a && !a.promptNaUrl ? a.url : null;
}
