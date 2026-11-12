// Mídia do aparelho (foto/vídeo da regulagem): limites e plano de compressão do vídeo. Regra pura; quem codifica é o navegador (WebCodecs).
export const MEDIA_TARGET_BYTES = 6 * 1024 * 1024;   // meta de um vídeo de 15 s
export const MEDIA_MAX_BYTES = 20 * 1024 * 1024;     // limite do servidor
export const VIDEO_MAX_SECONDS = 30;                 // acima disso nem tenta comprimir (leva tempo demais no aparelho)
export const VIDEO_MAX_LONG = 1280, VIDEO_MAX_SHORT = 720; // "720p": lado maior 1280, menor 720 (vale para retrato)
const MIN_BPS = 600_000, MAX_BPS = 4_000_000, FILL = 0.88; // usa 88% da meta: sobra para o contêiner e para o encoder estourar um pouco

export const formatMB = (bytes: number) => (Math.round((bytes / 1048576) * 10) / 10).toFixed(1).replace(".", ",") + " MB";

export type VideoPlan =
  | { action: "compress"; width: number; height: number; videoBps: number; fps: number }
  | { action: "as-is"; message: string }
  | { action: "reject"; message: string };

const even = (n: number) => Math.max(2, Math.floor(n / 2) * 2);

/** Decide o que fazer com o vídeo escolhido: comprimir (720p + taxa que cabe na meta), enviar como está ou recusar. */
export function planVideo(v: { width: number; height: number; durationS: number; canEncode: boolean }): VideoPlan {
  if (!(v.width > 0) || !(v.height > 0) || !Number.isFinite(v.durationS) || !(v.durationS > 0))
    return { action: "as-is", message: "Não consegui ler o vídeo; ele vai como está (limite de 20 MB)." };
  if (v.durationS > VIDEO_MAX_SECONDS)
    return { action: "reject", message: `Vídeo de ${Math.round(v.durationS)} s: grave de 10 a 15 s (no máximo ${VIDEO_MAX_SECONDS} s).` };
  if (!v.canEncode)
    return { action: "as-is", message: "Este navegador não tem compressão de vídeo; ele vai como está (limite de 20 MB). Grave 10 a 15 s em 720p." };
  const long = Math.max(v.width, v.height), short = Math.min(v.width, v.height);
  const scale = Math.min(1, VIDEO_MAX_LONG / long, VIDEO_MAX_SHORT / short);
  const videoBps = Math.min(MAX_BPS, Math.max(MIN_BPS, Math.floor((MEDIA_TARGET_BYTES * FILL * 8) / Math.max(v.durationS, 1))));
  return { action: "compress", width: even(v.width * scale), height: even(v.height * scale), videoBps, fps: 30 };
}

export type UploadDecision = { ok: true; warn: string | null } | { ok: false; message: string };
/** Confere o arquivo que vai subir (já comprimido ou não). Foto e vídeo: até 20 MB. Vídeo acima de 6 MB sobe com aviso. */
export function decideUpload(f: { kind: "foto" | "video"; bytes: number }): UploadDecision {
  if (!(f.bytes > 0)) return { ok: false, message: "O arquivo está vazio." };
  if (f.bytes > MEDIA_MAX_BYTES)
    return { ok: false, message: `Arquivo de ${formatMB(f.bytes)} passa do limite de 20 MB. Grave 10 a 15 s em 720p ou escolha uma foto.` };
  if (f.kind === "video" && f.bytes > MEDIA_TARGET_BYTES)
    return { ok: true, warn: `Vídeo de ${formatMB(f.bytes)}: acima da meta de 6 MB, mas dentro do limite de 20 MB.` };
  return { ok: true, warn: null };
}
