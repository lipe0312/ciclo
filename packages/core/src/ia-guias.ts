// #133 Sua IA: os guias (passos curtos), os links oficiais, o rótulo de cada acesso e o autocomplete de "Outras".
// Subcaminho próprio ("@ciclo/core/ia-guias"): só as telas de IA baixam este texto (orçamento de JS inicial).
// Links: só a página oficial; `conferidoEm: null` = o dono ainda precisa conferir na página oficial (Manual do dono).
import type { AcessoIa, Guia, GuiaId, LinkOficial } from "./ia.ts";

/** Rótulo e linha de descrição de cada forma de acesso (tela 2 dos Primeiros passos e Perfil → Sua IA). */
export const ACESSO_INFO: Record<AcessoIa, { nm: string; desc: string }> = {
  assinatura: { nm: "Assinatura", desc: "Você paga o plano mensal (Plus, Pro…)." },
  gratis: { nm: "Gratuita", desc: "Usa a versão grátis, com limite." },
  chave: { nm: "Chave de API", desc: "Tem uma chave de desenvolvedor e paga pelo uso." },
  nao_sei: { nm: "Não sei", desc: "Escolhemos o caminho mais simples para você." },
};

const L = (rotulo: string, url: string): LinkOficial => ({ rotulo, url, conferidoEm: null });
const LINK = {
  claudeConector: L("Conectores personalizados (central de ajuda da Anthropic)", "https://support.anthropic.com/en/articles/11175166-getting-started-with-custom-connectors-using-remote-mcp"),
  claudePlanos: L("Planos do Claude", "https://www.anthropic.com/pricing"),
  anthropicChave: L("Console da Anthropic: chaves", "https://console.anthropic.com/settings/keys"),
  chatgptDev: L("Modo desenvolvedor do ChatGPT (OpenAI)", "https://platform.openai.com/docs/guides/developer-mode"),
  openaiChave: L("Plataforma da OpenAI: chaves", "https://platform.openai.com/api-keys"),
  aiStudio: L("Google AI Studio: criar chave", "https://aistudio.google.com/apikey"),
  geminiTermos: L("Termos da API do Gemini (uso de dados no nível grátis)", "https://ai.google.dev/gemini-api/terms"),
  deepseekChave: L("Plataforma da DeepSeek: chaves", "https://platform.deepseek.com/api_keys"),
  openrouterChave: L("OpenRouter: chaves", "https://openrouter.ai/keys"),
  openrouterGratis: L("OpenRouter: modelos grátis", "https://openrouter.ai/models?max_price=0"),
  mcpBusca: L("Buscar se a sua IA aceita MCP", "https://duckduckgo.com/?q=MCP+remote+connector"),
} as const;

/** "Outras": autocomplete (aceita texto livre). docs = documentação oficial, quando conhecida (conferir). */
export const OUTRAS_IAS: readonly { nome: string; docs?: LinkOficial }[] = [
  { nome: "Grok" }, { nome: "Kimi" }, { nome: "Qwen" }, { nome: "Mistral Le Chat" }, { nome: "Perplexity" }, { nome: "Copilot" },
  { nome: "Meta AI" }, { nome: "Manus" }, { nome: "IA local (Ollama)" },
];
/** Sugestões do autocomplete: começa com o texto primeiro, depois contém; sem acento e sem caixa. */
export function sugerirOutras(q: unknown, max = 6): string[] {
  const n = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const t = typeof q === "string" ? n(q) : "";
  const nomes = OUTRAS_IAS.map((o) => o.nome);
  if (!t) return nomes.slice(0, max);
  return [...nomes.filter((x) => n(x).startsWith(t)), ...nomes.filter((x) => !n(x).startsWith(t) && n(x).includes(t))].slice(0, max);
}

