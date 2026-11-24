// #88 Chaves de API próprias (BYOK), ADR-0015. Regras puras (sem dependência; só WebCrypto, que existe no Worker,
// no Node e no navegador): formato da chave, apelido, envelope AES-256-GCM (DEK aleatória por chave, cifrada pela
// KEK versionada; AAD = user_id|provedor|key_id), hosts de saída, allowlist de modelos, mapeamento do esforço para o
// controle de raciocínio de cada provedor, preço, teto de gasto e a prioridade da chave da pessoa sobre a do servidor.
// Um provedor novo entra adicionando-o em PROVEDORES_IA e nos mapas abaixo (HOST, listar, classificar, parâmetros).
// NUNCA: devolver, logar ou pôr em mensagem de erro a chave em claro.

// #133 + openrouter (compatível com a OpenAI, tem modelos grátis) e deepseek: host fixo, sem URL digitada (sem SSRF).
export type ProvedorIa = "anthropic" | "openai" | "gemini" | "openrouter" | "deepseek";
export const PROVEDORES_IA: readonly ProvedorIa[] = ["anthropic", "openai", "gemini", "openrouter", "deepseek"];
/** Nome curto na tela (a marca do fornecedor só aparece aqui, no cadastro da chave). */
export const NOME_PROVEDOR: Record<ProvedorIa, string> = { anthropic: "Anthropic", openai: "OpenAI", gemini: "Google Gemini", openrouter: "OpenRouter", deepseek: "DeepSeek" };
export const HOST_PROVEDOR: Record<ProvedorIa, string> = {
  anthropic: "api.anthropic.com", openai: "api.openai.com", gemini: "generativelanguage.googleapis.com", openrouter: "openrouter.ai", deepseek: "api.deepseek.com",
};
/** #133 Nível grátis: o provedor pode usar o conteúdo para melhorar produtos. Ao cadastrar, a tela mostra em 1 frase com "Entendi". */
export function avisoChaveGratis(p: ProvedorIa): string | null {
  if (p === "gemini") return "No nível grátis do Gemini, o Google pode usar o que você envia para melhorar os produtos dele. Treino e comida são dados de saúde: use a chave grátis só se estiver de acordo.";
  if (p === "openrouter") return "Nos modelos grátis do OpenRouter, quem roda o modelo pode guardar e usar o que você envia. Treino e comida são dados de saúde: use só se estiver de acordo.";
  return null;
}

export type Esforco = "baixo" | "medio" | "alto";
export const ESFORCOS: readonly Esforco[] = ["baixo", "medio", "alto"];

/** Até 6 chaves por conta; validar (chamada ao provedor) 10×/h; usar 20×/min por conta (rate limit). Teto ≤ US$ 100/mês. */
export const MAX_CHAVES_POR_CONTA = 6;
export const CHAVE_LIMITE_VALIDAR = { max: 10, windowMs: 3_600_000 } as const;
export const CHAVE_LIMITE_USO = { max: 20, windowMs: 60_000 } as const;
export const CHAVE_TETO_MAX_USD = 100;
export const CHAVE_TIMEOUT_MS = 15_000;

// ---------- formato e metadados ----------
const SO_CHAVE = /^[A-Za-z0-9_-]+$/;
/** DeepSeek: "sk-" + 32 hex minúsculos (o formato que a plataforma emite hoje; conferir). */
const DEEPSEEK_FMT = /^sk-[0-9a-f]{32}$/;
const FORMATO: Record<ProvedorIa, (k: string) => boolean> = {
  anthropic: (k) => k.startsWith("sk-ant-") && k.length >= 40,
  // #133 sem sobreposição com a DeepSeek (sk- + 32 hex): a chave nunca vai ao host de outro fornecedor
  openai: (k) => k.startsWith("sk-") && !k.startsWith("sk-ant-") && !k.startsWith("sk-or-") && !DEEPSEEK_FMT.test(k) && k.length >= 20,
  gemini: (k) => /^AIza[0-9A-Za-z_-]{35}$/.test(k),
  openrouter: (k) => k.startsWith("sk-or-") && k.length >= 30,
  deepseek: (k) => DEEPSEEK_FMT.test(k),
};
export const ehProvedorIa = (v: unknown): v is ProvedorIa => typeof v === "string" && (PROVEDORES_IA as readonly string[]).includes(v);

