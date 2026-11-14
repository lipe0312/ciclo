// #56 Proteção contra abuso e custo: regras puras (sem I/O). O Worker guarda os contadores no D1 e chama daqui.
import { MEDIA_MAX_BYTES } from "./midia.ts";

export interface Janela { max: number; windowMs: number }

/** Tentativas que validam segredo em /auth/* (login, registro, recuperação, convite, setup): 5 por minuto por IP. */
export const AUTH_TENTATIVAS: Janela = { max: 5, windowMs: 60_000 };
/** 10 falhas seguidas do mesmo IP → bloqueio de 15 min. O sucesso NÃO zera (não limpa o rastro de quem tenta vários alvos):
 *  a contagem decai sozinha quando passam 15 min sem falha. */
export const AUTH_BLOQUEIO = { falhas: 10, ms: 15 * 60_000, decaiMs: 15 * 60_000 } as const;
/** Depois de 3 falhas seguidas, o IP precisa do Turnstile (quando ligado). */
export const TURNSTILE_DEPOIS = 3;
/** Limite GLOBAL (todas as origens juntas) contra força bruta distribuída. Conta só FALHAS de verificação (código errado),
 *  não requisições. Passou do teto: só segue quem passou no Turnstile, até um teto 10× maior (o dono não fica trancado). */
export const AUTH_GLOBAL = {
  recover: { max: 100, windowMs: 3_600_000 },
  setup: { max: 20, windowMs: 3_600_000 },
} as const satisfies Record<string, Janela>;
export const AUTH_GLOBAL_TURNSTILE_X = 10;
/** Decisão do limite global com as falhas já contadas na janela: livre, só com Turnstile, ou fechado. */
export function globalAuth(falhas: number, j: Janela): "livre" | "turnstile" | "fechado" {
  if (falhas < j.max) return "livre";
  return falhas < j.max * AUTH_GLOBAL_TURNSTILE_X ? "turnstile" : "fechado";
}