/** Os guias (curtos; cada passo depende só do link oficial do próprio guia). */
export const GUIAS_IA: Record<GuiaId, Guia> = {
  claude_conector: { titulo: "Conectar o Ciclo ao Claude", urlConector: true, teste: true, links: [LINK.claudeConector, LINK.claudePlanos], passos: [
    "No claude.ai ou no app do Claude: Configurações → Conectores.",
    "Adicione um conector personalizado: nome Ciclo e a URL abaixo.",
    "Abre uma tela do Ciclo: entre com o Face ID e toque em Permitir.",
    "Numa conversa nova, faça o pedido de teste.",
  ] },
  chatgpt_conector: { titulo: "Conectar o Ciclo ao ChatGPT", urlConector: true, teste: true, links: [LINK.chatgptDev], passos: [
    "No ChatGPT: Configurações → Conectores (ative o modo desenvolvedor, se pedir).",
    "Criar conector: nome Ciclo, a URL abaixo, autenticação OAuth.",
    "Entre com o Face ID na tela do Ciclo e toque em Permitir.",
  ] },
  chave_anthropic: { titulo: "Usar a sua chave da Anthropic", cofre: "anthropic", links: [LINK.anthropicChave], passos: ["Crie uma chave no console da Anthropic.", "Cole aqui em Chaves de API."] },
  chave_openai: { titulo: "Usar a sua chave da OpenAI", cofre: "openai", links: [LINK.openaiChave], passos: ["Crie uma chave na plataforma da OpenAI.", "Cole aqui em Chaves de API."] },
  gemini_chave_gratis: { titulo: "Chave grátis do Gemini", cofre: "gemini", links: [LINK.aiStudio, LINK.geminiTermos], passos: [
    "Abra o Google AI Studio com a sua conta Google e crie uma chave de API.",
    "Cole a chave aqui em Chaves de API (provedor Google Gemini).",
    "Pronto: o Chat do Ciclo responde na hora.",
  ] },
  chave_gemini: { titulo: "Usar a sua chave do Gemini", cofre: "gemini", links: [LINK.aiStudio], passos: ["Crie ou copie a chave no Google AI Studio.", "Cole aqui em Chaves de API."] },
  chave_deepseek: { titulo: "Usar uma chave da DeepSeek", cofre: "deepseek", links: [LINK.deepseekChave], passos: ["Crie uma chave na plataforma da DeepSeek (paga pelo uso).", "Cole aqui em Chaves de API."] },
  openrouter_gratis: { titulo: "Chave do OpenRouter com modelo grátis", cofre: "openrouter", links: [LINK.openrouterChave, LINK.openrouterGratis], passos: [
    "Crie uma conta e uma chave no OpenRouter.",
    "Cole aqui em Chaves de API (provedor OpenRouter).",
    "Escolha um modelo grátis na lista da chave.",
  ] },
  chave_openrouter: { titulo: "Usar uma chave do OpenRouter", cofre: "openrouter", links: [LINK.openrouterChave], passos: ["Crie uma chave no OpenRouter: uma chave, muitos modelos.", "Cole aqui em Chaves de API."] },
  generico: { titulo: "A sua IA", urlConector: true, links: [LINK.mcpBusca, LINK.openrouterChave], passos: [
    "Ela aceita conector MCP remoto (URL + login)? Cole a URL abaixo e entre com o Face ID quando ela abrir o Ciclo.",
    "Tem API? Use o OpenRouter: uma chave, muitos modelos, alguns grátis.",
    "Nenhum dos dois? Teste com o Claude grátis.",
  ] },
  alternativa: { titulo: "Testar com o Claude grátis", urlConector: true, teste: true, links: [LINK.claudeConector, LINK.claudePlanos], passos: [
    "Crie uma conta grátis no Claude (pode usar o mesmo e-mail). É só para testar: modelo menor, com limite.",
    "No Claude: Configurações → Conectores → conector personalizado com a URL abaixo.",
    "Entre com o Face ID na tela do Ciclo e toque em Permitir.",
  ] },
};