/** Confere o formato (sem chamar o provedor). O erro é fixo: nunca repete o que foi colado. */
export function validarChaveFormato(provedor: ProvedorIa, raw: unknown): { ok: true; chave: string } | { ok: false; erro: string } {
  if (!ehProvedorIa(provedor)) return { ok: false, erro: "provedor inválido" };
  if (typeof raw !== "string") return { ok: false, erro: "cole a chave" };
  const k = raw.trim();
  if (k.length < 20 || k.length > 512 || !SO_CHAVE.test(k) || !FORMATO[provedor](k)) return { ok: false, erro: `não parece uma chave da ${NOME_PROVEDOR[provedor]}` };
  return { ok: true, chave: k };
}
export const ultimos4 = (k: string) => k.slice(-4);

const hexDe = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
/** Impressão curta para a pessoa reconhecer a chave sem vê-la: 12 hex de HMAC-SHA256(user_id|chave) com uma chave
 *  derivada da KEK por HKDF. Sem a KEK não dá para testar uma chave conhecida contra ela, e a mesma chave em duas
 *  contas tem impressões diferentes (não correlaciona contas). */
export async function impressaoChave(kekB64: string, userId: string, k: string): Promise<string> {
  const raw = deB64(kekB64);
  try {
    const base = await crypto.subtle.importKey("raw", raw, "HKDF", false, ["deriveKey"]);
    const mac = await crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: new TextEncoder().encode("ciclo-impressao-v1") },
      base, { name: "HMAC", hash: "SHA-256", length: 256 }, false, ["sign"]);
    return hexDe(await crypto.subtle.sign("HMAC", mac, bytesDe(`${userId}|${k}`))).slice(0, 12);
  } finally { raw.fill(0); }
}

/** Apelido: 1 a 40 caracteres, sem controle, espaço normalizado. < e > recusados (o app escapa, mas nem guardamos). */
export function validarApelido(v: unknown): { ok: true; valor: string } | { ok: false; erro: string } {
  if (typeof v !== "string") return { ok: false, erro: "apelido obrigatório" };
  const s = v.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
  if (!s || s.length > 40) return { ok: false, erro: "apelido de 1 a 40 caracteres" };
  if (/[<>]/.test(s)) return { ok: false, erro: "apelido sem < ou >" };
  return { ok: true, valor: s };
}

/** Tetos em US$ (até 2 casas) → centavos. 0,01 ≤ dia ≤ mês ≤ 100. */
export function validarTetos(dia: unknown, mes: unknown): { ok: true; dia: number; mes: number } | { ok: false; erro: string } {
  const cent = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && Math.abs(v * 100 - Math.round(v * 100)) < 1e-6 ? Math.round(v * 100) : NaN);
  const d = cent(dia), m = cent(mes);
  if (!(d >= 1 && m >= d && m <= CHAVE_TETO_MAX_USD * 100)) return { ok: false, erro: `teto: 0,01 ≤ dia ≤ mês ≤ ${CHAVE_TETO_MAX_USD} (US$)` };
  return { ok: true, dia: d, mes: m };
}

// ---------- envelope (ADR-0015) ----------
/** Chave AES importada (o tipo do WebCrypto sem depender da lib DOM). */
export type Kek = Awaited<ReturnType<typeof crypto.subtle.importKey>>;
export interface Envelope { ciphertext: string; iv: string; dekCifrada: string; kekVersao: number }
export const aadChave = (userId: string, provedor: ProvedorIa, keyId: string) => `${userId}|${provedor}|${keyId}`;

