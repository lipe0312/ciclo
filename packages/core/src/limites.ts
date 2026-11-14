// #56 Proteção contra abuso e custo: regras puras (sem I/O). O Worker guarda os contadores no D1 e chama daqui.
import { MEDIA_MAX_BYTES } from "./midia.ts";

export interface Janela { max: number; windowMs: number }

/** Tentativas que validam segredo em /auth/* (login, registro, recuperação, convite, setup): 5 por minuto por IP. */
export const AUTH_TENTATIVAS: Janela = { max: 5, windowMs: 60_000 };
/** 10 falhas seguidas do mesmo IP → bloqueio de 15 min. Sucesso zera a contagem. */
export const AUTH_BLOQUEIO = { falhas: 10, ms: 15 * 60_000 } as const;
/** Depois de 3 falhas seguidas, o IP precisa do Turnstile (quando ligado). */
export const TURNSTILE_DEPOIS = 3;
/** Limite GLOBAL (todas as origens juntas) contra força bruta distribuída. Sobra muito para o uso real (10 contas). */
export const AUTH_GLOBAL = {
  recover: { max: 100, windowMs: 3_600_000 },
  setup: { max: 20, windowMs: 3_600_000 },
} as const satisfies Record<string, Janela>;

/** Janela fixa: início da janela que contém `now`. */
export const inicioJanela = (now: number, windowMs: number) => now - (now % windowMs);
/** Segundos para o Retry-After quando `count` passou do máximo; 0 se ainda cabe. */
export function esperaJanela(count: number, j: Janela, now: number): number {
  if (count <= j.max) return 0;
  return Math.max(1, Math.ceil((inicioJanela(now, j.windowMs) + j.windowMs - now) / 1000));
}

export interface Falhas { falhas: number; ate: number | null }
/** Segundos de bloqueio restantes (0 = livre). */
export const bloqueioRestante = (f: Falhas | null, now: number) =>
  f?.ate != null && f.ate > now ? Math.ceil((f.ate - now) / 1000) : 0;
/** Mais uma falha: na 10ª seguida, bloqueia por 15 min e recomeça a contagem. Bloqueio vencido zera. */
export function registrarFalha(f: Falhas | null, now: number): Falhas {
  const atual = f && !(f.ate != null && f.ate <= now) ? f.falhas : 0;
  const n = atual + 1;
  return n >= AUTH_BLOQUEIO.falhas ? { falhas: 0, ate: now + AUTH_BLOQUEIO.ms } : { falhas: n, ate: null };
}
export const precisaTurnstile = (f: Falhas | null) => (f?.falhas ?? 0) >= TURNSTILE_DEPOIS;

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