/** Chave de origem: IPv4 inteiro; IPv6 agrupado pelo /64 (um cliente costuma ter o /64 inteiro). null = IP inválido. */
export function grupoIp(ip: string): string | null {
  const v = ip.trim().toLowerCase();
  const v4 = (x: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(x) && x.split(".").every((n) => Number(n) <= 255) ? x : null;
  if (!v.includes(":")) return v4(v);
  const mapeado = /^::ffff:([\d.]+)$/.exec(v);
  if (mapeado) return v4(mapeado[1]);
  if (!/^[0-9a-f:]+$/.test(v)) return null;
  const partes = v.split("::");
  if (partes.length > 2) return null;
  const bloco = (x: string) => (x ? x.split(":") : []);
  let h: string[];
  if (partes.length === 1) h = bloco(v);
  else {
    const ini = bloco(partes[0]), fim = bloco(partes[1]);
    if (ini.length + fim.length > 7) return null;
    h = [...ini, ...Array(8 - ini.length - fim.length).fill("0"), ...fim];
  }
  if (h.length !== 8 || h.some((x) => !/^[0-9a-f]{1,4}$/.test(x))) return null;
  return h.slice(0, 4).map((x) => x.replace(/^0+(?=.)/, "")).join(":") + "::/64";
}
/** Cota diária de escritas por pessoa (API e MCP): uma conta sozinha não esgota o grátis do app. */
export const COTA_ESCRITAS_DIA = 2_000;

/** Janela fixa: início da janela que contém `now`. */
export const inicioJanela = (now: number, windowMs: number) => now - (now % windowMs);
/** Segundos para o Retry-After quando `count` passou do máximo; 0 se ainda cabe. */
export function esperaJanela(count: number, j: Janela, now: number): number {
  if (count <= j.max) return 0;
  return Math.max(1, Math.ceil((inicioJanela(now, j.windowMs) + j.windowMs - now) / 1000));
}

export interface Falhas { falhas: number; ate: number | null; em?: number | null }
/** Segundos de bloqueio restantes (0 = livre). */
export const bloqueioRestante = (f: Falhas | null, now: number) =>
  f?.ate != null && f.ate > now ? Math.ceil((f.ate - now) / 1000) : 0;
/** Falhas que ainda contam: zera depois de um bloqueio vencido ou de 15 min sem falha. */
export function falhasVigentes(f: Falhas | null, now: number): number {
  if (!f) return 0;
  if (f.ate != null && f.ate <= now) return 0;
  if (f.em != null && f.em <= now - AUTH_BLOQUEIO.decaiMs) return 0;
  return f.falhas;
}
/** Mais uma falha: na 10ª seguida, bloqueia por 15 min e recomeça a contagem. (O Worker faz o mesmo num upsert atômico.) */
export function registrarFalha(f: Falhas | null, now: number): Falhas {
  const n = falhasVigentes(f, now) + 1;
  return n >= AUTH_BLOQUEIO.falhas ? { falhas: 0, ate: now + AUTH_BLOQUEIO.ms, em: now } : { falhas: n, ate: null, em: now };
}
export const precisaTurnstile = (f: Falhas | null, now: number) => falhasVigentes(f, now) >= TURNSTILE_DEPOIS;

// ---- mídia: tamanho, tipo real e cota da conta ----
/** Arquivo: o limite do servidor (20 MB) fica abaixo do teto de 25 MB do plano. */
export const ARQUIVO_MAX_BYTES = MEDIA_MAX_BYTES;
/** R2 por pessoa: 500 MB (10 contas × 500 MB = 5 GB, metade do grátis). */
export const CONTA_R2_MAX_BYTES = 500 * 1024 * 1024;

const at = (b: Uint8Array, off: number, sig: number[]) => b.length >= off + sig.length && sig.every((x, i) => b[off + i] === x);
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

/** Tipo pelo conteúdo (magic bytes), não pelo cabeçalho. null = não é imagem/vídeo aceito. */
export function tipoPorConteudo(b: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | "video/mp4" | "video/webm" | null {
  if (at(b, 0, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (at(b, 0, [0x89, 0x50, 0x4e, 0x47])) return "image/png";
  if (at(b, 0, ascii("RIFF")) && at(b, 8, ascii("WEBP"))) return "image/webp";
  if (at(b, 4, ascii("ftyp"))) return "video/mp4"; // MP4 e MOV (QuickTime) usam a mesma caixa ftyp
  if (at(b, 0, [0x1a, 0x45, 0xdf, 0xa3])) return "video/webm";
  return null;
}
/** O tipo declarado (Content-Type) bate com o conteúdo? MOV conta como MP4. */
export function tipoConfere(declarado: string, b: Uint8Array): boolean {
  const real = tipoPorConteudo(b);
  if (!real) return false;
  return real === (declarado === "video/quicktime" ? "video/mp4" : declarado);
}
/** Cabe na cota da conta? `usado` = bytes já guardados (inclui a lixeira, que ainda ocupa o R2). */
export const cabeNaConta = (usado: number, novo: number) => usado + novo <= CONTA_R2_MAX_BYTES;

// ---- cota global de custo (plano grátis da Cloudflare) ----
export const GRATIS = {
  /** D1: 100 mil linhas escritas por dia. */
  d1EscritasDia: 100_000,
  /** R2: 10 GB guardados. */
  r2Bytes: 10 * 1024 ** 3,
} as const;
/** Estimativa conservadora de linhas escritas no D1 por requisição de escrita (contadores + a linha + índices). */
export const LINHAS_POR_ESCRITA = 10;
export const AVISO_PCT = 0.8, TRAVA_PCT = 0.95;

export type NivelCota = "ok" | "aviso" | "trava";
export interface UsoGlobal { escritasHoje: number; r2Bytes: number }
/** Fração do grátis já usada (o pior dos dois) e o nível: 80% avisa o dono, 95% para uploads e convites. */
export function nivelGlobal(u: UsoGlobal): { pct: number; nivel: NivelCota } {
  const pct = Math.max((u.escritasHoje * LINHAS_POR_ESCRITA) / GRATIS.d1EscritasDia, u.r2Bytes / GRATIS.r2Bytes);
  return { pct, nivel: pct >= TRAVA_PCT ? "trava" : pct >= AVISO_PCT ? "aviso" : "ok" };
}
/** Dia UTC (YYYY-MM-DD) do contador diário. */
export const diaUtc = (now: number) => new Date(now).toISOString().slice(0, 10);

export const COTA_MSG = {
  global: "O app chegou perto do limite grátis de hoje: envio de arquivos e convites voltam amanhã. O resto funciona.",
  conta: "Sua conta chegou a 500 MB de fotos e vídeos. Apague fotos ou vídeos antigos para enviar mais.",
  tipo: "O arquivo não é a foto ou o vídeo que diz ser.",
} as const;