const b64 = (u: Uint8Array) => { let s = ""; for (const x of u) s += String.fromCharCode(x); return btoa(s); };
const deB64 = (s: string) => { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
const bytesDe = (s: string) => { const t = new TextEncoder().encode(s); const u = new Uint8Array(t.length); u.set(t); t.fill(0); return u; };
const aleatorio = (n: number) => crypto.getRandomValues(new Uint8Array(n));

/** KEKs do ambiente: só KEK_V1..KEK_V9 com exatamente 32 bytes em base64 (o resto é ignorado: falha fechada). */
export function lerKeks(env: Record<string, unknown>): Map<number, string> {
  const m = new Map<number, string>();
  for (const [k, v] of Object.entries(env)) {
    const r = /^KEK_V([1-9])$/.exec(k);
    if (!r || typeof v !== "string") continue;
    try { if (deB64(v.trim()).length === 32) m.set(Number(r[1]), v.trim()); } catch { /* base64 inválido: ignora */ }
  }
  return m;
}
/** A KEK de escrita é a de maior versão (rotação: põe KEK_V2, as novas cifras usam a 2; as antigas seguem legíveis pela 1). */
export function kekAtual(ks: Map<number, string>): { versao: number; b64: string } | null {
  const v = Math.max(0, ...ks.keys());
  return v ? { versao: v, b64: ks.get(v)! } : null;
}
export async function importarKek(kekB64: string): Promise<Kek> {
  const raw = deB64(kekB64);
  if (raw.length !== 32) throw new Error("KEK precisa de 32 bytes");
  try { return await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]); } finally { raw.fill(0); }
}

/** Cifra a chave com uma DEK nova (AES-256-GCM, IV de 12 bytes aleatório) e embrulha a DEK com a KEK (outro IV). */
export async function cifrarChave(kek: Kek, kekVersao: number, aad: string, chave: string): Promise<Envelope> {
  const dekRaw = aleatorio(32), iv = aleatorio(12), ivDek = aleatorio(12), pt = bytesDe(chave);
  try {
    const dek = await crypto.subtle.importKey("raw", dekRaw, "AES-GCM", false, ["encrypt"]);
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: bytesDe(aad) }, dek, pt);
    const dekCt = await crypto.subtle.encrypt({ name: "AES-GCM", iv: ivDek, additionalData: bytesDe(`${aad}|kek_v${kekVersao}`) }, kek, dekRaw);
    const embrulho = new Uint8Array(12 + dekCt.byteLength); embrulho.set(ivDek); embrulho.set(new Uint8Array(dekCt), 12);
    return { ciphertext: b64(new Uint8Array(ct)), iv: b64(iv), dekCifrada: b64(embrulho), kekVersao };
  } finally { dekRaw.fill(0); pt.fill(0); }
}

/** Decifra (só na memória do Worker, por requisição). AAD diferente, KEK errada ou byte adulterado → lança. */
export async function decifrarChave(kek: Kek, e: Pick<Envelope, "ciphertext" | "iv" | "dekCifrada" | "kekVersao">, aad: string): Promise<string> {
  const emb = deB64(e.dekCifrada);
  if (emb.length < 13) throw new Error("envelope inválido");
  const dekRaw = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: emb.slice(0, 12), additionalData: bytesDe(`${aad}|kek_v${e.kekVersao}`) }, kek, emb.slice(12)));
  try {
    const dek = await crypto.subtle.importKey("raw", dekRaw, "AES-GCM", false, ["decrypt"]);
    const pt = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: deB64(e.iv), additionalData: bytesDe(aad) }, dek, deB64(e.ciphertext)));
    try { return new TextDecoder().decode(pt); } finally { pt.fill(0); }
  } finally { dekRaw.fill(0); }
}

// ---------- saída para o provedor ----------
/** Só https e só os hosts da allowlist (sem subdomínio, sem gateway): o Worker não chama mais nada com a chave. */
export function hostPermitido(url: string): boolean {
  try { const u = new URL(url); return u.protocol === "https:" && Object.values(HOST_PROVEDOR).includes(u.hostname) && !u.username && !u.password && !u.port; } catch { return false; }
}

/** Chamada barata para validar a chave: listar os modelos. A chave vai só em cabeçalho (URL vai para log de terceiros). */
export function pedidoListarModelos(p: ProvedorIa, chave: string): { url: string; headers: Record<string, string> } {
  if (p === "anthropic") return { url: "https://api.anthropic.com/v1/models?limit=100", headers: { "x-api-key": chave, "anthropic-version": "2023-06-01" } };
  if (p === "openai") return { url: "https://api.openai.com/v1/models", headers: { Authorization: `Bearer ${chave}` } };
  if (p === "deepseek") return { url: "https://api.deepseek.com/models", headers: { Authorization: `Bearer ${chave}` } };
  if (p === "openrouter") return { url: "https://openrouter.ai/api/v1/models", headers: { Authorization: `Bearer ${chave}` } };
  return { url: "https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", headers: { "x-goog-api-key": chave } };
}
/** #133 Validar a chave: no OpenRouter a lista de modelos é pública (não prova a chave), então antes vem o endpoint
 *  da própria chave, que exige autenticação. Nos outros, listar os modelos já autentica. A chave vai só em cabeçalho. */
export function pedidosValidar(p: ProvedorIa, chave: string): { url: string; headers: Record<string, string> }[] {
  const lista = pedidoListarModelos(p, chave);
  return p === "openrouter" ? [{ url: "https://openrouter.ai/api/v1/key", headers: { Authorization: `Bearer ${chave}` } }, lista] : [lista];
}
/** IDs dos modelos na resposta (formato de cada provedor); qualquer outra coisa → lista vazia. */
export function lerListaModelos(p: ProvedorIa, j: unknown): string[] {
  const o = (j && typeof j === "object" ? j : {}) as Record<string, unknown>;
  const arr = (p === "gemini" ? o.models : o.data);
  if (!Array.isArray(arr)) return [];
  return arr.slice(0, 500).map((m) => (m && typeof m === "object" ? (m as Record<string, unknown>)[p === "gemini" ? "name" : "id"] : null))
    .filter((s): s is string => typeof s === "string").map((s) => (p === "gemini" ? s.replace(/^models\//, "") : s));
}

/** Mensagem fixa por código HTTP. O corpo da resposta do provedor é sempre descartado (pode ecoar a chave). */
export function mensagemErroProvedor(status: number): { code: string; msg: string } {
  if (status === 401 || status === 403) return { code: "chave_recusada", msg: "O provedor recusou a chave. Confira se ela está ativa." };
  if (status === 429) return { code: "provedor_limite", msg: "O provedor limitou as chamadas agora. Tente de novo mais tarde." };
  return { code: "provedor_fora", msg: "O provedor não respondeu. Tente de novo em instantes." };
}

// ---------- modelos (allowlist) e esforço ----------
type Raciocinio = "adaptive" | "effort" | "budget" | "openai" | "nenhum" | "gemini-budget" | "gemini-level" | "compat" | "compat-pensa";
export interface ModeloIa { id: string; familia: string; ordem: number; raciocinio: Raciocinio }

const ANT = /^claude-(haiku|sonnet|opus)-(\d)(?:-(\d{1,2}))?(?:-\d{8})?$/;
const OAI = /^(gpt-5(?:\.\d)?(?:-mini|-nano)?|o3|o3-mini|o4-mini|gpt-4\.1(?:-mini|-nano)?|gpt-4o(?:-mini)?)(?:-\d{4}-\d{2}-\d{2})?$/;
const GEM = /^gemini-(2\.5|3(?:\.\d)?)-(pro|flash|flash-lite)(?:-preview(?:-[a-z0-9-]{1,30})?)?$/;
const DSK = /^deepseek-(chat|reasoner)$/;
/** OpenRouter: "fornecedor/modelo[:free]", só de fornecedores conhecidos (sem roteadores automáticos nem imagem). */
const ORT = /^(anthropic|openai|google|deepseek|meta-llama|mistralai|qwen|moonshotai|x-ai|z-ai|nvidia|microsoft)\/[a-z0-9][a-z0-9.-]{0,60}(:free)?$/;
const ORT_FORA = /(image|vision-only|embed|tts|whisper|audio|guard|moderation)/;
const FAMILIA_ANT: Record<string, [string, number]> = { haiku: ["Haiku", 0], sonnet: ["Sonnet", 1], opus: ["Opus", 2] };

/** Classifica um ID da lista da própria chave; fora da allowlist (embeddings, imagem, áudio, legados) → null. */
export function classificarModelo(p: ProvedorIa, id: string): ModeloIa | null {
  if (typeof id !== "string" || id.length > 80) return null;
  if (p === "anthropic") {
    const m = ANT.exec(id); if (!m) return null;
    const v = Number(m[2]) + Number(m[3] ?? 0) / 10;
    if (v < 4.5) return null;
    const [familia, ordem] = FAMILIA_ANT[m[1]];
    const raciocinio: Raciocinio = v >= 4.6 ? "adaptive" : m[1] === "opus" ? "effort" : "budget";
    return { id, familia, ordem, raciocinio };
  }
  if (p === "openai") {
    const m = OAI.exec(id); if (!m) return null;
    const pensa = /^(gpt-5|o\d)/.test(m[1]);
    return { id, familia: m[1].startsWith("o") ? "o-series" : m[1].startsWith("gpt-5") ? "GPT-5" : "GPT-4", ordem: /nano/.test(id) ? 0 : /mini/.test(id) ? 1 : 2, raciocinio: pensa ? "openai" : "nenhum" };
  }
  if (p === "deepseek") {
    const m = DSK.exec(id); if (!m) return null;
    return m[1] === "reasoner" ? { id, familia: "Reasoner", ordem: 2, raciocinio: "compat-pensa" } : { id, familia: "Chat", ordem: 1, raciocinio: "compat" };
  }
  if (p === "openrouter") {
    if (!ORT.test(id) || ORT_FORA.test(id)) return null;
    const gratis = id.endsWith(":free");
    return { id, familia: gratis ? "Grátis" : "Pago", ordem: gratis ? 0 : 1, raciocinio: "compat" };
  }
  const m = GEM.exec(id); if (!m) return null;
  return { id, familia: m[2] === "pro" ? "Pro" : m[2] === "flash" ? "Flash" : "Flash-Lite", ordem: m[2] === "flash-lite" ? 0 : m[2] === "flash" ? 1 : 2, raciocinio: m[1] === "2.5" ? "gemini-budget" : "gemini-level" };
}
/** Modelos da chave que o app aceita: sem repetir, do mais leve ao mais forte, até 40. */
export function filtrarModelos(p: ProvedorIa, ids: unknown[]): ModeloIa[] {
  const vistos = new Set<string>(), out: ModeloIa[] = [];
  for (const id of ids) {
    if (typeof id !== "string" || vistos.has(id)) continue;
    const m = classificarModelo(p, id);
    if (m) { vistos.add(id); out.push(m); }
  }
  return out.sort((a, b) => a.ordem - b.ordem || a.id.localeCompare(b.id)).slice(0, 40);
}
/** Padrão ao salvar: o do meio (ex.: Sonnet) — nem o mais caro, nem o mais fraco. */
export function modeloPadrao(p: ProvedorIa, ids: string[]): string | null {
  const ms = filtrarModelos(p, ids);
  if (!ms.length) return null;
  if (p === "openrouter") return ms[0].id; // #133 o grátis primeiro (ordem 0): ninguém paga sem escolher
  const meio = ms.find((m) => m.ordem === 1) ?? ms[Math.floor((ms.length - 1) / 2)];
  return meio.id;
}

const ESF_API: Record<Esforco, "low" | "medium" | "high"> = { baixo: "low", medio: "medium", alto: "high" };
/** Orçamento de raciocínio (tokens) para quem usa orçamento: Haiku 4.5, Gemini 2.5 e o raciocínio da OpenAI na saída. */
export const ORCAMENTO_RACIOCINIO: Record<Esforco, number> = { baixo: 1024, medio: 4096, alto: 16000 };
const ORCAMENTO_GEMINI: Record<Esforco, number> = { baixo: 1024, medio: 4096, alto: 16384 };

/** Fragmento do corpo da chamada: modelo, limite de saída e o controle de raciocínio que cada API entende.
 *  Claude ≥ 4.6: thinking adaptive + output_config.effort · Opus 4.5: só effort · Haiku 4.5: thinking.budget_tokens.
 *  OpenAI gpt-5/o-series: reasoning_effort (sem temperatura) · gpt-4.x: sem esforço. Gemini 2.5: thinkingBudget · 3: thinkingLevel
 *  (o Pro aceita só low/high). No Gemini o modelo vai no caminho da URL. Modelo fora da allowlist → lança. */
export function parametrosModelo(p: ProvedorIa, modelo: string, esforco: Esforco, maxSaida: number): Record<string, unknown> {
  const m = classificarModelo(p, modelo);
  if (!m) throw new Error("modelo fora da lista permitida");
  const e = ESFORCOS.includes(esforco) ? esforco : "medio";
  if (p === "anthropic") {
    if (m.raciocinio === "adaptive") return { model: modelo, max_tokens: maxSaida, thinking: { type: "adaptive" }, output_config: { effort: ESF_API[e] } };
    if (m.raciocinio === "effort") return { model: modelo, max_tokens: maxSaida, output_config: { effort: ESF_API[e] } };
    return { model: modelo, max_tokens: maxSaida + ORCAMENTO_RACIOCINIO[e], thinking: { type: "enabled", budget_tokens: ORCAMENTO_RACIOCINIO[e] } };
  }
  if (p === "openai") {
    if (m.raciocinio === "openai") return { model: modelo, max_completion_tokens: maxSaida + ORCAMENTO_RACIOCINIO[e], reasoning_effort: ESF_API[e] };
    return { model: modelo, max_completion_tokens: maxSaida, temperature: 0.3 };
  }
  if (p === "openrouter" || p === "deepseek") {
    if (m.raciocinio === "compat-pensa") return { model: modelo, max_tokens: maxSaida + ORCAMENTO_RACIOCINIO[e] }; // o reasoner pensa sozinho; sem temperatura
    return { model: modelo, max_tokens: maxSaida, temperature: 0.3 };
  }
  if (m.raciocinio === "gemini-budget") return { generationConfig: { maxOutputTokens: maxSaida + ORCAMENTO_GEMINI[e], thinkingConfig: { thinkingBudget: ORCAMENTO_GEMINI[e] } } };
  const nivel = m.familia === "Pro" ? (e === "baixo" ? "low" : "high") : ESF_API[e];
  return { generationConfig: { maxOutputTokens: maxSaida + ORCAMENTO_GEMINI[e], thinkingConfig: { thinkingLevel: nivel } } };
}

// ---------- preço e teto ----------
/** US$ por 1 milhão de tokens (entrada, saída), por prefixo do ID (o mais específico primeiro). Desconhecido → caro. */
const PRECOS: [ProvedorIa, string, number, number][] = [
  ["anthropic", "claude-haiku-5", 0.1, 0.5], ["anthropic", "claude-haiku-4-5", 1, 5],
  ["anthropic", "claude-sonnet-5", 2, 10], ["anthropic", "claude-sonnet-4", 3, 15],
  ["anthropic", "claude-opus-5-5", 4, 20], ["anthropic", "claude-opus-5", 5, 25], ["anthropic", "claude-opus-4", 5, 25],
  ["openai", "gpt-5-nano", 0.05, 0.4], ["openai", "gpt-5-mini", 0.25, 2], ["openai", "gpt-5", 1.25, 10],
  ["openai", "gpt-4.1-nano", 0.1, 0.4], ["openai", "gpt-4.1-mini", 0.4, 1.6], ["openai", "gpt-4.1", 2, 8],
  ["openai", "gpt-4o-mini", 0.15, 0.6], ["openai", "gpt-4o", 2.5, 10], ["openai", "o4-mini", 1.1, 4.4], ["openai", "o3-mini", 1.1, 4.4], ["openai", "o3", 2, 8],
  ["gemini", "gemini-2.5-flash-lite", 0.1, 0.4], ["gemini", "gemini-2.5-flash", 0.3, 2.5], ["gemini", "gemini-2.5-pro", 1.25, 10],
  ["gemini", "gemini-3-flash", 0.5, 3], ["gemini", "gemini-3-pro", 2, 12],
];
export const PRECO_IA_DESCONHECIDO = { in: 15, out: 75 };
export function precoModelo(p: ProvedorIa, modelo: string): { in: number; out: number } {
  if (p === "openrouter") return modelo.endsWith(":free") ? { in: 0, out: 0 } : PRECO_IA_DESCONHECIDO; // pago no OpenRouter: lado seguro
  if (p === "deepseek") return PRECO_IA_DESCONHECIDO; // preço muda por horário e versão: lado seguro (conferir)
  const r = PRECOS.filter(([q, pre]) => q === p && modelo.startsWith(pre)).sort((a, b) => b[1].length - a[1].length)[0];
  if (!r || (r[1] === "gpt-5" && /^gpt-5\.\d/.test(modelo))) return PRECO_IA_DESCONHECIDO; // gpt-5.x: preço novo → lado seguro
  return { in: r[2], out: r[3] };
}
export function custoIaUsd(p: ProvedorIa, modelo: string, tokensIn: number, tokensOut: number): number {
  const pr = precoModelo(p, modelo);
  const i = Math.max(0, Number(tokensIn) || 0), o = Math.max(0, Number(tokensOut) || 0);
  return (i * pr.in + o * pr.out) / 1_000_000;
}
/** Só chama se gasto + pior caso couber no teto do dia E do mês (o Worker faz o mesmo num UPDATE atômico). */
export function cabeNoTetoIa(x: { gastoDiaMicro: number; gastoMesMicro: number; tetoDiaCent: number; tetoMesCent: number; estMicro: number }): boolean {
  if (!(x.estMicro >= 0)) return false;
  return x.gastoDiaMicro + x.estMicro <= x.tetoDiaCent * 10_000 && x.gastoMesMicro + x.estMicro <= x.tetoMesCent * 10_000;
}

// ---------- #138 limites blindados ----------
// Padrão de mercado seguido em cada controle (anotado na issue #138 e no ADR-0015):
// - Assimetria: reduzir risco (baixar teto, desativar, apagar) nunca pede prova; aumentar risco pede prova recente
//   (step-up do NIST SP 800-63B; bancos pedem senha/biometria só para AUMENTAR limite, nunca para reduzir).
// - Subida com espera: aumento de limite de cartão e do Pix só vale depois de um prazo (no Pix, a regra do Banco
//   Central dá de 24 a 48 h); reduzir vale na hora. Uma sessão roubada não ganha teto maior na hora.
// - Teto global da conta: o "hard limit" por organização da OpenAI/Anthropic vale acima de cada chave.
// - Disjuntor: detecção de velocidade anormal (antifraude de cartão) pausa e só o dono reativa, com prova.
// - Alerta de consumo a 80%: o "soft limit"/alerta de orçamento dos painéis de nuvem e de API.

/** Subir teto, ativar ou trocar a chave: Face ID dos últimos 60 s (o cadastro e os ajustes seguem com 5 min). */
export const CHAVE_REAUTH_LIMITE_MS = 60_000;
/** Subida de teto pendente: só vale 24 h depois do pedido. */
export const CHAVE_ESPERA_SUBIDA_MS = 24 * 3_600_000;
/** Teto global da conta (soma de todas as chaves), em centavos: US$ 100 por mês e por dia, fixo (não se contorna com mais chaves). */
export const CHAVE_TETO_CONTA_CENT = { dia: CHAVE_TETO_MAX_USD * 100, mes: CHAVE_TETO_MAX_USD * 100 } as const;
/** Disjuntor de velocidade: em 10 min, gasto acima de metade do teto do dia ou 60 chamadas (o rate limit deixaria 200). */
export const DISJUNTOR = { janelaMs: 10 * 60_000, fracaoTetoDia: 0.5, maxChamadas: 60 } as const;
export type MotivoPausa = "gasto_10min" | "rajada";
/** Aviso de consumo a partir de 80% do teto do dia ou do mês. */
export const ALERTA_CONSUMO = 0.8;

/** Chave de nível grátis (o provedor pode usar o conteúdo): exige o aceite do aviso, gravado no servidor. */
export const chaveGratis = (p: ProvedorIa) => avisoChaveGratis(p) != null;

export type ProvaChave = "sessao" | "faceid" | "faceid60";
/** Que prova a mudança pede. Aumentar risco numa chave que já existe (trocar o segredo, ativar, subir teto) → Face ID
 *  de 60 s; cadastrar e ajuste neutro (apelido, modelo, esforço) → Face ID de 5 min (como na #88); reduzir risco
 *  (baixar teto, desativar, apagar, cancelar subida) → sessão normal. */
export function provaExigida(m: { cadastra?: boolean; trocaSegredo?: boolean; ativa?: boolean; sobeTeto?: boolean; ajuste?: boolean }): ProvaChave {
  if (m.trocaSegredo || m.ativa || m.sobeTeto) return "faceid60";
  return m.cadastra || m.ajuste ? "faceid" : "sessao";
}

export interface TetosCent { dia: number; mes: number }
export interface SubidaPendente extends TetosCent { valeEm: number }
/** Mudança de tetos (centavos; `alvo` já validado por validarTetos): a parte que baixa vale agora; a que sobe fica
 *  pendente por 24 h. Qualquer baixa cancela a pendente anterior; uma subida nova a substitui (e o prazo recomeça). */
export function planejarTetos(atual: TetosCent, alvo: TetosCent, pendente: SubidaPendente | null, now: number): {
  agora: TetosCent; pendente: SubidaPendente | null; sobe: boolean; baixa: boolean; anterior: "nenhuma" | "mantida" | "cancelada" | "substituida";
} {
  const sobe = alvo.dia > atual.dia || alvo.mes > atual.mes;
  const baixa = alvo.dia < atual.dia || alvo.mes < atual.mes;
  const agora = { dia: Math.min(atual.dia, alvo.dia), mes: Math.min(atual.mes, alvo.mes) };
  const nova = sobe ? { dia: alvo.dia, mes: alvo.mes, valeEm: now + CHAVE_ESPERA_SUBIDA_MS } : null;
  const anterior = !pendente ? "nenhuma" : sobe ? "substituida" : baixa ? "cancelada" : "mantida";
  return { agora, pendente: sobe ? nova : baixa ? null : pendente, sobe, baixa, anterior };
}
/** Aplica a subida pendente se o prazo passou. Pendente inválida (dia > mês ou fora da faixa) é descartada. */
export function aplicarPendente(atual: TetosCent, p: SubidaPendente | null, now: number): { tetos: TetosCent; pendente: SubidaPendente | null; aplicou: boolean } {
  if (!p) return { tetos: atual, pendente: null, aplicou: false };
  if (!(p.dia >= 1 && p.mes >= p.dia && p.mes <= CHAVE_TETO_MAX_USD * 100)) return { tetos: atual, pendente: null, aplicou: false };
  if (now < p.valeEm) return { tetos: atual, pendente: p, aplicou: false };
  return { tetos: { dia: p.dia, mes: p.mes }, pendente: null, aplicou: true };
}

/** O pior caso cabe no teto global da conta (soma de todas as chaves) do dia E do mês? (o Worker confere no mesmo UPDATE atômico) */
export function cabeNoTetoConta(x: { gastoDiaMicro: number; gastoMesMicro: number; estMicro: number }): boolean {
  if (!(x.estMicro >= 0)) return false;
  return x.gastoDiaMicro + x.estMicro <= CHAVE_TETO_CONTA_CENT.dia * 10_000 && x.gastoMesMicro + x.estMicro <= CHAVE_TETO_CONTA_CENT.mes * 10_000;
}

/** Disjuntor (conferido antes de cada chamada, com o que já foi gasto na janela de 10 min): motivo da pausa ou null. */
export function disjuntor(x: { gastoJanelaMicro: number; chamadasJanela: number; tetoDiaCent: number }): MotivoPausa | null {
  if (x.chamadasJanela >= DISJUNTOR.maxChamadas) return "rajada";
  if (x.gastoJanelaMicro > DISJUNTOR.fracaoTetoDia * x.tetoDiaCent * 10_000) return "gasto_10min";
  return null;
}
export const MOTIVO_PAUSA: Record<MotivoPausa, string> = {
  gasto_10min: "gasto rápido demais em 10 minutos", rajada: "chamadas demais em 10 minutos",
};

export interface AlertaConsumo { periodo: "dia" | "mes"; pct: number }
/** A partir de 80% do teto do dia ou do mês (o mais cheio vence). */
export function alertaConsumo(x: { gastoDiaMicro: number; gastoMesMicro: number; tetoDiaCent: number; tetoMesCent: number }): AlertaConsumo | null {
  const pct = (g: number, t: number) => (t > 0 ? Math.max(0, g) / (t * 10_000) : 0);
  const d = pct(x.gastoDiaMicro, x.tetoDiaCent), m = pct(x.gastoMesMicro, x.tetoMesCent);
  const [periodo, v] = d >= m ? ["dia", d] as const : ["mes", m] as const;
  if (v < ALERTA_CONSUMO) return null;
  return { periodo, pct: Math.min(100, Math.floor(v * 100 + 1e-9)) };
}
export function textoAlertaConsumo(apelido: string, a: AlertaConsumo): string {
  const p = a.periodo === "dia" ? "do dia" : "do mês";
  return a.pct >= 100 ? `${apelido} chegou ao teto ${p}.` : `${apelido} usou ${a.pct}% do teto ${p}.`;
}

// ---------- prioridade ----------
/** A chave da pessoa vence; a do dono (OPENAI_API_KEY) é só o padrão opcional do servidor. */
export function fonteOpenai(x: { chaveUsuario: boolean; servidor: { ligado: boolean } }): "usuario" | "servidor" | null {
  return x.chaveUsuario ? "usuario" : x.servidor.ligado ? "servidor" : null;
}
